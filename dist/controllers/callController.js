"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getUserCallAnalytics = exports.deleteRecording = exports.getCallStats = exports.getAllCalls = exports.getRecording = exports.getLeadCalls = exports.completeCall = exports.initiateCall = void 0;
const prisma_1 = __importDefault(require("../config/prisma"));
const hierarchyUtils_1 = require("../utils/hierarchyUtils");
const followUpService_1 = require("../services/followUpService");
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
// Helper to ensure upload directory exists
const uploadDir = path_1.default.join(__dirname, '../../uploads/recordings');
if (!fs_1.default.existsSync(uploadDir)) {
    fs_1.default.mkdirSync(uploadDir, { recursive: true });
}
const initiateCall = async (req, res) => {
    try {
        const { leadId, phoneNumber, direction = 'outbound' } = req.body;
        const user = req.user;
        const orgId = (0, hierarchyUtils_1.getOrgId)(user);
        if (!orgId)
            return res.status(400).json({ message: 'No org' });
        const interaction = await prisma_1.default.interaction.create({
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
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.initiateCall = initiateCall;
const completeCall = async (req, res) => {
    try {
        const file = req.file;
        const { duration, status, notes, scheduleFollowUp } = req.body;
        const callId = req.params.id;
        const updateData = {
            callStatus: status || 'completed',
            duration: duration ? Number(duration) / 60 : undefined,
        };
        if (file) {
            updateData.recordingUrl = `/uploads/recordings/${file.filename}`;
        }
        if (notes) {
            updateData.description = notes;
        }
        const interaction = await prisma_1.default.interaction.update({
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
                const settings = await prisma_1.default.callSettings.findUnique({
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
            await prisma_1.default.followUp.create({
                data: {
                    subject: `Follow-up: Call with ${interaction.phoneNumber || 'Lead'}`,
                    description: `Follow-up scheduled from call on ${new Date().toLocaleDateString()}.\n\nCall Notes: ${notes || 'None'}`,
                    dueDate: dueDate,
                    status: 'not_started',
                    priority: 'medium',
                    organisation: interaction.organisationId ? { connect: { id: interaction.organisationId } } : undefined,
                    assignedTo: interaction.createdById ? { connect: { id: interaction.createdById } } : undefined,
                    lead: interaction.leadId ? { connect: { id: interaction.leadId } } : undefined,
                    contact: interaction.contactId ? { connect: { id: interaction.contactId } } : undefined,
                }
            });
            // Sync Lead follow-up date using the dedicated service
            if (interaction.leadId) {
                await followUpService_1.FollowUpService.syncLeadFollowUp(interaction.leadId);
            }
        }
        res.json(interaction);
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.completeCall = completeCall;
const getLeadCalls = async (req, res) => {
    try {
        const { leadId } = req.params;
        const user = req.user;
        if (leadId === 'new')
            return res.json([]);
        const where = {
            leadId: leadId,
            type: 'call',
            isDeleted: false
        };
        // Hierarchy filtering
        if (user.role !== 'admin' && user.role !== 'super_admin') {
            const visibleUserIds = await (0, hierarchyUtils_1.getVisibleUserIds)(user.id);
            where.createdById = { in: visibleUserIds };
        }
        const calls = await prisma_1.default.interaction.findMany({
            where,
            orderBy: { date: 'desc' }
        });
        res.json(calls);
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.getLeadCalls = getLeadCalls;
const getRecording = async (req, res) => {
    try {
        const { filename } = req.params;
        const filePath = path_1.default.join(uploadDir, filename);
        if (fs_1.default.existsSync(filePath)) {
            res.sendFile(filePath);
        }
        else {
            res.status(404).json({ message: 'Recording not found' });
        }
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.getRecording = getRecording;
// Get all calls with filters and pagination
const getAllCalls = async (req, res) => {
    try {
        const user = req.user;
        const orgId = (0, hierarchyUtils_1.getOrgId)(user);
        if (!orgId)
            return res.status(400).json({ message: 'No org' });
        const { page = '1', limit = '20', direction, status, userId, startDate, endDate, search } = req.query;
        const pageNum = parseInt(page, 10);
        const limitNum = parseInt(limit, 10);
        const skip = (pageNum - 1) * limitNum;
        // Build where clause
        const where = {
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
        if (user.role !== 'admin' && user.role !== 'super_admin') {
            const visibleUserIds = await (0, hierarchyUtils_1.getVisibleUserIds)(user.id);
            if (userId && userId !== 'all') {
                // If filtering by specific user, ensure that user is in allowed hierarchy
                if (visibleUserIds.includes(userId)) {
                    where.createdById = userId;
                }
                else {
                    // Not authorized to view this user's calls
                    where.createdById = 'none';
                }
            }
            else {
                where.createdById = { in: visibleUserIds };
            }
        }
        else if (userId && userId !== 'all') {
            // Admin/Super Admin can filter by any user
            where.createdById = userId;
        }
        if (startDate || endDate) {
            where.date = {};
            if (startDate) {
                where.date.gte = new Date(startDate);
            }
            if (endDate) {
                where.date.lte = new Date(endDate);
            }
        }
        if (search) {
            where.OR = [
                { phoneNumber: { contains: search, mode: 'insensitive' } },
                { subject: { contains: search, mode: 'insensitive' } }
            ];
        }
        // Get total count
        const total = await prisma_1.default.interaction.count({ where: where });
        // Get calls with relations
        const calls = await prisma_1.default.interaction.findMany({
            where: where,
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
                        phone: true,
                        company: true
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
    }
    catch (error) {
        console.error('Get all calls error:', error);
        res.status(500).json({ message: error.message });
    }
};
exports.getAllCalls = getAllCalls;
// Get call statistics for dashboard
const getCallStats = async (req, res) => {
    try {
        const user = req.user;
        const orgId = (0, hierarchyUtils_1.getOrgId)(user);
        if (!orgId)
            return res.status(400).json({ message: 'No org' });
        const { period = 'week' } = req.query;
        // Calculate date range
        const now = new Date();
        let startDate;
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
            type: 'call',
            isDeleted: false,
            date: { gte: startDate }
        };
        // Hierarchy filtering
        if (user.role !== 'admin' && user.role !== 'super_admin') {
            const visibleUserIds = await (0, hierarchyUtils_1.getVisibleUserIds)(user.id);
            baseWhere.createdById = { in: visibleUserIds };
        }
        // Total calls
        const totalCalls = await prisma_1.default.interaction.count({ where: baseWhere });
        // Calls by direction
        const outboundCalls = await prisma_1.default.interaction.count({
            where: { ...baseWhere, direction: 'outbound' }
        });
        const inboundCalls = await prisma_1.default.interaction.count({
            where: { ...baseWhere, direction: 'inbound' }
        });
        // Missed calls
        const missedCalls = await prisma_1.default.interaction.count({
            where: { ...baseWhere, callStatus: 'missed' }
        });
        // Completed calls
        const completedCalls = await prisma_1.default.interaction.count({
            where: { ...baseWhere, callStatus: 'completed' }
        });
        // Average duration (for completed calls with duration or recordingDuration)
        const callsWithDuration = await prisma_1.default.interaction.findMany({
            where: {
                ...baseWhere,
                callStatus: 'completed',
                OR: [
                    { duration: { gt: 0 } },
                    { recordingDuration: { gt: 0 } }
                ]
            },
            select: { duration: true, recordingDuration: true }
        });
        let totalSeconds = 0;
        let validCalls = 0;
        callsWithDuration.forEach(c => {
            if (c.recordingDuration && c.recordingDuration > 0) {
                totalSeconds += c.recordingDuration;
                validCalls++;
            }
            else if (c.duration && c.duration > 0) {
                totalSeconds += c.duration * 60;
                validCalls++;
            }
        });
        const avgDuration = validCalls > 0 ? (totalSeconds / validCalls) / 60 : 0;
        // Calls with recordings
        const callsWithRecording = await prisma_1.default.interaction.count({
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
    }
    catch (error) {
        console.error('Get call stats error:', error);
        res.status(500).json({ message: error.message });
    }
};
exports.getCallStats = getCallStats;
// Delete a call recording
const deleteRecording = async (req, res) => {
    try {
        const user = req.user;
        const orgId = (0, hierarchyUtils_1.getOrgId)(user);
        const { id } = req.params;
        if (!orgId)
            return res.status(400).json({ message: 'No org' });
        // Find the call
        const call = await prisma_1.default.interaction.findFirst({
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
            const filePath = path_1.default.join(uploadDir, filename);
            if (fs_1.default.existsSync(filePath)) {
                fs_1.default.unlinkSync(filePath);
            }
        }
        // Update the call record
        await prisma_1.default.interaction.update({
            where: { id },
            data: {
                recordingUrl: null,
                recordingDuration: null
            }
        });
        res.json({ message: 'Recording deleted successfully' });
    }
    catch (error) {
        console.error('Delete recording error:', error);
        res.status(500).json({ message: error.message });
    }
};
exports.deleteRecording = deleteRecording;
// Get per-user call analytics for reports
const getUserCallAnalytics = async (req, res) => {
    try {
        const user = req.user;
        const orgId = (0, hierarchyUtils_1.getOrgId)(user);
        if (!orgId)
            return res.status(400).json({ message: 'No org' });
        const { period = 'today', direction } = req.query; // direction: all, inbound, outbound
        // Calculate date range
        const now = new Date();
        let startDate;
        switch (period) {
            case 'today':
                startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                break;
            case 'yesterday':
                startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
                const endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                break;
            case 'week':
                startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                break;
            case 'month':
                startDate = new Date(now.getFullYear(), now.getMonth(), 1);
                break;
            default:
                startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        }
        const baseWhere = {
            organisationId: orgId,
            type: 'call',
            isDeleted: false,
            date: { gte: startDate }
        };
        if (period === 'yesterday') {
            const yesterdayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            baseWhere.date = { gte: startDate, lt: yesterdayEnd };
        }
        if (direction && direction !== 'all') {
            baseWhere.direction = direction;
        }
        // Hierarchy filtering
        const visibleUserIds = await (0, hierarchyUtils_1.getVisibleUserIds)(user.id);
        baseWhere.createdById = { in: visibleUserIds };
        // Fetch all relevant interactions
        const interactions = await prisma_1.default.interaction.findMany({
            where: baseWhere,
            select: {
                createdById: true,
                callStatus: true,
                duration: true,
                recordingDuration: true,
                direction: true
            }
        });
        // Fetch users to map names
        const users = await prisma_1.default.user.findMany({
            where: { id: { in: visibleUserIds } },
            select: {
                id: true,
                firstName: true,
                lastName: true
            }
        });
        // Aggregate by user
        const userStatsMap = {};
        // Initialize for all visible users
        users.forEach(u => {
            userStatsMap[u.id] = {
                userId: u.id,
                agentName: `${u.firstName} ${u.lastName || ''}`.trim(),
                totalCalls: 0,
                connectedCalls: 0,
                totalDurationSeconds: 0
            };
        });
        interactions.forEach(i => {
            if (i.createdById && userStatsMap[i.createdById]) {
                const stats = userStatsMap[i.createdById];
                stats.totalCalls++;
                if (i.callStatus === 'completed') {
                    stats.connectedCalls++;
                    // Duration: duration is in mins, recordingDuration is in seconds
                    if (i.recordingDuration && i.recordingDuration > 0) {
                        stats.totalDurationSeconds += i.recordingDuration;
                    }
                    else if (i.duration && i.duration > 0) {
                        stats.totalDurationSeconds += i.duration * 60;
                    }
                }
            }
        });
        const reportData = Object.values(userStatsMap)
            .sort((a, b) => b.totalCalls - a.totalCalls);
        res.json({
            reportData,
            period,
            direction: direction || 'all'
        });
    }
    catch (error) {
        console.error('Get user call analytics error:', error);
        res.status(500).json({ message: error.message });
    }
};
exports.getUserCallAnalytics = getUserCallAnalytics;
