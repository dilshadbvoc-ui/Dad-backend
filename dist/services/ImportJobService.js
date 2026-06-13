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
const notificationService_1 = require("./notificationService");
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
                    applyAssignmentRules: options.applyAssignmentRules || false,
                    splitUserIds: options.splitUserIds || [],
                    duplicateAction: options.duplicateAction || 'flag_as_reenquiry'
                } : undefined
            }
        });
    }
    static async processJob(jobId) {
        let job = null;
        try {
            job = await prisma_1.default.importJob.findUnique({ where: { id: jobId } });
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
            let processStream;
            const isExcel = job.fileUrl.endsWith('.xlsx') || job.fileUrl.endsWith('.xls');
            if (isExcel) {
                const ExcelJS = await Promise.resolve().then(() => __importStar(require('exceljs')));
                const workbook = new ExcelJS.Workbook();
                await workbook.xlsx.readFile(job.fileUrl);
                const worksheet = workbook.getWorksheet(1);
                const rows = [];
                if (worksheet) {
                    const headers = [];
                    worksheet.getRow(1).eachCell((cell, colNumber) => {
                        headers[colNumber] = cell.value?.toString() || '';
                    });
                    worksheet.eachRow((row, rowNumber) => {
                        if (rowNumber === 1)
                            return; // Skip headers
                        const rowData = {};
                        row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
                            const header = headers[colNumber];
                            if (header) {
                                // Prefer raw value to avoid scientific notation in .text
                                // But handle formula results
                                const val = cell.value;
                                if (val && typeof val === 'object' && 'result' in val) {
                                    rowData[header] = val.result;
                                }
                                else {
                                    rowData[header] = val;
                                }
                            }
                        });
                        rows.push(rowData);
                    });
                }
                processStream = rows;
            }
            else {
                processStream = fs_1.default.createReadStream(job.fileUrl).pipe((0, csv_parser_1.default)());
            }
            // Get import options from metadata
            const metadata = job.metadata || {};
            const defaultStatus = metadata.defaultStatus || 'new';
            const pipelineId = metadata.pipelineId || null;
            const defaultStage = metadata.defaultStage || null;
            const branchId = metadata.branchId || null;
            const applyAssignmentRules = metadata.applyAssignmentRules || false;
            const splitUserIds = metadata.splitUserIds || [];
            // 'flag_as_reenquiry' = existing behavior (log re-enquiry activity)
            // 'skip' = silently skip duplicates without creating re-enquiry
            const duplicateAction = metadata.duplicateAction || 'flag_as_reenquiry';
            let skipCount = 0;
            let splitIndex = 0;
            for await (const row of processStream) {
                try {
                    // Sanitize row data: trim keys, trim values, remove null bytes/BOM
                    const sanitizedRow = {};
                    for (const [key, value] of Object.entries(row)) {
                        const cleanKey = String(key).trim().replace(/^\uFEFF/, ''); // Remove BOM and trim
                        if (typeof value === 'string') {
                            sanitizedRow[cleanKey] = value.replace(/\u0000/g, '').trim();
                        }
                        else {
                            sanitizedRow[cleanKey] = value;
                        }
                    }
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
                    // Map fields from CSV
                    const csvValues = {};
                    for (const [mappingHeader, crmField] of Object.entries(mapping)) {
                        if (!crmField)
                            continue;
                        const normalize = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
                        const normalizedMappingHeader = normalize(mappingHeader);
                        let value = sanitizedRow[mappingHeader];
                        if (value === undefined || value === null) {
                            const actualKey = Object.keys(sanitizedRow).find(k => normalize(k) === normalizedMappingHeader);
                            if (actualKey)
                                value = sanitizedRow[actualKey];
                        }
                        if (value === undefined || value === null || value === '')
                            continue;
                        csvValues[crmField] = value;
                    }
                    // Process mapped values into leadData
                    for (const [crmField, value] of Object.entries(csvValues)) {
                        if (crmField === 'fullName') {
                            const nameParts = String(value).trim().split(/\s+/);
                            leadData.firstName = nameParts[0] || '';
                            leadData.lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : '';
                        }
                        else if (crmField === 'tags') {
                            leadData.tags = String(value).split(',').map(t => t.trim()).filter(Boolean);
                        }
                        else if (crmField === 'notes') {
                            if (!leadData.customFields)
                                leadData.customFields = {};
                            leadData.customFields.importNotes = value;
                        }
                        else if (crmField.startsWith('address.')) {
                            const addressField = crmField.split('.')[1];
                            leadData.address[addressField] = value;
                        }
                        else if (['firstName', 'lastName', 'email', 'phone', 'secondaryPhone', 'company', 'jobTitle', 'source', 'assignedToId', 'ownerEmail', 'leadScore', 'potentialValue', 'country', 'countryCode', 'phoneCountryCode', 'enquiryAbout'].includes(crmField)) {
                            if (['leadScore', 'potentialValue'].includes(crmField)) {
                                leadData[crmField] = Number(value) || 0;
                            }
                            else {
                                leadData[crmField] = value;
                            }
                        }
                        else if (crmField !== 'status' && crmField !== 'stage') {
                            if (!leadData.customFields)
                                leadData.customFields = {};
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
                    }
                    else if (rawStatus && rawStatus !== 'new') {
                        leadData.status = rawStatus;
                        leadData.stage = rawStage || rawStatus;
                    }
                    else {
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
                            // Ensure full precision for numbers (phone numbers can be large)
                            rawPhone = leadData.phone.toLocaleString('fullwide', { useGrouping: false });
                        }
                        else {
                            rawPhone = String(leadData.phone).trim();
                            // If the string itself is in scientific notation (common in CSV exports from Excel)
                            // We check for 'E' or 'e' followed by '+' or digits
                            if (/[eE][+-]?\d+/.test(rawPhone)) {
                                const num = Number(rawPhone);
                                if (!isNaN(num)) {
                                    rawPhone = num.toLocaleString('fullwide', { useGrouping: false });
                                }
                            }
                        }
                        // Keep + if present, but remove all other non-digits
                        leadData.phone = (rawPhone.startsWith('+') ? '+' : '') + rawPhone.replace(/\D/g, '');
                        // 5. Global Country Identification (Smart Auto-Identify)
                        if (!leadData.countryCode || !leadData.phoneCountryCode) {
                            try {
                                const { parsePhoneNumberFromString } = await Promise.resolve().then(() => __importStar(require('libphonenumber-js')));
                                // Try with + prefix if not present
                                const phoneToParse = leadData.phone.startsWith('+') ? leadData.phone : '+' + leadData.phone;
                                const phoneNumber = parsePhoneNumberFromString(phoneToParse);
                                if (phoneNumber && phoneNumber.isValid()) {
                                    if (!leadData.countryCode)
                                        leadData.countryCode = phoneNumber.country;
                                    if (!leadData.phoneCountryCode)
                                        leadData.phoneCountryCode = '+' + phoneNumber.countryCallingCode;
                                    // Identify full country name using Intl.DisplayNames
                                    if (!leadData.country && leadData.countryCode) {
                                        try {
                                            const regionNames = new Intl.DisplayNames(['en'], { type: 'region' });
                                            leadData.country = regionNames.of(leadData.countryCode);
                                        }
                                        catch (e) {
                                            // Fallback if Intl.DisplayNames is not supported
                                        }
                                    }
                                }
                            }
                            catch (e) {
                                console.error("Error auto-identifying country:", e);
                            }
                        }
                        // Fallback for India if libphonenumber failed but prefix is 91
                        if (!leadData.country && !leadData.countryCode) {
                            const digitsOnly = leadData.phone.replace(/\D/g, '');
                            if (digitsOnly.startsWith('91') && digitsOnly.length >= 10) {
                                leadData.country = 'India';
                                leadData.countryCode = 'IN';
                                if (!leadData.phoneCountryCode)
                                    leadData.phoneCountryCode = '+91';
                            }
                            else if (digitsOnly.startsWith('1') && digitsOnly.length === 11) {
                                leadData.country = 'United States';
                                leadData.countryCode = 'US';
                                if (!leadData.phoneCountryCode)
                                    leadData.phoneCountryCode = '+1';
                            }
                        }
                    }
                    // Handle Owner Lookup by Email
                    if (leadData.ownerEmail) {
                        const owner = await prisma_1.default.user.findFirst({
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
                    const { DuplicateLeadService } = await Promise.resolve().then(() => __importStar(require('./duplicateLeadService')));
                    const duplicateCheck = await DuplicateLeadService.checkDuplicate(leadData.phone, leadData.email, job.organisationId, branchId || undefined);
                    if (duplicateCheck.isDuplicate && duplicateCheck.existingLead) {
                        if (duplicateAction === 'skip') {
                            // Admin chose to skip duplicates — do not create re-enquiry
                            skipCount++;
                            continue;
                        }
                        // Default: Handle as re-enquiry instead of creating duplicate
                        await DuplicateLeadService.handleReEnquiry(duplicateCheck.existingLead, {
                            firstName: leadData.firstName,
                            lastName: leadData.lastName,
                            email: leadData.email,
                            phone: leadData.phone,
                            company: leadData.company,
                            stage: leadData.stage,
                            source: 'import',
                            sourceDetails: { importJobId: jobId }
                        }, job.organisationId);
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
                    }
                    else if (applyAssignmentRules) {
                        // Priority 2: Assignment Rules (handled after creation)
                        initialAssignedToId = undefined;
                    }
                    else if (!initialAssignedToId) {
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
                    const createdLead = await prisma_1.default.lead.create({ data: leadData });
                    console.log(`[ImportJob ${jobId}] Lead created with ID: ${createdLead.id}, assignedToId: ${createdLead.assignedToId}`);
                    // Apply Assignment Rules if enabled (this will update the lead's assignedToId)
                    if (applyAssignmentRules && !leadData.assignedToId) {
                        // Only apply rules if no explicit owner was set via mapping
                        console.log(`[ImportJob ${jobId}] Applying assignment rules for lead ${createdLead.id}`);
                        await distributionService_1.DistributionService.assignLead(createdLead, job.organisationId, undefined, job.createdById);
                        console.log(`[ImportJob ${jobId}] Assignment rules applied for lead ${createdLead.id}`);
                    }
                    else if (applyAssignmentRules && leadData.assignedToId) {
                        console.log(`[ImportJob ${jobId}] Skipping assignment rules - explicit owner set: ${leadData.assignedToId}`);
                    }
                    else {
                        console.log(`[ImportJob ${jobId}] Skipping assignment rules - applyAssignmentRules is false`);
                    }
                    successCount++;
                }
                catch (err) {
                    failureCount++;
                    // Sanitize error data to remove null bytes that PostgreSQL can't handle
                    const sanitizedRowForError = {};
                    for (const [key, value] of Object.entries(row)) {
                        if (typeof value === 'string') {
                            sanitizedRowForError[key] = value.replace(/\u0000/g, '');
                        }
                        else {
                            sanitizedRowForError[key] = value;
                        }
                    }
                    const sanitizedError = String(err.message || 'Unknown error').replace(/\u0000/g, '');
                    errors.push({ row: sanitizedRowForError, error: sanitizedError });
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
            // Final Update - sanitize errors one more time to be safe
            const sanitizedErrors = errors.map(err => ({
                row: typeof err.row === 'object' ? JSON.parse(JSON.stringify(err.row).replace(/\u0000/g, '')) : err.row,
                error: typeof err.error === 'string' ? err.error.replace(/\u0000/g, '') : String(err.error).replace(/\u0000/g, '')
            }));
            await prisma_1.default.importJob.update({
                where: { id: jobId },
                data: {
                    status: 'completed',
                    completedAt: new Date(),
                    progress: totalLines,
                    successCount,
                    failureCount,
                    errors: sanitizedErrors.length > 0 ? sanitizedErrors : undefined,
                    metadata: {
                        ...metadata,
                        skippedDuplicateCount: skipCount
                    }
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
            // Send Notification to User
            let notificationTitle = 'Lead Import Successful';
            const skipSuffix = skipCount > 0 ? ` ${skipCount} duplicate${skipCount > 1 ? 's' : ''} were skipped.` : '';
            let notificationMessage = `Import finished successfully. ${successCount} leads created.${skipSuffix}`;
            let notificationType = 'success';
            if (successCount === 0 && failureCount > 0) {
                notificationTitle = 'Lead Import Failed';
                notificationMessage = `The import was not successful. None of the ${failureCount} rows could be processed. \n\nPlease check your file headers and data mapping.`;
                notificationType = 'error';
            }
            else if (failureCount > 0) {
                notificationTitle = 'Lead Import Partial Success';
                notificationMessage = `The import was partially successful: ${successCount} leads were created, but ${failureCount} rows failed due to data errors.${skipSuffix}`;
                notificationType = 'warning';
            }
            if (failureCount > 0) {
                const uniqueErrors = Array.from(new Set(sanitizedErrors.map(e => e.error))).slice(0, 3);
                if (uniqueErrors.length > 0) {
                    notificationMessage += `\n\nMain reasons for failure:\n• ${uniqueErrors.join('\n• ')}`;
                    if (uniqueErrors.some(e => e.toLowerCase().includes('missing required fields'))) {
                        notificationMessage += `\n\nSuggestion: Ensure your file includes "First Name" and either "Phone" or "Email" columns and they are correctly matched in the mapping step.`;
                    }
                }
            }
            await notificationService_1.NotificationService.send(job.createdById, notificationTitle, notificationMessage, notificationType);
        }
        catch (error) {
            console.error(`Job ${jobId} failed:`, error);
            // Sanitize error message
            const sanitizedErrorMessage = String(error.message || 'Unknown error').replace(/\u0000/g, '');
            await prisma_1.default.importJob.update({
                where: { id: jobId },
                data: {
                    status: 'failed',
                    completedAt: new Date(),
                    errors: [{ error: sanitizedErrorMessage }]
                }
            });
            // Send Failure Notification
            if (job) {
                await notificationService_1.NotificationService.send(job.createdById, 'Lead Import Critical Failure', `The import process encountered a system error: ${sanitizedErrorMessage}. \n\nThis usually happens if the file is corrupted or not in a standard format. Please verify your file and try again.`, 'error');
            }
        }
    }
}
exports.ImportJobService = ImportJobService;
