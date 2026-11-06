const { SlashCommandBuilder } = require('discord.js');
const { getAccount } = require('../../modules/economyService');
const { orbsContainer, payload } = require('../../modules/economyViews');
const config = require('../../config');

const data = new SlashCommandBuilder().setName('orbes').setDescription('Consulte e converta seus saldos de Orbes.');

async function execute(interaction) {
  if (interaction.guildId !== config.guildId) return;
  const account = await getAccount(interaction.guildId, interaction.user.id);
  await interaction.reply(payload(orbsContainer(account, interaction.user.id), true));
}

module.exports = { data, execute };
