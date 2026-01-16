
import { Request, Response } from 'express';
import prisma from '../config/prisma'; // Assumes you have a prisma instance
import { getOrgId } from '../utils/hierarchyUtils';
import csv from 'csv-parser';
import fs from 'fs';

export const importLeads = async (req: Request, res: Response) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: 'No file uploaded' });
        }

        const mapping = JSON.parse(req.body.mapping || '{}');
        const user = (req as any).user;
        const orgId = getOrgId(user); // Fixed: Pass user object, not ID
        if (!orgId) return res.status(400).json({ message: 'User has no organisation' });

        const userId = user.id;

        const results: any[] = [];
        const errors: any[] = [];
        let successCount = 0;

        fs.createReadStream(req.file.path)
            .pipe(csv())
            .on('data', (data) => results.push(data))
            .on('end', async () => {
                // Process results
                for (const row of results) {
                    try {
                        const leadData: any = {
                            organisationId: orgId,
                            assignedToId: userId, // Default to uploader for now
                            source: 'import',
                            status: 'new',
                            address: {}
                        };

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
                            errors.push({ row, error: 'Missing required fields (Name/Phone)' });
                            continue;
                        }

                        // Check duplicate phone
                        const existing = await prisma.lead.findFirst({
                            where: {
                                phone: String(leadData.phone), // Cast to string
                                organisationId: orgId
                            }
                        });

                        if (existing) {
                            errors.push({ row, error: 'Duplicate phone number' });
                            continue;
                        }

                        await prisma.lead.create({ data: leadData });
                        successCount++;

                    } catch (err: any) {
                        errors.push({ row, error: err.message });
                    }
                }

                // Cleanup file
                fs.unlinkSync(req.file!.path);

                res.json({
                    message: 'Import completed',
                    total: results.length,
                    success: successCount,
                    failed: errors.length,
                    errors: errors.length > 0 ? errors : undefined
                });
            });

    } catch (error: any) {
        console.error('Import error:', error);
        res.status(500).json({ message: 'Import failed: ' + error.message });
    }
};
