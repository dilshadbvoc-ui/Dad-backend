"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const commissionController_1 = require("../controllers/commissionController");
const authMiddleware_1 = require("../middleware/authMiddleware");
const router = express_1.default.Router();
router.get('/', authMiddleware_1.protect, commissionController_1.getCommissions);
router.post('/', authMiddleware_1.protect, commissionController_1.createCommission);
router.put('/:id', authMiddleware_1.protect, commissionController_1.updateCommission);
router.delete('/:id', authMiddleware_1.protect, commissionController_1.deleteCommission);
exports.default = router;
