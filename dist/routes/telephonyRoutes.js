"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const telephonyController_1 = require("../controllers/telephonyController");
const authMiddleware_1 = require("../middleware/authMiddleware");
const router = express_1.default.Router();
// Public webhooks (Twilio needs to access these from outside)
// Ideally secured by validating Twilio signature middleware, keeping simple for now.
router.post('/webhook/voice', telephonyController_1.handleVoiceWebhook);
router.post('/webhook/status', telephonyController_1.handleStatusWebhook);
// Protected routes for internal use
const telephonyController_2 = require("../controllers/telephonyController");
router.post('/outbound', authMiddleware_1.protect, telephonyController_2.makeOutboundCall);
exports.default = router;
