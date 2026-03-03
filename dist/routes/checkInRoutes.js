"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const authMiddleware_1 = require("../middleware/authMiddleware");
const checkInController_1 = require("../controllers/checkInController");
const router = express_1.default.Router();
router.use(authMiddleware_1.protect);
router.post('/', checkInController_1.createCheckIn);
router.get('/', checkInController_1.getCheckIns);
exports.default = router;
