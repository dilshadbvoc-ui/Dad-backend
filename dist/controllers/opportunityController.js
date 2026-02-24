"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteOpportunity = exports.updateOpportunity = exports.getOpportunityById = exports.createOpportunity = exports.getOpportunities = void 0;
const prisma_1 = __importDefault(require("../config/prisma"));
const hierarchyUtils_1 = require("../utils/hierarchyUtils");
// GET /api/opportunities
const getOpportunities = async (req, res) => {
    try {
        const page = parseInt(req.query.page || '1');
        const limit = parseInt(req.query.limit || '10');
        const skip = (page - 1) * limit;
        const user = req.user;
        const where = { isDeleted: false };
        // 1. Organisation Scoping
        if (user.role === 'super_admin') {
            if (req.query.organisationId) {
                where.organisationId = String(req.query.organisationId);
            }
        }
        else {
            const orgId = (0, hierarchyUtils_1.getOrgId)(user);
            if (!orgId)
                return res.status(403).json({ message: 'User has no organisation' });
            where.organisationId = orgId;
            if (user.branchId)
                where.branchId = user.branchId;
        }
        // 2. Hierarchy Visibility
        if (user.role !== 'super_admin' && user.role !== 'admin') {
            const subordinateIds = await (0, hierarchyUtils_1.getSubordinateIds)(user.id);
            // In Prisma: ownerId IN [...]
            where.ownerId = { in: [...subordinateIds, user.id] };
        }
        // Add filters if needed (e.g. stage, etc.) based on query params if standard match Mongoose behavior which passed `query` directly sometimes?
        // Mongoose code had `const query: any = {}` and populated it manually.
        // It didn't seemingly blindly pass req.query to find()? 
        // Ah, checked code: it only set org and owner. 
        // But implicitly if Mongoose `find(query)` was used, maybe other params were assumed?
        // No, lines 16-25 constructed query.
        // So strict filtering.
        // I'll stick to strict.
        const count = await prisma_1.default.opportunity.count({ where });
        const opportunities = await prisma_1.default.opportunity.findMany({
            where,
            include: {
                account: { select: { name: true } },
                owner: { select: { firstName: true, lastName: true, profileImage: true } }
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
};
exports.getOpportunities = getOpportunities;
// POST /api/opportunities
const createOpportunity = async (req, res) => {
    try {
        const user = req.user;
        const orgId = (0, hierarchyUtils_1.getOrgId)(user);
        if (!orgId)
            return res.status(400).json({ message: 'Organisation context required' });
        // Validate required fields
        if (!req.body.account) {
            return res.status(400).json({ message: 'Account is required to create an opportunity' });
        }
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
            type: req.body.type || 'NEW_BUSINESS', // Default
            organisation: { connect: { id: orgId } },
            owner: { connect: { id: user.id } },
            branch: user.branchId ? { connect: { id: user.branchId } } : (req.body.branchId ? { connect: { id: req.body.branchId } } : undefined),
            // Account is required in schema
            account: { connect: { id: req.body.account } }
        };
        // Custom Field Validation
        if (req.body.customFields) {
            const { CustomFieldValidationService } = await Promise.resolve().then(() => __importStar(require('../services/customFieldValidationService')));
            await CustomFieldValidationService.validateFields('Opportunity', orgId, req.body.customFields);
        }
        const opportunity = await prisma_1.default.opportunity.create({
            data: opportunityData
        });
        // Audit Log
        try {
            const { logAudit } = await Promise.resolve().then(() => __importStar(require('../utils/auditLogger')));
            logAudit({
                action: 'CREATE_OPPORTUNITY',
                entity: 'Opportunity',
                entityId: opportunity.id,
                actorId: user.id,
                organisationId: orgId,
                details: { name: opportunity.name, amount: opportunity.amount, type: opportunity.type }
            });
        }
        catch (e) {
            console.error('Audit Log Error:', e);
        }
        res.status(201).json(opportunity);
        // Webhook
        Promise.resolve().then(() => __importStar(require('../services/webhookService'))).then(({ WebhookService }) => {
            WebhookService.triggerEvent('opportunity.created', opportunity, orgId).catch(console.error);
        });
        // Trigger Sales Target Update if created as closed_won
        if (opportunity.stage === 'closed_won' && opportunity.ownerId) {
            Promise.resolve().then(() => __importStar(require('../services/salesTargetService'))).then(({ SalesTargetService }) => {
                SalesTargetService.updateProgressForUser(opportunity.ownerId).catch(console.error);
            });
            Promise.resolve().then(() => __importStar(require('../services/goalService'))).then(({ GoalService }) => {
                GoalService.updateProgressForUser(opportunity.ownerId, 'revenue').catch(console.error);
            });
        }
    }
    catch (error) {
        res.status(400).json({ message: error.message });
    }
};
exports.createOpportunity = createOpportunity;
const getOpportunityById = async (req, res) => {
    try {
        const user = req.user;
        const orgId = (0, hierarchyUtils_1.getOrgId)(user);
        const where = { id: req.params.id, isDeleted: false };
        if (user.role !== 'super_admin') {
            if (!orgId)
                return res.status(403).json({ message: 'User has no organisation' });
            where.organisationId = orgId;
            if (user.branchId)
                where.branchId = user.branchId;
        }
        const opportunity = await prisma_1.default.opportunity.findFirst({
            where,
            include: {
                account: {
                    select: {
                        name: true,
                        accountProducts: {
                            include: {
                                product: true
                            },
                            orderBy: {
                                createdAt: 'desc'
                            }
                        }
                    }
                },
                owner: { select: { firstName: true, lastName: true, profileImage: true } }
            }
        });
        if (!opportunity)
            return res.status(404).json({ message: 'Opportunity not found' });
        res.json(opportunity);
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.getOpportunityById = getOpportunityById;
const updateOpportunity = async (req, res) => {
    try {
        const updates = { ...req.body };
        const oppId = req.params.id;
        // Handle Relation Updates
        if (updates.account && typeof updates.account === 'string') {
            updates.account = { connect: { id: updates.account } };
        }
        if (updates.owner && typeof updates.owner === 'string') {
            updates.owner = { connect: { id: updates.owner } };
        }
        // Fetch first for validation and existence
        const currentOpp = await prisma_1.default.opportunity.findUnique({ where: { id: oppId } });
        if (!currentOpp)
            return res.status(404).json({ message: 'Opportunity not found' });
        if (updates.customFields) {
            const { CustomFieldValidationService } = await Promise.resolve().then(() => __importStar(require('../services/customFieldValidationService')));
            await CustomFieldValidationService.validateFields('Opportunity', currentOpp.organisationId, updates.customFields);
        }
        const requester = req.user;
        const whereObj = { id: oppId };
        if (requester.role !== 'super_admin') {
            const orgId = (0, hierarchyUtils_1.getOrgId)(requester);
            if (!orgId)
                return res.status(403).json({ message: 'No org' });
            whereObj.organisationId = orgId;
            if (requester.branchId)
                whereObj.branchId = requester.branchId;
        }
        const opportunity = await prisma_1.default.opportunity.update({
            where: whereObj,
            data: updates,
            include: {
                account: { select: { name: true } },
                owner: { select: { firstName: true, lastName: true, profileImage: true } }
            }
        });
        // Audit Log
        try {
            const { logAudit } = await Promise.resolve().then(() => __importStar(require('../utils/auditLogger')));
            logAudit({
                action: 'UPDATE_OPPORTUNITY',
                entity: 'Opportunity',
                entityId: oppId,
                actorId: requester.id,
                organisationId: opportunity.organisationId,
                details: { name: opportunity.name, updatedFields: Object.keys(updates) }
            });
        }
        catch (e) {
            console.error('Audit Log Error:', e);
        }
        // Trigger Sales Target Update when opportunity is closed won
        if ((req.body.stage === 'closed_won' || (opportunity.stage === 'closed_won' && req.body.amount)) && opportunity.ownerId) {
            Promise.resolve().then(() => __importStar(require('../services/salesTargetService'))).then(({ SalesTargetService }) => {
                SalesTargetService.updateProgressForUser(opportunity.ownerId).catch(err => {
                    console.error('SalesTargetService error:', err);
                });
            }).catch(err => {
                console.error('Failed to load SalesTargetService:', err);
            });
            // Goal Automation
            Promise.resolve().then(() => __importStar(require('../services/goalService'))).then(({ GoalService }) => {
                GoalService.updateProgressForUser(opportunity.ownerId, 'revenue').catch(console.error);
            });
            // Meta Conversion API: Purchase
            if (req.body.amount && opportunity.amount > 0) {
                Promise.resolve().then(() => __importStar(require('../services/metaConversionService'))).then(async ({ MetaConversionService }) => {
                    const oppWithContact = await prisma_1.default.opportunity.findUnique({
                        where: { id: oppId },
                        include: {
                            contacts: { take: 1 }
                        }
                    });
                    if (oppWithContact && oppWithContact.contacts.length > 0) {
                        const contact = oppWithContact.contacts[0];
                        const phone = contact.phones?.mobile || contact.phones?.work || '';
                        MetaConversionService.sendEvent(opportunity.organisationId, {
                            eventName: 'Purchase',
                            userData: {
                                email: contact.email,
                                phone: phone,
                                firstName: contact.firstName,
                                lastName: contact.lastName,
                                externalId: contact.id
                            },
                            customData: {
                                value: opportunity.amount,
                                currency: 'USD',
                                contentName: opportunity.name
                            },
                            actionSource: 'system_generated'
                        }).catch(console.error);
                    }
                });
            }
        }
        if (updates.stage && updates.stage !== currentOpp.stage) {
            const { logAudit } = await Promise.resolve().then(() => __importStar(require('../utils/auditLogger')));
            logAudit({
                action: 'OPPORTUNITY_STAGE_CHANGE',
                entity: 'Opportunity',
                entityId: oppId,
                actorId: requester.id,
                organisationId: currentOpp.organisationId,
                details: { oldStage: currentOpp.stage, newStage: updates.stage }
            });
        }
        res.json(opportunity);
        // Webhook
        Promise.resolve().then(() => __importStar(require('../services/webhookService'))).then(({ WebhookService }) => {
            WebhookService.triggerEvent('opportunity.updated', opportunity, opportunity.organisationId).catch(console.error);
        });
    }
    catch (error) {
        res.status(400).json({ message: error.message });
    }
};
exports.updateOpportunity = updateOpportunity;
const deleteOpportunity = async (req, res) => {
    try {
        const user = req.user;
        const opportunityId = req.params.id;
        const orgId = (0, hierarchyUtils_1.getOrgId)(user);
        // 1. Role Check
        if (user.role !== 'super_admin' && user.role !== 'admin') {
            return res.status(403).json({ message: 'Not authorized to delete opportunities' });
        }
        const where = { id: opportunityId };
        if (user.role !== 'super_admin') {
            if (!orgId)
                return res.status(403).json({ message: 'No org' });
            where.organisationId = orgId;
            if (user.branchId)
                where.branchId = user.branchId;
        }
        const opportunity = await prisma_1.default.opportunity.findFirst({ where });
        if (!opportunity)
            return res.status(404).json({ message: 'Opportunity not found' });
        await prisma_1.default.opportunity.update({
            where: { id: opportunityId },
            data: { isDeleted: true }
        });
        // Audit Log
        try {
            const { logAudit } = await Promise.resolve().then(() => __importStar(require('../utils/auditLogger')));
            logAudit({
                action: 'DELETE_OPPORTUNITY',
                entity: 'Opportunity',
                entityId: opportunityId,
                actorId: user.id,
                organisationId: opportunity.organisationId,
                details: { name: opportunity.name }
            });
        }
        catch (e) {
            console.error('Audit Log Error:', e);
        }
        res.json({ message: 'Opportunity deleted' });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.deleteOpportunity = deleteOpportunity;
//# sourceMappingURL=opportunityController.js.map