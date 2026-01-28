import { Router } from 'express';
import { getLeadsReport, getUserPerformance, getSalesBook, exportToExcel } from '../controllers/reportController';
import { protect as authMiddleware } from '../middleware/authMiddleware';

const router = Router();

// All routes require authentication
router.use(authMiddleware);

// Leads report with filtering
router.get('/leads', getLeadsReport);

// User performance metrics
router.get('/user-performance', getUserPerformance);

// Sales book with time period filter
router.get('/sales-book', getSalesBook);

// Export to Excel
router.get('/export/:type', exportToExcel);

export default router;
