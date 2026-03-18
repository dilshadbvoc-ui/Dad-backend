import { Request, Response } from 'express';
import prisma from '../config/prisma';
import fs from 'fs';
import path from 'path';

// GET /api/android/leads
// Returns minimal lead data (phone, id, name) for the Android app to cache locally.
// Requires organization context from auth middleware.
export const getAndroidLeads = async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        if (!user || !user.organisationId) {
            return res.status(401).json({ error: 'Unauthorized. Organisation ID missing.' });
        }

        const leads = await prisma.lead.findMany({
            where: {
                organisationId: user.organisationId,
                isDeleted: false,
                phone: { not: '' }
            },
            select: {
                id: true,
                phone: true,
                firstName: true,
                lastName: true
            }
        });

        res.status(200).json({ leads });
    } catch (error) {
        console.error('Error fetching android leads:', error);
        res.status(500).json({ error: 'Failed to fetch leads' });
    }
};

// POST /api/android/recordings
// Handles multipart/form-data with 'audio' file and metadata fields
export const uploadCallRecording = async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        if (!user || !user.organisationId) {
            return res.status(401).json({ error: 'Unauthorized.' });
        }

        const { leadId, duration, callType, timestamp, phoneNumber } = req.body;
        console.log(`[AndroidUpload] Incoming request: phone=${phoneNumber}, leadId=${leadId}, duration=${duration}, type=${callType}`);
        
        const file = req.file;

        let targetLeadId = leadId;
        let finalPhone = phoneNumber;

        // Fallback: If no leadId OR if the provided leadId has no phone (ghost lead), try to find lead by phone number
        let leadByPhone = null;
        if (phoneNumber) {
            const cleanPhone = phoneNumber.replace(/[^0-9]/g, '');
            const last10 = cleanPhone.slice(-10);
            
            leadByPhone = await prisma.lead.findFirst({
                where: {
                    organisationId: user.organisationId,
                    phone: { contains: last10 }
                },
                select: { id: true, phone: true, firstName: true }
            });
        }

        if (!targetLeadId && leadByPhone) {
            console.log(`[AndroidUpload] No leadId provided. Found lead matching phone: ${leadByPhone.id}`);
            targetLeadId = leadByPhone.id;
            finalPhone = leadByPhone.phone;
        } else if (targetLeadId && leadByPhone && targetLeadId !== leadByPhone.id) {
            // Mismatch detected: App sent a leadId, but DB finds a different lead for this phone
            // This happens if the App's local cache has a "ghost" lead (empty phone) matched to this call
            console.warn(`[AndroidUpload] Mismatch: App sent leadId=${targetLeadId}, but phone matches leadId=${leadByPhone.id} (${leadByPhone.firstName}). Overriding.`);
            targetLeadId = leadByPhone.id;
            finalPhone = leadByPhone.phone;
        } else if (targetLeadId && !leadByPhone && phoneNumber) {
            // App sent a leadId, but no lead matches this phone in DB. 
            // Check if the provided leadId is a "ghost" (no phone number).
            const providedLead = await prisma.lead.findUnique({
                where: { id: targetLeadId },
                select: { phone: true, firstName: true }
            });

            if (providedLead && (!providedLead.phone || providedLead.phone.trim() === '')) {
                console.warn(`[AndroidUpload] Strict Unlink: App sent ghost leadId=${targetLeadId} (${providedLead.firstName}) for unknown phone ${phoneNumber}. Unlinking.`);
                targetLeadId = null;
            }
        } else if (!targetLeadId && !leadByPhone && phoneNumber) {
            console.warn(`[AndroidUpload] No lead found in DB for phone: ${phoneNumber}`);
        }

        if (!targetLeadId && !phoneNumber) {
            console.error(`[AndroidUpload] Upload failed: No leadId and no phoneNumber`);
            return res.status(400).json({ error: 'leadId or phoneNumber is required' });
        }

        // Create recording record (linked to lead if found)
        console.log(`[AndroidUpload] Creating CallRecording record (targetLeadId=${targetLeadId || 'null'})`);
        const recording = await prisma.callRecording.create({
            data: {
                leadId: targetLeadId || undefined,
                duration: parseInt(duration, 10) || 0,
                fileUrl: file ? `/uploads/${file.filename}` : '',
                callType: callType || 'UNKNOWN',
                timestamp: timestamp ? new Date(parseInt(timestamp, 10)) : new Date(),
            }
        });

        const durationSecs = parseInt(duration, 10) || 0;
        const durationMinutes = durationSecs / 60;
        const formattedDescription = `Duration: ${Math.floor(durationSecs / 60)}m ${durationSecs % 60}s${file ? ' (Recording attached)' : ''}`;

        // Link to existing "initiated" or "completed" interaction (that's missing a recording)
        // Expand window to 4 hours to account for long calls or delayed sync
        const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000);
        console.log(`[AndroidUpload] Searching for interaction within last 4 hours for mapping (Lead: ${targetLeadId}, Phone: ${phoneNumber})...`);
        
        const existingInteraction = await prisma.interaction.findFirst({
            where: {
                organisationId: user.organisationId,
                type: 'call',
                callStatus: { in: ['initiated', 'completed'] },
                recordingUrl: null, // Only link if it doesn't have a recording already
                createdAt: { gte: fourHoursAgo },
                OR: [
                    targetLeadId ? { leadId: targetLeadId } : {},
                    phoneNumber ? { phoneNumber: { contains: phoneNumber.slice(-10) } } : {}
                ].filter(condition => Object.keys(condition).length > 0)
            },
            orderBy: { createdAt: 'desc' }
        });

        if (existingInteraction) {
            console.log(`[AndroidUpload] Mapping duration to existing interaction: ${existingInteraction.id} (Status: ${existingInteraction.callStatus})`);
            await prisma.interaction.update({
                where: { id: existingInteraction.id },
                data: {
                    duration: Math.round(durationMinutes * 100) / 100,
                    recordingDuration: durationSecs,
                    recordingUrl: recording.fileUrl,
                    callStatus: 'completed',
                    leadId: targetLeadId || undefined,
                    phoneNumber: phoneNumber || undefined
                }
            });
        } else if (targetLeadId) {
            console.log(`[AndroidUpload] No initiated interaction found. Creating new 'completed' record for leadId: ${targetLeadId}`);
            // Create new if none initiated but lead exists
            await prisma.interaction.create({
                data: {
                    type: 'call',
                    direction: callType === 'OUTGOING' ? 'outbound' : 'inbound',
                    subject: `Mobile Call ${callType === 'OUTGOING' ? 'to' : 'from'} Lead`,
                    description: formattedDescription,
                    date: timestamp ? new Date(parseInt(timestamp, 10)) : new Date(),
                    duration: Math.round(durationMinutes * 100) / 100,
                    recordingDuration: durationSecs,
                    callStatus: 'completed',
                    leadId: targetLeadId,
                    organisationId: user.organisationId,
                    createdById: user.id,
                    phoneNumber: finalPhone
                }
            });
        } else {
             console.warn(`[AndroidUpload] Could not link duration to lead or initiated interaction.`);
        }

        res.status(201).json({ message: 'Recording and Interaction uploaded successfully', recording });
    } catch (error) {
        console.error('[AndroidUpload] CRITICAL ERROR during upload:', error);
        res.status(500).json({ error: 'Failed to upload recording' });
    }
};
