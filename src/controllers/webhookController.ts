import { Request, Response } from 'express';
import prisma from '../config/prisma';
import { getOrgId } from '../utils/hierarchyUtils';

export const getWebhooks = async (req: Request, res: Response) => {
    try {
        const orgId = getOrgId((req as any).user);
        const where: any = { isDeleted: false };
        if (orgId) where.organisationId = orgId;

        const webhooks = await prisma.webhook.findMany({
            where,
            orderBy: { createdAt: 'desc' }
        });
        res.json({ webhooks });
    } catch (error) {
        res.status(500).json({ message: (error as Error).message });
    }
};

export const createWebhook = async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const orgId = getOrgId(user);
        if (!orgId) return res.status(400).json({ message: 'No organisation' });

        const webhook = await prisma.webhook.create({
            data: {
                name: req.body.name,
                url: req.body.url,
                events: req.body.events || [],
                secret: req.body.secret,
                headers: req.body.headers,
                isActive: true,
                organisation: { connect: { id: orgId } },
                createdBy: { connect: { id: user.id } }
            }
        });
        res.status(201).json(webhook);
    } catch (error) {
        res.status(400).json({ message: (error as Error).message });
    }
};

export const updateWebhook = async (req: Request, res: Response) => {
    try {
        const webhook = await prisma.webhook.update({
            where: { id: req.params.id },
            data: req.body
        });
        res.json(webhook);
    } catch (error) {
        res.status(500).json({ message: (error as Error).message });
    }
};

export const deleteWebhook = async (req: Request, res: Response) => {
    try {
        await prisma.webhook.update({
            where: { id: req.params.id },
            data: { isDeleted: true }
        });
        res.json({ message: 'Webhook deleted' });
    } catch (error) {
        res.status(500).json({ message: (error as Error).message });
    }
};
