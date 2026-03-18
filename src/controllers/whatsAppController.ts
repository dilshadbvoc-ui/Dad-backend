import { Request, Response } from 'express';
import prisma from '../config/prisma';

/**
 * POST /api/android/whatsapp/sync
 * Receives WhatsApp message data from the Android accessibility service.
 * Body: { phoneNumber, messageText, direction, timestamp, leadId? }
 */
export const logExternalMessage = async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        if (!user || !user.organisationId) {
            return res.status(401).json({ error: 'Unauthorized.' });
        }

        const { phoneNumber, messageText, direction, timestamp, leadId } = req.body;

        if (!phoneNumber || !messageText) {
            return res.status(400).json({ error: 'phoneNumber and messageText are required.' });
        }

        let targetLeadId = leadId;
        const cleanPhone = phoneNumber.replace(/[^0-9]/g, '');
        const last10 = cleanPhone.slice(-10);

        // 1. Lead Lookup (if not provided or to verify)
        if (!targetLeadId) {
            const lead = await prisma.lead.findFirst({
                where: {
                    organisationId: user.organisationId,
                    phone: { contains: last10 },
                    isDeleted: false
                },
                select: { id: true }
            });
            if (lead) targetLeadId = lead.id;
        }

        // 2. Create Interaction
        // Note: We use 'whatsapp' as the type (added to schema.prisma)
        const interaction = await prisma.interaction.create({
            data: {
                type: 'whatsapp' as any,
                direction: direction === 'inbound' ? 'inbound' : 'outbound',
                subject: direction === 'inbound' ? 'Incoming WhatsApp' : 'Outgoing WhatsApp',
                description: messageText,
                date: timestamp ? new Date(parseInt(timestamp, 10)) : new Date(),
                phoneNumber: phoneNumber,
                leadId: targetLeadId || undefined,
                organisationId: user.organisationId,
                createdById: user.id
            }
        });

        console.log(`[WhatsAppSync] Logged message for ${phoneNumber} (Lead: ${targetLeadId || 'Unknown'})`);
        
        res.status(201).json({ 
            success: true, 
            interactionId: interaction.id,
            linkedToLead: !!targetLeadId 
        });

    } catch (error) {
        console.error('[WhatsAppSync] Error logging external message:', error);
        res.status(500).json({ error: 'Failed to log WhatsApp message' });
    }
};
