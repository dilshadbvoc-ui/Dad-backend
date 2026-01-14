"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const superAdminController_1 = require("../controllers/superAdminController");
const organisationController_1 = require("../controllers/organisationController");
const subscriptionPlanController_1 = require("../controllers/subscriptionPlanController");
const authMiddleware_1 = require("../middleware/authMiddleware");
const router = express_1.default.Router();
// Organisation Management
router.get('/organisations', authMiddleware_1.protect, superAdminController_1.getAllOrganisations);
router.post('/organisations', authMiddleware_1.protect, superAdminController_1.createOrganisation);
router.put('/organisations/:id', authMiddleware_1.protect, superAdminController_1.updateOrganisationAdmin);
router.delete('/organisations/:id', authMiddleware_1.protect, organisationController_1.deleteOrganisation); // Added
router.post('/organisations/:id/suspend', authMiddleware_1.protect, superAdminController_1.suspendOrganisation);
// License Plans Management
router.get('/plans', authMiddleware_1.protect, subscriptionPlanController_1.getPlans);
router.post('/plans', authMiddleware_1.protect, subscriptionPlanController_1.createPlan);
router.put('/plans/:id', authMiddleware_1.protect, subscriptionPlanController_1.updatePlan);
router.delete('/plans/:id', authMiddleware_1.protect, subscriptionPlanController_1.deletePlan);
router.get('/stats', authMiddleware_1.protect, superAdminController_1.getOrganisationStats);
exports.default = router;
