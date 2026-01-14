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
exports.deleteGoal = exports.updateGoal = exports.createGoal = exports.getGoals = void 0;
const prisma_1 = __importDefault(require("../config/prisma"));
const hierarchyUtils_1 = require("../utils/hierarchyUtils");
const hierarchyUtils_2 = require("../utils/hierarchyUtils");
const getGoals = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const user = req.user;
        const orgId = (0, hierarchyUtils_2.getOrgId)(user);
        if (!orgId) {
            return res.status(400).json({ message: 'Organisation not found' });
        }
        const where = {
            organisationId: orgId,
            isDeleted: false
        };
        // 1. Hierarchy Visibility
        if (user.role !== 'super_admin' && user.role !== 'admin') {
            const subordinateIds = yield (0, hierarchyUtils_1.getSubordinateIds)(user.id);
            // Show goals assigned to self OR subordinates
            where.assignedToId = { in: [...subordinateIds, user.id] };
        }
        else {
            // Admin/Super Admin see all in org (already filtered by organisationId)
            // Unless specifically filtering by user? API didn't seem to support it explicitly before other than auth context.
            // Kept simple as per original logic.
        }
        const goals = yield prisma_1.default.goal.findMany({
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
});
exports.getGoals = getGoals;
const createGoal = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const user = req.user;
        const orgId = (0, hierarchyUtils_2.getOrgId)(user);
        // Calculate dates based on period
        const now = new Date();
        let startDate = now;
        let endDate = new Date();
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
        const goal = yield prisma_1.default.goal.create({
            data: {
                description: req.body.description || undefined,
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
        res.status(201).json(goal);
    }
    catch (error) {
        console.error('createGoal Error:', error);
        res.status(400).json({ message: error.message });
    }
});
exports.createGoal = createGoal;
const updateGoal = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const updates = Object.assign({}, req.body);
        // Recalculate achievement percent if currentValue changes
        // Note: Prisma update can be done in one go if we fetch first, or just trust client? 
        // Better to fetch to calculate percent correctly.
        let goal = yield prisma_1.default.goal.findUnique({ where: { id } });
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
        const updatedGoal = yield prisma_1.default.goal.update({
            where: { id },
            data: updates
        });
        res.json(updatedGoal);
    }
    catch (error) {
        console.error('updateGoal Error:', error);
        res.status(500).json({ message: error.message });
    }
});
exports.updateGoal = updateGoal;
const deleteGoal = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const goal = yield prisma_1.default.goal.update({
            where: { id: req.params.id },
            data: { isDeleted: true }
        });
        res.json({ message: 'Goal deleted' });
    }
    catch (error) {
        // Prisma error P2025 means record not found
        if (error.code === 'P2025') {
            return res.status(404).json({ message: 'Goal not found' });
        }
        res.status(500).json({ message: error.message });
    }
});
exports.deleteGoal = deleteGoal;
