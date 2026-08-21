const logger = require('../../shared/infrastructure/logging/logger');

/**
 * Protege las rutas /api/* con una API key compartida (header X-Api-Key).
 * Controlado por el switch REQUIRE_API_TOKEN (.env): "true" exige el token,
 * cualquier otro valor (o ausente) desactiva la validación por completo.
 * Útil para instalaciones de este servicio donde configurar el token es más
 * complicado (ej. "el otro sistema"): ahí simplemente se deja
 * REQUIRE_API_TOKEN=false en su .env.
 */
module.exports = function apiAuth(req, res, next) {
    const requireToken = process.env.REQUIRE_API_TOKEN === 'true';

    if (!requireToken) {
        return next();
    }

    const expected = process.env.API_ACCESS_TOKEN;

    if (!expected) {
        logger.warn('⚠️ REQUIRE_API_TOKEN=true pero API_ACCESS_TOKEN no está configurado: las rutas /api/* están SIN protección.');
        return next();
    }

    const provided = req.headers['x-api-key'];

    if (!provided || provided !== expected) {
        return res.status(401).json({ result: false, error: 'API key inválida o faltante.' });
    }

    next();
};
