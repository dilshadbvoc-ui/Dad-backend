import prisma from '../config/prisma';
import fs from 'fs';
import csv from 'csv-parser';
import { DistributionService } from './distributionService';

export class ImportJobService {
    static async createJob(userId: string, orgId: string, filePath: string, mapping: any, options?: {
        defaultStatus?: string;
        pipelineId?: string;
        defaultStage?: string;
        branchId?: string;
        applyAssignmentRules?: boolean;
    }) {
        return await prisma.importJob.create({
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

    static async processJob(jobId: string) {
        try {
            const job = await prisma.importJob.findUnique({ where: { id: jobId } });
            if (!job || !job.fileUrl) return;

            // Update status to processing
            await prisma.importJob.update({
                where: { id: jobId },
                data: { status: 'processing', startedAt: new Date() }
            });

            const errors: any[] = [];
            let successCount = 0;
            let failureCount = 0;

            // 1. Count total lines (approximation)
            let totalLines = 0;
            await new Promise((resolve) => {
                fs.createReadStream(job.fileUrl!).pipe(csv())
                    .on('data', () => totalLines++)
                    .on('end', resolve);
            });

            await prisma.importJob.update({
                where: { id: jobId },
                data: { total: totalLines }
            });

            // 2. Process File
            const processStream = fs.createReadStream(job.fileUrl).pipe(csv());

            // Get import options from metadata
            const metadata = job.metadata as any || {};
            const defaultStatus = metadata.defaultStatus || 'new';
            const pipelineId = metadata.pipelineId || null;
            const defaultStage = metadata.defaultStage || null;
            const branchId = metadata.branchId || null;
            const applyAssignmentRules = metadata.applyAssignmentRules || false;

            for await (const row of processStream) {
                try {
                    const leadData: any = {
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

                    const mapping = job.mapping as any || {};

                    // Map fields
                    for (const [csvHeader, crmField] of Object.entries(mapping)) {
                        if (!crmField) continue;
                        const value = row[csvHeader];
                        if (value === undefined || value === null || value === '') continue;

                        if (String(crmField) === 'fullName') {
                            // Split full name into first and last
                            const nameParts = String(value).trim().split(' ');
                            leadData.firstName = nameParts[0] || '';
                            leadData.lastName = nameParts.slice(1).join(' ') || nameParts[0] || '';
                        } else if (String(crmField) === 'tags') {
                            // Handle comma-separated tags
                            leadData.tags = String(value).split(',').map(t => t.trim()).filter(Boolean);
                        } else if (String(crmField) === 'notes') {
                            // Store notes in customFields
                            if (!leadData.customFields) leadData.customFields = {};
                            leadData.customFields.importNotes = value;
                        } else if (String(crmField).startsWith('address.')) {
                            const addressField = String(crmField).split('.')[1];
                            leadData.address[addressField] = value;
                        } else if (['firstName', 'lastName', 'email', 'phone', 'company', 'jobTitle', 'source', 'status', 'stage', 'assignedToId', 'ownerEmail'].includes(crmField as string)) {
                            (leadData as any)[crmField as string] = value;
                        } else {
                            // Custom Fields
                            if (!leadData.customFields) leadData.customFields = {};
                            leadData.customFields[crmField as string] = value;
                        }
                    }

                    // Basic Validation
                    if (!leadData.firstName || (!leadData.phone && !leadData.email)) {
                        throw new Error('Missing required fields (First Name and at least Phone or Email)');
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
                        const owner = await prisma.user.findFirst({
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
                    const { DuplicateLeadService } = await import('./duplicateLeadService');
                    const duplicateCheck = await DuplicateLeadService.checkDuplicate(
                        leadData.phone,
                        leadData.email,
                        job.organisationId,
                        branchId || undefined
                    );

                    if (duplicateCheck.isDuplicate && duplicateCheck.existingLead) {
                        // Handle as re-enquiry instead of creating duplicate
                        await DuplicateLeadService.handleReEnquiry(
                            duplicateCheck.existingLead,
                            {
                                firstName: leadData.firstName,
                                lastName: leadData.lastName,
                                email: leadData.email,
                                phone: leadData.phone,
                                company: leadData.company,
                                source: 'import',
                                sourceDetails: { importJobId: jobId }
                            },
                            job.organisationId
                        );

                        // Count as success (re-enquiry handled)
                        successCount++;
                        continue;
                    }

                    // Determine initial assignedToId based on whether we're applying rules
                    let initialAssignedToId = leadData.assignedToId; // From mapping (ownerEmail)
                    
                    if (!initialAssignedToId && !applyAssignmentRules) {
                        // If no explicit owner and NOT applying rules, assign to uploader
                        initialAssignedToId = job.createdById;
                    }
                    // If applyAssignmentRules is true and no explicit owner, leave it undefined
                    // The DistributionService will assign it after creation

                    leadData.assignedToId = initialAssignedToId;

                    const createdLead = await prisma.lead.create({ data: leadData });

                    // Apply Assignment Rules if enabled (this will update the lead's assignedToId)
                    if (applyAssignmentRules && !leadData.assignedToId) {
                        // Only apply rules if no explicit owner was set via mapping
                        await DistributionService.assignLead(createdLead, job.organisationId);
                    }

                    successCount++;

                } catch (err: any) {
                    failureCount++;
                    errors.push({ row, error: err.message });
                }

                // Update progress every 10 rows
                if ((successCount + failureCount) % 10 === 0) {
                    await prisma.importJob.update({
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
            await prisma.importJob.update({
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
            const { logAudit } = await import('../utils/auditLogger');
            await logAudit({
                organisationId: job.organisationId,
                actorId: job.createdById,
                action: 'BULK_IMPORT_COMPLETED',
                entity: 'Lead',
                details: { jobId, successCount, failureCount }
            });

            // Cleanup file
            if (fs.existsSync(job.fileUrl)) {
                fs.unlinkSync(job.fileUrl);
            }

        } catch (error: any) {
            console.error(`Job ${jobId} failed:`, error);
            await prisma.importJob.update({
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
