const logger = require('../../shared/infrastructure/logging/logger');

/**
 * Protege las rutas /api/* con una API key compartida (SIGCENTER u otro
 * consumidor debe enviarla en el header X-Api-Key).
 * Si API_ACCESS_TOKEN no está configurado, deja pasar todo pero avisa fuerte
 * en los logs para que no quede así en producción sin darse cuenta.
 */
module.exports = function apiAuth(req, res, next) {
    const expected = process.env.API_ACCESS_TOKEN;

    if (!expected) {
        logger.warn('⚠️ API_ACCESS_TOKEN no está configurado: las rutas /api/* están SIN protección.');
        return next();
    }

    const provided = req.headers['x-api-key'];

    if (!provided || provided !== expected) {
        return res.status(401).json({ result: false, error: 'API key inválida o faltante.' });
    }

    next();
};
