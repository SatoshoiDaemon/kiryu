const fs = require('node:fs');
const mongoose = require('mongoose');
const config = require('../config');
const logger = require('../logger');
const metrics = require('../modules/performanceMetrics');
const { applyPalette } = require('../modules/appearance');
const UserXp = require('./models/UserXp');
const GuildConfig = require('./models/GuildConfig');
const EconomyAccount = require('./models/EconomyAccount');
const EconomyItem = require('./models/EconomyItem');
const EconomyInventory = require('./models/EconomyInventory');
const EconomyTransaction = require('./models/EconomyTransaction');
const EconomySettings = require('./models/EconomySettings');
const EconomyCollectRule = require('./models/EconomyCollectRule');
const EconomyClaim = require('./models/EconomyClaim');
const MemberProfile = require('./models/MemberProfile');
const BadgeDefinition = require('./models/BadgeDefinition');
const AIUsage = require('./models/AIUsage');
const AIQuotaCounter = require('./models/AIQuotaCounter');
const BlobObject = require('./models/BlobObject');
const Reminder = require('./models/Reminder');
const CommunityPoll = require('./models/CommunityPoll');
const Giveaway = require('./models/Giveaway');
const AfkStatus = require('./models/AfkStatus');
const AdminAudit = require('./models/AdminAudit');
const ManagedMessage = require('./models/ManagedMessage');
const { seedEconomyStores } = require('./seeds/economyStores');
const { setAssetOverrides } = require('../modules/components');

function readCertificate(file, label) {
  try {
    return fs.readFileSync(file);
  } catch (error) {
    const code = error?.code || error?.name || 'erro de leitura';
    const wrapped = new Error('Não foi possível ler ' + label + ' em ' + file + ' (' + code + ').');
    wrapped.certificateConfigurationError = true;
    throw wrapped;
  }
}

function createTlsOptions() {
  const { ca, certificate, key } = config.certificates;
  return {
    tls: true,
    ca: readCertificate(ca, 'o certificado de autoridade (CA) do MongoDB'),
    cert: readCertificate(certificate, 'o certificado de cliente do MongoDB'),
    key: readCertificate(key, 'a chave privada do MongoDB'),
  };
}

async function connectDatabase() {
  try {
    if (!config.mongoUri) throw new Error('MONGODB_URI ausente');
    await mongoose.connect(config.mongoUri, {
      dbName: config.mongoDbName,
      ...createTlsOptions(),
      serverSelectionTimeoutMS: 15000,
      connectTimeoutMS: 15000,
      maxPoolSize: 10,
      monitorCommands: true,
    });
    instrumentMongo(mongoose.connection.getClient());
    logger.info('MongoDB conectado; banco "' + config.mongoDbName + '".');
    return mongoose.connection;
  } catch (error) {
    const code = error?.code || error?.name || 'erro desconhecido';
    const details = error?.certificateConfigurationError ? error.message : code;
    logger.error('Falha ao conectar ao MongoDB (' + details + '). Verifique a URI, certificados e acesso de rede.');
    throw new Error('Não foi possível conectar ao MongoDB. Consulte a configuração local sem compartilhar credenciais.');
  }
}

const monitoredClients = new WeakSet();
function instrumentMongo(client) {
  if (!client || monitoredClients.has(client)) return;
  monitoredClients.add(client);
  client.on('commandSucceeded', (event) => {
    const command = event.command || {};
    const collection = ['find', 'aggregate', 'count', 'distinct', 'update', 'delete', 'insert', 'findAndModify', 'findandmodify']
      .map((key) => command[key]).find((value) => typeof value === 'string') || 'command';
    metrics.record('mongo', event.commandName + ':' + collection, Number(event.duration || 0));
  });
}

async function initializeDatabase() {
  if (mongoose.connection.readyState !== 1) throw new Error('MongoDB não está conectado.');
  const models = [UserXp, GuildConfig, EconomyAccount, EconomyItem, EconomyInventory, EconomyTransaction, EconomySettings, EconomyCollectRule, EconomyClaim, MemberProfile, BadgeDefinition, AIUsage, AIQuotaCounter, BlobObject, Reminder, CommunityPoll, Giveaway, AfkStatus, AdminAudit, ManagedMessage];
  await Promise.all(models.map((model) => model.createCollection().catch(ignoreNamespaceExists)));
  await Promise.all(models.map((model) => model.createIndexes()));
  if (config.guildId) {
    const [guildConfig, seeded] = await Promise.all([
      GuildConfig.findById(config.guildId).lean(),
      seedEconomyStores(config.guildId),
    ]);
    applyPalette(guildConfig?.appearance?.palette || 'kiryu');
    setAssetOverrides(await BlobObject.find({ guildId: config.guildId, deletedAt: null }).select('category name url deletedAt').lean());
    logger.info('Lojas da economia sincronizadas: ' + seeded.fragments + ' produtos de Fragmentos e ' + seeded.orbs + ' produtos de Orbes.');
  } else {
    logger.warn('Seed das lojas ignorado porque SERVER_ID não está configurado.');
  }
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
  connectDatabase, initializeDatabase, closeDatabase, UserXp, GuildConfig, createTlsOptions, instrumentMongo,
  EconomyAccount, EconomyItem, EconomyInventory, EconomyTransaction, EconomySettings, EconomyCollectRule, EconomyClaim, MemberProfile, BadgeDefinition, AIUsage, AIQuotaCounter,
  BlobObject, Reminder, CommunityPoll, Giveaway, AfkStatus, AdminAudit, ManagedMessage,
};
