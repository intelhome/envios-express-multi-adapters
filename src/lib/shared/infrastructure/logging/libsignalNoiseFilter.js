/**
 * libsignal (la librería de cifrado que usa Baileys) escribe directo a console.*,
 * sin pasar por el logger de Baileys, así que LOG_LEVEL no la controla. Cada
 * mensaje que no puede descifrar con una sesión vieja imprime un "Bad MAC" con su
 * stack completo, y "Closing session:" vuelca el objeto de sesión entero: miles de
 * líneas que no requieren acción, porque Baileys reintenta el descifrado y recrea
 * la sesión solo (enableAutoSessionRecreation / retry receipts).
 *
 * Este filtro descarta esas líneas y cada 5 minutos imprime un resumen con el
 * conteo, para no perder la señal si de pronto se disparan. Con
 * LOG_LIBSIGNAL=true se vuelven a ver completas.
 */
const RUIDO = [
    { prefijo: 'Session error:', tipo: 'badMac' },
    { prefijo: 'Failed to decrypt message with any known session', tipo: 'fallidos' },
    { prefijo: 'Closing session', tipo: null },
    { prefijo: 'Opening session', tipo: null },
    { prefijo: 'Removing old closed session', tipo: null },
    { prefijo: 'Closing open session in favor of incoming prekey bundle', tipo: null },
    { prefijo: 'Decrypted message with closed session', tipo: null },
    { prefijo: 'Session already closed', tipo: null },
    { prefijo: 'Session already open', tipo: null },
    { prefijo: 'Migrating session to', tipo: null },
];

const INTERVALO_RESUMEN_MS = 5 * 60 * 1000;

function instalar() {
    if (String(process.env.LOG_LIBSIGNAL).toLowerCase() === 'true') return;

    const conteo = { badMac: 0, fallidos: 0 };

    const esRuido = (args) => {
        const primero = args[0];
        if (typeof primero !== 'string') return false;
        const regla = RUIDO.find((r) => primero.startsWith(r.prefijo));
        if (!regla) return false;
        if (regla.tipo) conteo[regla.tipo] += 1;
        return true;
    };

    for (const metodo of ['log', 'info', 'warn', 'error']) {
        const original = console[metodo].bind(console);
        console[metodo] = (...args) => {
            if (esRuido(args)) return;
            original(...args);
        };
    }

    setInterval(() => {
        if (conteo.fallidos === 0 && conteo.badMac === 0) return;
        console.warn(
            `🔐 libsignal (últimos 5 min): ${conteo.fallidos} mensajes no descifrados al primer intento, ` +
            `${conteo.badMac} "Bad MAC". Baileys los reintenta solo; si este número no baja, ` +
            `revisar la sesión afectada.`
        );
        conteo.badMac = 0;
        conteo.fallidos = 0;
    }, INTERVALO_RESUMEN_MS).unref();
}

module.exports = { instalar };
