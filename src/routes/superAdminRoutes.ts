import express from 'express';
import {
    getAllOrganisations,
    createOrganisation,
    updateOrganisationAdmin,
    suspendOrganisation,
    getOrganisationStats
} from '../controllers/superAdminController';
import { deleteOrganisation } from '../controllers/organisationController';
import {
    getPlans,
    createPlan,
    updatePlan,
    deletePlan
} from '../controllers/subscriptionPlanController';
import { protect } from '../middleware/authMiddleware';

const router = express.Router();

// Organisation Management
router.get('/organisations', protect, getAllOrganisations);
router.post('/organisations', protect, createOrganisation);
router.put('/organisations/:id', protect, updateOrganisationAdmin);
router.delete('/organisations/:id', protect, deleteOrganisation); // Added
router.post('/organisations/:id/suspend', protect, suspendOrganisation);

// License Plans Management
router.get('/plans', protect, getPlans);
router.post('/plans', protect, createPlan);
router.put('/plans/:id', protect, updatePlan);
router.delete('/plans/:id', protect, deletePlan);

router.get('/stats', protect, getOrganisationStats);

export default router;
