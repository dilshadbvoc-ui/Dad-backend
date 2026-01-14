"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const emailListController_1 = require("../controllers/emailListController");
const authMiddleware_1 = require("../middleware/authMiddleware");
const router = express_1.default.Router();
router.get('/', authMiddleware_1.protect, emailListController_1.getEmailLists);
router.post('/', authMiddleware_1.protect, emailListController_1.createEmailList);
router.get('/:id', authMiddleware_1.protect, emailListController_1.getEmailListById);
router.delete('/:id', authMiddleware_1.protect, emailListController_1.deleteEmailList);
exports.default = router;
