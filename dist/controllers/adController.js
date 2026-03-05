"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadAdImage = exports.createFullAd = exports.getAccountInsights = exports.getCampaignInsights = exports.syncCampaigns = exports.testConnection = exports.getInsights = exports.getAds = exports.getAdSets = exports.getCampaigns = exports.getMetaConfig = void 0;
const metaService_1 = require("../services/metaService");
const metaIntegrationService_1 = require("../services/metaIntegrationService");
const prisma_1 = __importDefault(require("../config/prisma"));
const hierarchyUtils_1 = require("../utils/hierarchyUtils");
const encryption_1 = require("../utils/encryption");
const getMetaConfig = async (req) => {
    if (!req.user?.organisationId) {
        throw new Error('User not authenticated or missing organisation');
    }
    const org = await prisma_1.default.organisation.findUnique({
        where: { id: req.user.organisationId }
    });
    if (!org)
        throw new Error('Organisation not found');
    const integrations = org.integrations;
    const metaConfig = integrations?.meta;
    if (!metaConfig?.accessToken) {
        throw new Error('Meta integration not configured. Please connect your Facebook account in Settings → Integrations.');
    }
    // Decrypt the token before using it
    return {
        ...metaConfig,
        accessToken: (0, encryption_1.decrypt)(metaConfig.accessToken)
    };
};
exports.getMetaConfig = getMetaConfig;
const getCampaigns = async (req, res) => {
    try {
        const config = await (0, exports.getMetaConfig)(req);
        const campaigns = await metaService_1.metaService.getCampaigns(config);
        res.json(campaigns);
    }
    catch (error) {
        console.error('Error in getCampaigns:', error);
        // Return empty array instead of 500 error
        res.status(200).json({
            message: error.message || 'Unable to fetch campaigns',
            campaigns: [],
            error: true
        });
    }
};
exports.getCampaigns = getCampaigns;
const getAdSets = async (req, res) => {
    try {
        const config = await (0, exports.getMetaConfig)(req);
        const { campaignId } = req.query;
        const adSets = await metaService_1.metaService.getAdSets(config, campaignId);
        res.json(adSets);
    }
    catch (error) {
        console.error('Error in getAdSets:', error);
        res.status(200).json({
            message: error.message || 'Unable to fetch ad sets',
            adSets: [],
            error: true
        });
    }
};
exports.getAdSets = getAdSets;
const getAds = async (req, res) => {
    try {
        const config = await (0, exports.getMetaConfig)(req);
        const { adSetId } = req.query;
        const ads = await metaService_1.metaService.getAds(config, adSetId);
        res.json(ads);
    }
    catch (error) {
        console.error('Error in getAds:', error);
        res.status(200).json({
            message: error.message || 'Unable to fetch ads',
            ads: [],
            error: true
        });
    }
};
exports.getAds = getAds;
const getInsights = async (req, res) => {
    try {
        const config = await (0, exports.getMetaConfig)(req);
        const { level } = req.query;
        const insights = await metaService_1.metaService.getInsights(config, level);
        res.json(insights);
    }
    catch (error) {
        console.error('Error in getInsights:', error);
        res.status(200).json({
            message: error.message || 'Unable to fetch insights',
            insights: [],
            error: true
        });
    }
};
exports.getInsights = getInsights;
const testConnection = async (req, res) => {
    try {
        const config = await (0, exports.getMetaConfig)(req);
        const result = await metaService_1.metaService.testConnection(config);
        res.json(result);
    }
    catch (error) {
        console.error('Error in testConnection:', error);
        res.status(200).json({
            success: false,
            message: error.message || 'Unable to test connection',
            error: true
        });
    }
};
exports.testConnection = testConnection;
const syncCampaigns = async (req, res) => {
    try {
        const user = req.user;
        const orgId = (0, hierarchyUtils_1.getOrgId)(user);
        if (!orgId)
            return res.status(400).json({ message: 'No organisation found' });
        const campaigns = await metaIntegrationService_1.MetaIntegrationService.syncCampaigns(orgId);
        res.json({
            message: `Successfully synced ${campaigns.length} campaigns`,
            campaigns
        });
    }
    catch (error) {
        console.error('Error in syncCampaigns:', error);
        res.status(200).json({
            message: error.message || 'Unable to sync campaigns',
            campaigns: [],
            error: true
        });
    }
};
exports.syncCampaigns = syncCampaigns;
const getCampaignInsights = async (req, res) => {
    try {
        const config = await (0, exports.getMetaConfig)(req);
        const insights = await metaService_1.metaService.getInsights(config, 'campaign');
        res.json(insights);
    }
    catch (error) {
        console.error('Error in getCampaignInsights:', error);
        res.status(200).json({
            message: error.message || 'Unable to fetch campaign insights',
            insights: [],
            error: true
        });
    }
};
exports.getCampaignInsights = getCampaignInsights;
const getAccountInsights = async (req, res) => {
    try {
        const config = await (0, exports.getMetaConfig)(req);
        const insights = await metaService_1.metaService.getInsights(config, 'account');
        res.json(insights);
    }
    catch (error) {
        console.error('Error in getAccountInsights:', error);
        res.status(200).json({
            message: error.message || 'Unable to fetch account insights',
            insights: [],
            error: true
        });
    }
};
exports.getAccountInsights = getAccountInsights;
const createFullAd = async (req, res) => {
    try {
        const config = await (0, exports.getMetaConfig)(req);
        const { campaign, adSet, creative, ad } = req.body;
        console.log('[createFullAd] Payload received:', JSON.stringify({ campaign, adSet: { ...adSet, targeting: '...' }, creative: { ...creative, imageUrl: creative?.imageUrl ? '...' : undefined }, ad }, null, 2));
        // 1. Create Campaign
        console.log('[createFullAd] Step 1: Creating campaign...');
        const campaignResult = await metaService_1.metaService.createCampaign(config, campaign);
        const campaignId = campaignResult.id;
        console.log('[createFullAd] Campaign created:', campaignId);
        // 2. Create Ad Set
        console.log('[createFullAd] Step 2: Creating ad set with daily_budget:', adSet.dailyBudget);
        const adSetResult = await metaService_1.metaService.createAdSet(config, {
            ...adSet,
            campaignId
        });
        const adSetId = adSetResult.id;
        console.log('[createFullAd] Ad Set created:', adSetId);
        // 3. Create Creative
        console.log('[createFullAd] Step 3: Creating creative... pageId from config:', config.pageId, 'from body:', creative?.pageId);
        let imageHash = creative.imageHash;
        if (creative.imageUrl && !imageHash) {
            const uploadResult = await metaService_1.metaService.uploadImage(config, creative.imageUrl);
            imageHash = uploadResult.images[Object.keys(uploadResult.images)[0]].hash;
        }
        const creativeResult = await metaService_1.metaService.createAdCreative(config, {
            ...creative,
            pageId: creative.pageId || config.pageId, // Use org's stored pageId as fallback
            imageHash
        });
        const creativeId = creativeResult.id;
        console.log('[createFullAd] Creative created:', creativeId);
        // 4. Create Ad
        console.log('[createFullAd] Step 4: Creating ad...');
        const adResult = await metaService_1.metaService.createAd(config, {
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
    }
    catch (error) {
        console.error('Error in createFullAd:', error?.response?.data || error.message || error);
        // Return Meta's actual error message for better user feedback
        const metaError = error?.response?.data?.error;
        const userMessage = metaError?.error_user_msg || metaError?.message || error.message || 'Failed to create ad';
        res.status(500).json({ message: userMessage });
    }
};
exports.createFullAd = createFullAd;
const uploadAdImage = async (req, res) => {
    try {
        const config = await (0, exports.getMetaConfig)(req);
        const { imageUrl } = req.body;
        if (!imageUrl) {
            return res.status(400).json({ message: 'imageUrl is required' });
        }
        const result = await metaService_1.metaService.uploadImage(config, imageUrl);
        res.json(result);
    }
    catch (error) {
        console.error('Error in uploadAdImage:', error);
        res.status(500).json({ message: error.message });
    }
};
exports.uploadAdImage = uploadAdImage;
