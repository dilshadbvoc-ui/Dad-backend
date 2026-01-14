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
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.convertLead = exports.bulkAssignLeads = exports.createBulkLeads = exports.deleteLead = exports.updateLead = exports.getLeadById = exports.createLead = exports.getLeads = void 0;
const prisma_1 = __importDefault(require("../config/prisma"));
const hierarchyUtils_1 = require("../utils/hierarchyUtils");
// import { DistributionService } from '../services/DistributionService'; // Disabled for Phase 1
// import { WorkflowEngine } from '../services/WorkflowEngine'; // Disabled for Phase 1
const client_1 = require("../generated/client");
// GET /api/leads
const getLeads = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const pageSize = Number(req.query.pageSize) || 10;
        const page = Number(req.query.page) || 1;
        const user = req.user;
        const where = {};
        // 1. Organisation Scoping
        if (user.role === 'super_admin') {
            if (req.query.organisationId)
                where.organisationId = req.query.organisationId;
        }
        else {
            const orgId = (0, hierarchyUtils_1.getOrgId)(user);
            if (!orgId)
                return res.status(403).json({ message: 'User has no organisation' });
            where.organisationId = orgId;
        }
        // 2. Hierarchy Visibility
        if (user.role !== 'super_admin' && user.role !== 'admin') {
            const subordinateIds = yield (0, hierarchyUtils_1.getSubordinateIds)(user.id);
            // In Prisma: assignedToId IN [...]
            where.assignedToId = { in: subordinateIds };
        }
        // Filter: Status
        if (req.query.status) {
            where.status = req.query.status;
        }
        // Filter: Source
        if (req.query.source) {
            where.source = req.query.source;
        }
        // Filter: Search (OR condition)
        if (req.query.search) {
            const search = String(req.query.search);
            where.OR = [
                { firstName: { contains: search, mode: 'insensitive' } },
                { lastName: { contains: search, mode: 'insensitive' } },
                { email: { contains: search, mode: 'insensitive' } },
                { company: { contains: search, mode: 'insensitive' } }
            ];
        }
        const total = yield prisma_1.default.lead.count({ where });
        const leads = yield prisma_1.default.lead.findMany({
            where,
            include: {
                assignedTo: {
                    select: { firstName: true, lastName: true, email: true }
                }
            },
            skip: (page - 1) * pageSize,
            take: pageSize,
            orderBy: { createdAt: 'desc' }
        });
        res.json({ leads, page, pages: Math.ceil(total / pageSize), total });
    }
    catch (error) {
        console.error('getLeads Error:', error);
        res.status(500).json({ message: error.message });
    }
});
exports.getLeads = getLeads;
// POST /api/leads
const createLead = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { email, phone } = req.body;
        if (!phone)
            return res.status(400).json({ message: 'Phone number is required' });
        // Sanitize Phone
        let cleanPhone = phone.toString().replace(/\D/g, '');
        if (cleanPhone.length > 10 && cleanPhone.endsWith(cleanPhone.slice(-10))) {
            cleanPhone = cleanPhone.slice(-10);
        }
        // Check Duplicate
        const existingLead = yield prisma_1.default.lead.findFirst({
            where: {
                OR: [
                    { email: email || 'invalid_check' },
                    { phone: cleanPhone }
                ]
            }
        });
        if (existingLead) {
            return res.status(409).json({ message: 'Lead with this email or phone already exists' });
        }
        const orgId = (0, hierarchyUtils_1.getOrgId)(req.user);
        if (!orgId)
            return res.status(400).json({ message: 'Organisation context required' });
        // Extract assignedTo before spreading
        const _a = req.body, { assignedTo } = _a, restBody = __rest(_a, ["assignedTo"]);
        // Create
        const lead = yield prisma_1.default.lead.create({
            data: Object.assign(Object.assign(Object.assign(Object.assign({}, restBody), { phone: cleanPhone, organisation: { connect: { id: orgId } } }), (assignedTo ? { assignedTo: { connect: { id: assignedTo } } } : {})), { source: req.body.source, status: req.body.status || client_1.LeadStatus.new })
        });
        // DISABLE Distribution & Workflow for Phase 1 Migration
        // DistributionService uses Mongoose models (AssignmentRule), incompatible until migrated.
        console.warn('DistributionService and WorkflowEngine skipped in Phase 1 Migration');
        res.status(201).json(lead);
    }
    catch (error) {
        console.error('createLead Error:', error);
        res.status(400).json({ message: error.message });
    }
});
exports.createLead = createLead;
const getLeadById = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const lead = yield prisma_1.default.lead.findUnique({
            where: { id: req.params.id },
            include: { assignedTo: { select: { firstName: true, lastName: true, email: true } } }
        });
        if (!lead)
            return res.status(404).json({ message: 'Lead not found' });
        res.json(lead);
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
});
exports.getLeadById = getLeadById;
const updateLead = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const updates = Object.assign({}, req.body);
        const leadId = req.params.id;
        const requester = req.user;
        // Hierarchy Check
        if (updates.assignedToId || updates.assignedTo) { // Handle payload differences
            const targetUserId = updates.assignedToId || updates.assignedTo; // Assuming ID string
            if (requester.role !== 'super_admin' && requester.role !== 'admin') {
                const allowedIds = yield (0, hierarchyUtils_1.getSubordinateIds)(requester.id);
                // If passing an object (legacy), extract ID?? Usually frontend sends ID string for update.
                // Let's assume ID string.
                if (typeof targetUserId === 'string' && !allowedIds.includes(targetUserId)) {
                    return res.status(403).json({ message: 'You can only assign leads to your subordinates.' });
                }
            }
            // Remap for Prisma
            updates.assignedTo = { connect: { id: targetUserId } };
            delete updates.assignedToId; // Clean up
        }
        const lead = yield prisma_1.default.lead.update({
            where: { id: leadId },
            data: updates
        });
        res.json(lead);
    }
    catch (error) {
        res.status(400).json({ message: error.message });
    }
});
exports.updateLead = updateLead;
const deleteLead = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const user = req.user;
        const leadId = req.params.id;
        // Role Check
        if (user.role !== 'admin' && user.role !== 'super_admin') {
            return res.status(403).json({ message: 'Not authorized to delete leads' });
        }
        const lead = yield prisma_1.default.lead.findUnique({ where: { id: leadId } });
        if (!lead)
            return res.status(404).json({ message: 'Lead not found' });
        // Org Check
        if (user.role !== 'super_admin') {
            const userOrgId = (0, hierarchyUtils_1.getOrgId)(user);
            if (lead.organisationId !== userOrgId) {
                return res.status(403).json({ message: 'Not authorized to delete this lead' });
            }
        }
        yield prisma_1.default.lead.delete({ where: { id: leadId } });
        res.json({ message: 'Lead deleted' });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
});
exports.deleteLead = deleteLead;
const createBulkLeads = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const leadsData = req.body;
        const user = req.user;
        if (!Array.isArray(leadsData) || leadsData.length === 0) {
            return res.status(400).json({ message: 'Invalid input' });
        }
        // Map data
        const orgId = (0, hierarchyUtils_1.getOrgId)(user);
        if (!orgId)
            return res.status(400).json({ message: 'No org' });
        // Prisma createMany does not support nested relations logic per row easily if validating constraints one by one?
        // Actually createMany is supported but it's "all or nothing" validation usually or simple insert.
        // And it doesn't return created objects, just count.
        const leadsToInsert = leadsData.map(l => ({
            firstName: l.firstName,
            lastName: l.lastName || '',
            phone: l.phone,
            email: l.email,
            company: l.company,
            organisationId: orgId,
            assignedToId: l.assignedTo || user.id,
            source: l.source || client_1.LeadSource.import,
            status: l.status || client_1.LeadStatus.new,
            leadScore: l.leadScore || 0
        }));
        const result = yield prisma_1.default.lead.createMany({
            data: leadsToInsert,
            skipDuplicates: true // similar to ordered: false logic broadly? No, skips unique constraint errors
        });
        res.status(201).json({
            message: `Successfully imported leads`,
            count: result.count
        });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
});
exports.createBulkLeads = createBulkLeads;
const bulkAssignLeads = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { leadIds, assignedTo } = req.body;
        const requester = req.user;
        if (requester.role !== 'super_admin' && requester.role !== 'admin') {
            const allowedIds = yield (0, hierarchyUtils_1.getSubordinateIds)(requester.id);
            if (!allowedIds.includes(assignedTo)) {
                return res.status(403).json({ message: 'Forbidden assignment' });
            }
        }
        const result = yield prisma_1.default.lead.updateMany({
            where: { id: { in: leadIds } },
            data: { assignedToId: assignedTo }
        });
        res.json({ message: 'Assigned successfully', count: result.count });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
});
exports.bulkAssignLeads = bulkAssignLeads;
const convertLead = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    res.status(501).json({
        message: 'Lead Conversion is temporarily disabled during Database Migration (Phase 1). Please contact admin.'
    });
});
exports.convertLead = convertLead;
