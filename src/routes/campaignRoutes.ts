import express from 'express';
import { getCampaigns, createCampaign, getCampaignById, updateCampaign, deleteCampaign } from '../controllers/campaignController';
import { protect } from '../middleware/authMiddleware';

const router = express.Router();

router.get('/', protect, getCampaigns);
router.post('/', protect, createCampaign);
router.get('/:id', protect, getCampaignById);
router.put('/:id', protect, updateCampaign);
router.delete('/:id', protect, deleteCampaign);

export default router;

