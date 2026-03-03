"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const whatsAppCampaignController_1 = require("../controllers/whatsAppCampaignController");
const authMiddleware_1 = require("../middleware/authMiddleware");
const rateLimiter_1 = require("../middleware/rateLimiter");
const router = express_1.default.Router();
router.get('/', authMiddleware_1.protect, whatsAppCampaignController_1.getWhatsAppCampaigns);
router.post('/', authMiddleware_1.protect, rateLimiter_1.campaignLimiter, whatsAppCampaignController_1.createWhatsAppCampaign);
router.put('/:id', authMiddleware_1.protect, whatsAppCampaignController_1.updateWhatsAppCampaign);
router.delete('/:id', authMiddleware_1.protect, whatsAppCampaignController_1.deleteWhatsAppCampaign);
exports.default = router;
