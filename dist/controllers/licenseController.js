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
exports.checkLicenseValidity = exports.setCustomPrice = exports.cancelLicense = exports.activateLicense = exports.getCurrentLicense = exports.getLicenses = void 0;
const prisma_1 = __importDefault(require("../config/prisma"));
const hierarchyUtils_1 = require("../utils/hierarchyUtils");
const getLicenses = async (req, res) => {
    try {
        const user = req.user;
        const where = {};
        // Super admin can see all, others only their org
        if (!user.isSuperAdmin) {
            const orgId = (0, hierarchyUtils_1.getOrgId)(user);
            if (!orgId)
                return res.status(403).json({ message: 'User has no organisation' });
            where.organisationId = orgId;
        }
        const licenses = await prisma_1.default.license.findMany({
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
};
exports.getLicenses = getLicenses;
const getCurrentLicense = async (req, res) => {
    try {
        const orgId = (0, hierarchyUtils_1.getOrgId)(req.user);
        if (!orgId)
            return res.status(400).json({ message: 'No organisation' });
        const license = await prisma_1.default.license.findFirst({
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
        const userCount = await prisma_1.default.user.count({
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
};
exports.getCurrentLicense = getCurrentLicense;
const activateLicense = async (req, res) => {
    try {
        const { planId, organisationId } = req.body;
        const user = req.user;
        const plan = await prisma_1.default.subscriptionPlan.findUnique({ where: { id: planId } });
        if (!plan)
            return res.status(404).json({ message: 'Plan not found' });
        const orgId = organisationId || (0, hierarchyUtils_1.getOrgId)(user);
        if (!orgId)
            return res.status(400).json({ message: 'No organisation' });
        // Create license
        const startDate = new Date();
        const endDate = new Date();
        endDate.setDate(endDate.getDate() + plan.durationDays);
        const license = await prisma_1.default.license.create({
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
        await prisma_1.default.organisation.update({
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
        // Audit Log
        try {
            const { logAudit } = await Promise.resolve().then(() => __importStar(require('../utils/auditLogger')));
            await logAudit({
                organisationId: orgId,
                actorId: user.id,
                action: 'ACTIVATE_LICENSE',
                entity: 'License',
                entityId: license.id,
                details: { plan: plan.name, maxUsers: plan.maxUsers }
            });
        }
        catch (e) {
            console.error('Audit Log Error:', e);
        }
        res.status(201).json(license);
    }
    catch (error) {
        res.status(400).json({ message: error.message });
    }
};
exports.activateLicense = activateLicense;
const cancelLicense = async (req, res) => {
    try {
        const orgId = (0, hierarchyUtils_1.getOrgId)(req.user);
        if (!orgId)
            return res.status(400).json({ message: 'No organisation' });
        const license = await prisma_1.default.license.updateMany({
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
        await prisma_1.default.organisation.update({
            where: { id: orgId },
            data: { subscription: { status: 'cancelled' } }
        });
        // Audit Log
        try {
            const { logAudit } = await Promise.resolve().then(() => __importStar(require('../utils/auditLogger')));
            await logAudit({
                organisationId: orgId,
                actorId: req.user.id,
                action: 'CANCEL_LICENSE',
                entity: 'License',
                entityId: req.params.id,
                details: { reason: req.body.reason }
            });
        }
        catch (e) {
            console.error('Audit Log Error:', e);
        }
        res.json({ message: 'License cancelled' });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.cancelLicense = cancelLicense;
const setCustomPrice = async (req, res) => {
    try {
        const user = req.user;
        // Only super admin can set custom pricing
        if (!user.isSuperAdmin) {
            return res.status(403).json({ message: 'Only super admin can set custom pricing' });
        }
        const { customPrice } = req.body;
        const licenseId = req.params.id;
        // Validate custom price
        if (customPrice !== null && (typeof customPrice !== 'number' || customPrice < 0)) {
            return res.status(400).json({ message: 'Invalid custom price' });
        }
        const license = await prisma_1.default.license.update({
            where: { id: licenseId },
            data: { customPrice: customPrice },
            include: {
                organisation: { select: { id: true, name: true } },
                plan: { select: { id: true, name: true, price: true } }
            }
        });
        // Audit Log
        try {
            const { logAudit } = await Promise.resolve().then(() => __importStar(require('../utils/auditLogger')));
            await logAudit({
                organisationId: license.organisationId,
                actorId: user.id,
                action: 'SET_CUSTOM_PRICE',
                entity: 'License',
                entityId: licenseId,
                details: {
                    customPrice,
                    planPrice: license.plan?.price,
                    organisationName: license.organisation.name
                }
            });
        }
        catch (e) {
            console.error('Audit Log Error:', e);
        }
        res.json({
            message: customPrice === null ? 'Custom pricing removed' : 'Custom pricing set successfully',
            license
        });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.setCustomPrice = setCustomPrice;
const checkLicenseValidity = async (req, res) => {
    try {
        const orgId = (0, hierarchyUtils_1.getOrgId)(req.user);
        if (!orgId)
            return res.status(400).json({ message: 'No organisation' });
        const license = await prisma_1.default.license.findFirst({
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
            status: license?.status || 'expired',
            expiresAt: license?.endDate
        });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.checkLicenseValidity = checkLicenseValidity;
