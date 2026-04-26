import { Router } from 'express';
import { getTrashItems, restoreItem, permanentDelete } from '../controllers/trashController';
import { protect, authorize } from '../middleware/authMiddleware';

const router = Router();

// Protect all routes and only allow Org Admins
router.use(protect);
router.use(authorize('org_admin', 'admin', 'super_admin'));

router.get('/', getTrashItems);
router.post('/restore', restoreItem);
router.delete('/permanent', permanentDelete);

export default router;
