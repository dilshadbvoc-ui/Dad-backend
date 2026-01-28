
import { Request, Response } from 'express';
import prisma from '../config/prisma'; // Assumes you have a prisma instance
import { getOrgId } from '../utils/hierarchyUtils';
import { DistributionService } from '../services/DistributionService';
import csv from 'csv-parser';
import fs from 'fs';


export const importLeads = async (req: Request, res: Response) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: 'No file uploaded' });
        }

        const mapping = JSON.parse(req.body.mapping || '{}');
        const user = (req as any).user;
        const orgId = getOrgId(user);

        if (!orgId) return res.status(400).json({ message: 'User has no organisation' });

        // Create Import Job
        const { ImportJobService } = await import('../services/ImportJobService');
        const job = await ImportJobService.createJob(user.id, orgId, req.file.path, mapping);

        // Start Processing in Background (Verify usage with user if necessary, but this is the requirement)
        ImportJobService.processJob(job.id).catch(console.error);

        res.status(202).json({
            message: 'Import started successfully',
            jobId: job.id
        });

    } catch (error: any) {
        console.error('Import error:', error);
        res.status(500).json({ message: 'Import init failed: ' + error.message });
    }
};

export const getImportJobStatus = async (req: Request, res: Response) => {
    try {
        const job = await prisma.importJob.findUnique({
            where: { id: req.params.id }
        });

        if (!job) return res.status(404).json({ message: 'Job not found' });

        // Security check: ensure same organisation
        const user = (req as any).user;
        const orgId = getOrgId(user);
        if (job.organisationId !== orgId && user.role !== 'super_admin') {
            return res.status(403).json({ message: 'Access denied' });
        }

        res.json(job);
    } catch (error: any) {
        res.status(500).json({ message: (error as Error).message });
    }
};
