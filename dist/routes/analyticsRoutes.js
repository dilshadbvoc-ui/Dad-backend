"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const analyticsController_1 = require("../controllers/analyticsController");
const authMiddleware_1 = require("../middleware/authMiddleware");
const router = express_1.default.Router();
router.get('/dashboard', authMiddleware_1.protect, analyticsController_1.getDashboardStats);
router.get('/sales-chart', authMiddleware_1.protect, analyticsController_1.getSalesChartData);
router.get('/top-leads', authMiddleware_1.protect, analyticsController_1.getTopLeads);
router.get('/forecast', authMiddleware_1.protect, analyticsController_1.getSalesForecast);
router.get('/lead-sources', authMiddleware_1.protect, analyticsController_1.getLeadSourceAnalytics);
router.get('/insights', authMiddleware_1.protect, analyticsController_1.getAiInsights);
router.get('/overview', authMiddleware_1.protect, analyticsController_1.getDashboardStats); // Alias for reports page
exports.default = router;
