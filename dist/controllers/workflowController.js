"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runWorkflow = exports.deleteWorkflow = exports.updateWorkflow = exports.getWorkflowById = exports.createWorkflow = exports.getWorkflows = void 0;
const prisma_1 = __importDefault(require("../config/prisma"));
const hierarchyUtils_1 = require("../utils/hierarchyUtils");
const getWorkflows = async (req, res) => {
    try {
        const page = parseInt(req.query.page || '1');
        const limit = parseInt(req.query.limit || '20');
        const search = req.query.search;
        const skip = (page - 1) * limit;
        const user = req.user;
        const where = { isDeleted: false };
        const orgId = (0, hierarchyUtils_1.getOrgId)(user);
        // Organisation Scoping
        if (user.role === 'super_admin') {
            if (req.query.organisationId)
                where.organisationId = String(req.query.organisationId);
        }
        else {
            if (!orgId)
                return res.status(403).json({ message: 'User has no organisation' });
            where.organisationId = orgId;
        }
        if (search) {
            where.name = { contains: search, mode: 'insensitive' };
        }
        const count = await prisma_1.default.workflow.count({ where });
        const workflows = await prisma_1.default.workflow.findMany({
            where,
            skip,
            take: limit,
            orderBy: { createdAt: 'desc' }
        });
        res.json({
            workflows,
            page,
            totalPages: Math.ceil(count / limit),
            totalWorkflows: count
        });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.getWorkflows = getWorkflows;
const createWorkflow = async (req, res) => {
    try {
        const user = req.user;
        const orgId = (0, hierarchyUtils_1.getOrgId)(user);
        if (!orgId)
            return res.status(400).json({ message: 'No org' });
        const workflow = await prisma_1.default.workflow.create({
            data: {
                name: req.body.name,
                description: req.body.description,
                isActive: req.body.isActive !== undefined ? req.body.isActive : false,
                triggerEntity: req.body.triggerEntity,
                triggerEvent: req.body.triggerEvent,
                conditions: req.body.conditions,
                actions: req.body.actions,
                organisation: { connect: { id: orgId } },
                createdBy: { connect: { id: user.id } }
            }
        });
        // Audit Log
        try {
            const { logAudit } = await Promise.resolve().then(() => __importStar(require('../utils/auditLogger')));
            logAudit({
                action: 'CREATE_WORKFLOW',
                entity: 'Workflow',
                entityId: workflow.id,
                actorId: user.id,
                organisationId: orgId,
                details: { name: workflow.name, triggerEntity: workflow.triggerEntity }
            });
        }
        catch (e) {
            console.error('Audit Log Error:', e);
        }
        res.status(201).json(workflow);
    }
    catch (error) {
        res.status(400).json({ message: error.message });
    }
};
exports.createWorkflow = createWorkflow;
const getWorkflowById = async (req, res) => {
    try {
        const user = req.user;
        const orgId = (0, hierarchyUtils_1.getOrgId)(user);
        const where = { id: req.params.id, isDeleted: false };
        if (user.role !== 'super_admin') {
            if (!orgId)
                return res.status(403).json({ message: 'No org' });
            where.organisationId = orgId;
        }
        const workflow = await prisma_1.default.workflow.findFirst({
            where
        });
        if (!workflow)
            return res.status(404).json({ message: 'Workflow not found' });
        res.json(workflow);
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.getWorkflowById = getWorkflowById;
const updateWorkflow = async (req, res) => {
    try {
        const user = req.user;
        const orgId = (0, hierarchyUtils_1.getOrgId)(user);
        const workflowId = req.params.id;
        // Verify existence and org
        const existing = await prisma_1.default.workflow.findFirst({
            where: { id: workflowId, isDeleted: false }
        });
        if (!existing)
            return res.status(404).json({ message: 'Workflow not found' });
        if (existing.organisationId !== orgId && user.role !== 'super_admin') {
            return res.status(403).json({ message: 'Access denied' });
        }
        const { organisationId: _orgId, createdById: _createdById, executionCount: _count, ...updateData } = req.body;
        const workflow = await prisma_1.default.workflow.update({
            where: { id: workflowId },
            data: updateData
        });
        // Audit Log
        try {
            const { logAudit } = await Promise.resolve().then(() => __importStar(require('../utils/auditLogger')));
            logAudit({
                action: 'UPDATE_WORKFLOW',
                entity: 'Workflow',
                entityId: workflowId,
                actorId: user.id,
                organisationId: orgId,
                details: { name: workflow.name, updatedFields: Object.keys(req.body) }
            });
        }
        catch (e) {
            console.error('Audit Log Error:', e);
        }
        res.json(workflow);
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.updateWorkflow = updateWorkflow;
const deleteWorkflow = async (req, res) => {
    try {
        const user = req.user;
        const orgId = (0, hierarchyUtils_1.getOrgId)(user);
        const workflowId = req.params.id;
        // Verify existence and org
        const existing = await prisma_1.default.workflow.findFirst({
            where: { id: workflowId, isDeleted: false }
        });
        if (!existing)
            return res.status(404).json({ message: 'Workflow not found' });
        if (existing.organisationId !== orgId && user.role !== 'super_admin') {
            return res.status(403).json({ message: 'Access denied' });
        }
        await prisma_1.default.workflow.update({
            where: { id: workflowId },
            data: { isDeleted: true }
        });
        // Audit Log
        try {
            const { logAudit } = await Promise.resolve().then(() => __importStar(require('../utils/auditLogger')));
            logAudit({
                action: 'DELETE_WORKFLOW',
                entity: 'Workflow',
                entityId: workflowId,
                actorId: user.id,
                organisationId: orgId,
                details: { name: existing.name }
            });
        }
        catch (e) {
            console.error('Audit Log Error:', e);
        }
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.deleteWorkflow = deleteWorkflow;
const runWorkflow = async (req, res) => {
    try {
        const { id } = req.params;
        const { entityId } = req.body;
        const user = req.user;
        if (!entityId) {
            return res.status(400).json({ message: 'Entity ID is required' });
        }
        const workflow = await prisma_1.default.workflow.findUnique({ where: { id } });
        if (!workflow) {
            return res.status(404).json({ message: 'Workflow not found' });
        }
        // Security check
        const orgId = (0, hierarchyUtils_1.getOrgId)(user);
        if (workflow.organisationId !== orgId && user.role !== 'super_admin') {
            return res.status(403).json({ message: 'Access denied' });
        }
        // Fetch Entity
        let entityData = null;
        // Use Prisma dynamic fetch? or switch case
        // Since we are inside controller, we can use prisma methods directly or dynamic queries.
        // Prisma Client generic delegate access: `prisma[modelName]` is tricky in TS without casts.
        // Let's use switch case for safety.
        switch (workflow.triggerEntity) {
            case 'Lead':
                entityData = await prisma_1.default.lead.findUnique({ where: { id: entityId } });
                break;
            case 'Contact':
                entityData = await prisma_1.default.contact.findUnique({ where: { id: entityId } });
                break;
            case 'Opportunity':
                entityData = await prisma_1.default.opportunity.findUnique({ where: { id: entityId } });
                break;
            case 'Account':
                entityData = await prisma_1.default.account.findUnique({ where: { id: entityId } });
                break;
            case 'Task':
                entityData = await prisma_1.default.task.findUnique({ where: { id: entityId } });
                break;
            default:
                return res.status(400).json({ message: `Unsupported entity type: ${workflow.triggerEntity}` });
        }
        if (!entityData) {
            return res.status(404).json({ message: `${workflow.triggerEntity} with ID ${entityId} not found` });
        }
        const { WorkflowEngine } = await Promise.resolve().then(() => __importStar(require('../services/WorkflowEngine')));
        await WorkflowEngine.executeActions(workflow, entityData, workflow.organisationId);
        // Audit Log
        try {
            const { logAudit } = await Promise.resolve().then(() => __importStar(require('../utils/auditLogger')));
            logAudit({
                action: 'RUN_WORKFLOW_MANUAL',
                entity: 'Workflow',
                entityId: id,
                actorId: user.id,
                organisationId: workflow.organisationId,
                details: { name: workflow.name, entityType: workflow.triggerEntity, entityId }
            });
        }
        catch (e) {
            console.error('Audit Log Error:', e);
        }
        res.json({
            message: 'Workflow executed successfully',
            workflowId: id,
            entityId
        });
    }
    catch (error) {
        console.error('Manual Workflow Run Error:', error);
        res.status(500).json({ message: error.message });
    }
};
exports.runWorkflow = runWorkflow;
