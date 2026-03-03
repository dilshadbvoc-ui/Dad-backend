"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateLeadEnhanced = exports.createLeadEnhanced = exports.getLeadsEnhanced = void 0;
const prisma_1 = __importDefault(require("../config/prisma"));
const hierarchyUtils_1 = require("../utils/hierarchyUtils");
const distributionService_1 = require("../services/distributionService");
const workflowEngine_1 = require("../services/workflowEngine");
const client_1 = require("../generated/client");
const logger_1 = require("../utils/logger");
const apiResponse_1 = require("../utils/apiResponse");
const validation_1 = require("../utils/validation");
/**
 * Enhanced Lead Controller with comprehensive error handling and validation
 * This serves as an example of best practices for other controllers
 */
// GET /api/leads - Enhanced with better error handling
const getLeadsEnhanced = async (req, res) => {
    const user = req.user;
    const userId = user?.id;
    const organisationId = (0, hierarchyUtils_1.getOrgId)(user);
    try {
        logger_1.logger.apiRequest('GET', '/api/leads', userId, organisationId || undefined, req.query);
        // Validate pagination parameters
        const page = Math.max(1, Math.min(1000, Number(req.query.page) || 1));
        const limit = Math.max(1, Math.min(100, Number(req.query.limit) || 10));
        const skip = (page - 1) * limit;
        const where = { isDeleted: false };
        // 1. Organisation Scoping with validation
        if (user.role === 'super_admin') {
            if (req.query.organisationId) {
                where.organisationId = req.query.organisationId;
            }
        }
        else {
            if (!organisationId) {
                logger_1.logger.authError('User has no organisation', undefined, { userId });
                return apiResponse_1.ResponseHandler.forbidden(res, 'User not associated with an organisation');
            }
            where.organisationId = organisationId;
        }
        // 2. Hierarchy Visibility
        if (user.role !== 'super_admin' && user.role !== 'admin') {
            try {
                const subordinateIds = await (0, hierarchyUtils_1.getSubordinateIds)(user.id);
                where.assignedToId = { in: subordinateIds };
                logger_1.logger.debug('Applied hierarchy filter', 'LEADS', userId, organisationId || undefined, { subordinateCount: subordinateIds.length });
            }
            catch (error) {
                logger_1.logger.error('Failed to get subordinate IDs', error, 'LEADS', userId, organisationId || undefined);
                return apiResponse_1.ResponseHandler.serverError(res, 'Failed to apply access controls');
            }
        }
        // 3. Apply filters with validation
        if (req.query.status && Object.values(client_1.LeadStatus).includes(req.query.status)) {
            where.status = req.query.status;
        }
        if (req.query.source && Object.values(client_1.LeadSource).includes(req.query.source)) {
            where.source = req.query.source;
        }
        // 4. Search with sanitization
        if (req.query.search) {
            const search = String(req.query.search).trim().substring(0, 100); // Limit search length
            if (search.length > 0) {
                where.OR = [
                    { firstName: { contains: search, mode: 'insensitive' } },
                    { lastName: { contains: search, mode: 'insensitive' } },
                    { email: { contains: search, mode: 'insensitive' } },
                    { company: { contains: search, mode: 'insensitive' } }
                ];
            }
        }
        // 5. Execute queries with error handling
        const [leads, total] = await Promise.all([
            prisma_1.default.lead.findMany({
                where,
                include: {
                    assignedTo: { select: { id: true, firstName: true, lastName: true } }
                },
                orderBy: { createdAt: 'desc' },
                skip,
                take: limit
            }).catch(error => {
                logger_1.logger.dbError('findMany', 'Lead', error, userId, organisationId || undefined);
                throw new Error('Failed to fetch leads');
            }),
            prisma_1.default.lead.count({ where }).catch(error => {
                logger_1.logger.dbError('count', 'Lead', error, userId, organisationId || undefined);
                throw new Error('Failed to count leads');
            })
        ]);
        logger_1.logger.info(`Retrieved ${leads.length} leads (page ${page})`, 'LEADS', userId, organisationId || undefined);
        return apiResponse_1.ResponseHandler.paginated(res, leads, page, limit, total, 'Leads retrieved successfully');
    }
    catch (error) {
        logger_1.logger.apiError('GET', '/api/leads', error, userId, organisationId || undefined);
        if (error.message.includes('Failed to')) {
            return apiResponse_1.ResponseHandler.serverError(res, error.message);
        }
        return apiResponse_1.ResponseHandler.serverError(res, 'An unexpected error occurred while fetching leads');
    }
};
exports.getLeadsEnhanced = getLeadsEnhanced;
// POST /api/leads - Enhanced with comprehensive validation
const createLeadEnhanced = async (req, res) => {
    const user = req.user;
    const userId = user?.id;
    const organisationId = (0, hierarchyUtils_1.getOrgId)(user);
    try {
        logger_1.logger.apiRequest('POST', '/api/leads', userId, organisationId || undefined, req.body);
        // 1. Validate organisation access
        if (!organisationId) {
            logger_1.logger.authError('User has no organisation for lead creation', undefined, { userId });
            return apiResponse_1.ResponseHandler.forbidden(res, 'User not associated with an organisation');
        }
        // 2. Sanitize and validate input
        const allowedFields = ['firstName', 'lastName', 'email', 'phone', 'company', 'source', 'status', 'leadScore', 'notes'];
        const sanitizedData = (0, validation_1.sanitizeObject)(req.body, allowedFields);
        // 3. Validate required fields
        const validationErrors = [];
        if (!validation_1.leadValidation.firstName(sanitizedData.firstName)) {
            validationErrors.push('First name is required and must be 1-50 characters');
        }
        if (!validation_1.leadValidation.lastName(sanitizedData.lastName)) {
            validationErrors.push('Last name is required and must be 1-50 characters');
        }
        if (!validation_1.leadValidation.email(sanitizedData.email)) {
            validationErrors.push('Valid email address is required');
        }
        if (sanitizedData.phone && !validation_1.leadValidation.phone(sanitizedData.phone)) {
            validationErrors.push('Phone number format is invalid');
        }
        if (validationErrors.length > 0) {
            logger_1.logger.warn('Lead creation validation failed', 'LEADS', userId, organisationId || undefined, { errors: validationErrors });
            return apiResponse_1.ResponseHandler.validationError(res, validationErrors);
        }
        // 4. Check for duplicate email
        const existingLead = await prisma_1.default.lead.findFirst({
            where: {
                email: sanitizedData.email,
                organisationId,
                isDeleted: false
            }
        }).catch(error => {
            logger_1.logger.dbError('findFirst', 'Lead', error, userId, organisationId || undefined);
            throw new Error('Failed to check for duplicate leads');
        });
        if (existingLead) {
            logger_1.logger.warn('Attempted to create duplicate lead', 'LEADS', userId, organisationId || undefined, { email: sanitizedData.email });
            return apiResponse_1.ResponseHandler.validationError(res, 'A lead with this email already exists');
        }
        // 5. Create lead with error handling
        const leadData = {
            ...sanitizedData,
            organisationId,
            createdById: userId,
            source: sanitizedData.source || client_1.LeadSource.manual,
            status: sanitizedData.status || client_1.LeadStatus.new,
            leadScore: sanitizedData.leadScore || 0
        };
        const newLead = await prisma_1.default.lead.create({
            data: leadData,
            include: {
                assignedTo: { select: { id: true, firstName: true, lastName: true } }
            }
        }).catch(error => {
            logger_1.logger.dbError('create', 'Lead', error, userId, organisationId || undefined);
            throw new Error('Failed to create lead');
        });
        // 6. Apply distribution rules (non-blocking)
        try {
            await distributionService_1.DistributionService.assignLead(newLead, organisationId);
            logger_1.logger.info('Lead distribution applied', 'LEADS', userId, organisationId || undefined, { leadId: newLead.id });
        }
        catch (error) {
            logger_1.logger.error('Lead distribution failed', error, 'LEADS', userId, organisationId || undefined, { leadId: newLead.id });
            // Don't fail the request if distribution fails
        }
        // 7. Trigger workflows (non-blocking)
        try {
            await workflowEngine_1.WorkflowEngine.evaluate('lead', 'created', newLead, organisationId);
            logger_1.logger.info('Lead workflows triggered', 'LEADS', userId, organisationId || undefined, { leadId: newLead.id });
        }
        catch (error) {
            logger_1.logger.error('Lead workflow trigger failed', error, 'LEADS', userId, organisationId || undefined, { leadId: newLead.id });
            // Don't fail the request if workflows fail
        }
        logger_1.logger.info('Lead created successfully', 'LEADS', userId, organisationId || undefined, { leadId: newLead.id });
        return apiResponse_1.ResponseHandler.created(res, newLead, 'Lead created successfully');
    }
    catch (error) {
        logger_1.logger.apiError('POST', '/api/leads', error, userId, organisationId || undefined);
        if (error.message.includes('Failed to')) {
            return apiResponse_1.ResponseHandler.serverError(res, error.message);
        }
        return apiResponse_1.ResponseHandler.serverError(res, 'An unexpected error occurred while creating the lead');
    }
};
exports.createLeadEnhanced = createLeadEnhanced;
// PUT /api/leads/:id - Enhanced with validation and error handling
const updateLeadEnhanced = async (req, res) => {
    const user = req.user;
    const userId = user?.id;
    const organisationId = (0, hierarchyUtils_1.getOrgId)(user);
    const leadId = req.params.id;
    try {
        logger_1.logger.apiRequest('PUT', `/api/leads/${leadId}`, userId, organisationId || undefined, req.body);
        // 1. Validate lead ID format
        if (!leadId || leadId.length < 10) {
            return apiResponse_1.ResponseHandler.validationError(res, 'Invalid lead ID format');
        }
        // 2. Check if lead exists and user has access
        const existingLead = await prisma_1.default.lead.findFirst({
            where: {
                id: leadId,
                organisationId: organisationId || undefined,
                isDeleted: false
            }
        }).catch(error => {
            logger_1.logger.dbError('findFirst', 'Lead', error, userId, organisationId || undefined);
            throw new Error('Failed to fetch lead');
        });
        if (!existingLead) {
            logger_1.logger.warn('Attempted to update non-existent lead', 'LEADS', userId, organisationId || undefined, { leadId });
            return apiResponse_1.ResponseHandler.notFound(res, 'Lead not found');
        }
        // 3. Sanitize and validate update data
        const allowedFields = ['firstName', 'lastName', 'email', 'phone', 'company', 'source', 'status', 'leadScore', 'notes'];
        const sanitizedData = (0, validation_1.sanitizeObject)(req.body, allowedFields);
        // 4. Validate updated fields
        const validationErrors = [];
        if (sanitizedData.firstName && !validation_1.leadValidation.firstName(sanitizedData.firstName)) {
            validationErrors.push('First name must be 1-50 characters');
        }
        if (sanitizedData.lastName && !validation_1.leadValidation.lastName(sanitizedData.lastName)) {
            validationErrors.push('Last name must be 1-50 characters');
        }
        if (sanitizedData.email && !validation_1.leadValidation.email(sanitizedData.email)) {
            validationErrors.push('Valid email address is required');
        }
        if (sanitizedData.phone && !validation_1.leadValidation.phone(sanitizedData.phone)) {
            validationErrors.push('Phone number format is invalid');
        }
        if (validationErrors.length > 0) {
            logger_1.logger.warn('Lead update validation failed', 'LEADS', userId, organisationId || undefined, { errors: validationErrors, leadId });
            return apiResponse_1.ResponseHandler.validationError(res, validationErrors);
        }
        // 5. Check for duplicate email if email is being updated
        if (sanitizedData.email && sanitizedData.email !== existingLead.email) {
            const duplicateLead = await prisma_1.default.lead.findFirst({
                where: {
                    email: sanitizedData.email,
                    organisationId: organisationId || '',
                    isDeleted: false,
                    id: { not: leadId }
                }
            }).catch(error => {
                logger_1.logger.dbError('findFirst', 'Lead', error, userId, organisationId || undefined);
                throw new Error('Failed to check for duplicate leads');
            });
            if (duplicateLead) {
                logger_1.logger.warn('Attempted to update lead with duplicate email', 'LEADS', userId, organisationId || undefined, { email: sanitizedData.email, leadId });
                return apiResponse_1.ResponseHandler.validationError(res, 'A lead with this email already exists');
            }
        }
        // 6. Update lead
        const updatedLead = await prisma_1.default.lead.update({
            where: { id: leadId },
            data: {
                ...sanitizedData,
                updatedAt: new Date()
            },
            include: {
                assignedTo: { select: { id: true, firstName: true, lastName: true } }
            }
        }).catch(error => {
            logger_1.logger.dbError('update', 'Lead', error, userId, organisationId || undefined);
            throw new Error('Failed to update lead');
        });
        // 7. Trigger workflows for status changes (non-blocking)
        if (sanitizedData.status && sanitizedData.status !== existingLead.status) {
            try {
                await workflowEngine_1.WorkflowEngine.evaluate('lead', 'updated', updatedLead, organisationId || '');
                logger_1.logger.info('Lead status change workflows triggered', 'LEADS', userId, organisationId || undefined, { leadId, oldStatus: existingLead.status, newStatus: sanitizedData.status });
            }
            catch (error) {
                logger_1.logger.error('Lead workflow trigger failed', error, 'LEADS', userId, organisationId || undefined, { leadId });
            }
        }
        logger_1.logger.info('Lead updated successfully', 'LEADS', userId, organisationId || undefined, { leadId });
        return apiResponse_1.ResponseHandler.success(res, updatedLead, 'Lead updated successfully');
    }
    catch (error) {
        logger_1.logger.apiError('PUT', `/api/leads/${leadId}`, error, userId, organisationId || undefined);
        if (error.message.includes('Failed to')) {
            return apiResponse_1.ResponseHandler.serverError(res, error.message);
        }
        return apiResponse_1.ResponseHandler.serverError(res, 'An unexpected error occurred while updating the lead');
    }
};
exports.updateLeadEnhanced = updateLeadEnhanced;
