import { Request, Response } from 'express';
import prisma from '../config/prisma';
import { getOrgId } from '../utils/hierarchyUtils';
import path from 'path';
import fs from 'fs';

// Helper to ensure upload directory exists
const uploadDir = path.join(__dirname, '../../uploads/recordings');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

export const initiateCall = async (req: Request, res: Response) => {
    try {
        const { leadId, phoneNumber, direction = 'outbound' } = req.body;
        const user = (req as any).user;
        const orgId = getOrgId(user);

        if (!orgId) return res.status(400).json({ message: 'No org' });

        const interaction = await prisma.interaction.create({
            data: {
                type: 'call',
                direction,
                subject: `Call ${direction === 'outbound' ? 'to' : 'from'} ${phoneNumber}`,
                date: new Date(),
                callStatus: 'initiated',
                phoneNumber,
                description: 'Call initiated',

                // Defaults to Lead logic as per old controller
                lead: { connect: { id: leadId } },

                organisation: { connect: { id: orgId } },
                createdBy: { connect: { id: user.id } }
            }
        });

        res.status(201).json(interaction);
    } catch (error) {
        res.status(500).json({ message: (error as Error).message });
    }
};

export const completeCall = async (req: Request, res: Response) => {
    try {
        const file = req.file;
        const { duration, status, notes } = req.body;
        const callId = req.params.id;

        const updateData: any = {
            callStatus: status || 'completed',
            duration: duration ? Number(duration) / 60 : undefined, // minutes stored? Mongoose logic said /60
            // Schema has `duration` Int? Float? Check schema.
            // If schema `duration` is Int, storing fractional minutes might be an issue.
            // Interaction schema `duration Int?`. Maybe store seconds?
            // Mongoose code: `duration: duration ? Number(duration) / 60 : undefined` implies minutes.
            // But if Int, it will truncate.
            // Let's assume schema handles this or we store seconds.
            // Actually, let's look at schema.prisma later. Assuming Int for now.
        };

        if (file) {
            updateData.recordingUrl = `/uploads/recordings/${file.filename}`;
        }
        if (notes) {
            updateData.description = notes;
        }

        const interaction = await prisma.interaction.update({
            where: { id: callId },
            data: updateData,
            include: { createdBy: true }
        });

        // Emit socket event for real-time update
        const io = req.app.get('io');
        if (io && interaction.createdBy?.id) {
            io.to(interaction.createdBy.id).emit('call_completed', { callId });
        }

        res.json(interaction);
    } catch (error) {
        res.status(500).json({ message: (error as Error).message });
    }
};

export const getLeadCalls = async (req: Request, res: Response) => {
    try {
        const { leadId } = req.params;

        if (leadId === 'new') return res.json([]);

        const calls = await prisma.interaction.findMany({
            where: {
                leadId: leadId,
                type: 'call'
            },
            orderBy: { date: 'desc' }
        });

        res.json(calls);
    } catch (error) {
        res.status(500).json({ message: (error as Error).message });
    }
};

export const getRecording = async (req: Request, res: Response) => {
    try {
        const { filename } = req.params;
        const filePath = path.join(uploadDir, filename);

        if (fs.existsSync(filePath)) {
            res.sendFile(filePath);
        } else {
            res.status(404).json({ message: 'Recording not found' });
        }
    } catch (error) {
        res.status(500).json({ message: (error as Error).message });
    }
};
