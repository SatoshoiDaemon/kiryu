const path = require('node:path');
const dotenv = require('dotenv');

dotenv.config({ quiet: true });

const config = {
  token: process.env.DISCORD_TOKEN || process.env.DICORD_TOKEN,
  clientId: process.env.CLIENT_ID,
  guildId: process.env.SERVER_ID,
  mongoUri: process.env.MONGODB_URI,
  mongoDbName: process.env.MONGODB_DB_NAME || 'kiryu',
  prefix: process.env.COMMAND_PREFIX || '$',
  ownerId: '1290969388933054528',
  certificates: {
    ca: path.resolve(process.env.MONGODB_CA_FILE || path.join(__dirname, '..', 'certs', 'ca-certificate.crt')),
    certificate: path.resolve(process.env.MONGODB_CERT_FILE || path.join(__dirname, '..', 'certs', 'certificate.pem')),
    key: path.resolve(process.env.MONGODB_KEY_FILE || path.join(__dirname, '..', 'certs', 'private-key.key')),
  },
};

module.exports = config;
