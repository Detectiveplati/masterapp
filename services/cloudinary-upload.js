/**
 * Shared Cloudinary / Multer upload factory
 * Used by both maintenance and procurement modules.
 */
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key:    process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

/**
 * Create a multer upload middleware that saves to a given Cloudinary folder.
 * @param {string} folder  e.g. 'maintenance/equipment-issues'
 */
function createUpload(folder) {
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
