const { SlashCommandBuilder } = require('discord.js');
const { getProfile } = require('../../modules/xpService');
const { levelContainer } = require('../../modules/levelView');
const { MessageFlags } = require('discord.js');
const config = require('../../config');

const data = new SlashCommandBuilder()
  .setName('level')
  .setDescription('Consulta seu nível ou o de outro usuário')
  .addUserOption((option) => option.setName('usuario').setDescription('Usuário para consultar').setRequired(false));

async function execute(interaction) {
  if (interaction.guildId !== config.guildId) return;
  const target = interaction.options.getUser('usuario') || interaction.user;
  const profile = await getProfile(interaction.guildId, target.id);
  await interaction.reply({
    components: [levelContainer(target, profile)],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  });
}

async function executePrefix(message) {
  if (message.guildId !== config.guildId) return;
  const target = message.mentions.users.first() || message.author;
  const profile = await getProfile(message.guildId, target.id);
  await message.reply({
    components: [levelContainer(target, profile)],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { repliedUser: false, parse: [] },
  });
}

module.exports = { data, execute, executePrefix };
