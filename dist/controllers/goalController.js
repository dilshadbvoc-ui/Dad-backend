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
exports.recalculateGoal = exports.deleteGoal = exports.updateGoal = exports.createGoal = exports.getGoals = void 0;
const prisma_1 = __importDefault(require("../config/prisma"));
const hierarchyUtils_1 = require("../utils/hierarchyUtils");
const auditLogger_1 = require("../utils/auditLogger");
const getGoals = async (req, res) => {
    try {
        const user = req.user;
        const orgId = (0, hierarchyUtils_1.getOrgId)(user);
        if (!orgId) {
            return res.status(400).json({ message: 'Organisation not found' });
        }
        const where = {
            organisationId: orgId,
            isDeleted: false
        };
        // 1. Hierarchy Visibility
        if (user.role !== 'super_admin' && user.role !== 'admin') {
            const subordinateIds = await (0, hierarchyUtils_1.getSubordinateIds)(user.id);
            // Show goals assigned to self OR subordinates
            where.assignedToId = { in: [...subordinateIds, user.id] };
        }
        const goals = await prisma_1.default.goal.findMany({
            where,
            include: {
                assignedTo: { select: { firstName: true, lastName: true } }
            },
            orderBy: { createdAt: 'desc' }
        });
        res.json({ goals });
    }
    catch (error) {
        console.error('getGoals Error:', error);
        res.status(500).json({ message: error.message });
    }
};
exports.getGoals = getGoals;
const createGoal = async (req, res) => {
    try {
        const user = req.user;
        const orgId = (0, hierarchyUtils_1.getOrgId)(user);
        if (!orgId)
            return res.status(400).json({ message: 'Organisation not found' });
        // Calculate dates based on period
        const now = new Date();
        const startDate = now;
        const endDate = new Date();
        switch (req.body.period) {
            case 'weekly':
                endDate.setDate(now.getDate() + 7);
                break;
            case 'monthly':
                endDate.setMonth(now.getMonth() + 1);
                break;
            case 'quarterly':
                endDate.setMonth(now.getMonth() + 3);
                break;
            case 'yearly':
                endDate.setFullYear(now.getFullYear() + 1);
                break;
            default:
                endDate.setMonth(now.getMonth() + 1);
        }
        const goal = await prisma_1.default.goal.create({
            data: {
                description: req.body.description || undefined,
                type: req.body.type || 'manual',
                targetValue: req.body.targetValue,
                currentValue: req.body.currentValue || 0,
                period: req.body.period,
                status: 'active',
                startDate,
                endDate,
                organisationId: orgId,
                createdById: user.id,
                assignedToId: req.body.assignedToId || user.id
            }
        });
        // Initial progress update if not manual
        if (goal.type !== 'manual') {
            const { GoalService } = await Promise.resolve().then(() => __importStar(require('../services/GoalService')));
            await GoalService.updateProgressForUser(goal.assignedToId, goal.type);
        }
        await (0, auditLogger_1.logAudit)({
            organisationId: orgId,
            actorId: user.id,
            action: 'CREATE_GOAL',
            entity: 'Goal',
            entityId: goal.id,
            details: { type: goal.type, targetValue: goal.targetValue }
        });
        res.status(201).json(goal);
    }
    catch (error) {
        console.error('createGoal Error:', error);
        res.status(400).json({ message: error.message });
    }
};
exports.createGoal = createGoal;
const updateGoal = async (req, res) => {
    try {
        const user = req.user;
        const orgId = (0, hierarchyUtils_1.getOrgId)(user);
        if (!orgId)
            return res.status(400).json({ message: 'Organisation not found' });
        const { id } = req.params;
        const updates = { ...req.body };
        const goal = await prisma_1.default.goal.findFirst({
            where: {
                id,
                organisationId: orgId
            }
        });
        if (!goal)
            return res.status(404).json({ message: 'Goal not found' });
        if (updates.currentValue !== undefined) {
            const targetVal = updates.targetValue !== undefined ? updates.targetValue : goal.targetValue;
            updates.achievementPercent = Math.round((updates.currentValue / targetVal) * 100);
            if (updates.currentValue >= targetVal && goal.status === 'active') {
                updates.status = 'completed';
                updates.completedAt = new Date();
            }
        }
        const updatedGoal = await prisma_1.default.goal.update({
            where: { id },
            data: updates
        });
        await (0, auditLogger_1.logAudit)({
            organisationId: orgId,
            actorId: user.id,
            action: 'UPDATE_GOAL',
            entity: 'Goal',
            entityId: updatedGoal.id,
            details: { updatedFields: Object.keys(updates) }
        });
        res.json(updatedGoal);
    }
    catch (error) {
        console.error('updateGoal Error:', error);
        res.status(500).json({ message: error.message });
    }
};
exports.updateGoal = updateGoal;
const deleteGoal = async (req, res) => {
    try {
        const user = req.user;
        const orgId = (0, hierarchyUtils_1.getOrgId)(user);
        if (!orgId)
            return res.status(400).json({ message: 'Organisation not found' });
        await prisma_1.default.goal.update({
            where: {
                id: req.params.id,
                organisationId: orgId
            },
            data: { isDeleted: true }
        });
        await (0, auditLogger_1.logAudit)({
            organisationId: orgId,
            actorId: user.id,
            action: 'DELETE_GOAL',
            entity: 'Goal',
            entityId: req.params.id
        });
        res.json({ message: 'Goal deleted' });
    }
    catch (error) {
        if (error.code === 'P2025')
            return res.status(404).json({ message: 'Goal not found' });
        res.status(500).json({ message: error.message });
    }
};
exports.deleteGoal = deleteGoal;
const recalculateGoal = async (req, res) => {
    try {
        const user = req.user;
        const orgId = (0, hierarchyUtils_1.getOrgId)(user);
        if (!orgId)
            return res.status(400).json({ message: 'Organisation not found' });
        const { id } = req.params;
        const goal = await prisma_1.default.goal.findFirst({
            where: {
                id,
                organisationId: orgId
            }
        });
        if (!goal)
            return res.status(404).json({ message: 'Goal not found' });
        if (goal.type === 'manual') {
            return res.status(400).json({ message: 'Cannot automatically recalculate manual goals' });
        }
        const { GoalService } = await Promise.resolve().then(() => __importStar(require('../services/GoalService')));
        await GoalService.updateProgressForUser(goal.assignedToId, goal.type);
        const updatedGoal = await prisma_1.default.goal.findUnique({ where: { id } });
        res.json(updatedGoal);
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.recalculateGoal = recalculateGoal;
