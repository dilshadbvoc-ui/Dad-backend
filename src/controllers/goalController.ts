import { Request, Response } from 'express';
import prisma from '../config/prisma';
import { getSubordinateIds } from '../utils/hierarchyUtils';
import { getOrgId } from '../utils/hierarchyUtils';

export const getGoals = async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const orgId = getOrgId(user);

        if (!orgId) {
            return res.status(400).json({ message: 'Organisation not found' });
        }

        const where: any = {
            organisationId: orgId,
            isDeleted: false
        };

        // 1. Hierarchy Visibility
        if (user.role !== 'super_admin' && user.role !== 'admin') {
            const subordinateIds = await getSubordinateIds(user.id);
            // Show goals assigned to self OR subordinates
            where.assignedToId = { in: [...subordinateIds, user.id] };
        } else {
            // Admin/Super Admin see all in org (already filtered by organisationId)
            // Unless specifically filtering by user? API didn't seem to support it explicitly before other than auth context.
            // Kept simple as per original logic.
        }

        const goals = await prisma.goal.findMany({
            where,
            include: {
                assignedTo: { select: { firstName: true, lastName: true } }
            },
            orderBy: { createdAt: 'desc' }
        });

        res.json({ goals });
    } catch (error) {
        console.error('getGoals Error:', error);
        res.status(500).json({ message: (error as Error).message });
    }
};

export const createGoal = async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const orgId = getOrgId(user);

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

        const goal = await prisma.goal.create({
            data: {
                description: req.body.description || undefined,
                targetValue: req.body.targetValue,
                currentValue: req.body.currentValue || 0,
                period: req.body.period,
                status: 'active',
                startDate,
                endDate,
                organisationId: orgId as string,
                createdById: user.id,
                assignedToId: req.body.assignedToId || user.id
            }
        });

        res.status(201).json(goal);
    } catch (error) {
        console.error('createGoal Error:', error);
        res.status(400).json({ message: (error as Error).message });
    }
};

export const updateGoal = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const updates = { ...req.body };

        // Recalculate achievement percent if currentValue changes
        // Note: Prisma update can be done in one go if we fetch first, or just trust client? 
        // Better to fetch to calculate percent correctly.

        let goal = await prisma.goal.findUnique({ where: { id } });
        if (!goal) return res.status(404).json({ message: 'Goal not found' });

        if (updates.currentValue !== undefined) {
            const targetVal = updates.targetValue !== undefined ? updates.targetValue : goal.targetValue;
            updates.achievementPercent = Math.round((updates.currentValue / targetVal) * 100);

            if (updates.currentValue >= targetVal && goal.status === 'active') {
                updates.status = 'completed';
                updates.completedAt = new Date();
            }
        }

        const updatedGoal = await prisma.goal.update({
            where: { id },
            data: updates
        });

        res.json(updatedGoal);
    } catch (error) {
        console.error('updateGoal Error:', error);
        res.status(500).json({ message: (error as Error).message });
    }
};

export const deleteGoal = async (req: Request, res: Response) => {
    try {
        const goal = await prisma.goal.update({
            where: { id: req.params.id },
            data: { isDeleted: true }
        });

        res.json({ message: 'Goal deleted' });
    } catch (error) {
        // Prisma error P2025 means record not found
        if ((error as any).code === 'P2025') {
            return res.status(404).json({ message: 'Goal not found' });
        }
        res.status(500).json({ message: (error as Error).message });
    }
};
