import prisma from '../config/prisma';
import fs from 'fs';
import csv from 'csv-parser';
import { DistributionService } from './distributionService';
import { NotificationService } from './notificationService';

export class ImportJobService {
    static async createJob(userId: string, orgId: string, filePath: string, mapping: any, options?: {
        defaultStatus?: string;
        pipelineId?: string;
        defaultStage?: string;
        branchId?: string;
        applyAssignmentRules?: boolean;
        splitUserIds?: string[];
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
                    applyAssignmentRules: options.applyAssignmentRules || false,
                    splitUserIds: options.splitUserIds || []
                } : undefined
            }
        });
    }

    static async processJob(jobId: string) {
        let job: any = null;
        try {
            job = await prisma.importJob.findUnique({ where: { id: jobId } });

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
            const splitUserIds = metadata.splitUserIds || [];
            let splitIndex = 0;

            for await (const row of processStream) {
                try {
                    // Sanitize row data: trim keys, trim values, remove null bytes/BOM
                    const sanitizedRow: any = {};
                    for (const [key, value] of Object.entries(row)) {
                        const cleanKey = String(key).trim().replace(/^\uFEFF/, ''); // Remove BOM and trim
                        if (typeof value === 'string') {
                            sanitizedRow[cleanKey] = value.replace(/\u0000/g, '').trim();
                        } else {
                            sanitizedRow[cleanKey] = value;
                        }
                    }

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
                    for (const [mappingHeader, crmField] of Object.entries(mapping)) {
                        if (!crmField) continue;
                        
                        // Helper to normalize strings for comparison (lowercase + alphanumeric only)
                        const normalize = (s: string) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
                        const normalizedMappingHeader = normalize(mappingHeader);

                        // Find matching value in sanitizedRow
                        let value = sanitizedRow[mappingHeader];
                        
                        if (value === undefined || value === null) {
                            // Try normalized/fuzzy lookup
                            const actualKey = Object.keys(sanitizedRow).find(k => normalize(k) === normalizedMappingHeader);
                            if (actualKey) {
                                value = sanitizedRow[actualKey];
                            }
                        }

                        if (value === undefined || value === null || value === '') continue;

                        if (String(crmField) === 'fullName') {
                            // Split full name into first and last
                            const nameParts = String(value).trim().split(/\s+/);
                            leadData.firstName = nameParts[0] || '';
                            leadData.lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : '';
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
                        } else if (['firstName', 'lastName', 'email', 'phone', 'secondaryPhone', 'company', 'jobTitle', 'source', 'status', 'stage', 'assignedToId', 'ownerEmail', 'leadScore', 'potentialValue'].includes(crmField as string)) {
                            // Ensure numeric fields are cast correctly
                            if (['leadScore', 'potentialValue'].includes(crmField as string)) {
                                (leadData as any)[crmField as string] = Number(value) || 0;
                            } else {
                                (leadData as any)[crmField as string] = value;
                            }
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
                    }

                    // Handle Owner Lookup by Email
                    if (leadData.ownerEmail) {
                        const owner = await prisma.user.findFirst({
                            where: {
                                email: leadData.ownerEmail,
                                organisationId: job.organisationId,
                                isActive: true
                            },
                            select: { id: true, branchId: true }
                        });
                        if (owner) {
                            leadData.assignedToId = owner.id;
                            // Also sync lead's branch with owner if lead has no branch
                            if (!leadData.branchId && owner.branchId) {
                                leadData.branchId = owner.branchId;
                            }
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

                    // Determine initial assignedToId based on whether we're applying rules or splitting
                    let initialAssignedToId = leadData.assignedToId; // From mapping (ownerEmail)

                    if (splitUserIds.length > 0) {
                        // Priority 1: Manual split between selected users
                        initialAssignedToId = splitUserIds[splitIndex % splitUserIds.length];
                        splitIndex++;
                        console.log(`[ImportJob ${jobId}] Splitting lead, assigned to: ${initialAssignedToId}`);
                    } else if (applyAssignmentRules) {
                        // Priority 2: Assignment Rules (handled after creation)
                        initialAssignedToId = undefined;
                    } else if (!initialAssignedToId) {
                        // Priority 3: Fallback to uploader
                        initialAssignedToId = job.createdById;
                    }
                    // If applyAssignmentRules is true and no explicit owner, leave it undefined
                    // The DistributionService will assign it after creation

                    leadData.assignedToId = initialAssignedToId;
                    console.log(`[ImportJob ${jobId}] Creating lead with assignedToId: ${leadData.assignedToId}`);

                    const createdLead = await prisma.lead.create({ data: leadData });
                    console.log(`[ImportJob ${jobId}] Lead created with ID: ${createdLead.id}, assignedToId: ${createdLead.assignedToId}`);

                    // Apply Assignment Rules if enabled (this will update the lead's assignedToId)
                    if (applyAssignmentRules && !leadData.assignedToId) {
                        // Only apply rules if no explicit owner was set via mapping
                        console.log(`[ImportJob ${jobId}] Applying assignment rules for lead ${createdLead.id}`);
                        await DistributionService.assignLead(createdLead, job.organisationId, undefined, job.createdById);
                        console.log(`[ImportJob ${jobId}] Assignment rules applied for lead ${createdLead.id}`);
                    } else if (applyAssignmentRules && leadData.assignedToId) {
                        console.log(`[ImportJob ${jobId}] Skipping assignment rules - explicit owner set: ${leadData.assignedToId}`);
                    } else {
                        console.log(`[ImportJob ${jobId}] Skipping assignment rules - applyAssignmentRules is false`);
                    }

                    successCount++;

                } catch (err: any) {
                    failureCount++;
                    // Sanitize error data to remove null bytes that PostgreSQL can't handle
                    const sanitizedRowForError: any = {};
                    for (const [key, value] of Object.entries(row)) {
                        if (typeof value === 'string') {
                            sanitizedRowForError[key] = value.replace(/\u0000/g, '');
                        } else {
                            sanitizedRowForError[key] = value;
                        }
                    }
                    const sanitizedError = String(err.message || 'Unknown error').replace(/\u0000/g, '');
                    errors.push({ row: sanitizedRowForError, error: sanitizedError });
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

            // Final Update - sanitize errors one more time to be safe
            const sanitizedErrors = errors.map(err => ({
                row: typeof err.row === 'object' ? JSON.parse(JSON.stringify(err.row).replace(/\u0000/g, '')) : err.row,
                error: typeof err.error === 'string' ? err.error.replace(/\u0000/g, '') : String(err.error).replace(/\u0000/g, '')
            }));

            await prisma.importJob.update({
                where: { id: jobId },
                data: {
                    status: 'completed',
                    completedAt: new Date(),
                    progress: totalLines,
                    successCount,
                    failureCount,
                    errors: sanitizedErrors.length > 0 ? sanitizedErrors : undefined
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
            
            // Send Notification to User
            const notificationTitle = failureCount > 0 ? 'Lead Import Completed with Errors' : 'Lead Import Successful';
            let notificationMessage = `Import finished: ${successCount} leads created.`;
            
            if (failureCount > 0) {
                notificationMessage += ` ${failureCount} rows failed.`;
                
                // Add unique error reasons (top 3)
                const uniqueErrors = Array.from(new Set(sanitizedErrors.map(e => e.error))).slice(0, 3);
                if (uniqueErrors.length > 0) {
                    notificationMessage += ` Reasons: ${uniqueErrors.join(', ')}`;
                }
            }
            
            await NotificationService.send(
                job.createdById,
                notificationTitle,
                notificationMessage,
                failureCount > 0 ? 'warning' : 'success'
            );

        } catch (error: any) {
            console.error(`Job ${jobId} failed:`, error);
            // Sanitize error message
            const sanitizedErrorMessage = String(error.message || 'Unknown error').replace(/\u0000/g, '');
            await prisma.importJob.update({
                where: { id: jobId },
                data: {
                    status: 'failed',
                    completedAt: new Date(),
                    errors: [{ error: sanitizedErrorMessage }]
                }
            });

            // Send Failure Notification
            if (job) {
                await NotificationService.send(
                    job.createdById,
                    'Lead Import Failed',
                    `The import job encountered a critical error: ${sanitizedErrorMessage}`,
                    'error'
                );
            }
        }
    }
}
