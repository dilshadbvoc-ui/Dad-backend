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
                // Bulk update to set nextFollowUp to Today
                const updateResult = await prisma_1.prisma.lead.updateMany({
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
    // Run every day at 09:00 AM
    node_cron_1.default.schedule('0 9 * * *', async () => {
        console.log('[Cron] Running daily organisation reports...');
        try {
            const { ReportingService } = await Promise.resolve().then(() => __importStar(require('./reportingService')));
            const { WhatsAppService } = await Promise.resolve().then(() => __importStar(require('./whatsAppService')));
            const organisations = await prisma_1.prisma.organisation.findMany({
                where: { status: 'active' },
                include: {
                    users: {
                        where: { role: 'admin', isActive: true }
                    }
                }
            });
            for (const org of organisations) {
                try {
                    const stats = await ReportingService.getDailyStats(org.id);
                    const report = ReportingService.formatWhatsAppReport(stats, org.name);
                    // Find primary recipient
                    // 1. Admin with phone
                    // 2. Org contactPhone
                    const adminWithPhone = org.users.find(u => u.phone);
                    const targetPhone = adminWithPhone?.phone || org.contactPhone;
                    if (targetPhone) {
                        const waClient = await WhatsAppService.getClientForOrg(org.id);
                        if (waClient) {
                            console.log(`[Cron] Sending daily report to ${org.name} (${targetPhone})`);
                            await waClient.sendTextMessage(targetPhone, report);
                        }
                        else {
                            console.warn(`[Cron] WhatsApp not connected for ${org.name}, skipping report.`);
                        }
                    }
                    else {
                        console.warn(`[Cron] No contact phone found for organization ${org.name}`);
                    }
                }
                catch (orgError) {
                    console.error(`[Cron] Error generating report for ${org.name}:`, orgError);
                }
            }
        }
        catch (error) {
            console.error('[Cron] Error running daily reports:', error);
        }
    });
    console.log('[Cron] Daily organisation reports scheduled.');
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
};
exports.initCronJobs = initCronJobs;
//# sourceMappingURL=cronService.js.map