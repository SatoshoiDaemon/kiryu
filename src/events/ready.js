const { Events } = require('discord.js');
const { registerSlashCommands } = require('../handlers/registerSlashCommands');
const { startVoiceXp } = require('../modules/voiceXp');
const logger = require('../logger');

async function execute(client) {
  logger.info('Kiryu conectado ao Discord como ' + client.user.tag + '.');
  startVoiceXp(client);
  try {
    await registerSlashCommands(client);
  } catch {
    logger.error('O bot iniciou, mas a sincronização dos comandos slash falhou.');
  }
}

module.exports = { name: Events.ClientReady, once: true, execute };
