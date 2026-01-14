import express from 'express';
import { getGoals, createGoal, updateGoal, deleteGoal } from '../controllers/goalController';
import { protect } from '../middleware/authMiddleware';

const router = express.Router();

router.get('/', protect, getGoals);
router.post('/', protect, createGoal);
router.put('/:id', protect, updateGoal);
router.delete('/:id', protect, deleteGoal);

export default router;
