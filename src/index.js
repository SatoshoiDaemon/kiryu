const { Client, GatewayIntentBits, Partials } = require('discord.js');
const config = require('./config');
const logger = require('./logger');
const { connectDatabase, initializeDatabase, closeDatabase } = require('./database');
const { loadCommands } = require('./handlers/loadCommands');
const { loadEvents } = require('./handlers/loadEvents');
const { stopVoiceXp } = require('./modules/voiceXp');

function validateRuntimeConfig() {
  const missing = [];
  if (!config.token) missing.push('DISCORD_TOKEN (ou DICORD_TOKEN)');
  if (!config.clientId) missing.push('CLIENT_ID');
  if (!config.guildId) missing.push('SERVER_ID');
  if (!config.mongoUri) missing.push('MONGODB_URI');
  if (missing.length) throw new Error('Variáveis obrigatórias ausentes: ' + missing.join(', '));
}

async function createBot() {
  validateRuntimeConfig();
  await connectDatabase();
  await initializeDatabase();

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.GuildVoiceStates,
    ],
    partials: [Partials.Channel],
  });
  client.config = config;
  client.commands = loadCommands();
  loadEvents(client);
  client.on('error', (error) => logger.error('Erro no cliente Discord (' + (error?.code || error?.name || 'erro') + ').'));
  await client.login(config.token);
  return client;
}

async function shutdown(client) {
  stopVoiceXp();
  if (client) client.destroy();
  await closeDatabase().catch(() => {});
}

if (require.main === module) {
  let client;
  createBot()
    .then((startedClient) => { client = startedClient; })
    .catch(async (error) => {
      logger.error('Inicialização interrompida (' + (error?.code || error?.name || 'erro desconhecido') + ').');
      process.exitCode = 1;
      await shutdown(client);
    });

  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, () => {
      logger.info('Encerrando o Kiryu.');
      shutdown(client).finally(() => process.exit());
    });
  }
}

module.exports = { createBot, validateRuntimeConfig, shutdown };
