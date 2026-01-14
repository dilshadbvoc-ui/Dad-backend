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
exports.deleteOpportunity = exports.updateOpportunity = exports.getOpportunityById = exports.createOpportunity = exports.getOpportunities = void 0;
const prisma_1 = __importDefault(require("../config/prisma"));
const hierarchyUtils_1 = require("../utils/hierarchyUtils");
// GET /api/opportunities
const getOpportunities = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const page = parseInt(req.query.page || '1');
        const limit = parseInt(req.query.limit || '10');
        const skip = (page - 1) * limit;
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
        // Add filters if needed (e.g. stage, etc.) based on query params if standard match Mongoose behavior which passed `query` directly sometimes?
        // Mongoose code had `const query: any = {}` and populated it manually.
        // It didn't seemingly blindly pass req.query to find()? 
        // Ah, checked code: it only set org and owner. 
        // But implicitly if Mongoose `find(query)` was used, maybe other params were assumed?
        // No, lines 16-25 constructed query.
        // So strict filtering.
        // I'll stick to strict.
        const count = yield prisma_1.default.opportunity.count({ where });
        const opportunities = yield prisma_1.default.opportunity.findMany({
            where,
            include: {
                account: { select: { name: true } },
                owner: { select: { firstName: true, lastName: true } }
            },
            skip,
            take: limit,
            orderBy: { createdAt: 'desc' }
        });
        res.json({
            opportunities,
            page,
            totalPages: Math.ceil(count / limit),
            totalOpportunities: count
        });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
});
exports.getOpportunities = getOpportunities;
// POST /api/opportunities
const createOpportunity = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const user = req.user;
        const orgId = (0, hierarchyUtils_1.getOrgId)(user);
        if (!orgId)
            return res.status(400).json({ message: 'Organisation context required' });
        const opportunityData = {
            name: req.body.name,
            amount: Number(req.body.amount),
            stage: req.body.stage,
            probability: req.body.probability,
            closeDate: req.body.closeDate,
            leadSource: req.body.leadSource,
            description: req.body.description,
            customFields: req.body.customFields,
            tags: req.body.tags,
            organisation: { connect: { id: orgId } },
            owner: { connect: { id: user.id } },
            // Account is required in schema
            account: { connect: { id: req.body.account } }
        };
        const opportunity = yield prisma_1.default.opportunity.create({
            data: opportunityData
        });
        res.status(201).json(opportunity);
    }
    catch (error) {
        res.status(400).json({ message: error.message });
    }
});
exports.createOpportunity = createOpportunity;
const getOpportunityById = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const opportunity = yield prisma_1.default.opportunity.findUnique({
            where: { id: req.params.id },
            include: {
                account: { select: { name: true } },
                owner: { select: { firstName: true, lastName: true } }
            }
        });
        if (!opportunity)
            return res.status(404).json({ message: 'Opportunity not found' });
        res.json(opportunity);
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
});
exports.getOpportunityById = getOpportunityById;
const updateOpportunity = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const updates = Object.assign({}, req.body);
        const oppId = req.params.id;
        // Handle Relation Updates
        if (updates.account && typeof updates.account === 'string') {
            updates.account = { connect: { id: updates.account } };
        }
        if (updates.owner && typeof updates.owner === 'string') {
            updates.owner = { connect: { id: updates.owner } };
        }
        const opportunity = yield prisma_1.default.opportunity.update({
            where: { id: oppId },
            data: updates,
            include: {
                account: { select: { name: true } },
                owner: { select: { firstName: true, lastName: true } }
            }
        });
        // Trigger Sales Target Update - DISABLED for Phase 2 Migration
        /*
        if (req.body.stage === 'closed_won' || (opportunity.stage === 'closed_won' && req.body.amount)) {
            // SalesTargetService not yet migrated to Prisma.
            // import('../services/SalesTargetService').then(({ SalesTargetService }) => {
            //     SalesTargetService.updateProgressForUser(opportunity.ownerId).catch(console.error);
            // });
        }
        */
        res.json(opportunity);
    }
    catch (error) {
        res.status(400).json({ message: error.message });
    }
});
exports.updateOpportunity = updateOpportunity;
const deleteOpportunity = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const user = req.user;
        const opportunityId = req.params.id;
        // 1. Role Check
        if (user.role !== 'super_admin' && user.role !== 'admin') {
            return res.status(403).json({ message: 'Not authorized to delete opportunities' });
        }
        // 2. Org Check for Admins
        if (user.role === 'admin') {
            const opportunity = yield prisma_1.default.opportunity.findUnique({ where: { id: opportunityId } });
            if (!opportunity)
                return res.status(404).json({ message: 'Opportunity not found' });
            const orgId = (0, hierarchyUtils_1.getOrgId)(user);
            if (opportunity.organisationId !== orgId) {
                return res.status(403).json({ message: 'Not authorized to delete this opportunity' });
            }
        }
        yield prisma_1.default.opportunity.delete({
            where: { id: opportunityId }
        });
        res.json({ message: 'Opportunity deleted' });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
});
exports.deleteOpportunity = deleteOpportunity;
