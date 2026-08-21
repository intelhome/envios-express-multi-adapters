const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const fileUpload = require("express-fileupload");
const path = require("path");
const logger = require("../logging/logger");

function buildCorsOptions() {
    const allowed = (process.env.ALLOWED_ORIGINS || "")
        .split(",")
        .map((o) => o.trim())
        .filter(Boolean);

    if (allowed.length === 0) {
        logger.warn("⚠️ ALLOWED_ORIGINS no está configurado: CORS acepta cualquier origen.");
        return {};
    }

    return {
        origin(origin, callback) {
            // Sin origin = clientes no-navegador (curl, server-to-server); se permite.
            if (!origin || allowed.includes(origin)) {
                return callback(null, true);
            }
            callback(new Error("Origen no permitido por CORS"));
        },
    };
}

function setupExpressApp() {
    const app = express();

    const bodyLimit = process.env.BODY_LIMIT || "20mb";

    // Middlewares
    app.use(fileUpload({
        createParentPath: true,
        limits: { fileSize: 20 * 1024 * 1024 }, // 20MB por archivo
        abortOnLimit: true,
    }));
    app.use(cors(buildCorsOptions()));
    app.use(bodyParser.json({ limit: bodyLimit }));
    app.use(bodyParser.urlencoded({ limit: bodyLimit, extended: true }));

    // IMPORTANTE: Servir archivos estáticos desde client

    const root = process.cwd();

    app.use(express.static(path.join(root, 'client')));
    app.use('/assets', express.static(path.join(root, 'assets')));

    return app;
}

module.exports = { setupExpressApp };
