"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const leadController_1 = require("../controllers/leadController");
const authMiddleware_1 = require("../middleware/authMiddleware");
const subscriptionMiddleware_1 = require("../middleware/subscriptionMiddleware");
const router = express_1.default.Router();
router.post('/bulk', authMiddleware_1.protect, leadController_1.createBulkLeads);
router.post('/bulk-assign', authMiddleware_1.protect, leadController_1.bulkAssignLeads);
router.get('/violations', authMiddleware_1.protect, leadController_1.getViolations); // New Route
router.post('/explanation', authMiddleware_1.protect, leadController_1.submitExplanation); // New Route
router.get('/pending-follow-ups', authMiddleware_1.protect, leadController_1.getPendingFollowUpsCount);
router.get('/re-enquiries', authMiddleware_1.protect, authMiddleware_1.admin, leadController_1.getReEnquiryLeads); // Admin only
router.get('/duplicates', authMiddleware_1.protect, authMiddleware_1.admin, leadController_1.getDuplicateLeads); // Admin only
router.get('/', authMiddleware_1.protect, leadController_1.getLeads);
router.post('/', authMiddleware_1.protect, (0, subscriptionMiddleware_1.checkPlanLimits)('leads'), leadController_1.createLead);
router.get('/:id', authMiddleware_1.protect, leadController_1.getLeadById);
router.get('/:id/history', authMiddleware_1.protect, leadController_1.getLeadHistory);
router.put('/:id', authMiddleware_1.protect, leadController_1.updateLead);
router.post('/:id/generate-response', authMiddleware_1.protect, leadController_1.generateAIResponse); // New
router.post('/:id/convert', authMiddleware_1.protect, leadController_1.convertLead);
router.delete('/:id', authMiddleware_1.protect, leadController_1.deleteLead);
exports.default = router;
