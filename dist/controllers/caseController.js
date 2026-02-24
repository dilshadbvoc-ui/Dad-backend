"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteCase = exports.updateCase = exports.getCaseById = exports.createCase = exports.getCases = void 0;
const prisma_1 = __importDefault(require("../config/prisma"));
const hierarchyUtils_1 = require("../utils/hierarchyUtils");
const auditLogger_1 = require("../utils/auditLogger");
const getCases = async (req, res) => {
    try {
        const page = parseInt(req.query.page || '1');
        const limit = parseInt(req.query.limit || '20');
        const search = req.query.search;
        const status = req.query.status;
        const skip = (page - 1) * limit;
        const user = req.user;
        const orgId = (0, hierarchyUtils_1.getOrgId)(user);
        if (!orgId)
            return res.status(400).json({ message: 'Organisation not found' });
        const where = {
            organisationId: orgId,
            isDeleted: false
        };
        // 1. Hierarchy Visibility
        if (user.role !== 'super_admin' && user.role !== 'admin') {
            const subordinateIds = await (0, hierarchyUtils_1.getSubordinateIds)(user.id);
            // Show cases assigned to self OR subordinates
            where.assignedToId = { in: [...subordinateIds, user.id] };
        }
        if (search) {
            where.OR = [
                { subject: { contains: search, mode: 'insensitive' } },
                { caseNumber: { contains: search, mode: 'insensitive' } }
            ];
        }
        if (status && status !== 'all') {
            where.status = status;
        }
        const cases = await prisma_1.default.case.findMany({
            where,
            include: {
                contact: { select: { firstName: true, lastName: true, email: true } },
                account: { select: { name: true } },
                assignedTo: { select: { firstName: true, lastName: true } }
            },
            orderBy: { createdAt: 'desc' },
            skip,
            take: limit
        });
        const total = await prisma_1.default.case.count({ where });
        res.json({
            cases,
            page,
            totalPages: Math.ceil(total / limit),
            totalCases: total
        });
    }
    catch (error) {
        console.error('getCases Error:', error);
        res.status(500).json({ message: error.message });
    }
};
exports.getCases = getCases;
const createCase = async (req, res) => {
    try {
        const user = req.user;
        const orgId = (0, hierarchyUtils_1.getOrgId)(user);
        if (!orgId)
            return res.status(400).json({ message: 'Organisation not found' });
        // Generate case number
        const count = await prisma_1.default.case.count({ where: { organisationId: orgId } });
        const caseNumber = `CASE-${String(count + 1).padStart(5, '0')}`;
        const newCase = await prisma_1.default.case.create({
            data: {
                ...req.body,
                caseNumber,
                organisationId: orgId,
                createdById: user.id,
                // Ensure relations are connected properly if provided
                contactId: req.body.contact || req.body.contactId || undefined,
                accountId: req.body.account || req.body.accountId || undefined,
                assignedToId: req.body.assignedTo || req.body.assignedToId || undefined
            }
        });
        await (0, auditLogger_1.logAudit)({
            organisationId: orgId,
            actorId: user.id,
            action: 'CREATE_CASE',
            entity: 'Case',
            entityId: newCase.id,
            details: { caseNumber: newCase.caseNumber }
        });
        res.status(201).json(newCase);
    }
    catch (error) {
        console.error('createCase Error:', error);
        res.status(400).json({ message: error.message });
    }
};
exports.createCase = createCase;
const getCaseById = async (req, res) => {
    try {
        const user = req.user;
        const orgId = (0, hierarchyUtils_1.getOrgId)(user);
        if (!orgId)
            return res.status(400).json({ message: 'Organisation not found' });
        const supportCase = await prisma_1.default.case.findFirst({
            where: {
                id: req.params.id,
                organisationId: orgId,
                isDeleted: false
            },
            include: {
                contact: true,
                account: true,
                assignedTo: { select: { id: true, firstName: true, lastName: true, email: true } }
            }
        });
        if (!supportCase) {
            return res.status(404).json({ message: 'Case not found' });
        }
        // Hierarchy check
        if (user.role !== 'super_admin' && user.role !== 'admin' && supportCase.assignedToId !== user.id) {
            const subordinateIds = await (0, hierarchyUtils_1.getSubordinateIds)(user.id);
            if (!subordinateIds.includes(supportCase.assignedToId || '')) {
                return res.status(403).json({ message: 'Not authorized to view this case' });
            }
        }
        res.json(supportCase);
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.getCaseById = getCaseById;
const updateCase = async (req, res) => {
    try {
        const { id } = req.params;
        const updates = { ...req.body };
        // Handle relation updates if passed as objects or IDs
        if (updates.contact)
            updates.contactId = updates.contact;
        if (updates.account)
            updates.accountId = updates.account;
        if (updates.assignedTo)
            updates.assignedToId = updates.assignedTo;
        delete updates.contact; // Clean up
        delete updates.account;
        delete updates.assignedTo;
        const user = req.user;
        const orgId = (0, hierarchyUtils_1.getOrgId)(user);
        if (!orgId)
            return res.status(400).json({ message: 'Organisation not found' });
        const supportCase = await prisma_1.default.case.update({
            where: {
                id,
                organisationId: orgId
            },
            data: updates
        });
        await (0, auditLogger_1.logAudit)({
            organisationId: orgId,
            actorId: user.id,
            action: 'UPDATE_CASE',
            entity: 'Case',
            entityId: supportCase.id,
            details: { updatedFields: Object.keys(updates) }
        });
        res.json(supportCase);
    }
    catch (error) {
        // P2025: Record not found
        if (error.code === 'P2025')
            return res.status(404).json({ message: 'Case not found' });
        res.status(500).json({ message: error.message });
    }
};
exports.updateCase = updateCase;
const deleteCase = async (req, res) => {
    try {
        const user = req.user;
        const orgId = (0, hierarchyUtils_1.getOrgId)(user);
        if (!orgId)
            return res.status(400).json({ message: 'Organisation not found' });
        await prisma_1.default.case.update({
            where: {
                id: req.params.id,
                organisationId: orgId
            },
            data: { isDeleted: true }
        });
        await (0, auditLogger_1.logAudit)({
            organisationId: orgId,
            actorId: user.id,
            action: 'DELETE_CASE',
            entity: 'Case',
            entityId: req.params.id
        });
        res.json({ message: 'Case deleted' });
    }
    catch (error) {
        if (error.code === 'P2025')
            return res.status(404).json({ message: 'Case not found' });
        res.status(500).json({ message: error.message });
    }
};
exports.deleteCase = deleteCase;
//# sourceMappingURL=caseController.js.map