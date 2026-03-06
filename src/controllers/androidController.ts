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

        const recording = await prisma.callRecording.create({
            data: {
                leadId,
                duration: parseInt(duration, 10) || 0,
                fileUrl: fileUrl || '', // Prisma schema expects string, could be empty if no audio
                callType: callType || 'UNKNOWN',
                timestamp: timestamp ? new Date(parseInt(timestamp, 10)) : new Date(),
            }
        });

        res.status(201).json({ message: 'Recording uploaded successfully', recording });
    } catch (error) {
        console.error('Error uploading recording:', error);
        res.status(500).json({ error: 'Failed to upload recording' });
    }
};
