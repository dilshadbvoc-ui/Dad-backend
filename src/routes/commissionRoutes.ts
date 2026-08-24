
import express from 'express';
import { getCommissions, createCommission, updateCommission, deleteCommission } from '../controllers/commissionController';
import { protect, admin } from '../middleware/authMiddleware';

const router = express.Router();

// Reading is open to any authenticated user — getCommissions itself restricts
// non-admins to their own records. Creating/editing/deleting a commission is
// an admin-only action; the "admin-only" nav link was previously cosmetic
// only, with no enforcement on the actual API.
router.get('/', protect, getCommissions);
router.post('/', protect, admin, createCommission);
router.put('/:id', protect, admin, updateCommission);
router.delete('/:id', protect, admin, deleteCommission);

export default router;
