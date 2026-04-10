import express from 'express';
import { getLeads, createLead, getLeadById, updateLead, deleteLead, createBulkLeads, bulkAssignLeads, convertLead, getViolations, submitExplanation, getLeadHistory, getPendingFollowUpsCount, generateAIResponse, getReEnquiryLeads, getDuplicateLeads, syncToGallabox } from '../controllers/leadController';
import { protect, admin } from '../middleware/authMiddleware';
import { checkPlanLimits } from '../middleware/subscriptionMiddleware';

const router = express.Router();


router.post('/bulk', protect, createBulkLeads as any);
router.post('/bulk-assign', protect, bulkAssignLeads as any);
router.get('/violations', protect, getViolations as any); // New Route
router.post('/explanation', protect, submitExplanation as any); // New Route
router.get('/pending-follow-ups', protect, getPendingFollowUpsCount as any);
router.get('/re-enquiries', protect, admin, getReEnquiryLeads as any); // Admin only
router.get('/duplicates', protect, admin, getDuplicateLeads as any); // Admin only
router.get('/', protect, getLeads as any);
router.post('/', protect, checkPlanLimits('leads'), createLead as any);
router.get('/:id', protect, getLeadById as any);
router.get('/:id/history', protect, getLeadHistory as any);
router.put('/:id', protect, updateLead as any);
router.post('/:id/generate-response', protect, generateAIResponse as any); // New
router.post('/:id/convert', protect, convertLead as any);
router.post('/:id/sync-gallabox', protect, syncToGallabox as any);
router.delete('/:id', protect, deleteLead as any);

export default router;
