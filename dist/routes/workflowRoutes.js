"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const workflowController_1 = require("../controllers/workflowController");
const authMiddleware_1 = require("../middleware/authMiddleware");
const router = express_1.default.Router();
router.get('/', authMiddleware_1.protect, workflowController_1.getWorkflows);
router.post('/', authMiddleware_1.protect, workflowController_1.createWorkflow);
router.get('/:id', authMiddleware_1.protect, workflowController_1.getWorkflowById);
router.put('/:id', authMiddleware_1.protect, workflowController_1.updateWorkflow);
router.delete('/:id', authMiddleware_1.protect, workflowController_1.deleteWorkflow);
router.post('/:id/run', authMiddleware_1.protect, workflowController_1.runWorkflow);
exports.default = router;
