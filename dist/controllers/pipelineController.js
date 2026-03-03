"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deletePipeline = exports.updatePipeline = exports.createPipeline = exports.getPipelines = void 0;
const prisma_1 = __importDefault(require("../config/prisma"));
const hierarchyUtils_1 = require("../utils/hierarchyUtils");
// Helper to validate stages structure
const validateStages = (stages) => {
    if (!Array.isArray(stages))
        return false;
    return stages.every(s => s.id && s.name); // Basic check
};
const getPipelines = async (req, res) => {
    try {
        const user = req.user;
        const orgId = (0, hierarchyUtils_1.getOrgId)(user);
        if (!orgId)
            return res.status(403).json({ message: 'No organisation context' });
        const pipelines = await prisma_1.default.pipeline.findMany({
            where: {
                organisationId: orgId,
                isDeleted: false
            },
            orderBy: { createdAt: 'asc' },
            include: {
                _count: {
                    select: { leads: true, opportunities: true }
                }
            }
        });
        res.json(pipelines);
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.getPipelines = getPipelines;
const createPipeline = async (req, res) => {
    try {
        const { name, description, stages, isDefault } = req.body;
        const user = req.user;
        const orgId = (0, hierarchyUtils_1.getOrgId)(user);
        if (!orgId)
            return res.status(400).json({ message: 'No org' });
        if (!name)
            return res.status(400).json({ message: 'Name is required' });
        if (stages && !validateStages(stages)) {
            return res.status(400).json({ message: 'Invalid stages format' });
        }
        // define default stages if none provided
        const finalStages = stages || [
            { id: 'new', name: 'New', color: '#3b82f6' },
            { id: 'contacted', name: 'Contacted', color: '#eab308' },
            { id: 'qualified', name: 'Qualified', color: '#22c55e' },
            { id: 'lost', name: 'Lost', color: '#ef4444' }
        ];
        // Transaction to handle default flag unset
        const pipeline = await prisma_1.default.$transaction(async (tx) => {
            if (isDefault) {
                // Unset other defaults
                await tx.pipeline.updateMany({
                    where: { organisationId: orgId, isDefault: true },
                    data: { isDefault: false }
                });
            }
            return await tx.pipeline.create({
                data: {
                    name,
                    description,
                    stages: finalStages,
                    isDefault: !!isDefault,
                    organisationId: orgId,
                    createdById: user.id
                }
            });
        });
        res.status(201).json(pipeline);
    }
    catch (error) {
        res.status(400).json({ message: error.message });
    }
};
exports.createPipeline = createPipeline;
const updatePipeline = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, description, stages, isDefault, isActive } = req.body;
        const user = req.user;
        const orgId = (0, hierarchyUtils_1.getOrgId)(user);
        const current = await prisma_1.default.pipeline.findUnique({ where: { id } });
        if (!current || current.organisationId !== orgId) {
            return res.status(404).json({ message: 'Pipeline not found' });
        }
        if (stages && !validateStages(stages)) {
            return res.status(400).json({ message: 'Invalid stages format' });
        }
        const updated = await prisma_1.default.$transaction(async (tx) => {
            if (isDefault && !current.isDefault) {
                await tx.pipeline.updateMany({
                    where: { organisationId: orgId, isDefault: true },
                    data: { isDefault: false }
                });
            }
            return await tx.pipeline.update({
                where: { id },
                data: {
                    name,
                    description,
                    stages, // Prisma handles partial json updates by replacement usually? Yes.
                    isDefault,
                    isActive
                }
            });
        });
        res.json(updated);
    }
    catch (error) {
        res.status(400).json({ message: error.message });
    }
};
exports.updatePipeline = updatePipeline;
const deletePipeline = async (req, res) => {
    try {
        const { id } = req.params;
        const user = req.user;
        const orgId = (0, hierarchyUtils_1.getOrgId)(user);
        const current = await prisma_1.default.pipeline.findUnique({
            where: { id },
            include: { _count: { select: { leads: true, opportunities: true } } }
        });
        if (!current || current.organisationId !== orgId) {
            return res.status(404).json({ message: 'Pipeline not found' });
        }
        if (current.isDefault) {
            return res.status(400).json({ message: 'Cannot delete default pipeline' });
        }
        if (current._count.leads > 0 || current._count.opportunities > 0) {
            return res.status(400).json({
                message: 'Cannot delete pipeline with associated leads or opportunities. Please migrate them first.'
            });
        }
        await prisma_1.default.pipeline.update({
            where: { id },
            data: { isDeleted: true }
        });
        res.json({ message: 'Pipeline deleted' });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.deletePipeline = deletePipeline;
