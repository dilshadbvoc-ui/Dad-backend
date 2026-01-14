"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const accountController_1 = require("../controllers/accountController");
const authMiddleware_1 = require("../middleware/authMiddleware");
const router = express_1.default.Router();
router.get('/', authMiddleware_1.protect, accountController_1.getAccounts);
router.post('/', authMiddleware_1.protect, accountController_1.createAccount);
router.get('/:id', authMiddleware_1.protect, accountController_1.getAccountById);
router.put('/:id', authMiddleware_1.protect, accountController_1.updateAccount);
router.delete('/:id', authMiddleware_1.protect, accountController_1.deleteAccount);
exports.default = router;
