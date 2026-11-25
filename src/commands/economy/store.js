const { SlashCommandBuilder } = require('discord.js');
const { showStore } = require('../../modules/economyInteractions');
const config = require('../../config');

const data = new SlashCommandBuilder()
  .setName('shop')
  .setDescription('Explore as vitrines de Fragmentos e Orbes.')
  .addSubcommand((subcommand) => subcommand.setName('fragments').setDescription('Abra a vitrine de Fragmentos'))
  .addSubcommand((subcommand) => subcommand.setName('orbs').setDescription('Abra a vitrine de Orbes'));

async function execute(interaction) {
  if (interaction.guildId !== config.guildId) return;
  const currency = interaction.options.getSubcommand() === 'orbs' ? 'orbs' : 'fragments';
  await showStore(interaction, currency);
}

module.exports = { data, execute };
