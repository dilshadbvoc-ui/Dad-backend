import express from 'express';
import {
    getFlows,
    getFlowById,
    createFlow,
    updateFlow,
    deleteFlow,
    getFlowSessions,
    testFlow
} from '../controllers/whatsAppFlowController';
import { protect } from '../middleware/authMiddleware';

const router = express.Router();

router.get('/', protect, getFlows);
router.post('/', protect, createFlow);
router.get('/:id', protect, getFlowById);
router.put('/:id', protect, updateFlow);
router.delete('/:id', protect, deleteFlow);
router.get('/:id/sessions', protect, getFlowSessions);
router.post('/:id/test', protect, testFlow);

export default router;
