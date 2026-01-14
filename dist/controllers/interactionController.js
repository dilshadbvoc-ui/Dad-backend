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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.logQuickInteraction = exports.updateInteractionRecording = exports.getLeadInteractions = exports.createInteraction = void 0;
const prisma_1 = __importDefault(require("../config/prisma"));
const hierarchyUtils_1 = require("../utils/hierarchyUtils");
// POST /api/leads/:leadId/interactions - Log a new interaction
const createInteraction = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { leadId } = req.params;
        const user = req.user;
        const orgId = (0, hierarchyUtils_1.getOrgId)(user);
        if (!orgId)
            return res.status(400).json({ message: 'Organisation context required' });
        // Verify lead exists and belongs to org
        const lead = yield prisma_1.default.lead.findFirst({
            where: { id: leadId, organisationId: orgId }
        });
        if (!lead)
            return res.status(404).json({ message: 'Lead not found' });
        const { type, direction = 'outbound', subject, description, duration, recordingUrl, recordingDuration, callStatus, phoneNumber } = req.body;
        const interaction = yield prisma_1.default.interaction.create({
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
                organisation: { connect: { id: orgId } }
            }
        });
        res.status(201).json(interaction);
    }
    catch (error) {
        console.error('createInteraction Error:', error);
        res.status(400).json({ message: error.message });
    }
});
exports.createInteraction = createInteraction;
// GET /api/leads/:leadId/interactions - Get all interactions for a lead
const getLeadInteractions = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
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
        const interactions = yield prisma_1.default.interaction.findMany({
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
});
exports.getLeadInteractions = getLeadInteractions;
// PUT /api/interactions/:id/recording - Update interaction with recording URL (for mobile app)
const updateInteractionRecording = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const { recordingUrl, recordingDuration, callStatus } = req.body;
        const user = req.user;
        const orgId = (0, hierarchyUtils_1.getOrgId)(user);
        // Verify interaction exists and belongs to org
        const existing = yield prisma_1.default.interaction.findFirst({
            where: Object.assign({ id }, (orgId ? { organisationId: orgId } : {}))
        });
        if (!existing)
            return res.status(404).json({ message: 'Interaction not found' });
        const interaction = yield prisma_1.default.interaction.update({
            where: { id },
            data: {
                recordingUrl,
                recordingDuration,
                callStatus
            }
        });
        res.json(interaction);
    }
    catch (error) {
        console.error('updateInteractionRecording Error:', error);
        res.status(400).json({ message: error.message });
    }
});
exports.updateInteractionRecording = updateInteractionRecording;
// Quick log helper for WhatsApp/Call clicks (minimal payload)
const logQuickInteraction = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { leadId } = req.params;
        const { type, phoneNumber } = req.body; // type: 'call' | 'whatsapp'
        const user = req.user;
        const orgId = (0, hierarchyUtils_1.getOrgId)(user);
        if (!orgId)
            return res.status(400).json({ message: 'Organisation context required' });
        const lead = yield prisma_1.default.lead.findFirst({
            where: { id: leadId, organisationId: orgId }
        });
        if (!lead)
            return res.status(404).json({ message: 'Lead not found' });
        // Map 'whatsapp' to 'other' since it's not in InteractionType enum
        const interactionType = type === 'whatsapp' ? 'other' : type;
        const interaction = yield prisma_1.default.interaction.create({
            data: {
                type: interactionType,
                direction: 'outbound',
                subject: type === 'whatsapp' ? 'WhatsApp Message' : 'Phone Call',
                description: `Initiated ${type} to ${phoneNumber || lead.phone}`,
                phoneNumber: phoneNumber || lead.phone,
                callStatus: 'initiated',
                lead: { connect: { id: leadId } },
                createdBy: { connect: { id: user.id } },
                organisation: { connect: { id: orgId } }
            }
        });
        res.status(201).json(interaction);
    }
    catch (error) {
        console.error('logQuickInteraction Error:', error);
        res.status(400).json({ message: error.message });
    }
});
exports.logQuickInteraction = logQuickInteraction;
