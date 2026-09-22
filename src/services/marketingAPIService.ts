import axios from 'axios';

interface AdAccount {
    id: string;
    name: string;
    account_id: string;
    account_status: number;
    currency: string;
    timezone_name: string;
}

interface Campaign {
    id: string;
    name: string;
    status: string;
    effective_status?: string;
    objective: string;
    daily_budget?: string;
    lifetime_budget?: string;
}

interface AdSet {
    id: string;
    name: string;
    status: string;
    effective_status?: string;
    daily_budget?: string;
    lifetime_budget?: string;
    start_time?: string;
}

interface Ad {
    id: string;
    name: string;
    status: string;
    effective_status?: string;
    creative?: {
        id: string;
        thumbnail_url?: string;
        image_url?: string;
        body?: string;
        title?: string;
    };
}

class MarketingAPIService {
    private customAxios: any;
    private apiVersion = 'v19.0';
    private baseUrl = `https://graph.facebook.com/${this.apiVersion}`;

    constructor(accessToken: string) {
        this.customAxios = axios.create({
            baseURL: this.baseUrl,
            params: {
                access_token: accessToken,
            },
        });
    }

    /**
     * Fetch Ad Accounts. If businessIds is provided (the Business(es) the user
     * actually granted during Meta login), scope the result to ad accounts owned
     * by or shared with those businesses only — not every ad account the token
     * has grants for. Falls back to the unscoped /me/adaccounts if no businessIds
     * are known, or if the scoped lookup comes back empty, so a connection never
     * silently breaks for orgs connected before this scoping existed.
     */
    async getAdAccounts(businessIds?: string[], fields = 'id,name,account_id,account_status,currency,timezone_name'): Promise<AdAccount[]> {
        try {
            if (businessIds && businessIds.length > 0) {
                const scoped: AdAccount[] = [];
                for (const businessId of businessIds) {
                    for (const edge of ['owned_ad_accounts', 'client_ad_accounts']) {
                        try {
                            const response = await this.customAxios.get(`/${businessId}/${edge}`, {
                                params: { fields },
                            });
                            for (const acc of (response.data.data || [])) {
                                if (!scoped.some((a) => a.id === acc.id)) {
                                    scoped.push(acc);
                                }
                            }
                        } catch {
                            // One business/edge failing shouldn't break the whole lookup.
                        }
                    }
                }
                if (scoped.length > 0) return scoped;
            }

            const response = await this.customAxios.get('/me/adaccounts', {
                params: { fields },
            });
            return response.data.data;
        } catch (error: any) {
            this.handleError(error, 'fetching ad accounts');
            return []; // Unreachable code due to throw, but keeps TS happy if return type strict
        }
    }

    /**
     * Fetch Campaigns for a specific Ad Account
     */
    async getCampaigns(adAccountId: string, fields = 'id,name,status,effective_status,objective,daily_budget,lifetime_budget'): Promise<Campaign[]> {
        try {
            // Ensure adAccountId starts with 'act_'
            const formattedId = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`;

            // Follows Meta's paging.next cursor — without this, accounts with more
            // campaigns than a single page returns were silently truncated, hiding
            // both campaigns and any effective_status values beyond page 1.
            const allCampaigns: Campaign[] = [];
            let response = await this.customAxios.get(`/${formattedId}/campaigns`, {
                params: { fields, limit: 50 },
            });
            allCampaigns.push(...(response.data.data || []));

            let pages = 1;
            while (response.data.paging?.next && pages < 20) {
                response = await axios.get(response.data.paging.next);
                allCampaigns.push(...(response.data.data || []));
                pages++;
            }

            return allCampaigns;
        } catch (error: any) {
            this.handleError(error, `fetching campaigns for ${adAccountId}`);
            return [];
        }
    }

    /**
     * Create a new Campaign
     */
    async createCampaign(adAccountId: string, campaignData: {
        name: string;
        objective: string;
        status: 'PAUSED' | 'ACTIVE';
        special_ad_categories: string[];
    }): Promise<Campaign> {
        try {
            const formattedId = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`;

            const response = await this.customAxios.post(`/${formattedId}/campaigns`, {
                ...campaignData,
                is_adset_budget_sharing_enabled: false
            });
            return response.data;
        } catch (error: any) {
            this.handleError(error, `creating campaign for ${adAccountId}`);
            throw error; // redundant but clear
        }
    }

