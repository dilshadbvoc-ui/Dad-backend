import express from 'express';
import { protect } from '../middleware/authMiddleware';
import {
    getCustomEmailStatus,
    connectCustomEmail,
    disconnectCustomEmail,
} from '../controllers/customEmailController';

const router = express.Router();

router.use(protect);

router.get('/status', getCustomEmailStatus);
router.post('/connect', connectCustomEmail);
router.post('/disconnect', disconnectCustomEmail);

export default router;
