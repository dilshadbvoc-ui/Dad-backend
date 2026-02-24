"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSubordinates = exports.deleteTarget = exports.updateTarget = exports.recalculateProgress = exports.acknowledgeDailyNotification = exports.getDailyAchievement = exports.getTeamTargets = exports.getMyTargets = exports.assignTarget = void 0;
const prisma_1 = __importDefault(require("../config/prisma"));
const hierarchyUtils_1 = require("../utils/hierarchyUtils");
const auditLogger_1 = require("../utils/auditLogger");
const salesTargetService_1 = require("../services/salesTargetService");
// Helper: Get direct reports of a user
const getDirectReports = async (userId) => {
    return await prisma_1.default.user.findMany({
        where: { reportsToId: userId, isActive: true },
        select: { id: true, firstName: true, lastName: true }
    });
};
// Helper: Calculate period dates
const calculatePeriodDates = (period) => {
    const now = new Date();
    let startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    let endDate = new Date();
    switch (period) {
        case 'monthly':
            endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
            break;
        case 'quarterly': {
            const quarter = Math.floor(now.getMonth() / 3);
            startDate = new Date(now.getFullYear(), quarter * 3, 1);
            endDate = new Date(now.getFullYear(), quarter * 3 + 3, 0);
            break;
        }
        case 'yearly':
            startDate = new Date(now.getFullYear(), 0, 1);
            endDate = new Date(now.getFullYear(), 11, 31);
            break;
    }
    return { startDate, endDate };
};
// Assign target to a subordinate or team (with auto-distribution)
const assignTarget = async (req, res) => {
    try {
        const user = req.user;
        const { assignToUserId, teamId, targetValue, period, metric = 'revenue', productId, scope = 'HIERARCHY', opportunityType } = req.body; // Default to revenue & hierarchy (legacy support)
        const userOrgId = (0, hierarchyUtils_1.getOrgId)(user);
        if ((!assignToUserId && !teamId) || !targetValue || !period) {
            return res.status(400).json({ message: 'Either assignToUserId or teamId, plus targetValue and period are required' });
        }
        if (!userOrgId)
            return res.status(400).json({ message: 'Organisation not found' });
        // Validate Product if provided
        if (productId) {
            const product = await prisma_1.default.product.findUnique({ where: { id: productId } });
            if (!product)
                return res.status(400).json({ message: 'Product not found' });
        }
        const { startDate, endDate } = calculatePeriodDates(period);
        let mainTarget;
        const childTargets = [];
        // --- TEAM ASSIGNMENT ---
        if (teamId) {
            // Verify team existence
            const team = await prisma_1.default.team.findFirst({
                where: { id: teamId, organisationId: userOrgId },
                include: { members: true }
            });
            if (!team)
                return res.status(404).json({ message: 'Team not found' });
            // Check for existing team target
            const existingTeamTarget = await prisma_1.default.salesTarget.findFirst({
                where: {
                    teamId,
                    period,
                    metric,
                    productId: productId || null,
                    startDate,
                    endDate,
                    isDeleted: false,
                    opportunityType: opportunityType || null
                }
            });
            if (existingTeamTarget) {
                return res.status(400).json({ message: `Team already has an active ${metric} target for this period` });
            }
            // Create valid team target (assignedToId is null)
            mainTarget = await prisma_1.default.salesTarget.create({
                data: {
                    targetValue,
                    period,
                    metric,
                    startDate,
                    endDate,
                    teamId,
                    assignedById: user.id,
                    organisationId: userOrgId,
                    autoDistributed: true,
                    productId: productId || null,
                    opportunityType: opportunityType || null
                }
            });
            // Distribute to team members
            if (team.members.length > 0) {
                const distributedValue = Math.floor(targetValue / team.members.length);
                for (const member of team.members) {
                    // Check if member already has a target
                    const existingMemberTarget = await prisma_1.default.salesTarget.findFirst({
                        where: {
                            assignedToId: member.id,
                            period,
                            metric,
                            productId: productId || null,
                            startDate,
                            endDate,
                            isDeleted: false,
                            opportunityType: opportunityType || null
                        }
                    });
                    if (!existingMemberTarget) {
                        const childTarget = await prisma_1.default.salesTarget.create({
                            data: {
                                targetValue: distributedValue,
                                period,
                                metric,
                                startDate,
                                endDate,
                                assignedToId: member.id,
                                assignedById: user.id,
                                parentTargetId: mainTarget.id,
                                organisationId: userOrgId,
                                autoDistributed: true,
                                productId: productId || null,
                                opportunityType: opportunityType || null
                            }
                        });
                        childTargets.push(childTarget);
                        // Notify member
                        await prisma_1.default.notification.create({
                            data: {
                                recipientId: member.id,
                                title: 'New Team Sales Target Assigned',
                                message: `Your team "${team.name}" has been assigned a ${metric} target${opportunityType ? ` (${opportunityType})` : ''}. Your individual share is ${distributedValue.toLocaleString()}`,
                                type: 'info',
                                relatedResource: 'SalesTarget',
                                relatedId: childTarget.id
                            }
                        });
                    }
                }
            }
        }
        // --- INDIVIDUAL ASSIGNMENT ---
        else if (assignToUserId) {
            // Verify the assignee is a subordinate or user is admin
            const assignee = await prisma_1.default.user.findUnique({
                where: { id: assignToUserId }
            });
            if (!assignee)
                return res.status(404).json({ message: 'User not found' });
            if (assignee.organisationId !== userOrgId)
                return res.status(403).json({ message: 'Cannot assign target to crossover user' });
            // Check existing
            const existingTarget = await prisma_1.default.salesTarget.findFirst({
                where: {
                    assignedToId: assignToUserId,
                    period,
                    metric,
                    productId: productId || null,
                    startDate,
                    endDate,
                    isDeleted: false,
                    opportunityType: opportunityType || null
                }
            });
            if (existingTarget)
                return res.status(400).json({ message: `User already has an active ${metric} target for this period` });
            // Determine if distribution is needed
            const directReports = await getDirectReports(assignToUserId);
            const shouldDistribute = scope === 'HIERARCHY' && directReports.length > 0;
            // Create main target
            mainTarget = await prisma_1.default.salesTarget.create({
                data: {
                    targetValue,
                    period,
                    metric,
                    startDate,
                    endDate,
                    assignedToId: assignToUserId,
                    assignedById: user.id,
                    organisationId: userOrgId,
                    autoDistributed: shouldDistribute, // True only if Hierarchy AND has reports
                    productId: productId || null,
                    scope: scope,
                    opportunityType: opportunityType || null
                }
            });
            if (shouldDistribute) {
                // 1. Create SELF-CHILD for the manager (for personal sales)
                // We'll calculate share simply as equal share for now, or 0? 
                // Usually manager also sells. Let's give equal share.
                const totalMembers = directReports.length + 1;
                const distributedValue = Math.floor(targetValue / totalMembers);
                // Manager's Personal Target
                const selfChild = await prisma_1.default.salesTarget.create({
                    data: {
                        targetValue: distributedValue,
                        period,
                        metric,
                        startDate,
                        endDate,
                        assignedToId: assignToUserId,
                        assignedById: user.id,
                        parentTargetId: mainTarget.id,
                        organisationId: userOrgId,
                        autoDistributed: false, // Leaf
                        productId: productId || null,
                        scope: 'INDIVIDUAL',
                        opportunityType: opportunityType || null
                    }
                });
                childTargets.push(selfChild);
                // 2. Distribute to Reports
                for (const report of directReports) {
                    const existingSubTarget = await prisma_1.default.salesTarget.findFirst({
                        where: {
                            assignedToId: report.id,
                            period,
                            metric,
                            productId: productId || null,
                            startDate,
                            endDate,
                            isDeleted: false,
                            opportunityType: opportunityType || null
                        }
                    });
                    if (!existingSubTarget) {
                        // Recursively create targets
                        // distributeToSubordinates will handle creating the report's target and ITS children
                        await distributeToSubordinates(report.id, distributedValue, period, startDate, endDate, mainTarget.id, user.id, userOrgId, metric, productId, opportunityType);
                    }
                }
            }
            // Notification for Individual
            await prisma_1.default.notification.create({
                data: {
                    recipientId: assignToUserId,
                    title: 'New Sales Target Assigned',
                    message: `You have been assigned a ${period} sales target of ${targetValue.toLocaleString()}${opportunityType ? ` for ${opportunityType}` : ''}`,
                    type: 'info',
                    relatedResource: 'SalesTarget',
                    relatedId: mainTarget.id
                }
            });
        }
        await (0, auditLogger_1.logAudit)({
            organisationId: userOrgId,
            actorId: user.id,
            action: 'CREATE_SALES_TARGET',
            entity: 'SalesTarget',
            entityId: mainTarget.id,
            details: { period, targetValue, teamId, assignToUserId, opportunityType }
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
};
exports.assignTarget = assignTarget;
// Recursive helper to distribute targets down the hierarchy
const distributeToSubordinates = async (userId, targetValue, period, startDate, endDate, parentTargetId, assignerId, organisationId, metric, productId, opportunityType) => {
    // 1. Check if we should distribute further
    const directReports = await getDirectReports(userId);
    // 2. Create target for THIS user (userId) linked to parentTargetId
    // If they have reports, they get a CONTAINER target (auto=true) AND a SELF target
    // If they have no reports, they get a LEAF target (auto=false)
    const hasReports = directReports.length > 0;
    // Check existing (skip duplicate check for simplicity in helper, relying on caller logic usually, but here we must Create)
    // Actually this function was previously creating One child. Now we need to create the child for 'userId' first? 
    // Wait, the previous logic passed 'childTarget.id' as parentTargetId to the next level.
    // The previous logic created the child OUTSIDE, then called this to distribute FURTHER.
    // My new call signature in assignTarget simply calls this with mainTarget.id as parent.
    // Let's align:
    // This function receives `userId` (a subordinate). It should create a target for them under `parentTargetId`.
    // THEN, if they have reports, it should distribute further.
    const totalMembers = directReports.length + 1;
    // const distributedValueForThisUser = targetValue; // Removed unused variable
    // Wait, previous logic distributed the value BEFORE passing it.
    // Let's stick to: "Assign targetValue to userId, child of parentTargetId".
    const isContainer = hasReports;
    const myTarget = await prisma_1.default.salesTarget.create({
        data: {
            targetValue: targetValue,
            period,
            metric,
            startDate,
            endDate,
            assignedToId: userId,
            assignedById: assignerId,
            parentTargetId: parentTargetId,
            organisationId,
            autoDistributed: isContainer,
            productId: productId || null,
            scope: isContainer ? 'HIERARCHY' : 'INDIVIDUAL',
            opportunityType: opportunityType || null
        }
    });
    // Notify
    await prisma_1.default.notification.create({
        data: {
            recipientId: userId,
            title: 'New Sales Target Assigned',
            message: `You have been assigned a ${period} sales target of ${targetValue.toLocaleString()}`,
            type: 'info',
            relatedResource: 'SalesTarget',
            relatedId: myTarget.id
        }
    });
    if (hasReports) {
        // Distribute to self (Personal) and Children
        const childValue = Math.floor(targetValue / totalMembers);
        // Self Personal Child
        await prisma_1.default.salesTarget.create({
            data: {
                targetValue: childValue,
                period,
                metric,
                startDate,
                endDate,
                assignedToId: userId,
                assignedById: assignerId,
                parentTargetId: myTarget.id,
                organisationId,
                autoDistributed: false, // Leaf
                productId: productId || null,
                scope: 'INDIVIDUAL',
                opportunityType: opportunityType || null
            }
        });
        // Distribute to reports
        for (const report of directReports) {
            await distributeToSubordinates(report.id, childValue, period, startDate, endDate, myTarget.id, assignerId, organisationId, metric, productId, opportunityType);
        }
    }
};
// Get current user's targets
const getMyTargets = async (req, res) => {
    try {
        const user = req.user;
        const targets = await prisma_1.default.salesTarget.findMany({
            where: {
                assignedToId: user.id,
                isDeleted: false
            },
            include: {
                assignedBy: { select: { firstName: true, lastName: true } },
                product: true
            },
            orderBy: { createdAt: 'desc' }
        });
        res.json({ targets });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.getMyTargets = getMyTargets;
// Get team targets (hierarchical view)
const getTeamTargets = async (req, res) => {
    try {
        const user = req.user;
        // Get all subordinate IDs recursively
        const subordinateIds = await getSubordinateIdsRecursive(user.id);
        const targets = await prisma_1.default.salesTarget.findMany({
            where: {
                OR: [
                    { assignedToId: { in: [...subordinateIds, user.id] } },
                    { teamId: { not: null }, assignedById: user.id } // Include team targets created by user
                ],
                isDeleted: false
            },
            include: {
                assignedTo: { select: { firstName: true, lastName: true, email: true, position: true } },
                assignedBy: { select: { firstName: true, lastName: true } },
                team: { select: { name: true } },
                parentTarget: true,
                product: true
            },
            orderBy: { createdAt: 'desc' }
        });
        res.json({ targets });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.getTeamTargets = getTeamTargets;
// Helper: Get all subordinate IDs recursively
const getSubordinateIdsRecursive = async (userId) => {
    const subordinateIds = [];
    const queue = [userId];
    while (queue.length > 0) {
        const currentId = queue.shift();
        const directReports = await prisma_1.default.user.findMany({
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
};
// Get daily achievement summary for notification
const getDailyAchievement = async (req, res) => {
    try {
        const user = req.user;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        // Get active targets for the user
        const activeTargets = await prisma_1.default.salesTarget.findMany({
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
};
exports.getDailyAchievement = getDailyAchievement;
// Acknowledge daily notification
const acknowledgeDailyNotification = async (req, res) => {
    try {
        const user = req.user;
        // Find active activeTargets
        const activeTargets = await prisma_1.default.salesTarget.findMany({
            where: {
                assignedToId: user.id,
                status: 'active',
                isDeleted: false,
                startDate: { lte: new Date() },
                endDate: { gte: new Date() }
            }
        });
        if (activeTargets.length > 0) {
            await prisma_1.default.salesTarget.update({
                where: { id: activeTargets[0].id },
                data: { lastNotifiedDate: new Date() }
            });
        }
        res.json({ success: true });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.acknowledgeDailyNotification = acknowledgeDailyNotification;
// Recalculate progress from closed_won opportunities
const recalculateProgress = async (req, res) => {
    try {
        const user = req.user;
        const orgId = (0, hierarchyUtils_1.getOrgId)(user);
        if (!orgId)
            return res.status(400).json({ message: 'Organisation not found' });
        // Get all users in the organisation
        const users = await prisma_1.default.user.findMany({
            where: { organisationId: orgId, isActive: true },
            select: { id: true }
        });
        console.log(`[Recalculate] Triggered by ${user.id} for ${users.length} users.`);
        for (const u of users) {
            await salesTargetService_1.SalesTargetService.updateProgressForUser(u.id);
        }
        res.json({ message: 'Progress recalculated successfully' });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.recalculateProgress = recalculateProgress;
// Update target
const updateTarget = async (req, res) => {
    try {
        const user = req.user;
        const orgId = (0, hierarchyUtils_1.getOrgId)(user);
        const { id } = req.params;
        const { targetValue, period, metric, productId, opportunityType } = req.body;
        if (!orgId)
            return res.status(400).json({ message: 'Organisation not found' });
        const target = await prisma_1.default.salesTarget.findFirst({
            where: { id, organisationId: orgId, isDeleted: false }
        });
        if (!target)
            return res.status(404).json({ message: 'Target not found' });
        // Update fields
        const updateData = {};
        if (targetValue)
            updateData.targetValue = targetValue;
        // If period changes, recalculate dates
        if (period) {
            const { startDate, endDate } = calculatePeriodDates(period);
            updateData.period = period;
            updateData.startDate = startDate;
            updateData.endDate = endDate;
        }
        if (metric)
            updateData.metric = metric;
        if (productId !== undefined)
            updateData.productId = productId || null;
        if (opportunityType !== undefined)
            updateData.opportunityType = opportunityType || null;
        const updatedTarget = await prisma_1.default.salesTarget.update({
            where: { id },
            data: updateData
        });
        await (0, auditLogger_1.logAudit)({
            organisationId: orgId,
            actorId: user.id,
            action: 'UPDATE_SALES_TARGET',
            entity: 'SalesTarget',
            entityId: id,
            details: { targetValue, period, metric, productId, opportunityType }
        });
        res.json({ message: 'Target updated successfully', target: updatedTarget });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.updateTarget = updateTarget;
// Delete target
const deleteTarget = async (req, res) => {
    try {
        const user = req.user;
        const orgId = (0, hierarchyUtils_1.getOrgId)(user);
        if (!orgId && user.role !== 'super_admin') {
            return res.status(403).json({ message: 'Organisation not found' });
        }
        const target = await prisma_1.default.salesTarget.update({
            where: {
                id: req.params.id,
                ...(orgId ? { organisationId: orgId } : {})
            },
            data: { isDeleted: true }
        });
        await (0, auditLogger_1.logAudit)({
            organisationId: orgId || target.organisationId,
            actorId: user.id,
            action: 'DELETE_SALES_TARGET',
            entity: 'SalesTarget',
            entityId: req.params.id
        });
        // Also delete child targets
        await prisma_1.default.salesTarget.updateMany({
            where: {
                parentTargetId: req.params.id,
                ...(orgId ? { organisationId: orgId } : {})
            },
            data: { isDeleted: true }
        });
        res.json({ message: 'Target deleted successfully' });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.deleteTarget = deleteTarget;
// Get subordinates for assignment dropdown
const getSubordinates = async (req, res) => {
    try {
        const user = req.user;
        const subordinates = await getDirectReports(user.id);
        res.json({ subordinates });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.getSubordinates = getSubordinates;
//# sourceMappingURL=salesTargetController.js.map