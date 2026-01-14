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
exports.getOrganisationStats = exports.suspendOrganisation = exports.updateOrganisationAdmin = exports.createOrganisation = exports.getAllOrganisations = void 0;
const prisma_1 = __importDefault(require("../config/prisma"));
// Get all organisations (Super Admin only)
const getAllOrganisations = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        if (!req.user.isSuperAdmin) {
            return res.status(403).json({ message: 'Access denied. Super admin only.' });
        }
        const organisations = yield prisma_1.default.organisation.findMany({
            orderBy: { createdAt: 'desc' }
        });
        // Get user counts for each org
        const orgIds = organisations.map(o => o.id);
        const userCounts = yield prisma_1.default.user.groupBy({
            by: ['organisationId'],
            where: { organisationId: { in: orgIds }, isActive: true },
            _count: { id: true }
        });
        const countMap = new Map(userCounts.map(u => [u.organisationId, u._count.id]));
        const result = organisations.map(org => (Object.assign(Object.assign({}, org), { userCount: countMap.get(org.id) || 0 })));
        res.json({ organisations: result });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
});
exports.getAllOrganisations = getAllOrganisations;
// Create new organisation (Super Admin or Registration)
const createOrganisation = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { name, slug, contactEmail, planId } = req.body;
        // Check if slug is unique
        const existingOrg = yield prisma_1.default.organisation.findUnique({ where: { slug } });
        if (existingOrg) {
            return res.status(400).json({ message: 'Organisation slug already exists' });
        }
        // Create organisation
        const organisation = yield prisma_1.default.organisation.create({
            data: {
                name,
                slug: slug || name.toLowerCase().replace(/\s+/g, '-'),
                contactEmail,
                status: 'active',
                subscription: {
                    status: 'trial',
                    startDate: new Date().toISOString(),
                    endDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString()
                }
            }
        });
        // If plan specified, create license
        if (planId) {
            const plan = yield prisma_1.default.subscriptionPlan.findUnique({ where: { id: planId } });
            if (plan) {
                const endDate = new Date();
                endDate.setDate(endDate.getDate() + plan.durationDays);
                yield prisma_1.default.license.create({
                    data: {
                        organisation: { connect: { id: organisation.id } },
                        plan: { connect: { id: planId } },
                        status: 'trial',
                        startDate: new Date(),
                        endDate,
                        maxUsers: plan.maxUsers
                    }
                });
            }
        }
        res.status(201).json(organisation);
    }
    catch (error) {
        res.status(400).json({ message: error.message });
    }
});
exports.createOrganisation = createOrganisation;
// Update organisation
const updateOrganisationAdmin = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        if (!req.user.isSuperAdmin) {
            return res.status(403).json({ message: 'Access denied' });
        }
        const orgId = req.params.id;
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
            // Clean up planId from data intended for Organisation model update
            delete data.planId;
        }
        const organisation = yield prisma_1.default.organisation.update({
            where: { id: orgId },
            data: data
        });
        res.json(organisation);
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
});
exports.updateOrganisationAdmin = updateOrganisationAdmin;
// Suspend organisation
const suspendOrganisation = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        if (!req.user.isSuperAdmin) {
            return res.status(403).json({ message: 'Access denied' });
        }
        const organisation = yield prisma_1.default.organisation.update({
            where: { id: req.params.id },
            data: {
                status: 'suspended',
                subscription: { status: 'cancelled' }
            }
        });
        // Cancel all licenses
        yield prisma_1.default.license.updateMany({
            where: { organisationId: organisation.id },
            data: { status: 'cancelled', cancelledAt: new Date() }
        });
        res.json({ message: 'Organisation suspended', organisation });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
});
exports.suspendOrganisation = suspendOrganisation;
// Get organisation stats (Super Admin)
const getOrganisationStats = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        if (!req.user.isSuperAdmin) {
            return res.status(403).json({ message: 'Access denied' });
        }
        const [totalOrgs, activeOrgs, suspendedOrgs, totalUsers, totalLicenses] = yield Promise.all([
            prisma_1.default.organisation.count(),
            prisma_1.default.organisation.count({ where: { status: 'active' } }),
            prisma_1.default.organisation.count({ where: { status: 'suspended' } }),
            prisma_1.default.user.count({ where: { isActive: true } }),
            prisma_1.default.license.count({ where: { status: 'active' } })
        ]);
        res.json({
            totalOrganisations: totalOrgs,
            activeOrganisations: activeOrgs,
            trialOrganisations: 0, // Would need JSON query for subscription.status
            suspendedOrganisations: suspendedOrgs,
            totalUsers,
            activeLicenses: totalLicenses
        });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
});
exports.getOrganisationStats = getOrganisationStats;
