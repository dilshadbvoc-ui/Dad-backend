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
                isDeleted: false
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

        const { leadId, duration, callType, timestamp } = req.body;
        const file = req.file;

        if (!leadId) {
            return res.status(400).json({ error: 'leadId is required' });
        }

        // In a production app you would upload this file to S3.
        // For this implementation, we store it locally in the uploads folder and return the URL.
        const fileUrl = file ? `/uploads/${file.filename}` : null;

        // Create Call Recording record
        const recording = await prisma.callRecording.create({
            data: {
                leadId,
                duration: parseInt(duration, 10) || 0,
                fileUrl: fileUrl || '',
                callType: callType || 'UNKNOWN',
                timestamp: timestamp ? new Date(parseInt(timestamp, 10)) : new Date(),
            }
        });

        const interactionDirection = callType === 'OUTGOING' ? 'outbound' : 'inbound';
        const durationSecs = parseInt(duration, 10) || 0;
        const durationMinutes = durationSecs / 60;
        const formattedDescription = `Duration: ${Math.floor(durationSecs / 60)}m ${durationSecs % 60}s${fileUrl ? ' (Recording attached)' : ''}`;

        // Phase 1: Try to find an existing "initiated" interaction to update
        // This links the "Initiated call" entry from CRM with the actual duration from Android
        const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);

        const existingInitiatedInteraction = await prisma.interaction.findFirst({
            where: {
                leadId,
                organisationId: user.organisationId,
                type: 'call',
                callStatus: 'initiated',
                createdAt: { gte: fifteenMinutesAgo }
            },
            orderBy: { createdAt: 'desc' }
        });

        if (existingInitiatedInteraction) {
            await prisma.interaction.update({
                where: { id: existingInitiatedInteraction.id },
                data: {
                    duration: Math.round(durationMinutes * 100) / 100,
                    recordingDuration: durationSecs,
                    recordingUrl: fileUrl || undefined,
                    callStatus: 'completed',
                    description: formattedDescription,
                    // Optionally update the subject to be more descriptive
                    subject: `Completed Call ${callType === 'OUTGOING' ? 'to' : 'from'} Lead`
                }
            });
        } else {
            // Also create an Interaction record so it shows up in "Call Logs" and lead timeline if none was initiated
            await prisma.interaction.create({
                data: {
                    type: 'call',
                    direction: interactionDirection,
                    subject: `Mobile Call ${callType === 'OUTGOING' ? 'to' : 'from'} Lead`,
                    description: formattedDescription,
                    date: timestamp ? new Date(parseInt(timestamp, 10)) : new Date(),
                    duration: Math.round(durationMinutes * 100) / 100, // as minutes, round to 2 decimals
                    recordingUrl: fileUrl || undefined,
                    recordingDuration: durationSecs, // as seconds
                    callStatus: 'completed',
                    leadId,
                    organisationId: user.organisationId,
                    createdById: user.id,
                }
            });
        }

        res.status(201).json({ message: 'Recording and Interaction uploaded successfully', recording });
    } catch (error) {
        console.error('Error uploading recording:', error);
        res.status(500).json({ error: 'Failed to upload recording' });
    }
};
