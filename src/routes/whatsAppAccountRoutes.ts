import express from 'express';
import {
    getWhatsAppAccounts,
    createWhatsAppAccount,
    updateWhatsAppAccount,
    deleteWhatsAppAccount,
    getWhatsAppIntegrationReport
} from '../controllers/whatsAppAccountController';
import { protect } from '../middleware/authMiddleware';

const router = express.Router();

router.get('/report', protect, getWhatsAppIntegrationReport);
router.get('/', protect, getWhatsAppAccounts);
router.post('/', protect, createWhatsAppAccount);
router.put('/:id', protect, updateWhatsAppAccount);
router.delete('/:id', protect, deleteWhatsAppAccount);

export default router;
