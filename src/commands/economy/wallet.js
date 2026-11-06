const { SlashCommandBuilder } = require('discord.js');
const { getAccount } = require('../../modules/economyService');
const { walletContainer, payload } = require('../../modules/economyViews');
const config = require('../../config');

const data = new SlashCommandBuilder()
  .setName('carteira')
  .setDescription('Consulte sua carteira ou a de outro usuário.')
  .addUserOption((option) => option.setName('usuario').setDescription('Usuário para consultar').setRequired(false));

async function execute(interaction) {
  if (interaction.guildId !== config.guildId) return;
  const user = interaction.options.getUser('usuario') || interaction.user;
  const account = await getAccount(interaction.guildId, user.id);
  const container = walletContainer(user, account, interaction.user.id, user.id === interaction.user.id);
  await interaction.reply(payload(container));
}

module.exports = { data, execute };
