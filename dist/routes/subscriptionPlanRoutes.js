"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const subscriptionPlanController_1 = require("../controllers/subscriptionPlanController");
const authMiddleware_1 = require("../middleware/authMiddleware");
const router = express_1.default.Router();
router.get('/', subscriptionPlanController_1.getPlans); // Public - anyone can see plans
router.post('/', authMiddleware_1.protect, subscriptionPlanController_1.createPlan); // Admin only
router.put('/:id', authMiddleware_1.protect, subscriptionPlanController_1.updatePlan);
router.delete('/:id', authMiddleware_1.protect, subscriptionPlanController_1.deletePlan);
exports.default = router;
