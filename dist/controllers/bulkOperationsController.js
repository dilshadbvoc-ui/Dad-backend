"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.bulkOpportunityOperations = exports.bulkContactOperations = exports.bulkLeadOperations = void 0;
const prisma_1 = __importDefault(require("../config/prisma"));
const hierarchyUtils_1 = require("../utils/hierarchyUtils");
const apiResponse_1 = require("../utils/apiResponse");
const logger_1 = require("../utils/logger");
const emailService_1 = require("../services/emailService");
const whatsAppService_1 = require("../services/whatsAppService");
const auditLogger_1 = require("../utils/auditLogger");
/**
 * Bulk Operations Controller
 * Handles bulk actions across different entities
 */
// POST /api/bulk/leads
const bulkLeadOperations = async (req, res) => {
    const user = req.user;
    const userId = user?.id;
    const organisationId = (0, hierarchyUtils_1.getOrgId)(user);
    const { action, leadIds, data } = req.body;
    try {
        logger_1.logger.apiRequest('POST', '/api/bulk/leads', userId, organisationId || undefined, { action, count: leadIds?.length });
        if (!organisationId) {
            return apiResponse_1.ResponseHandler.forbidden(res, 'User not associated with an organisation');
        }
        if (!action || !leadIds || !Array.isArray(leadIds) || leadIds.length === 0) {
            return apiResponse_1.ResponseHandler.validationError(res, 'Action and leadIds are required');
        }
        if (leadIds.length > 1000) {
            return apiResponse_1.ResponseHandler.validationError(res, 'Maximum 1000 leads can be processed at once');
        }
        let result;
        let message = '';
        switch (action) {
            case 'assign': {
                if (!data?.assignedToId) {
                    return apiResponse_1.ResponseHandler.validationError(res, 'assignedToId is required for assign action');
                }
                // Verify user belongs to org
                const assignedUser = await prisma_1.default.user.findFirst({
                    where: { id: data.assignedToId, organisationId }
                });
                if (!assignedUser) {
                    return apiResponse_1.ResponseHandler.validationError(res, 'Assigned user does not belong to your organisation');
                }
                result = await prisma_1.default.lead.updateMany({
                    where: {
                        id: { in: leadIds },
                        organisationId,
                        isDeleted: false
                    },
                    data: {
                        assignedToId: data.assignedToId,
                        updatedAt: new Date()
                    }
                });
                await (0, auditLogger_1.logAudit)({
                    organisationId,
                    actorId: userId,
                    action: 'BULK_LEAD_ASSIGN',
                    entity: 'Lead',
                    details: { count: leadIds.length, assignedToId: data.assignedToId }
                });
                message = `${result.count} leads assigned successfully`;
                break;
            }
            case 'update-status':
                if (!data?.status) {
                    return apiResponse_1.ResponseHandler.validationError(res, 'status is required for update-status action');
                }
                result = await prisma_1.default.lead.updateMany({
                    where: {
                        id: { in: leadIds },
                        organisationId,
                        isDeleted: false
                    },
                    data: {
                        status: data.status,
                        updatedAt: new Date()
                    }
                });
                await (0, auditLogger_1.logAudit)({
                    organisationId,
                    actorId: userId,
                    action: 'BULK_LEAD_UPDATE_STATUS',
                    entity: 'Lead',
                    details: { count: leadIds.length, status: data.status }
                });
                message = `${result.count} leads status updated successfully`;
                break;
            case 'add-tags': {
                if (!data?.tags || !Array.isArray(data.tags)) {
                    return apiResponse_1.ResponseHandler.validationError(res, 'tags array is required for add-tags action');
                }
                // Get existing leads with their current tags
                const leadsWithTags = await prisma_1.default.lead.findMany({
                    where: {
                        id: { in: leadIds },
                        organisationId,
                        isDeleted: false
                    },
                    select: { id: true, tags: true }
                });
                // Update each lead with merged tags
                const updatePromises = leadsWithTags.map(lead => {
                    const existingTags = lead.tags || [];
                    const newTags = [...new Set([...existingTags, ...data.tags])]; // Remove duplicates
                    return prisma_1.default.lead.update({
                        where: { id: lead.id },
                        data: {
                            tags: newTags,
                            updatedAt: new Date()
                        }
                    });
                });
                await Promise.all(updatePromises);
                await (0, auditLogger_1.logAudit)({
                    organisationId,
                    actorId: userId,
                    action: 'BULK_LEAD_ADD_TAGS',
                    entity: 'Lead',
                    details: { count: leadsWithTags.length, tags: data.tags }
                });
                message = `Tags added to ${leadsWithTags.length} leads successfully`;
                break;
            }
            case 'send-email': {
                if (!data?.subject || !data?.content) {
                    return apiResponse_1.ResponseHandler.validationError(res, 'subject and content are required for send-email action');
                }
                // Get leads with email addresses
                const leadsWithEmail = await prisma_1.default.lead.findMany({
                    where: {
                        id: { in: leadIds },
                        organisationId,
                        isDeleted: false,
                        email: { not: null },
                        NOT: { email: '' }
                    },
                    select: { id: true, email: true, firstName: true, lastName: true }
                });
                // Send emails (in background)
                const emailPromises = leadsWithEmail.map(async (lead) => {
                    try {
                        const personalizedContent = data.content
                            .replace(/\{firstName\}/g, lead.firstName)
                            .replace(/\{lastName\}/g, lead.lastName)
                            .replace(/\{fullName\}/g, `${lead.firstName} ${lead.lastName}`);
                        await emailService_1.EmailService.sendEmail(lead.email, data.subject, personalizedContent, organisationId, userId, { leadId: lead.id });
                    }
                    catch (error) {
                        logger_1.logger.error('Failed to send email to lead', error, 'BULK_EMAIL', userId, organisationId, { leadId: lead.id });
                    }
                });
                // Don't wait for all emails to complete
                Promise.all(emailPromises).catch(error => {
                    logger_1.logger.error('Some bulk emails failed', error, 'BULK_EMAIL', userId, organisationId);
                });
                await (0, auditLogger_1.logAudit)({
                    organisationId,
                    actorId: userId,
                    action: 'BULK_LEAD_SEND_EMAIL',
                    entity: 'Lead',
                    details: { count: leadsWithEmail.length, subject: data.subject }
                });
                message = `Email sending initiated for ${leadsWithEmail.length} leads`;
                break;
            }
            case 'send-whatsapp': {
                if (!data?.message) {
                    return apiResponse_1.ResponseHandler.validationError(res, 'message is required for send-whatsapp action');
                }
                // Get leads with phone numbers
                const leadsWithPhone = await prisma_1.default.lead.findMany({
                    where: {
                        id: { in: leadIds },
                        organisationId,
                        isDeleted: false,
                        phone: { not: '' }
                    },
                    select: { id: true, phone: true, firstName: true, lastName: true }
                });
                // Send WhatsApp messages (in background)
                const whatsappPromises = leadsWithPhone.map(async (lead) => {
                    try {
                        const personalizedMessage = data.message
                            .replace(/\{firstName\}/g, lead.firstName)
                            .replace(/\{lastName\}/g, lead.lastName)
                            .replace(/\{fullName\}/g, `${lead.firstName} ${lead.lastName}`);
                        await whatsAppService_1.WhatsAppService.getClientForOrg(organisationId)?.then(client => client?.sendTextMessage(lead.phone, personalizedMessage));
                        // Log interaction
                        await prisma_1.default.interaction.create({
                            data: {
                                type: 'other', // Using 'other' for WhatsApp messages
                                direction: 'outbound',
                                subject: 'WhatsApp Message',
                                description: personalizedMessage,
                                leadId: lead.id,
                                createdById: userId,
                                organisationId
                            }
                        });
                    }
                    catch (error) {
                        logger_1.logger.error('Failed to send WhatsApp to lead', error, 'BULK_WHATSAPP', userId, organisationId, { leadId: lead.id });
                    }
                });
                // Don't wait for all messages to complete
                Promise.all(whatsappPromises).catch(error => {
                    logger_1.logger.error('Some bulk WhatsApp messages failed', error, 'BULK_WHATSAPP', userId, organisationId);
                });
                await (0, auditLogger_1.logAudit)({
                    organisationId,
                    actorId: userId,
                    action: 'BULK_LEAD_SEND_WHATSAPP',
                    entity: 'Lead',
                    details: { count: leadsWithPhone.length }
                });
                message = `WhatsApp messages sending initiated for ${leadsWithPhone.length} leads`;
                break;
            }
            case 'delete':
                result = await prisma_1.default.lead.updateMany({
                    where: {
                        id: { in: leadIds },
                        organisationId,
                        isDeleted: false
                    },
                    data: {
                        isDeleted: true,
                        updatedAt: new Date()
                    }
                });
                await (0, auditLogger_1.logAudit)({
                    organisationId,
                    actorId: userId,
                    action: 'BULK_LEAD_DELETE',
                    entity: 'Lead',
                    details: { count: leadIds.length }
                });
                message = `${result.count} leads deleted successfully`;
                break;
            case 'export': {
                // Get leads data for export
                const exportLeads = await prisma_1.default.lead.findMany({
                    where: {
                        id: { in: leadIds },
                        organisationId,
                        isDeleted: false
                    },
                    include: {
                        assignedTo: { select: { firstName: true, lastName: true } }
                    }
                });
                // Format data for export
                const exportData = exportLeads.map(lead => ({
                    'First Name': lead.firstName,
                    'Last Name': lead.lastName,
                    'Email': lead.email || '',
                    'Phone': lead.phone || '',
                    'Company': lead.company || '',
                    'Status': lead.status,
                    'Lead Score': lead.leadScore,
                    'Source': lead.source,
                    'Assigned To': lead.assignedTo ? `${lead.assignedTo.firstName} ${lead.assignedTo.lastName}` : '',
                    'Created At': lead.createdAt.toISOString(),
                    'Updated At': lead.updatedAt.toISOString()
                }));
                return apiResponse_1.ResponseHandler.success(res, {
                    data: exportData,
                    filename: `leads_export_${new Date().toISOString().split('T')[0]}.csv`,
                    count: exportData.length
                }, 'Export data prepared successfully');
            }
            default:
                return apiResponse_1.ResponseHandler.validationError(res, `Unsupported action: ${action}`);
        }
        logger_1.logger.info(`Bulk lead operation completed: ${action}`, 'BULK_LEADS', userId, organisationId, { count: leadIds.length });
        return apiResponse_1.ResponseHandler.success(res, { processed: result?.count || leadIds.length }, message);
    }
    catch (error) {
        logger_1.logger.apiError('POST', '/api/bulk/leads', error, userId, organisationId || undefined);
        return apiResponse_1.ResponseHandler.serverError(res, 'An error occurred while processing bulk operation');
    }
};
exports.bulkLeadOperations = bulkLeadOperations;
// POST /api/bulk/contacts
const bulkContactOperations = async (req, res) => {
    const user = req.user;
    const userId = user?.id;
    const organisationId = (0, hierarchyUtils_1.getOrgId)(user);
    const { action, contactIds, data } = req.body;
    try {
        logger_1.logger.apiRequest('POST', '/api/bulk/contacts', userId, organisationId || undefined, { action, count: contactIds?.length });
        if (!organisationId) {
            return apiResponse_1.ResponseHandler.forbidden(res, 'User not associated with an organisation');
        }
        if (!action || !contactIds || !Array.isArray(contactIds) || contactIds.length === 0) {
            return apiResponse_1.ResponseHandler.validationError(res, 'Action and contactIds are required');
        }
        let result;
        let message = '';
        switch (action) {
            case 'assign-owner':
                if (!data?.ownerId) {
                    return apiResponse_1.ResponseHandler.validationError(res, 'ownerId is required for assign-owner action');
                }
                result = await prisma_1.default.contact.updateMany({
                    where: {
                        id: { in: contactIds },
                        organisationId,
                        isDeleted: false
                    },
                    data: {
                        ownerId: data.ownerId,
                        updatedAt: new Date()
                    }
                });
                await (0, auditLogger_1.logAudit)({
                    organisationId,
                    actorId: userId,
                    action: 'BULK_CONTACT_ASSIGN',
                    entity: 'Contact',
                    details: { count: contactIds.length, ownerId: data.ownerId }
                });
                message = `${result.count} contacts assigned successfully`;
                break;
            case 'add-to-campaign': {
                if (!data?.campaignId) {
                    return apiResponse_1.ResponseHandler.validationError(res, 'campaignId is required for add-to-campaign action');
                }
                // Add contacts to email list associated with campaign
                const campaign = await prisma_1.default.campaign.findUnique({
                    where: { id: data.campaignId },
                    select: { emailListId: true }
                });
                if (!campaign?.emailListId) {
                    return apiResponse_1.ResponseHandler.validationError(res, 'Campaign does not have an associated email list');
                }
                // Get contacts that aren't already in the email list
                const contactsToAdd = await prisma_1.default.contact.findMany({
                    where: {
                        id: { in: contactIds },
                        organisationId,
                        emailLists: {
                            none: { id: campaign.emailListId }
                        }
                    }
                });
                // Add contacts to email list
                await prisma_1.default.emailList.update({
                    where: { id: campaign.emailListId },
                    data: {
                        contacts: {
                            connect: contactsToAdd.map(contact => ({ id: contact.id }))
                        }
                    }
                });
                message = `${contactsToAdd.length} contacts added to campaign successfully`;
                break;
            }
            case 'delete':
                result = await prisma_1.default.contact.updateMany({
                    where: {
                        id: { in: contactIds },
                        organisationId,
                        isDeleted: false
                    },
                    data: {
                        isDeleted: true,
                        updatedAt: new Date()
                    }
                });
                await (0, auditLogger_1.logAudit)({
                    organisationId,
                    actorId: userId,
                    action: 'BULK_CONTACT_DELETE',
                    entity: 'Contact',
                    details: { count: contactIds.length }
                });
                message = `${result.count} contacts deleted successfully`;
                break;
            case 'export': {
                const exportContacts = await prisma_1.default.contact.findMany({
                    where: {
                        id: { in: contactIds },
                        organisationId
                    },
                    include: {
                        account: { select: { name: true } },
                        owner: { select: { firstName: true, lastName: true } }
                    }
                });
                const exportData = exportContacts.map(contact => ({
                    'First Name': contact.firstName,
                    'Last Name': contact.lastName,
                    'Email': contact.email || '',
                    'Job Title': contact.jobTitle || '',
                    'Department': contact.department || '',
                    'Account': contact.account?.name || '',
                    'Owner': contact.owner ? `${contact.owner.firstName} ${contact.owner.lastName}` : '',
                    'Created At': contact.createdAt.toISOString(),
                    'Updated At': contact.updatedAt.toISOString()
                }));
                return apiResponse_1.ResponseHandler.success(res, {
                    data: exportData,
                    filename: `contacts_export_${new Date().toISOString().split('T')[0]}.csv`,
                    count: exportData.length
                }, 'Export data prepared successfully');
            }
            default:
                return apiResponse_1.ResponseHandler.validationError(res, `Unsupported action: ${action}`);
        }
        logger_1.logger.info(`Bulk contact operation completed: ${action}`, 'BULK_CONTACTS', userId, organisationId, { count: contactIds.length });
        return apiResponse_1.ResponseHandler.success(res, { processed: result?.count || contactIds.length }, message);
    }
    catch (error) {
        logger_1.logger.apiError('POST', '/api/bulk/contacts', error, userId, organisationId || undefined);
        return apiResponse_1.ResponseHandler.serverError(res, 'An error occurred while processing bulk operation');
    }
};
exports.bulkContactOperations = bulkContactOperations;
// POST /api/bulk/opportunities
const bulkOpportunityOperations = async (req, res) => {
    const user = req.user;
    const userId = user?.id;
    const organisationId = (0, hierarchyUtils_1.getOrgId)(user);
    const { action, opportunityIds, data } = req.body;
    try {
        logger_1.logger.apiRequest('POST', '/api/bulk/opportunities', userId, organisationId || undefined, { action, count: opportunityIds?.length });
        if (!organisationId) {
            return apiResponse_1.ResponseHandler.forbidden(res, 'User not associated with an organisation');
        }
        if (!action || !opportunityIds || !Array.isArray(opportunityIds) || opportunityIds.length === 0) {
            return apiResponse_1.ResponseHandler.validationError(res, 'Action and opportunityIds are required');
        }
        let result;
        let message = '';
        switch (action) {
            case 'update-stage':
                if (!data?.stage) {
                    return apiResponse_1.ResponseHandler.validationError(res, 'stage is required for update-stage action');
                }
                result = await prisma_1.default.opportunity.updateMany({
                    where: {
                        id: { in: opportunityIds },
                        organisationId
                    },
                    data: {
                        stage: data.stage,
                        probability: data.probability || undefined,
                        updatedAt: new Date()
                    }
                });
                message = `${result.count} opportunities stage updated successfully`;
                await (0, auditLogger_1.logAudit)({
                    organisationId,
                    actorId: userId,
                    action: 'BULK_OPPORTUNITY_UPDATE_STAGE',
                    entity: 'Opportunity',
                    details: { count: opportunityIds.length, stage: data.stage }
                });
                break;
            case 'assign-owner':
                if (!data?.ownerId) {
                    return apiResponse_1.ResponseHandler.validationError(res, 'ownerId is required for assign-owner action');
                }
                result = await prisma_1.default.opportunity.updateMany({
                    where: {
                        id: { in: opportunityIds },
                        organisationId
                    },
                    data: {
                        ownerId: data.ownerId,
                        updatedAt: new Date()
                    }
                });
                message = `${result.count} opportunities assigned successfully`;
                await (0, auditLogger_1.logAudit)({
                    organisationId,
                    actorId: userId,
                    action: 'BULK_OPPORTUNITY_ASSIGN',
                    entity: 'Opportunity',
                    details: { count: opportunityIds.length, ownerId: data.ownerId }
                });
                break;
            case 'delete':
                result = await prisma_1.default.opportunity.updateMany({
                    where: {
                        id: { in: opportunityIds },
                        organisationId,
                        isDeleted: false
                    },
                    data: {
                        isDeleted: true,
                        updatedAt: new Date()
                    }
                });
                await (0, auditLogger_1.logAudit)({
                    organisationId,
                    actorId: userId,
                    action: 'BULK_OPPORTUNITY_DELETE',
                    entity: 'Opportunity',
                    details: { count: opportunityIds.length }
                });
                message = `${result.count} opportunities deleted successfully`;
                break;
            case 'export': {
                const exportOpportunities = await prisma_1.default.opportunity.findMany({
                    where: {
                        id: { in: opportunityIds },
                        organisationId
                    },
                    include: {
                        account: { select: { name: true } },
                        owner: { select: { firstName: true, lastName: true } }
                    }
                });
                const exportData = exportOpportunities.map(opp => ({
                    'Name': opp.name,
                    'Account': opp.account.name,
                    'Amount': opp.amount,
                    'Stage': opp.stage,
                    'Probability': opp.probability,
                    'Close Date': opp.closeDate?.toISOString().split('T')[0] || '',
                    'Lead Source': opp.leadSource || '',
                    'Owner': opp.owner ? `${opp.owner.firstName} ${opp.owner.lastName}` : '',
                    'Created At': opp.createdAt.toISOString(),
                    'Updated At': opp.updatedAt.toISOString()
                }));
                return apiResponse_1.ResponseHandler.success(res, {
                    data: exportData,
                    filename: `opportunities_export_${new Date().toISOString().split('T')[0]}.csv`,
                    count: exportData.length
                }, 'Export data prepared successfully');
            }
            default:
                return apiResponse_1.ResponseHandler.validationError(res, `Unsupported action: ${action}`);
        }
        logger_1.logger.info(`Bulk opportunity operation completed: ${action}`, 'BULK_OPPORTUNITIES', userId, organisationId, { count: opportunityIds.length });
        return apiResponse_1.ResponseHandler.success(res, { processed: result?.count || opportunityIds.length }, message);
    }
    catch (error) {
        logger_1.logger.apiError('POST', '/api/bulk/opportunities', error, userId, organisationId || undefined);
        return apiResponse_1.ResponseHandler.serverError(res, 'An error occurred while processing bulk operation');
    }
};
exports.bulkOpportunityOperations = bulkOpportunityOperations;
