"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
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
    handleWebhook(payload) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                console.log('[MetaWebhook] Received payload:', JSON.stringify(payload, null, 2));
                // Basic parsing logic for Facebook Webhooks
                // Usually payload.entry array
                if (payload.entry) {
                    for (const entry of payload.entry) {
                        if (entry.changes) {
                            for (const change of entry.changes) {
                                if (change.field === 'leadgen') {
                                    yield this.processLeadGen(change.value);
                                }
                            }
                        }
                    }
                }
            }
            catch (error) {
                console.error('[MetaWebhook] Error processing webhook:', error);
            }
        });
    },
    processLeadGen(value) {
        return __awaiter(this, void 0, void 0, function* () {
            // value contains leadgen_id, form_id, page_id, created_time
            const { leadgen_id, page_id } = value;
            console.log(`[MetaWebhook] Processing LeadGen ID: ${leadgen_id} for Page: ${page_id}`);
            // TODO: Look up connected Meta account from organisation integrations JSON
            // For now, we log and skip if not configured
            // Find organisation with this page in their integrations
            const orgs = yield prisma_1.default.organisation.findMany({
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
        });
    },
    /**
     * Sync campaigns for a connected account
     */
    syncCampaigns(accountId) {
        return __awaiter(this, void 0, void 0, function* () {
            console.log(`[MetaIntegration] Syncing campaigns for account ${accountId}`);
        });
    },
    /**
     * Verify Webhook (GET request)
     */
    verifyWebhook(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            const mode = req.query['hub.mode'];
            const token = req.query['hub.verify_token'];
            const challenge = req.query['hub.challenge'];
            // TODO: Move token to env var or settings
            const VERIFY_TOKEN = process.env.META_VERIFY_TOKEN || 'my_secure_token';
            if (mode && token) {
                if (mode === 'subscribe' && token === VERIFY_TOKEN) {
                    console.log('[MetaWebhook] Verified webhook');
                    res.status(200).send(challenge);
                }
                else {
                    res.sendStatus(403);
                }
            }
            else {
                res.sendStatus(400); // Bad Request if no parameters
            }
        });
    }
};
