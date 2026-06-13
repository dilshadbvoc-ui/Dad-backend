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
exports.getAuditLogs = void 0;
const prisma_1 = __importDefault(require("../config/prisma"));
const roleUtils_1 = require("../utils/roleUtils");
const getAuditLogs = async (req, res) => {
    try {
        const user = req.user;
        const { entity, action, userId, startDate, endDate, page = 1, limit = 20, branchId } = req.query;
        const userIsSuperAdmin = (0, roleUtils_1.isSuperAdmin)(user);
        const isOrgAdmin = (0, roleUtils_1.isOrgAdmin)(user);
        const isManager = (0, roleUtils_1.isManager)(user);
        if (!userIsSuperAdmin && !isOrgAdmin && !isManager) {
            return res.status(403).json({ message: 'Access denied: Audit logs are only available to admins and managers.' });
        }
        const where = {};
        // 1. ORGANISATION ISOLATION
        if (!userIsSuperAdmin) {
            if (!user.organisationId) {
                return res.status(400).json({ message: 'Organisation not found' });
            }
            where.organisationId = user.organisationId;
        }
        else {
            // Super Admin can view specific org if requested, otherwise defaults to all or their own
            const targetOrgId = req.query.organisationId || user.organisationId;
            if (targetOrgId) {
                where.organisationId = String(targetOrgId);
            }
        }
        // 2. HIERARCHY FILTERING - Users should not see activities from people above them
        if (!userIsSuperAdmin) {
            const { getVisibleUserIds } = await Promise.resolve().then(() => __importStar(require('../utils/hierarchyUtils')));
            const visibleUserIds = await getVisibleUserIds(user.id);
            // Limit actor to self or subordinates (not superiors)
            where.actorId = { in: visibleUserIds };
        }
        // 3. BRANCH ISOLATION (Optional but enforced for non-admins)
        if (user.branchId && !isOrgAdmin && !userIsSuperAdmin) {
            // Ensure they only see activities from their own branch
            where.actor = {
                ...where.actor,
                branchId: user.branchId
            };
        }
        else if (req.query.branchId && (isOrgAdmin || userIsSuperAdmin)) {
            // Admins can explicitly filter by branch
            where.actor = {
                ...where.actor,
                branchId: String(req.query.branchId)
            };
        }
        // 4. EXPLICIT FILTERS
        if (entity)
            where.entity = String(entity);
        if (action) {
            const actionStr = String(action).toUpperCase();
            if (actionStr === 'CREATED' || actionStr === 'CREATE') {
                where.action = { startsWith: 'CREATE' };
            }
            else if (actionStr === 'UPDATED' || actionStr === 'UPDATE') {
                where.action = { startsWith: 'UPDATE' };
            }
            else if (actionStr === 'DELETED' || actionStr === 'DELETE') {
                where.action = { startsWith: 'DELETE' };
            }
            else if (actionStr === 'LOGGED IN' || actionStr === 'LOGIN') {
                where.action = 'LOGIN';
            }
            else if (actionStr === 'LOGGED OUT' || actionStr === 'LOGOUT') {
                where.action = 'LOGOUT';
            }
            else {
                where.action = String(action);
            }
        }
        if (userId) {
            const targetUserId = String(userId);
            // Security Check: If requesting a specific user, ensure they are in the allowed hierarchy
            if (where.actorId && where.actorId.in && !where.actorId.in.includes(targetUserId)) {
                return res.status(403).json({ message: 'Not authorized to view logs for this user' });
            }
            where.actorId = targetUserId;
        }
        if (startDate || endDate) {
            where.createdAt = {};
            if (startDate)
                where.createdAt.gte = new Date(String(startDate));
            if (endDate)
                where.createdAt.lte = new Date(String(endDate));
        }
        const skip = (Number(page) - 1) * Number(limit);
        const logs = await prisma_1.default.auditLog.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            take: Number(limit),
            skip,
            include: {
                actor: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                        email: true,
                        role: true,
                        branch: { select: { name: true } }
                    }
                }
            }
        });
        const total = await prisma_1.default.auditLog.count({ where });
        res.json({
            logs,
            pagination: {
                total,
                page: Number(page),
                limit: Number(limit),
                pages: Math.ceil(total / Number(limit))
            }
        });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.getAuditLogs = getAuditLogs;
