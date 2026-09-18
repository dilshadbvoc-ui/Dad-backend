import express from 'express';
import { protect } from '../middleware/authMiddleware';
import { chatWithTrainingAssistant } from '../controllers/trainingChatController';

const router = express.Router();

router.post('/chat', protect, chatWithTrainingAssistant);

export default router;
