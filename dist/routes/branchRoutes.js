"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const authMiddleware_1 = require("../middleware/authMiddleware");
const branchController_1 = require("../controllers/branchController");
const router = express_1.default.Router();
router.route('/')
    .get(authMiddleware_1.protect, branchController_1.getBranches)
    .post(authMiddleware_1.protect, branchController_1.createBranch);
router.route('/:id')
    .put(authMiddleware_1.protect, branchController_1.updateBranch)
    .delete(authMiddleware_1.protect, branchController_1.deleteBranch);
exports.default = router;
