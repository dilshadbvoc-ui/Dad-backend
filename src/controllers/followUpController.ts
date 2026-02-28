import { Request, Response } from 'express';
import prisma from '../config/prisma';
import { getOrgId, getSubordinateIds } from '../utils/hierarchyUtils';
import { Prisma } from '../generated/client';

// GET /api/follow-ups - Get all follow-up tasks for user and subordinates
export const getFollowUps = async (req: Request, res: Response) => {
    try {
        const page = parseInt(req.query.page as string || '1');
        const limit = parseInt(req.query.limit as string || '20');
        const search = req.query.search as string;
        const status = req.query.status as string;
        const skip = (page - 1) * limit;
        const user = (req as any).user;

        const where: Prisma.TaskWhereInput = { 
            isDeleted: false,
            // Only show tasks with due dates (follow-ups)
            dueDate: { not: null }
        };

        // 1. Organisation Scoping
        if (user.role === 'super_admin') {
            if (req.query.organisationId) {
                where.organisationId = String(req.query.organisationId);
            }
        } else {
            const orgId = getOrgId(user);
            if (!orgId) return res.status(403).json({ message: 'User has no organisation' });
            where.organisationId = orgId;
            if (user.branchId) where.branchId = user.branchId;
        }

        // 2. Hierarchy Visibility - Show follow-ups for user and subordinates
        // Admins and super admins see all tasks in their org (already filtered above)
        if (user.role !== 'super_admin' && user.role !== 'admin') {
            const subordinateIds = await getSubordinateIds(user.id);
            const visibleUserIds = [...subordinateIds, user.id];
            
            const visibilityConditions = [
                // Tasks assigned to user or subordinates
                { assignedToId: { in: visibleUserIds } },
                // Tasks created by user
                { createdById: user.id },
                // Tasks related to leads assigned to user or subordinates
                { lead: { assignedToId: { in: visibleUserIds }, isDeleted: false } },
                // Tasks related to contacts owned by user or subordinates
                { contact: { ownerId: { in: visibleUserIds } } },
                // Tasks related to accounts owned by user or subordinates
                { account: { ownerId: { in: visibleUserIds } } },
                // Tasks related to opportunities owned by user or subordinates
                { opportunity: { ownerId: { in: visibleUserIds } } }
            ];
            
            // Use AND to combine with other filters
            if (!where.AND) where.AND = [];
            (where.AND as any[]).push({ OR: visibilityConditions });
        }

        if (search) {
            const searchConditions = [
                { subject: { contains: search, mode: 'insensitive' } },
                { description: { contains: search, mode: 'insensitive' } }
            ];
            
            // Use AND to combine with other filters
            if (!where.AND) where.AND = [];
            (where.AND as any[]).push({ OR: searchConditions });
        }

        if (status && status !== 'all') {
            where.status = status as any;
        }

        const count = await prisma.task.count({ where });
        const tasks = await prisma.task.findMany({
            where,
            include: {
                assignedTo: { select: { firstName: true, lastName: true, email: true } },
                createdBy: { select: { firstName: true, lastName: true, email: true } },
                // Include all potential relations
                lead: { 
                    where: { isDeleted: false },
                    select: { id: true, firstName: true, lastName: true, company: true } 
                },
                contact: { select: { id: true, firstName: true, lastName: true } },
                account: { select: { id: true, name: true } },
                opportunity: { select: { id: true, name: true } },
            },
            skip,
            take: limit,
            orderBy: { dueDate: 'asc' } // Sort by due date ascending (earliest first)
        });

        // Transform tasks to include relatedTo
        const transformedTasks = tasks.map(task => {
            let relatedTo = null;
            let onModel = null;

            if (task.lead) { relatedTo = task.lead; onModel = 'Lead'; }
            else if (task.contact) { relatedTo = task.contact; onModel = 'Contact'; }
            else if (task.account) { relatedTo = task.account; onModel = 'Account'; }
            else if (task.opportunity) { relatedTo = task.opportunity; onModel = 'Opportunity'; }

            return {
                ...task,
                relatedTo,
                onModel
            };
        });

        res.json({
            tasks: transformedTasks,
            page,
            totalPages: Math.ceil(count / limit),
            totalTasks: count
        });
    } catch (error) {
        console.error('[getFollowUps] Error:', error);
        res.status(500).json({ message: (error as Error).message });
    }
};
