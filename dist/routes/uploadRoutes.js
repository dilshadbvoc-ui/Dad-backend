"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const multer_1 = __importDefault(require("multer"));
const authMiddleware_1 = require("../middleware/authMiddleware");
const uploadController_1 = require("../controllers/uploadController");
const router = express_1.default.Router();
// Memory Storage Configuration - stores files in memory as Buffer
const memoryStorage = multer_1.default.memoryStorage();
console.log(`📁 File storage: Database (Persistent)`);
// Cloudinary removed in favor of Database storage
// import { v2 as cloudinary } from 'cloudinary';
// import { CloudinaryStorage } from 'multer-storage-cloudinary';
const upload = (0, multer_1.default)({
    storage: memoryStorage,
    limits: { fileSize: 50 * 1024 * 1024 } // 50MB limit
});
const uploadImage = (0, multer_1.default)({
    storage: memoryStorage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        }
        else {
            cb(new Error('Only image files are allowed!'));
        }
    }
});
const uploadDocument = (0, multer_1.default)({
    storage: memoryStorage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'application/pdf' || file.mimetype.startsWith('image/')) {
            cb(null, true);
        }
        else {
            cb(new Error('Only PDF and image files are allowed!'));
        }
    }
});
// Route: POST /api/upload/call-recording
router.post('/call-recording', authMiddleware_1.protect, upload.single('recording'), uploadController_1.uploadCallRecording);
// Route: POST /api/upload/log-call (for calls without recordings - Android 14/15 restriction)
router.post('/log-call', authMiddleware_1.protect, uploadController_1.logCallWithoutRecording);
// Route: POST /api/upload/image
const uploadController_2 = require("../controllers/uploadController");
router.post('/image', authMiddleware_1.protect, uploadImage.single('image'), uploadController_2.uploadGenericImage);
// Route: POST /api/upload/document
router.post('/document', authMiddleware_1.protect, uploadDocument.single('document'), uploadController_2.uploadDocument);
// Error handling middleware for multer errors
router.use((err, req, res, next) => {
    if (err instanceof multer_1.default.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(413).json({
                message: 'File size exceeds the 5MB limit. Please upload a smaller file.',
                error: 'FILE_TOO_LARGE',
                maxSize: '5MB'
            });
        }
        return res.status(400).json({
            message: err.message,
            error: err.code
        });
    }
    if (err) {
        return res.status(400).json({
            message: err.message || 'File upload failed',
            error: 'UPLOAD_ERROR'
        });
    }
    next();
});
exports.default = router;
