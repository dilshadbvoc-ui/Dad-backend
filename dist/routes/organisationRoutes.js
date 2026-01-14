"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const organisationController_1 = require("../controllers/organisationController");
const authMiddleware_1 = require("../middleware/authMiddleware");
const router = express_1.default.Router();
router.post('/', authMiddleware_1.protect, organisationController_1.createOrganisation);
router.get('/all', authMiddleware_1.protect, organisationController_1.getAllOrganisations);
router.get('/:id', authMiddleware_1.protect, organisationController_1.getOrganisation);
router.put('/:id', authMiddleware_1.protect, organisationController_1.updateOrganisation);
router.get('/', authMiddleware_1.protect, organisationController_1.getOrganisation);
router.put('/', authMiddleware_1.protect, organisationController_1.updateOrganisation);
exports.default = router;
