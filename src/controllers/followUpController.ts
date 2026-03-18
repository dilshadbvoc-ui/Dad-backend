import { Request, Response } from 'express';
import prisma from '../config/prisma';
import { getOrgId, getSubordinateIds, getVisibleUserIds } from '../utils/hierarchyUtils';
import { Prisma } from '../generated/client';
import { TaskService } from '../services/taskService';

// GET /api/follow-ups - Get all follow-up tasks for user and subordinates
export const getFollowUps = async (req: Request, res: Response) => {
    try {
        const page = parseInt(req.query.page as string || '1');
        const limit = parseInt(req.query.limit as string || '20');
        const search = req.query.search as string;
        const status = req.query.status as string;
        const skip = (page - 1) * limit;
        const user = (req as any).user;

        console.log('[getFollowUps] User:', user.id, user.role, user.email);

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
            console.log('[getFollowUps] Org ID:', orgId);
            if (!orgId) return res.status(403).json({ message: 'User has no organisation' });
            where.organisationId = orgId;
        }

        // 2. Hierarchy Visibility - Show follow-ups for user and subordinates
        // Admins and super admins see all tasks in their org (already filtered above)
        if (user.role !== 'super_admin' && user.role !== 'admin') {
            const visibleUserIds = await getVisibleUserIds(user.id);

            console.log('[getFollowUps] User ID:', user.id);
            console.log('[getFollowUps] User ID type:', typeof user.id);
            console.log('[getFollowUps] Visible user IDs:', visibleUserIds);

            // Show tasks if:
            // 1. Created by user/subordinates (ALWAYS show what you created)
            // 2. Assigned to user/subordinates
            // 3. Unassigned (null) but created by user/subordinates
            where.OR = [
                { createdById: { in: visibleUserIds } },
                { assignedToId: { in: visibleUserIds } },
                // Handle unassigned tasks created by visible users
                { AND: [{ assignedToId: null }, { createdById: { in: visibleUserIds } }] }
            ];
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

        console.log('[getFollowUps] Final query where:', JSON.stringify(where, null, 2));

        const count = await prisma.task.count({ where });
        console.log('[getFollowUps] Count:', count);

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

        console.log('[getFollowUps] Tasks found:', tasks.length);

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


// PUT /api/follow-ups/:id - Update a follow-up task
export const updateFollowUp = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const user = (req as any).user;
        const { status, dueDate, subject, description, priority, assignedToId } = req.body;

        // Check if task exists and user has permission
        const task = await prisma.task.findUnique({
            where: { id },
            include: { createdBy: true, assignedTo: true }
        });

        if (!task) {
            return res.status(404).json({ message: 'Follow-up not found' });
        }

        // Permission check: user must be creator, assignee, admin, or super_admin
        const isCreator = task.createdById === user.id;
        const isAssignee = task.assignedToId === user.id;
        const isAdmin = user.role === 'admin' || user.role === 'super_admin';

        if (!isCreator && !isAssignee && !isAdmin) {
            return res.status(403).json({ message: 'Not authorized to update this follow-up' });
        }

        // Update the task
        const updatedTask = await prisma.task.update({
            where: { id },
            data: {
                ...(status && { status }),
                ...(dueDate && { dueDate: new Date(dueDate) }),
                ...(subject && { subject }),
                ...(description !== undefined && { description }),
                ...(priority && { priority }),
                ...(assignedToId !== undefined && { assignedToId })
            },
            include: {
                assignedTo: { select: { firstName: true, lastName: true, email: true } },
                createdBy: { select: { firstName: true, lastName: true, email: true } },
                lead: {
                    where: { isDeleted: false },
                    select: { id: true, firstName: true, lastName: true, company: true }
                },
                contact: { select: { id: true, firstName: true, lastName: true } },
                account: { select: { id: true, name: true } },
                opportunity: { select: { id: true, name: true } },
            }
        });

        // Sync Lead follow-up date
        if (updatedTask.leadId) {
            await TaskService.syncLeadFollowUp(updatedTask.leadId);
        }

        // Transform response
        let relatedTo = null;
        let onModel = null;

        if (updatedTask.lead) { relatedTo = updatedTask.lead; onModel = 'Lead'; }
        else if (updatedTask.contact) { relatedTo = updatedTask.contact; onModel = 'Contact'; }
        else if (updatedTask.account) { relatedTo = updatedTask.account; onModel = 'Account'; }
        else if (updatedTask.opportunity) { relatedTo = updatedTask.opportunity; onModel = 'Opportunity'; }

        res.json({
            ...updatedTask,
            relatedTo,
            onModel
        });
    } catch (error) {
        console.error('[updateFollowUp] Error:', error);
        res.status(500).json({ message: (error as Error).message });
    }
};
