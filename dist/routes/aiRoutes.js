"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const authMiddleware_1 = require("../middleware/authMiddleware");
const aiController_1 = require("../controllers/aiController");
const rateLimiter_1 = require("../middleware/rateLimiter");
const router = express_1.default.Router();
router.use(authMiddleware_1.protect);
// Apply rate limiting to prevent abuse
router.post('/generate', rateLimiter_1.generalLimiter, aiController_1.generateContent);
exports.default = router;
