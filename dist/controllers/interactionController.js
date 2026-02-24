"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.logQuickInteraction = exports.updateInteractionRecording = exports.getAllInteractions = exports.getLeadInteractions = exports.createInteraction = exports.createInteractionGeneric = void 0;
const prisma_1 = __importDefault(require("../config/prisma"));
const hierarchyUtils_1 = require("../utils/hierarchyUtils");
const auditLogger_1 = require("../utils/auditLogger");
// POST /api/interactions - Create interaction (generic endpoint)
const createInteractionGeneric = async (req, res) => {
    try {
        const user = req.user;
        const orgId = (0, hierarchyUtils_1.getOrgId)(user);
        // Allow super admins without organization
        if (!orgId && user.role !== 'super_admin') {
            return res.status(400).json({ message: 'User must belong to an organization to create interactions' });
        }
        const { lead, contact, account, opportunity, type, direction = 'outbound', subject, description, duration, recordingUrl, recordingDuration, callStatus, phoneNumber, date } = req.body;
        const data = {
            type: type,
            direction: direction,
            subject: subject || `${type} interaction`,
            description,
            duration,
            recordingUrl,
            recordingDuration,
            callStatus,
            phoneNumber,
            date: date ? new Date(date) : new Date(),
            createdBy: { connect: { id: user.id } },
            branch: user.branchId ? { connect: { id: user.branchId } } : (req.body.branchId ? { connect: { id: req.body.branchId } } : undefined)
        };
        // Only connect organization if user has one
        if (orgId) {
            data.organisation = { connect: { id: orgId } };
        }
        // Connect to related entity
        if (lead)
            data.lead = { connect: { id: lead } };
        if (contact)
            data.contact = { connect: { id: contact } };
        if (account)
            data.account = { connect: { id: account } };
        if (opportunity)
            data.opportunity = { connect: { id: opportunity } };
        const interaction = await prisma_1.default.interaction.create({
            data
        });
        if (orgId) {
            await (0, auditLogger_1.logAudit)({
                organisationId: orgId,
                actorId: user.id,
                action: 'CREATE_INTERACTION',
                entity: 'Interaction',
                entityId: interaction.id,
                details: { type: interaction.type, subject: interaction.subject }
            });
        }
        res.status(201).json(interaction);
    }
    catch (error) {
        console.error('createInteractionGeneric Error:', error);
        res.status(400).json({ message: error.message });
    }
};
exports.createInteractionGeneric = createInteractionGeneric;
// POST /api/leads/:leadId/interactions - Log a new interaction
const createInteraction = async (req, res) => {
    try {
        const { leadId } = req.params;
        const user = req.user;
        const orgId = (0, hierarchyUtils_1.getOrgId)(user);
        if (!orgId)
            return res.status(400).json({ message: 'Organisation context required' });
        // Verify lead exists and belongs to org
        const lead = await prisma_1.default.lead.findFirst({
            where: { id: leadId, organisationId: orgId },
            include: { branch: true }
        });
        if (!lead)
            return res.status(404).json({ message: 'Lead not found' });
        const { type, direction = 'outbound', subject, description, duration, recordingUrl, recordingDuration, callStatus, phoneNumber } = req.body;
        const interaction = await prisma_1.default.interaction.create({
            data: {
                type: type,
                direction: direction,
                subject: subject || `${type} interaction`,
                description,
                duration,
                recordingUrl,
                recordingDuration,
                callStatus,
                phoneNumber: phoneNumber || lead.phone,
                lead: { connect: { id: leadId } },
                createdBy: { connect: { id: user.id } },
                organisation: { connect: { id: orgId } },
                branch: lead.branchId ? { connect: { id: lead.branchId } } : (user.branchId ? { connect: { id: user.branchId } } : undefined)
            }
        });
        await (0, auditLogger_1.logAudit)({
            organisationId: orgId,
            actorId: user.id,
            action: 'CREATE_INTERACTION',
            entity: 'Interaction',
            entityId: interaction.id,
            details: { type: interaction.type, subject: interaction.subject }
        });
        res.status(201).json(interaction);
    }
    catch (error) {
        console.error('createInteraction Error:', error);
        res.status(400).json({ message: error.message });
    }
};
exports.createInteraction = createInteraction;
// GET /api/leads/:leadId/interactions - Get all interactions for a lead
const getLeadInteractions = async (req, res) => {
    try {
        const { leadId } = req.params;
        const user = req.user;
        const orgId = (0, hierarchyUtils_1.getOrgId)(user);
        if (!orgId && user.role !== 'super_admin') {
            return res.status(400).json({ message: 'Organisation context required' });
        }
        const where = { leadId, isDeleted: false };
        if (orgId)
            where.organisationId = orgId;
        const interactions = await prisma_1.default.interaction.findMany({
            where,
            include: {
                createdBy: {
                    select: { firstName: true, lastName: true, email: true }
                }
            },
            orderBy: { createdAt: 'desc' }
        });
        res.json(interactions);
    }
    catch (error) {
        console.error('getLeadInteractions Error:', error);
        res.status(500).json({ message: error.message });
    }
};
exports.getLeadInteractions = getLeadInteractions;
// GET /api/interactions - Get all interactions (with filters)
const getAllInteractions = async (req, res) => {
    try {
        const user = req.user;
        const orgId = (0, hierarchyUtils_1.getOrgId)(user);
        const { type, startDate, endDate, limit = 50 } = req.query;
        console.log('getAllInteractions called with:', req.query); // Debug
        if (!orgId)
            return res.status(400).json({ message: 'Organisation context required' });
        const where = {
            organisationId: orgId,
            isDeleted: false
        };
        if (user.branchId) {
            where.branchId = user.branchId;
        }
        // Filter: Type
        if (type)
            where.type = type;
        // Filter: Date Range
        if (startDate || endDate) {
            where.createdAt = {};
            if (startDate)
                where.createdAt.gte = new Date(startDate);
            if (endDate)
                where.createdAt.lte = new Date(endDate);
        }
        const interactions = await prisma_1.default.interaction.findMany({
            where,
            include: {
                lead: {
                    select: { id: true, firstName: true, lastName: true, email: true, phone: true }
                },
                createdBy: {
                    select: { firstName: true, lastName: true, email: true }
                }
            },
            take: Number(limit),
            orderBy: { createdAt: 'desc' }
        });
        res.json(interactions);
    }
    catch (error) {
        console.error('getAllInteractions Error:', error);
        res.status(500).json({ message: error.message });
    }
};
exports.getAllInteractions = getAllInteractions;
// PUT /api/interactions/:id/recording - Update interaction with recording URL (for mobile app)
const updateInteractionRecording = async (req, res) => {
    try {
        const { id } = req.params;
        const { recordingUrl, recordingDuration, callStatus } = req.body;
        const user = req.user;
        const orgId = (0, hierarchyUtils_1.getOrgId)(user);
        // Verify interaction exists and belongs to org
        const existing = await prisma_1.default.interaction.findFirst({
            where: { id, ...(orgId ? { organisationId: orgId } : {}) }
        });
        if (!existing)
            return res.status(404).json({ message: 'Interaction not found' });
        const interaction = await prisma_1.default.interaction.update({
            where: { id },
            data: {
                recordingUrl,
                recordingDuration,
                callStatus
            }
        });
        if (orgId || existing.organisationId) {
            await (0, auditLogger_1.logAudit)({
                organisationId: (orgId || existing.organisationId),
                actorId: user.id,
                action: 'UPDATE_INTERACTION_RECORDING',
                entity: 'Interaction',
                entityId: interaction.id
            });
        }
        res.json(interaction);
    }
    catch (error) {
        console.error('updateInteractionRecording Error:', error);
        res.status(400).json({ message: error.message });
    }
};
exports.updateInteractionRecording = updateInteractionRecording;
// Quick log helper for WhatsApp/Call clicks (minimal payload)
const logQuickInteraction = async (req, res) => {
    try {
        const { leadId } = req.params;
        const { type, phoneNumber } = req.body; // type: 'call' | 'whatsapp'
        const user = req.user;
        const orgId = (0, hierarchyUtils_1.getOrgId)(user);
        if (!orgId)
            return res.status(400).json({ message: 'Organisation context required' });
        const lead = await prisma_1.default.lead.findFirst({
            where: { id: leadId, organisationId: orgId },
            include: { branch: true }
        });
        if (!lead)
            return res.status(404).json({ message: 'Lead not found' });
        // Map 'whatsapp' to 'other' since it's not in InteractionType enum
        const interactionType = type === 'whatsapp' ? 'other' : type;
        const interaction = await prisma_1.default.interaction.create({
            data: {
                type: interactionType,
                direction: 'outbound',
                subject: type === 'whatsapp' ? 'WhatsApp Message' : 'Phone Call',
                description: `Initiated ${type} to ${phoneNumber || lead.phone}`,
                phoneNumber: phoneNumber || lead.phone,
                callStatus: 'initiated',
                lead: { connect: { id: leadId } },
                createdBy: { connect: { id: user.id } },
                organisation: { connect: { id: orgId } },
                branch: lead.branchId ? { connect: { id: lead.branchId } } : (user.branchId ? { connect: { id: user.branchId } } : undefined)
            }
        });
        await (0, auditLogger_1.logAudit)({
            organisationId: orgId,
            actorId: user.id,
            action: 'LOG_QUICK_INTERACTION',
            entity: 'Interaction',
            entityId: interaction.id,
            details: { type }
        });
        res.status(201).json(interaction);
    }
    catch (error) {
        console.error('logQuickInteraction Error:', error);
        res.status(400).json({ message: error.message });
    }
};
exports.logQuickInteraction = logQuickInteraction;
//# sourceMappingURL=interactionController.js.map