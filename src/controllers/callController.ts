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
        const { duration, status, notes, scheduleFollowUp } = req.body;
        const callId = req.params.id;

        const updateData: any = {
            callStatus: status || 'completed',
            duration: duration ? Number(duration) / 60 : undefined,
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

        // Logic for Follow-up Task: Explicit override OR Global Setting
        let shouldCreateTask = false;
        let delay = 1; // Default 1 day

        // 1. Check overrides from request
        if (scheduleFollowUp !== undefined && scheduleFollowUp !== null && scheduleFollowUp !== '') {
            shouldCreateTask = String(scheduleFollowUp) === 'true';
        }

        // 2. If no override, check settings
        if (scheduleFollowUp === undefined || scheduleFollowUp === null || scheduleFollowUp === '') {
            if (interaction.organisationId) {
                const settings = await prisma.callSettings.findUnique({
                    where: { organisationId: interaction.organisationId }
                });
                if (settings?.autoFollowupReminder) {
                    shouldCreateTask = true;
                    delay = settings.followupDelayMinutes || 30; // Default 30 mins
                }
            }
        }

        if (shouldCreateTask) {
            const dueDate = new Date();
            dueDate.setMinutes(dueDate.getMinutes() + delay);

            await prisma.task.create({
                data: {
                    subject: `Follow-up: Call with ${interaction.phoneNumber || 'Lead'}`,
                    description: `Follow-up task from call on ${new Date().toLocaleDateString()}.\n\nCall Notes: ${notes || 'None'}`,
                    dueDate: dueDate,
                    status: 'not_started',
                    priority: 'medium',
                    organisation: { connect: { id: interaction.organisationId } },
                    assignedTo: interaction.createdById ? { connect: { id: interaction.createdById } } : undefined,
                    lead: interaction.leadId ? { connect: { id: interaction.leadId } } : undefined,
                    contact: interaction.contactId ? { connect: { id: interaction.contactId } } : undefined,
                }
            });
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

// Get all calls with filters and pagination
export const getAllCalls = async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const orgId = getOrgId(user);

        if (!orgId) return res.status(400).json({ message: 'No org' });

        const {
            page = '1',
            limit = '20',
            direction,
            status,
            userId,
            startDate,
            endDate,
            search
        } = req.query;

        const pageNum = parseInt(page as string, 10);
        const limitNum = parseInt(limit as string, 10);
        const skip = (pageNum - 1) * limitNum;

        // Build where clause
        const where: Record<string, unknown> = {
            organisationId: orgId,
            type: 'call',
            isDeleted: false
        };

        if (direction && direction !== 'all') {
            where.direction = direction;
        }

        if (status && status !== 'all') {
            where.callStatus = status;
        }

        if (userId && userId !== 'all') {
            where.createdById = userId;
        }

        if (startDate || endDate) {
            where.date = {};
            if (startDate) {
                (where.date as Record<string, Date>).gte = new Date(startDate as string);
            }
            if (endDate) {
                (where.date as Record<string, Date>).lte = new Date(endDate as string);
            }
        }

        if (search) {
            where.OR = [
                { phoneNumber: { contains: search as string, mode: 'insensitive' } },
                { subject: { contains: search as string, mode: 'insensitive' } }
            ];
        }

        // Get total count
        const total = await prisma.interaction.count({ where: where as any });

        // Get calls with relations
        const calls = await prisma.interaction.findMany({
            where: where as any,
            include: {
                createdBy: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                        email: true
                    }
                },
                lead: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                        phone: true
                    }
                },
                contact: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true
                    }
                }
            },
            orderBy: { date: 'desc' },
            skip,
            take: limitNum
        });

        res.json({
            calls,
            pagination: {
                page: pageNum,
                limit: limitNum,
                total,
                totalPages: Math.ceil(total / limitNum)
            }
        });
    } catch (error) {
        console.error('Get all calls error:', error);
        res.status(500).json({ message: (error as Error).message });
    }
};

// Get call statistics for dashboard
export const getCallStats = async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const orgId = getOrgId(user);

        if (!orgId) return res.status(400).json({ message: 'No org' });

        const { period = 'week' } = req.query;

        // Calculate date range
        const now = new Date();
        let startDate: Date;

        switch (period) {
            case 'today':
                startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                break;
            case 'week':
                startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                break;
            case 'month':
                startDate = new Date(now.getFullYear(), now.getMonth(), 1);
                break;
            default:
                startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        }

        const baseWhere = {
            organisationId: orgId,
            type: 'call' as const,
            isDeleted: false,
            date: { gte: startDate }
        };

        // Total calls
        const totalCalls = await prisma.interaction.count({ where: baseWhere });

        // Calls by direction
        const outboundCalls = await prisma.interaction.count({
            where: { ...baseWhere, direction: 'outbound' }
        });
        const inboundCalls = await prisma.interaction.count({
            where: { ...baseWhere, direction: 'inbound' }
        });

        // Missed calls
        const missedCalls = await prisma.interaction.count({
            where: { ...baseWhere, callStatus: 'missed' }
        });

        // Completed calls
        const completedCalls = await prisma.interaction.count({
            where: { ...baseWhere, callStatus: 'completed' }
        });

        // Average duration (for completed calls with duration)
        const callsWithDuration = await prisma.interaction.findMany({
            where: {
                ...baseWhere,
                callStatus: 'completed',
                duration: { not: null }
            },
            select: { duration: true }
        });

        const avgDuration = callsWithDuration.length > 0
            ? callsWithDuration.reduce((sum, c) => sum + (c.duration || 0), 0) / callsWithDuration.length
            : 0;

        // Calls with recordings
        const callsWithRecording = await prisma.interaction.count({
            where: {
                ...baseWhere,
                recordingUrl: { not: null }
            }
        });

        res.json({
            totalCalls,
            outboundCalls,
            inboundCalls,
            missedCalls,
            completedCalls,
            avgDuration: Math.round(avgDuration * 10) / 10, // Round to 1 decimal
            callsWithRecording,
            period
        });
    } catch (error) {
        console.error('Get call stats error:', error);
        res.status(500).json({ message: (error as Error).message });
    }
};

// Delete a call recording
export const deleteRecording = async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const orgId = getOrgId(user);
        const { id } = req.params;

        if (!orgId) return res.status(400).json({ message: 'No org' });

        // Find the call
        const call = await prisma.interaction.findFirst({
            where: {
                id,
                organisationId: orgId,
                type: 'call'
            }
        });

        if (!call) {
            return res.status(404).json({ message: 'Call not found' });
        }

        if (!call.recordingUrl) {
            return res.status(400).json({ message: 'No recording to delete' });
        }

        // Delete the file
        const filename = call.recordingUrl.split('/').pop();
        if (filename) {
            const filePath = path.join(uploadDir, filename);
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
        }

        // Update the call record
        await prisma.interaction.update({
            where: { id },
            data: {
                recordingUrl: null,
                recordingDuration: null
            }
        });

        res.json({ message: 'Recording deleted successfully' });
    } catch (error) {
        console.error('Delete recording error:', error);
        res.status(500).json({ message: (error as Error).message });
    }
};
