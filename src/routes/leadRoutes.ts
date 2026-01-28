import express from 'express';
import { getLeads, createLead, getLeadById, updateLead, deleteLead, createBulkLeads, bulkAssignLeads, convertLead, getViolations, submitExplanation, getLeadHistory, getPendingFollowUpsCount } from '../controllers/leadController';
import { protect } from '../middleware/authMiddleware';

const router = express.Router();


router.post('/bulk', protect, createBulkLeads as any);
router.post('/bulk-assign', protect, bulkAssignLeads as any);
router.get('/violations', protect, getViolations as any); // New Route
router.post('/explanation', protect, submitExplanation as any); // New Route
router.get('/pending-follow-ups', protect, getPendingFollowUpsCount as any);
router.get('/', protect, getLeads as any);
router.post('/', protect, createLead as any);
router.get('/:id', protect, getLeadById as any);
router.get('/:id/history', protect, getLeadHistory as any);
router.put('/:id', protect, updateLead as any);
router.post('/:id/convert', protect, convertLead as any);
router.delete('/:id', protect, deleteLead as any);

export default router;
