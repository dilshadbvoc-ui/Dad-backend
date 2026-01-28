import express from 'express';
import { authUser, registerUser } from '../controllers/authController';
import { protect } from '../middleware/authMiddleware';

const router = express.Router();

router.post('/login', authUser);
router.post('/register', registerUser);

export default router;
