const { Events } = require('discord.js');
const { handleInteraction } = require('../handlers/commandHandler');

async function execute(interaction, client) {
  await handleInteraction(interaction, client);
}

module.exports = { name: Events.InteractionCreate, execute };
