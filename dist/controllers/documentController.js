"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.downloadDocument = exports.deleteDocument = exports.updateDocument = exports.getDocumentById = exports.getDocuments = void 0;
const prisma_1 = __importDefault(require("../config/prisma"));
const hierarchyUtils_1 = require("../utils/hierarchyUtils");
/**
 * Get all documents for the organization
 * GET /api/documents
 */
const getDocuments = async (req, res) => {
    try {
        const user = req.user;
        const orgId = (0, hierarchyUtils_1.getOrgId)(user);
        const { leadId, contactId, accountId, opportunityId, category, search } = req.query;
        const where = {
            organisationId: orgId || user.organisationId,
            isDeleted: false
        };
        if (leadId)
            where.leadId = leadId;
        if (contactId)
            where.contactId = contactId;
        if (accountId)
            where.accountId = accountId;
        if (opportunityId)
            where.opportunityId = opportunityId;
        if (category)
            where.category = category;
        if (search) {
            where.OR = [
                { name: { contains: search, mode: 'insensitive' } },
                { description: { contains: search, mode: 'insensitive' } }
            ];
        }
        const documents = await prisma_1.default.document.findMany({
            where,
            include: {
                createdBy: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                        email: true
                    }
                },
                lead: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                        company: true
                    }
                },
                contact: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true
                    }
                },
                account: {
                    select: {
                        id: true,
                        name: true
                    }
                },
                opportunity: {
                    select: {
                        id: true,
                        name: true
                    }
                }
            },
            orderBy: { createdAt: 'desc' }
        });
        res.json({
            documents,
            total: documents.length
        });
    }
    catch (error) {
        console.error('[Get Documents] Error:', error);
        res.status(500).json({ message: 'Failed to fetch documents: ' + error.message });
    }
};
exports.getDocuments = getDocuments;
/**
 * Get a single document by ID
 * GET /api/documents/:id
 */
const getDocumentById = async (req, res) => {
    try {
        const user = req.user;
        const orgId = (0, hierarchyUtils_1.getOrgId)(user);
        const { id } = req.params;
        const document = await prisma_1.default.document.findFirst({
            where: {
                id,
                organisationId: orgId || user.organisationId,
                isDeleted: false
            },
            include: {
                createdBy: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                        email: true
                    }
                },
                lead: true,
                contact: true,
                account: true,
                opportunity: true
            }
        });
        if (!document) {
            return res.status(404).json({ message: 'Document not found' });
        }
        res.json(document);
    }
    catch (error) {
        console.error('[Get Document] Error:', error);
        res.status(500).json({ message: 'Failed to fetch document: ' + error.message });
    }
};
exports.getDocumentById = getDocumentById;
/**
 * Update document metadata
 * PUT /api/documents/:id
 */
const updateDocument = async (req, res) => {
    try {
        const user = req.user;
        const orgId = (0, hierarchyUtils_1.getOrgId)(user);
        const { id } = req.params;
        const { name, description, category, tags, leadId, contactId, accountId, opportunityId } = req.body;
        // Check if document exists and belongs to org
        const existingDoc = await prisma_1.default.document.findFirst({
            where: {
                id,
                organisationId: orgId || user.organisationId,
                isDeleted: false
            }
        });
        if (!existingDoc) {
            return res.status(404).json({ message: 'Document not found' });
        }
        const document = await prisma_1.default.document.update({
            where: { id },
            data: {
                name: name || existingDoc.name,
                description: description !== undefined ? description : existingDoc.description,
                category: category || existingDoc.category,
                tags: tags || existingDoc.tags,
                leadId: leadId !== undefined ? leadId : existingDoc.leadId,
                contactId: contactId !== undefined ? contactId : existingDoc.contactId,
                accountId: accountId !== undefined ? accountId : existingDoc.accountId,
                opportunityId: opportunityId !== undefined ? opportunityId : existingDoc.opportunityId
            },
            include: {
                createdBy: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                        email: true
                    }
                }
            }
        });
        res.json({
            message: 'Document updated successfully',
            document
        });
    }
    catch (error) {
        console.error('[Update Document] Error:', error);
        res.status(500).json({ message: 'Failed to update document: ' + error.message });
    }
};
exports.updateDocument = updateDocument;
/**
 * Delete document (soft delete)
 * DELETE /api/documents/:id
 */
const deleteDocument = async (req, res) => {
    try {
        const user = req.user;
        const orgId = (0, hierarchyUtils_1.getOrgId)(user);
        const { id } = req.params;
        // Check if document exists and belongs to org
        const existingDoc = await prisma_1.default.document.findFirst({
            where: {
                id,
                organisationId: orgId || user.organisationId,
                isDeleted: false
            }
        });
        if (!existingDoc) {
            return res.status(404).json({ message: 'Document not found' });
        }
        // Soft delete
        await prisma_1.default.document.update({
            where: { id },
            data: { isDeleted: true, deletedAt: new Date() }
        });
        res.json({ message: 'Document deleted successfully' });
    }
    catch (error) {
        console.error('[Delete Document] Error:', error);
        res.status(500).json({ message: 'Failed to delete document: ' + error.message });
    }
};
exports.deleteDocument = deleteDocument;
/**
 * Download document file from database
 * GET /api/documents/:id/download
 */
const downloadDocument = async (req, res) => {
    try {
        const { id } = req.params;
        const document = await prisma_1.default.document.findFirst({
            where: {
                id,
                isDeleted: false
            },
            select: {
                fileData: true,
                fileType: true,
                name: true,
                fileKey: true
            }
        });
        if (!document) {
            return res.status(404).json({ message: 'Document not found' });
        }
        if (!document.fileData) {
            return res.status(404).json({ message: 'File data not available' });
        }
        // Set appropriate headers
        res.setHeader('Content-Type', document.fileType);
        res.setHeader('Content-Disposition', `inline; filename="${document.fileKey}"`);
        res.setHeader('Cache-Control', 'public, max-age=31536000'); // Cache for 1 year
        // Send binary data
        res.send(document.fileData);
    }
    catch (error) {
        console.error('[Download Document] Error:', error);
        res.status(500).json({ message: 'Failed to download document: ' + error.message });
    }
};
exports.downloadDocument = downloadDocument;
