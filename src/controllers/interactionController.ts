import { Request, Response } from 'express';
import prisma from '../config/prisma';
import { getOrgId } from '../utils/hierarchyUtils';
import { InteractionType, InteractionDirection } from '../generated/client';

// POST /api/leads/:leadId/interactions - Log a new interaction
export const createInteraction = async (req: Request, res: Response) => {
    try {
        const { leadId } = req.params;
        const user = (req as any).user;
        const orgId = getOrgId(user);

        if (!orgId) return res.status(400).json({ message: 'Organisation context required' });

        // Verify lead exists and belongs to org
        const lead = await prisma.lead.findFirst({
            where: { id: leadId, organisationId: orgId }
        });

        if (!lead) return res.status(404).json({ message: 'Lead not found' });

        const {
            type,
            direction = 'outbound',
            subject,
            description,
            duration,
            recordingUrl,
            recordingDuration,
            callStatus,
            phoneNumber
        } = req.body;

        const interaction = await prisma.interaction.create({
            data: {
                type: type as InteractionType,
                direction: direction as InteractionDirection,
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
    } catch (error) {
        console.error('createInteraction Error:', error);
        res.status(400).json({ message: (error as Error).message });
    }
};

// GET /api/leads/:leadId/interactions - Get all interactions for a lead
export const getLeadInteractions = async (req: Request, res: Response) => {
    try {
        const { leadId } = req.params;
        const user = (req as any).user;
        const orgId = getOrgId(user);

        if (!orgId && user.role !== 'super_admin') {
            return res.status(400).json({ message: 'Organisation context required' });
        }

        const where: any = { leadId, isDeleted: false };
        if (orgId) where.organisationId = orgId;

        const interactions = await prisma.interaction.findMany({
            where,
            include: {
                createdBy: {
                    select: { firstName: true, lastName: true, email: true }
                }
            },
            orderBy: { createdAt: 'desc' }
        });

        res.json(interactions);
    } catch (error) {
        console.error('getLeadInteractions Error:', error);
        res.status(500).json({ message: (error as Error).message });
    }
};

// PUT /api/interactions/:id/recording - Update interaction with recording URL (for mobile app)
export const updateInteractionRecording = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { recordingUrl, recordingDuration, callStatus } = req.body;
        const user = (req as any).user;
        const orgId = getOrgId(user);

        // Verify interaction exists and belongs to org
        const existing = await prisma.interaction.findFirst({
            where: { id, ...(orgId ? { organisationId: orgId } : {}) }
        });

        if (!existing) return res.status(404).json({ message: 'Interaction not found' });

        const interaction = await prisma.interaction.update({
            where: { id },
            data: {
                recordingUrl,
                recordingDuration,
                callStatus
            }
        });

        res.json(interaction);
    } catch (error) {
        console.error('updateInteractionRecording Error:', error);
        res.status(400).json({ message: (error as Error).message });
    }
};

// Quick log helper for WhatsApp/Call clicks (minimal payload)
export const logQuickInteraction = async (req: Request, res: Response) => {
    try {
        const { leadId } = req.params;
        const { type, phoneNumber } = req.body; // type: 'call' | 'whatsapp'
        const user = (req as any).user;
        const orgId = getOrgId(user);

        if (!orgId) return res.status(400).json({ message: 'Organisation context required' });

        const lead = await prisma.lead.findFirst({
            where: { id: leadId, organisationId: orgId }
        });

        if (!lead) return res.status(404).json({ message: 'Lead not found' });

        // Map 'whatsapp' to 'other' since it's not in InteractionType enum
        const interactionType = type === 'whatsapp' ? 'other' : type;

        const interaction = await prisma.interaction.create({
            data: {
                type: interactionType as InteractionType,
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
    } catch (error) {
        console.error('logQuickInteraction Error:', error);
        res.status(400).json({ message: (error as Error).message });
    }
};
