const https = require('https');
const http = require('http');

class WebhookService {

    constructor(config = {}) {
        // Sin default de hostname a propósito: un webhook mal configurado debe
        // quedar deshabilitado, no apuntando en silencio a un host adivinado.
        this.hostname = config.hostname || null;
        this.path = config.path || '/response-baileys';
        this.timeout = config.timeout || 50000;
        this.protocol = config.protocol || 'https';
        this.port = config.port || (this.protocol === 'http' ? 80 : 443);
        this.maxRetries = config.maxRetries ?? 2;
        this.retryDelays = config.retryDelays || [3000, 10000];
    }

    async sendToWebhook(data) {
        if (!this.hostname) {
            console.warn('⚠️ WebhookService: hostname no configurado, se omite el envío.');
            return { success: false, skipped: true };
        }

        let lastError;

        for (let intento = 0; intento <= this.maxRetries; intento++) {
            try {
                return await this.attemptSend(data);
            } catch (error) {
                lastError = error;
                if (intento < this.maxRetries) {
                    const espera = this.retryDelays[intento] ?? this.retryDelays[this.retryDelays.length - 1];
                    console.warn(`⚠️ Reintentando webhook en ${espera}ms (intento ${intento + 1}/${this.maxRetries})`);
                    await new Promise(r => setTimeout(r, espera));
                }
            }
        }

        throw lastError;
    }

    async attemptSend(data) {
        return new Promise((resolve, reject) => {
            try {
                const payload = JSON.stringify(data);
                const transport = this.protocol === 'http' ? http : https;

                const options = {
                    hostname: this.hostname,
                    port: this.port,
                    path: this.path,
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Content-Length': Buffer.byteLength(payload)
                    },
                    timeout: this.timeout
                };

                const req = transport.request(options, (res) => {
                    let responseData = '';

                    res.on('data', chunk => {
                        responseData += chunk;
                    });

                    res.on('end', () => {
                        if (res.statusCode >= 200 && res.statusCode < 300) {
                            console.log(`✅ Webhook OK [${res.statusCode}]`);
                            resolve({ success: true, status: res.statusCode, data: responseData });
                        } else if (res.statusCode >= 500) {
                            // Error transitorio del servidor: se reintenta
                            reject(new Error(`Webhook respondió ${res.statusCode}: ${responseData}`));
                        } else {
                            // Error definitivo (401/404/422, etc.): reintentar no lo resolverá
                            console.warn(`⚠️ Webhook Warning [${res.statusCode}]:`, responseData);
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