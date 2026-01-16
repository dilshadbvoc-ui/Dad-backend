
import { Request, Response } from 'express';
import prisma from '../config/prisma';
import path from 'path';
import fs from 'fs';
import { getOrgId } from '../utils/hierarchyUtils';

export const uploadCallRecording = async (req: Request, res: Response) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: 'No file uploaded' });
        }

        const { phoneNumber, duration, timestamp } = req.body;
        const user = (req as any).user;
        const orgId = getOrgId(user);

        if (!phoneNumber) {
            // If no phone number, we can't link it easily, but we still save the file.
            // Or we could require it. Let's require it for now as the mobile app should parse it.
            return res.status(400).json({ message: 'Phone number is required' });
        }

        // Clean phone number (remove non-digits, maybe keep +)
        const cleanPhone = phoneNumber.replace(/[^0-9]/g, '');

        // Find Lead or Contact
        let entityId = null;
        let entityType = null;

        // Try Lead
        const lead = await prisma.lead.findFirst({
            where: {
                organisationId: orgId || undefined,
                phone: { contains: cleanPhone } // Loose match
            }
        });

        if (lead) {
            entityId = lead.id;
            entityType = 'lead';
        } else {
            // Try Contact (phone is inside JSON usually, but based on recent search fixes, let's try our best)
            // Note: Contact phone search is complex due to JSON. 
            // For now, let's focus on Leads as per prompt requirements usually focusing on Leads.
        }

        // Create Interaction
        const interaction = await prisma.interaction.create({
            data: {
                organisationId: orgId || user.organisationId, // Fallback
                type: 'call',
                subject: `Recorded Call with ${phoneNumber}`,
                description: `Automatic recording upload. Duration: ${duration || '?'}s`,
                date: new Date(parseInt(timestamp) || Date.now()),
                leadId: entityType === 'lead' ? entityId : undefined,
                // contactId: entityType === 'contact' ? entityId : undefined, // If we supported contacts
                createdBy: user.id,
                recordingUrl: `/uploads/recordings/${req.file.filename}`,
                recordingDuration: parseInt(duration) || 0,
                direction: 'outbound' // Assumption for now, or match from mobile params
            }
        });

        res.json({
            message: 'Recording uploaded successfully',
            interactionId: interaction.id,
            linkedTo: entityType ? `${entityType} ${entityId}` : 'Unlinked'
        });

    } catch (error: any) {
        console.error('[Upload Call] Error:', error);
        res.status(500).json({ message: 'Upload failed: ' + error.message });
    }
};
