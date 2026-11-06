const fs = require('node:fs');
const tls = require('node:tls');
const mongoose = require('mongoose');
const config = require('../config');
const logger = require('../logger');
const UserXp = require('./models/UserXp');
const GuildConfig = require('./models/GuildConfig');
const EconomyAccount = require('./models/EconomyAccount');
const EconomyItem = require('./models/EconomyItem');
const EconomyInventory = require('./models/EconomyInventory');
const EconomyTransaction = require('./models/EconomyTransaction');
const EconomySettings = require('./models/EconomySettings');
const EconomyCollectRule = require('./models/EconomyCollectRule');
const EconomyClaim = require('./models/EconomyClaim');

function createTlsContext() {
  const { ca, certificate, key } = config.certificates;
  for (const file of [ca, certificate, key]) {
    if (!fs.existsSync(file)) throw new Error('Certificado MongoDB ausente: ' + file);
  }

  return tls.createSecureContext({
    ca: fs.readFileSync(ca),
    cert: fs.readFileSync(certificate),
    key: fs.readFileSync(key),
  });
}

async function connectDatabase() {
  try {
    if (!config.mongoUri) throw new Error('MONGODB_URI ausente');
    await mongoose.connect(config.mongoUri, {
      dbName: config.mongoDbName,
      tls: true,
      secureContext: createTlsContext(),
      serverSelectionTimeoutMS: 15000,
      connectTimeoutMS: 15000,
      maxPoolSize: 10,
    });
    logger.info('MongoDB conectado; banco "' + config.mongoDbName + '".');
    return mongoose.connection;
  } catch (error) {
    const code = error?.code || error?.name || 'erro desconhecido';
    logger.error('Falha ao conectar ao MongoDB (' + code + '). Verifique a URI, certificados e acesso de rede.');
    throw new Error('Não foi possível conectar ao MongoDB. Consulte a configuração local sem compartilhar credenciais.');
  }
}

async function initializeDatabase() {
  if (mongoose.connection.readyState !== 1) throw new Error('MongoDB não está conectado.');
  const models = [UserXp, GuildConfig, EconomyAccount, EconomyItem, EconomyInventory, EconomyTransaction, EconomySettings, EconomyCollectRule, EconomyClaim];
  await Promise.all(models.map((model) => model.createCollection().catch(ignoreNamespaceExists)));
  await Promise.all(models.map((model) => model.createIndexes()));
  logger.info('Coleções e índices do Kiryu inicializados.');
}

function ignoreNamespaceExists(error) {
  if (error?.code === 48 || error?.codeName === 'NamespaceExists') return undefined;
  throw error;
}

async function closeDatabase() {
  await mongoose.disconnect();
}

module.exports = {
  connectDatabase, initializeDatabase, closeDatabase, UserXp, GuildConfig, createTlsContext,
  EconomyAccount, EconomyItem, EconomyInventory, EconomyTransaction, EconomySettings, EconomyCollectRule, EconomyClaim,
};
