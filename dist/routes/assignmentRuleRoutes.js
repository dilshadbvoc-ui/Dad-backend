"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const assignmentRuleController_1 = require("../controllers/assignmentRuleController");
const authMiddleware_1 = require("../middleware/authMiddleware");
const router = express_1.default.Router();
router.get('/types', authMiddleware_1.protect, assignmentRuleController_1.getRuleTypes);
router.get('/', authMiddleware_1.protect, assignmentRuleController_1.getAssignmentRules);
router.post('/', authMiddleware_1.protect, assignmentRuleController_1.createAssignmentRule);
router.put('/:id', authMiddleware_1.protect, assignmentRuleController_1.updateAssignmentRule);
router.delete('/:id', authMiddleware_1.protect, assignmentRuleController_1.deleteAssignmentRule);
exports.default = router;
