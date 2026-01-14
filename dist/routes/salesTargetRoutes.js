"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const salesTargetController_1 = require("../controllers/salesTargetController");
const authMiddleware_1 = require("../middleware/authMiddleware");
const router = express_1.default.Router();
// Get my targets
router.get('/', authMiddleware_1.protect, salesTargetController_1.getMyTargets);
// Get team targets (hierarchy view)
router.get('/team', authMiddleware_1.protect, salesTargetController_1.getTeamTargets);
// Get daily achievement for notification
router.get('/daily', authMiddleware_1.protect, salesTargetController_1.getDailyAchievement);
router.post('/daily/acknowledge', authMiddleware_1.protect, salesTargetController_1.acknowledgeDailyNotification);
// Get subordinates for assignment dropdown
router.get('/subordinates', authMiddleware_1.protect, salesTargetController_1.getSubordinates);
// Assign target to subordinate
router.post('/', authMiddleware_1.protect, salesTargetController_1.assignTarget);
// Recalculate progress from opportunities
router.post('/recalculate', authMiddleware_1.protect, salesTargetController_1.recalculateProgress);
// Delete target
router.delete('/:id', authMiddleware_1.protect, salesTargetController_1.deleteTarget);
exports.default = router;
