"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const authMiddleware_1 = require("../middleware/authMiddleware");
const marketingController_1 = require("../controllers/marketingController");
const router = express_1.default.Router();
router.use(authMiddleware_1.protect);
router.get('/ad-accounts', marketingController_1.getAdAccounts);
router.get('/:adAccountId/campaigns', marketingController_1.getCampaigns);
router.post('/:adAccountId/campaigns', marketingController_1.createCampaign);
exports.default = router;
