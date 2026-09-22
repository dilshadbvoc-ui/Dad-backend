import express from 'express';
import { protect } from '../middleware/authMiddleware';
import {
    getAdAccounts,
    getCampaigns,
    createCampaign,
    getAdSets,
    getAds,
    updateCampaignStatus,
    updateAdSetStatus,
    updateAdSetBudget
} from '../controllers/marketingController';

const router = express.Router();

router.use(protect);

router.get('/ad-accounts', getAdAccounts);
router.get('/:adAccountId/campaigns', getCampaigns);
router.post('/:adAccountId/campaigns', createCampaign);
router.patch('/:adAccountId/campaigns/:campaignId', updateCampaignStatus);
router.get('/:adAccountId/campaigns/:campaignId/adsets', getAdSets);
router.get('/:adAccountId/campaigns/:campaignId/ads', getAds);
router.patch('/:adAccountId/adsets/:adSetId/status', updateAdSetStatus);
router.patch('/:adAccountId/adsets/:adSetId/budget', updateAdSetBudget);

export default router;
