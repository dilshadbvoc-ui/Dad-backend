import express from 'express';
import { getCampaigns, createCampaign, getCampaignById } from '../controllers/campaignController';
import { protect } from '../middleware/authMiddleware';

const router = express.Router();

router.get('/', protect, getCampaigns);
router.post('/', protect, createCampaign);
router.get('/:id', protect, getCampaignById);

export default router;
