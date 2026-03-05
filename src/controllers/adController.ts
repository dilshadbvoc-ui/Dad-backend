import { Request, Response } from 'express';
import { metaService } from '../services/metaService';
import { MetaIntegrationService } from '../services/metaIntegrationService';
import prisma from '../config/prisma';
import { getOrgId } from '../utils/hierarchyUtils';

// Type extension for Request to include user (handled by authMiddleware usually, but explicit here for safety)
interface AuthRequest extends Request {
    user?: {
        id: string;
        organisationId: string;
    };
}

import { decrypt } from '../utils/encryption';

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

    if (!metaConfig?.accessToken) {
        throw new Error('Meta integration not configured. Please connect your Facebook account in Settings → Integrations.');
    }

    // Decrypt the token before using it
    return {
        ...metaConfig,
        accessToken: decrypt(metaConfig.accessToken)
    };
};

export const getCampaigns = async (req: AuthRequest, res: Response) => {
    try {
        const config = await getMetaConfig(req);
        const campaigns = await metaService.getCampaigns(config);
        res.json(campaigns);
    } catch (error: any) {
        console.error('Error in getCampaigns:', error);
        // Return empty array instead of 500 error
        res.status(200).json({
            message: error.message || 'Unable to fetch campaigns',
            campaigns: [],
            error: true
        });
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
        res.status(200).json({
            message: error.message || 'Unable to fetch ad sets',
            adSets: [],
            error: true
        });
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
        res.status(200).json({
            message: error.message || 'Unable to fetch ads',
            ads: [],
            error: true
        });
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
        res.status(200).json({
            message: error.message || 'Unable to fetch insights',
            insights: [],
            error: true
        });
    }
};

export const testConnection = async (req: AuthRequest, res: Response) => {
    try {
        const config = await getMetaConfig(req);
        const result = await metaService.testConnection(config);
        res.json(result);
    } catch (error: any) {
        console.error('Error in testConnection:', error);
        res.status(200).json({
            success: false,
            message: error.message || 'Unable to test connection',
            error: true
        });
    }
};

export const syncCampaigns = async (req: AuthRequest, res: Response) => {
    try {
        const user = (req as any).user;
        const orgId = getOrgId(user);
        if (!orgId) return res.status(400).json({ message: 'No organisation found' });

        const campaigns = await MetaIntegrationService.syncCampaigns(orgId);
        res.json({
            message: `Successfully synced ${campaigns.length} campaigns`,
            campaigns
        });
    } catch (error: any) {
        console.error('Error in syncCampaigns:', error);
        res.status(200).json({
            message: error.message || 'Unable to sync campaigns',
            campaigns: [],
            error: true
        });
    }
};

export const getCampaignInsights = async (req: AuthRequest, res: Response) => {
    try {
        const config = await getMetaConfig(req);
        const insights = await metaService.getInsights(config, 'campaign');
        res.json(insights);
    } catch (error: any) {
        console.error('Error in getCampaignInsights:', error);
        res.status(200).json({
            message: error.message || 'Unable to fetch campaign insights',
            insights: [],
            error: true
        });
    }
};

export const getAccountInsights = async (req: AuthRequest, res: Response) => {
    try {
        const config = await getMetaConfig(req);
        const insights = await metaService.getInsights(config, 'account');
        res.json(insights);
    } catch (error: any) {
        console.error('Error in getAccountInsights:', error);
        res.status(200).json({
            message: error.message || 'Unable to fetch account insights',
            insights: [],
            error: true
        });
    }
};

export const createFullAd = async (req: AuthRequest, res: Response) => {
    try {
        const config = await getMetaConfig(req);
        const { campaign, adSet, creative, ad } = req.body;

        // 1. Create Campaign
        const campaignResult = await metaService.createCampaign(config, campaign);
        const campaignId = campaignResult.id;

        // 2. Create Ad Set
        const adSetResult = await metaService.createAdSet(config, {
            ...adSet,
            campaignId
        });
        const adSetId = adSetResult.id;

        // 3. Create Creative
        // First, check if we need to upload an image from a URL
        let imageHash = creative.imageHash;
        if (creative.imageUrl && !imageHash) {
            const uploadResult = await metaService.uploadImage(config, creative.imageUrl);
            imageHash = uploadResult.images[Object.keys(uploadResult.images)[0]].hash;
        }

        const creativeResult = await metaService.createAdCreative(config, {
            ...creative,
            imageHash
        });
        const creativeId = creativeResult.id;

        // 4. Create Ad
        const adResult = await metaService.createAd(config, {
            ...ad,
            adSetId,
            creativeId
        });

        res.status(201).json({
            success: true,
            campaignId,
            adSetId,
            creativeId,
            adId: adResult.id
        });
    } catch (error: any) {
        console.error('Error in createFullAd:', error);
        res.status(500).json({ message: error.message });
    }
};

export const uploadAdImage = async (req: AuthRequest, res: Response) => {
    try {
        const config = await getMetaConfig(req);
        const { imageUrl } = req.body;

        if (!imageUrl) {
            return res.status(400).json({ message: 'imageUrl is required' });
        }

        const result = await metaService.uploadImage(config, imageUrl);
        res.json(result);
    } catch (error: any) {
        console.error('Error in uploadAdImage:', error);
        res.status(500).json({ message: error.message });
    }
};
