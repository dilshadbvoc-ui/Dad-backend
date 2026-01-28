import express from 'express';
import { getUsers, getUserById, updateUser, inviteUser, deactivateUser, getUserStats } from '../controllers/userController';
import { protect } from '../middleware/authMiddleware';

const router = express.Router();

router.get('/', protect, getUsers);
router.get('/:id', protect, getUserById);
router.get('/:id/stats', protect, getUserStats);
router.put('/:id', protect, updateUser);
router.post('/invite', protect, inviteUser);
router.post('/:id/deactivate', protect, deactivateUser);

export default router;
