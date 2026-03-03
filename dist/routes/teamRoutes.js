"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const authMiddleware_1 = require("../middleware/authMiddleware");
const teamController_1 = require("../controllers/teamController");
const router = express_1.default.Router();
router.route('/')
    .post(authMiddleware_1.protect, teamController_1.createTeam)
    .get(authMiddleware_1.protect, teamController_1.getTeams);
router.route('/:id')
    .get(authMiddleware_1.protect, teamController_1.getTeam)
    .put(authMiddleware_1.protect, teamController_1.updateTeam)
    .delete(authMiddleware_1.protect, teamController_1.deleteTeam);
exports.default = router;
