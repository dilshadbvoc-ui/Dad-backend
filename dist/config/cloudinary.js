"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.cloudinaryRecordingStorage = exports.cloudinaryDocumentStorage = exports.cloudinaryImageStorage = exports.isCloudinaryConfigured = void 0;
const cloudinary_1 = require("cloudinary");
const multer_storage_cloudinary_1 = require("multer-storage-cloudinary");
// Configure Cloudinary
cloudinary_1.v2.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});
// Check if Cloudinary is configured
const isCloudinaryConfigured = () => {
    return !!(process.env.CLOUDINARY_CLOUD_NAME &&
        process.env.CLOUDINARY_API_KEY &&
        process.env.CLOUDINARY_API_SECRET);
};
exports.isCloudinaryConfigured = isCloudinaryConfigured;
// Cloudinary storage for images
exports.cloudinaryImageStorage = new multer_storage_cloudinary_1.CloudinaryStorage({
    cloudinary: cloudinary_1.v2,
    params: {
        folder: 'crm/images',
        allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'webp'],
        transformation: [{ width: 500, height: 500, crop: 'limit' }],
    },
});
// Cloudinary storage for documents
exports.cloudinaryDocumentStorage = new multer_storage_cloudinary_1.CloudinaryStorage({
    cloudinary: cloudinary_1.v2,
    params: {
        folder: 'crm/documents',
        allowed_formats: ['pdf', 'doc', 'docx', 'jpg', 'jpeg', 'png'],
        resource_type: 'auto',
    },
});
// Cloudinary storage for recordings
exports.cloudinaryRecordingStorage = new multer_storage_cloudinary_1.CloudinaryStorage({
    cloudinary: cloudinary_1.v2,
    params: {
        folder: 'crm/recordings',
        allowed_formats: ['mp3', 'wav', 'ogg', 'm4a', 'webm'],
        resource_type: 'video', // audio files are stored as video resource type
    },
});
exports.default = cloudinary_1.v2;
