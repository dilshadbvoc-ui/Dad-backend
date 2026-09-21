import express from 'express';
import {
    getWhatsAppAssignmentRules,
    createWhatsAppAssignmentRule,
    updateWhatsAppAssignmentRule,
    deleteWhatsAppAssignmentRule
} from '../controllers/whatsAppAssignmentRuleController';
import { protect } from '../middleware/authMiddleware';

const router = express.Router();

router.get('/', protect, getWhatsAppAssignmentRules);
router.post('/', protect, createWhatsAppAssignmentRule);
router.put('/:id', protect, updateWhatsAppAssignmentRule);
router.delete('/:id', protect, deleteWhatsAppAssignmentRule);

export default router;
