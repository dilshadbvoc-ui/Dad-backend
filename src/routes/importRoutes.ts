
import express from 'express';
import { importLeads } from '../controllers/importController';
import multer from 'multer';
import { protect } from '../middleware/authMiddleware';

const router = express.Router();
const upload = multer({ dest: 'uploads/' });

router.post('/leads', protect, upload.single('file'), importLeads);

export default router;
