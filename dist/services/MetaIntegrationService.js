"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MetaIntegrationService = void 0;
const prisma_1 = __importDefault(require("../config/prisma"));
const metaService_1 = require("./metaService");
const logger_1 = require("../utils/logger");
const encryption_1 = require("../utils/encryption");
exports.MetaIntegrationService = {
    /**
     * Handle incoming webhook from Meta
     */
    async handleWebhook(payload) {
        try {
            logger_1.logger.webhook('Meta', 'receive_payload', undefined, { payload });
            // Basic parsing logic for Facebook Webhooks
            // Usually payload.entry array
            if (payload.entry) {
                for (const entry of payload.entry) {
                    if (entry.changes) {
                        for (const change of entry.changes) {
                            if (change.field === 'leadgen') {
                                await this.processLeadGen(change.value);
                            }
                            else if (change.field === 'ads') {
                                await this.processAdUpdate(change.value);
                            }
                        }
                    }
                }
            }
        }
        catch (error) {
            logger_1.logger.webhookError('Meta', 'process_webhook', error);
        }
    },
    async processLeadGen(value) {
        try {
            // value contains leadgen_id, form_id, page_id, created_time
            const { leadgen_id, page_id, ad_id, form_id } = value;
            logger_1.logger.webhook('Meta', 'process_leadgen', undefined, { leadgen_id, page_id, ad_id, form_id });
            // Delegate to the specialized MetaLeadService for unified processing
            const { MetaLeadService } = await Promise.resolve().then(() => __importStar(require('./metaLeadService')));
            await MetaLeadService.processIncomingLead(leadgen_id, page_id, ad_id, form_id);
        }
        catch (error) {
            logger_1.logger.webhookError('Meta', 'process_leadgen_failed', error);
        }
    },
    async processAdUpdate(value) {
        try {
            logger_1.logger.webhook('Meta', 'ad_update', undefined, { value });
            // value contains data related to ad status changes
            // For now, we log it and we could potentially update a local campaign status
            // if we have a mapping between Meta Ad ID and CRM Campaign
            if (value.ad_id) {
                console.log(`[MetaIntegration] Ad update received for Ad ID: ${value.ad_id}, Status: ${value.status}`);
                // We could find campaigns linked to this ad and update them
                const campaigns = await prisma_1.default.campaign.findMany({
                    where: {
                        customFields: {
                            path: ['metaAdId'],
                            equals: value.ad_id
                        }
                    }
                });
                for (const campaign of campaigns) {
                    await prisma_1.default.campaign.update({
                        where: { id: campaign.id },
                        data: {
                            status: this.mapMetaStatusToCrmStatus(value.status || 'ACTIVE')
                        }
                    });
                }
            }
        }
        catch (error) {
            logger_1.logger.webhookError('Meta', 'ad_update_failed', error);
        }
    },
    /**
     * Sync campaigns for a connected account
     */
    async syncCampaigns(organisationId) {
        try {
            logger_1.logger.info(`Syncing campaigns for organization ${organisationId}`, 'MetaIntegration', undefined, organisationId);
            const org = await prisma_1.default.organisation.findUnique({
                where: { id: organisationId },
                select: { integrations: true }
            });
            if (!org) {
                throw new Error('Organization not found');
            }
            const integrations = org.integrations;
            const metaConfig = integrations?.meta;
            if (!metaConfig?.accessToken || !metaConfig?.adAccountId) {
                throw new Error('Meta integration not configured');
            }
            // Fetch campaigns from Meta
            const campaigns = await metaService_1.metaService.getCampaigns({
                ...metaConfig,
                accessToken: (0, encryption_1.decrypt)(metaConfig.accessToken)
            });
            // Sync campaigns to database
            const syncedCampaigns = [];
            for (const campaign of campaigns) {
                try {
                    const existingCampaign = await prisma_1.default.campaign.findFirst({
                        where: {
                            organisationId,
                            customFields: {
                                path: ['metaCampaignId'],
                                equals: campaign.id
                            }
                        }
                    });
                    if (existingCampaign) {
                        // Update existing campaign
                        const updated = await prisma_1.default.campaign.update({
                            where: { id: existingCampaign.id },
                            data: {
                                name: campaign.name,
                                status: this.mapMetaStatusToCrmStatus(campaign.status),
                                customFields: {
                                    ...existingCampaign.customFields,
                                    metaCampaignId: campaign.id,
                                    metaObjective: campaign.objective,
                                    metaDailyBudget: campaign.daily_budget,
                                    metaLifetimeBudget: campaign.lifetime_budget,
                                    metaStartTime: campaign.start_time,
                                    metaStopTime: campaign.stop_time
                                }
                            }
                        });
                        syncedCampaigns.push(updated);
                    }
                    else {
                        // Create new campaign
                        const created = await prisma_1.default.campaign.create({
                            data: {
                                name: campaign.name,
                                subject: `Meta Campaign: ${campaign.name}`,
                                content: `Imported from Meta Ads - Objective: ${campaign.objective}`,
                                status: this.mapMetaStatusToCrmStatus(campaign.status),
                                organisationId,
                                customFields: {
                                    metaCampaignId: campaign.id,
                                    metaObjective: campaign.objective,
                                    metaDailyBudget: campaign.daily_budget,
                                    metaLifetimeBudget: campaign.lifetime_budget,
                                    metaStartTime: campaign.start_time,
                                    metaStopTime: campaign.stop_time,
                                    source: 'meta_ads'
                                }
                            }
                        });
                        syncedCampaigns.push(created);
                    }
                }
                catch (campaignError) {
                    logger_1.logger.error(`Error syncing campaign ${campaign.id}`, campaignError, 'MetaIntegration', undefined, organisationId);
                }
            }
            logger_1.logger.info(`Synced ${syncedCampaigns.length} campaigns`, 'MetaIntegration', undefined, organisationId);
            return syncedCampaigns;
        }
        catch (error) {
            logger_1.logger.error('Error syncing campaigns', error, 'MetaIntegration', undefined, organisationId);
            throw error;
        }
    },
    /**
     * Map Meta campaign status to CRM status
     */
    mapMetaStatusToCrmStatus(metaStatus) {
        const statusMap = {
            'ACTIVE': 'active',
            'PAUSED': 'paused',
            'DELETED': 'deleted',
            'ARCHIVED': 'archived',
            'PENDING_REVIEW': 'draft',
            'DISAPPROVED': 'failed',
            'PREAPPROVED': 'scheduled',
            'PENDING_BILLING_INFO': 'draft',
            'CAMPAIGN_PAUSED': 'paused',
            'ADSET_PAUSED': 'paused',
            'IN_PROCESS': 'active',
            'WITH_ISSUES': 'failed'
        };
        return statusMap[metaStatus] || 'draft';
    },
    /**
     * Get campaign insights for synced campaigns
     */
    async getCampaignInsights(organisationId, campaignId) {
        try {
            const org = await prisma_1.default.organisation.findUnique({
                where: { id: organisationId },
                select: { integrations: true }
            });
            if (!org) {
                throw new Error('Organization not found');
            }
            const integrations = org.integrations;
            const metaConfig = integrations?.meta;
            if (!metaConfig?.accessToken || !metaConfig?.adAccountId) {
                throw new Error('Meta integration not configured');
            }
            const accessToken = (0, encryption_1.decrypt)(metaConfig.accessToken);
            let insights;
            if (campaignId) {
                // Get insights for specific campaign
                const campaign = await prisma_1.default.campaign.findFirst({
                    where: { id: campaignId, organisationId },
                    select: { customFields: true }
                });
                if (!campaign) {
                    throw new Error('Campaign not found');
                }
                const customFields = campaign.customFields;
                const metaCampaignId = customFields?.metaCampaignId;
                if (!metaCampaignId) {
                    throw new Error('Campaign not linked to Meta');
                }
                insights = await metaService_1.metaService.makeRequest(`${metaCampaignId}/insights`, accessToken, {
                    fields: 'impressions,clicks,spend,cpc,cpm,cpp,ctr,unique_clicks,reach,actions',
                    date_preset: 'last_30d'
                });
            }
            else {
                // Get account-level insights
                insights = await metaService_1.metaService.getInsights({ ...metaConfig, accessToken }, 'account');
            }
            return insights;
        }
        catch (error) {
            logger_1.logger.error('Error getting campaign insights', error, 'MetaIntegration', undefined, organisationId);
            throw error;
        }
    },
    /**
     * Verify Webhook (GET request)
     */
    async verifyWebhook(req, res) {
        // Helper to grab param regardless of parsing style (dot notation or nested object)
        const getParam = (name) => {
            return req.query[name] || (req.query.hub && req.query.hub[name.replace('hub.', '')]);
        };
        const mode = getParam('hub.mode');
        const token = getParam('hub.verify_token');
        const challenge = getParam('hub.challenge');
        const VERIFY_TOKEN = process.env.META_VERIFY_TOKEN;
        if (!VERIFY_TOKEN) {
            logger_1.logger.error('[MetaWebhook] META_VERIFY_TOKEN not configured', 'MetaWebhook');
            return res.status(500).json({ error: 'Server configuration error' });
        }
        logger_1.logger.info(`[MetaWebhook] Verification Request: Mode=${mode}, Token=${token}, Challenge=${challenge}`, 'MetaWebhook');
        logger_1.logger.info(`[MetaWebhook] Expected Token: ${VERIFY_TOKEN}`, 'MetaWebhook');
        if (mode && token) {
            if (mode === 'subscribe' && token === VERIFY_TOKEN) {
                logger_1.logger.info('[MetaWebhook] Verification SUCCESS', 'MetaWebhook');
                // Meta expects plain text of the challenge
                res.type('text/plain').status(200).send(challenge);
            }
            else {
                logger_1.logger.warn(`[MetaWebhook] Verification FAILED. Received token: '${token}', Expected: '${VERIFY_TOKEN}'`, 'MetaWebhook');
                res.sendStatus(403);
            }
        }
        else {
            logger_1.logger.warn('[MetaWebhook] Verification FAILED - Missing parameters', 'MetaWebhook');
            res.sendStatus(400);
        }
    }
};
