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
            // Calculate time window: 0-45 minutes from now (inclusive of missed ones)
            // But only if they haven't been notified in the last hour
            const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
            const fortyFiveMinsFromNow = new Date(now.getTime() + 45 * 60 * 1000);

            console.log(`[FollowUpNotificationService] Checking 30-min reminders due before ${fortyFiveMinsFromNow.toISOString()}`);

            // Find tasks (follow-ups)
            const tasks = await prisma.task.findMany({
                where: {
                    dueDate: {
                        lte: fortyFiveMinsFromNow,
                        gt: now // Only for upcoming in this method
                    },
                    status: { notIn: ['completed', 'deferred'] },
                    isDeleted: false,
                    OR: [
                        { notifiedAt: null },
                        { notifiedAt: { lt: oneHourAgo } } // Allow re-notifying if it was a long time ago (sanity)
                    ]
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

                // Update notifiedAt to prevent duplicates
                await prisma.task.update({
                    where: { id: task.id },
                    data: { notifiedAt: now }
                });
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
            // Calculate time window: from 2 hours ago up to 15 minutes from now
            // This catches missed notifications while preventing duplicates via notifiedAt
            const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
            const fifteenMinsFromNow = new Date(now.getTime() + 15 * 60 * 1000);

            console.log(`[FollowUpNotificationService] Checking for day-of reminders due between ${twoHoursAgo.toISOString()} and ${fifteenMinsFromNow.toISOString()}`);

            // Find tasks due in this window
            const tasks = await prisma.task.findMany({
                where: {
                    dueDate: {
                        gte: twoHoursAgo,
                        lte: fifteenMinsFromNow
                    },
                    status: { notIn: ['completed', 'deferred'] },
                    isDeleted: false,
                    OR: [
                        { notifiedAt: null },
                        { notifiedAt: { lt: twoHoursAgo } }
                    ]
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

                const taskDueTime = new Date(task.dueDate);

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

                // Update notifiedAt to prevent duplicates
                await prisma.task.update({
                    where: { id: task.id },
                    data: { notifiedAt: now }
                });
            }
        } catch (error) {
            console.error('[FollowUpNotificationService] Error in sendDayOfReminders:', error);
        }
    }
}
