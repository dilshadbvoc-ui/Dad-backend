"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteTask = exports.updateTask = exports.getTaskById = exports.createTask = exports.getTasks = void 0;
const prisma_1 = __importDefault(require("../config/prisma"));
const hierarchyUtils_1 = require("../utils/hierarchyUtils");
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
    return Object.assign(Object.assign({}, task), { relatedTo,
        onModel });
};
const getTasks = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
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
            if (orgId)
                where.organisationId = orgId;
        }
        // 2. Hierarchy Visibility
        if (user.role !== 'super_admin' && user.role !== 'admin') {
            const subordinateIds = yield (0, hierarchyUtils_1.getSubordinateIds)(user.id);
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
            where.status = status;
        }
        const count = yield prisma_1.default.task.count({ where });
        const tasks = yield prisma_1.default.task.findMany({
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
});
exports.getTasks = getTasks;
const createTask = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const user = req.user;
        const orgId = (0, hierarchyUtils_1.getOrgId)(user);
        if (!orgId)
            return res.status(400).json({ message: 'No org' });
        const _a = req.body, { relatedTo, onModel } = _a, rest = __rest(_a, ["relatedTo", "onModel"]);
        const data = {
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
            if (onModel === 'Lead')
                data.lead = { connect: { id: relatedTo } };
            else if (onModel === 'Contact')
                data.contact = { connect: { id: relatedTo } };
            else if (onModel === 'Account')
                data.account = { connect: { id: relatedTo } };
            else if (onModel === 'Opportunity')
                data.opportunity = { connect: { id: relatedTo } };
        }
        const task = yield prisma_1.default.task.create({
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
    }
    catch (error) {
        res.status(400).json({ message: error.message });
    }
});
exports.createTask = createTask;
const getTaskById = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const task = yield prisma_1.default.task.findFirst({
            where: { id: req.params.id, isDeleted: false },
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
});
exports.getTaskById = getTaskById;
const updateTask = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const updates = Object.assign({}, req.body);
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
        const task = yield prisma_1.default.task.update({
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
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
});
exports.updateTask = updateTask;
const deleteTask = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        yield prisma_1.default.task.update({
            where: { id: req.params.id },
            data: { isDeleted: true }
        });
        res.json({ message: 'Task deleted' });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
});
exports.deleteTask = deleteTask;
