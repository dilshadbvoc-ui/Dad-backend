import { Request, Response } from 'express';
import prisma from '../config/prisma';
import { getSubordinateIds, getOrgId, getVisibleUserIds } from '../utils/hierarchyUtils';
import { logAudit } from '../utils/auditLogger';

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
            const visibleUserIds = await getVisibleUserIds(user.id);
            // Show goals assigned to self OR visible
            where.assignedToId = { in: visibleUserIds };
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
        if (!orgId) return res.status(400).json({ message: 'Organisation not found' });

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

        const goal = await prisma.goal.create({
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
            const { GoalService } = await import('../services/goalService');
            await GoalService.updateProgressForUser(goal.assignedToId, goal.type);
        }

        await logAudit({
            organisationId: orgId,
            actorId: user.id,
            action: 'CREATE_GOAL',
            entity: 'Goal',
            entityId: goal.id,
            details: { type: goal.type, targetValue: goal.targetValue }
        });

        res.status(201).json(goal);
    } catch (error) {
        console.error('createGoal Error:', error);
        res.status(400).json({ message: (error as Error).message });
    }
};

export const updateGoal = async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const orgId = getOrgId(user);
        if (!orgId) return res.status(400).json({ message: 'Organisation not found' });

        const { id } = req.params;
        const updates = { ...req.body };

        const goal = await prisma.goal.findFirst({
            where: {
                id,
                organisationId: orgId
            }
        });

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

        await logAudit({
            organisationId: orgId,
            actorId: user.id,
            action: 'UPDATE_GOAL',
            entity: 'Goal',
            entityId: updatedGoal.id,
            details: { updatedFields: Object.keys(updates) }
        });

        res.json(updatedGoal);
    } catch (error) {
        console.error('updateGoal Error:', error);
        res.status(500).json({ message: (error as Error).message });
    }
};

export const deleteGoal = async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const orgId = getOrgId(user);
        if (!orgId) return res.status(400).json({ message: 'Organisation not found' });

        await prisma.goal.update({
            where: {
                id: req.params.id,
                organisationId: orgId
            },
            data: { isDeleted: true }
        });

        await logAudit({
            organisationId: orgId,
            actorId: user.id,
            action: 'DELETE_GOAL',
            entity: 'Goal',
            entityId: req.params.id
        });

        res.json({ message: 'Goal deleted' });
    } catch (error) {
        if ((error as any).code === 'P2025') return res.status(404).json({ message: 'Goal not found' });
        res.status(500).json({ message: (error as Error).message });
    }
};

export const recalculateGoal = async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const orgId = getOrgId(user);
        if (!orgId) return res.status(400).json({ message: 'Organisation not found' });

        const { id } = req.params;
        const goal = await prisma.goal.findFirst({
            where: {
                id,
                organisationId: orgId
            }
        });

        if (!goal) return res.status(404).json({ message: 'Goal not found' });

        if (goal.type === 'manual') {
            return res.status(400).json({ message: 'Cannot automatically recalculate manual goals' });
        }

        const { GoalService } = await import('../services/goalService');
        await GoalService.updateProgressForUser(goal.assignedToId, goal.type);

        const updatedGoal = await prisma.goal.findUnique({ where: { id } });
        res.json(updatedGoal);
    } catch (error) {
        res.status(500).json({ message: (error as Error).message });
    }
};
