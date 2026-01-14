"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const goalController_1 = require("../controllers/goalController");
const authMiddleware_1 = require("../middleware/authMiddleware");
const router = express_1.default.Router();
router.get('/', authMiddleware_1.protect, goalController_1.getGoals);
router.post('/', authMiddleware_1.protect, goalController_1.createGoal);
router.put('/:id', authMiddleware_1.protect, goalController_1.updateGoal);
router.delete('/:id', authMiddleware_1.protect, goalController_1.deleteGoal);
exports.default = router;
