import prisma from '../config/prisma';
import { NotificationService } from './notificationService';

export class FollowUpNotificationService {
    /**
     * Check for upcoming follow-ups and send notifications
     * Runs every 15 minutes via cron job
     */
    static async notifyUpcomingFollowUps() {
        try {
            const now = new Date();
            
            // 1. Send 30-minute advance notifications
            await this.send30MinuteReminders(now);
            
            // 2. Send day-of notifications (at start of day or when task becomes due)
            await this.sendDayOfReminders(now);
            
            console.log('[FollowUpNotificationService] Completed notification check');
        } catch (error) {
            console.error('[FollowUpNotificationService] Error:', error);
        }
    }

    /**
     * Send notifications 30 minutes before follow-up time
     */
    private static async send30MinuteReminders(now: Date) {
        try {
            // Calculate time window: 30-45 minutes from now
            // (15-minute window to catch tasks in case cron runs slightly off)
            const thirtyMinsFromNow = new Date(now.getTime() + 30 * 60 * 1000);
            const fortyFiveMinsFromNow = new Date(now.getTime() + 45 * 60 * 1000);

            console.log(`[FollowUpNotificationService] Checking for tasks due between ${thirtyMinsFromNow.toISOString()} and ${fortyFiveMinsFromNow.toISOString()}`);

            // Find tasks (follow-ups) with dueDate in the next 30-45 minutes
            const tasks = await prisma.task.findMany({
                where: {
                    dueDate: {
                        gte: thirtyMinsFromNow,
                        lte: fortyFiveMinsFromNow
                    },
                    status: { notIn: ['completed', 'deferred'] },
                    isDeleted: false
                },
                include: {
                    assignedTo: {
                        select: {
                            id: true,
                            firstName: true,
                            lastName: true,
                            reportsToId: true
                        }
                    },
                    lead: {
                        where: { isDeleted: false },
                        select: {
                            id: true,
                            firstName: true,
                            lastName: true,
                            company: true
                        }
                    },
                    contact: {
                        select: {
                            id: true,
                            firstName: true,
                            lastName: true
                        }
                    },
                    account: {
                        select: {
                            id: true,
                            name: true
                        }
                    },
                    opportunity: {
                        select: {
                            id: true,
                            name: true
                        }
                    }
                }
            });

            console.log(`[FollowUpNotificationService] Found ${tasks.length} tasks for 30-minute reminders`);

            for (const task of tasks) {
                if (!task.assignedToId) continue;

                // Format the related entity name
                let relatedName = 'Unknown';
                if (task.lead) {
                    relatedName = `${task.lead.firstName} ${task.lead.lastName || ''}`.trim();
                    if (task.lead.company) relatedName += ` (${task.lead.company})`;
                } else if (task.contact) {
                    relatedName = `${task.contact.firstName} ${task.contact.lastName || ''}`.trim();
                } else if (task.account) {
                    relatedName = task.account.name;
                } else if (task.opportunity) {
                    relatedName = task.opportunity.name;
                }

                const timeStr = task.dueDate ? new Date(task.dueDate).toLocaleTimeString('en-US', {
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: true
                }) : '';

                // Notify assigned user
                await NotificationService.send(
                    task.assignedToId,
                    '⏰ Follow-up in 30 Minutes',
                    `Your follow-up "${task.subject}" with ${relatedName} is scheduled for ${timeStr}`,
                    'reminder'
                );

                console.log(`[FollowUpNotificationService] Sent 30-min reminder to user ${task.assignedToId} for task ${task.id}`);

                // Notify manager if exists
                if (task.assignedTo?.reportsToId) {
                    await NotificationService.send(
                        task.assignedTo.reportsToId,
                        '👥 Team Follow-up Reminder',
                        `${task.assignedTo.firstName} ${task.assignedTo.lastName || ''} has a follow-up "${task.subject}" with ${relatedName} at ${timeStr}`,
                        'info'
                    );

                    console.log(`[FollowUpNotificationService] Sent 30-min reminder to manager ${task.assignedTo.reportsToId} for task ${task.id}`);
                }
            }
        } catch (error) {
            console.error('[FollowUpNotificationService] Error in send30MinuteReminders:', error);
        }
    }

