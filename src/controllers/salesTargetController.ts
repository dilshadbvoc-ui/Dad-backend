import { Request, Response } from 'express';
import prisma from '../config/prisma';
import { getOrgId } from '../utils/hierarchyUtils';
import { Prisma } from '../generated/client';

// Helper: Get direct reports of a user
const getDirectReports = async (userId: string): Promise<any[]> => {
    return await prisma.user.findMany({
        where: { reportsToId: userId, isActive: true },
        select: { id: true, firstName: true, lastName: true }
    });
};

// Helper: Calculate period dates
const calculatePeriodDates = (period: string): { startDate: Date; endDate: Date } => {
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

// Assign target to a subordinate (with auto-distribution)
export const assignTarget = async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const { assignToUserId, targetValue, period } = req.body;
        const userOrgId = getOrgId(user);

        if (!assignToUserId || !targetValue || !period) {
            return res.status(400).json({ message: 'assignToUserId, targetValue, and period are required' });
        }

        if (!userOrgId) return res.status(400).json({ message: 'Organisation not found' });

        // Verify the assignee is a subordinate or user is admin
        const assignee = await prisma.user.findUnique({
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
        const existingTarget = await prisma.salesTarget.findFirst({
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
        const mainTarget = await prisma.salesTarget.create({
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
        const directReports = await getDirectReports(assignToUserId);
        const childTargets = [];

        // Auto-distribute to subordinates
        if (directReports.length > 0) {
            const distributedValue = Math.floor(targetValue / directReports.length);

            for (const report of directReports) {
                // Check if subordinate already has a target
                const existingSubTarget = await prisma.salesTarget.findFirst({
                    where: {
                        assignedToId: report.id,
                        period,
                        startDate,
                        endDate,
                        isDeleted: false
                    }
                });

                if (!existingSubTarget) {
                    const childTarget = await prisma.salesTarget.create({
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
                    await distributeToSubordinates(report.id, distributedValue, period, startDate, endDate, childTarget.id, user.id, userOrgId);
                }
            }
        }

        // Create notification for the assignee
        await prisma.notification.create({
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
    } catch (error) {
        console.error('assignTarget Error:', error);
        res.status(500).json({ message: (error as Error).message });
    }
};

// Recursive helper to distribute targets down the hierarchy
const distributeToSubordinates = async (
    userId: string,
    targetValue: number,
    period: string,
    startDate: Date,
    endDate: Date,
    parentTargetId: string,
    assignerId: string,
    organisationId: string
) => {
    const directReports = await getDirectReports(userId);

    if (directReports.length === 0) return;

    const distributedValue = Math.floor(targetValue / directReports.length);

    for (const report of directReports) {
        const existingTarget = await prisma.salesTarget.findFirst({
            where: {
                assignedToId: report.id,
                period,
                startDate,
                endDate,
                isDeleted: false
            }
        });

        if (!existingTarget) {
            const childTarget = await prisma.salesTarget.create({
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
            await prisma.notification.create({
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
            await distributeToSubordinates(report.id, distributedValue, period, startDate, endDate, childTarget.id, assignerId, organisationId);
        }
    }
};

// Get current user's targets
export const getMyTargets = async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;

        const targets = await prisma.salesTarget.findMany({
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
    } catch (error) {
        res.status(500).json({ message: (error as Error).message });
    }
};

// Get team targets (hierarchical view)
export const getTeamTargets = async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;

        // Get all subordinate IDs recursively
        const subordinateIds = await getSubordinateIdsRecursive(user.id);

        const targets = await prisma.salesTarget.findMany({
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
    } catch (error) {
        res.status(500).json({ message: (error as Error).message });
    }
};

// Helper: Get all subordinate IDs recursively
const getSubordinateIdsRecursive = async (userId: string): Promise<string[]> => {
    const subordinateIds: string[] = [];
    const queue: string[] = [userId];

    while (queue.length > 0) {
        const currentId = queue.shift()!;
        const directReports = await prisma.user.findMany({
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
export const getDailyAchievement = async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // Get active targets for the user
        const activeTargets = await prisma.salesTarget.findMany({
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
    } catch (error) {
        res.status(500).json({ message: (error as Error).message });
    }
};

// Acknowledge daily notification
export const acknowledgeDailyNotification = async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;

        // Find active activeTargets
        const activeTargets = await prisma.salesTarget.findMany({
            where: {
                assignedToId: user.id,
                status: 'active',
                isDeleted: false,
                startDate: { lte: new Date() },
                endDate: { gte: new Date() }
            }
        });

        if (activeTargets.length > 0) {
            await prisma.salesTarget.update({
                where: { id: activeTargets[0].id },
                data: { lastNotifiedDate: new Date() }
            });
        }

        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ message: (error as Error).message });
    }
};

// Recalculate progress from closed_won opportunities
export const recalculateProgress = async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const orgId = getOrgId(user);

        // Import service
        const { SalesTargetService } = await import('../services/SalesTargetService');

        if (!orgId) return res.status(400).json({ message: 'Organisation not found' });

        // Get all users in the organisation
        const users = await prisma.user.findMany({
            where: { organisationId: orgId, isActive: true },
            select: { id: true }
        });

        console.log(`[Recalculate] Triggered by ${user.id} for ${users.length} users.`);

        for (const u of users) {
            await SalesTargetService.updateProgressForUser(u.id);
        }

        res.json({ message: 'Progress recalculated successfully' });
    } catch (error) {
        res.status(500).json({ message: (error as Error).message });
    }
};

// Delete target
export const deleteTarget = async (req: Request, res: Response) => {
    try {
        const target = await prisma.salesTarget.update({
            where: { id: req.params.id },
            data: { isDeleted: true }
        });

        if (!target) {
            return res.status(404).json({ message: 'Target not found' });
        }

        // Also delete child targets
        await prisma.salesTarget.updateMany({
            where: { parentTargetId: req.params.id },
            data: { isDeleted: true }
        });

        res.json({ message: 'Target deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: (error as Error).message });
    }
};

// Get subordinates for assignment dropdown
export const getSubordinates = async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const subordinates = await getDirectReports(user.id);
        res.json({ subordinates });
    } catch (error) {
        res.status(500).json({ message: (error as Error).message });
    }
};
