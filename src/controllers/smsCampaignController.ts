
import { Request, Response } from 'express';
import prisma from '../config/prisma';
import { getOrgId } from '../utils/hierarchyUtils';

export const getSMSCampaigns = async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const orgId = getOrgId(user);
        if (!orgId) return res.status(400).json({ message: 'No org' });

        const campaigns = await prisma.sMSCampaign.findMany({
            where: { organisationId: orgId, isDeleted: false },
            orderBy: { createdAt: 'desc' }
        });
        res.json(campaigns);
    } catch (error) {
        res.status(500).json({ message: (error as Error).message });
    }
};

export const createSMSCampaign = async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const orgId = getOrgId(user);
        if (!orgId) return res.status(400).json({ message: 'No org' });

        const campaign = await prisma.sMSCampaign.create({
            data: {
                ...req.body,
                organisationId: orgId,
                createdById: user.id
            }
        });
        res.status(201).json(campaign);
    } catch (error) {
        res.status(400).json({ message: (error as Error).message });
    }
};

export const updateSMSCampaign = async (req: Request, res: Response) => {
    try {
        const campaign = await prisma.sMSCampaign.update({
            where: { id: req.params.id },
            data: req.body
        });
        res.json(campaign);
    } catch (error) {
        res.status(500).json({ message: (error as Error).message });
    }
};

export const deleteSMSCampaign = async (req: Request, res: Response) => {
    try {
        await prisma.sMSCampaign.update({
            where: { id: req.params.id },
            data: { isDeleted: true }
        });
        res.json({ message: 'SMS Campaign deleted' });
    } catch (error) {
        res.status(500).json({ message: (error as Error).message });
    }
};
