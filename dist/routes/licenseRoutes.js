"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const licenseController_1 = require("../controllers/licenseController");
const authMiddleware_1 = require("../middleware/authMiddleware");
const router = express_1.default.Router();
router.get('/', authMiddleware_1.protect, licenseController_1.getLicenses);
router.get('/current', authMiddleware_1.protect, licenseController_1.getCurrentLicense);
router.get('/check', authMiddleware_1.protect, licenseController_1.checkLicenseValidity);
router.post('/activate', authMiddleware_1.protect, licenseController_1.activateLicense);
router.post('/:id/cancel', authMiddleware_1.protect, licenseController_1.cancelLicense);
exports.default = router;
