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
exports.deleteAccount = exports.updateAccount = exports.getAccountById = exports.createAccount = exports.getAccounts = void 0;
const prisma_1 = __importDefault(require("../config/prisma"));
const hierarchyUtils_1 = require("../utils/hierarchyUtils");
// GET /api/accounts
const getAccounts = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const pageSize = Number(req.query.pageSize) || 10;
        const page = Number(req.query.page) || 1;
        const user = req.user;
        const where = {};
        // 1. Organisation Scoping
        if (user.role === 'super_admin') {
            if (req.query.organisationId) {
                where.organisationId = String(req.query.organisationId);
            }
        }
        else {
            const orgId = (0, hierarchyUtils_1.getOrgId)(user);
            if (orgId)
                where.organisationId = orgId;
        }
        // 2. Hierarchy Visibility
        if (user.role !== 'super_admin' && user.role !== 'admin') {
            const subordinateIds = yield (0, hierarchyUtils_1.getSubordinateIds)(user.id);
            // In Prisma: ownerId IN [...]
            where.ownerId = { in: subordinateIds };
        }
        // Filters
        if (req.query.type)
            where.type = String(req.query.type);
        if (req.query.industry)
            where.industry = String(req.query.industry);
        // Search
        if (req.query.search) {
            const search = String(req.query.search);
            where.OR = [
                { name: { contains: search, mode: 'insensitive' } },
                { website: { contains: search, mode: 'insensitive' } },
                // JSON filtering for City (best effort for Prisma+PG)
                { address: { path: ['city'], string_contains: search } }
            ];
        }
        const count = yield prisma_1.default.account.count({ where });
        const accounts = yield prisma_1.default.account.findMany({
            where,
            include: {
                owner: { select: { firstName: true, lastName: true, email: true } }
            },
            skip: (page - 1) * pageSize,
            take: pageSize,
            orderBy: { createdAt: 'desc' }
        });
        res.json({ accounts, page, pages: Math.ceil(count / pageSize), total: count });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
});
exports.getAccounts = getAccounts;
// POST /api/accounts
const createAccount = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const user = req.user;
        const orgId = (0, hierarchyUtils_1.getOrgId)(user);
        if (!orgId)
            return res.status(400).json({ message: 'Organisation context required' });
        const accountData = {
            name: req.body.name,
            industry: req.body.industry,
            website: req.body.website,
            size: req.body.size,
            annualRevenue: req.body.annualRevenue,
            address: req.body.address,
            phone: req.body.phone,
            type: req.body.type || 'prospect',
            customFields: req.body.customFields,
            tags: req.body.tags,
            organisation: { connect: { id: orgId } },
            owner: req.body.owner ? { connect: { id: req.body.owner } } : { connect: { id: user.id } },
        };
        const account = yield prisma_1.default.account.create({
            data: accountData
        });
        res.status(201).json(account);
    }
    catch (error) {
        res.status(400).json({ message: error.message });
    }
});
exports.createAccount = createAccount;
const getAccountById = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const account = yield prisma_1.default.account.findUnique({
            where: { id: req.params.id },
            include: {
                owner: { select: { firstName: true, lastName: true, email: true } },
                contacts: { select: { id: true, firstName: true, lastName: true, email: true } },
                opportunities: { select: { id: true, name: true, amount: true, stage: true } }
            }
        });
        if (!account)
            return res.status(404).json({ message: 'Account not found' });
        res.json(account);
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
});
exports.getAccountById = getAccountById;
const updateAccount = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const updates = Object.assign({}, req.body);
        const accountId = req.params.id;
        if (updates.owner && typeof updates.owner === 'string') {
            updates.owner = { connect: { id: updates.owner } };
        }
        const account = yield prisma_1.default.account.update({
            where: { id: accountId },
            data: updates,
            include: {
                owner: { select: { firstName: true, lastName: true, email: true } }
            }
        });
        res.json(account);
    }
    catch (error) {
        res.status(400).json({ message: error.message });
    }
});
exports.updateAccount = updateAccount;
const deleteAccount = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const user = req.user;
        const accountId = req.params.id;
        // 1. Role Check
        if (user.role !== 'super_admin' && user.role !== 'admin') {
            return res.status(403).json({ message: 'Not authorized to delete accounts' });
        }
        // 2. Org Check for Admins
        if (user.role === 'admin') {
            const account = yield prisma_1.default.account.findUnique({ where: { id: accountId } });
            if (!account)
                return res.status(404).json({ message: 'Account not found' });
            const orgId = (0, hierarchyUtils_1.getOrgId)(user);
            if (account.organisationId !== orgId) {
                return res.status(403).json({ message: 'Not authorized to delete this account' });
            }
        }
        yield prisma_1.default.account.delete({
            where: { id: accountId }
        });
        res.json({ message: 'Account deleted' });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
});
exports.deleteAccount = deleteAccount;
