import { Request, Response } from 'express';
import prisma from '../config/prisma';
import { getOrgId, getSubordinateIds } from '../utils/hierarchyUtils';
import { logAudit } from '../utils/auditLogger';
import { Prisma } from '../generated/client';

// Helper to consolidate polymorphic 'relatedTo' for Frontend compatibility
const transformTask = (task: any) => {
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
};

export const getTasks = async (req: Request, res: Response) => {
    try {
        const page = parseInt(req.query.page as string || '1');
        const limit = parseInt(req.query.limit as string || '20');
        const search = req.query.search as string;
        const status = req.query.status as string;
        const skip = (page - 1) * limit;
        const user = (req as any).user;

        const where: Prisma.TaskWhereInput = { isDeleted: false };

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

        // 2. Hierarchy Visibility - Show tasks if:
        // - Assigned to user or subordinates
        // - Created by user
        // - Related to leads/contacts/accounts/opportunities owned by user or subordinates
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
            // Check enum validity or use string? TaskStatus is enum.
            // Assuming frontend sends valid enum string like 'pending', 'completed'
            // If strict enum needed: where.status = status as TaskStatus
            where.status = status as any;
        }

        const count = await prisma.task.count({ where });
        const tasks = await prisma.task.findMany({
            where,
            include: {
                assignedTo: { select: { firstName: true, lastName: true, email: true } },
                // Include all potential relations to reconstruct 'relatedTo'
                // Filter out deleted leads
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
            orderBy: { createdAt: 'desc' }
        });

        const transformedTasks = tasks.map(transformTask);

        res.json({
            tasks: transformedTasks,
            page,
            totalPages: Math.ceil(count / limit),
            totalTasks: count
        });
    } catch (error) {
        res.status(500).json({ message: (error as Error).message });
    }
};

export const createTask = async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const orgId = getOrgId(user);

        // Allow super admins without organization
        if (!orgId && user.role !== 'super_admin') {
            return res.status(400).json({ message: 'User must belong to an organization to create tasks' });
        }

        const { relatedTo, onModel } = req.body;

        // Normalize dueDate to start of day to ensure consistent date comparisons
        let normalizedDueDate: string | undefined = undefined;
        if (req.body.dueDate) {
            const date = new Date(req.body.dueDate);
            date.setHours(0, 0, 0, 0); // Set to midnight
            normalizedDueDate = date.toISOString();
        }

        const data: Prisma.TaskCreateInput = {
            subject: req.body.subject,
            description: req.body.description,
            status: req.body.status || 'not_started',
            priority: req.body.priority || 'medium',
            dueDate: normalizedDueDate,

            createdBy: { connect: { id: user.id } },
        };

        // Only connect organization if user has one
        if (orgId) {
            data.organisation = { connect: { id: orgId } };
        }

        if (user.branchId) {
            data.branch = { connect: { id: user.branchId } };
        } else if (req.body.branchId) {
            data.branch = { connect: { id: req.body.branchId } };
        }

        if (req.body.assignedTo) {
            // Handle if string ID or object? Assuming string ID from frontend
            data.assignedTo = { connect: { id: req.body.assignedTo } };
        }

        // Polymorphic mapping
        if (relatedTo && onModel) {
            if (onModel === 'Lead') data.lead = { connect: { id: relatedTo } };
            else if (onModel === 'Contact') data.contact = { connect: { id: relatedTo } };
            else if (onModel === 'Account') data.account = { connect: { id: relatedTo } };
            else if (onModel === 'Opportunity') data.opportunity = { connect: { id: relatedTo } };
        }

        const task = await prisma.task.create({
            data,
            include: {
                assignedTo: { select: { firstName: true, lastName: true } },
                lead: { select: { firstName: true, lastName: true } },
                contact: { select: { firstName: true, lastName: true } },
                account: { select: { name: true } },
                opportunity: { select: { name: true } }
            }
        });

        if (orgId) {
            await logAudit({
                organisationId: orgId,
                actorId: user.id,
                action: 'CREATE_TASK',
                entity: 'Task',
                entityId: task.id,
                details: { subject: task.subject }
            });
        }

        res.status(201).json(transformTask(task));
    } catch (error) {
        res.status(400).json({ message: (error as Error).message });
    }
};

