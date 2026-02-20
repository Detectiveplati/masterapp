const QRCode = require('qrcode');
const http   = require('http');

/**
 * Resolve the best public base URL — ngrok tunnel > QR_BASE_URL env > request host.
 * @param {import('express').Request} req
 * @returns {Promise<string>}
 */
async function getPublicBaseUrl(req) {
    // 1. Check if ngrok is running locally
    try {
        const data = await new Promise((resolve, reject) => {
            const r = http.get('http://localhost:4040/api/tunnels', (res) => {
                let body = '';
                res.on('data', c => body += c);
                res.on('end', () => resolve(JSON.parse(body)));
            });
            r.on('error', reject);
            r.setTimeout(1000, () => reject(new Error('timeout')));
        });
        const tunnel = data.tunnels.find(t => t.proto === 'https') || data.tunnels[0];
        if (tunnel) return tunnel.public_url.replace(/\/$/, '');
    } catch (_) { /* ngrok not running */ }

    // 2. Fall back to env var
    if (process.env.QR_BASE_URL) return process.env.QR_BASE_URL;

    // 3. Fall back to request host
    return `${req.protocol}://${req.get('host')}`;
}

/**
 * Generate QR code for equipment
 * @param {string} equipmentId - The unique equipment ID
 * @param {string} baseUrl - The base URL of the application
 * @returns {Promise<string>} - QR code data URL
 */
async function generateEquipmentQRCode(equipmentId, baseUrl) {
    try {
        const url = `${baseUrl}/report-issue.html?id=${equipmentId}`;
        const qrCodeDataUrl = await QRCode.toDataURL(url, {
            errorCorrectionLevel: 'M',
            type: 'image/png',
            width: 300,
            margin: 1
        });
        return qrCodeDataUrl;
    } catch (error) {
        console.error('Error generating equipment QR code:', error);
        throw error;
    }
}

/**
 * Generate QR code for area
 * @param {string} areaId - The unique area ID (unused in URL, kept for compat)
 * @param {string} areaName - The human-readable area name (used in URL)
 * @param {string} baseUrl - The base URL of the application
 * @returns {Promise<string>} - QR code data URL
 */
async function generateAreaQRCode(areaId, areaName, baseUrl) {
    // If called with old 2-arg signature (areaId, baseUrl), shift args
    if (!baseUrl) { baseUrl = areaName; areaName = areaId; }
    try {
        const url = `${baseUrl}/area-maintenance.html?area=${encodeURIComponent(areaName)}`;
        const qrCodeDataUrl = await QRCode.toDataURL(url, {
            errorCorrectionLevel: 'M',
            type: 'image/png',
            width: 300,
            margin: 1
        });
        return qrCodeDataUrl;
    } catch (error) {
        console.error('Error generating area QR code:', error);
        throw error;
    }
}

/**
 * Generate QR code as buffer for download
 * @param {string} url - The URL to encode
 * @returns {Promise<Buffer>} - QR code buffer
 */
async function generateQRCodeBuffer(url) {
    try {
        const buffer = await QRCode.toBuffer(url, {
            errorCorrectionLevel: 'M',
            type: 'png',
            width: 600,
            margin: 2
        });
        return buffer;
    } catch (error) {
        console.error('Error generating QR code buffer:', error);
        throw error;
    }
}

module.exports = {
    getPublicBaseUrl,
    generateEquipmentQRCode,
    generateAreaQRCode,
    generateQRCodeBuffer
};
