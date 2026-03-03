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
const systemSettingsController_1 = require("../controllers/systemSettingsController");
const roleController_1 = require("../controllers/roleController");
const router = express_1.default.Router();
// System Settings
router.get('/settings', authMiddleware_1.protect, systemSettingsController_1.getSystemSettings);
router.put('/settings', authMiddleware_1.protect, systemSettingsController_1.updateSystemSettings);
// Organisation Management
router.get('/organisations', authMiddleware_1.protect, superAdminController_1.getAllOrganisations);
router.post('/organisations', authMiddleware_1.protect, superAdminController_1.createOrganisation);
router.put('/organisations/:id', authMiddleware_1.protect, superAdminController_1.updateOrganisationAdmin);
router.delete('/organisations/:id', authMiddleware_1.protect, organisationController_1.deleteOrganisation); // Soft delete
router.delete('/organisations/:id/permanent', authMiddleware_1.protect, organisationController_1.permanentlyDeleteOrganisation); // Permanent delete (super admin only)
router.post('/organisations/:id/restore', authMiddleware_1.protect, organisationController_1.restoreOrganisation); // Restore deleted org
router.post('/organisations/:id/suspend', authMiddleware_1.protect, superAdminController_1.suspendOrganisation);
// License Plans Management
router.get('/plans', authMiddleware_1.protect, subscriptionPlanController_1.getPlans);
router.post('/plans', authMiddleware_1.protect, subscriptionPlanController_1.createPlan);
router.put('/plans/:id', authMiddleware_1.protect, subscriptionPlanController_1.updatePlan);
router.delete('/plans/:id', authMiddleware_1.protect, subscriptionPlanController_1.deletePlan);
// Global Roles management (Super Admin)
router.get('/roles', authMiddleware_1.protect, roleController_1.getGlobalRoles);
router.post('/roles', authMiddleware_1.protect, roleController_1.upsertGlobalRole);
router.get('/stats', authMiddleware_1.protect, superAdminController_1.getOrganisationStats);
exports.default = router;
