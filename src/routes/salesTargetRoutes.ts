import express from 'express';
import {
    assignTarget,
    getMyTargets,
    getTeamTargets,
    getDailyAchievement,
    acknowledgeDailyNotification,
    recalculateProgress,
    deleteTarget,
    getSubordinates
} from '../controllers/salesTargetController';
import { protect } from '../middleware/authMiddleware';

const router = express.Router();

// Get my targets
router.get('/', protect, getMyTargets);

// Get team targets (hierarchy view)
router.get('/team', protect, getTeamTargets);

// Get daily achievement for notification
router.get('/daily', protect, getDailyAchievement);
router.post('/daily/acknowledge', protect, acknowledgeDailyNotification);

// Get subordinates for assignment dropdown
router.get('/subordinates', protect, getSubordinates);

// Assign target to subordinate
router.post('/', protect, assignTarget);

// Recalculate progress from opportunities
router.post('/recalculate', protect, recalculateProgress);

// Delete target
router.delete('/:id', protect, deleteTarget);

export default router;
