import cron from 'node-cron';
import { prisma } from '../config/prisma';

export const initCronJobs = () => {
    // Run every day at midnight (00:00)
    cron.schedule('0 0 * * *', async () => {
        console.log('[Cron] Running daily lead rollover...');
        try {
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            const yesterday = new Date(today);
            yesterday.setDate(yesterday.getDate() - 1);

            // Find leads with nextFollowUp < Today AND status != converted
            const overdueLeads = await prisma.lead.findMany({
                where: {
                    status: { not: 'converted' },
                    nextFollowUp: {
                        lt: today
                    }
                }
            });

            console.log(`[Cron] Found ${overdueLeads.length} leads with overdue follow-ups.`);

            if (overdueLeads.length > 0) {
                // Bulk update to set nextFollowUp to Today
                const updateResult = await prisma.lead.updateMany({
                    where: {
                        status: { not: 'converted' },
                        nextFollowUp: {
                            lt: today
                        }
                    },
                    data: {
                        nextFollowUp: today
                    }
                });

                console.log(`[Cron] Rolled over ${updateResult.count} leads to today.`);
            }
        } catch (error) {
            console.error('[Cron] Error running daily lead rollover:', error);
        }

        console.log('[Cron] Running daily license expiry check...');
        try {
            const { LicenseEnforcementService } = await import('./licenseEnforcementService');
            await LicenseEnforcementService.enforceExpiry();
        } catch (error) {
            console.error('[Cron] Error running license expiry check:', error);
        }

        console.log('[Cron] Running daily sales target expiration check...');
        try {
            const { SalesTargetService } = await import('./salesTargetService');
            await SalesTargetService.checkExpiredTargets();
        } catch (error) {
            console.error('[Cron] Error running sales target expiration check:', error);
        }

        // EMI Overdue Detection
        console.log('[Cron] Running EMI overdue status update...');
        try {
            const EMIService = (await import('./emiService')).default;
            await EMIService.updateOverdueStatus();
        } catch (error) {
            console.error('[Cron] Error running EMI overdue update:', error);
        }
    });

    console.log('[Cron] Daily lead rollover job scheduled.');

    // Run every day at 08:00 AM (Daily Task Reminders)
    cron.schedule('0 8 * * *', async () => {
        console.log('[Cron] Running daily task reminders...');
        try {
            const { TaskReminderService } = await import('./taskReminderService');
            await TaskReminderService.sendDailyReminders();
        } catch (error) {
            console.error('[Cron] Error running task reminders:', error);
        }
    });

    // Run every hour for Meeting Reminders
    cron.schedule('0 * * * *', async () => {
        console.log('[Cron] Running meeting reminders check...');
        try {
            const { generateMeetingReminders } = await import('./meetingReminderService');
            await generateMeetingReminders();
        } catch (error) {
            console.error('[Cron] Error running meeting reminders:', error);
        }
    });

    // Run every 15 minutes for Follow-up Reminders
    cron.schedule('*/15 * * * *', async () => {
        console.log('[Cron] Running upcoming follow-up check...');
        try {
            const { FollowUpNotificationService } = await import('./followUpNotificationService');
            await FollowUpNotificationService.notifyUpcomingFollowUps();
        } catch (error) {
            console.error('[Cron] Error running follow-up reminders:', error);
        }
    });

    // Run every minute for Dynamic Daily Reports
    cron.schedule('* * * * *', async () => {
        try {
            const now = new Date();
            const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

            const organisations = await prisma.organisation.findMany({
                where: {
                    status: 'active',
                    dailyReportTime: currentTime,
                    isDeleted: false
                }
            });

            if (organisations.length === 0) return;

            console.log(`[Cron] Found ${organisations.length} organisations with report time ${currentTime}`);

            const { ReportingService } = await import('./reportingService');
            const { WhatsAppService } = await import('./whatsAppService');

            for (const org of organisations) {
                try {
                    // 1. General Admin Report (Legacy logic)
                    const admins = await prisma.user.findMany({
                        where: { organisationId: org.id, role: 'admin', isActive: true }
                    });

                    const stats = await ReportingService.getDailyStats(org.id);
                    const adminReport = ReportingService.formatWhatsAppReport(stats, org.name);

                    // 2. Manager & Sales Manager Reports
                    const managers = await prisma.user.findMany({
                        where: {
                            organisationId: org.id,
                            role: { in: ['manager', 'sales_manager'] },
                            isActive: true
                        }
                    });

                    const waClient = await WhatsAppService.getClientForOrg(org.id);

                    // Send to Admins
                    for (const admin of admins) {
                        const targetPhone = admin.phone || org.contactPhone;
                        if (targetPhone && waClient) {
                            console.log(`[Cron] Sending general report to ${org.name} admin: ${admin.firstName} (${targetPhone})`);
                            await waClient.sendTextMessage(targetPhone, adminReport);
                        }
                    }

                    // Send to Managers (Specific reports)
                    for (const manager of managers) {
                        const targetPhone = manager.phone;
                        if (targetPhone && waClient) {
                            const managerStats = await ReportingService.getManagerDailyStats(manager.id, org.id);
                            const managerReport = ReportingService.formatManagerReport(managerStats, manager.firstName);
                            console.log(`[Cron] Sending manager report to ${org.name} manager: ${manager.firstName} (${targetPhone})`);
                            await waClient.sendTextMessage(targetPhone, managerReport);
                        }
                    }
                } catch (orgError) {
                    console.error(`[Cron] Error generating daily reports for ${org.name}:`, orgError);
                }
            }
        } catch (error) {
            console.error('[Cron] Error running daily reports processor:', error);
        }
    });

    console.log('[Cron] Dynamic daily reports processor scheduled.');

    // Run every minute for Workflow Queue
    cron.schedule('* * * * *', async () => {
        try {
            const now = new Date();
            const pendingItems = await prisma.workflowQueue.findMany({
                where: {
                    status: 'pending',
                    executeAt: { lte: now }
                },
                take: 50 // process in batches
            });

            if (pendingItems.length > 0) {
                console.log(`[Cron] Found ${pendingItems.length} pending workflow items ready to execute.`);

                // Dynamically import to avoid circular dependency issues if any
                const { WorkflowEngine } = await import('./workflowEngine');

                for (const item of pendingItems) {
                    // Fire and forget or sequential?
                    // Sequential to simplify load, or promise.all
                    await WorkflowEngine.resumeWorkflow(item.id);
                }
            }
        } catch (error) {
            console.error('[Cron] Error processing workflow queue:', error);
        }
    });

    console.log('[Cron] Workflow Queue processor scheduled.');

    // Run every day at 01:00 AM (Data Retention & Cleanup)
    cron.schedule('0 1 * * *', async () => {
        console.log('[Cron] Running daily cleanup tasks...');
        try {
            const now = new Date();

            // 1. Audit Log Retention (90 Days)
            const ninetyDaysAgo = new Date(now);
            ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
            const deletedLogs = await prisma.auditLog.deleteMany({
                where: { createdAt: { lt: ninetyDaysAgo } }
            });
            if (deletedLogs.count > 0) {
                console.log(`[Cron] Cleaned up ${deletedLogs.count} old audit logs.`);
            }

            // 2. Read Notification Retention (30 Days)
            const thirtyDaysAgo = new Date(now);
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
            const deletedNotifications = await prisma.notification.deleteMany({
                where: {
                    isRead: true,
                    updatedAt: { lt: thirtyDaysAgo }
                }
            });
            if (deletedNotifications.count > 0) {
                console.log(`[Cron] Cleaned up ${deletedNotifications.count} old notifications.`);
            }

        } catch (error) {
            console.error('[Cron] Error during daily cleanup:', error);
        }
    });

    console.log('[Cron] Daily cleanup job scheduled.');
};
