/**
 * Serializa y espacía los envíos de mensajes por sesión (id_externo) para no
 * saturar a WhatsApp con ráfagas de mensajes en la misma sesión, lo que puede
 * derivar en un baneo del número. Sesiones distintas se procesan en paralelo,
 * solo se limita la frecuencia dentro de una misma sesión.
 */
class MessageQueue {
    constructor() {
        this.chains = new Map();
        this.lastSentAt = new Map();
        this.minIntervalMs = Number(process.env.MESSAGE_MIN_INTERVAL_MS || 1200);
    }

    enqueue(sessionId, taskFn) {
        const previous = this.chains.get(sessionId) || Promise.resolve();

        const next = previous
            .catch(() => {}) // un envío fallido no debe trabar los siguientes
            .then(() => this._esperarTurno(sessionId))
            .then(taskFn);

        // Evita que la cadena crezca para siempre reteniendo memoria
        const cleanup = next.catch(() => {}).then(() => {
            if (this.chains.get(sessionId) === next) {
                this.chains.delete(sessionId);
            }
        });
        this.chains.set(sessionId, next);
        void cleanup;

        return next;
    }

    async _esperarTurno(sessionId) {
        const last = this.lastSentAt.get(sessionId) || 0;
        const espera = this.minIntervalMs - (Date.now() - last);
        if (espera > 0) {
            await new Promise((resolve) => setTimeout(resolve, espera));
        }
        this.lastSentAt.set(sessionId, Date.now());
    }
}

module.exports = new MessageQueue();
