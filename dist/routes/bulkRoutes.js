"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const authMiddleware_1 = require("../middleware/authMiddleware");
const bulkOperationsController_1 = require("../controllers/bulkOperationsController");
const router = express_1.default.Router();
/**
 * @route POST /api/bulk/leads
 * @desc Perform bulk operations on leads (assign, status, tags, email, whatsapp, delete, export)
 * @access Private
 */
router.post('/leads', authMiddleware_1.protect, bulkOperationsController_1.bulkLeadOperations);
/**
 * @route POST /api/bulk/contacts
 * @desc Perform bulk operations on contacts (assign, add-to-campaign, delete, export)
 * @access Private
 */
router.post('/contacts', authMiddleware_1.protect, bulkOperationsController_1.bulkContactOperations);
/**
 * @route POST /api/bulk/opportunities
 * @desc Perform bulk operations on opportunities (update-stage, assign, delete, export)
 * @access Private
 */
router.post('/opportunities', authMiddleware_1.protect, bulkOperationsController_1.bulkOpportunityOperations);
exports.default = router;
