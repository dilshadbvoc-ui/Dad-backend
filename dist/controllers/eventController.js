"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteEvent = exports.getEventById = exports.createEvent = exports.getEvents = void 0;
const prisma_1 = __importDefault(require("../config/prisma"));
const hierarchyUtils_1 = require("../utils/hierarchyUtils");
const auditLogger_1 = require("../utils/auditLogger");
// Transform to include polymorphic details if needed (Event usually maps to one)
// But schema has separate fields.
// Mongoose populates 'lead' 'contact'.
const getEvents = async (req, res) => {
    try {
        const { start, end } = req.query;
        const user = req.user;
        const where = { isDeleted: false };
        // 1. Organisation Scoping
        if (user.role === 'super_admin') {
            if (req.query.organisationId)
                where.organisationId = String(req.query.organisationId);
        }
        else {
            const orgId = (0, hierarchyUtils_1.getOrgId)(user);
            if (!orgId)
                return res.status(403).json({ message: 'User has no organisation' });
            where.organisationId = orgId;
        }
        // 2. Hierarchy Visibility - Modified to include self
        if (user.role !== 'super_admin' && user.role !== 'admin') {
            const visibleUserIds = await (0, hierarchyUtils_1.getVisibleUserIds)(user.id);
            where.createdById = { in: visibleUserIds };
        }
        if (start && end) {
            where.startTime = {
                gte: new Date(start),
                lte: new Date(end)
            };
        }
        console.log('Calendar query where:', JSON.stringify(where, null, 2));
        const events = await prisma_1.default.calendarEvent.findMany({
            where,
            include: {
                lead: { select: { firstName: true, lastName: true } },
                contact: { select: { firstName: true, lastName: true } }
            },
            orderBy: { startTime: 'asc' }
        });
        console.log(`Found ${events.length} events`);
        res.json({ events });
    }
    catch (error) {
        console.error('getEvents error:', error);
        res.status(500).json({ message: error.message });
    }
};
exports.getEvents = getEvents;
const createEvent = async (req, res) => {
    try {
        const user = req.user;
        const orgId = (0, hierarchyUtils_1.getOrgId)(user);
        if (!orgId)
            return res.status(400).json({ message: 'No org' });
        const data = {
            title: req.body.title,
            description: req.body.description,
            startTime: new Date(req.body.startTime),
            endTime: new Date(req.body.endTime),
            allDay: req.body.allDay || false,
            type: req.body.type || 'meeting',
            location: req.body.location,
            organisation: { connect: { id: orgId } },
            createdBy: { connect: { id: user.id } }
        };
        if (req.body.lead)
            data.lead = { connect: { id: req.body.lead } };
        if (req.body.contact)
            data.contact = { connect: { id: req.body.contact } };
        // Support others if needed (Account/Opp)
        const event = await prisma_1.default.calendarEvent.create({
            data
        });
        await (0, auditLogger_1.logAudit)({
            organisationId: orgId,
            actorId: user.id,
            action: 'CREATE_EVENT',
            entity: 'CalendarEvent',
            entityId: event.id,
            details: { title: event.title }
        });
        res.status(201).json(event);
    }
    catch (error) {
        res.status(400).json({ message: error.message });
    }
};
exports.createEvent = createEvent;
const getEventById = async (req, res) => {
    try {
        const user = req.user;
        const orgId = (0, hierarchyUtils_1.getOrgId)(user);
        if (!orgId)
            return res.status(400).json({ message: 'Organisation not found' });
        const event = await prisma_1.default.calendarEvent.findFirst({
            where: {
                id: req.params.id,
                organisationId: orgId,
                isDeleted: false
            },
            include: {
                lead: { select: { firstName: true, lastName: true } },
                contact: { select: { firstName: true, lastName: true } }
            }
        });
        if (!event)
            return res.status(404).json({ message: 'Event not found' });
        // Hierarchy check
        if (user.role !== 'super_admin' && user.role !== 'admin' && event.createdById !== user.id) {
            const subordinateIds = await (0, hierarchyUtils_1.getSubordinateIds)(user.id);
            if (!subordinateIds.includes(event.createdById)) {
                return res.status(403).json({ message: 'Not authorized to view this event' });
            }
        }
        res.json(event);
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.getEventById = getEventById;
const deleteEvent = async (req, res) => {
    try {
        const user = req.user;
        const orgId = (0, hierarchyUtils_1.getOrgId)(user);
        if (!orgId)
            return res.status(400).json({ message: 'Organisation not found' });
        await prisma_1.default.calendarEvent.update({
            where: {
                id: req.params.id,
                organisationId: orgId
            },
            data: { isDeleted: true }
        });
        await (0, auditLogger_1.logAudit)({
            organisationId: orgId,
            actorId: user.id,
            action: 'DELETE_EVENT',
            entity: 'CalendarEvent',
            entityId: req.params.id
        });
        res.json({ message: 'Event deleted' });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.deleteEvent = deleteEvent;
