
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

        // DUPLICATE CHECK
        const existingInteraction = await prisma.interaction.findFirst({
            where: {
                recordingUrl: `/uploads/recordings/${req.file.filename}`
            }
        });

        if (existingInteraction) {
            return res.json({
                message: 'Recording already exists',
                interactionId: existingInteraction.id,
                linkedTo: entityType ? `${entityType} ${entityId}` : 'Unlinked (Existing)'
            });
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
                createdById: user.id,
                recordingUrl: `/uploads/recordings/${req.file.filename}`,
                recordingDuration: parseInt(duration) || 0,
                direction: 'outbound', // Assumption for now, or match from mobile params
                phoneNumber: phoneNumber,
                callStatus: 'completed'
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

/**
 * Log a call without a recording (for when Android blocks audio capture)
 * POST /api/upload/log-call
 */
export const logCallWithoutRecording = async (req: Request, res: Response) => {
    try {
        const { phoneNumber, duration, timestamp, subject, description } = req.body;
        const user = (req as any).user;
        const orgId = getOrgId(user);

        if (!phoneNumber) {
            return res.status(400).json({ message: 'Phone number is required' });
        }

        // Clean phone number
        const cleanPhone = phoneNumber.replace(/[^0-9]/g, '').slice(-10);

        // Find Lead by phone
        const lead = await prisma.lead.findFirst({
            where: {
                organisationId: orgId || undefined,
                phone: { contains: cleanPhone }
            }
        });

        // Create Interaction (without recording)
        const interaction = await prisma.interaction.create({
            data: {
                organisationId: orgId || user.organisationId,
                type: 'call',
                subject: subject || `Phone Call with ${phoneNumber}`,
                description: description || `Auto-logged call. Duration: ${duration || 0}s. Recording unavailable due to Android restrictions.`,
                date: new Date(parseInt(timestamp) || Date.now()),
                leadId: lead?.id,
                createdById: user.id,
                recordingDuration: parseInt(duration) || 0,
                direction: 'outbound',
                phoneNumber: phoneNumber,
                callStatus: 'completed'
            }
        });

        res.json({
            message: 'Call logged successfully (without recording)',
            interactionId: interaction.id,
            linkedTo: lead ? `lead ${lead.id}` : 'Unlinked'
        });

    } catch (error: any) {
        console.error('[Log Call] Error:', error);
        res.status(500).json({ message: 'Log call failed: ' + error.message });
    }
};

export const uploadGenericImage = async (req: Request, res: Response) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: 'No file uploaded' });
        }
        // Normalize path for frontend use (replace backslashes)
        const fileUrl = `/uploads/images/${req.file.filename}`.replace(/\\/g, '/');

        res.json({
            message: 'Image uploaded successfully',
            url: fileUrl
        });
    } catch (error) {
        console.error('[Upload Image] Error:', error);
        res.status(500).json({ message: 'Upload failed: ' + (error as Error).message });
    }
};
