"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createCampaign = exports.getCampaigns = exports.getAdAccounts = void 0;
const MarketingAPIService_1 = __importDefault(require("../services/MarketingAPIService"));
const prisma_1 = __importDefault(require("../config/prisma"));
const getAdAccounts = async (req, res) => {
    try {
        const user = await prisma_1.default.user.findUnique({
            where: { id: req.user.id }
            // Assuming metaAccessToken is a field in User model. 
            // If it's protected/hidden in schema, we might need to select it explicitly if not default.
        });
        if (!user || !user.metaAccessToken) {
            // Return 200 instead of 400 to prevent console errors, handle graciously in frontend
            return res.status(200).json({
                success: false,
                code: 'META_NOT_CONNECTED',
                message: 'User not connected to Meta'
            });
        }
        const marketingService = new MarketingAPIService_1.default(user.metaAccessToken);
        const accounts = await marketingService.getAdAccounts();
        res.status(200).json({
            success: true,
            count: accounts.length,
            data: accounts
        });
    }
    catch (error) {
        console.error('Get Ad Accounts Error:', error);
        res.status(500).json({ message: error.message });
    }
};
exports.getAdAccounts = getAdAccounts;
const getCampaigns = async (req, res) => {
    try {
        const { adAccountId } = req.params;
        const user = await prisma_1.default.user.findUnique({
            where: { id: req.user.id }
        });
        if (!user || !user.metaAccessToken) {
            // Return 200 instead of 400 to prevent console errors, handle graciously in frontend
            return res.status(200).json({
                success: false,
                code: 'META_NOT_CONNECTED',
                message: 'User not connected to Meta'
            });
        }
        const marketingService = new MarketingAPIService_1.default(user.metaAccessToken);
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
        const user = await prisma_1.default.user.findUnique({
            where: { id: req.user.id }
        });
        if (!user || !user.metaAccessToken) {
            // Return 200 instead of 400 to prevent console errors, handle graciously in frontend
            return res.status(200).json({
                success: false,
                code: 'META_NOT_CONNECTED',
                message: 'User not connected to Meta'
            });
        }
        const marketingService = new MarketingAPIService_1.default(user.metaAccessToken);
        const campaign = await marketingService.createCampaign(adAccountId, {
            name,
            objective, // e.g., 'OUTCOME_LEADS', 'OUTCOME_TRAFFIC'
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
