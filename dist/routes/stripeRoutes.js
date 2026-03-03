"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const authMiddleware_1 = require("../middleware/authMiddleware");
const stripeController_1 = require("../controllers/stripeController");
const router = express_1.default.Router();
// Webhook must be raw body, so we might need special handling in index.ts or here
// For now, defining the route. 
router.post('/webhook', express_1.default.raw({ type: 'application/json' }), stripeController_1.handleWebhook);
router.post('/create-checkout-session', authMiddleware_1.protect, stripeController_1.createCheckoutSession);
router.post('/create-portal-session', authMiddleware_1.protect, stripeController_1.createPortalSession);
exports.default = router;
