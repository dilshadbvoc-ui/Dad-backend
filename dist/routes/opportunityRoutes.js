"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const opportunityController_1 = require("../controllers/opportunityController");
const authMiddleware_1 = require("../middleware/authMiddleware");
const router = express_1.default.Router();
router.get('/', authMiddleware_1.protect, opportunityController_1.getOpportunities);
router.post('/', authMiddleware_1.protect, opportunityController_1.createOpportunity);
router.get('/:id', authMiddleware_1.protect, opportunityController_1.getOpportunityById);
router.put('/:id', authMiddleware_1.protect, opportunityController_1.updateOpportunity);
router.delete('/:id', authMiddleware_1.protect, opportunityController_1.deleteOpportunity);
exports.default = router;
