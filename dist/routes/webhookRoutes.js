"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const webhookController_1 = require("../controllers/webhookController");
const authMiddleware_1 = require("../middleware/authMiddleware");
const router = express_1.default.Router();
router.use(authMiddleware_1.protect);
router.use((0, authMiddleware_1.authorize)('super_admin', 'admin', 'manager')); // Restrict to admin/manager
router.route('/')
    .get(webhookController_1.getWebhooks)
    .post(webhookController_1.createWebhook);
router.route('/:id')
    .put(webhookController_1.updateWebhook)
    .delete(webhookController_1.deleteWebhook);
exports.default = router;
