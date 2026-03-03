"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const territoryController_1 = require("../controllers/territoryController");
const authMiddleware_1 = require("../middleware/authMiddleware");
const router = express_1.default.Router();
router.get('/', authMiddleware_1.protect, territoryController_1.getTerritories);
router.post('/', authMiddleware_1.protect, territoryController_1.createTerritory);
router.put('/:id', authMiddleware_1.protect, territoryController_1.updateTerritory);
router.delete('/:id', authMiddleware_1.protect, territoryController_1.deleteTerritory);
exports.default = router;
