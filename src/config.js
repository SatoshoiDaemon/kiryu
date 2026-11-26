const path = require('node:path');
const dotenv = require('dotenv');

dotenv.config({ quiet: true });

const projectRoot = path.resolve(__dirname, '..');

function resolveProjectPath(value, defaultPath) {
  const configuredPath = value || defaultPath;
  return path.isAbsolute(configuredPath)
    ? path.normalize(configuredPath)
    : path.resolve(projectRoot, configuredPath);
}

const config = {
  token: process.env.DISCORD_TOKEN || process.env.DICORD_TOKEN,
  clientId: process.env.CLIENT_ID,
  guildId: process.env.SERVER_ID,
  mongoUri: process.env.MONGODB_URI,
  mongoDbName: process.env.MONGODB_DB_NAME || 'kiryu',
  prefix: process.env.COMMAND_PREFIX || '$',
  ownerId: '1290969388933054528',
  visual: {
    assetBaseUrl: (process.env.KIRYU_ASSET_BASE_URL || 'https://raw.githubusercontent.com/SatoshoiDaemon/kiryu/main/assets').replace(/\/$/, ''),
    dividerUrl: process.env.KIRYU_DIVIDER_URL || (process.env.KIRYU_ASSET_BASE_URL || 'https://raw.githubusercontent.com/SatoshoiDaemon/kiryu/main/assets').replace(/\/$/, '') + '/kiryu-divider.gif',
    brand: 0x9D174D,
    xp: 0xC0265A,
    fragments: 0xE8A317,
    orbs: 0x7654C9,
    store: 0x168A68,
    casino: 0x7C3AED,
    profile: 0xD9467C,
    success: 0x168A68,
    error: 0xC83E4D,
  },
  timezone: 'America/Sao_Paulo',
  certificates: {
    ca: resolveProjectPath(process.env.MONGODB_CA_FILE, 'certs/ca-certificate.crt'),
    certificate: resolveProjectPath(process.env.MONGODB_CERT_FILE, 'certs/certificate.pem'),
    key: resolveProjectPath(process.env.MONGODB_KEY_FILE, 'certs/private-key.key'),
  },
};

module.exports = config;
