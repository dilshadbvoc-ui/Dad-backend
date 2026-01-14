"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const webhookController_1 = require("../controllers/webhookController");
const authMiddleware_1 = require("../middleware/authMiddleware");
const MetaIntegrationService_1 = require("../services/MetaIntegrationService");
const router = express_1.default.Router();
router.get('/', authMiddleware_1.protect, webhookController_1.getWebhooks);
router.post('/', authMiddleware_1.protect, webhookController_1.createWebhook);
router.put('/:id', authMiddleware_1.protect, webhookController_1.updateWebhook);
router.delete('/:id', authMiddleware_1.protect, webhookController_1.deleteWebhook);
// Meta Integration Routes (Public)
router.get('/meta', (req, res) => MetaIntegrationService_1.MetaIntegrationService.verifyWebhook(req, res));
router.post('/meta', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    // Send 200 OK immediately to acknowledge receipt to Meta
    res.sendStatus(200);
    try {
        yield MetaIntegrationService_1.MetaIntegrationService.handleWebhook(req.body);
    }
    catch (error) {
        console.error('Error processing Meta webhook:', error);
    }
}));
exports.default = router;
