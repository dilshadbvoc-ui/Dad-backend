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
exports.requireFeature = exports.checkUserLimit = exports.requireValidLicense = exports.dataIsolation = void 0;
const prisma_1 = __importDefault(require("../config/prisma"));
/**
 * Data Isolation Middleware
 * Ensures all queries are scoped to the user's organisation
 * This middleware adds org filtering to req for use in controllers
 */
const dataIsolation = (req, _res, next) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const user = req.user;
        if (!user) {
            return next(); // Let auth middleware handle this
        }
        // Add organisation filter to request for easy access in controllers
        // Prisma standard: Use organisationId
        req.orgFilter = user.organisationId
            ? { organisationId: user.organisationId }
            : {};
        // Super admins can bypass org filtering
        req.isSuperAdmin = user.role === 'super_admin';
        next();
    }
    catch (error) {
        next(error);
    }
});
exports.dataIsolation = dataIsolation;
/**
 * License Check Middleware
 * Verifies the organisation has a valid license before allowing access
 */
const requireValidLicense = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const user = req.user;
        if (!user || !user.organisationId) {
            return res.status(403).json({
                message: 'Organisation not found',
                code: 'NO_ORGANISATION'
            });
        }
        // Super admins bypass license check
        if (req.isSuperAdmin || user.role === 'super_admin') {
            return next();
        }
        const license = yield prisma_1.default.license.findFirst({
            where: {
                organisationId: user.organisationId,
                status: { in: ['active', 'trial'] },
                endDate: { gt: new Date() }
            },
            include: { plan: true }
        });
        if (!license) {
            return res.status(403).json({
                message: 'Your license has expired. Please renew to continue.',
                code: 'LICENSE_EXPIRED'
            });
        }
        // Add license info to request
        req.license = license;
        next();
    }
    catch (error) {
        next(error);
    }
});
exports.requireValidLicense = requireValidLicense;
/**
 * User Limit Check Middleware
 * Prevents adding users beyond the license limit
 */
const checkUserLimit = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const user = req.user;
        if (!user || !user.organisationId) {
            return next();
        }
        const license = yield prisma_1.default.license.findFirst({
            where: {
                organisationId: user.organisationId,
                status: { in: ['active', 'trial'] }
            }
        });
        if (!license) {
            return res.status(403).json({
                message: 'No active license found',
                code: 'NO_LICENSE'
            });
        }
        if (license.currentUsers >= license.maxUsers) {
            return res.status(403).json({
                message: `User limit reached (${license.maxUsers}). Please upgrade your plan.`,
                code: 'USER_LIMIT_REACHED'
            });
        }
        next();
    }
    catch (error) {
        next(error);
    }
});
exports.checkUserLimit = checkUserLimit;
/**
 * Feature Access Middleware
 * Checks if a specific feature is available in the current plan
 */
const requireFeature = (featureName) => {
    return (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
        try {
            const user = req.user;
            if (!user || !user.organisationId) {
                return res.status(403).json({ message: 'Organisation not found' });
            }
            // Super admins have all features
            if (req.isSuperAdmin || user.role === 'super_admin') {
                return next();
            }
            const license = yield prisma_1.default.license.findFirst({
                where: {
                    organisationId: user.organisationId,
                    status: { in: ['active', 'trial'] }
                },
                include: { plan: true }
            });
            if (!license || !license.plan) {
                return res.status(403).json({
                    message: 'No active license found',
                    code: 'NO_LICENSE'
                });
            }
            const plan = license.plan;
            if (!plan.features || !plan.features.includes(featureName)) {
                return res.status(403).json({
                    message: `This feature (${featureName}) is not available in your current plan.`,
                    code: 'FEATURE_NOT_AVAILABLE'
                });
            }
            next();
        }
        catch (error) {
            next(error);
        }
    });
};
exports.requireFeature = requireFeature;
