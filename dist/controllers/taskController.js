"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteTask = exports.updateTask = exports.getTaskById = exports.createTask = exports.getTasks = void 0;
const prisma_1 = __importDefault(require("../config/prisma"));
const hierarchyUtils_1 = require("../utils/hierarchyUtils");
const auditLogger_1 = require("../utils/auditLogger");
// Helper to consolidate polymorphic 'relatedTo' for Frontend compatibility
const transformTask = (task) => {
    let relatedTo = null;
    let onModel = null;
    if (task.lead) {
        relatedTo = task.lead;
        onModel = 'Lead';
    }
    else if (task.contact) {
        relatedTo = task.contact;
        onModel = 'Contact';
    }
    else if (task.account) {
        relatedTo = task.account;
        onModel = 'Account';
    }
    else if (task.opportunity) {
        relatedTo = task.opportunity;
        onModel = 'Opportunity';
    }
    return {
        ...task,
        relatedTo,
        onModel
    };
};
const getTasks = async (req, res) => {
    try {
        const page = parseInt(req.query.page || '1');
        const limit = parseInt(req.query.limit || '20');
        const search = req.query.search;
        const status = req.query.status;
        const skip = (page - 1) * limit;
        const user = req.user;
        const where = { isDeleted: false };
        // 1. Organisation Scoping
        if (user.role === 'super_admin') {
            if (req.query.organisationId) {
                where.organisationId = String(req.query.organisationId);
            }
        }
        else {
            const orgId = (0, hierarchyUtils_1.getOrgId)(user);
            if (!orgId)
                return res.status(403).json({ message: 'User has no organisation' });
            where.organisationId = orgId;
            if (user.branchId)
                where.branchId = user.branchId;
        }
        // 2. Hierarchy Visibility
        if (user.role !== 'super_admin' && user.role !== 'admin') {
            const subordinateIds = await (0, hierarchyUtils_1.getSubordinateIds)(user.id);
            // Include self in tasks
            where.assignedToId = { in: [...subordinateIds, user.id] };
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
            where.status = status;
        }
        const count = await prisma_1.default.task.count({ where });
        const tasks = await prisma_1.default.task.findMany({
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
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.getTasks = getTasks;
const createTask = async (req, res) => {
    try {
        const user = req.user;
        const orgId = (0, hierarchyUtils_1.getOrgId)(user);
        // Allow super admins without organization
        if (!orgId && user.role !== 'super_admin') {
            return res.status(400).json({ message: 'User must belong to an organization to create tasks' });
        }
        const { relatedTo, onModel } = req.body;
        const data = {
            subject: req.body.subject,
            description: req.body.description,
            status: req.body.status || 'not_started',
            priority: req.body.priority || 'medium',
            dueDate: req.body.dueDate ? new Date(req.body.dueDate).toISOString() : undefined,
            createdBy: { connect: { id: user.id } },
        };
        // Only connect organization if user has one
        if (orgId) {
            data.organisation = { connect: { id: orgId } };
        }
        if (user.branchId) {
            data.branch = { connect: { id: user.branchId } };
        }
        else if (req.body.branchId) {
            data.branch = { connect: { id: req.body.branchId } };
        }
        if (req.body.assignedTo) {
            // Handle if string ID or object? Assuming string ID from frontend
            data.assignedTo = { connect: { id: req.body.assignedTo } };
        }
        // Polymorphic mapping
        if (relatedTo && onModel) {
            if (onModel === 'Lead')
                data.lead = { connect: { id: relatedTo } };
            else if (onModel === 'Contact')
                data.contact = { connect: { id: relatedTo } };
            else if (onModel === 'Account')
                data.account = { connect: { id: relatedTo } };
            else if (onModel === 'Opportunity')
                data.opportunity = { connect: { id: relatedTo } };
        }
        const task = await prisma_1.default.task.create({
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
            await (0, auditLogger_1.logAudit)({
                organisationId: orgId,
                actorId: user.id,
                action: 'CREATE_TASK',
                entity: 'Task',
                entityId: task.id,
                details: { subject: task.subject }
            });
        }
        res.status(201).json(transformTask(task));
    }
    catch (error) {
        res.status(400).json({ message: error.message });
    }
};
exports.createTask = createTask;
const getTaskById = async (req, res) => {
    try {
        const user = req.user;
        const orgId = (0, hierarchyUtils_1.getOrgId)(user);
        const where = { id: req.params.id, isDeleted: false };
        if (user.role !== 'super_admin') {
            if (!orgId)
                return res.status(403).json({ message: 'User has no organisation' });
            where.organisationId = orgId;
            if (user.branchId)
                where.branchId = user.branchId;
        }
        const task = await prisma_1.default.task.findFirst({
            where,
            include: {
                assignedTo: { select: { firstName: true, lastName: true } },
                lead: { select: { id: true, firstName: true, lastName: true, company: true } },
                contact: { select: { id: true, firstName: true, lastName: true } },
                account: { select: { id: true, name: true } },
                opportunity: { select: { id: true, name: true } },
            }
        });
        if (!task)
            return res.status(404).json({ message: 'Task not found' });
        res.json(transformTask(task));
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.getTaskById = getTaskById;
const updateTask = async (req, res) => {
    try {
        const { id } = req.params;
        const updates = { ...req.body };
        // Convert dueDate to ISO-8601 DateTime if provided
        if (updates.dueDate) {
            updates.dueDate = new Date(updates.dueDate).toISOString();
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
            if (updates.onModel === 'Lead')
                updates.lead = { connect: { id: updates.relatedTo } };
            else if (updates.onModel === 'Contact')
                updates.contact = { connect: { id: updates.relatedTo } };
            else if (updates.onModel === 'Account')
                updates.account = { connect: { id: updates.relatedTo } };
            else if (updates.onModel === 'Opportunity')
                updates.opportunity = { connect: { id: updates.relatedTo } };
            delete updates.relatedTo;
            delete updates.onModel;
        }
        const requester = req.user;
        const whereObj = { id };
        if (requester.role !== 'super_admin') {
            const orgId = (0, hierarchyUtils_1.getOrgId)(requester);
            if (!orgId)
                return res.status(403).json({ message: 'No org' });
            whereObj.organisationId = orgId;
            if (requester.branchId)
                whereObj.branchId = requester.branchId;
        }
        const task = await prisma_1.default.task.update({
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
        await (0, auditLogger_1.logAudit)({
            organisationId: requester.organisationId || (0, hierarchyUtils_1.getOrgId)(requester),
            actorId: requester.id,
            action: 'UPDATE_TASK',
            entity: 'Task',
            entityId: task.id,
            details: { updatedFields: Object.keys(updates) }
        });
        res.json(transformTask(task));
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.updateTask = updateTask;
const deleteTask = async (req, res) => {
    try {
        const user = req.user;
        const orgId = (0, hierarchyUtils_1.getOrgId)(user);
        const where = { id: req.params.id };
        if (user.role !== 'super_admin') {
            if (!orgId)
                return res.status(403).json({ message: 'User has no organisation' });
            where.organisationId = orgId;
            if (user.branchId)
                where.branchId = user.branchId;
        }
        await prisma_1.default.task.update({
            where,
            data: { isDeleted: true }
        });
        await (0, auditLogger_1.logAudit)({
            organisationId: (orgId || (0, hierarchyUtils_1.getOrgId)(user)),
            actorId: user.id,
            action: 'DELETE_TASK',
            entity: 'Task',
            entityId: req.params.id
        });
        res.json({ message: 'Task deleted' });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.deleteTask = deleteTask;
