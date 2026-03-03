"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const hierarchyController_1 = require("../controllers/hierarchyController");
const authMiddleware_1 = require("../middleware/authMiddleware");
const router = express_1.default.Router();
router.get('/', authMiddleware_1.protect, hierarchyController_1.getHierarchy);
router.put('/:id/reports-to', authMiddleware_1.protect, hierarchyController_1.updateReportsTo);
exports.default = router;
