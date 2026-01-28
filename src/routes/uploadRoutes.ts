
import express from 'express';
import multer from 'multer';
import path from 'path';
import { protect } from '../middleware/authMiddleware';
import { uploadCallRecording, logCallWithoutRecording } from '../controllers/uploadController';
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

// Multer Storage Configuration for Images
const imageStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadPath = path.join(__dirname, '../../uploads/images');
        // Ensure directory exists
        if (!fs.existsSync(uploadPath)) {
            fs.mkdirSync(uploadPath, { recursive: true });
        }
        cb(null, uploadPath);
    },
    filename: (req, file, cb) => {
        // Filename: img-timestamp-originalName
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        cb(null, `img-${uniqueSuffix}${ext}`);
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 50 * 1024 * 1024 } // 50MB limit
});

const uploadImage = multer({
    storage: imageStorage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Only image files are allowed!'));
        }
    }
});

// Route: POST /api/upload/call-recording
router.post('/call-recording', protect, upload.single('recording'), uploadCallRecording);

// Route: POST /api/upload/log-call (for calls without recordings - Android 14/15 restriction)
router.post('/log-call', protect, logCallWithoutRecording);

// Route: POST /api/upload/image
import { uploadGenericImage } from '../controllers/uploadController';
router.post('/image', protect, uploadImage.single('image'), uploadGenericImage);

export default router;
