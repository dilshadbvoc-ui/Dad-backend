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
exports.getDuplicateLeads = exports.getReEnquiryLeads = exports.generateAIResponse = exports.getPendingFollowUpsCount = exports.submitExplanation = exports.getLeadHistory = exports.getViolations = exports.convertLead = exports.bulkAssignLeads = exports.createBulkLeads = exports.deleteLead = exports.updateLead = exports.getLeadById = exports.createLead = exports.getLeads = void 0;
const prisma_1 = __importDefault(require("../config/prisma"));
const hierarchyUtils_1 = require("../utils/hierarchyUtils");
const distributionService_1 = require("../services/distributionService");
const workflowEngine_1 = require("../services/workflowEngine");
const client_1 = require("../generated/client");
const roleUtils_1 = require("../utils/roleUtils");
// Dynamic import used for OpenAI to avoid startup errors if missing
// GET /api/leads
const getLeads = async (req, res) => {
    try {
        console.log('[getLeads] Query Params:', req.query); // DEBUG LOG
        const pageSize = Number(req.query.pageSize) || 10;
        const page = Number(req.query.page) || 1;
        const user = req.user;
        const where = { isDeleted: false };
        const andConditions = [];
        console.log('[getLeads] User:', user.id, user.role); // DEBUG LOG
        // 1. Organisation Scoping
        if (user.isSuperAdmin || (0, roleUtils_1.isSuperAdmin)(user)) {
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
        // Only apply hierarchy restrictions for non-admin users
        if (!user.isSuperAdmin && !(0, roleUtils_1.isSuperAdmin)(user) && !(0, roleUtils_1.isAdmin)(user)) {
            // Get user's role to determine visibility rules
            // Handle both UUID-based roles (new) and string-based roles (legacy)
            let roleName = '';
            // Try to get role from Role table (UUID-based)
            const userRole = await prisma_1.default.role.findUnique({ where: { id: user.role } });
            if (userRole) {
                roleName = userRole.name;
            }
            else {
                // Fallback to legacy string-based role
                // Normalize: 'sales_rep' -> 'Sales Rep', 'manager' -> 'Manager'
                roleName = user.role.split('_').map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
            }
            // Sales Reps: Only see leads assigned to them or created by them
            if (roleName === 'Sales Rep') {
                andConditions.push({
                    OR: [
                        { assignedToId: user.id }, // Directly assigned to this user
                        { createdById: user.id } // Created by user
                    ]
                });
            }
            else {
                // Managers: Only see leads assigned to them or their direct subordinates
                const subordinateIds = await (0, hierarchyUtils_1.getSubordinateIds)(user.id);
                andConditions.push({
                    OR: [
                        { assignedToId: user.id }, // Directly assigned to this user
                        { assignedToId: { in: subordinateIds.filter(id => id !== user.id) } }, // Assigned to subordinates
                        { createdById: user.id } // Created by user
                    ]
                });
            }
        }
        // Filter: Status
        if (req.query.status && Object.values(client_1.LeadStatus).includes(req.query.status)) {
            where.status = req.query.status;
        }
        // Filter: Source
        if (req.query.source && Object.values(client_1.LeadSource).includes(req.query.source)) {
            where.source = req.query.source;
        }
        // Filter: Search (OR condition)
        if (req.query.search) {
            const search = String(req.query.search);
            andConditions.push({
                OR: [
                    { firstName: { contains: search, mode: 'insensitive' } },
                    { lastName: { contains: search, mode: 'insensitive' } },
                    { email: { contains: search, mode: 'insensitive' } },
                    { company: { contains: search, mode: 'insensitive' } }
                ]
            });
        }
        // Filter: Assigned User
        if (req.query.assignedTo) {
            where.assignedToId = req.query.assignedTo;
        }
        // Combine all conditions
        if (andConditions.length > 0) {
            where.AND = andConditions;
        }
        console.log('[getLeads] Prisma Where:', JSON.stringify(where, null, 2)); // DEBUG LOG
        const total = await prisma_1.default.lead.count({ where });
        const leads = await prisma_1.default.lead.findMany({
            where,
            include: {
                assignedTo: {
                    select: { firstName: true, lastName: true, email: true }
                }
            },
            skip: (page - 1) * pageSize,
            take: pageSize,
            orderBy: { updatedAt: 'desc' }
        });
        res.json({ leads, page, pages: Math.ceil(total / pageSize), total });
    }
    catch (error) {
        console.error('getLeads Error:', error);
        // Return 500 but include error message for debugging
        res.status(500).json({ message: error.message, stack: process.env.NODE_ENV === 'development' ? error.stack : undefined });
    }
};
exports.getLeads = getLeads;
// POST /api/leads
const createLead = async (req, res) => {
    try {
        const { email, phone } = req.body;
        if (!phone)
            return res.status(400).json({ message: 'Phone number is required' });
        // Sanitize Phone
        let cleanPhone = phone.toString().replace(/\D/g, '');
        if (cleanPhone.length > 10 && cleanPhone.endsWith(cleanPhone.slice(-10))) {
            cleanPhone = cleanPhone.slice(-10);
        }
        const orgId = (0, hierarchyUtils_1.getOrgId)(req.user);
        if (!orgId)
            return res.status(400).json({ message: 'Organisation context required' });
        // Check for duplicates using DuplicateLeadService
        const { DuplicateLeadService } = await Promise.resolve().then(() => __importStar(require('../services/DuplicateLeadService')));
        const duplicateCheck = await DuplicateLeadService.checkDuplicate(cleanPhone, email, orgId);
        if (duplicateCheck.isDuplicate && duplicateCheck.existingLead) {
            // Handle as re-enquiry
            const reEnquiryData = {
                firstName: req.body.firstName,
                lastName: req.body.lastName,
                email: req.body.email,
                phone: cleanPhone,
                company: req.body.company,
                source: req.body.source,
                sourceDetails: req.body.sourceDetails
            };
            const updatedLead = await DuplicateLeadService.handleReEnquiry(duplicateCheck.existingLead, reEnquiryData, orgId);
            return res.status(200).json({
                message: 'Lead already exists. Marked as re-enquiry and notifications sent.',
                lead: updatedLead,
                isReEnquiry: true,
                matchedBy: duplicateCheck.matchedBy,
                reEnquiryCount: updatedLead.reEnquiryCount
            });
        }
        // Extract assignedTo before spreading
        const { assignedTo, branchId, ...restBody } = req.body;
        const currentUser = req.user;
        // For manual lead creation: creator owns the lead unless explicitly assigned to someone else
        // If assignedTo is provided, use it; otherwise assign to the creator
        const leadOwnerId = assignedTo || currentUser.id;
        // Detect country from IP address if not provided
        let geoData = null;
        if (!req.body.country && !req.body.countryCode) {
            const { GeoLocationService } = await Promise.resolve().then(() => __importStar(require('../services/GeoLocationService')));
            const ipAddress = req.ip || req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || req.connection.remoteAddress;
            if (ipAddress) {
                geoData = await GeoLocationService.detectCountryFromIP(ipAddress);
            }
            // Fallback: Try to detect from phone number
            if (!geoData && cleanPhone) {
                geoData = GeoLocationService.detectCountryFromPhone(cleanPhone);
            }
        }
        // Custom Field Validation
        if (req.body.customFields) {
            const { CustomFieldValidationService } = await Promise.resolve().then(() => __importStar(require('../services/CustomFieldValidationService')));
            await CustomFieldValidationService.validateFields('Lead', orgId, req.body.customFields);
        }
        // Create
        const lead = await prisma_1.default.lead.create({
            data: {
                ...restBody,
                phone: cleanPhone,
                country: req.body.country || geoData?.country || undefined,
                countryCode: req.body.countryCode || geoData?.countryCode || undefined,
                phoneCountryCode: req.body.phoneCountryCode || geoData?.phoneCountryCode || undefined,
                organisation: { connect: { id: orgId } },
                branch: currentUser.branchId ? { connect: { id: currentUser.branchId } } : (branchId ? { connect: { id: branchId } } : undefined),
                // Assign to creator by default, or to specified user
                assignedTo: { connect: { id: leadOwnerId } },
                source: req.body.source || client_1.LeadSource.manual,
                status: req.body.status || client_1.LeadStatus.new,
                potentialValue: req.body.potentialValue ? parseFloat(req.body.potentialValue) : 0,
                createdBy: { connect: { id: currentUser.id } } // Track creator for visibility
            }
        });
        // 3a. Handle Products if provided (products field is optional)
        if (req.body.products !== undefined && Array.isArray(req.body.products)) {
            const productItems = req.body.products;
            let totalValue = 0;
            // Only process if products array is not empty
            if (productItems.length > 0) {
                for (const item of productItems) {
                    // Validate that productId exists
                    if (!item.productId) {
                        continue; // Skip invalid items
                    }
                    const product = await prisma_1.default.product.findUnique({ where: { id: item.productId } });
                    if (product) {
                        const price = product.basePrice || 0;
                        const quantity = item.quantity || 1;
                        totalValue += price * quantity;
                        await prisma_1.default.leadProduct.create({
                            data: {
                                leadId: lead.id,
                                productId: item.productId,
                                quantity: quantity,
                                price: price
                            }
                        });
                    }
                }
                // Update lead with calculated value if products were added
                if (totalValue > 0) {
                    await prisma_1.default.lead.update({
                        where: { id: lead.id },
                        data: { potentialValue: totalValue }
                    });
                    lead.potentialValue = totalValue; // Update local obj for response
                }
            }
        }
        // Audit Log
        try {
            const { logAudit } = await Promise.resolve().then(() => __importStar(require('../utils/auditLogger')));
            logAudit({
                action: 'CREATE_LEAD',
                entity: 'Lead',
                entityId: lead.id,
                actorId: req.user.id,
                organisationId: orgId,
                details: { name: `${lead.firstName} ${lead.lastName}`, company: lead.company }
            });
        }
        catch (e) {
            console.error('Audit Log Error:', e);
        }
        // Enable Distribution only if no explicit assignment was made
        // This allows assignment rules to work for automated leads, but respects manual assignments
        if (!assignedTo) {
            await distributionService_1.DistributionService.assignLead(lead, orgId);
        }
        // Trigger Workflow Engine for lead creation
        try {
            await workflowEngine_1.WorkflowEngine.evaluate('Lead', 'created', lead, orgId);
            Promise.resolve().then(() => __importStar(require('../services/WebhookService'))).then(({ WebhookService }) => {
                WebhookService.triggerEvent('lead.created', lead, orgId).catch(console.error);
            });
            // AI Scoring
            Promise.resolve().then(() => __importStar(require('../services/LeadScoringService'))).then(({ LeadScoringService }) => {
                LeadScoringService.scoreLead(lead.id).catch(console.error);
            });
            // Goal Automation
            Promise.resolve().then(() => __importStar(require('../services/GoalService'))).then(({ GoalService }) => {
                const assignedId = lead.assignedToId;
                if (assignedId) {
                    GoalService.updateProgressForUser(assignedId, 'leads').catch(console.error);
                }
            });
            // Meta Conversion API: New Lead
            Promise.resolve().then(() => __importStar(require('../services/MetaConversionService'))).then(({ MetaConversionService }) => {
                MetaConversionService.sendEvent(orgId, {
                    eventName: 'Lead',
                    userData: {
                        email: lead.email,
                        phone: lead.phone,
                        firstName: lead.firstName,
                        lastName: lead.lastName,
                        externalId: lead.id
                    },
                    actionSource: 'system_generated' // or website if we knew source url
                }).catch(console.error);
            });
        }
        catch (workflowErr) {
            console.error('WorkflowEngine error:', workflowErr);
            // Don't fail the request if workflow fails
        }
        res.status(201).json(lead);
    }
    catch (error) {
        console.error('createLead Error:', error);
        res.status(400).json({ message: error.message });
    }
};
exports.createLead = createLead;
const getLeadById = async (req, res) => {
    try {
        const user = req.user;
        const orgId = (0, hierarchyUtils_1.getOrgId)(user);
        const where = { id: req.params.id, isDeleted: false };
        // Organization scoping
        if (user.isSuperAdmin || (0, roleUtils_1.isSuperAdmin)(user)) {
            // Super admins can see any lead
        }
        else {
            if (!orgId)
                return res.status(403).json({ message: 'User has no organisation' });
            where.organisationId = orgId;
            // Apply role-based visibility for non-admins
            if (!(0, roleUtils_1.isAdmin)(user)) {
                // Get user's role to determine visibility rules
                // Handle both UUID-based roles (new) and string-based roles (legacy)
                let roleName = '';
                const userRole = await prisma_1.default.role.findUnique({ where: { id: user.role } });
                if (userRole) {
                    roleName = userRole.name;
                }
                else {
                    // Fallback to legacy string-based role
                    roleName = user.role.split('_').map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
                }
                // Sales Reps: Only see leads assigned to them or created by them
                if (roleName === 'Sales Rep') {
                    where.OR = [
                        { assignedToId: user.id },
                        { createdById: user.id }
                    ];
                }
                else {
                    // Managers: Only see leads assigned to them or their direct subordinates
                    const subordinateIds = await (0, hierarchyUtils_1.getSubordinateIds)(user.id);
                    where.OR = [
                        { assignedToId: user.id },
                        { assignedToId: { in: subordinateIds.filter(id => id !== user.id) } },
                        { createdById: user.id }
                    ];
                }
            }
        }
        const lead = await prisma_1.default.lead.findFirst({
            where,
            include: {
                assignedTo: { select: { firstName: true, lastName: true, email: true } },
                products: { include: { product: true } }
            }
        });
        if (!lead)
            return res.status(404).json({ message: 'Lead not found' });
        res.json(lead);
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.getLeadById = getLeadById;
const updateLead = async (req, res) => {
    try {
        const updates = { ...req.body };
        const leadId = req.params.id;
        const requester = req.user;
        let historyData = null;
        // Fetch current lead to check for ownership change
        const currentLead = await prisma_1.default.lead.findUnique({ where: { id: leadId } });
        if (!currentLead)
            return res.status(404).json({ message: 'Lead not found' });
        // Hierarchy Check
        if (updates.assignedToId || updates.assignedTo) { // Handle payload differences
            const targetUserId = updates.assignedToId || updates.assignedTo; // Assuming ID string
            if (!requester.isSuperAdmin && !(0, roleUtils_1.isSuperAdmin)(requester) && !(0, roleUtils_1.isAdmin)(requester)) {
                const allowedIds = await (0, hierarchyUtils_1.getSubordinateIds)(requester.id);
                // If passing an object (legacy), extract ID?? Usually frontend sends ID string for update.
                // Let's assume ID string.
                if (typeof targetUserId === 'string' && !allowedIds.includes(targetUserId)) {
                    return res.status(403).json({ message: 'You can only assign leads to your subordinates.' });
                }
            }
            // Track History
            if (currentLead.assignedToId !== targetUserId) {
                historyData = {
                    leadId,
                    oldOwnerId: currentLead.assignedToId,
                    newOwnerId: targetUserId,
                    changedById: requester.id,
                    reason: req.body.reason || 'Manual Assignment'
                };
            }
            // Remap for Prisma
            updates.assignedTo = { connect: { id: targetUserId } };
            delete updates.assignedToId; // Clean up
        }
        // Track Status Change
        if (updates.status && updates.status !== currentLead.status) {
            const { logAudit } = await Promise.resolve().then(() => __importStar(require('../utils/auditLogger')));
            logAudit({
                action: 'LEAD_STATUS_CHANGE',
                entity: 'Lead',
                entityId: leadId,
                actorId: requester.id,
                organisationId: currentLead.organisationId,
                details: { oldStatus: currentLead.status, newStatus: updates.status }
            });
        }
        // Track Follow-up Change
        if (updates.nextFollowUp) {
            await prisma_1.default.interaction.create({
                data: {
                    leadId: leadId,
                    type: 'other',
                    subject: 'Follow-up Scheduled',
                    description: `Next follow-up scheduled for ${new Date(updates.nextFollowUp).toLocaleDateString()}`,
                    createdById: requester.id,
                    organisationId: currentLead.organisationId
                }
            });
        }
        if (updates.customFields) {
            const { CustomFieldValidationService } = await Promise.resolve().then(() => __importStar(require('../services/CustomFieldValidationService')));
            await CustomFieldValidationService.validateFields('Lead', currentLead.organisationId, updates.customFields);
        }
        const whereObj = { id: leadId };
        if (requester.role !== 'super_admin') {
            const orgId = (0, hierarchyUtils_1.getOrgId)(requester);
            if (!orgId)
                return res.status(403).json({ message: 'No org' });
            whereObj.organisationId = orgId;
            if (requester.branchId)
                whereObj.branchId = requester.branchId;
        }
        // Remove products from updates as it's handled separately
        const { products, ...leadUpdates } = updates;
        // Update Lead Basic Info
        const [lead] = await prisma_1.default.$transaction([
            prisma_1.default.lead.update({
                where: whereObj,
                data: leadUpdates,
                include: { assignedTo: { select: { firstName: true, lastName: true, email: true } } }
            }),
            ...(historyData ? [prisma_1.default.leadHistory.create({ data: historyData })] : [])
        ]);
        let finalLead = lead;
        // Handle Products Update (products field is optional)
        if (req.body.products !== undefined && Array.isArray(req.body.products)) {
            const productItems = req.body.products;
            // 1. Clear existing products (simplest approach for full replace)
            await prisma_1.default.leadProduct.deleteMany({ where: { leadId } });
            // 2. Add new products and calculate value (only if products array is not empty)
            let totalValue = 0;
            if (productItems.length > 0) {
                for (const item of productItems) {
                    // Validate that productId exists
                    if (!item.productId) {
                        continue; // Skip invalid items
                    }
                    const product = await prisma_1.default.product.findUnique({ where: { id: item.productId } });
                    if (product) {
                        const price = product.basePrice || 0;
                        const quantity = item.quantity || 1;
                        totalValue += price * quantity;
                        await prisma_1.default.leadProduct.create({
                            data: {
                                leadId,
                                productId: item.productId,
                                quantity: quantity,
                                price: price
                            }
                        });
                    }
                }
            }
            // 3. Update Lead Value
            finalLead = await prisma_1.default.lead.update({
                where: { id: leadId },
                data: { potentialValue: totalValue },
                include: {
                    assignedTo: { select: { firstName: true, lastName: true, email: true } },
                    products: { include: { product: true } }
                }
            });
            // Log History for Value Change
            if (currentLead.potentialValue !== totalValue) {
                await prisma_1.default.leadHistory.create({
                    data: {
                        leadId,
                        changedById: requester.id,
                        fieldName: 'potentialValue',
                        oldValue: currentLead.potentialValue?.toString() || '0',
                        newValue: totalValue.toString()
                    }
                });
            }
        }
        // Audit Log for update
        try {
            const { logAudit } = await Promise.resolve().then(() => __importStar(require('../utils/auditLogger')));
            logAudit({
                action: 'UPDATE_LEAD',
                entity: 'Lead',
                entityId: leadId,
                actorId: requester.id,
                organisationId: currentLead.organisationId,
                details: { name: `${currentLead.firstName} ${currentLead.lastName}`, updatedFields: Object.keys(updates) }
            });
        }
        catch (e) {
            console.error('Audit Log Error:', e);
        }
        res.json(finalLead);
        // Webhook
        Promise.resolve().then(() => __importStar(require('../services/WebhookService'))).then(({ WebhookService }) => {
            WebhookService.triggerEvent('lead.updated', lead, lead.organisationId).catch(console.error);
        });
        // AI Scoring Trigger (if relevant fields changed)
        if (updates.jobTitle || updates.company || updates.email || updates.phone) {
            Promise.resolve().then(() => __importStar(require('../services/LeadScoringService'))).then(({ LeadScoringService }) => {
                LeadScoringService.scoreLead(leadId).catch(console.error);
            });
        }
    }
    catch (error) {
        res.status(400).json({ message: error.message });
    }
};
exports.updateLead = updateLead;
const deleteLead = async (req, res) => {
    try {
        const user = req.user;
        const leadId = req.params.id;
        // Role Check
        if (user.role !== 'admin' && user.role !== 'super_admin') {
            return res.status(403).json({ message: 'Not authorized to delete leads' });
        }
        const lead = await prisma_1.default.lead.findUnique({ where: { id: leadId } });
        if (!lead)
            return res.status(404).json({ message: 'Lead not found' });
        // Org Check
        if (user.role !== 'super_admin') {
            const userOrgId = (0, hierarchyUtils_1.getOrgId)(user);
            if (lead.organisationId !== userOrgId) {
                return res.status(403).json({ message: 'Not authorized to delete this lead' });
            }
        }
        await prisma_1.default.$transaction([
            prisma_1.default.lead.update({
                where: { id: leadId },
                data: { isDeleted: true }
            }),
            // Cascade delete related entities
            prisma_1.default.contact.updateMany({
                where: { leadId: leadId },
                data: { isDeleted: true }
            }),
            prisma_1.default.account.updateMany({
                where: { leadId: leadId },
                data: { isDeleted: true }
            }),
            prisma_1.default.opportunity.updateMany({
                where: { leadId: leadId },
                data: { isDeleted: true }
            })
        ]);
        // Audit Log
        try {
            const { logAudit } = await Promise.resolve().then(() => __importStar(require('../utils/auditLogger')));
            logAudit({
                action: 'DELETE_LEAD',
                entity: 'Lead',
                entityId: leadId,
                actorId: user.id,
                organisationId: lead.organisationId,
                details: { name: `${lead.firstName} ${lead.lastName}` }
            });
        }
        catch (e) {
            console.error('Audit Log Error:', e);
        }
        res.json({ message: 'Lead deleted' });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.deleteLead = deleteLead;
const createBulkLeads = async (req, res) => {
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
        const { AssignmentRuleService } = await Promise.resolve().then(() => __importStar(require('../services/AssignmentRuleService')));
        const { GeoLocationService } = await Promise.resolve().then(() => __importStar(require('../services/GeoLocationService')));
        const { DuplicateLeadService } = await Promise.resolve().then(() => __importStar(require('../services/DuplicateLeadService')));
        let createdCount = 0;
        let duplicateCount = 0;
        let reEnquiryCount = 0;
        const errors = [];
        for (const l of leadsData) {
            try {
                // Sanitize phone
                let cleanPhone = l.phone?.toString().replace(/\D/g, '') || '';
                if (cleanPhone.length > 10) {
                    cleanPhone = cleanPhone.slice(-10);
                }
                // Check for duplicates
                const duplicateCheck = await DuplicateLeadService.checkDuplicate(cleanPhone, l.email, orgId);
                if (duplicateCheck.isDuplicate && duplicateCheck.existingLead) {
                    // Handle as re-enquiry
                    await DuplicateLeadService.handleReEnquiry(duplicateCheck.existingLead, {
                        firstName: l.firstName,
                        lastName: l.lastName || '',
                        email: l.email,
                        phone: cleanPhone,
                        company: l.company,
                        source: l.source || 'import',
                        sourceDetails: l.sourceDetails
                    }, orgId);
                    reEnquiryCount++;
                    continue;
                }
                // Try to detect country from phone if not provided
                let geoData = null;
                if (!l.country && !l.countryCode && cleanPhone) {
                    geoData = GeoLocationService.detectCountryFromPhone(cleanPhone);
                }
                // Determine final owner
                let finalOwnerId = l.assignedTo;
                // If no owner specified, apply assignment rules
                if (!finalOwnerId) {
                    finalOwnerId = await AssignmentRuleService.assignLead(l, orgId, l.branchId || user.branchId || undefined) || undefined;
                }
                const data = {
                    firstName: l.firstName,
                    lastName: l.lastName || '',
                    phone: cleanPhone,
                    email: l.email,
                    company: l.company,
                    country: l.country || geoData?.country || undefined,
                    countryCode: l.countryCode || geoData?.countryCode || undefined,
                    phoneCountryCode: l.phoneCountryCode || geoData?.phoneCountryCode || undefined,
                    organisationId: orgId,
                    assignedToId: finalOwnerId || user.id,
                    branchId: l.branchId || user.branchId, // Support explicit branch or inherit from user
                    source: l.source || client_1.LeadSource.import,
                    status: l.status || client_1.LeadStatus.new,
                    leadScore: l.leadScore || 0
                };
                const lead = await prisma_1.default.lead.create({ data });
                // AI Scoring
                Promise.resolve().then(() => __importStar(require('../services/LeadScoringService'))).then(({ LeadScoringService }) => {
                    LeadScoringService.scoreLead(lead.id).catch(console.error);
                });
                createdCount++;
            }
            catch (error) {
                errors.push({ lead: l, error: error.message });
                duplicateCount++;
            }
        }
        res.status(201).json({
            message: `Bulk import completed`,
            created: createdCount,
            reEnquiries: reEnquiryCount,
            duplicates: duplicateCount,
            errors: errors.length > 0 ? errors : undefined
        });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.createBulkLeads = createBulkLeads;
const bulkAssignLeads = async (req, res) => {
    try {
        const { leadIds, assignedTo } = req.body;
        const requester = req.user;
        if (requester.role !== 'super_admin' && requester.role !== 'admin') {
            const allowedIds = await (0, hierarchyUtils_1.getSubordinateIds)(requester.id);
            if (!allowedIds.includes(assignedTo)) {
                return res.status(403).json({ message: 'Forbidden assignment' });
            }
        }
        const result = await prisma_1.default.lead.updateMany({
            where: { id: { in: leadIds } },
            data: { assignedToId: assignedTo }
        });
        res.json({ message: 'Assigned successfully', count: result.count });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.bulkAssignLeads = bulkAssignLeads;
const convertLead = async (req, res) => {
    try {
        const { id } = req.params;
        const leadId = id;
        const { dealName, amount, accountId } = req.body;
        const user = req.user;
        const orgId = (0, hierarchyUtils_1.getOrgId)(user);
        if (!orgId)
            return res.status(400).json({ message: 'No organisation context' });
        const lead = await prisma_1.default.lead.findUnique({
            where: { id: leadId },
            include: {
                organisation: true,
                products: { include: { product: true } }
            }
        });
        if (!lead)
            return res.status(404).json({ message: 'Lead not found' });
        if (lead.status === client_1.LeadStatus.converted) {
            return res.status(400).json({ message: 'Lead already converted' });
        }
        // Calculate opportunity amount from lead products if not provided
        let opportunityAmount = Number(amount) || 0;
        // If no amount provided, use lead's potentialValue or calculate from products
        if (!amount || opportunityAmount === 0) {
            if (lead.potentialValue && lead.potentialValue > 0) {
                opportunityAmount = lead.potentialValue;
            }
            else if (lead.products && lead.products.length > 0) {
                // Calculate from products
                opportunityAmount = lead.products.reduce((total, item) => {
                    return total + (item.price * item.quantity);
                }, 0);
            }
        }
        // 0. Limit Check
        const org = lead.organisation;
        if (org.contactLimit > 0) {
            const contactCount = await prisma_1.default.contact.count({
                where: { organisationId: orgId, isDeleted: false }
            });
            if (contactCount >= org.contactLimit) {
                return res.status(403).json({
                    message: `Contact limit reached (${org.contactLimit}). Please upgrade your plan.`,
                    code: 'LIMIT_EXCEEDED',
                    limit: org.contactLimit
                });
            }
        }
        const result = await prisma_1.default.$transaction(async (tx) => {
            // 1. Handle Account
            let targetAccountId = accountId;
            let account;
            if (targetAccountId) {
                account = await tx.account.findUnique({ where: { id: targetAccountId } });
                if (!account)
                    throw new Error('Target account not found');
            }
            else {
                // Create new Account
                account = await tx.account.create({
                    data: {
                        name: lead.company || `${lead.firstName} ${lead.lastName}`,
                        organisationId: orgId,
                        ownerId: user.id, // Assign to converter
                        type: 'customer',
                        phone: lead.phone,
                        address: lead.address,
                        leadId: lead.id, // Link to original lead
                        branchId: lead.branchId
                    }
                });
                targetAccountId = account.id;
            }
            // 2. Create Contact
            const contact = await tx.contact.create({
                data: {
                    firstName: lead.firstName,
                    lastName: lead.lastName,
                    email: lead.email,
                    phones: lead.phone ? { mobile: lead.phone } : undefined,
                    jobTitle: lead.jobTitle,
                    organisationId: orgId,
                    ownerId: user.id,
                    accountId: targetAccountId,
                    address: lead.address,
                    customFields: lead.customFields, // Migrate custom fields
                    leadId: lead.id, // Link to original lead
                    branchId: lead.branchId
                }
            });
            // 3. Create Opportunity
            const opportunity = await tx.opportunity.create({
                data: {
                    name: dealName || `Deal - ${lead.company || lead.lastName}`,
                    amount: opportunityAmount,
                    stage: 'new',
                    closeDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // +30 days
                    organisationId: orgId,
                    ownerId: user.id,
                    accountId: targetAccountId,
                    leadId: lead.id,
                    branchId: lead.branchId,
                    contacts: { connect: { id: contact.id } }
                }
            });
            // 4. Migrate Products from Lead to Account
            const leadProducts = await tx.leadProduct.findMany({
                where: { leadId: leadId },
                include: { product: true }
            });
            if (leadProducts.length > 0) {
                // Create AccountProduct entries for each LeadProduct
                for (const leadProduct of leadProducts) {
                    await tx.accountProduct.create({
                        data: {
                            accountId: targetAccountId,
                            productId: leadProduct.productId,
                            organisationId: orgId,
                            quantity: leadProduct.quantity,
                            purchaseDate: new Date(),
                            status: 'active',
                            notes: `Converted from lead: ${lead.firstName} ${lead.lastName}`
                        }
                    });
                }
            }
            // 5. Update Lead
            const updatedLead = await tx.lead.update({
                where: { id: leadId },
                data: {
                    status: client_1.LeadStatus.converted
                }
            });
            // 6. Migrate Interactions
            await tx.interaction.updateMany({
                where: { leadId: leadId },
                data: {
                    contactId: contact.id,
                    accountId: targetAccountId
                }
            });
            // 7. Migrate WhatsApp Messages
            await tx.whatsAppMessage.updateMany({
                where: { leadId: leadId },
                data: {
                    contactId: contact.id
                }
            });
            // 8. Migrate Tasks
            await tx.task.updateMany({
                where: { leadId: leadId },
                data: {
                    leadId: null, // Unlink from lead
                    contactId: contact.id,
                    accountId: targetAccountId
                }
            });
            return { account, contact, opportunity, lead: updatedLead, migratedProducts: leadProducts.length };
        });
        // Audit Log for conversion
        try {
            const { logAudit } = await Promise.resolve().then(() => __importStar(require('../utils/auditLogger')));
            logAudit({
                action: 'CONVERT_LEAD',
                entity: 'Lead',
                entityId: leadId,
                actorId: user.id,
                organisationId: orgId,
                details: {
                    name: `${lead.firstName} ${lead.lastName}`,
                    company: lead.company,
                    accountId: result.account.id,
                    contactId: result.contact.id,
                    opportunityId: result.opportunity.id,
                    migratedProducts: result.migratedProducts
                }
            });
        }
        catch (e) {
            console.error('Audit Log Error:', e);
        }
        res.json({
            message: 'Lead converted successfully',
            data: result
        });
    }
    catch (error) {
        console.error('Lead conversion error:', error);
        res.status(500).json({ message: error.message });
    }
};
exports.convertLead = convertLead;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const logDebug = (msg) => {
    try {
        const logPath = path_1.default.join(__dirname, '../../debug_crash.log');
        fs_1.default.appendFileSync(logPath, `${new Date().toISOString()} - [Leads] ${msg}\n`);
    }
    catch (e) {
        console.error('Failed to write log', e);
    }
};
const getViolations = async (req, res) => {
    try {
        logDebug('Entered getViolations');
        const user = req.user;
        const pageSize = Number(req.query.pageSize) || 10;
        const page = Number(req.query.page) || 1;
        logDebug(`User: ${user?.id}, Role: ${user?.role}`);
        // User sees violations where they were the PREVIOUS owner (the one who failed)
        // OR if they are a manager, seeing violations of their subordinates?
        // Prompt says "user and their managers need to give an explanation".
        const where = {
            rotationViolation: true,
            isDeleted: false,
        };
        if (user.role !== 'super_admin') {
            const orgId = (0, hierarchyUtils_1.getOrgId)(user);
            if (!orgId)
                return res.status(403).json({ message: 'No org' });
            where.organisationId = orgId;
            let subordinateIds = [];
            try {
                logDebug('Fetching subordinates...');
                subordinateIds = await (0, hierarchyUtils_1.getSubordinateIds)(user.id);
                logDebug(`Subordinates found: ${subordinateIds.length}`);
            }
            catch (subError) {
                logDebug(`Error fetching subordinates: ${subError.message}`);
                console.error('[getViolations] Error fetching subordinates:', subError);
                // Continue with just the user's own violations
            }
            // Logic:
            // 1. I am previousOwner (I failed)
            // 2. I am manager of previousOwner (My report failed)
            // Guard against empty array which causes Prisma issues
            const orConditions = [{ previousOwnerId: user.id }];
            if (subordinateIds.length > 0) {
                // orConditions.push({ previousOwnerId: { in: subordinateIds } });
                // FIX: Use explicit string array to avoid Prisma serialization issues if any
                orConditions.push({ previousOwnerId: { in: subordinateIds } });
            }
            where.OR = orConditions;
        }
        logDebug(`[Leads] Querying Prisma with where: ${JSON.stringify(where)}`);
        const violations = await prisma_1.default.lead.findMany({
            where,
            include: {
                previousOwner: { select: { firstName: true, lastName: true } },
                assignedTo: { select: { firstName: true, lastName: true } }
            },
            skip: (page - 1) * pageSize,
            take: pageSize,
            orderBy: { violationTime: 'desc' }
        });
        logDebug(`[Leads] Violations found: ${violations.length}`);
        const total = await prisma_1.default.lead.count({ where });
        res.json({ violations, page, pages: Math.ceil(total / pageSize), total });
    }
    catch (error) {
        logDebug(`getViolations CRASHED: ${error.message}\nStack: ${error.stack}`);
        console.error('[getViolations] Error:', error);
        res.status(500).json({ message: error.message });
    }
};
exports.getViolations = getViolations;
const getLeadHistory = async (req, res) => {
    try {
        const { id } = req.params;
        const user = req.user;
        // Verify access (simple org check)
        const lead = await prisma_1.default.lead.findUnique({ where: { id } });
        const orgId = (0, hierarchyUtils_1.getOrgId)(user);
        if (!lead || (orgId && lead.organisationId !== orgId && user.role !== 'super_admin')) {
            return res.status(404).json({ message: 'Lead not found' });
        }
        const history = await prisma_1.default.leadHistory.findMany({
            where: { leadId: id },
            include: {
                oldOwner: { select: { firstName: true, lastName: true } },
                newOwner: { select: { firstName: true, lastName: true } },
                changedBy: { select: { firstName: true, lastName: true } }
            },
            orderBy: { createdAt: 'desc' }
        });
        res.json(history);
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.getLeadHistory = getLeadHistory;
const submitExplanation = async (req, res) => {
    try {
        const { leadId, explanation, type } = req.body; // type = 'user' | 'manager'
        const user = req.user;
        const lead = await prisma_1.default.lead.findUnique({ where: { id: leadId } });
        if (!lead)
            return res.status(404).json({ message: 'Lead not found' });
        if (!lead.rotationViolation) {
            return res.status(400).json({ message: 'This lead is not flagged for violation' });
        }
        const data = {};
        if (type === 'user') {
            if (lead.previousOwnerId !== user.id && !(0, roleUtils_1.isAdmin)(user) && !user.isSuperAdmin) {
                return res.status(403).json({ message: 'Only the previous owner can submit a user explanation' });
            }
            data.userExplanation = explanation;
        }
        else if (type === 'manager') {
            // Check if user is manager of previousOwner
            // Ideally we check hierarchy properly.
            // For MVP, if user is admin or has subordinates including previousOwner
            const userRole = await prisma_1.default.role.findUnique({ where: { id: user.role } });
            if (userRole && userRole.name === 'Sales Rep') {
                return res.status(403).json({ message: 'Sales reps cannot submit manager explanations' });
            }
            data.managerExplanation = explanation;
        }
        else {
            return res.status(400).json({ message: 'Invalid explanation type' });
        }
        const updatedLead = await prisma_1.default.lead.update({
            where: { id: leadId },
            data
        });
        res.json(updatedLead);
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.submitExplanation = submitExplanation;
const getPendingFollowUpsCount = async (req, res) => {
    try {
        const user = req.user;
        const now = new Date();
        const endOfToday = new Date(now.setHours(23, 59, 59, 999));
        const where = {
            nextFollowUp: { lte: endOfToday },
            status: { not: client_1.LeadStatus.converted }
        };
        if (user.role !== 'super_admin') {
            const orgId = (0, hierarchyUtils_1.getOrgId)(user);
            if (!orgId)
                return res.status(403).json({ message: 'User has no organisation' });
            where.organisationId = orgId;
        }
        // Daily Briefing is personal
        where.assignedToId = user.id;
        const count = await prisma_1.default.lead.count({ where });
        res.json({ count });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.getPendingFollowUpsCount = getPendingFollowUpsCount;
const generateAIResponse = async (req, res) => {
    try {
        const { id } = req.params;
        const { context } = req.body; // e.g. "Draft an intro email"
        const lead = await prisma_1.default.lead.findUnique({ where: { id } });
        if (!lead)
            return res.status(404).json({ message: 'Lead not found' });
        // Lazy load OpenAI
        const { OpenAI } = await Promise.resolve().then(() => __importStar(require('openai')));
        if (!process.env.OPENAI_API_KEY) {
            return res.json({ draft: `[Mock AI Draft]\n\nHi ${lead.firstName},\n\nI noticed you work at ${lead.company}. We'd love to chat.\n\nBest,\n[Your Name]` });
        }
        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        const completion = await openai.chat.completions.create({
            model: "gpt-3.5-turbo",
            messages: [
                { role: "system", content: "You are a helpful sales assistant. Draft a short, professional email." },
                { role: "user", content: `Lead: ${lead.firstName} ${lead.lastName} from ${lead.company}. Title: ${lead.jobTitle}. Context: ${context || 'Introduction'}` }
            ],
        });
        res.json({ draft: completion.choices[0].message.content });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.generateAIResponse = generateAIResponse;
// GET /api/leads/re-enquiries - Get all re-enquiry leads
const getReEnquiryLeads = async (req, res) => {
    try {
        const orgId = (0, hierarchyUtils_1.getOrgId)(req.user);
        if (!orgId)
            return res.status(400).json({ message: 'No org' });
        const { DuplicateLeadService } = await Promise.resolve().then(() => __importStar(require('../services/DuplicateLeadService')));
        const reEnquiryLeads = await DuplicateLeadService.getReEnquiryLeads(orgId);
        res.json({
            leads: reEnquiryLeads,
            count: reEnquiryLeads.length
        });
    }
    catch (error) {
        console.error('getReEnquiryLeads Error:', error);
        res.status(500).json({ message: error.message });
    }
};
exports.getReEnquiryLeads = getReEnquiryLeads;
// GET /api/leads/duplicates - Find all duplicate leads
const getDuplicateLeads = async (req, res) => {
    try {
        const orgId = (0, hierarchyUtils_1.getOrgId)(req.user);
        if (!orgId)
            return res.status(400).json({ message: 'No org' });
        const { DuplicateLeadService } = await Promise.resolve().then(() => __importStar(require('../services/DuplicateLeadService')));
        const duplicates = await DuplicateLeadService.findDuplicates(orgId);
        res.json({
            duplicates,
            count: duplicates.length
        });
    }
    catch (error) {
        console.error('getDuplicateLeads Error:', error);
        res.status(500).json({ message: error.message });
    }
};
exports.getDuplicateLeads = getDuplicateLeads;
//# sourceMappingURL=leadController.js.map