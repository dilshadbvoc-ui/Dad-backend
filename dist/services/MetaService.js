"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.metaService = exports.MetaService = void 0;
const axios_1 = __importDefault(require("axios"));
class MetaService {
    constructor() {
        this.baseUrl = 'https://graph.facebook.com/v21.0';
    }
    async makeRequest(endpoint, accessToken, params = {}, retries = 3) {
        let lastError;
        for (let attempt = 1; attempt <= retries; attempt++) {
            try {
                const response = await axios_1.default.get(`${this.baseUrl}/${endpoint}`, {
                    params: {
                        access_token: accessToken,
                        ...params
                    },
                    timeout: 30000 // 30 second timeout
                });
                return response.data;
            }
            catch (error) {
                lastError = error;
                console.error(`Meta API Error (attempt ${attempt}/${retries}):`, error.response?.data || error.message);
                // Don't retry on client errors (4xx) except rate limiting
                if (error.response?.status >= 400 && error.response?.status < 500 && error.response?.status !== 429) {
                    break;
                }
                // Wait before retrying (exponential backoff)
                if (attempt < retries) {
                    const delay = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }
        }
        const errorMsg = lastError?.response?.data?.error?.message || lastError?.message || 'Failed to fetch data from Meta API';
        const errorType = lastError?.response?.data?.error?.type;
        const errorCode = lastError?.response?.data?.error?.code;
        const errorSubcode = lastError?.response?.data?.error?.error_subcode;
        console.error(`[MetaService] Final Error: ${errorMsg} (Type: ${errorType}, Code: ${errorCode}, Subcode: ${errorSubcode})`);
        if (errorCode === 190) { // OAuth Error
            throw new Error(`Invalid or expired Meta Access Token. Please reconnect your account. (Code: 190, Subcode: ${errorSubcode})`);
        }
        throw new Error(errorMsg);
    }
    async makePostRequest(endpoint, accessToken, data = {}, retries = 2) {
        let lastError;
        for (let attempt = 1; attempt <= retries; attempt++) {
            try {
                const response = await axios_1.default.post(`${this.baseUrl}/${endpoint}`, data, {
                    params: { access_token: accessToken },
                    timeout: 60000 // Post might take longer
                });
                return response.data;
            }
            catch (error) {
                lastError = error;
                console.error(`Meta API POST Error (attempt ${attempt}/${retries}):`, error.response?.data || error.message);
                if (error.response?.status >= 400 && error.response?.status < 500 && error.response?.status !== 429) {
                    break;
                }
                if (attempt < retries) {
                    const delay = Math.pow(2, attempt) * 2000;
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }
        }
        const errorMsg = lastError?.response?.data?.error?.message || lastError?.message || 'Failed to post data to Meta API';
        throw new Error(errorMsg);
    }
    async exchangeForLongLivedToken(shortLivedToken, config) {
        try {
            // Prefer config values (from DB), fallback to env vars (system default)
            const appId = config?.appId || process.env.META_APP_ID;
            const appSecret = config?.appSecret || process.env.META_APP_SECRET;
            if (!appId || !appSecret) {
                console.warn('Meta App ID or Secret not configured (neither in DB nor ENV), skipping token exchange');
                return shortLivedToken;
            }
            const response = await axios_1.default.get(`${this.baseUrl}/oauth/access_token`, {
                params: {
                    grant_type: 'fb_exchange_token',
                    client_id: appId,
                    client_secret: appSecret,
                    fb_exchange_token: shortLivedToken
                }
            });
            if (response.data && response.data.access_token) {
                console.log('Successfully exchanged for long-lived Meta token');
                return response.data.access_token;
            }
            return shortLivedToken;
        }
        catch (error) {
            console.error('Failed to exchange Meta token:', error.response?.data || error.message);
            // Return original token on failure to avoid breaking the flow completely
            return shortLivedToken;
        }
    }
    async getCampaigns(config) {
        const fields = 'id,name,status,objective,daily_budget,lifetime_budget,start_time,stop_time';
        const data = await this.makeRequest(`${this.getFormattedAdAccountId(config.adAccountId)}/campaigns`, config.accessToken, {
            fields,
            limit: 50
        });
        return data.data; // Meta returns { data: [], paging: {} }
    }
    async getAdSets(config, campaignId) {
        const fields = 'id,name,status,start_time,end_time,daily_budget,lifetime_budget,targeting';
        const endpoint = campaignId ? `${campaignId}/adsets` : `${this.getFormattedAdAccountId(config.adAccountId)}/adsets`;
        const data = await this.makeRequest(endpoint, config.accessToken, {
            fields,
            limit: 50
        });
        return data.data;
    }
    async getAds(config, adSetId) {
        const fields = 'id,name,status,creative{id,title,body,image_url}';
        const endpoint = adSetId ? `${adSetId}/ads` : `${this.getFormattedAdAccountId(config.adAccountId)}/ads`;
        const data = await this.makeRequest(endpoint, config.accessToken, {
            fields,
            limit: 50
        });
        return data.data;
    }
    async getInsights(config, level = 'account') {
        const fields = 'impressions,clicks,spend,cpc,cpm,cpp,ctr,unique_clicks,reach,actions';
        // Default to last 30 days
        const date_preset = 'last_30d';
        const data = await this.makeRequest(`${this.getFormattedAdAccountId(config.adAccountId)}/insights`, config.accessToken, {
            level,
            fields,
            date_preset
        });
        return data.data;
    }
    async testConnection(config) {
        // Try to fetch the ad account details to verify credentials
        const data = await this.makeRequest(this.getFormattedAdAccountId(config.adAccountId), config.accessToken, {
            fields: 'name,account_status'
        });
        return {
            success: true,
            accountName: data.name,
            status: data.account_status
        };
    }
    async createCampaign(config, details) {
        const adAccountId = this.getFormattedAdAccountId(config.adAccountId);
        return await this.makePostRequest(`${adAccountId}/campaigns`, config.accessToken, {
            name: details.name,
            objective: details.objective,
            status: details.status || 'PAUSED', // Always create as paused by default
            special_ad_categories: ['NONE']
        });
    }
    async createAdSet(config, details) {
        const adAccountId = this.getFormattedAdAccountId(config.adAccountId);
        const data = {
            name: details.name,
            campaign_id: details.campaignId,
            optimization_goal: details.optimizationGoal || 'REACH',
            billing_event: details.billingEvent || 'IMPRESSIONS',
            status: details.status || 'PAUSED',
            targeting: details.targeting
        };
        if (details.dailyBudget) {
            data.daily_budget = details.dailyBudget;
        }
        if (details.bidAmount) {
            data.bid_amount = details.bidAmount;
        }
        return await this.makePostRequest(`${adAccountId}/adsets`, config.accessToken, data);
    }
    async createAdCreative(config, details) {
        const adAccountId = this.getFormattedAdAccountId(config.adAccountId);
        const object_story_spec = {
            page_id: details.pageId,
            link_data: {
                message: details.message,
                link: details.link,
                call_to_action: { type: 'LEARN_MORE' }
            }
        };
        if (details.imageHash) {
            object_story_spec.link_data.image_hash = details.imageHash;
        }
        return await this.makePostRequest(`${adAccountId}/adcreatives`, config.accessToken, {
            name: details.name,
            object_story_spec
        });
    }
    async createAd(config, details) {
        const adAccountId = this.getFormattedAdAccountId(config.adAccountId);
        return await this.makePostRequest(`${adAccountId}/ads`, config.accessToken, {
            name: details.name,
            adset_id: details.adSetId,
            creative: { creative_id: details.creativeId },
            status: details.status || 'PAUSED'
        });
    }
    async uploadImage(config, imageUrl) {
        const adAccountId = this.getFormattedAdAccountId(config.adAccountId);
        // This is a simplified version, usually we'd pass a buffer or stream
        // But Graph API accepts URL for images in some cases or we can use the bytes parameter
        return await this.makePostRequest(`${adAccountId}/adimages`, config.accessToken, {
            url: imageUrl
        });
    }
    getFormattedAdAccountId(adAccountId) {
        if (!adAccountId)
            return '';
        // If it already starts with act_, return it
        if (adAccountId.startsWith('act_')) {
            return adAccountId;
        }
        // Otherwise prepend act_
        return `act_${adAccountId}`;
    }
}
exports.MetaService = MetaService;
exports.metaService = new MetaService();
