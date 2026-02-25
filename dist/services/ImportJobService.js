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
exports.ImportJobService = void 0;
const prisma_1 = __importDefault(require("../config/prisma"));
const fs_1 = __importDefault(require("fs"));
const csv_parser_1 = __importDefault(require("csv-parser"));
const distributionService_1 = require("./distributionService");
class ImportJobService {
    static async createJob(userId, orgId, filePath, mapping, options) {
        return await prisma_1.default.importJob.create({
            data: {
                createdById: userId,
                organisationId: orgId,
                fileUrl: filePath,
                mapping: mapping,
                status: 'pending',
                metadata: options ? {
                    defaultStatus: options.defaultStatus,
                    pipelineId: options.pipelineId,
                    defaultStage: options.defaultStage,
                    branchId: options.branchId,
                    applyAssignmentRules: options.applyAssignmentRules || false
                } : undefined
            }
        });
    }
    static async processJob(jobId) {
        try {
            const job = await prisma_1.default.importJob.findUnique({ where: { id: jobId } });
            if (!job || !job.fileUrl)
                return;
            // Update status to processing
            await prisma_1.default.importJob.update({
                where: { id: jobId },
                data: { status: 'processing', startedAt: new Date() }
            });
            const errors = [];
            let successCount = 0;
            let failureCount = 0;
            // 1. Count total lines (approximation)
            let totalLines = 0;
            await new Promise((resolve) => {
                fs_1.default.createReadStream(job.fileUrl).pipe((0, csv_parser_1.default)())
                    .on('data', () => totalLines++)
                    .on('end', resolve);
            });
            await prisma_1.default.importJob.update({
                where: { id: jobId },
                data: { total: totalLines }
            });
            // 2. Process File
            const processStream = fs_1.default.createReadStream(job.fileUrl).pipe((0, csv_parser_1.default)());
            // Get import options from metadata
            const metadata = job.metadata || {};
            const defaultStatus = metadata.defaultStatus || 'new';
            const pipelineId = metadata.pipelineId || null;
            const defaultStage = metadata.defaultStage || null;
            const branchId = metadata.branchId || null;
            const applyAssignmentRules = metadata.applyAssignmentRules || false;
            for await (const row of processStream) {
                try {
                    const leadData = {
                        organisationId: job.organisationId,
                        assignedToId: applyAssignmentRules ? undefined : job.createdById,
                        source: 'import',
                        status: defaultStatus,
                        address: {}
                    };
                    // Add pipeline and stage if specified
                    if (pipelineId) {
                        leadData.pipelineId = pipelineId;
                    }
                    if (defaultStage) {
                        leadData.stage = defaultStage;
                    }
                    // Add branch if specified
                    if (branchId) {
                        leadData.branchId = branchId;
                    }
                    const mapping = job.mapping || {};
                    // Map fields
                    for (const [csvHeader, crmField] of Object.entries(mapping)) {
                        if (!crmField)
                            continue;
                        const value = row[csvHeader];
                        if (value === undefined || value === null || value === '')
                            continue;
                        if (String(crmField) === 'fullName') {
                            // Split full name into first and last
                            const nameParts = String(value).trim().split(' ');
                            leadData.firstName = nameParts[0] || '';
                            leadData.lastName = nameParts.slice(1).join(' ') || nameParts[0] || '';
                        }
                        else if (String(crmField) === 'tags') {
                            // Handle comma-separated tags
                            leadData.tags = String(value).split(',').map(t => t.trim()).filter(Boolean);
                        }
                        else if (String(crmField) === 'notes') {
                            // Store notes in customFields
                            if (!leadData.customFields)
                                leadData.customFields = {};
                            leadData.customFields.importNotes = value;
                        }
                        else if (String(crmField).startsWith('address.')) {
                            const addressField = String(crmField).split('.')[1];
                            leadData.address[addressField] = value;
                        }
                        else if (['firstName', 'lastName', 'email', 'phone', 'company', 'jobTitle', 'source', 'status', 'stage', 'assignedToId', 'ownerEmail'].includes(crmField)) {
                            leadData[crmField] = value;
                        }
                        else {
                            // Custom Fields
                            if (!leadData.customFields)
                                leadData.customFields = {};
                            leadData.customFields[crmField] = value;
                        }
                    }
                    // Basic Validation
                    if (!leadData.firstName || !leadData.lastName || (!leadData.phone && !leadData.email)) {
                        throw new Error('Missing required fields (Name and at least Phone or Email)');
                    }
                    // Sanitize phone
                    if (leadData.phone) {
                        leadData.phone = leadData.phone.toString().replace(/\D/g, '');
                        if (leadData.phone.length > 10) {
                            leadData.phone = leadData.phone.slice(-10);
                        }
                    }
                    // Handle Owner Lookup by Email
                    if (leadData.ownerEmail) {
                        const owner = await prisma_1.default.user.findFirst({
                            where: {
                                email: leadData.ownerEmail,
                                organisationId: job.organisationId,
                                isActive: true
                            },
                            select: { id: true }
                        });
                        if (owner) {
                            leadData.assignedToId = owner.id;
                        }
                        delete leadData.ownerEmail;
                    }
                    // Check for duplicates using DuplicateLeadService
                    const { DuplicateLeadService } = await Promise.resolve().then(() => __importStar(require('./duplicateLeadService')));
                    const duplicateCheck = await DuplicateLeadService.checkDuplicate(leadData.phone, leadData.email, job.organisationId);
                    if (duplicateCheck.isDuplicate && duplicateCheck.existingLead) {
                        // Handle as re-enquiry instead of creating duplicate
                        await DuplicateLeadService.handleReEnquiry(duplicateCheck.existingLead, {
                            firstName: leadData.firstName,
                            lastName: leadData.lastName,
                            email: leadData.email,
                            phone: leadData.phone,
                            company: leadData.company,
                            source: 'import',
                            sourceDetails: { importJobId: jobId }
                        }, job.organisationId);
                        // Count as success (re-enquiry handled)
                        successCount++;
                        continue;
                    }
                    // Set assignedToId to uploader as fallback if not set by mapping
                    if (!leadData.assignedToId) {
                        leadData.assignedToId = job.createdById;
                    }
                    const createdLead = await prisma_1.default.lead.create({ data: leadData });
                    // Assign Lead via Rules (only if flag is set, or if no explicit owner was mapped)
                    if (applyAssignmentRules) {
                        await distributionService_1.DistributionService.assignLead(createdLead, job.organisationId);
                    }
                    successCount++;
                }
                catch (err) {
                    failureCount++;
                    errors.push({ row, error: err.message });
                }
                // Update progress every 10 rows
                if ((successCount + failureCount) % 10 === 0) {
                    await prisma_1.default.importJob.update({
                        where: { id: jobId },
                        data: {
                            progress: successCount + failureCount,
                            successCount,
                            failureCount
                        }
                    });
                }
            }
            // Final Update
            await prisma_1.default.importJob.update({
                where: { id: jobId },
                data: {
                    status: 'completed',
                    completedAt: new Date(),
                    progress: totalLines,
                    successCount,
                    failureCount,
                    errors: errors.length > 0 ? errors : undefined
                }
            });
            // Audit the import completion
            const { logAudit } = await Promise.resolve().then(() => __importStar(require('../utils/auditLogger')));
            await logAudit({
                organisationId: job.organisationId,
                actorId: job.createdById,
                action: 'BULK_IMPORT_COMPLETED',
                entity: 'Lead',
                details: { jobId, successCount, failureCount }
            });
            // Cleanup file
            if (fs_1.default.existsSync(job.fileUrl)) {
                fs_1.default.unlinkSync(job.fileUrl);
            }
        }
        catch (error) {
            console.error(`Job ${jobId} failed:`, error);
            await prisma_1.default.importJob.update({
                where: { id: jobId },
                data: {
                    status: 'failed',
                    completedAt: new Date(),
                    errors: [{ error: error.message }]
                }
            });
        }
    }
}
exports.ImportJobService = ImportJobService;
//# sourceMappingURL=importJobService.js.map