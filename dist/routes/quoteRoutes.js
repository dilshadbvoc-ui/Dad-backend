"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const quoteController_1 = require("../controllers/quoteController");
const authMiddleware_1 = require("../middleware/authMiddleware");
const router = express_1.default.Router();
router.get('/', authMiddleware_1.protect, quoteController_1.getQuotes);
router.post('/', authMiddleware_1.protect, quoteController_1.createQuote);
router.get('/:id', authMiddleware_1.protect, quoteController_1.getQuoteById);
router.put('/:id', authMiddleware_1.protect, quoteController_1.updateQuote);
router.delete('/:id', authMiddleware_1.protect, quoteController_1.deleteQuote);
exports.default = router;
