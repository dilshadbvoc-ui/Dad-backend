
import express from 'express';
import multer from 'multer';
import path from 'path';
import { protect } from '../middleware/authMiddleware';
import { uploadCallRecording } from '../controllers/uploadController';
import fs from 'fs';

const router = express.Router();

// Multer Storage Configuration
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadPath = path.join(__dirname, '../../uploads/recordings');
        // Ensure directory exists
        if (!fs.existsSync(uploadPath)) {
            fs.mkdirSync(uploadPath, { recursive: true });
        }
        cb(null, uploadPath);
    },
    filename: (req, file, cb) => {
        // Filename: timestamp-phone-originalName
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        cb(null, `rec-${uniqueSuffix}${ext}`);
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 50 * 1024 * 1024 } // 50MB limit
});

// Route: POST /api/upload/call-recording
router.post('/call-recording', protect, upload.single('file'), uploadCallRecording);

export default router;
