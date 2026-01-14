import { Request, Response } from 'express';
import prisma from '../config/prisma';
import { getOrgId, getSubordinateIds } from '../utils/hierarchyUtils';
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
            if (orgId) where.organisationId = orgId;
        }

        // 2. Hierarchy Visibility
        if (user.role !== 'super_admin' && user.role !== 'admin') {
            const subordinateIds = await getSubordinateIds(user.id);
            where.assignedToId = { in: subordinateIds };
        }

        if (search) {
            where.OR = [
                { subject: { contains: search, mode: 'insensitive' } },
                { description: { contains: search, mode: 'insensitive' } }
            ];
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
                lead: { select: { id: true, firstName: true, lastName: true, company: true } },
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
        if (!orgId) return res.status(400).json({ message: 'No org' });

        const { relatedTo, onModel, ...rest } = req.body;

        const data: Prisma.TaskCreateInput = {
            subject: req.body.subject,
            description: req.body.description,
            status: req.body.status || 'pending',
            priority: req.body.priority || 'medium',
            dueDate: req.body.dueDate,

            organisation: { connect: { id: orgId } },
            createdBy: { connect: { id: user.id } },
        };

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

        res.status(201).json(transformTask(task));
    } catch (error) {
        res.status(400).json({ message: (error as Error).message });
    }
};

export const getTaskById = async (req: Request, res: Response) => {
    try {
        const task = await prisma.task.findFirst({
            where: { id: req.params.id, isDeleted: false },
            include: {
                assignedTo: { select: { firstName: true, lastName: true } },
                lead: { select: { id: true, firstName: true, lastName: true, company: true } },
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

        const task = await prisma.task.update({
            where: { id },
            data: updates,
            include: {
                assignedTo: { select: { firstName: true, lastName: true } },
                lead: { select: { id: true, firstName: true, lastName: true } },
                contact: { select: { id: true, firstName: true, lastName: true } },
                account: { select: { id: true, name: true } },
                opportunity: { select: { id: true, name: true } },
            }
        });

        res.json(transformTask(task));
    } catch (error) {
        res.status(500).json({ message: (error as Error).message });
    }
};

export const deleteTask = async (req: Request, res: Response) => {
    try {
        await prisma.task.update({
            where: { id: req.params.id },
            data: { isDeleted: true }
        });
        res.json({ message: 'Task deleted' });
    } catch (error) {
        res.status(500).json({ message: (error as Error).message });
    }
};
