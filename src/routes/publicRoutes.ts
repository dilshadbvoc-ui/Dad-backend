
import express from 'express';
import { submitWebForm } from '../controllers/webFormController';
import { MetaIntegrationService } from '../services/metaIntegrationService';
import { getPublicFAQs } from '../controllers/siteFAQController';

const router = express.Router();

/**
 * @route GET /api/public/health
 * @desc Public Health Check
 */
router.get('/health', (req, res) => res.status(200).send('OK'));

/**
 * @route POST /api/public/webforms/:id/submit
 * @desc Submit a web form to create a lead
 */
router.post('/webforms/:id/submit', submitWebForm);

/**
 * @route GET /api/public/meta/webhook
 * @desc Verify Meta Webhook
 */
router.get('/meta/webhook', (req, res) => MetaIntegrationService.verifyWebhook(req, res));

/**
 * @route POST /api/public/meta/webhook
 * @desc Handle Meta Webhook (Facebook Leads etc)
 */
router.post('/meta/webhook', (req, res) => {
    MetaIntegrationService.handleWebhook(req.body);
    res.sendStatus(200);
});

/**
 * @route GET /api/public/faqs
 * @desc Get active FAQs for landing page
 */
router.get('/faqs', getPublicFAQs);

export default router;
