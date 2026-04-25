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
            let processStream: any;
            const isExcel = job.fileUrl.endsWith('.xlsx') || job.fileUrl.endsWith('.xls');

            if (isExcel) {
                const ExcelJS = await import('exceljs');
                const workbook = new ExcelJS.Workbook();
                await workbook.xlsx.readFile(job.fileUrl);
                const worksheet = workbook.getWorksheet(1);
                const rows: any[] = [];
                
                if (worksheet) {
                    const headers: string[] = [];
                    worksheet.getRow(1).eachCell((cell, colNumber) => {
                        headers[colNumber] = cell.value?.toString() || '';
                    });

                    worksheet.eachRow((row, rowNumber) => {
                        if (rowNumber === 1) return; // Skip headers
                        const rowData: any = {};
                        row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
                            const header = headers[colNumber];
                            if (header) {
                                // Use .text to get the formatted string (preserves phone numbers)
                                // Fallback to .value if .text is empty
                                rowData[header] = cell.text || cell.value;
                            }
                        });
                        rows.push(rowData);
                    });
                }
                processStream = rows;
            } else {
                processStream = fs.createReadStream(job.fileUrl).pipe(csv());
            }

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

                    // Map fields from CSV
                    const csvValues: Record<string, any> = {};
                    for (const [mappingHeader, crmField] of Object.entries(mapping)) {
                        if (!crmField) continue;
                        
                        const normalize = (s: string) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
                        const normalizedMappingHeader = normalize(mappingHeader);

                        let value = sanitizedRow[mappingHeader];
                        if (value === undefined || value === null) {
                            const actualKey = Object.keys(sanitizedRow).find(k => normalize(k) === normalizedMappingHeader);
                            if (actualKey) value = sanitizedRow[actualKey];
                        }

                        if (value === undefined || value === null || value === '') continue;
                        csvValues[crmField as string] = value;
                    }

                    // Process mapped values into leadData
                    for (const [crmField, value] of Object.entries(csvValues)) {
                        if (crmField === 'fullName') {
                            const nameParts = String(value).trim().split(/\s+/);
                            leadData.firstName = nameParts[0] || '';
                            leadData.lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : '';
                        } else if (crmField === 'tags') {
                            leadData.tags = String(value).split(',').map(t => t.trim()).filter(Boolean);
                        } else if (crmField === 'notes') {
                            if (!leadData.customFields) leadData.customFields = {};
                            leadData.customFields.importNotes = value;
                        } else if (crmField.startsWith('address.')) {
                            const addressField = crmField.split('.')[1];
                            leadData.address[addressField] = value;
                        } else if (['firstName', 'lastName', 'email', 'phone', 'secondaryPhone', 'company', 'jobTitle', 'source', 'assignedToId', 'ownerEmail', 'leadScore', 'potentialValue', 'country', 'countryCode', 'phoneCountryCode', 'enquiryAbout'].includes(crmField)) {
                            if (['leadScore', 'potentialValue'].includes(crmField)) {
                                (leadData as any)[crmField] = Number(value) || 0;
                            } else {
                                (leadData as any)[crmField] = value;
                            }
                        } else if (crmField !== 'status' && crmField !== 'stage') {
                            if (!leadData.customFields) leadData.customFields = {};
                            leadData.customFields[crmField] = value;
                        }
                    }

                    // Robust Status and Stage Resolution
                    const rawStage = (csvValues.stage || csvValues.Status || csvValues.status || '').toString().trim().toLowerCase();
                    const rawStatus = (csvValues.status || csvValues.Status || '').toString().trim().toLowerCase();
                    
                    // If stage provided but no status, sync them
                    if (rawStage && (!rawStatus || rawStatus === 'new')) {
                        leadData.status = rawStage;
                        leadData.stage = rawStage;
                    } else if (rawStatus && rawStatus !== 'new') {
                        leadData.status = rawStatus;
                        leadData.stage = rawStage || rawStatus;
                    } else {
                        leadData.status = rawStatus || defaultStatus || 'new';
                        leadData.stage = rawStage || null;
                    }

                    // Basic Validation
                    if (!leadData.firstName || (!leadData.phone && !leadData.email)) {
                        throw new Error('Missing required fields (First Name and at least Phone or Email)');
                    }

                    // 4. Sanitize and Smart-Format Phone/Country
                    if (leadData.phone) {
                        // Fix for scientific notation (e.g. 9.19E+11 -> 919...)
                        let rawPhone = "";
                        if (typeof leadData.phone === 'number') {
                            rawPhone = leadData.phone.toFixed(0);
                        } else {
                            rawPhone = String(leadData.phone).trim();
                            // If the string itself is in scientific notation (rare but possible in CSV)
                            if (rawPhone.includes('E+') || rawPhone.includes('e+')) {
                                const num = Number(rawPhone);
                                if (!isNaN(num)) rawPhone = num.toFixed(0);
                            }
                        }

                        // Keep + if present, but remove all other non-digits
                        leadData.phone = (rawPhone.startsWith('+') ? '+' : '') + rawPhone.replace(/\D/g, '');

                        // Smart Country Detection (if not explicitly mapped)
                        if (!leadData.country && !leadData.countryCode) {
                            const digitsOnly = leadData.phone.replace(/\D/g, '');
                            if (digitsOnly.startsWith('91') && digitsOnly.length >= 10) {
                                leadData.country = 'India';
                                leadData.countryCode = 'IN';
                                if (!leadData.phoneCountryCode) leadData.phoneCountryCode = '+91';
                                
                                // Standardize: if it starts with 91 and is 12 digits, keep it as is.
                                // If it's 10 digits, we could prepend 91, but let's stick to what's provided.
                            } else if (digitsOnly.startsWith('1') && digitsOnly.length === 11) {
                                leadData.country = 'United States';
                                leadData.countryCode = 'US';
                                if (!leadData.phoneCountryCode) leadData.phoneCountryCode = '+1';
                            }
                        }
                    }

                    // Handle Owner Lookup by Email
                    if (leadData.ownerEmail) {
                        const owner = await prisma.user.findFirst({
                            where: {
                                email: {
                                    equals: String(leadData.ownerEmail).trim(),
                                    mode: 'insensitive'
                                },
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
                                stage: leadData.stage,
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
                    
                    // BRUTE FORCE OVERRIDE: Ensure status matches stage if stage exists
                    if (leadData.stage && (!leadData.status || leadData.status === 'new')) {
                        leadData.status = leadData.stage;
                    }
                    
                    console.log(`[ImportJob ${jobId}] Final LeadData for ${leadData.email || leadData.phone}:`, JSON.stringify({
                        status: leadData.status,
                        stage: leadData.stage,
                        assignedToId: leadData.assignedToId
                    }));

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
