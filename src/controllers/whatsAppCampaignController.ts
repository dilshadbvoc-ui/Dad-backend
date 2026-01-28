
import { Request, Response } from 'express';
import prisma from '../config/prisma';
import { getOrgId } from '../utils/hierarchyUtils';

export const getWhatsAppCampaigns = async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const orgId = getOrgId(user);
        if (!orgId) return res.status(400).json({ message: 'No org' });

        const campaigns = await prisma.whatsAppCampaign.findMany({
            where: { organisationId: orgId, isDeleted: false },
            orderBy: { createdAt: 'desc' }
        });
        res.json(campaigns);
    } catch (error) {
        res.status(500).json({ message: (error as Error).message });
    }
};

import { WhatsAppService } from '../services/WhatsAppService';

export const createWhatsAppCampaign = async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const orgId = getOrgId(user);
        if (!orgId) return res.status(400).json({ message: 'No org' });

        const campaign = await prisma.whatsAppCampaign.create({
            data: {
                ...req.body,
                organisationId: orgId,
                createdById: user.id
            }
        });

        // Trigger Send if status is 'sent' (immediate send)
        if (req.body.status === 'sent') {
            const whatsAppService = await WhatsAppService.getClientForOrg(orgId);
            if (!whatsAppService) {
                return res.status(400).json({ message: 'WhatsApp integration not configured', campaign });
            }

            // Demo: Send to a single test number if provided in body, or just log
            // Real implementation would assume 'message' is a template name or text 
            // and iterate over a list of contacts.
            // For MVP, we'll assume we are sending to a specific number passed in 'testNumber' 
            // or if it's a real campaign, we'd process the list.

            const targetNumber = req.body.testNumber;
            if (targetNumber) {
                await whatsAppService.sendTextMessage(targetNumber, campaign.message);
            }

            // Mark as sent
            await prisma.whatsAppCampaign.update({
                where: { id: campaign.id },
                data: { sentAt: new Date() }
            });
        }

        res.status(201).json(campaign);
    } catch (error) {
        console.error('WhatsApp Campaign Error:', error);
        res.status(400).json({ message: (error as Error).message });
    }
};

export const updateWhatsAppCampaign = async (req: Request, res: Response) => {
    try {
        const campaign = await prisma.whatsAppCampaign.update({
            where: { id: req.params.id },
            data: req.body
        });
        res.json(campaign);
    } catch (error) {
        res.status(500).json({ message: (error as Error).message });
    }
};

export const deleteWhatsAppCampaign = async (req: Request, res: Response) => {
    try {
        await prisma.whatsAppCampaign.update({
            where: { id: req.params.id },
            data: { isDeleted: true }
        });
        res.json({ message: 'WhatsApp Campaign deleted' });
    } catch (error) {
        res.status(500).json({ message: (error as Error).message });
    }
};
