
import express from 'express';
import { globalSearch } from '../controllers/searchController';
import { protect } from '../middleware/authMiddleware';

const router = express.Router();

router.get('/', protect, globalSearch);

export default router;
