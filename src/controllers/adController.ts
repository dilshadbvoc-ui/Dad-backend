import { Request, Response } from 'express';
import { metaService } from '../services/MetaService';
import prisma from '../config/prisma';

// Type extension for Request to include user (handled by authMiddleware usually, but explicit here for safety)
interface AuthRequest extends Request {
    user?: {
        id: string;
        organisationId: string;
    };
}

export const getMetaConfig = async (req: AuthRequest) => {
    if (!req.user?.organisationId) {
        throw new Error('User not authenticated or missing organisation');
    }

    const org = await prisma.organisation.findUnique({
        where: { id: req.user.organisationId }
    });

    if (!org) throw new Error('Organisation not found');

    const integrations = org.integrations as any;
    const metaConfig = integrations?.meta;

    if (!metaConfig?.accessToken || !metaConfig?.adAccountId) {
        throw new Error('Meta integration not configured. Please check settings.');
    }

    return metaConfig;
};

export const getCampaigns = async (req: AuthRequest, res: Response) => {
    try {
        const config = await getMetaConfig(req);
        const campaigns = await metaService.getCampaigns(config);
        res.json(campaigns);
    } catch (error: any) {
        console.error('Error in getCampaigns:', error);
        res.status(500).json({ message: error.message });
    }
};

export const getAdSets = async (req: AuthRequest, res: Response) => {
    try {
        const config = await getMetaConfig(req);
        const { campaignId } = req.query;
        const adSets = await metaService.getAdSets(config, campaignId as string);
        res.json(adSets);
    } catch (error: any) {
        console.error('Error in getAdSets:', error);
        res.status(500).json({ message: error.message });
    }
};

export const getAds = async (req: AuthRequest, res: Response) => {
    try {
        const config = await getMetaConfig(req);
        const { adSetId } = req.query;
        const ads = await metaService.getAds(config, adSetId as string);
        res.json(ads);
    } catch (error: any) {
        console.error('Error in getAds:', error);
        res.status(500).json({ message: error.message });
    }
};

export const getInsights = async (req: AuthRequest, res: Response) => {
    try {
        const config = await getMetaConfig(req);
        const { level } = req.query;
        const insights = await metaService.getInsights(config, level as any);
        res.json(insights);
    } catch (error: any) {
        console.error('Error in getInsights:', error);
        res.status(500).json({ message: error.message });
    }
};
