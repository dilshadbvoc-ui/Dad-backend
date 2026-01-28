
import { Request, Response } from 'express';
import prisma from '../config/prisma';
import { getOrgId } from '../utils/hierarchyUtils';

export const getPipelines = async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const orgId = getOrgId(user);
        if (!orgId) return res.status(400).json({ message: 'No org' });

        const pipelines = await prisma.pipeline.findMany({
            where: { organisationId: orgId, isDeleted: false },
            orderBy: { createdAt: 'desc' }
        });
        res.json(pipelines);
    } catch (error) {
        res.status(500).json({ message: (error as Error).message });
    }
};

export const createPipeline = async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const orgId = getOrgId(user);
        if (!orgId) return res.status(400).json({ message: 'No org' });

        const pipeline = await prisma.pipeline.create({
            data: {
                ...req.body,
                organisationId: orgId,
                createdById: user.id
            }
        });
        res.status(201).json(pipeline);
    } catch (error) {
        res.status(400).json({ message: (error as Error).message });
    }
};

export const updatePipeline = async (req: Request, res: Response) => {
    try {
        const pipeline = await prisma.pipeline.update({
            where: { id: req.params.id },
            data: req.body
        });
        res.json(pipeline);
    } catch (error) {
        res.status(500).json({ message: (error as Error).message });
    }
};

export const deletePipeline = async (req: Request, res: Response) => {
    try {
        await prisma.pipeline.update({
            where: { id: req.params.id },
            data: { isDeleted: true }
        });
        res.json({ message: 'Pipeline deleted' });
    } catch (error) {
        res.status(500).json({ message: (error as Error).message });
    }
};
