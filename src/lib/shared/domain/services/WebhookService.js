const https = require('https');

class WebhookService {

    constructor(config = {}) {
        this.hostname = config.hostname || 'sigcrm.pro';
        this.path = config.path || '/response-baileys';
        this.timeout = config.timeout || 50000;
    }

    async sendToWebhook(data) {
        return new Promise((resolve, reject) => {
            try {
                const payload = JSON.stringify(data);

                const options = {
                    hostname: this.hostname,
                    path: this.path,
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Content-Length': Buffer.byteLength(payload)
                    },
                    timeout: this.timeout
                };

                const req = https.request(options, (res) => {
                    let responseData = '';

                    res.on('data', chunk => {
                        responseData += chunk;
                    });

                    res.on('end', () => {
                        if (res.statusCode >= 200 && res.statusCode < 300) {
                            console.log(`✅ Webhook OK [${res.statusCode}]`);
                            resolve({ success: true, status: res.statusCode, data: responseData });
                        } else {
                            console.warn(`⚠️ Webhook Warning [${res.statusCode}]`);
                            resolve({ success: false, status: res.statusCode, data: responseData });
                        }
                    });
                });

                req.on('error', (error) => {
                    console.error('❌ Error webhook:', error.message);
                    reject(error);
                });

                req.on('timeout', () => {
                    console.error('❌ Timeout webhook');
                    req.destroy();
                    reject(new Error('Webhook Timeout'));
                });

                req.write(payload);
                req.end();

            } catch (error) {
                console.error('❌ Error crítico en WebhookService:', error.message);
                reject(error);
            }
        });
    }
}

module.exports = WebhookService;