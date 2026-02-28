import express from 'express';
import { getFollowUps, updateFollowUp } from '../controllers/followUpController';
import { protect } from '../middleware/authMiddleware';

const router = express.Router();

router.get('/', protect, getFollowUps);
router.put('/:id', protect, updateFollowUp);

export default router;
