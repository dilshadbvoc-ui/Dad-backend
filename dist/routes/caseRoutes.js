"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const caseController_1 = require("../controllers/caseController");
const authMiddleware_1 = require("../middleware/authMiddleware");
const router = express_1.default.Router();
router.get('/', authMiddleware_1.protect, caseController_1.getCases);
router.post('/', authMiddleware_1.protect, caseController_1.createCase);
router.get('/:id', authMiddleware_1.protect, caseController_1.getCaseById);
router.put('/:id', authMiddleware_1.protect, caseController_1.updateCase);
router.delete('/:id', authMiddleware_1.protect, caseController_1.deleteCase);
exports.default = router;
