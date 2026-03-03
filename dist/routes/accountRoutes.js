"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const accountController_1 = require("../controllers/accountController");
const authMiddleware_1 = require("../middleware/authMiddleware");
const router = express_1.default.Router();
router.route('/')
    .post(authMiddleware_1.protect, accountController_1.createAccount)
    .get(authMiddleware_1.protect, accountController_1.getAccounts);
router.route('/:id')
    .get(authMiddleware_1.protect, accountController_1.getAccountById)
    .put(authMiddleware_1.protect, accountController_1.updateAccount)
    .delete(authMiddleware_1.protect, accountController_1.deleteAccount);
router.route('/:accountId/products')
    .post(authMiddleware_1.protect, accountController_1.addAccountProduct)
    .get(authMiddleware_1.protect, accountController_1.getAccountProducts);
exports.default = router;
