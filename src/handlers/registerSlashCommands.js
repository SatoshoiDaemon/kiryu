const { REST, Routes } = require('discord.js');
const config = require('../config');
const logger = require('../logger');

async function registerSlashCommands(client) {
  const rest = new REST({ version: '10' }).setToken(config.token);
  const body = [...client.commands.values()].filter((command) => command.data).map((command) => command.data.toJSON());
  try {
    await rest.put(Routes.applicationGuildCommands(config.clientId, config.guildId), { body });
    logger.info(body.length + ' comandos slash sincronizados no servidor configurado.');
  } catch (error) {
    logger.error('Falha ao sincronizar comandos slash (' + (error?.code || error?.name || 'erro') + ').');
    throw error;
  }
}

module.exports = { registerSlashCommands };
