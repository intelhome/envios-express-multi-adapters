// Repositorios compartidos
const SessionRepository = require('../../../messaging/infrastructure/repositories/SessionRepository');
const UserRepository = require('../../../messaging/infrastructure/repositories/UserRepository');

// Servicio de recepción de mensajes
const MessageServiceWhatsAppWeb = require('../../../messaging/domain/services/whatsapp-web/MessageServiceWhatsAppWeb');
const MessageServiceBaileys = require('../../../messaging/domain/services/baileys/MessageServiceBaileys');

// Webhook Client
const WebhookService = require('../../domain/services/WebhookService');

// 🆕 Importar TODOS los adaptadores disponibles
const WhatsAppWebAdapter = require('../../../messaging/infrastructure/adapters/whatsapp-web/WhatsAppWebAdapter');
const BaileysAdapter = require('../../../messaging/infrastructure/adapters/baileys/BaileysAdapter');
// const VenomAdapter = require('../../../messaging/infrastructure/adapters/venom/VenomAdapter');
// const TwilioAdapter = require('../../../messaging/infrastructure/adapters/twilio/TwilioAdapter');

const sessionRepository = new SessionRepository();
const userRepository = new UserRepository();
const webhookService = new WebhookService();

// 🆕 Factory para seleccionar el proveedor
const PROVIDER_TYPE = process.env.WHATSAPP_PROVIDER || 'whatsapp-web'; // 'whatsapp-web', 'baileys', 'venom', 'twilio'

function createWhatsAppProvider(providerType) {
    let messageService;

    if (providerType === 'baileys') {
        messageService = new MessageServiceBaileys(webhookService);
    } else {
        messageService = new MessageServiceWhatsAppWeb(webhookService);
    }

    const providers = {
        'whatsapp-web': WhatsAppWebAdapter,
        'baileys': BaileysAdapter,
        // 'venom': VenomAdapter,
        // 'twilio': TwilioAdapter,
    };

    const ProviderClass = providers[providerType];

    if (!ProviderClass) {
        throw new Error(`Proveedor no soportado: ${providerType}. Opciones: ${Object.keys(providers).join(', ')}`);
    }

    return new ProviderClass(sessionRepository, userRepository, messageService);
}

// ⭐ Esta es la instancia que todos usarán (ahora dinámica)
const whatsappProvider = createWhatsAppProvider(PROVIDER_TYPE);

console.log(`✅ WhatsApp Provider inicializado: ${PROVIDER_TYPE}`);

module.exports = {
    whatsappProvider,
    sessionRepository,
    userRepository,
    PROVIDER_TYPE
};