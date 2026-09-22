import { Request, Response } from 'express';
import MarketingAPIService from '../services/marketingAPIService';
import prisma from '../config/prisma';
import { getOrgId } from '../utils/hierarchyUtils';
import { decrypt } from '../utils/encryption';
import { resolveMetaTokenForAdAccount } from '../utils/metaAccountResolver';

interface AuthRequest extends Request {
    user?: any;
}

// Helper to get a decrypted Meta access token from the organisation's integrations.
// Pass a specific `account` (an entry from integrations.metaAccounts, or the legacy
// integrations.meta object) to get that Page's own token; omitted, it falls back to
// the legacy single `meta` slot for callers that only ever deal with one connection.
const getMetaAccessToken = async (user: any, account?: any): Promise<string | null> => {
    try {
        let metaIntegration = account;
        const orgId = getOrgId(user);

        if (!metaIntegration) {
            if (!orgId) return null;

            const org = await prisma.organisation.findUnique({
                where: { id: orgId },
                select: { integrations: true }
            });

            const integrations = (org?.integrations as any) || {};
            metaIntegration = integrations.meta;
        }

        if (!metaIntegration?.connected) {
            return null;
        }

        // Use userAccessToken for marketing API if available, fallback to accessToken
        const tokenToDecrypt = metaIntegration.userAccessToken || metaIntegration.accessToken;

        if (!tokenToDecrypt) {
            return null;
        }

        // Decrypt the stored token
        const decrypted = decrypt(tokenToDecrypt);
        
        // If decryption failed, decrypt returns the original string.
        // We can detect this by checking if the returned string still looks like an encrypted one (contains colons)
        if (decrypted === tokenToDecrypt && decrypted.includes(':')) {
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
    try {
        const orgId = getOrgId(req.user);
        const org = orgId ? await prisma.organisation.findUnique({
            where: { id: orgId },
            select: { integrations: true }
        }) : null;
        const integrations = (org?.integrations as any) || {};

        // An org can have several connected Pages, each with its own access token
        // (integrations.metaAccounts[]) — only reading the single legacy `meta` slot
        // meant whichever Page was connected/reconnected most recently silently hid
        // every other Page's ad account from this dropdown. Merge across all of them.
        const rawAccounts: any[] = [...(integrations.metaAccounts || [])];
        if (integrations.meta?.pageId && !rawAccounts.some((a: any) => a.pageId === integrations.meta.pageId)) {
            rawAccounts.push(integrations.meta);
        }
        const connectedAccounts = rawAccounts.filter((a: any) => a.connected && a.accessToken);

        if (connectedAccounts.length === 0) {
            return res.status(200).json({
                success: false,
                code: 'META_NOT_CONNECTED',
                message: 'Meta account not connected. Please connect in Settings → Integrations.'
            });
        }

        const merged: any[] = [];
        for (const account of connectedAccounts) {
            try {
                const accessToken = await getMetaAccessToken(req.user, account);
                if (!accessToken) continue;
                // Each Page's own token is already scoped to what that specific Facebook
                // login granted, so no businessIds filter is needed per-account here.
                const marketingService = new MarketingAPIService(accessToken);
                const accounts = await marketingService.getAdAccounts();
                for (const acc of accounts) {
                    if (!merged.some((m) => m.id === acc.id)) merged.push(acc);
                }
            } catch (accountError: any) {
                console.error(`[MarketingController] Failed to fetch ad accounts for page ${account.pageId}:`, accountError.message);
            }
        }

        res.status(200).json({
            success: true,
            count: merged.length,
            data: merged
        });
    } catch (error: any) {
        const status = error.status || 500;
        console.error('[MarketingController] Get Ad Accounts Error:', error.message);
        res.status(status).json({
            success: false,
            message: error.message,
            code: status === 401 ? 'META_TOKEN_EXPIRED' : 'META_API_ERROR'
        });
    }
};

export const getCampaigns = async (req: AuthRequest, res: Response) => {
    try {
        const { adAccountId } = req.params;
        const orgId = getOrgId(req.user);
        const accessToken = orgId ? await resolveMetaTokenForAdAccount(orgId, adAccountId) : null;

        if (!accessToken) {
            return res.status(200).json({
                success: false,
                code: 'META_NOT_CONNECTED',
                message: 'No connected Meta account has access to this ad account. Please reconnect in Settings → Integrations.'
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
        const status = error.status || 500;
        console.error('[MarketingController] Get Campaigns Error:', error.message);
        res.status(status).json({ 
            success: false,
            message: error.message,
            code: status === 401 ? 'META_TOKEN_EXPIRED' : 'META_API_ERROR'
        });
    }
};

export const createCampaign = async (req: AuthRequest, res: Response) => {
    try {
        const { adAccountId } = req.params;
        const { name, objective, status, special_ad_categories } = req.body;

        const orgId = getOrgId(req.user);
        const accessToken = orgId ? await resolveMetaTokenForAdAccount(orgId, adAccountId) : null;

        if (!accessToken) {
            return res.status(200).json({
                success: false,
                code: 'META_NOT_CONNECTED',
                message: 'No connected Meta account has access to this ad account. Please reconnect in Settings → Integrations.'
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
        const status = error.status || 500;
        console.error('[MarketingController] Create Campaign Error:', error.message);
        res.status(status).json({
            success: false,
            message: error.message,
            code: status === 401 ? 'META_TOKEN_EXPIRED' : 'META_API_ERROR'
        });
    }
};

// Shared by every route below: resolves the token for adAccountId, or sends the
// standard META_NOT_CONNECTED response and returns null so the caller can bail out.
const getTokenOrRespond = async (req: AuthRequest, res: Response): Promise<string | null> => {
    const { adAccountId } = req.params;
    const orgId = getOrgId(req.user);
    const accessToken = orgId ? await resolveMetaTokenForAdAccount(orgId, adAccountId) : null;

    if (!accessToken) {
        res.status(200).json({
            success: false,
            code: 'META_NOT_CONNECTED',
            message: 'No connected Meta account has access to this ad account. Please reconnect in Settings → Integrations.'
        });
        return null;
    }
    return accessToken;
};

const handleMetaError = (res: Response, error: any, action: string) => {
    const status = error.status || 500;
    console.error(`[MarketingController] ${action} Error:`, error.message);
    res.status(status).json({
        success: false,
        message: error.message,
        code: status === 401 ? 'META_TOKEN_EXPIRED' : 'META_API_ERROR'
    });
};

export const getAdSets = async (req: AuthRequest, res: Response) => {
    try {
        const accessToken = await getTokenOrRespond(req, res);
        if (!accessToken) return;

        const { campaignId } = req.params;
        const marketingService = new MarketingAPIService(accessToken);
        const adSets = await marketingService.getAdSets(campaignId);

        res.status(200).json({ success: true, count: adSets.length, data: adSets });
    } catch (error: any) {
        handleMetaError(res, error, 'Get Ad Sets');
    }
};

export const getAds = async (req: AuthRequest, res: Response) => {
    try {
        const accessToken = await getTokenOrRespond(req, res);
        if (!accessToken) return;

        const { campaignId } = req.params;
        const marketingService = new MarketingAPIService(accessToken);
        const ads = await marketingService.getAds(campaignId);

        res.status(200).json({ success: true, count: ads.length, data: ads });
    } catch (error: any) {
        handleMetaError(res, error, 'Get Ads');
    }
};

export const updateCampaignStatus = async (req: AuthRequest, res: Response) => {
    try {
        const accessToken = await getTokenOrRespond(req, res);
        if (!accessToken) return;

        const { campaignId } = req.params;
        const { status } = req.body;
        if (status !== 'ACTIVE' && status !== 'PAUSED') {
            return res.status(400).json({ success: false, message: 'status must be ACTIVE or PAUSED' });
        }

        const marketingService = new MarketingAPIService(accessToken);
        await marketingService.updateCampaignStatus(campaignId, status);

        res.status(200).json({ success: true });
    } catch (error: any) {
        handleMetaError(res, error, 'Update Campaign Status');
    }
};

export const updateAdSetStatus = async (req: AuthRequest, res: Response) => {
    try {
        const accessToken = await getTokenOrRespond(req, res);
        if (!accessToken) return;

        const { adSetId } = req.params;
        const { status } = req.body;
        if (status !== 'ACTIVE' && status !== 'PAUSED') {
            return res.status(400).json({ success: false, message: 'status must be ACTIVE or PAUSED' });
        }

        const marketingService = new MarketingAPIService(accessToken);
        await marketingService.updateAdSetStatus(adSetId, status);

        res.status(200).json({ success: true });
    } catch (error: any) {
        handleMetaError(res, error, 'Update Ad Set Status');
    }
};

export const updateAdSetBudget = async (req: AuthRequest, res: Response) => {
    try {
        const accessToken = await getTokenOrRespond(req, res);
        if (!accessToken) return;

        const { adSetId } = req.params;
        const { dailyBudget, lifetimeBudget } = req.body;
        if (dailyBudget == null && lifetimeBudget == null) {
            return res.status(400).json({ success: false, message: 'dailyBudget or lifetimeBudget is required' });
        }

        const marketingService = new MarketingAPIService(accessToken);
        await marketingService.updateAdSetBudget(adSetId, { dailyBudget, lifetimeBudget });

        res.status(200).json({ success: true });
    } catch (error: any) {
        handleMetaError(res, error, 'Update Ad Set Budget');
    }
};

