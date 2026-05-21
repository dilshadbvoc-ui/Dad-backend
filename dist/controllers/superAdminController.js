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
exports.broadcastToOrgAdmins = exports.resetUserPassword = exports.getOrganisationStats = exports.suspendOrganisation = exports.updateOrganisationAdmin = exports.createOrganisation = exports.getAllOrganisations = void 0;
const prisma_1 = __importDefault(require("../config/prisma"));
// Get all organisations (Super Admin only)
const getAllOrganisations = async (req, res) => {
    try {
        if (!req.user.isSuperAdmin) {
            return res.status(403).json({ message: 'Access denied. Super admin only.' });
        }
        const organisations = await prisma_1.default.organisation.findMany({
            orderBy: { createdAt: 'desc' },
            include: {
                licenses: {
                    where: { status: { in: ['active', 'trial'] } },
                    include: { plan: true },
                    take: 1
                }
            }
        });
        // Get user counts for each org
        const orgIds = organisations.map(o => o.id);
        const userCounts = await prisma_1.default.user.groupBy({
            by: ['organisationId'],
            where: { organisationId: { in: orgIds }, isActive: true },
            _count: { id: true }
        });
        const countMap = new Map(userCounts.map(u => [u.organisationId, u._count.id]));
        const result = organisations.map(org => ({
            ...org,
            userCount: countMap.get(org.id) || 0,
            activeLicense: org.licenses[0] || null
        }));
        res.json({ organisations: result });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.getAllOrganisations = getAllOrganisations;
// Create new organisation (Super Admin or Registration)
const createOrganisation = async (req, res) => {
    try {
        const { name, slug, contactEmail, planId, firstName, lastName, password } = req.body;
        // Check if slug is unique
        const existingOrg = await prisma_1.default.organisation.findUnique({ where: { slug } });
        if (existingOrg) {
            return res.status(400).json({ message: 'Organisation slug already exists' });
        }
        // Check if user email exists
        const existingUser = await prisma_1.default.user.findUnique({ where: { email: contactEmail } });
        if (existingUser) {
            return res.status(400).json({ message: 'User with this email already exists' });
        }
        // Lazy load bcrypt
        const bcrypt = await Promise.resolve().then(() => __importStar(require('bcryptjs')));
        const hashedPassword = await bcrypt.hash(password || 'Welcome123', 10);
        // Transaction to ensure atomicity
        const result = await prisma_1.default.$transaction(async (tx) => {
            // 1. Create Organisation
            const organisation = await tx.organisation.create({
                data: {
                    name,
                    slug: slug || name.toLowerCase().replace(/\s+/g, '-'),
                    contactEmail,
                    status: 'active',
                    subscription: {
                        status: planId ? 'active' : 'trial',
                        startDate: new Date().toISOString(),
                        endDate: new Date(Date.now() + (planId ? 30 : 14) * 24 * 60 * 60 * 1000).toISOString()
                    }
                }
            });
            // 2. Create Admin User
            const user = await tx.user.create({
                data: {
                    firstName: firstName || 'Admin',
                    lastName: lastName || 'User',
                    email: contactEmail,
                    password: hashedPassword,
                    role: 'admin',
                    organisationId: organisation.id,
                    isActive: true
                }
            });
            // 3. Create License (if plan)
            if (planId) {
                const plan = await tx.subscriptionPlan.findUnique({ where: { id: planId } });
                if (plan) {
                    const endDate = new Date();
                    endDate.setDate(endDate.getDate() + plan.durationDays);
                    await tx.license.create({
                        data: {
                            organisationId: organisation.id,
                            planId: planId,
                            status: 'active',
                            startDate: new Date(),
                            endDate,
                            maxUsers: plan.maxUsers,
                            activatedById: user.id
                        }
                    });
                }
            }
            return { organisation, tempPassword: password || 'Welcome123' };
        });
        // Audit Log
        try {
            const { logAudit } = await Promise.resolve().then(() => __importStar(require('../utils/auditLogger')));
            await logAudit({
                organisationId: result.organisation.id,
                actorId: req.user?.id || 'SYSTEM_REG', // Super Admin ID or SYSTEM if registration
                action: 'CREATE_ORGANISATION',
                entity: 'Organisation',
                entityId: result.organisation.id,
                details: { name: result.organisation.name, slug: result.organisation.slug }
            });
        }
        catch (e) {
            console.error('Audit Log Error:', e);
        }
        res.status(201).json(result);
    }
    catch (error) {
        res.status(400).json({ message: error.message });
    }
};
exports.createOrganisation = createOrganisation;
// Update organisation
const updateOrganisationAdmin = async (req, res) => {
    try {
        console.log(`[updateOrganisationAdmin] Incoming update for orgId: ${req.params.id}`);
        console.log('Body:', JSON.stringify(req.body, null, 2));
        if (!req.user.isSuperAdmin) {
            console.log('[updateOrganisationAdmin] Access denied: User is not super admin');
            return res.status(403).json({ message: 'Access denied' });
        }
        const orgId = req.params.id;
        const data = { ...req.body };
        // Handle Plan Assignment checks
        if ('planId' in data) {
            if (data.planId) {
                const currentOrg = await prisma_1.default.organisation.findUnique({
                    where: { id: orgId },
                    include: {
                        licenses: {
                            where: { status: 'active' },
                            take: 1
                        }
                    }
                });
                const currentPlanId = currentOrg?.licenses[0]?.planId;
                if (data.planId === currentPlanId) {
                    console.log(`[updateOrganisationAdmin] Plan ID ${data.planId} is same as current. skipping license update.`);
                }
                else {
                    console.log(`[updateOrganisationAdmin] Plan assignment detected. planId: ${data.planId}`);
                    const plan = await prisma_1.default.subscriptionPlan.findUnique({ where: { id: data.planId } });
                    if (!plan) {
                        console.log(`[updateOrganisationAdmin] Error: Invalid Plan ID - ${data.planId}`);
                        throw new Error('Invalid Plan ID');
                    }
                    console.log(`[updateOrganisationAdmin] Found plan: ${plan.name}`);
                    // 1. Update Org Limits based on Plan
                    data.userLimit = plan.maxUsers;
                    data.status = 'active'; // Activate org if plan assignment happens
                    console.log(`[updateOrganisationAdmin] Updating org limits: userLimit=${data.userLimit}, status=${data.status}`);
                    // 2. Legacy Subscription JSON sync
                    const existingSubscription = currentOrg?.subscription || {};
                    data.subscription = {
                        ...existingSubscription,
                        status: 'active',
                        plan: plan.name,
                        planId: plan.id,
                        startDate: new Date(),
                        endDate: new Date(Date.now() + plan.durationDays * 24 * 60 * 60 * 1000)
                    };
                    console.log('[updateOrganisationAdmin] Updated subscription JSON:', JSON.stringify(data.subscription, null, 2));
                    // 3. Deactivate old active licenses
                    const deactivated = await prisma_1.default.license.updateMany({
                        where: { organisationId: orgId, status: 'active' },
                        data: { status: 'cancelled', cancelledAt: new Date() }
                    });
                    console.log(`[updateOrganisationAdmin] Deactivated ${deactivated.count} old active licenses`);
                    // 4. Create New License
                    const newLicense = await prisma_1.default.license.create({
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
                    console.log(`[updateOrganisationAdmin] Created new license: ${newLicense.id}`);
                }
            }
            // Always clean up planId from data intended for Organisation model update
            delete data.planId;
        }
        console.log('[updateOrganisationAdmin] Final data for prisma.organisation.update:', JSON.stringify(data, null, 2));
        const organisation = await prisma_1.default.organisation.update({
            where: { id: orgId },
            data: data
        });
        console.log('[updateOrganisationAdmin] Organisation updated successfully');
        // Audit Log
        try {
            console.log('[updateOrganisationAdmin] Creating audit log...');
            const { logAudit } = await Promise.resolve().then(() => __importStar(require('../utils/auditLogger')));
            await logAudit({
                organisationId: organisation.id,
                actorId: req.user.id,
                action: 'UPDATE_ORGANISATION',
                entity: 'Organisation',
                entityId: organisation.id,
                details: { updatedFields: Object.keys(data) }
            });
            console.log('[updateOrganisationAdmin] Audit log created');
        }
        catch (e) {
            console.error('[updateOrganisationAdmin] Audit Log Error:', e);
        }
        res.json(organisation);
    }
    catch (error) {
        console.error('[updateOrganisationAdmin] Caught error:', error);
        res.status(500).json({ message: error.message });
    }
};
exports.updateOrganisationAdmin = updateOrganisationAdmin;
// Suspend organisation
const suspendOrganisation = async (req, res) => {
    try {
        if (!req.user.isSuperAdmin) {
            return res.status(403).json({ message: 'Access denied' });
        }
        const organisation = await prisma_1.default.organisation.update({
            where: { id: req.params.id },
            data: {
                status: 'suspended',
                subscription: { status: 'cancelled' }
            }
        });
        // Cancel all licenses
        await prisma_1.default.license.updateMany({
            where: { organisationId: organisation.id },
            data: { status: 'cancelled', cancelledAt: new Date() }
        });
        // Audit Log
        try {
            const { logAudit } = await Promise.resolve().then(() => __importStar(require('../utils/auditLogger')));
            await logAudit({
                organisationId: organisation.id,
                actorId: req.user.id,
                action: 'SUSPEND_ORGANISATION',
                entity: 'Organisation',
                entityId: organisation.id
            });
        }
        catch (e) {
            console.error('Audit Log Error:', e);
        }
        res.json({ message: 'Organisation suspended', organisation });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.suspendOrganisation = suspendOrganisation;
// Get organisation stats (Super Admin)
const getOrganisationStats = async (req, res) => {
    try {
        if (!req.user.isSuperAdmin) {
            return res.status(403).json({ message: 'Access denied' });
        }
        const now = new Date();
        const thirtyDaysAgo = new Date(now.setDate(now.getDate() - 30));
        const [totalOrgs, activeOrgs, suspendedOrgs, totalUsers, activeLicenses, newOrgsLast30Days, revenue] = await Promise.all([
            prisma_1.default.organisation.count(),
            prisma_1.default.organisation.count({ where: { status: 'active' } }),
            prisma_1.default.organisation.count({ where: { status: 'suspended' } }),
            prisma_1.default.user.count({ where: { isActive: true } }),
            prisma_1.default.license.count({ where: { status: 'active' } }),
            prisma_1.default.organisation.count({ where: { createdAt: { gte: thirtyDaysAgo } } }),
            // Calculate revenue from active licenses
            prisma_1.default.license.findMany({
                where: { status: 'active' },
                include: { plan: true }
            })
        ]);
        const totalRevenue = revenue.reduce((acc, license) => acc + (license.plan?.price || 0), 0);
        // Group by Plan
        const planDistribution = await prisma_1.default.license.groupBy({
            by: ['planId'],
            where: { status: 'active' },
            _count: { id: true }
        });
        // Fetch plan names
        const planIds = planDistribution.map(p => p.planId).filter(id => id !== null);
        const plans = await prisma_1.default.subscriptionPlan.findMany({ where: { id: { in: planIds } } });
        const planMap = new Map(plans.map(p => [p.id, p.name]));
        const planStats = planDistribution.map(p => ({
            name: planMap.get(p.planId) || 'Unknown',
            count: p._count.id
        }));
        res.json({
            overview: {
                totalOrganisations: totalOrgs,
                activeOrganisations: activeOrgs,
                newOrganisations: newOrgsLast30Days,
                suspendedOrganisations: suspendedOrgs,
                totalUsers,
                activeLicenses,
                totalRevenue
            },
            planDistribution: planStats
        });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.getOrganisationStats = getOrganisationStats;
// Reset user password (Super Admin Only)
const resetUserPassword = async (req, res) => {
    try {
        if (!req.user.isSuperAdmin) {
            return res.status(403).json({ message: 'Access denied' });
        }
        const { userId, newPassword } = req.body;
        if (!userId || !newPassword || newPassword.length < 8) {
            return res.status(400).json({ message: 'Valid user ID and password (min 8 chars) required' });
        }
        const bcrypt = await Promise.resolve().then(() => __importStar(require('bcryptjs')));
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        const updatedUser = await prisma_1.default.user.update({
            where: { id: userId },
            data: { password: hashedPassword }
        });
        // Audit Log
        try {
            const { logAudit } = await Promise.resolve().then(() => __importStar(require('../utils/auditLogger')));
            await logAudit({
                organisationId: updatedUser.organisationId || 'SYSTEM',
                actorId: req.user.id,
                action: 'SUPERADMIN_RESET_PASSWORD',
                entity: 'User',
                entityId: userId,
                details: { resetBy: req.user.email, targetUser: updatedUser.email }
            });
        }
        catch (e) {
            console.error('Audit Log Error:', e);
        }
        res.json({ message: 'Password reset successfully' });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.resetUserPassword = resetUserPassword;
// Broadcast notification to all Org Admins (Super Admin Only)
const broadcastToOrgAdmins = async (req, res) => {
    try {
        if (!req.user.isSuperAdmin) {
            return res.status(403).json({ message: 'Access denied. Super admin only.' });
        }
        const { title, message } = req.body;
        if (!title || !message) {
            return res.status(400).json({ message: 'Title and message are required' });
        }
        // Fetch all active organisation administrators
        const orgAdmins = await prisma_1.default.user.findMany({
            where: {
                role: { in: ['admin', 'org_admin', 'organisation_admin'] },
                isActive: true,
                isDeleted: false
            },
            select: { id: true }
        });
        if (orgAdmins.length === 0) {
            return res.json({ success: true, count: 0, message: 'No organisation administrators found' });
        }
        const crypto = await Promise.resolve().then(() => __importStar(require('crypto')));
        // Prepare notifications data with pre-generated UUIDs
        const notificationsData = orgAdmins.map(adminUser => ({
            id: crypto.randomUUID(),
            recipientId: adminUser.id,
            title,
            message,
            type: 'popup',
            isRead: false,
            createdAt: new Date(),
            updatedAt: new Date()
        }));
        // Batch insert
        await prisma_1.default.notification.createMany({
            data: notificationsData
        });
        // Real-time emission via Socket.io
        const { getIO } = await Promise.resolve().then(() => __importStar(require('../socket')));
        const io = getIO();
        if (io) {
            notificationsData.forEach(notif => {
                io.to(notif.recipientId).emit('notification', notif);
            });
        }
        res.json({ success: true, count: orgAdmins.length, message: `Broadcast successfully sent to ${orgAdmins.length} admins` });
    }
    catch (error) {
        console.error('broadcastToOrgAdmins Error:', error);
        res.status(500).json({ message: error.message });
    }
};
exports.broadcastToOrgAdmins = broadcastToOrgAdmins;
