"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const profileController_1 = require("../controllers/profileController");
const authMiddleware_1 = require("../middleware/authMiddleware");
const router = express_1.default.Router();
router.get('/', authMiddleware_1.protect, profileController_1.getProfile);
router.put('/', authMiddleware_1.protect, profileController_1.updateProfile);
router.post('/change-password', authMiddleware_1.protect, profileController_1.changePassword);
exports.default = router;
