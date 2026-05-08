import { Request, Response } from 'express';
import MarketingAPIService from '../services/marketingAPIService';
import prisma from '../config/prisma';
import { getOrgId } from '../utils/hierarchyUtils';
import { decrypt } from '../utils/encryption';

interface AuthRequest extends Request {
    user?: any;
}

// Helper to get decrypted Meta access token from the organisation's integrations
const getMetaAccessToken = async (user: any): Promise<string | null> => {
    try {
        const orgId = getOrgId(user);
        if (!orgId) return null;

        const org = await prisma.organisation.findUnique({
            where: { id: orgId },
            select: { integrations: true }
        });

        const integrations = (org?.integrations as any) || {};
        const metaIntegration = integrations.meta;

        if (!metaIntegration?.connected || !metaIntegration?.accessToken) {
            return null;
        }

        // Decrypt the stored token
        const decrypted = decrypt(metaIntegration.accessToken);
        
        // If decryption failed, decrypt returns the original string.
        // We can detect this by checking if the returned string still looks like an encrypted one (contains colons)
        if (decrypted === metaIntegration.accessToken && decrypted.includes(':')) {
            console.error('[Marketing] Meta token decryption failed for org:', orgId);
            return null;
        }
        
        return decrypted;
    } catch (error) {
        console.error('[Marketing] Error getting Meta token:', error);
        return null;
    }
};

export const getAdAccounts = async (req: AuthRequest, res: Response) => {
    console.log('[MarketingController] getAdAccounts called');
    try {
        const accessToken = await getMetaAccessToken(req.user);

        if (!accessToken) {
            return res.status(200).json({
                success: false,
                code: 'META_NOT_CONNECTED',
                message: 'Meta account not connected. Please connect in Settings → Integrations.'
            });
        }

        const marketingService = new MarketingAPIService(accessToken);
        const accounts = await marketingService.getAdAccounts();

        res.status(200).json({
            success: true,
            count: accounts.length,
            data: accounts
        });
    } catch (error: any) {
        console.error('[MarketingController] Get Ad Accounts Error:', error.message);
        if (error.response) {
            console.error('[MarketingController] Meta API Error Data:', JSON.stringify(error.response.data));
        }
        res.status(500).json({ 
            success: false,
            message: error.message,
            details: error.response?.data || null
        });
    }
};

export const getCampaigns = async (req: AuthRequest, res: Response) => {
    try {
        const { adAccountId } = req.params;
        const accessToken = await getMetaAccessToken(req.user);

        if (!accessToken) {
            return res.status(200).json({
                success: false,
                code: 'META_NOT_CONNECTED',
                message: 'Meta account not connected. Please connect in Settings → Integrations.'
            });
        }

        const marketingService = new MarketingAPIService(accessToken);
        const campaigns = await marketingService.getCampaigns(adAccountId);

        res.status(200).json({
            success: true,
            count: campaigns.length,
            data: campaigns
        });
    } catch (error: any) {
        console.error('Get Campaigns Error:', error);
        res.status(500).json({ message: error.message });
    }
};

export const createCampaign = async (req: AuthRequest, res: Response) => {
    try {
        const { adAccountId } = req.params;
        const { name, objective, status, special_ad_categories } = req.body;

        const accessToken = await getMetaAccessToken(req.user);

        if (!accessToken) {
            return res.status(200).json({
                success: false,
                code: 'META_NOT_CONNECTED',
                message: 'Meta account not connected. Please connect in Settings → Integrations.'
            });
        }

        const marketingService = new MarketingAPIService(accessToken);
        const campaign = await marketingService.createCampaign(adAccountId, {
            name,
            objective,
            status: status || 'PAUSED',
            special_ad_categories: special_ad_categories || []
        });

        res.status(201).json({
            success: true,
            data: campaign
        });
    } catch (error: any) {
        console.error('Create Campaign Error:', error);
        res.status(500).json({ message: error.message });
    }
};

