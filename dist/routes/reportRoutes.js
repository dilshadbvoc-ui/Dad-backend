"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const reportController_1 = require("../controllers/reportController");
const authMiddleware_1 = require("../middleware/authMiddleware");
const router = (0, express_1.Router)();
// All routes require authentication
router.use(authMiddleware_1.protect);
// Leads report with filtering
router.get('/leads', reportController_1.getLeadsReport);
// User performance metrics
router.get('/user-performance', reportController_1.getUserPerformance);
// Sales book with time period filter
router.get('/sales-book', reportController_1.getSalesBook);
// Export to Excel
router.get('/export/:type', reportController_1.exportToExcel);
exports.default = router;
