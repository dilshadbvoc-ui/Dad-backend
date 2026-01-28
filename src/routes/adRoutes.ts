import express from 'express';
import { protect } from '../middleware/authMiddleware';
import { getCampaigns, getAdSets, getAds, getInsights } from '../controllers/adController';

const router = express.Router();

router.get('/meta/campaigns', protect, getCampaigns);
router.get('/meta/adsets', protect, getAdSets);
router.get('/meta/ads', protect, getAds);
router.get('/meta/insights', protect, getInsights);

export default router;
