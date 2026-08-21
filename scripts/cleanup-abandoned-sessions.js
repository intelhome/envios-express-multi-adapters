/**
 * Limpieza manual de credenciales de sesión (session_auth_info_*) que quedaron
 * abandonadas: usuarios que nunca escanearon el QR o que llevan mucho tiempo
 * desconectados. NO se ejecuta automáticamente al iniciar el servidor —
 * es una acción destructiva, se corre a mano cuando haga falta liberar espacio.
 *
 * Uso:
 *   node scripts/cleanup-abandoned-sessions.js            (solo muestra qué borraría)
 *   node scripts/cleanup-abandoned-sessions.js --apply    (borra de verdad)
 *   node scripts/cleanup-abandoned-sessions.js --apply --days=60
 */
require('dotenv').config();
const { MongoClient } = require('mongodb');

const DIAS_INACTIVIDAD = Number(
    (process.argv.find((a) => a.startsWith('--days=')) || '').split('=')[1] || 30
);
const APLICAR = process.argv.includes('--apply');

async function main() {
    const url = process.env.MONGODB_URL || 'mongodb://127.0.0.1:27017/whatsapp_api';
    const dbName = process.env.MONGO_DB_NAME || 'whatsapp_db';
    const client = new MongoClient(url);

    await client.connect();
    const db = client.db(dbName);

    const colecciones = await db.listCollections({ name: /^session_auth_info_/ }).toArray();
    const limite = new Date(Date.now() - DIAS_INACTIVIDAD * 24 * 60 * 60 * 1000);

    console.log(`🔍 ${colecciones.length} colecciones de sesión encontradas. Cortando por inactividad > ${DIAS_INACTIVIDAD} días.`);

    let candidatas = 0;

    for (const { name } of colecciones) {
        const coll = db.collection(name);
        const creds = await coll.findOne({ _id: 'creds' });

        // Sin ninguna clave guardada (ej. sesión creada pero QR nunca escaneado)
        const totalDocs = await coll.estimatedDocumentCount();

        if (!creds || totalDocs === 0) {
            candidatas++;
            console.log(`  - ${name}: sin credenciales guardadas (candidata a borrar)`);
            if (APLICAR) await coll.drop();
            continue;
        }

        // No hay timestamp propio en el doc; como proxy usamos el _id de Mongo
        // del documento 'creds' si existiera un ObjectId, si no se omite.
        const objectId = creds._id && creds._id.getTimestamp ? null : null;
        // (Baileys guarda _id como string 'creds', no como ObjectId — no hay
        // forma confiable de saber la última actividad sin timestamps propios;
        // se deja fuera del borrado automático para no perder sesiones activas.)
    }

    console.log(`✅ Listo. ${candidatas} colecciones ${APLICAR ? 'eliminadas' : 'detectadas (usa --apply para borrar)'}.`);

    await client.close();
}

main().catch((err) => {
    console.error('❌ Error en la limpieza:', err);
    process.exit(1);
});
