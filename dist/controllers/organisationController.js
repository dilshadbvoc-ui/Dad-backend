"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteOrganisation = exports.updateOrganisation = exports.getOrganisation = exports.getAllOrganisations = exports.createOrganisation = void 0;
const prisma_1 = __importDefault(require("../config/prisma"));
const hierarchyUtils_1 = require("../utils/hierarchyUtils");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const createOrganisation = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        if (req.user.role !== 'super_admin') {
            return res.status(403).json({ message: 'Not authorized to create organisations' });
        }
        const { name, email, password, firstName, lastName } = req.body;
        // 1. Create Organisation
        const slug = name.toLowerCase().replace(/[^a-z0-9]/g, '-');
        const org = yield prisma_1.default.organisation.create({
            data: {
                name,
                slug,
                contactEmail: email,
                status: 'active'
            }
        });
        // 2. Create Admin User for this Organisation
        const tempPassword = password || Math.random().toString(36).slice(-8);
        const hashedPassword = yield bcryptjs_1.default.hash(tempPassword, 10);
        const user = yield prisma_1.default.user.create({
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
        yield prisma_1.default.organisation.update({
            where: { id: org.id },
            data: { createdBy: user.id }
        });
        res.status(201).json({ organisation: org, adminUser: Object.assign(Object.assign({}, user), { password: undefined }), tempPassword });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
});
exports.createOrganisation = createOrganisation;
const getAllOrganisations = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        if (req.user.role !== 'super_admin') {
            return res.status(403).json({ message: 'Not authorized' });
        }
        const organisations = yield prisma_1.default.organisation.findMany({
            orderBy: { createdAt: 'desc' }
        });
        // Get user counts for each organisation
        const orgIds = organisations.map(o => o.id);
        const userCounts = yield prisma_1.default.user.groupBy({
            by: ['organisationId'],
            where: { organisationId: { in: orgIds }, isActive: true },
            _count: { id: true }
        });
        const countMap = new Map(userCounts.map(u => [u.organisationId, u._count.id]));
        const result = organisations.map(org => (Object.assign(Object.assign({}, org), { userCount: countMap.get(org.id) || 0 })));
        res.json(result);
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
});
exports.getAllOrganisations = getAllOrganisations;
const getOrganisation = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
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
        const org = yield prisma_1.default.organisation.findUnique({
            where: { id: orgId }
        });
        if (!org)
            return res.status(404).json({ message: 'Organisation not found' });
        // If super admin requesting specific org, include full details
        if (user.role === 'super_admin' && req.params.id) {
            const [users, leadCount, contactCount, accountCount, opportunityCount, wonOpportunities] = yield Promise.all([
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
                })
            ]);
            return res.json({
                organisation: org,
                users,
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
        res.json(org);
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
});
exports.getOrganisation = getOrganisation;
const updateOrganisation = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const user = req.user;
        let orgId = (0, hierarchyUtils_1.getOrgId)(user);
        if (user.role === 'super_admin' && req.params.id) {
            orgId = req.params.id;
        }
        if (!orgId)
            return res.status(404).json({ message: 'Organisation not found' });
        const data = Object.assign({}, req.body);
        // Handle Plan Assignment checks
        if (data.planId) {
            const plan = yield prisma_1.default.subscriptionPlan.findUnique({ where: { id: data.planId } });
            if (!plan)
                throw new Error('Invalid Plan ID');
            // 1. Update Org Limits based on Plan
            data.userLimit = plan.maxUsers;
            data.status = 'active'; // Activate org if plan assignment happens
            // 2. Legacy Subscription JSON sync
            const existingSubscription = ((_a = (yield prisma_1.default.organisation.findUnique({ where: { id: orgId } }))) === null || _a === void 0 ? void 0 : _a.subscription) || {};
            data.subscription = Object.assign(Object.assign({}, existingSubscription), { status: 'active', plan: plan.name, planId: plan.id, startDate: new Date(), endDate: new Date(Date.now() + plan.durationDays * 24 * 60 * 60 * 1000) });
            // 3. Deactivate old active licenses
            yield prisma_1.default.license.updateMany({
                where: { organisationId: orgId, status: 'active' },
                data: { status: 'cancelled', cancelledAt: new Date() }
            });
            // 4. Create New License
            yield prisma_1.default.license.create({
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
        const org = yield prisma_1.default.organisation.update({
            where: { id: orgId },
            data: data
        });
        res.json(org);
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
});
exports.updateOrganisation = updateOrganisation;
const deleteOrganisation = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        if (req.user.role !== 'super_admin') {
            return res.status(403).json({ message: 'Not authorized' });
        }
        const orgId = req.params.id;
        const org = yield prisma_1.default.organisation.findUnique({
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
        // Delete all users in this org first (due to foreign key constraints)
        yield prisma_1.default.user.deleteMany({ where: { organisationId: orgId } });
        // Delete the organisation
        yield prisma_1.default.organisation.delete({ where: { id: orgId } });
        res.json({ message: 'Organisation and associated data deleted' });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
});
exports.deleteOrganisation = deleteOrganisation;
