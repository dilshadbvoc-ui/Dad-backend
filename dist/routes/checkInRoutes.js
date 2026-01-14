"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const checkInController_1 = require("../controllers/checkInController");
const authMiddleware_1 = require("../middleware/authMiddleware");
const router = express_1.default.Router();
router.get('/', authMiddleware_1.protect, checkInController_1.getCheckIns);
router.post('/', authMiddleware_1.protect, checkInController_1.createCheckIn);
exports.default = router;
