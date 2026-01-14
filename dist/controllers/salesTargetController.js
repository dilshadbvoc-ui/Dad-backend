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
exports.getSubordinates = exports.deleteTarget = exports.recalculateProgress = exports.acknowledgeDailyNotification = exports.getDailyAchievement = exports.getTeamTargets = exports.getMyTargets = exports.assignTarget = void 0;
const prisma_1 = __importDefault(require("../config/prisma"));
const hierarchyUtils_1 = require("../utils/hierarchyUtils");
// Helper: Get direct reports of a user
const getDirectReports = (userId) => __awaiter(void 0, void 0, void 0, function* () {
    return yield prisma_1.default.user.findMany({
        where: { reportsToId: userId, isActive: true },
        select: { id: true, firstName: true, lastName: true }
    });
});
// Helper: Calculate period dates
const calculatePeriodDates = (period) => {
    const now = new Date();
    let startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    let endDate = new Date();
    switch (period) {
        case 'monthly':
            endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
            break;
        case 'quarterly':
            const quarter = Math.floor(now.getMonth() / 3);
            startDate = new Date(now.getFullYear(), quarter * 3, 1);
            endDate = new Date(now.getFullYear(), quarter * 3 + 3, 0);
            break;
        case 'yearly':
            startDate = new Date(now.getFullYear(), 0, 1);
            endDate = new Date(now.getFullYear(), 11, 31);
            break;
    }
    return { startDate, endDate };
};
// Assign target to a subordinate (with auto-distribution)
const assignTarget = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const user = req.user;
        const { assignToUserId, targetValue, period } = req.body;
        const userOrgId = (0, hierarchyUtils_1.getOrgId)(user);
        if (!assignToUserId || !targetValue || !period) {
            return res.status(400).json({ message: 'assignToUserId, targetValue, and period are required' });
        }
        if (!userOrgId)
            return res.status(400).json({ message: 'Organisation not found' });
        // Verify the assignee is a subordinate or user is admin
        const assignee = yield prisma_1.default.user.findUnique({
            where: { id: assignToUserId }
        });
        if (!assignee) {
            return res.status(404).json({ message: 'User not found' });
        }
        if (assignee.organisationId !== userOrgId) {
            return res.status(403).json({ message: 'Cannot assign target to user in different organisation' });
        }
        const { startDate, endDate } = calculatePeriodDates(period);
        // Check for existing active target in the same period
        const existingTarget = yield prisma_1.default.salesTarget.findFirst({
            where: {
                assignedToId: assignToUserId,
                period,
                startDate,
                endDate,
                isDeleted: false
            }
        });
        if (existingTarget) {
            return res.status(400).json({ message: 'User already has an active target for this period' });
        }
        // Create the main target
        const mainTarget = yield prisma_1.default.salesTarget.create({
            data: {
                targetValue,
                period,
                startDate,
                endDate,
                assignedToId: assignToUserId,
                assignedById: user.id,
                organisationId: userOrgId,
                autoDistributed: false
            }
        });
        // Get direct reports of the assignee
        const directReports = yield getDirectReports(assignToUserId);
        const childTargets = [];
        // Auto-distribute to subordinates
        if (directReports.length > 0) {
            const distributedValue = Math.floor(targetValue / directReports.length);
            for (const report of directReports) {
                // Check if subordinate already has a target
                const existingSubTarget = yield prisma_1.default.salesTarget.findFirst({
                    where: {
                        assignedToId: report.id,
                        period,
                        startDate,
                        endDate,
                        isDeleted: false
                    }
                });
                if (!existingSubTarget) {
                    const childTarget = yield prisma_1.default.salesTarget.create({
                        data: {
                            targetValue: distributedValue,
                            period,
                            startDate,
                            endDate,
                            assignedToId: report.id,
                            assignedById: user.id,
                            parentTargetId: mainTarget.id,
                            organisationId: userOrgId,
                            autoDistributed: true
                        }
                    });
                    childTargets.push(childTarget);
                    // Recursively distribute to their subordinates
                    yield distributeToSubordinates(report.id, distributedValue, period, startDate, endDate, childTarget.id, user.id, userOrgId);
                }
            }
        }
        // Create notification for the assignee
        yield prisma_1.default.notification.create({
            data: {
                recipientId: assignToUserId,
                title: 'New Sales Target Assigned',
                message: `You have been assigned a ${period} sales target of ${targetValue.toLocaleString()}`,
                type: 'info',
                relatedResource: 'SalesTarget',
                relatedId: mainTarget.id
            }
        });
        res.status(201).json({
            message: 'Target assigned successfully',
            target: mainTarget,
            childTargets
        });
    }
    catch (error) {
        console.error('assignTarget Error:', error);
        res.status(500).json({ message: error.message });
    }
});
exports.assignTarget = assignTarget;
// Recursive helper to distribute targets down the hierarchy
const distributeToSubordinates = (userId, targetValue, period, startDate, endDate, parentTargetId, assignerId, organisationId) => __awaiter(void 0, void 0, void 0, function* () {
    const directReports = yield getDirectReports(userId);
    if (directReports.length === 0)
        return;
    const distributedValue = Math.floor(targetValue / directReports.length);
    for (const report of directReports) {
        const existingTarget = yield prisma_1.default.salesTarget.findFirst({
            where: {
                assignedToId: report.id,
                period,
                startDate,
                endDate,
                isDeleted: false
            }
        });
        if (!existingTarget) {
            const childTarget = yield prisma_1.default.salesTarget.create({
                data: {
                    targetValue: distributedValue,
                    period,
                    startDate,
                    endDate,
                    assignedToId: report.id,
                    assignedById: assignerId,
                    parentTargetId: parentTargetId,
                    organisationId: organisationId,
                    autoDistributed: true
                }
            });
            // Notify subordinate
            yield prisma_1.default.notification.create({
                data: {
                    recipientId: report.id,
                    title: 'New Sales Target Assigned',
                    message: `You have been assigned a ${period} sales target of ${distributedValue.toLocaleString()}`,
                    type: 'info',
                    relatedResource: 'SalesTarget',
                    relatedId: childTarget.id
                }
            });
            // Continue recursion
            yield distributeToSubordinates(report.id, distributedValue, period, startDate, endDate, childTarget.id, assignerId, organisationId);
        }
    }
});
// Get current user's targets
const getMyTargets = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const user = req.user;
        const targets = yield prisma_1.default.salesTarget.findMany({
            where: {
                assignedToId: user.id,
                isDeleted: false
            },
            include: {
                assignedBy: { select: { firstName: true, lastName: true } }
            },
            orderBy: { createdAt: 'desc' }
        });
        res.json({ targets });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
});
exports.getMyTargets = getMyTargets;
// Get team targets (hierarchical view)
const getTeamTargets = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const user = req.user;
        // Get all subordinate IDs recursively
        const subordinateIds = yield getSubordinateIdsRecursive(user.id);
        const targets = yield prisma_1.default.salesTarget.findMany({
            where: {
                assignedToId: { in: [...subordinateIds, user.id] },
                isDeleted: false
            },
            include: {
                assignedTo: { select: { firstName: true, lastName: true, email: true, position: true } },
                assignedBy: { select: { firstName: true, lastName: true } },
                parentTarget: true
            },
            orderBy: { createdAt: 'desc' }
        });
        res.json({ targets });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
});
exports.getTeamTargets = getTeamTargets;
// Helper: Get all subordinate IDs recursively
const getSubordinateIdsRecursive = (userId) => __awaiter(void 0, void 0, void 0, function* () {
    const subordinateIds = [];
    const queue = [userId];
    while (queue.length > 0) {
        const currentId = queue.shift();
        const directReports = yield prisma_1.default.user.findMany({
            where: { reportsToId: currentId, isActive: true },
            select: { id: true }
        });
        for (const report of directReports) {
            const reportId = report.id;
            if (!subordinateIds.includes(reportId)) {
                subordinateIds.push(reportId);
                queue.push(reportId);
            }
        }
    }
    return subordinateIds;
});
// Get daily achievement summary for notification
const getDailyAchievement = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const user = req.user;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        // Get active targets for the user
        const activeTargets = yield prisma_1.default.salesTarget.findMany({
            where: {
                assignedToId: user.id,
                status: 'active',
                isDeleted: false,
                startDate: { lte: new Date() },
                endDate: { gte: new Date() }
            }
        });
        if (activeTargets.length === 0) {
            return res.json({ hasTarget: false });
        }
        const target = activeTargets[0]; // Primary active target
        // Check if already notified today
        const alreadyNotified = target.lastNotifiedDate &&
            new Date(target.lastNotifiedDate).toDateString() === today.toDateString();
        // Calculate days remaining
        const daysRemaining = Math.ceil((new Date(target.endDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
        // Calculate achievement percentage
        const achievementPercent = target.targetValue > 0
            ? Math.round((target.achievedValue / target.targetValue) * 100)
            : 0;
        res.json({
            hasTarget: true,
            showNotification: !alreadyNotified,
            target: {
                _id: target.id,
                targetValue: target.targetValue,
                achievedValue: target.achievedValue,
                achievementPercent,
                period: target.period,
                daysRemaining,
                amountRemaining: Math.max(0, target.targetValue - target.achievedValue)
            }
        });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
});
exports.getDailyAchievement = getDailyAchievement;
// Acknowledge daily notification
const acknowledgeDailyNotification = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const user = req.user;
        // Find active activeTargets
        const activeTargets = yield prisma_1.default.salesTarget.findMany({
            where: {
                assignedToId: user.id,
                status: 'active',
                isDeleted: false,
                startDate: { lte: new Date() },
                endDate: { gte: new Date() }
            }
        });
        if (activeTargets.length > 0) {
            yield prisma_1.default.salesTarget.update({
                where: { id: activeTargets[0].id },
                data: { lastNotifiedDate: new Date() }
            });
        }
        res.json({ success: true });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
});
exports.acknowledgeDailyNotification = acknowledgeDailyNotification;
// Recalculate progress from closed_won opportunities
const recalculateProgress = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const user = req.user;
        const orgId = (0, hierarchyUtils_1.getOrgId)(user);
        // Import service
        const { SalesTargetService } = yield Promise.resolve().then(() => __importStar(require('../services/SalesTargetService')));
        if (!orgId)
            return res.status(400).json({ message: 'Organisation not found' });
        // Get all users in the organisation
        const users = yield prisma_1.default.user.findMany({
            where: { organisationId: orgId, isActive: true },
            select: { id: true }
        });
        console.log(`[Recalculate] Triggered by ${user.id} for ${users.length} users.`);
        for (const u of users) {
            yield SalesTargetService.updateProgressForUser(u.id);
        }
        res.json({ message: 'Progress recalculated successfully' });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
});
exports.recalculateProgress = recalculateProgress;
// Delete target
const deleteTarget = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const target = yield prisma_1.default.salesTarget.update({
            where: { id: req.params.id },
            data: { isDeleted: true }
        });
        if (!target) {
            return res.status(404).json({ message: 'Target not found' });
        }
        // Also delete child targets
        yield prisma_1.default.salesTarget.updateMany({
            where: { parentTargetId: req.params.id },
            data: { isDeleted: true }
        });
        res.json({ message: 'Target deleted successfully' });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
});
exports.deleteTarget = deleteTarget;
// Get subordinates for assignment dropdown
const getSubordinates = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const user = req.user;
        const subordinates = yield getDirectReports(user.id);
        res.json({ subordinates });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
});
exports.getSubordinates = getSubordinates;
