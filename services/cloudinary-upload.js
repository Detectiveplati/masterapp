/**
 * Shared Cloudinary / Multer upload factory
 * Falls back to memory storage (file ignored) if Cloudinary is not configured.
 */
const multer = require('multer');

const isCloudinaryConfigured =
    process.env.CLOUDINARY_CLOUD_NAME &&
    process.env.CLOUDINARY_API_KEY &&
    process.env.CLOUDINARY_API_SECRET;

let cloudinary;
let CloudinaryStorage;

if (isCloudinaryConfigured) {
    cloudinary = require('cloudinary').v2;
    CloudinaryStorage = require('multer-storage-cloudinary').CloudinaryStorage;
    cloudinary.config({
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
        api_key:    process.env.CLOUDINARY_API_KEY,
        api_secret: process.env.CLOUDINARY_API_SECRET,
    });
    console.log('✓ [Cloudinary] Configured — photo uploads enabled');
} else {
    console.warn('⚠️  [Cloudinary] Not configured — photo uploads will be skipped');
}

/**
 * Create a multer upload middleware.
 * Uses Cloudinary when configured, otherwise memory storage (file discarded).
 * @param {string} folder  e.g. 'maintenance/equipment-issues'
 */
function createUpload(folder) {
    if (!isCloudinaryConfigured) {
        // No Cloudinary — accept the field but don't store anything
        return multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
    }

    const storage = new CloudinaryStorage({
        cloudinary,
        params: {
            folder,
            allowed_formats: ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif'],
            transformation: [{ width: 1200, crop: 'limit', quality: 'auto:good', fetch_format: 'webp' }],
        },
    });

    return multer({
        storage,
        limits: { fileSize: 10 * 1024 * 1024 },
        fileFilter: (_req, file, cb) => {
            if (file.mimetype.startsWith('image/')) cb(null, true);
            else cb(new Error('Only image files are allowed'));
        },
    });
}

module.exports = { createUpload, cloudinary };