export const getTaskById = async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const orgId = getOrgId(user);

        const where: any = { id: req.params.id, isDeleted: false };
        if (user.role !== 'super_admin') {
            if (!orgId) return res.status(403).json({ message: 'User has no organisation' });
            where.organisationId = orgId;
            if (user.branchId) where.branchId = user.branchId;
        }

        const task = await prisma.task.findFirst({
            where,
            include: {
                assignedTo: { select: { firstName: true, lastName: true } },
                lead: { 
                    where: { isDeleted: false },
                    select: { id: true, firstName: true, lastName: true, company: true } 
                },
                contact: { select: { id: true, firstName: true, lastName: true } },
                account: { select: { id: true, name: true } },
                opportunity: { select: { id: true, name: true } },
            }
        });

        if (!task) return res.status(404).json({ message: 'Task not found' });
        res.json(transformTask(task));
    } catch (error) {
        res.status(500).json({ message: (error as Error).message });
    }
};

export const updateTask = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const updates = { ...req.body };

        // Normalize dueDate to start of day to ensure consistent date comparisons
        if (updates.dueDate) {
            const date = new Date(updates.dueDate);
            date.setHours(0, 0, 0, 0); // Set to midnight
            updates.dueDate = date.toISOString();
        }

        // Handle Relation Updates
        if (updates.assignedTo && typeof updates.assignedTo === 'string') {
            updates.assignedTo = { connect: { id: updates.assignedTo } };
        }

        // Handle Polymorphic updates (if changing relation)
        if (updates.relatedTo && updates.onModel) {
            // Reset others? Or just set new one? 
            // Prisma doesn't auto-disconnect others unless we explicitly set to null.
            // Ideally we should disconnect others if we are switching model type.
            updates.lead = undefined;
            updates.contact = undefined;
            updates.account = undefined;
            updates.opportunity = undefined;

            if (updates.onModel === 'Lead') updates.lead = { connect: { id: updates.relatedTo } };
            else if (updates.onModel === 'Contact') updates.contact = { connect: { id: updates.relatedTo } };
            else if (updates.onModel === 'Account') updates.account = { connect: { id: updates.relatedTo } };
            else if (updates.onModel === 'Opportunity') updates.opportunity = { connect: { id: updates.relatedTo } };

            delete updates.relatedTo;
            delete updates.onModel;
        }

        const requester = (req as any).user;
        const whereObj: any = { id };
        if (requester.role !== 'super_admin') {
            const orgId = getOrgId(requester);
            if (!orgId) return res.status(403).json({ message: 'No org' });
            whereObj.organisationId = orgId;
            if (requester.branchId) whereObj.branchId = requester.branchId;
        }

        const task = await prisma.task.update({
            where: whereObj,
            data: updates,
            include: {
                assignedTo: { select: { firstName: true, lastName: true } },
                lead: { select: { id: true, firstName: true, lastName: true } },
                contact: { select: { id: true, firstName: true, lastName: true } },
                account: { select: { id: true, name: true } },
                opportunity: { select: { id: true, name: true } },
            }
        });

        await logAudit({
            organisationId: requester.organisationId || getOrgId(requester),
            actorId: requester.id,
            action: 'UPDATE_TASK',
            entity: 'Task',
            entityId: task.id,
            details: { updatedFields: Object.keys(updates) }
        });

        res.json(transformTask(task));
    } catch (error) {
        res.status(500).json({ message: (error as Error).message });
    }
};

export const deleteTask = async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const orgId = getOrgId(user);

        const where: any = { id: req.params.id };
        if (user.role !== 'super_admin') {
            if (!orgId) return res.status(403).json({ message: 'User has no organisation' });
            where.organisationId = orgId;
            if (user.branchId) where.branchId = user.branchId;
        }

        await prisma.task.update({
            where,
            data: { isDeleted: true }
        });

        await logAudit({
            organisationId: (orgId || getOrgId(user)) as string,
            actorId: user.id,
            action: 'DELETE_TASK',
            entity: 'Task',
            entityId: req.params.id
        });

        res.json({ message: 'Task deleted' });
    } catch (error) {
        res.status(500).json({ message: (error as Error).message });
    }
};
