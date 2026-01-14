"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const interactionController_1 = require("../controllers/interactionController");
const authMiddleware_1 = require("../middleware/authMiddleware");
const router = express_1.default.Router();
// Lead-specific interactions
router.post('/leads/:leadId/interactions', authMiddleware_1.protect, interactionController_1.createInteraction);
router.get('/leads/:leadId/interactions', authMiddleware_1.protect, interactionController_1.getLeadInteractions);
// Quick log for WhatsApp/Call button clicks
router.post('/leads/:leadId/quick-log', authMiddleware_1.protect, interactionController_1.logQuickInteraction);
// Update interaction with recording (for mobile app)
router.put('/interactions/:id/recording', authMiddleware_1.protect, interactionController_1.updateInteractionRecording);
exports.default = router;
