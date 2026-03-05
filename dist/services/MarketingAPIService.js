"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const axios_1 = __importDefault(require("axios"));
class MarketingAPIService {
    constructor(accessToken) {
        this.apiVersion = 'v19.0';
        this.baseUrl = `https://graph.facebook.com/${this.apiVersion}`;
        this.customAxios = axios_1.default.create({
            baseURL: this.baseUrl,
            params: {
                access_token: accessToken,
            },
        });
    }
    /**
     * Fetch all Ad Accounts the user has access to
     */
    async getAdAccounts(fields = 'id,name,account_id,account_status,currency,timezone_name') {
        try {
            const response = await this.customAxios.get('/me/adaccounts', {
                params: { fields },
            });
            return response.data.data;
        }
        catch (error) {
            this.handleError(error, 'fetching ad accounts');
            return []; // Unreachable code due to throw, but keeps TS happy if return type strict
        }
    }
    /**
     * Fetch Campaigns for a specific Ad Account
     */
    async getCampaigns(adAccountId, fields = 'id,name,status,objective,daily_budget,lifetime_budget') {
        try {
            // Ensure adAccountId starts with 'act_'
            const formattedId = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`;
            const response = await this.customAxios.get(`/${formattedId}/campaigns`, {
                params: { fields },
            });
            return response.data.data;
        }
        catch (error) {
            this.handleError(error, `fetching campaigns for ${adAccountId}`);
            return [];
        }
    }
    /**
     * Create a new Campaign
     */
    async createCampaign(adAccountId, campaignData) {
        try {
            const formattedId = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`;
            const response = await this.customAxios.post(`/${formattedId}/campaigns`, {
                ...campaignData,
                is_adset_budget_sharing_enabled: false
            });
            return response.data;
        }
        catch (error) {
            this.handleError(error, `creating campaign for ${adAccountId}`);
            throw error; // redundant but clear
        }
    }
    handleError(error, context) {
        const status = error.response?.status;
        const data = error.response?.data;
        const message = data?.error?.message || error.message;
        console.error(`Error ${context}:`, message);
        // Propagate 401 as 400 to avoid global logout if it's just meta token issue
        // Actually controller handles user-level token missing. 
        // If meta returns 401, it means the token is invalid/expired.
        // We should throw a specific error that controller can catch.
        const err = new Error(message);
        err.status = status;
        err.metaError = data?.error;
        throw err;
    }
}
exports.default = MarketingAPIService;
