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
        timezone: string;
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
            // Dedup guard: don't re-fire if already sent within the last 40 minutes.
            // This must safely exceed 2x the cron interval (15 min): at 25 minutes, a
            // follow-up first notified 45 minutes out would fall outside the reuse
            // window by the time it's re-checked 30 minutes later (two ticks on), so
            // it fired again — the exact repeat-storm this guard was meant to prevent.
            const dedupWindowAgo = new Date(now.getTime() - 40 * 60 * 1000);
            const fortyFiveMinsFromNow = new Date(now.getTime() + 45 * 60 * 1000);

            console.log(`[FollowUpNotificationService] Checking 30-min reminders due before ${fortyFiveMinsFromNow.toISOString()}`);

            // Find tasks (disabled as task module is removed)
            const tasks: any[] = [];

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
                        { notified30MinAt: null },
                        { notified30MinAt: { lt: dedupWindowAgo } }
                    ]
                },
                include: {
                    assignedTo: {
                        select: {
                            id: true,
                            firstName: true,
                            lastName: true,
                            reportsToId: true,
                            timezone: true
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

                // Atomically claim this item before sending anything: re-apply the exact
                // same eligibility condition used in the query above as an updateMany
                // WHERE clause. If another process (or an overlapping run of this same
                // job) already claimed it between the query and here, `count` comes back
                // 0 and we skip — this is what actually prevents duplicate sends, since
                // the earlier find-then-update-after-sending order left a window where
                // two concurrent runs could both see "not yet notified" and both send.
                const claim = item.type === 'task'
                    ? await prisma.task.updateMany({
                        where: {
                            id: item.id,
                            OR: [{ notified30MinAt: null }, { notified30MinAt: { lt: dedupWindowAgo } }]
                        },
                        data: { notified30MinAt: now, notifiedAt: now }
                    })
                    : await prisma.followUp.updateMany({
                        where: {
                            id: item.id,
                            OR: [{ notified30MinAt: null }, { notified30MinAt: { lt: dedupWindowAgo } }]
                        },
                        data: { notified30MinAt: now, notifiedAt: now }
                    });

                if (claim.count === 0) {
                    console.log(`[FollowUpNotificationService] Skipped 30-min reminder for ${item.type} ${item.id} — already claimed by a concurrent run`);
                    continue;
                }

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

                const userTimezone = item.assignedTo?.timezone || 'UTC';
                const timeStr = item.dueDate ? new Date(item.dueDate).toLocaleTimeString('en-US', {
                    timeZone: userTimezone,
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
            // Calculate time window: from 2 hours ago up to now.
            // Was previously extended 15 minutes into the future, which meant a
            // follow-up not yet due got a "Due Now"/"due at X" notification up to
            // 15 minutes early (confirmed: a follow-up due at 9:30 had notifiedDueAt
            // stamped at 9:15). "Due" should only ever mean the due time has passed.
            const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);

            console.log(`[FollowUpNotificationService] Checking for day-of reminders due between ${twoHoursAgo.toISOString()} and ${now.toISOString()}`);

            // Find tasks (disabled as task module is removed)
            const tasks: any[] = [];

            // Find follow-ups due in this window
            const followUps = await prisma.followUp.findMany({
                where: {
                    dueDate: {
                        gte: twoHoursAgo,
                        lte: now
                    },
                    status: { notIn: ['completed', 'deferred'] },
                    isDeleted: false,
                    OR: [
                        { notifiedDueAt: null },
                        { notifiedDueAt: { lt: twoHoursAgo } }
                    ]
                },
                include: {
                    assignedTo: {
                        select: {
                            id: true,
                            firstName: true,
                            lastName: true,
                            reportsToId: true,
                            timezone: true
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

                // Atomically claim this item before sending — see the matching comment
                // in send30MinuteReminders for why this has to happen before, not after,
                // the notification sends.
                const claim = item.type === 'task'
                    ? await prisma.task.updateMany({
                        where: {
                            id: item.id,
                            OR: [{ notifiedDueAt: null }, { notifiedDueAt: { lt: twoHoursAgo } }]
                        },
                        data: { notifiedDueAt: now, notifiedAt: now }
                    })
                    : await prisma.followUp.updateMany({
                        where: {
                            id: item.id,
                            OR: [{ notifiedDueAt: null }, { notifiedDueAt: { lt: twoHoursAgo } }]
                        },
                        data: { notifiedDueAt: now, notifiedAt: now }
                    });

                if (claim.count === 0) {
                    console.log(`[FollowUpNotificationService] Skipped day-of reminder for ${item.type} ${item.id} — already claimed by a concurrent run`);
                    continue;
                }

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

                const userTimezone = item.assignedTo?.timezone || 'UTC';
                const timeStr = taskDueTime.toLocaleTimeString('en-US', {
                    timeZone: userTimezone,
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
            }
        } catch (error) {
            console.error('[FollowUpNotificationService] Error in sendDayOfReminders:', error);
        }
    }
}
