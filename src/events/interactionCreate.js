const { Events } = require('discord.js');
const { handleInteraction } = require('../handlers/commandHandler');

module.exports = {
  name: Events.InteractionCreate,
  execute: handleInteraction,
};
