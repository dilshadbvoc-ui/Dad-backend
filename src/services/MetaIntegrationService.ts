import prisma from '../config/prisma';

export const MetaIntegrationService = {
    /**
     * Handle incoming webhook from Meta
     */
    async handleWebhook(payload: any): Promise<void> {
        try {
            console.log('[MetaWebhook] Received payload:', JSON.stringify(payload, null, 2));

            // Basic parsing logic for Facebook Webhooks
            // Usually payload.entry array
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
        } catch (error) {
            console.error('[MetaWebhook] Error processing webhook:', error);
        }
    },

    async processLeadGen(value: any) {
        // value contains leadgen_id, form_id, page_id, created_time
        const { leadgen_id, page_id } = value;
        console.log(`[MetaWebhook] Processing LeadGen ID: ${leadgen_id} for Page: ${page_id}`);

        // TODO: Look up connected Meta account from organisation integrations JSON
        // For now, we log and skip if not configured

        // Find organisation with this page in their integrations
        const orgs = await prisma.organisation.findMany({
            where: {
                integrations: {
                    path: ['meta', 'pageId'],
                    equals: page_id
                }
            }
        }).catch(() => []);

        if (orgs.length === 0) {
            console.log('[MetaWebhook] No connected account found for page', page_id);
            return;
        }

        const org = orgs[0];

        // MVP: Log for now, full implementation would fetch lead details from Graph API
        console.log(`[MetaWebhook] Would create lead for org ${org.name} from Meta LeadGen ID: ${leadgen_id}`);
    },

    /**
     * Sync campaigns for a connected account
     */
    async syncCampaigns(accountId: string): Promise<void> {
        console.log(`[MetaIntegration] Syncing campaigns for account ${accountId}`);
    },

    /**
     * Verify Webhook (GET request)
     */
    async verifyWebhook(req: any, res: any): Promise<void> {
        const mode = req.query['hub.mode'];
        const token = req.query['hub.verify_token'];
        const challenge = req.query['hub.challenge'];

        // TODO: Move token to env var or settings
        const VERIFY_TOKEN = process.env.META_VERIFY_TOKEN || 'my_secure_token';

        if (mode && token) {
            if (mode === 'subscribe' && token === VERIFY_TOKEN) {
                console.log('[MetaWebhook] Verified webhook');
                res.status(200).send(challenge);
            } else {
                res.sendStatus(403);
            }
        } else {
            res.sendStatus(400); // Bad Request if no parameters
        }
    }
};
