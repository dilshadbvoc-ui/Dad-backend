"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const apiKeyController_1 = require("../controllers/apiKeyController");
const authMiddleware_1 = require("../middleware/authMiddleware");
const router = express_1.default.Router();
router.get('/', authMiddleware_1.protect, apiKeyController_1.getApiKeys);
router.post('/', authMiddleware_1.protect, apiKeyController_1.createApiKey);
router.post('/:id/revoke', authMiddleware_1.protect, apiKeyController_1.revokeApiKey);
router.delete('/:id', authMiddleware_1.protect, apiKeyController_1.deleteApiKey);
exports.default = router;
