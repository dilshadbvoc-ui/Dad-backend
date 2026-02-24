"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DocumentService = void 0;
const prisma_1 = __importDefault(require("../config/prisma"));
const logger_1 = require("../utils/logger");
class DocumentService {
    /**
     * Create a document record and link it to an entity
     */
    static async createDocument(data) {
        try {
            const { organisationId, createdById, leadId, contactId, accountId, opportunityId, ...rest } = data;
            const document = await prisma_1.default.document.create({
                data: {
                    ...rest,
                    organisation: { connect: { id: organisationId } },
                    createdBy: { connect: { id: createdById } },
                    ...(leadId && { lead: { connect: { id: leadId } } }),
                    ...(contactId && { contact: { connect: { id: contactId } } }),
                    ...(accountId && { account: { connect: { id: accountId } } }),
                    ...(opportunityId && { opportunity: { connect: { id: opportunityId } } })
                }
            });
            // Log Interaction
            await prisma_1.default.interaction.create({
                data: {
                    organisationId,
                    type: 'other',
                    subject: 'Document Uploaded',
                    description: `File "${data.name}" uploaded.`,
                    direction: 'inbound',
                    leadId: leadId || undefined,
                    contactId: contactId || undefined,
                    createdById: createdById || undefined
                }
            });
            return document;
        }
        catch (error) {
            logger_1.logger.error('DocumentService.createDocument Error:', error);
            throw error;
        }
    }
    /**
     * Get documents for an entity
     */
    static async getEntityDocuments(entityType, entityId, orgId) {
        try {
            const where = {
                organisationId: orgId,
                isDeleted: false,
                [`${entityType}Id`]: entityId
            };
            return await prisma_1.default.document.findMany({
                where,
                orderBy: { createdAt: 'desc' }
            });
        }
        catch (error) {
            logger_1.logger.error('DocumentService.getEntityDocuments Error:', error);
            throw error;
        }
    }
    /**
     * Soft delete a document
     */
    static async deleteDocument(documentId, orgId) {
        try {
            return await prisma_1.default.document.update({
                where: { id: documentId, organisationId: orgId },
                data: { isDeleted: true }
            });
        }
        catch (error) {
            logger_1.logger.error('DocumentService.deleteDocument Error:', error);
            throw error;
        }
    }
}
exports.DocumentService = DocumentService;
//# sourceMappingURL=DocumentService.js.map