"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const webFormController_1 = require("../controllers/webFormController");
const metaIntegrationService_1 = require("../services/metaIntegrationService");
const siteFAQController_1 = require("../controllers/siteFAQController");
const zapierWebhookService_1 = require("../services/zapierWebhookService");
const router = express_1.default.Router();
/**
 * @route GET /api/public/health
 * @desc Public Health Check
 */
router.get('/health', (req, res) => res.status(200).send('OK'));
/**
 * @route POST /api/public/webforms/:id/submit
 * @desc Submit a web form to create a lead
 */
router.post('/webforms/:id/submit', webFormController_1.submitWebForm);
/**
 * @route GET /api/public/meta/webhook
 * @desc Verify Meta Webhook
 */
router.get('/meta/webhook', (req, res) => metaIntegrationService_1.MetaIntegrationService.verifyWebhook(req, res));
/**
 * @route POST /api/public/meta/webhook
 * @desc Handle Meta Webhook (Facebook Leads etc)
 */
router.post('/meta/webhook', (req, res) => {
    metaIntegrationService_1.MetaIntegrationService.handleWebhook(req.body);
    res.sendStatus(200);
});
/**
 * @route GET /api/public/faqs
 * @desc Get active FAQs for landing page
 */
router.get('/faqs', siteFAQController_1.getPublicFAQs);
/**
 * @route POST /api/public/zapier/webhook/:orgId
 * @desc Receive leads from Zapier (Facebook Lead Ads, etc.)
 * @auth API Key via query param ?apiKey=xxx
 */
router.post('/zapier/webhook/:orgId', async (req, res) => {
    try {
        const { orgId } = req.params;
        const apiKey = req.query.apiKey || req.headers['x-api-key'];
        if (!orgId || !apiKey) {
            return res.status(400).json({ message: 'Missing orgId or apiKey' });
        }
        const { valid, org } = await zapierWebhookService_1.ZapierWebhookService.validateRequest(orgId, apiKey);
        if (!valid || !org) {
            return res.status(401).json({ message: 'Invalid API key or organisation' });
        }
        const result = await zapierWebhookService_1.ZapierWebhookService.processLead(org, req.body);
        res.status(200).json({
            message: result.isReEnquiry ? 'Lead updated (re-enquiry)' : 'Lead created',
            leadId: result.leadId
        });
    }
    catch (error) {
        console.error('[ZapierWebhook] Route error:', error.message);
        res.status(500).json({ message: 'Failed to process webhook' });
    }
});
exports.default = router;
