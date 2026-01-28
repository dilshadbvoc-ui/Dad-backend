import express from 'express';
import { getCheckIns, createCheckIn } from '../controllers/checkInController';
import { protect } from '../middleware/authMiddleware';

const router = express.Router();

router.get('/', protect, getCheckIns);
router.post('/', protect, createCheckIn);

export default router;
