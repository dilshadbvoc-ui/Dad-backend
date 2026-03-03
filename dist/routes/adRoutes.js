"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const authMiddleware_1 = require("../middleware/authMiddleware");
const adController_1 = require("../controllers/adController");
const rateLimiter_1 = require("../middleware/rateLimiter");
const router = express_1.default.Router();
// Meta Ads API endpoints with rate limiting
router.get('/meta/campaigns', authMiddleware_1.protect, rateLimiter_1.metaLimiter, adController_1.getCampaigns);
router.get('/meta/adsets', authMiddleware_1.protect, rateLimiter_1.metaLimiter, adController_1.getAdSets);
router.get('/meta/ads', authMiddleware_1.protect, rateLimiter_1.metaLimiter, adController_1.getAds);
router.get('/meta/insights', authMiddleware_1.protect, rateLimiter_1.metaLimiter, adController_1.getInsights);
router.post('/meta/test', authMiddleware_1.protect, rateLimiter_1.metaLimiter, adController_1.testConnection);
// Campaign sync and insights
router.post('/meta/sync-campaigns', authMiddleware_1.protect, rateLimiter_1.metaLimiter, adController_1.syncCampaigns);
router.get('/meta/campaigns/:campaignId/insights', authMiddleware_1.protect, rateLimiter_1.metaLimiter, adController_1.getCampaignInsights);
router.get('/meta/account/insights', authMiddleware_1.protect, rateLimiter_1.metaLimiter, adController_1.getAccountInsights);
// New Ad Creation Endpoints
router.post('/meta/campaigns', authMiddleware_1.protect, rateLimiter_1.metaLimiter, adController_1.createFullAd);
router.post('/meta/images', authMiddleware_1.protect, rateLimiter_1.metaLimiter, adController_1.uploadAdImage);
exports.default = router;
