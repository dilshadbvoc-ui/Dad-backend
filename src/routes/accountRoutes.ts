import express from 'express';
import { getAccounts, createAccount, getAccountById, updateAccount, deleteAccount } from '../controllers/accountController';
import { protect } from '../middleware/authMiddleware';

const router = express.Router();

router.get('/', protect, getAccounts);
router.post('/', protect, createAccount);
router.get('/:id', protect, getAccountById);
router.put('/:id', protect, updateAccount);
router.delete('/:id', protect, deleteAccount);

export default router;
