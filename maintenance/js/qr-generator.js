/**
 * QR Code Generator Module
 * Client-side QR code generation and management
 */

// Note: For client-side QR generation, we'd typically use a library like qrcode.js
// However, our backend already generates QR codes via the qrcode npm package
// This module provides helper functions for QR code related operations

const QRGenerator = {
    /**
     * Request QR code generation from server
     * @param {string} equipmentId - The equipment ID to generate QR for
     * @returns {Promise<string>} QR code data URL
     */
    async generateEquipmentQR(equipmentId) {
        try {
            const response = await fetch(`${API_BASE}/equipment/${equipmentId}/generate-qr`, {
                method: 'POST'
            });

            if (!response.ok) {
                throw new Error('Failed to generate QR code');
            }

            const data = await response.json();
            return data.qrCode;
        } catch (error) {
            console.error('QR generation error:', error);
            throw error;
        }
    },

    /**
     * Request QR code generation for an area
     * @param {string} areaId - The area ID to generate QR for
     * @returns {Promise<string>} QR code data URL
     */
    async generateAreaQR(areaId) {
        try {
            const response = await fetch(`${API_BASE}/areas/${areaId}/generate-qr`, {
                method: 'POST'
            });

            if (!response.ok) {
                throw new Error('Failed to generate QR code');
            }

            const data = await response.json();
            return data.qrCode;
        } catch (error) {
            console.error('QR generation error:', error);
            throw error;
        }
    },

    /**
     * Download QR code as PNG file
     * @param {string} qrCodeDataUrl - The QR code data URL
     * @param {string} filename - The filename for download
     */
    downloadQRCode(qrCodeDataUrl, filename = 'qr-code.png') {
        const link = document.createElement('a');
        link.href = qrCodeDataUrl;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    },

    /**
     * Print QR code with label
     * @param {string} qrCodeDataUrl - The QR code data URL
     * @param {string} label - Label text to print with QR code
     * @param {string} sublabel - Additional info line
     */
    printQRCode(qrCodeDataUrl, label, sublabel = '') {
        const printWindow = window.open('', '_blank');
        
        const htmlContent = `
            <!DOCTYPE html>
            <html>
            <head>
                <title>Print QR Code - ${label}</title>
                <style>
                    @page {
                        size: A4;
                        margin: 20mm;
                    }
                    body {
                        font-family: Arial, sans-serif;
                        display: flex;
                        flex-direction: column;
                        align-items: center;
                        justify-content: center;
                        min-height: 100vh;
                        margin: 0;
                        padding: 20px;
                    }
                    .qr-container {
                        border: 3px solid #333;
                        padding: 30px;
                        border-radius: 10px;
                        text-align: center;
                        background: white;
                        box-shadow: 0 4px 12px rgba(0,0,0,0.1);
                    }
                    .qr-code {
                        max-width: 300px;
                        height: auto;
                        margin: 20px auto;
                    }
                    .qr-label {
                        font-size: 24px;
                        font-weight: bold;
                        margin: 20px 0 10px;
                        color: #333;
                    }
                    .qr-sublabel {
                        font-size: 16px;
                        color: #666;
                        margin-bottom: 20px;
                    }
                    .instructions {
                        margin-top: 30px;
                        font-size: 14px;
                        color: #888;
                    }
                    @media print {
                        body {
                            background: white;
                        }
                        .instructions {
                            display: none;
                        }
                    }
                </style>
            </head>
            <body>
                <div class="qr-container">
                    <div class="qr-label">${label}</div>
                    ${sublabel ? `<div class="qr-sublabel">${sublabel}</div>` : ''}
                    <img src="${qrCodeDataUrl}" alt="QR Code" class="qr-code">
                    <div class="instructions">Scan this QR code for equipment details</div>
                </div>
                <script>
                    window.onload = () => {
                        setTimeout(() => {
                            window.print();
                        }, 500);
                    };
                </script>
            </body>
            </html>
        `;

        printWindow.document.write(htmlContent);
        printWindow.document.close();
    },

    /**
     * Create a printable sheet with multiple QR codes
     * @param {Array} qrCodeData - Array of {qrCode, label, sublabel}
     */
    printQRCodeSheet(qrCodeData) {
        const printWindow = window.open('', '_blank');
        
        const qrCodeItems = qrCodeData.map(item => `
            <div class="qr-item">
                <div class="qr-label">${item.label}</div>
                <img src="${item.qrCode}" alt="${item.label}" class="qr-code">
                ${item.sublabel ? `<div class="qr-sublabel">${item.sublabel}</div>` : ''}
            </div>
        `).join('');

        const htmlContent = `
            <!DOCTYPE html>
            <html>
            <head>
                <title>Print QR Codes Sheet</title>
                <style>
                    @page {
                        size: A4;
                        margin: 15mm;
                    }
                    body {
                        font-family: Arial, sans-serif;
                        margin: 0;
                        padding: 0;
                    }
                    h1 {
                        text-align: center;
                        margin: 20px 0;
                        color: #333;
                        font-size: 20px;
                    }
                    .qr-grid {
                        display: grid;
                        grid-template-columns: repeat(3, 1fr);
                        gap: 15px;
                        padding: 10px;
                    }
                    .qr-item {
                        border: 2px solid #333;
                        padding: 15px;
                        text-align: center;
                        border-radius: 8px;
                        background: white;
                        page-break-inside: avoid;
                    }
                    .qr-code {
                        width: 100%;
                        max-width: 150px;
                        height: auto;
                        margin: 10px auto;
                        display: block;
                    }
                    .qr-label {
                        font-size: 14px;
                        font-weight: bold;
                        margin-bottom: 8px;
                        color: #333;
                        word-wrap: break-word;
                    }
                    .qr-sublabel {
                        font-size: 11px;
                        color: #666;
                        margin-top: 8px;
                    }
                    @media print {
                        body {
                            background: white;
                        }
                    }
                </style>
            </head>
            <body>
                <h1>Equipment QR Codes</h1>
                <div class="qr-grid">
                    ${qrCodeItems}
                </div>
                <script>
                    window.onload = () => {
                        setTimeout(() => {
                            window.print();
                        }, 1000);
                    };
                </script>
            </body>
            </html>
        `;

        printWindow.document.write(htmlContent);
        printWindow.document.close();
    },

    /**
     * Display QR code in a modal
     * @param {string} qrCodeDataUrl - The QR code data URL
     * @param {string} title - Modal title
     */
    showQRModal(qrCodeDataUrl, title = 'QR Code') {
        // Create modal HTML
        const modalHTML = `
            <div id="qrModal" style="
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0,0,0,0.7);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 10000;
            " onclick="this.remove()">
                <div style="
                    background: white;
                    padding: 30px;
                    border-radius: 12px;
                    text-align: center;
                    max-width: 400px;
                    box-shadow: 0 10px 40px rgba(0,0,0,0.3);
                " onclick="event.stopPropagation()">
                    <h2 style="margin: 0 0 20px; color: #333;">${title}</h2>
                    <img src="${qrCodeDataUrl}" style="max-width: 100%; height: auto; border: 1px solid #ddd; padding: 10px; border-radius: 8px;">
                    <button onclick="document.getElementById('qrModal').remove()" style="
                        margin-top: 20px;
                        padding: 10px 24px;
                        background: #c0392b;
                        color: white;
                        border: none;
                        border-radius: 8px;
                        cursor: pointer;
                        font-size: 16px;
                    ">Close</button>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHTML);
    },

    /**
     * Get QR code for equipment from API
     * @param {string} equipmentId - The equipment ID
     * @returns {Promise<string>} QR code data URL
     */
    async getEquipmentQR(equipmentId) {
        try {
            const response = await fetch(`${API_BASE}/equipment/${equipmentId}`);
            if (!response.ok) throw new Error('Equipment not found');

            const equipment = await response.json();
            return equipment.qrCode;
        } catch (error) {
            console.error('Error fetching equipment QR:', error);
            throw error;
        }
    }
};

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = QRGenerator;
}