    /**
     * Send day-of notifications for follow-ups
     * Checks for tasks due today that haven't been notified yet
     */
    private static async sendDayOfReminders(now: Date) {
        try {
            // Get start and end of current day
            const startOfDay = new Date(now);
            startOfDay.setHours(0, 0, 0, 0);
            
            const endOfDay = new Date(now);
            endOfDay.setHours(23, 59, 59, 999);

            console.log(`[FollowUpNotificationService] Checking for tasks due today between ${startOfDay.toISOString()} and ${endOfDay.toISOString()}`);

            // Find tasks due today
            const tasks = await prisma.task.findMany({
                where: {
                    dueDate: {
                        gte: startOfDay,
                        lte: endOfDay
                    },
                    status: { notIn: ['completed', 'deferred'] },
                    isDeleted: false
                },
                include: {
                    assignedTo: {
                        select: {
                            id: true,
                            firstName: true,
                            lastName: true,
                            reportsToId: true
                        }
                    },
                    lead: {
                        where: { isDeleted: false },
                        select: {
                            id: true,
                            firstName: true,
                            lastName: true,
                            company: true
                        }
                    },
                    contact: {
                        select: {
                            id: true,
                            firstName: true,
                            lastName: true
                        }
                    },
                    account: {
                        select: {
                            id: true,
                            name: true
                        }
                    },
                    opportunity: {
                        select: {
                            id: true,
                            name: true
                        }
                    }
                }
            });

            console.log(`[FollowUpNotificationService] Found ${tasks.length} tasks due today`);

            for (const task of tasks) {
                if (!task.assignedToId || !task.dueDate) continue;

                // Check if task is due within the next 15 minutes (current check window)
                const fifteenMinsFromNow = new Date(now.getTime() + 15 * 60 * 1000);
                const taskDueTime = new Date(task.dueDate);

                // Only send day-of notification if task is due soon (within next 15 mins)
                // This prevents spam and focuses on imminent tasks
                if (taskDueTime <= fifteenMinsFromNow && taskDueTime >= now) {
                    // Format the related entity name
                    let relatedName = 'Unknown';
                    if (task.lead) {
                        relatedName = `${task.lead.firstName} ${task.lead.lastName || ''}`.trim();
                        if (task.lead.company) relatedName += ` (${task.lead.company})`;
                    } else if (task.contact) {
                        relatedName = `${task.contact.firstName} ${task.contact.lastName || ''}`.trim();
                    } else if (task.account) {
                        relatedName = task.account.name;
                    } else if (task.opportunity) {
                        relatedName = task.opportunity.name;
                    }

                    const timeStr = taskDueTime.toLocaleTimeString('en-US', {
                        hour: '2-digit',
                        minute: '2-digit',
                        hour12: true
                    });

                    // Notify assigned user
                    await NotificationService.send(
                        task.assignedToId,
                        '🔔 Follow-up Due Now',
                        `Your follow-up "${task.subject}" with ${relatedName} is due at ${timeStr}`,
                        'warning'
                    );

                    console.log(`[FollowUpNotificationService] Sent day-of reminder to user ${task.assignedToId} for task ${task.id}`);

                    // Notify manager if exists
                    if (task.assignedTo?.reportsToId) {
                        await NotificationService.send(
                            task.assignedTo.reportsToId,
                            '👥 Team Follow-up Due',
                            `${task.assignedTo.firstName} ${task.assignedTo.lastName || ''} has a follow-up "${task.subject}" with ${relatedName} due at ${timeStr}`,
                            'info'
                        );

                        console.log(`[FollowUpNotificationService] Sent day-of reminder to manager ${task.assignedTo.reportsToId} for task ${task.id}`);
                    }
                }
            }
        } catch (error) {
            console.error('[FollowUpNotificationService] Error in sendDayOfReminders:', error);
        }
    }
}
