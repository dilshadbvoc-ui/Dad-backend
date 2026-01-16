"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteEvent = exports.getEventById = exports.createEvent = exports.getEvents = void 0;
const prisma_1 = __importDefault(require("../config/prisma"));
const hierarchyUtils_1 = require("../utils/hierarchyUtils");
// Transform to include polymorphic details if needed (Event usually maps to one)
// But schema has separate fields.
// Mongoose populates 'lead' 'contact'.
const getEvents = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
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
            if (orgId)
                where.organisationId = orgId;
        }
        // 2. Hierarchy Visibility - Modified to include self
        if (user.role !== 'super_admin' && user.role !== 'admin') {
            const subordinateIds = yield (0, hierarchyUtils_1.getSubordinateIds)(user.id);
            subordinateIds.push(user.id); // Include self
            where.createdById = { in: subordinateIds };
        }
        if (start && end) {
            where.startTime = {
                gte: new Date(start),
                lte: new Date(end)
            };
        }
        console.log('Calendar query where:', JSON.stringify(where, null, 2));
        const events = yield prisma_1.default.calendarEvent.findMany({
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
});
exports.getEvents = getEvents;
const createEvent = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
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
        const event = yield prisma_1.default.calendarEvent.create({
            data
        });
        res.status(201).json(event);
    }
    catch (error) {
        res.status(400).json({ message: error.message });
    }
});
exports.createEvent = createEvent;
const getEventById = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const event = yield prisma_1.default.calendarEvent.findFirst({
            where: { id: req.params.id, isDeleted: false },
            include: {
                lead: { select: { firstName: true, lastName: true } },
                contact: { select: { firstName: true, lastName: true } }
            }
        });
        if (!event)
            return res.status(404).json({ message: 'Event not found' });
        res.json(event);
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
});
exports.getEventById = getEventById;
const deleteEvent = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        yield prisma_1.default.calendarEvent.update({
            where: { id: req.params.id },
            data: { isDeleted: true }
        });
        res.json({ message: 'Event deleted' });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
});
exports.deleteEvent = deleteEvent;
