import prisma from '../config/prisma';
import { NotificationService } from './notificationService';

interface ReminderItem {
    id: string;
    subject: string;
    dueDate: Date | null;
    assignedToId: string | null;
    type: 'task' | 'followUp';
    assignedTo?: {
        id: string;
        firstName: string;
        lastName: string | null;
        reportsToId: string | null;
    } | null;
    lead?: {
        id: string;
        firstName: string;
        lastName: string | null;
        company: string | null;
    } | null;
    contact?: {
        id: string;
        firstName: string;
        lastName: string | null;
    } | null;
    account?: {
        id: string;
        name: string;
    } | null;
    opportunity?: {
        id: string;
        name: string;
    } | null;
}

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

            // Find pure follow-ups
            const followUps = await prisma.followUp.findMany({
                where: {
                    dueDate: {
                        lte: fortyFiveMinsFromNow,
                        gt: now
                    },
                    status: { notIn: ['completed', 'deferred'] },
                    isDeleted: false,
                    OR: [
                        { notifiedAt: null },
                        { notifiedAt: { lt: oneHourAgo } }
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

            const allReminders: ReminderItem[] = [
                ...tasks.map(t => ({ ...t, type: 'task' as const })),
                ...followUps.map(f => ({ ...f, type: 'followUp' as const }))
            ];

            console.log(`[FollowUpNotificationService] Found ${allReminders.length} items for 30-minute reminders (${tasks.length} tasks, ${followUps.length} follow-ups)`);

            for (const item of allReminders) {
                if (!item.assignedToId) continue;

                // Format the related entity name
                let relatedName = 'Unknown';
                if (item.lead) {
                    relatedName = `${item.lead.firstName} ${item.lead.lastName || ''}`.trim();
                    if (item.lead.company) relatedName += ` (${item.lead.company})`;
                } else if (item.contact) {
                    relatedName = `${item.contact.firstName} ${item.contact.lastName || ''}`.trim();
                } else if (item.account) {
                    relatedName = item.account.name;
                } else if (item.opportunity) {
                    relatedName = item.opportunity.name;
                }

                const timeStr = item.dueDate ? new Date(item.dueDate).toLocaleTimeString('en-US', {
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: true
                }) : '';

                // Notify assigned user
                await NotificationService.send(
                    item.assignedToId,
                    '⏰ Follow-up in 30 Minutes',
                    `Your follow-up "${item.subject}" with ${relatedName} is scheduled for ${timeStr}`,
                    'reminder'
                );

                console.log(`[FollowUpNotificationService] Sent 30-min reminder to user ${item.assignedToId} for ${item.type} ${item.id}`);

                // Notify manager if exists
                if (item.assignedTo?.reportsToId) {
                    await NotificationService.send(
                        item.assignedTo.reportsToId,
                        '👥 Team Follow-up Reminder',
                        `${item.assignedTo.firstName} ${item.assignedTo.lastName || ''} has a follow-up "${item.subject}" with ${relatedName} at ${timeStr}`,
                        'info'
                    );

                    console.log(`[FollowUpNotificationService] Sent 30-min reminder to manager ${item.assignedTo.reportsToId} for ${item.type} ${item.id}`);
                }

                // Update notifiedAt to prevent duplicates
                if (item.type === 'task') {
                    await prisma.task.update({
                        where: { id: item.id },
                        data: { notifiedAt: now }
                    });
                } else {
                    await prisma.followUp.update({
                        where: { id: item.id },
                        data: { notifiedAt: now }
                    });
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

            // Find follow-ups due in this window
            const followUps = await prisma.followUp.findMany({
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

            const allReminders: ReminderItem[] = [
                ...tasks.map(t => ({ ...t, type: 'task' as const })),
                ...followUps.map(f => ({ ...f, type: 'followUp' as const }))
            ];

            console.log(`[FollowUpNotificationService] Found ${allReminders.length} items due today (${tasks.length} tasks, ${followUps.length} follow-ups)`);

            for (const item of allReminders) {
                if (!item.assignedToId || !item.dueDate) continue;

                const taskDueTime = new Date(item.dueDate);

                // Format the related entity name
                let relatedName = 'Unknown';
                if (item.lead) {
                    relatedName = `${item.lead.firstName} ${item.lead.lastName || ''}`.trim();
                    if (item.lead.company) relatedName += ` (${item.lead.company})`;
                } else if (item.contact) {
                    relatedName = `${item.contact.firstName} ${item.contact.lastName || ''}`.trim();
                } else if (item.account) {
                    relatedName = item.account.name;
                } else if (item.opportunity) {
                    relatedName = item.opportunity.name;
                }

                const timeStr = taskDueTime.toLocaleTimeString('en-US', {
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: true
                });

                // Notify assigned user
                await NotificationService.send(
                    item.assignedToId,
                    '🔔 Follow-up Due Now',
                    `Your follow-up "${item.subject}" with ${relatedName} is due at ${timeStr}`,
                    'warning'
                );

                console.log(`[FollowUpNotificationService] Sent day-of reminder to user ${item.assignedToId} for ${item.type} ${item.id}`);

                // Notify manager if exists
                if (item.assignedTo?.reportsToId) {
                    await NotificationService.send(
                        item.assignedTo.reportsToId,
                        '👥 Team Follow-up Due',
                        `${item.assignedTo.firstName} ${item.assignedTo.lastName || ''} has a follow-up "${item.subject}" with ${relatedName} due at ${timeStr}`,
                        'info'
                    );

                    console.log(`[FollowUpNotificationService] Sent day-of reminder to manager ${item.assignedTo.reportsToId} for ${item.type} ${item.id}`);
                }

                // Update notifiedAt to prevent duplicates
                if (item.type === 'task') {
                    await prisma.task.update({
                        where: { id: item.id },
                        data: { notifiedAt: now }
                    });
                } else {
                    await prisma.followUp.update({
                        where: { id: item.id },
                        data: { notifiedAt: now }
                    });
                }
            }
        } catch (error) {
            console.error('[FollowUpNotificationService] Error in sendDayOfReminders:', error);
        }
    }
}
