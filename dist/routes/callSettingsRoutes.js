"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const callSettingsController_1 = require("../controllers/callSettingsController");
const authMiddleware_1 = require("../middleware/authMiddleware");
const router = express_1.default.Router();
router.route('/').get(authMiddleware_1.protect, callSettingsController_1.getCallSettings);
router.route('/').put(authMiddleware_1.protect, callSettingsController_1.updateCallSettings);
exports.default = router;
