"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const leadController_1 = require("../controllers/leadController");
const authMiddleware_1 = require("../middleware/authMiddleware");
const router = express_1.default.Router();
router.post('/bulk', authMiddleware_1.protect, leadController_1.createBulkLeads);
router.post('/bulk-assign', authMiddleware_1.protect, leadController_1.bulkAssignLeads);
router.get('/', authMiddleware_1.protect, leadController_1.getLeads);
router.post('/', authMiddleware_1.protect, leadController_1.createLead);
router.get('/:id', authMiddleware_1.protect, leadController_1.getLeadById);
router.put('/:id', authMiddleware_1.protect, leadController_1.updateLead);
router.post('/:id/convert', authMiddleware_1.protect, leadController_1.convertLead);
router.delete('/:id', authMiddleware_1.protect, leadController_1.deleteLead);
exports.default = router;
