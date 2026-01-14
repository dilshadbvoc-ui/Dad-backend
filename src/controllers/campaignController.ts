import { Request, Response } from 'express';
import prisma from '../config/prisma';
import { getOrgId } from '../utils/hierarchyUtils';

export const getCampaigns = async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const orgId = getOrgId(user);

        if (!orgId) return res.status(403).json({ message: 'User not associated with an organisation' });

        const where: any = { organisationId: orgId, isDeleted: false };
        if (user.role === 'super_admin' && req.query.organisationId) {
            where.organisationId = String(req.query.organisationId);
        }

        const campaigns = await prisma.campaign.findMany({
            where,
            include: {
                emailList: { select: { name: true } }
            },
            orderBy: { createdAt: 'desc' }
        });

        res.json({ campaigns });
    } catch (error) {
        res.status(500).json({ message: (error as Error).message });
    }
};

export const createCampaign = async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const orgId = getOrgId(user);
        if (!orgId) return res.status(400).json({ message: 'No org' });

        const data: any = {
            name: req.body.name,
            subject: req.body.subject,
            content: req.body.content,
            status: req.body.status || 'draft',
            scheduledAt: req.body.scheduledAt ? new Date(req.body.scheduledAt) : null,
            organisation: { connect: { id: orgId } },
            createdBy: { connect: { id: user.id } }
        };

        if (req.body.emailList) {
            data.emailList = { connect: { id: req.body.emailList } };
        }

        const campaign = await prisma.campaign.create({
            data
        });

        res.status(201).json(campaign);
    } catch (error) {
        res.status(400).json({ message: (error as Error).message });
    }
};

export const getCampaignById = async (req: Request, res: Response) => {
    try {
        const campaign = await prisma.campaign.findFirst({
            where: { id: req.params.id, isDeleted: false },
            include: { emailList: true }
        });
        if (!campaign) return res.status(404).json({ message: 'Campaign not found' });
        res.json(campaign);
    } catch (error) {
        res.status(500).json({ message: (error as Error).message });
    }
};
