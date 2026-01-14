"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const campaignController_1 = require("../controllers/campaignController");
const authMiddleware_1 = require("../middleware/authMiddleware");
const router = express_1.default.Router();
router.get('/', authMiddleware_1.protect, campaignController_1.getCampaigns);
router.post('/', authMiddleware_1.protect, campaignController_1.createCampaign);
router.get('/:id', authMiddleware_1.protect, campaignController_1.getCampaignById);
exports.default = router;
