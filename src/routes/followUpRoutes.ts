import express from 'express';
import { getFollowUps } from '../controllers/followUpController';
import { protect } from '../middleware/authMiddleware';

const router = express.Router();

router.get('/', protect, getFollowUps);

export default router;
