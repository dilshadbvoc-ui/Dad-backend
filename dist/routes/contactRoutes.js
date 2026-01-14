"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const contactController_1 = require("../controllers/contactController");
const authMiddleware_1 = require("../middleware/authMiddleware");
const router = express_1.default.Router();
router.get('/', authMiddleware_1.protect, contactController_1.getContacts);
router.post('/', authMiddleware_1.protect, contactController_1.createContact);
router.get('/:id', authMiddleware_1.protect, contactController_1.getContactById);
router.put('/:id', authMiddleware_1.protect, contactController_1.updateContact);
router.delete('/:id', authMiddleware_1.protect, contactController_1.deleteContact);
exports.default = router;
