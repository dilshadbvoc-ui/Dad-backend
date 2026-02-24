"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MetaIntegrationService = void 0;
const prisma_1 = __importDefault(require("../config/prisma"));
exports.MetaIntegrationService = {
    /**
     * Handle incoming webhook from Meta
     */
    async handleWebhook(payload) {
        try {
            console.log('[MetaWebhook] Received payload:', JSON.stringify(payload, null, 2));
            // Basic parsing logic for Facebook Webhooks
            if (payload.entry) {
                for (const entry of payload.entry) {
                    if (entry.changes) {
                        for (const change of entry.changes) {
                            if (change.field === 'leadgen') {
                                await this.processLeadGen(change.value);
                            }
                        }
                    }
                }
            }
        }
        catch (error) {
            console.error('[MetaWebhook] Error processing webhook:', error);
        }
    },
    async processLeadGen(value) {
        try {
            const { leadgen_id, page_id } = value;
            console.log(`[MetaWebhook] Processing LeadGen ID: ${leadgen_id} for Page: ${page_id}`);
            // Find organisation with this page in their integrations
            const orgs = await prisma_1.default.organisation.findMany({
                select: {
                    id: true,
                    name: true,
                    integrations: true
                }
            });
            const matchingOrg = orgs.find(org => {
                const integrations = org.integrations;
                return integrations?.meta?.pageId === page_id;
            });
            if (!matchingOrg) {
                console.log('[MetaWebhook] No connected account found for page', page_id);
                return;
            }
            // Create a basic lead record
            const lead = await prisma_1.default.lead.create({
                data: {
                    firstName: 'Meta Lead',
                    lastName: leadgen_id,
                    phone: `meta_${leadgen_id}`, // Required field, using leadgen_id as placeholder
                    source: 'meta_leadgen',
                    status: 'new',
                    organisationId: matchingOrg.id
                }
            });
            console.log(`[MetaWebhook] Created lead ${lead.id} from Meta LeadGen ID: ${leadgen_id}`);
        }
        catch (error) {
            console.error('[MetaWebhook] Error processing leadgen:', error);
        }
    },
    /**
     * Sync campaigns for a connected account
     */
    async syncCampaigns(organisationId) {
        console.log(`[MetaIntegration] Syncing campaigns for organization ${organisationId}`);
        return [];
    },
    /**
     * Verify Webhook (GET request)
     */
    async verifyWebhook(req, res) {
        const mode = req.query['hub.mode'];
        const token = req.query['hub.verify_token'];
        const challenge = req.query['hub.challenge'];
        const VERIFY_TOKEN = process.env.META_VERIFY_TOKEN || 'my_secure_token';
        if (mode && token) {
            if (mode === 'subscribe' && token === VERIFY_TOKEN) {
                console.log('[MetaWebhook] Verified webhook');
                res.status(200).send(challenge);
            }
            else {
                console.log('[MetaWebhook] Webhook verification failed - invalid token');
                res.sendStatus(403);
            }
        }
        else {
            console.log('[MetaWebhook] Webhook verification failed - missing parameters');
            res.sendStatus(400);
        }
    }
};
//# sourceMappingURL=MetaIntegrationService-simple.js.map