"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.initCronJobs = void 0;
const node_cron_1 = __importDefault(require("node-cron"));
const trashService_1 = require("./trashService");
const prisma_1 = require("../config/prisma");
const initCronJobs = () => {
    // Run every day at midnight (00:00)
    node_cron_1.default.schedule('0 0 * * *', async () => {
        console.log('[Cron] Running daily lead rollover...');
        try {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const yesterday = new Date(today);
            yesterday.setDate(yesterday.getDate() - 1);
            // Find leads with nextFollowUp < Today AND status != converted
            const overdueLeads = await prisma_1.prisma.lead.findMany({
                where: {
                    status: { not: 'converted' },
                    nextFollowUp: {
                        lt: today
                    }
                }
            });
            console.log(`[Cron] Found ${overdueLeads.length} leads with overdue follow-ups.`);
            if (overdueLeads.length > 0) {
                const { FollowUpService } = await Promise.resolve().then(() => __importStar(require('./followUpService')));
                // Set nextFollowUp to Today at 10 AM IST (04:30 AM UTC)
                const rolloverTime = new Date(today);
                rolloverTime.setUTCHours(4, 30, 0, 0);
                // Update each lead and its earliest task
                for (const lead of overdueLeads) {
                    await prisma_1.prisma.lead.update({
                        where: { id: lead.id },
                        data: { nextFollowUp: rolloverTime }
                    });
                    // Also rollover the associated follow-up
                    await FollowUpService.rolloverFollowUpForLead(lead.id, rolloverTime);
                }
                console.log(`[Cron] Rolled over ${overdueLeads.length} leads and their tasks to today.`);
            }
        }
        catch (error) {
            console.error('[Cron] Error running daily lead rollover:', error);
        }
        console.log('[Cron] Running daily license expiry check...');
        try {
            const { LicenseEnforcementService } = await Promise.resolve().then(() => __importStar(require('./licenseEnforcementService')));
            await LicenseEnforcementService.enforceExpiry();
        }
        catch (error) {
            console.error('[Cron] Error running license expiry check:', error);
        }
        console.log('[Cron] Running daily sales target expiration check...');
        try {
            const { SalesTargetService } = await Promise.resolve().then(() => __importStar(require('./salesTargetService')));
            await SalesTargetService.checkExpiredTargets();
        }
        catch (error) {
            console.error('[Cron] Error running sales target expiration check:', error);
        }
        // EMI Overdue Detection
        console.log('[Cron] Running EMI overdue status update...');
        try {
            const EMIService = (await Promise.resolve().then(() => __importStar(require('./emiService')))).default;
            await EMIService.updateOverdueStatus();
        }
        catch (error) {
            console.error('[Cron] Error running EMI overdue update:', error);
        }
    });
    console.log('[Cron] Daily lead rollover job scheduled.');
    // Run every day at 08:00 AM (Daily Task Reminders)
    node_cron_1.default.schedule('0 8 * * *', async () => {
        console.log('[Cron] Running daily task reminders...');
        try {
            const { TaskReminderService } = await Promise.resolve().then(() => __importStar(require('./taskReminderService')));
            await TaskReminderService.sendDailyReminders();
        }
        catch (error) {
            console.error('[Cron] Error running task reminders:', error);
        }
    });
    // Run every hour for Meeting Reminders
    node_cron_1.default.schedule('0 * * * *', async () => {
        console.log('[Cron] Running meeting reminders check...');
        try {
            const { generateMeetingReminders } = await Promise.resolve().then(() => __importStar(require('./meetingReminderService')));
            await generateMeetingReminders();
        }
        catch (error) {
            console.error('[Cron] Error running meeting reminders:', error);
        }
    });
    // Run every 15 minutes for Follow-up Reminders
    node_cron_1.default.schedule('*/15 * * * *', async () => {
        console.log('[Cron] Running upcoming follow-up check...');
        try {
            const { FollowUpNotificationService } = await Promise.resolve().then(() => __importStar(require('./followUpNotificationService')));
            await FollowUpNotificationService.notifyUpcomingFollowUps();
        }
        catch (error) {
            console.error('[Cron] Error running follow-up reminders:', error);
        }
    });
    // Run every minute for Dynamic Daily Reports
    node_cron_1.default.schedule('* * * * *', async () => {
        try {
            const now = new Date();
            const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
            const organisations = await prisma_1.prisma.organisation.findMany({
                where: {
                    status: 'active',
                    dailyReportTime: currentTime,
                    isDeleted: false
                }
            });
            if (organisations.length === 0)
                return;
            console.log(`[Cron] Found ${organisations.length} organisations with report time ${currentTime}`);
            const { ReportingService } = await Promise.resolve().then(() => __importStar(require('./reportingService')));
            const { WhatsAppService } = await Promise.resolve().then(() => __importStar(require('./whatsAppService')));
            const { EmailService } = await Promise.resolve().then(() => __importStar(require('./emailService')));
            for (const org of organisations) {
                try {
                    // 1. General Admin Report (Legacy logic)
                    const admins = await prisma_1.prisma.user.findMany({
                        where: { organisationId: org.id, role: 'admin', isActive: true }
                    });
                    const stats = await ReportingService.getDailyStats(org.id);
                    const adminReport = ReportingService.formatWhatsAppReport(stats, org.name);
                    // 2. Manager & Sales Manager Reports
                    const managers = await prisma_1.prisma.user.findMany({
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
                        // WhatsApp
                        if (targetPhone && waClient) {
                            console.log(`[Cron] Sending general WhatsApp report to ${org.name} admin: ${admin.firstName} (${targetPhone})`);
                            await waClient.sendTextMessage(targetPhone, adminReport);
                        }
                        // Email
                        if (org.dailyReportEmailEnabled && admin.email) {
                            console.log(`[Cron] Sending daily Email report to ${org.name} admin: ${admin.email}`);
                            const emailHtml = ReportingService.formatEmailReport(stats, org.name);
                            await EmailService.sendEmail(admin.email, `Daily Business Report - ${org.name}`, emailHtml, org.id);
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
                }
                catch (orgError) {
                    console.error(`[Cron] Error generating daily reports for ${org.name}:`, orgError);
                }
            }
        }
        catch (error) {
            console.error('[Cron] Error running daily reports processor:', error);
        }
    });
    console.log('[Cron] Dynamic daily reports processor scheduled.');
    // Run every minute for Workflow Queue
    node_cron_1.default.schedule('* * * * *', async () => {
        try {
            const now = new Date();
            const pendingItems = await prisma_1.prisma.workflowQueue.findMany({
                where: {
                    status: 'pending',
                    executeAt: { lte: now }
                },
                take: 50 // process in batches
            });
            if (pendingItems.length > 0) {
                console.log(`[Cron] Found ${pendingItems.length} pending workflow items ready to execute.`);
                // Dynamically import to avoid circular dependency issues if any
                const { WorkflowEngine } = await Promise.resolve().then(() => __importStar(require('./workflowEngine')));
                for (const item of pendingItems) {
                    // Fire and forget or sequential?
                    // Sequential to simplify load, or promise.all
                    await WorkflowEngine.resumeWorkflow(item.id);
                }
            }
        }
        catch (error) {
            console.error('[Cron] Error processing workflow queue:', error);
        }
    });
    console.log('[Cron] Workflow Queue processor scheduled.');
    // Run every day at 01:00 AM (Data Retention & Cleanup)
    node_cron_1.default.schedule('0 1 * * *', async () => {
        console.log('[Cron] Running daily cleanup tasks...');
        try {
            const now = new Date();
            // 1. Audit Log Retention (90 Days)
            const ninetyDaysAgo = new Date(now);
            ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
            const deletedLogs = await prisma_1.prisma.auditLog.deleteMany({
                where: { createdAt: { lt: ninetyDaysAgo } }
            });
            if (deletedLogs.count > 0) {
                console.log(`[Cron] Cleaned up ${deletedLogs.count} old audit logs.`);
            }
            // 2. Read Notification Retention (30 Days)
            const thirtyDaysAgo = new Date(now);
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
            const deletedNotifications = await prisma_1.prisma.notification.deleteMany({
                where: {
                    isRead: true,
                    updatedAt: { lt: thirtyDaysAgo }
                }
            });
            if (deletedNotifications.count > 0) {
                console.log(`[Cron] Cleaned up ${deletedNotifications.count} old notifications.`);
            }
        }
        catch (error) {
            console.error('[Cron] Error during daily cleanup:', error);
        }
    });
    console.log('[Cron] Daily cleanup job scheduled.');
    // Run every day at 02:00 AM (Trash Purge - 7 Days)
    node_cron_1.default.schedule('0 2 * * *', async () => {
        try {
            await trashService_1.TrashService.runAutomatedPurge(7);
        }
        catch (error) {
            console.error('[Cron] Error during trash purge:', error);
        }
    });
    console.log('[Cron] Daily trash purge job scheduled.');
    // Run every 10 minutes for Meta Lead Polling (Real-time fallback)
    node_cron_1.default.schedule('*/10 * * * *', async () => {
        try {
            const { MetaPollingService } = await Promise.resolve().then(() => __importStar(require('./metaPollingService')));
            await MetaPollingService.pollAllOrganisations();
        }
        catch (error) {
            console.error('[Cron] Error during Meta lead polling:', error);
        }
    });
    // Run every day at 03:00 AM (Meta Token Expiry Check)
    node_cron_1.default.schedule('0 3 * * *', async () => {
        console.log('[Cron] Checking for expiring Meta tokens...');
        try {
            const sevenDaysFromNow = new Date();
            sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);
            const organisations = await prisma_1.prisma.organisation.findMany({
                where: {
                    isDeleted: false,
                    status: 'active'
                }
            });
            for (const org of organisations) {
                const integrations = org.integrations;
                if (integrations?.meta?.connected && integrations?.meta?.tokenExpiresAt) {
                    const expiresAt = new Date(integrations.meta.tokenExpiresAt);
                    if (expiresAt < sevenDaysFromNow) {
                        // Notify admins
                        const admins = await prisma_1.prisma.user.findMany({
                            where: { organisationId: org.id, role: 'admin', isActive: true }
                        });
                        for (const admin of admins) {
                            // Check if a warning was already sent in the last 24h to avoid spam
                            await prisma_1.prisma.notification.create({
                                data: {
                                    title: 'Meta Connection Expiring Soon',
                                    message: `Your Meta access token for ${org.name} will expire on ${expiresAt.toLocaleDateString()}. Please reconnect in Settings -> Integrations to avoid service interruption.`,
                                    type: 'warning',
                                    recipientId: admin.id,
                                    organisationId: org.id
                                }
                            });
                        }
                    }
                }
            }
        }
        catch (error) {
            console.error('[Cron] Error checking Meta token expiry:', error);
        }
    });
    console.log('[Cron] Meta Lead Polling and Expiry Check jobs scheduled.');
};
exports.initCronJobs = initCronJobs;
