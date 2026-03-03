"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const documentController_1 = require("../controllers/documentController");
const authMiddleware_1 = require("../middleware/authMiddleware");
const router = express_1.default.Router();
// Download endpoint - no auth required for public shares, but we'll add auth for now
router.get('/:id/download', documentController_1.downloadDocument);
// All other routes require authentication
router.use(authMiddleware_1.protect);
// Get all documents (with optional filters)
router.get('/', documentController_1.getDocuments);
// Get single document
router.get('/:id', documentController_1.getDocumentById);
// Update document metadata
router.put('/:id', documentController_1.updateDocument);
// Delete document (soft delete)
router.delete('/:id', documentController_1.deleteDocument);
exports.default = router;
