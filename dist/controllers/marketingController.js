"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createCampaign = exports.getCampaigns = exports.getAdAccounts = void 0;
const marketingAPIService_1 = __importDefault(require("../services/marketingAPIService"));
const prisma_1 = __importDefault(require("../config/prisma"));
const hierarchyUtils_1 = require("../utils/hierarchyUtils");
const encryption_1 = require("../utils/encryption");
// Helper to get decrypted Meta access token from the organisation's integrations
const getMetaAccessToken = async (user) => {
    try {
        const orgId = (0, hierarchyUtils_1.getOrgId)(user);
        if (!orgId)
            return null;
        const org = await prisma_1.default.organisation.findUnique({
            where: { id: orgId },
            select: { integrations: true }
        });
        const integrations = org?.integrations || {};
        const metaIntegration = integrations.meta;
        if (!metaIntegration?.connected) {
            return null;
        }
        // Use userAccessToken for marketing API if available, fallback to accessToken
        const tokenToDecrypt = metaIntegration.userAccessToken || metaIntegration.accessToken;
        if (!tokenToDecrypt) {
            return null;
        }
        // Decrypt the stored token
        const decrypted = (0, encryption_1.decrypt)(tokenToDecrypt);
        // If decryption failed, decrypt returns the original string.
        // We can detect this by checking if the returned string still looks like an encrypted one (contains colons)
        if (decrypted === tokenToDecrypt && decrypted.includes(':')) {
            console.error('[Marketing] Meta token decryption failed for org:', orgId);
            return null;
        }
        return decrypted;
    }
    catch (error) {
        console.error('[Marketing] Error getting Meta token:', error);
        return null;
    }
};
const getAdAccounts = async (req, res) => {
    try {
        const accessToken = await getMetaAccessToken(req.user);
        if (!accessToken) {
            return res.status(200).json({
                success: false,
                code: 'META_NOT_CONNECTED',
                message: 'Meta account not connected. Please connect in Settings → Integrations.'
            });
        }
        const marketingService = new marketingAPIService_1.default(accessToken);
        const accounts = await marketingService.getAdAccounts();
        res.status(200).json({
            success: true,
            count: accounts.length,
            data: accounts
        });
    }
    catch (error) {
        console.error('[MarketingController] Get Ad Accounts Error:', error.message);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};
exports.getAdAccounts = getAdAccounts;
const getCampaigns = async (req, res) => {
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
        const marketingService = new marketingAPIService_1.default(accessToken);
        const campaigns = await marketingService.getCampaigns(adAccountId);
        res.status(200).json({
            success: true,
            count: campaigns.length,
            data: campaigns
        });
    }
    catch (error) {
        console.error('Get Campaigns Error:', error);
        res.status(500).json({ message: error.message });
    }
};
exports.getCampaigns = getCampaigns;
const createCampaign = async (req, res) => {
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
        const marketingService = new marketingAPIService_1.default(accessToken);
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
    }
    catch (error) {
        console.error('Create Campaign Error:', error);
        res.status(500).json({ message: error.message });
    }
};
exports.createCampaign = createCampaign;
