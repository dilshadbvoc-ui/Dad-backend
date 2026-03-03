"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const webFormController_1 = require("../controllers/webFormController");
const metaIntegrationService_1 = require("../services/metaIntegrationService");
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
exports.default = router;
