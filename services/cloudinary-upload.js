/**
 * Shared Cloudinary upload service.
 *
 * Strategy: always use multer memoryStorage to parse the multipart form
 * INSTANTLY (no network call). Then upload the buffer to Cloudinary in the
 * BACKGROUND after the HTTP response has already been sent.
 *
 * This eliminates "Load failed" / request timeout issues caused by waiting
 * for the Cloudinary API before responding to the client.
 */
const multer = require('multer');

const isCloudinaryConfigured = !!(
    process.env.CLOUDINARY_CLOUD_NAME &&
    process.env.CLOUDINARY_API_KEY &&
    process.env.CLOUDINARY_API_SECRET
);

let cloudinary = null;

if (isCloudinaryConfigured) {
    cloudinary = require('cloudinary').v2;
    cloudinary.config({
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
        api_key:    process.env.CLOUDINARY_API_KEY,
        api_secret: process.env.CLOUDINARY_API_SECRET,
    });
    console.log('✓ [Cloudinary] Configured — background photo uploads enabled');
} else {
    console.warn('⚠️  [Cloudinary] Not configured — photo uploads will be skipped');
}

/**
 * Multer middleware that buffers the uploaded file in RAM — no network call,
 * always completes immediately regardless of Cloudinary availability.
 * @param {string} fieldName  e.g. 'image'
 */
function memUpload(fieldName) {
    return multer({
        storage: multer.memoryStorage(),
        limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
        fileFilter: (_req, file, cb) => {
            if (file.mimetype.startsWith('image/')) cb(null, true);
            else cb(new Error('Only image files are allowed'));
        },
    }).single(fieldName);
}

/**
 * Upload a buffer to Cloudinary, with an optional timeout (default 20s).
 * Returns the secure HTTPS URL, or null if Cloudinary is not configured,
 * the buffer is empty, the upload fails, or it times out.
 *
 * @param {Buffer} buffer       File buffer from multer memoryStorage
 * @param {string} mimetype     e.g. 'image/jpeg'
 * @param {string} folder       Cloudinary folder e.g. 'procurement'
 * @param {number} [timeoutMs]  Max ms to wait (default 20000)
 * @returns {Promise<string|null>}
 */
async function uploadBufferToCloudinary(buffer, mimetype, folder, timeoutMs = 20000) {
    if (!isCloudinaryConfigured || !buffer) return null;

    const uploadPromise = new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
            {
                folder,
                allowed_formats: ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif'],
                transformation: [{ width: 1200, crop: 'limit', quality: 'auto:good', fetch_format: 'webp' }],
            },
            (error, result) => {
                if (error) reject(error);
                else resolve(result.secure_url);
            }
        );
        uploadStream.end(buffer);
    });

    const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Cloudinary upload timed out')), timeoutMs)
    );

    return Promise.race([uploadPromise, timeoutPromise]).catch(err => {
        console.error(`[Cloudinary] Upload failed (${folder}):`, err.message);
        return null; // always resolve — never block the route
    });
}

// Legacy factory — kept for compatibility (now uses memoryStorage internally)
function createUpload(folder) {
    return { single: (fieldName) => memUpload(fieldName) };
}

module.exports = { memUpload, uploadBufferToCloudinary, createUpload, isCloudinaryConfigured, cloudinary };
