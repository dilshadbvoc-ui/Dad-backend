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
exports.checkLicenseValidity = exports.cancelLicense = exports.activateLicense = exports.getCurrentLicense = exports.getLicenses = void 0;
const prisma_1 = __importDefault(require("../config/prisma"));
const hierarchyUtils_1 = require("../utils/hierarchyUtils");
const getLicenses = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const user = req.user;
        const where = {};
        // Super admin can see all, others only their org
        if (!user.isSuperAdmin) {
            const orgId = (0, hierarchyUtils_1.getOrgId)(user);
            if (orgId)
                where.organisationId = orgId;
        }
        const licenses = yield prisma_1.default.license.findMany({
            where,
            include: {
                organisation: { select: { id: true, name: true, slug: true } },
                plan: { select: { id: true, name: true, price: true, features: true } }
            },
            orderBy: { createdAt: 'desc' }
        });
        res.json({ licenses });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
});
exports.getLicenses = getLicenses;
const getCurrentLicense = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const orgId = (0, hierarchyUtils_1.getOrgId)(req.user);
        if (!orgId)
            return res.status(400).json({ message: 'No organisation' });
        const license = yield prisma_1.default.license.findFirst({
            where: {
                organisationId: orgId,
                status: { in: ['active', 'trial'] }
            },
            include: { plan: true },
            orderBy: { endDate: 'desc' }
        });
        if (!license) {
            return res.status(404).json({ message: 'No active license found' });
        }
        // Get current user count
        const userCount = yield prisma_1.default.user.count({
            where: { organisationId: orgId, isActive: true }
        });
        res.json({
            license,
            usage: {
                currentUsers: userCount,
                maxUsers: license.maxUsers,
                percentUsed: Math.round((userCount / license.maxUsers) * 100)
            }
        });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
});
exports.getCurrentLicense = getCurrentLicense;
const activateLicense = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { planId, organisationId } = req.body;
        const user = req.user;
        const plan = yield prisma_1.default.subscriptionPlan.findUnique({ where: { id: planId } });
        if (!plan)
            return res.status(404).json({ message: 'Plan not found' });
        const orgId = organisationId || (0, hierarchyUtils_1.getOrgId)(user);
        if (!orgId)
            return res.status(400).json({ message: 'No organisation' });
        // Create license
        const startDate = new Date();
        const endDate = new Date();
        endDate.setDate(endDate.getDate() + plan.durationDays);
        const license = yield prisma_1.default.license.create({
            data: {
                organisation: { connect: { id: orgId } },
                plan: { connect: { id: planId } },
                status: 'active',
                startDate,
                endDate,
                maxUsers: plan.maxUsers,
                activatedBy: { connect: { id: user.id } },
                paymentDetails: req.body.paymentDetails
            }
        });
        // Update organisation subscription
        yield prisma_1.default.organisation.update({
            where: { id: orgId },
            data: {
                subscription: {
                    plan: planId,
                    status: 'active',
                    startDate: startDate.toISOString(),
                    endDate: endDate.toISOString()
                },
                userLimit: plan.maxUsers
            }
        });
        res.status(201).json(license);
    }
    catch (error) {
        res.status(400).json({ message: error.message });
    }
});
exports.activateLicense = activateLicense;
const cancelLicense = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const orgId = (0, hierarchyUtils_1.getOrgId)(req.user);
        if (!orgId)
            return res.status(400).json({ message: 'No organisation' });
        const license = yield prisma_1.default.license.updateMany({
            where: {
                id: req.params.id,
                organisationId: orgId
            },
            data: {
                status: 'cancelled',
                cancelledById: req.user.id,
                cancelledAt: new Date(),
                cancellationReason: req.body.reason
            }
        });
        if (license.count === 0)
            return res.status(404).json({ message: 'License not found' });
        // Update organisation
        yield prisma_1.default.organisation.update({
            where: { id: orgId },
            data: { subscription: { status: 'cancelled' } }
        });
        res.json({ message: 'License cancelled' });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
});
exports.cancelLicense = cancelLicense;
const checkLicenseValidity = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const orgId = (0, hierarchyUtils_1.getOrgId)(req.user);
        if (!orgId)
            return res.status(400).json({ message: 'No organisation' });
        const license = yield prisma_1.default.license.findFirst({
            where: {
                organisationId: orgId,
                status: { in: ['active', 'trial'] },
                endDate: { gt: new Date() }
            }
        });
        const isValid = !!license;
        const daysRemaining = license
            ? Math.ceil((new Date(license.endDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
            : 0;
        res.json({
            isValid,
            daysRemaining,
            status: (license === null || license === void 0 ? void 0 : license.status) || 'expired',
            expiresAt: license === null || license === void 0 ? void 0 : license.endDate
        });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
});
exports.checkLicenseValidity = checkLicenseValidity;
