"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadDocument = exports.uploadGenericImage = exports.logCallWithoutRecording = exports.uploadCallRecording = void 0;
const prisma_1 = __importDefault(require("../config/prisma"));
const hierarchyUtils_1 = require("../utils/hierarchyUtils");
const uploadCallRecording = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: 'No file uploaded' });
        }
        const { phoneNumber, duration, timestamp } = req.body;
        const user = req.user;
        const orgId = (0, hierarchyUtils_1.getOrgId)(user);
        if (!phoneNumber) {
            // If no phone number, we can't link it easily, but we still save the file.
            // Or we could require it. Let's require it for now as the mobile app should parse it.
            return res.status(400).json({ message: 'Phone number is required' });
        }
        // Clean phone number (remove non-digits, maybe keep +)
        const cleanPhone = phoneNumber.replace(/[^0-9]/g, '');
        // 0. Storage Limit Check (basic implementation)
        const org = await prisma_1.default.organisation.findUnique({
            where: { id: orgId || user.organisationId },
            select: { storageLimit: true }
        });
        if (org && org.storageLimit > 0) {
            // Calculate total storage used by this org
            const totalUsed = await prisma_1.default.interaction.aggregate({
                where: { organisationId: orgId || user.organisationId, recordingUrl: { not: null } },
                _sum: { recordingDuration: true } // Duration is a proxy, but better to check file size if we tracked it.
                // Since we don't track file size in DB, we'll use a count-based heuristic or just duration sum as placeholder
                // or ideally use fs to check size of uploads/recordings.
                // For now, let's assume 1MB per 60s of recording.
            });
            const estimatedMB = Math.ceil((totalUsed._sum.recordingDuration || 0) / 60);
            if (estimatedMB >= org.storageLimit) {
                return res.status(403).json({
                    message: `Storage limit reached (${org.storageLimit}MB). Please upgrade.`,
                    code: 'STORAGE_LIMIT_EXCEEDED'
                });
            }
        }
        // Find Lead or Contact
        let entityId = null;
        let entityType = null;
        // Try Lead
        const lead = await prisma_1.default.lead.findFirst({
            where: {
                organisationId: orgId || undefined,
                phone: { contains: cleanPhone } // Loose match
            }
        });
        if (lead) {
            entityId = lead.id;
            entityType = 'lead';
        }
        // SAVE TO DATABASE (DOCUMENT TABLE)
        const fileData = req.file.buffer;
        const filename = `recording-${cleanPhone}-${timestamp || Date.now()}.mp3`;
        const document = await prisma_1.default.document.create({
            data: {
                name: filename,
                fileKey: filename,
                fileData: fileData,
                fileType: req.file.mimetype || 'audio/mpeg',
                fileSize: req.file.size,
                category: 'recording',
                organisationId: orgId || user.organisationId,
                createdById: user.id,
                leadId: entityType === 'lead' ? entityId : undefined
            }
        });
        // Create Interaction linked to Document
        const interaction = await prisma_1.default.interaction.create({
            data: {
                organisationId: orgId || user.organisationId,
                type: 'call',
                subject: `Recorded Call with ${phoneNumber}`,
                description: `Automatic recording upload. Duration: ${duration || '?'}s`,
                date: new Date(parseInt(timestamp) || Date.now()),
                leadId: entityType === 'lead' ? entityId : undefined,
                createdById: user.id,
                recordingUrl: `/api/documents/${document.id}/download`, // Virtual URL for frontend
                documentId: document.id, // Soft link to actual binary data
                recordingDuration: parseInt(duration) || 0,
                direction: 'outbound',
                phoneNumber: phoneNumber,
                callStatus: 'completed'
            }
        });
        res.json({
            message: 'Recording uploaded successfully (DB Storage)',
            interactionId: interaction.id,
            linkedTo: entityType ? `${entityType} ${entityId}` : 'Unlinked'
        });
    }
    catch (error) {
        console.error('[Upload Call] Error:', error);
        res.status(500).json({ message: 'Upload failed: ' + error.message });
    }
};
exports.uploadCallRecording = uploadCallRecording;
/**
 * Log a call without a recording (for when Android blocks audio capture)
 * POST /api/upload/log-call
 */
