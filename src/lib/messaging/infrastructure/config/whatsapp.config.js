const ACK_STATUS = {
    0: 'Error',
    1: 'Enviado',
    2: 'Recibido por servidor',
    3: 'Recibido por destinatario',
    4: 'Leído',
    5: 'Reproducido'
};

const DEFAULT_COUNTRY_CODE = '593';

const IGNORED_MESSAGE_TYPES = [
    'e2e_notification',
    'notification_template',
    'gp2',
    'broadcast_notification',
    'call_log'
];

const NO_RECONNECT_REASONS = [
    'LOGOUT',
    'UNPAIRED',
    'UNLAUNCHED',
    'CONFLICT',
    'DEPRECATED_VERSION'
];

module.exports = {
    ACK_STATUS,
    DEFAULT_COUNTRY_CODE,
    IGNORED_MESSAGE_TYPES,
    NO_RECONNECT_REASONS
};