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
exports.permanentlyDeleteOrganisation = exports.sendTestReport = exports.restoreOrganisation = exports.deleteOrganisation = exports.updateOrganisation = exports.getOrganisation = exports.getAllOrganisations = exports.createOrganisation = void 0;
const prisma_1 = __importDefault(require("../config/prisma"));
const hierarchyUtils_1 = require("../utils/hierarchyUtils");
const encryption_1 = require("../utils/encryption");
const metaService_1 = require("../services/metaService");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const auditLogger_1 = require("../utils/auditLogger");
const createOrganisation = async (req, res) => {
    try {
        if (req.user.role !== 'super_admin') {
            return res.status(403).json({ message: 'Not authorized to create organisations' });
        }
        const { name, email, password, firstName, lastName } = req.body;
        // 1. Create Organisation
        const slug = name.toLowerCase().replace(/[^a-z0-9]/g, '-');
        const org = await prisma_1.default.organisation.create({
            data: {
                name,
                slug,
                contactEmail: email,
                status: 'active'
            }
        });
        // 2. Create Admin User for this Organisation
        const tempPassword = password || Math.random().toString(36).slice(-8);
        const hashedPassword = await bcryptjs_1.default.hash(tempPassword, 10);
        const user = await prisma_1.default.user.create({
            data: {
                email,
                firstName,
                lastName,
                password: hashedPassword,
                role: 'admin',
                organisationId: org.id,
                isActive: true
            }
        });
        // Update org with createdBy
        await prisma_1.default.organisation.update({
            where: { id: org.id },
            data: { createdBy: user.id }
        });
        // Audit Log
        (0, auditLogger_1.logAudit)({
            action: 'CREATE_ORGANISATION',
            entity: 'Organisation',
            entityId: org.id,
            actorId: req.user.id,
            organisationId: org.id,
            details: { name: org.name, slug: org.slug }
        });
        res.status(201).json({ organisation: org, adminUser: { ...user, password: undefined }, tempPassword });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.createOrganisation = createOrganisation;
const getAllOrganisations = async (req, res) => {
    try {
        if (req.user.role !== 'super_admin') {
            return res.status(403).json({ message: 'Not authorized' });
        }
        const organisations = await prisma_1.default.organisation.findMany({
            orderBy: { createdAt: 'desc' }
        });
        // Get user counts for each organisation
        const orgIds = organisations.map(o => o.id);
        const userCounts = await prisma_1.default.user.groupBy({
            by: ['organisationId'],
            where: { organisationId: { in: orgIds }, isActive: true },
            _count: { id: true }
        });
        const countMap = new Map(userCounts.map(u => [u.organisationId, u._count.id]));
        const result = organisations.map(org => ({
            ...org,
            userCount: countMap.get(org.id) || 0
        }));
        res.json(result);
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.getAllOrganisations = getAllOrganisations;
const getOrganisation = async (req, res) => {
    try {
        const user = req.user;
        let orgId = (0, hierarchyUtils_1.getOrgId)(user);
        // If super admin and requesting specific org via param
        if (user.role === 'super_admin' && req.params.id) {
            orgId = req.params.id;
        }
        if (!orgId) {
            // Super admin without own org and no id param
            if (user.role === 'super_admin') {
                return res.json({ message: 'Superadmin account', isSuperAdmin: true });
            }
            return res.status(404).json({ message: 'Organisation not found' });
        }
        const org = await prisma_1.default.organisation.findUnique({
            where: { id: orgId }
        });
        if (!org)
            return res.status(404).json({ message: 'Organisation not found' });
        // Get active user count
        const userCount = await prisma_1.default.user.count({
            where: {
                organisationId: orgId,
                isActive: true
            }
        });
        // If super admin requesting specific org, include full details
        if (user.role === 'super_admin' && req.params.id) {
            const [users, leadCount, contactCount, accountCount, opportunityCount, wonOpportunities, activeLicense] = await Promise.all([
                prisma_1.default.user.findMany({
                    where: { organisationId: orgId, isActive: true },
                    select: { id: true, firstName: true, lastName: true, email: true, role: true, position: true, createdAt: true, userId: true },
                    orderBy: { createdAt: 'desc' }
                }),
                prisma_1.default.lead.count({ where: { organisationId: orgId } }),
                prisma_1.default.contact.count({ where: { organisationId: orgId } }),
                prisma_1.default.account.count({ where: { organisationId: orgId } }),
                prisma_1.default.opportunity.count({ where: { organisationId: orgId } }),
                prisma_1.default.opportunity.aggregate({
                    where: { organisationId: orgId, stage: 'closed_won' },
                    _sum: { amount: true }
                }),
                prisma_1.default.license.findFirst({
                    where: { organisationId: orgId, status: { in: ['active', 'trial'] } },
                    include: { plan: true }
                })
            ]);
            return res.json({
                organisation: org,
                users,
                activeLicense,
                stats: {
                    userCount: users.length,
                    leadCount,
                    contactCount,
                    accountCount,
                    opportunityCount,
                    totalRevenue: wonOpportunities._sum.amount || 0
                }
            });
        }
        // Return org with userCount for normal users
        const isStaff = user.role === 'admin' || user.role === 'super_admin';
        const sanitizedOrg = { ...org };
        // Security: Remove sensitive integration details for non-admins
        if (!isStaff) {
            if (sanitizedOrg.integrations) {
                const integrations = { ...sanitizedOrg.integrations };
                if (integrations.meta)
                    integrations.meta.accessToken = '[HIDDEN]';
                if (integrations.whatsapp)
                    integrations.whatsapp.token = '[HIDDEN]';
                sanitizedOrg.integrations = integrations;
            }
        }
        res.json({ ...sanitizedOrg, userCount });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.getOrganisation = getOrganisation;
const updateOrganisation = async (req, res) => {
    try {
        const user = req.user;
        let orgId = (0, hierarchyUtils_1.getOrgId)(user);
        if (user.role === 'super_admin' && req.params.id) {
            orgId = req.params.id;
        }
        if (!orgId)
            return res.status(404).json({ message: 'Organisation not found' });
        const data = { ...req.body };
        // Handle Meta Token Exchange
        if (data.integrations?.meta?.accessToken && data.integrations?.meta?.connected) {
            try {
                // If it's not already encrypted (3 parts), try exchanging and always encrypt the result
                const currentToken = data.integrations.meta.accessToken;
                const isEncrypted = currentToken.split(':').length === 3;
                if (!isEncrypted) {
                    const longLivedToken = await metaService_1.metaService.exchangeForLongLivedToken(currentToken, data.integrations.meta);
                    data.integrations.meta.accessToken = (0, encryption_1.encrypt)(longLivedToken);
                }
            }
            catch (error) {
                console.error('Error exchanging Meta token:', error);
                // If exchange fails but we have a plain token, still encrypt it
                if (data.integrations.meta.accessToken.split(':').length !== 3) {
                    data.integrations.meta.accessToken = (0, encryption_1.encrypt)(data.integrations.meta.accessToken);
                }
            }
        }
        // Handle Plan Assignment checks
        if (data.planId) {
            const plan = await prisma_1.default.subscriptionPlan.findUnique({ where: { id: data.planId } });
            if (!plan)
                throw new Error('Invalid Plan ID');
            // 1. Update Org Limits based on Plan
            data.userLimit = plan.maxUsers;
            data.status = 'active'; // Activate org if plan assignment happens
            // 2. Legacy Subscription JSON sync
            const existingSubscription = (await prisma_1.default.organisation.findUnique({ where: { id: orgId } }))?.subscription || {};
            data.subscription = {
                ...existingSubscription,
                status: 'active',
                plan: plan.name,
                planId: plan.id,
                startDate: new Date(),
                endDate: new Date(Date.now() + plan.durationDays * 24 * 60 * 60 * 1000)
            };
            // 3. Deactivate old active licenses
            await prisma_1.default.license.updateMany({
                where: { organisationId: orgId, status: 'active' },
                data: { status: 'cancelled', cancelledAt: new Date() }
            });
            // 4. Create New License
            await prisma_1.default.license.create({
                data: {
                    organisationId: orgId,
                    planId: plan.id,
                    status: 'active',
                    startDate: new Date(),
                    endDate: new Date(Date.now() + plan.durationDays * 24 * 60 * 60 * 1000),
                    maxUsers: plan.maxUsers,
                    autoRenew: true
                }
            });
            // Clean up planId from data intended for Organisation model update (if it's not a column)
            delete data.planId;
        }
        const org = await prisma_1.default.organisation.update({
            where: { id: orgId },
            data: {
                ...data,
                // Ensure currency is allowed if passed
                currency: data.currency
            }
        });
        // Audit Log
        (0, auditLogger_1.logAudit)({
            action: 'UPDATE_ORGANISATION',
            entity: 'Organisation',
            entityId: org.id,
            actorId: user.id,
            organisationId: org.id,
            details: { updatedFields: Object.keys(data) }
        });
        res.json(org);
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.updateOrganisation = updateOrganisation;
const deleteOrganisation = async (req, res) => {
    try {
        if (req.user.role !== 'super_admin') {
            return res.status(403).json({ message: 'Not authorized' });
        }
        const orgId = req.params.id;
        const org = await prisma_1.default.organisation.findUnique({
            where: { id: orgId }
        });
        if (!org) {
            return res.status(404).json({ message: 'Organisation not found' });
        }
        // Prevent Super Admin from deleting their own organisation
        const userOrgId = (0, hierarchyUtils_1.getOrgId)(req.user);
        if (userOrgId === orgId) {
            return res.status(400).json({ message: 'You cannot delete your own organisation' });
        }
        // SOFT DELETE
        await prisma_1.default.organisation.update({
            where: { id: orgId },
            data: {
                isDeleted: true,
                updatedAt: new Date()
            }
        });
        // Also soft delete all users in the organisation to prevent login
        await prisma_1.default.user.updateMany({
            where: { organisationId: orgId },
            data: { isActive: false }
        });
        // Audit Log
        (0, auditLogger_1.logAudit)({
            action: 'SOFT_DELETE_ORGANISATION',
            entity: 'Organisation',
            entityId: orgId,
            actorId: req.user.id,
            organisationId: orgId,
            details: {
                name: org.name,
                note: 'Organisation soft deleted - data preserved for recovery'
            }
        });
        res.json({
            message: 'Organisation marked as deleted (data preserved for recovery)',
            canRestore: true,
            deletedAt: new Date()
        });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.deleteOrganisation = deleteOrganisation;
const restoreOrganisation = async (req, res) => {
    try {
        if (req.user.role !== 'super_admin') {
            return res.status(403).json({ message: 'Not authorized' });
        }
        const orgId = req.params.id;
        const org = await prisma_1.default.organisation.findUnique({
            where: { id: orgId }
        });
        if (!org) {
            return res.status(404).json({ message: 'Organisation not found' });
        }
        if (!org.isDeleted) {
            return res.status(400).json({ message: 'Organisation is not deleted' });
        }
        // Restore the organisation
        await prisma_1.default.organisation.update({
            where: { id: orgId },
            data: {
                isDeleted: false,
                updatedAt: new Date()
            }
        });
        // Reactivate all users in the organisation
        await prisma_1.default.user.updateMany({
            where: { organisationId: orgId },
            data: { isActive: true }
        });
        // Audit Log
        (0, auditLogger_1.logAudit)({
            action: 'RESTORE_ORGANISATION',
            entity: 'Organisation',
            entityId: orgId,
            actorId: req.user.id,
            organisationId: orgId,
            details: {
                name: org.name,
                note: 'Organisation restored from soft delete'
            }
        });
        res.json({
            message: 'Organisation restored successfully',
            restoredAt: new Date()
        });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.restoreOrganisation = restoreOrganisation;
const sendTestReport = async (req, res) => {
    try {
        const user = req.user;
        const orgId = (0, hierarchyUtils_1.getOrgId)(user);
        if (!orgId)
            return res.status(404).json({ message: 'Organisation not found' });
        const org = await prisma_1.default.organisation.findFirst({
            where: { id: orgId },
            include: {
                users: {
                    where: { id: user.id }
                }
            }
        });
        if (!org)
            return res.status(404).json({ message: 'Organisation not found' });
        const { ReportingService } = await Promise.resolve().then(() => __importStar(require('../services/reportingService')));
        const { WhatsAppService } = await Promise.resolve().then(() => __importStar(require('../services/whatsAppService')));
        const stats = await ReportingService.getDailyStats(orgId);
        const report = ReportingService.formatWhatsAppReport(stats, org.name);
        const targetPhone = org.users[0]?.phone || org.contactPhone;
        if (!targetPhone) {
            return res.status(400).json({ message: 'No phone number configured for report' });
        }
        const waClient = await WhatsAppService.getClientForOrg(orgId);
        if (!waClient) {
            return res.status(400).json({ message: 'WhatsApp not connected for this organisation' });
        }
        await waClient.sendTextMessage(targetPhone, report);
        res.json({ message: `Test report sent to ${targetPhone}`, stats });
    }
    catch (error) {
        console.error('sendTestReport Error:', error);
        res.status(500).json({ message: error.message });
    }
};
exports.sendTestReport = sendTestReport;
/**
 * Permanently delete an organisation and all its data
 * SUPER ADMIN ONLY - This is irreversible!
 */
const permanentlyDeleteOrganisation = async (req, res) => {
    try {
        const user = req.user;
        // Only super admin can permanently delete
        if (user.role !== 'super_admin') {
            return res.status(403).json({ message: 'Only super admins can permanently delete organisations' });
        }
        const orgId = req.params.id;
        // Verify organisation exists
        const org = await prisma_1.default.organisation.findUnique({
            where: { id: orgId },
            include: {
                _count: {
                    select: {
                        users: true,
                        leads: true,
                        products: true,
                        tasks: true
                    }
                }
            }
        });
        if (!org) {
            return res.status(404).json({ message: 'Organisation not found' });
        }
        // Prevent super admin from deleting their own organisation
        const userOrgId = (0, hierarchyUtils_1.getOrgId)(user);
        if (userOrgId === orgId) {
            return res.status(400).json({ message: 'You cannot delete your own organisation' });
        }
        // Require confirmation parameter
        const { confirm } = req.body;
        if (confirm !== 'PERMANENTLY_DELETE') {
            return res.status(400).json({
                message: 'Confirmation required',
                instruction: 'Send { "confirm": "PERMANENTLY_DELETE" } in request body to proceed',
                warning: 'This will permanently delete all data including users, leads, products, and tasks',
                dataToBeDeleted: {
                    organisation: org.name,
                    users: org._count.users,
                    leads: org._count.leads,
                    products: org._count.products,
                    tasks: org._count.tasks
                }
            });
        }
        console.log(`⚠️  PERMANENT DELETE STARTED: Organisation "${org.name}" (${orgId}) by ${user.email}`);
        // Get all user IDs to handle cross-references
        const userIds = await prisma_1.default.user.findMany({
            where: { organisationId: orgId },
            select: { id: true }
        });
        const userIdList = userIds.map(u => u.id);
        /**
         * 1. DELETE JUNCTION TABLES AND SECONDARY CHILDREN
         * These must be deleted first as they depend on main entities.
         */
        // Lead junctions
        await prisma_1.default.leadProduct.deleteMany({ where: { lead: { organisationId: orgId } } });
        await prisma_1.default.leadHistory.deleteMany({ where: { lead: { organisationId: orgId } } });
        // Quote junctions  
        await prisma_1.default.quoteLineItem.deleteMany({ where: { quote: { organisationId: orgId } } });
        // User junctions/secondary data
        await prisma_1.default.searchHistory.deleteMany({ where: { userId: { in: userIdList } } });
        await prisma_1.default.userLeadQuotaTracker.deleteMany({ where: { userId: { in: userIdList } } });
        // Account products
        await prisma_1.default.accountProduct.deleteMany({ where: { organisationId: orgId } });
        // Product shares
        await prisma_1.default.productShare.deleteMany({ where: { organisationId: orgId } });
        /**
         * 2. DELETE MAIN ENTITIES LINKED TO ORG
         */
        // CRM Core
        await prisma_1.default.interaction.deleteMany({ where: { organisationId: orgId } });
        await prisma_1.default.opportunity.deleteMany({ where: { organisationId: orgId } });
        await prisma_1.default.lead.deleteMany({ where: { organisationId: orgId } });
        await prisma_1.default.contact.deleteMany({ where: { organisationId: orgId } });
        await prisma_1.default.account.deleteMany({ where: { organisationId: orgId } });
        await prisma_1.default.task.deleteMany({ where: { organisationId: orgId } });
        // Sales & Marketing
        await prisma_1.default.quote.deleteMany({ where: { organisationId: orgId } });
        await prisma_1.default.product.deleteMany({ where: { organisationId: orgId } });
        await prisma_1.default.salesTarget.deleteMany({ where: { organisationId: orgId } });
        await prisma_1.default.commission.deleteMany({ where: { organisationId: orgId } });
        await prisma_1.default.goal.deleteMany({ where: { organisationId: orgId } });
        await prisma_1.default.campaign.deleteMany({ where: { organisationId: orgId } });
        await prisma_1.default.landingPage.deleteMany({ where: { organisationId: orgId } });
        await prisma_1.default.webForm.deleteMany({ where: { organisationId: orgId } });
        await prisma_1.default.emailList.deleteMany({ where: { organisationId: orgId } });
        // Support & Communication
        await prisma_1.default.case.deleteMany({ where: { organisationId: orgId } });
        await prisma_1.default.callSettings.deleteMany({ where: { organisationId: orgId } });
        await prisma_1.default.whatsAppMessage.deleteMany({ where: { organisationId: orgId } });
        await prisma_1.default.whatsAppCampaign.deleteMany({ where: { organisationId: orgId } });
        await prisma_1.default.sMSCampaign.deleteMany({ where: { organisationId: orgId } });
        await prisma_1.default.webhook.deleteMany({ where: { organisationId: orgId } });
        await prisma_1.default.checkIn.deleteMany({ where: { organisationId: orgId } });
        // Infrastructure & Workspace
        await prisma_1.default.workflowRule.deleteMany({ where: { organisationId: orgId } });
        await prisma_1.default.workflowQueue.deleteMany({ where: { organisationId: orgId } });
        await prisma_1.default.workflow.deleteMany({ where: { organisationId: orgId } });
        await prisma_1.default.pipeline.deleteMany({ where: { organisationId: orgId } });
        await prisma_1.default.calendarEvent.deleteMany({ where: { organisationId: orgId } });
        await prisma_1.default.document.deleteMany({ where: { organisationId: orgId } });
        await prisma_1.default.team.deleteMany({ where: { organisationId: orgId } });
        await prisma_1.default.territory.deleteMany({ where: { organisationId: orgId } });
        await prisma_1.default.customField.deleteMany({ where: { organisationId: orgId } });
        await prisma_1.default.apiKey.deleteMany({ where: { organisationId: orgId } });
        await prisma_1.default.assignmentRule.deleteMany({ where: { organisationId: orgId } });
        await prisma_1.default.importJob.deleteMany({ where: { organisationId: orgId } });
        await prisma_1.default.license.deleteMany({ where: { organisationId: orgId } });
        // 3. System Logs for this org
        await prisma_1.default.notification.deleteMany({ where: { recipientId: { in: userIdList } } });
        await prisma_1.default.auditLog.deleteMany({ where: { organisationId: orgId } });
        // 4. Delete Users
        await prisma_1.default.user.deleteMany({ where: { organisationId: orgId } });
        // 5. Finally delete the Organisation
        await prisma_1.default.organisation.delete({ where: { id: orgId } });
        // 6. Audit Log (Logged AFTER successful deletion with 'system' org)
        await (0, auditLogger_1.logAudit)({
            action: 'PERMANENT_DELETE_ORGANISATION',
            entity: 'Organisation',
            entityId: orgId,
            actorId: user.id,
            organisationId: 'system',
            details: {
                name: org.name,
                deletedUsersCount: userIdList.length,
                warning: 'PERMANENT DELETION SUCCESSFUL'
            }
        });
        console.log(`✅  PERMANENT DELETE SUCCESSFUL: "${org.name}"`);
        res.json({
            message: 'Organisation permanently deleted',
            deletedData: {
                organisation: org.name,
                users: org._count.users,
                leads: org._count.leads,
                products: org._count.products,
                tasks: org._count.tasks
            }
        });
    }
    catch (error) {
        console.error('Permanent delete error:', error);
        res.status(500).json({ message: error.message });
    }
};
exports.permanentlyDeleteOrganisation = permanentlyDeleteOrganisation;
//# sourceMappingURL=organisationController.js.map