const logCallWithoutRecording = async (req, res) => {
    try {
        const { phoneNumber, duration, timestamp, subject, description } = req.body;
        const user = req.user;
        const orgId = (0, hierarchyUtils_1.getOrgId)(user);
        if (!phoneNumber) {
            return res.status(400).json({ message: 'Phone number is required' });
        }
        // Clean phone number
        const cleanPhone = phoneNumber.replace(/[^0-9]/g, '').slice(-10);
        // Find Lead by phone
        const lead = await prisma_1.default.lead.findFirst({
            where: {
                organisationId: orgId || undefined,
                phone: { contains: cleanPhone }
            }
        });
        // Create Interaction (without recording)
        const interaction = await prisma_1.default.interaction.create({
            data: {
                organisationId: orgId || user.organisationId,
                type: 'call',
                subject: subject || `Phone Call with ${phoneNumber}`,
                description: description || `Auto-logged call. Duration: ${duration || 0}s. Recording unavailable due to Android restrictions.`,
                date: new Date(parseInt(timestamp) || Date.now()),
                leadId: lead?.id,
                createdById: user.id,
                recordingDuration: parseInt(duration) || 0,
                direction: 'outbound',
                phoneNumber: phoneNumber,
                callStatus: 'completed'
            }
        });
        res.json({
            message: 'Call logged successfully (without recording)',
            interactionId: interaction.id,
            linkedTo: lead ? `lead ${lead.id}` : 'Unlinked'
        });
    }
    catch (error) {
        console.error('[Log Call] Error:', error);
        res.status(500).json({ message: 'Log call failed: ' + error.message });
    }
};
exports.logCallWithoutRecording = logCallWithoutRecording;
const uploadGenericImage = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: 'No file uploaded' });
        }
        const user = req.user;
        const orgId = (0, hierarchyUtils_1.getOrgId)(user);
        // DEBUG LOGGING
        console.log(`[UploadController] uploadGenericImage called for user ${user.id}`);
        console.log(`[UploadController] File: ${req.file.originalname}, Size: ${req.file.size}, Mime: ${req.file.mimetype}`);
        // Read file data as buffer
        const fileData = req.file.buffer;
        // Save image to database
        const document = await prisma_1.default.document.create({
            data: {
                name: req.file.originalname,
                fileKey: req.file.originalname,
                fileData: fileData,
                fileUrl: null,
                fileType: req.file.mimetype,
                fileSize: req.file.size,
                category: 'image',
                tags: [],
                organisationId: orgId || user.organisationId,
                createdById: user.id
            }
        });
        res.json({
            message: 'Image uploaded successfully',
            url: `/api/documents/${document.id}/download`,
            documentId: document.id
        });
    }
    catch (error) {
        console.error('[Upload Image] Error:', error);
        res.status(500).json({ message: 'Upload failed: ' + error.message });
    }
};
exports.uploadGenericImage = uploadGenericImage;
const uploadDocument = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: 'No file uploaded' });
        }
        const user = req.user;
        const orgId = (0, hierarchyUtils_1.getOrgId)(user);
        // Get optional metadata from request body
        const { name, description, category, leadId, contactId, accountId, opportunityId } = req.body;
        // Read file data as buffer
        const fileData = req.file.buffer;
        // Save document to database with binary data
        const document = await prisma_1.default.document.create({
            data: {
                name: name || req.file.originalname,
                description: description || null,
                fileKey: req.file.originalname,
                fileData: fileData, // Store binary data in database
                fileUrl: null, // No external URL needed
                fileType: req.file.mimetype,
                fileSize: req.file.size,
                category: category || 'other',
                tags: [],
                organisationId: orgId || user.organisationId,
                createdById: user.id,
                leadId: leadId || null,
                contactId: contactId || null,
                accountId: accountId || null,
                opportunityId: opportunityId || null
            }
        });
        res.json({
            message: 'Document uploaded successfully',
            url: `/api/documents/${document.id}/download`, // API endpoint to retrieve file
            originalName: req.file.originalname,
            size: req.file.size,
            documentId: document.id,
            document: {
                id: document.id,
                name: document.name,
                fileUrl: `/api/documents/${document.id}/download`,
                fileType: document.fileType,
                fileSize: document.fileSize,
                category: document.category,
                createdAt: document.createdAt
            }
        });
    }
    catch (error) {
        console.error('[Upload Document] Error:', error);
        res.status(500).json({ message: 'Upload failed: ' + error.message });
    }
};
exports.uploadDocument = uploadDocument;
//# sourceMappingURL=uploadController.js.map