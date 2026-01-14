import express from 'express';
import { getContacts, createContact, getContactById, updateContact, deleteContact } from '../controllers/contactController';
import { protect } from '../middleware/authMiddleware';

const router = express.Router();

router.get('/', protect, getContacts);
router.post('/', protect, createContact);
router.get('/:id', protect, getContactById);
router.put('/:id', protect, updateContact);
router.delete('/:id', protect, deleteContact);

export default router;
