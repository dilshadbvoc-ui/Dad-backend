import prisma from '../config/prisma';
import fs from 'fs';
import csv from 'csv-parser';
import { DistributionService } from './DistributionService';

export class ImportJobService {
    static async createJob(userId: string, orgId: string, filePath: string, mapping: any) {
        return await prisma.importJob.create({
            data: {
                createdById: userId,
                organisationId: orgId,
                fileUrl: filePath, // Storing local path for now
                mapping: mapping,
                status: 'pending'
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

            const results: any[] = [];
            const errors: any[] = [];
            let successCount = 0;
            let failureCount = 0;

            // 1. Count total lines (approximation)
            let totalLines = 0;
            const countStream = fs.createReadStream(job.fileUrl).pipe(csv());
            for await (const _ of countStream) {
                totalLines++;
            }

            await prisma.importJob.update({
                where: { id: jobId },
                data: { total: totalLines }
            });

            // 2. Process File
            const processStream = fs.createReadStream(job.fileUrl).pipe(csv());

            for await (const row of processStream) {
                try {
                    const leadData: any = {
                        organisationId: job.organisationId,
                        assignedToId: job.createdById, // Default to uploader
                        source: 'import',
                        status: 'new',
                        address: {}
                    };

                    const mapping = job.mapping as any || {};

                    // Map fields
                    for (const [csvHeader, crmField] of Object.entries(mapping)) {
                        if (!crmField) continue;
                        const value = row[csvHeader];

                        if (crmField === 'address.street') leadData.address.street = value;
                        else if (crmField === 'address.city') leadData.address.city = value;
                        else if (crmField === 'address.state') leadData.address.state = value;
                        else if (crmField === 'address.country') leadData.address.country = value;
                        else if (crmField === 'address.zipCode') leadData.address.zipCode = value;
                        else {
                            (leadData as any)[crmField as string] = value;
                        }
                    }

                    // Basic Validation
                    if (!leadData.firstName || !leadData.lastName || !leadData.phone) {
                        throw new Error('Missing required fields (Name/Phone)');
                    }

                    // Check duplicate phone
                    const existing = await prisma.lead.findFirst({
                        where: {
                            phone: String(leadData.phone),
                            organisationId: job.organisationId
                        }
                    });

                    if (existing) {
                        throw new Error('Duplicate phone number');
                    }

                    const createdLead = await prisma.lead.create({ data: leadData });

                    // Assign Lead via Rules
                    await DistributionService.assignLead(createdLead, job.organisationId);

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
