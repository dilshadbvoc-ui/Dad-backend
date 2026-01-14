"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const customFieldController_1 = require("../controllers/customFieldController");
const authMiddleware_1 = require("../middleware/authMiddleware");
const router = express_1.default.Router();
router.get('/', authMiddleware_1.protect, customFieldController_1.getCustomFields);
router.post('/', authMiddleware_1.protect, customFieldController_1.createCustomField);
router.put('/:id', authMiddleware_1.protect, customFieldController_1.updateCustomField);
router.delete('/:id', authMiddleware_1.protect, customFieldController_1.deleteCustomField);
exports.default = router;