    /**
     * Fetch Ad Sets belonging to a specific Campaign (scoped via the campaign edge
     * rather than the whole ad account, so callers drilling into one campaign don't
     * have to fetch and then filter every ad set in the account).
     */
    async getAdSets(campaignId: string, fields = 'id,name,status,effective_status,daily_budget,lifetime_budget,start_time'): Promise<AdSet[]> {
        try {
            const response = await this.customAxios.get(`/${campaignId}/adsets`, {
                params: { fields, limit: 100 },
            });
            return response.data.data || [];
        } catch (error: any) {
            this.handleError(error, `fetching ad sets for campaign ${campaignId}`);
            return [];
        }
    }

    /**
     * Fetch Ads (with creative preview data) belonging to a specific Campaign.
     */
    async getAds(campaignId: string, fields = 'id,name,status,effective_status,creative{id,thumbnail_url,image_url,body,title}'): Promise<Ad[]> {
        try {
            const response = await this.customAxios.get(`/${campaignId}/ads`, {
                params: { fields, limit: 100 },
            });
            return response.data.data || [];
        } catch (error: any) {
            this.handleError(error, `fetching ads for campaign ${campaignId}`);
            return [];
        }
    }

    /**
     * Pause or resume a Campaign.
     */
    async updateCampaignStatus(campaignId: string, status: 'ACTIVE' | 'PAUSED'): Promise<void> {
        try {
            await this.customAxios.post(`/${campaignId}`, { status });
        } catch (error: any) {
            this.handleError(error, `updating status for campaign ${campaignId}`);
        }
    }

    /**
     * Pause or resume an Ad Set.
     */
    async updateAdSetStatus(adSetId: string, status: 'ACTIVE' | 'PAUSED'): Promise<void> {
        try {
            await this.customAxios.post(`/${adSetId}`, { status });
        } catch (error: any) {
            this.handleError(error, `updating status for ad set ${adSetId}`);
        }
    }

    /**
     * Update an Ad Set's budget. Meta takes budgets as minor currency units (e.g.
     * paise, cents) as a string - callers pass whole-currency amounts and this
     * converts, matching how daily_budget/lifetime_budget are already displayed
     * elsewhere in this app (divided by 100).
     */
    async updateAdSetBudget(adSetId: string, budget: { dailyBudget?: number; lifetimeBudget?: number }): Promise<void> {
        try {
            const data: Record<string, string> = {};
            if (budget.dailyBudget != null) data.daily_budget = String(Math.round(budget.dailyBudget * 100));
            if (budget.lifetimeBudget != null) data.lifetime_budget = String(Math.round(budget.lifetimeBudget * 100));
            await this.customAxios.post(`/${adSetId}`, data);
        } catch (error: any) {
            this.handleError(error, `updating budget for ad set ${adSetId}`);
        }
    }

    private handleError(error: any, context: string) {
        const status = error.response?.status;
        const data = error.response?.data;
        const message = data?.error?.message || error.message;

        console.error(`Error ${context}:`, message);

        // Propagate 401 as 400 to avoid global logout if it's just meta token issue
        // Actually controller handles user-level token missing. 
        // If meta returns 401, it means the token is invalid/expired.
        // We should throw a specific error that controller can catch.

        const err: any = new Error(message);
        err.status = status;
        err.metaError = data?.error;
        throw err;
    }
}

export default MarketingAPIService;
