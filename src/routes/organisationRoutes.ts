import express from 'express';
import { createOrganisation, getAllOrganisations, getOrganisation, updateOrganisation } from '../controllers/organisationController';
import { protect } from '../middleware/authMiddleware';

const router = express.Router();

router.post('/', protect, createOrganisation);
router.get('/all', protect, getAllOrganisations);
router.get('/:id', protect, getOrganisation);
router.put('/:id', protect, updateOrganisation);
router.get('/', protect, getOrganisation);
router.put('/', protect, updateOrganisation);

export default router;
