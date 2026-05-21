"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.logQuickInteraction = exports.updateInteractionRecording = exports.getAllInteractions = exports.getLeadInteractions = exports.createInteraction = exports.createInteractionGeneric = void 0;
const prisma_1 = __importDefault(require("../config/prisma"));
const hierarchyUtils_1 = require("../utils/hierarchyUtils");
const callUtils_1 = require("../utils/callUtils");
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
        const { lead, contact, account, opportunity, type, direction = 'outbound', subject, description, duration, recordingUrl, recordingDuration, callStatus, phoneNumber, date, hardwareId, callSessionId, hardwareDuration, onModel, relatedTo } = req.body;
        const data = {
            type: type,
            direction: direction,
            subject: subject || `${type} interaction`,
            description,
            duration,
            recordingUrl,
            recordingDuration,
            hardwareDuration,
            callStatus: callStatus || (type === 'call' ? 'completed' : undefined),
            phoneNumber,
            hardwareId,
            callSessionId,
            date: date ? new Date(date) : new Date(),
            createdBy: { connect: { id: user.id } },
            branch: user.branchId ? { connect: { id: user.branchId } } : (req.body.branchId ? { connect: { id: req.body.branchId } } : undefined)
        };
        // Synchronize units
        if (type === 'call') {
            (0, callUtils_1.synchronizeDurations)(data);
            if (!description || description.trim() === '') {
                const bestSecs = (0, callUtils_1.resolveBestDurationSeconds)(data);
                if (bestSecs > 0) {
                    data.description = (0, callUtils_1.formatCallDurationDescription)(bestSecs, {
                        isCarrierVerified: !!data.hardwareDuration
                    });
                }
            }
        }
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
        // Support polymorphic relatedTo/onModel pattern (standard across frontend)
        if (req.body.relatedTo && req.body.onModel) {
            const { relatedTo, onModel } = req.body;
            if (onModel === 'Lead')
                data.lead = { connect: { id: relatedTo } };
            else if (onModel === 'Contact')
                data.contact = { connect: { id: relatedTo } };
            else if (onModel === 'Account')
                data.account = { connect: { id: relatedTo } };
            else if (onModel === 'Opportunity')
                data.opportunity = { connect: { id: relatedTo } };
        }
        // Automatic Lookup by Phone Number (if no lead/contact ID provided)
        // This helps associate calls from the mobile app with CRM records even if the app didn't do the lookup
        if (!data.lead && !data.contact && phoneNumber && orgId) {
            const cleanPhone = phoneNumber.replace(/[^0-9]/g, '');
            const last10 = cleanPhone.slice(-10);
            if (last10.length >= 10) {
                const variations = Array.from(new Set([
                    last10,
                    `+91${last10}`,
                    `91${last10}`,
                    `0${last10}`,
                    cleanPhone,
                    phoneNumber
                ].filter(Boolean)));
                const matchedLead = await prisma_1.default.lead.findFirst({
                    where: {
                        organisationId: orgId,
                        isDeleted: false,
                        OR: [
                            { phone: { in: variations } },
                            { secondaryPhone: { in: variations } }
                        ]
                    },
                    select: { id: true }
                });
                if (matchedLead) {
                    data.lead = { connect: { id: matchedLead.id } };
                }
                else {
                    // Try Contact if no lead
                    const matchedContact = await prisma_1.default.contact.findFirst({
                        where: {
                            organisationId: orgId,
                            isDeleted: false,
                            OR: [
                                { phones: { path: ['$[*]'], string_contains: last10 } }, // Simplification for json phones
                                { phones: { string_contains: last10 } }
                            ]
                        },
                        select: { id: true }
                    });
                    if (matchedContact) {
                        data.contact = { connect: { id: matchedContact.id } };
                    }
                }
            }
        }
        // Logic for Non-CRM Contact Synchronization
        // If it's a call and not connected to any known entity, check settings
        const isConnected = data.lead || data.contact || data.account || data.opportunity;
        if (type === 'call' && !isConnected && orgId) {
            const settings = await prisma_1.default.callSettings.findUnique({
                where: { organisationId: orgId }
            });
            // If settings missing or null, default to true (to match previous behavior)
            const canSync = settings?.syncNonCrmContacts ?? true;
            if (!canSync) {
                return res.status(400).json({
                    message: 'Contact synchronization is disabled. Interactions can only be logged for existing Leads or Contacts.'
                });
            }
        }
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
        // Update Lead/Contact lastContactDate if applicable
        if (type === 'call' || type === 'meeting' || type === 'other') {
            if (lead) {
                const leadRecord = await prisma_1.default.lead.findUnique({ where: { id: lead }, select: { status: true } });
                const newStatus = (leadRecord?.status === 'new' && (type === 'call' || type === 'meeting' || type === 'whatsapp')) ? 'contacted' : undefined;
                await prisma_1.default.lead.update({
                    where: { id: lead },
                    data: {
                        lastContactDate: interaction.date,
                        ...(newStatus ? { status: newStatus } : {})
                    }
                }).catch(() => { });
                if (newStatus) {
                    await prisma_1.default.leadHistory.create({
                        data: {
                            leadId: lead,
                            fieldName: 'status',
                            oldValue: 'new',
                            newValue: newStatus,
                            changedById: user.id,
                            reason: 'Auto-updated via Manual Interaction Logging'
                        }
                    }).catch(() => { });
                }
            }
            if (contact) {
                await prisma_1.default.contact.update({
                    where: { id: contact },
                    data: { lastActivity: interaction.date }
                }).catch(() => { });
            }
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
                date: req.body.date ? new Date(req.body.date) : new Date(),
                lead: { connect: { id: leadId } },
                createdBy: { connect: { id: user.id } },
                organisation: { connect: { id: orgId } },
                branch: lead.branchId ? { connect: { id: lead.branchId } } : (user.branchId ? { connect: { id: user.branchId } } : undefined)
            }
        });
        // Update lead's lastContactDate
        await prisma_1.default.lead.update({
            where: { id: leadId },
            data: { lastContactDate: interaction.date }
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
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
        const where = {
            leadId,
            isDeleted: false,
            OR: [
                { callStatus: { not: 'initiated' } },
                { createdAt: { gte: oneHourAgo } }
            ]
        };
        if (orgId)
            where.organisationId = orgId;
        // Hierarchy filtering:
        // You can see interactions if:
        // 1. You or your subordinates created it
        // 2. You or your subordinates are the owner of the lead
        if (user.role !== 'super_admin' && user.role !== 'admin') {
            const visibleUserIds = await (0, hierarchyUtils_1.getVisibleUserIds)(user.id);
            where.OR = [
                { createdById: { in: visibleUserIds } },
                { lead: { assignedToId: { in: visibleUserIds } } },
                { createdById: null } // System generated or imported
            ];
        }
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
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
        const where = {
            organisationId: orgId,
            isDeleted: false,
            OR: [
                { callStatus: { not: 'initiated' } },
                { createdAt: { gte: oneHourAgo } }
            ]
        };
        if (user.branchId) {
            where.branchId = user.branchId;
        }
        // Hierarchy filtering:
        if (user.role !== 'super_admin' && user.role !== 'admin') {
            const visibleUserIds = await (0, hierarchyUtils_1.getVisibleUserIds)(user.id);
            where.OR = [
                { createdById: { in: visibleUserIds } },
                { lead: { assignedToId: { in: visibleUserIds } } },
                { contact: { ownerId: { in: visibleUserIds } } },
                { account: { ownerId: { in: visibleUserIds } } },
                { opportunity: { ownerId: { in: visibleUserIds } } },
                { createdById: null }
            ];
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
        const { type, phoneNumber, callSessionId } = req.body; // type: 'call' | 'whatsapp'
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
        // Map incoming type to standard enum
        const interactionType = (type === 'whatsapp' || type === 'whatsapp-call') ? 'whatsapp' : (type === 'call' ? 'call' : 'other');
        // DEDUPLICATION: Check if an 'initiated' interaction already exists for this lead/user/phone in last 60s
        const recentWindow = new Date(Date.now() - 60 * 1000);
        const existingInteraction = await prisma_1.default.interaction.findFirst({
            where: {
                leadId,
                createdById: user.id,
                phoneNumber: phoneNumber || lead.phone,
                type: interactionType,
                callStatus: 'initiated',
                createdAt: { gte: recentWindow }
            }
        });
        if (existingInteraction) {
            console.log(`[Interaction] Reusing existing initiated interaction ${existingInteraction.id} for lead ${leadId}`);
            // Update session ID if it was missing but now provided
            if (callSessionId && !existingInteraction.callSessionId) {
                await prisma_1.default.interaction.update({
                    where: { id: existingInteraction.id },
                    data: { callSessionId }
                });
            }
            return res.status(200).json(existingInteraction);
        }
        const subjectValue = type === 'whatsapp-call' ? 'WhatsApp Call' : (type === 'whatsapp' ? 'WhatsApp Message' : 'Phone Call');
        const descriptionValue = type === 'whatsapp-call' ? `Initiated WhatsApp voice call to ${phoneNumber || lead.phone}` : `Initiated ${type} to ${phoneNumber || lead.phone}`;
        const interaction = await prisma_1.default.interaction.create({
            data: {
                type: interactionType,
                direction: 'outbound',
                subject: subjectValue,
                description: descriptionValue,
                phoneNumber: phoneNumber || lead.phone,
                callStatus: 'initiated',
                callSessionId: callSessionId || undefined,
                lead: { connect: { id: leadId } },
                createdBy: { connect: { id: user.id } },
                organisation: { connect: { id: orgId } },
                branch: lead.branchId ? { connect: { id: lead.branchId } } : (user.branchId ? { connect: { id: user.branchId } } : undefined)
            }
        });
        // Update lead's lastContactDate
        await prisma_1.default.lead.update({
            where: { id: leadId },
            data: { lastContactDate: interaction.date }
        });
        await (0, auditLogger_1.logAudit)({
            organisationId: orgId,
            actorId: user.id,
            action: 'LOG_QUICK_INTERACTION',
            entity: 'Interaction',
            entityId: interaction.id,
            details: {
                type,
                name: `${lead.firstName} ${lead.lastName || ''}`.trim()
            }
        });
        res.status(201).json(interaction);
    }
    catch (error) {
        console.error('logQuickInteraction Error:', error);
        res.status(400).json({ message: error.message });
    }
};
exports.logQuickInteraction = logQuickInteraction;
