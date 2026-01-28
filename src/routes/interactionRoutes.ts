import express from 'express';
import {
    createInteraction,
    getLeadInteractions,
    getAllInteractions,
    updateInteractionRecording,
    logQuickInteraction
} from '../controllers/interactionController';
import { protect } from '../middleware/authMiddleware';

const router = express.Router();

// Lead-specific interactions
router.get('/', protect, getAllInteractions); // Fixes 404 for /api/interactions
router.post('/leads/:leadId/interactions', protect, createInteraction);
router.get('/leads/:leadId/interactions', protect, getLeadInteractions);

// Quick log for WhatsApp/Call button clicks
router.post('/leads/:leadId/quick-log', protect, logQuickInteraction);

// Update interaction with recording (for mobile app)
router.put('/interactions/:id/recording', protect, updateInteractionRecording);

export default router;
