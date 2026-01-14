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
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runWorkflow = exports.deleteWorkflow = exports.updateWorkflow = exports.getWorkflowById = exports.createWorkflow = exports.getWorkflows = void 0;
const prisma_1 = __importDefault(require("../config/prisma"));
const hierarchyUtils_1 = require("../utils/hierarchyUtils");
const getWorkflows = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const page = parseInt(req.query.page || '1');
        const limit = parseInt(req.query.limit || '20');
        const search = req.query.search;
        const skip = (page - 1) * limit;
        const user = req.user;
        const where = { isDeleted: false };
        const orgId = (0, hierarchyUtils_1.getOrgId)(user);
        if (orgId)
            where.organisationId = orgId;
        if (user.role === 'super_admin' && req.query.organisationId) {
            where.organisationId = String(req.query.organisationId);
        }
        if (search) {
            where.name = { contains: search, mode: 'insensitive' };
        }
        const count = yield prisma_1.default.workflow.count({ where });
        const workflows = yield prisma_1.default.workflow.findMany({
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
});
exports.getWorkflows = getWorkflows;
const createWorkflow = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const user = req.user;
        const orgId = (0, hierarchyUtils_1.getOrgId)(user);
        if (!orgId)
            return res.status(400).json({ message: 'No org' });
        const workflow = yield prisma_1.default.workflow.create({
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
        res.status(201).json(workflow);
    }
    catch (error) {
        res.status(400).json({ message: error.message });
    }
});
exports.createWorkflow = createWorkflow;
const getWorkflowById = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const workflow = yield prisma_1.default.workflow.findFirst({
            where: { id: req.params.id, isDeleted: false }
        });
        if (!workflow)
            return res.status(404).json({ message: 'Workflow not found' });
        res.json(workflow);
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
});
exports.getWorkflowById = getWorkflowById;
const updateWorkflow = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const workflow = yield prisma_1.default.workflow.update({
            where: { id: req.params.id },
            data: req.body
        });
        res.json(workflow);
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
});
exports.updateWorkflow = updateWorkflow;
const deleteWorkflow = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        yield prisma_1.default.workflow.update({
            where: { id: req.params.id },
            data: { isDeleted: true }
        });
        res.json({ message: 'Workflow deleted' });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
});
exports.deleteWorkflow = deleteWorkflow;
const runWorkflow = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const { entityId } = req.body;
        const user = req.user;
        if (!entityId) {
            return res.status(400).json({ message: 'Entity ID is required' });
        }
        const workflow = yield prisma_1.default.workflow.findUnique({ where: { id } });
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
                entityData = yield prisma_1.default.lead.findUnique({ where: { id: entityId } });
                break;
            case 'Contact':
                entityData = yield prisma_1.default.contact.findUnique({ where: { id: entityId } });
                break;
            // Add other cases
        }
        if (!entityData) {
            return res.status(404).json({ message: `${workflow.triggerEntity} with ID ${entityId} not found` });
        }
        const { WorkflowEngine } = yield Promise.resolve().then(() => __importStar(require('../services/WorkflowEngine')));
        yield WorkflowEngine.executeActions(workflow, entityData);
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
});
exports.runWorkflow = runWorkflow;
