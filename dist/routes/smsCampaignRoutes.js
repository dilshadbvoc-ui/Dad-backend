"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const smsCampaignController_1 = require("../controllers/smsCampaignController");
const authMiddleware_1 = require("../middleware/authMiddleware");
const router = express_1.default.Router();
router.get('/', authMiddleware_1.protect, smsCampaignController_1.getSMSCampaigns);
router.post('/', authMiddleware_1.protect, smsCampaignController_1.createSMSCampaign);
router.put('/:id', authMiddleware_1.protect, smsCampaignController_1.updateSMSCampaign);
router.delete('/:id', authMiddleware_1.protect, smsCampaignController_1.deleteSMSCampaign);
exports.default = router;
