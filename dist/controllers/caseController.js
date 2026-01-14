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
exports.deleteCase = exports.updateCase = exports.getCaseById = exports.createCase = exports.getCases = void 0;
const prisma_1 = __importDefault(require("../config/prisma"));
const hierarchyUtils_1 = require("../utils/hierarchyUtils");
const getCases = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
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
            const subordinateIds = yield (0, hierarchyUtils_1.getSubordinateIds)(user.id);
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
        const cases = yield prisma_1.default.case.findMany({
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
        const total = yield prisma_1.default.case.count({ where });
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
});
exports.getCases = getCases;
const createCase = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const user = req.user;
        const orgId = (0, hierarchyUtils_1.getOrgId)(user);
        if (!orgId)
            return res.status(400).json({ message: 'Organisation not found' });
        // Generate case number
        const count = yield prisma_1.default.case.count({ where: { organisationId: orgId } });
        const caseNumber = `CASE-${String(count + 1).padStart(5, '0')}`;
        const newCase = yield prisma_1.default.case.create({
            data: Object.assign(Object.assign({}, req.body), { caseNumber, organisationId: orgId, createdById: user.id, 
                // Ensure relations are connected properly if provided
                contactId: req.body.contact || req.body.contactId || undefined, accountId: req.body.account || req.body.accountId || undefined, assignedToId: req.body.assignedTo || req.body.assignedToId || undefined })
        });
        res.status(201).json(newCase);
    }
    catch (error) {
        console.error('createCase Error:', error);
        res.status(400).json({ message: error.message });
    }
});
exports.createCase = createCase;
const getCaseById = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const supportCase = yield prisma_1.default.case.findUnique({
            where: { id: req.params.id },
            include: {
                contact: true,
                account: true,
                assignedTo: { select: { id: true, firstName: true, lastName: true, email: true } }
            }
        });
        if (!supportCase || supportCase.isDeleted) {
            return res.status(404).json({ message: 'Case not found' });
        }
        res.json(supportCase);
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
});
exports.getCaseById = getCaseById;
const updateCase = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const updates = Object.assign({}, req.body);
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
        const supportCase = yield prisma_1.default.case.update({
            where: { id },
            data: updates
        });
        res.json(supportCase);
    }
    catch (error) {
        // P2025: Record not found
        if (error.code === 'P2025')
            return res.status(404).json({ message: 'Case not found' });
        res.status(500).json({ message: error.message });
    }
});
exports.updateCase = updateCase;
const deleteCase = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const supportCase = yield prisma_1.default.case.update({
            where: { id: req.params.id },
            data: { isDeleted: true }
        });
        res.json({ message: 'Case deleted' });
    }
    catch (error) {
        if (error.code === 'P2025')
            return res.status(404).json({ message: 'Case not found' });
        res.status(500).json({ message: error.message });
    }
});
exports.deleteCase = deleteCase;
