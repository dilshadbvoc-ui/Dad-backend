"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const webFormController_1 = require("../controllers/webFormController");
const authMiddleware_1 = require("../middleware/authMiddleware");
const router = express_1.default.Router();
router.get('/', authMiddleware_1.protect, webFormController_1.getWebForms);
router.post('/', authMiddleware_1.protect, webFormController_1.createWebForm);
router.put('/:id', authMiddleware_1.protect, webFormController_1.updateWebForm);
router.delete('/:id', authMiddleware_1.protect, webFormController_1.deleteWebForm);
exports.default = router;
