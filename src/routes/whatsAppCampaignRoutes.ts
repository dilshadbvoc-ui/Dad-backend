
import express from 'express';
import { getWhatsAppCampaigns, createWhatsAppCampaign, updateWhatsAppCampaign, deleteWhatsAppCampaign } from '../controllers/whatsAppCampaignController';
import { protect } from '../middleware/authMiddleware';

const router = express.Router();

router.get('/', protect, getWhatsAppCampaigns);
router.post('/', protect, createWhatsAppCampaign);
router.put('/:id', protect, updateWhatsAppCampaign);
router.delete('/:id', protect, deleteWhatsAppCampaign);

export default router;
