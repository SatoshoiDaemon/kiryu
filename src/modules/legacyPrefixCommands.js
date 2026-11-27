const { MessageFlags } = require('discord.js');
const { getProfile } = require('./xpService');
const { levelContainer } = require('./levelView');
const config = require('../config');

async function level(message) {
  if (message.guildId !== config.guildId) return;
  const target = message.mentions.users.first() || message.author;
  const profile = await getProfile(message.guildId, target.id);
  await message.reply({
    components: [levelContainer(target, profile)],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { repliedUser: false, parse: [] },
  });
}

async function roll(message, args, client) {
  const command = client.commands.get('dice');
  if (command?.executePrefix) return command.executePrefix(message, args, client);
}

module.exports = { level, roll };
