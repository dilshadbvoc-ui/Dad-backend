
import express from 'express';
import { getLandingPages, createLandingPage, updateLandingPage, deleteLandingPage } from '../controllers/landingPageController';
import { protect } from '../middleware/authMiddleware';

const router = express.Router();

router.get('/', protect, getLandingPages);
router.post('/', protect, createLandingPage);
router.put('/:id', protect, updateLandingPage);
router.delete('/:id', protect, deleteLandingPage);

export default router;
