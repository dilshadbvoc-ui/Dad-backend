import express from 'express';
import {
    getDashboardStats,
    getSalesChartData,
    getTopLeads,
    getSalesForecast,
    getLeadSourceAnalytics,
    getAiInsights
} from '../controllers/analyticsController';
import { protect } from '../middleware/authMiddleware';

const router = express.Router();

router.get('/dashboard', protect, getDashboardStats);
router.get('/sales-chart', protect, getSalesChartData);
router.get('/top-leads', protect, getTopLeads);
router.get('/forecast', protect, getSalesForecast);
router.get('/lead-sources', protect, getLeadSourceAnalytics);
router.get('/insights', protect, getAiInsights);
router.get('/overview', protect, getDashboardStats); // Alias for reports page

export default router;
