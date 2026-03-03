"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const authMiddleware_1 = require("../middleware/authMiddleware");
const searchController_1 = require("../controllers/searchController");
const router = express_1.default.Router();
// Apply authentication middleware to all search routes
router.use(authMiddleware_1.protect);
// Global search across all entities
router.get('/global', searchController_1.globalSearch);
// Search suggestions/autocomplete
router.get('/suggestions', searchController_1.searchSuggestions);
// Recent searches for user
router.get('/recent', searchController_1.recentSearches);
exports.default = router;
