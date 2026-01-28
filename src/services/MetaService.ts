import axios from 'axios';

interface MetaConfig {
    accessToken: string;
    adAccountId: string;
}

export class MetaService {
    private baseUrl = 'https://graph.facebook.com/v18.0';

    async makeRequest(endpoint: string, accessToken: string, params: any = {}) {
        try {
            const response = await axios.get(`${this.baseUrl}/${endpoint}`, {
                params: {
                    access_token: accessToken,
                    ...params
                }
            });
            return response.data;
        } catch (error: any) {
            console.error('Meta API Error:', error.response?.data || error.message);
            throw new Error(error.response?.data?.error?.message || 'Failed to fetch data from Meta');
        }
    }

    async exchangeForLongLivedToken(shortLivedToken: string): Promise<string> {
        try {
            const appId = process.env.META_APP_ID;
            const appSecret = process.env.META_APP_SECRET;

            if (!appId || !appSecret) {
                console.warn('Meta App ID or Secret not configured, skipping token exchange');
                return shortLivedToken;
            }

            const response = await axios.get(`${this.baseUrl}/oauth/access_token`, {
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
        } catch (error: any) {
            console.error('Failed to exchange Meta token:', error.response?.data || error.message);
            // Return original token on failure to avoid breaking the flow completely
            return shortLivedToken;
        }
    }

    async getCampaigns(config: MetaConfig) {
        const fields = 'id,name,status,objective,daily_budget,lifetime_budget,start_time,stop_time';
        const data = await this.makeRequest(`${config.adAccountId}/campaigns`, config.accessToken, {
            fields,
            limit: 50
        });
        return data.data; // Meta returns { data: [], paging: {} }
    }

    async getAdSets(config: MetaConfig, campaignId?: string) {
        const fields = 'id,name,status,start_time,end_time,daily_budget,lifetime_budget,targeting';
        const endpoint = campaignId ? `${campaignId}/adsets` : `${config.adAccountId}/adsets`;

        const data = await this.makeRequest(endpoint, config.accessToken, {
            fields,
            limit: 50
        });
        return data.data;
    }

    async getAds(config: MetaConfig, adSetId?: string) {
        const fields = 'id,name,status,creative{id,title,body,image_url}';
        const endpoint = adSetId ? `${adSetId}/ads` : `${config.adAccountId}/ads`;

        const data = await this.makeRequest(endpoint, config.accessToken, {
            fields,
            limit: 50
        });
        return data.data;
    }

    async getInsights(config: MetaConfig, level: 'campaign' | 'adset' | 'ad' | 'account' = 'account') {
        const fields = 'impressions,clicks,spend,cpc,cpm,cpp,ctr,unique_clicks,reach,actions';
        // Default to last 30 days
        const date_preset = 'last_30d';

        const data = await this.makeRequest(`${config.adAccountId}/insights`, config.accessToken, {
            level,
            fields,
            date_preset
        });
        return data.data;
    }
}

export const metaService = new MetaService();
