const { SlashCommandBuilder } = require('discord.js');
const { showStore } = require('../../modules/economyInteractions');
const config = require('../../config');

const data = new SlashCommandBuilder()
  .setName('loja')
  .setDescription('Abra a loja de Fragmentos ou de Orbes.')
  .addSubcommand((subcommand) => subcommand.setName('fragmentos').setDescription('Abra a loja de Fragmentos'))
  .addSubcommand((subcommand) => subcommand.setName('orbes').setDescription('Abra a loja de Orbes'));

async function execute(interaction) {
  if (interaction.guildId !== config.guildId) return;
  const currency = interaction.options.getSubcommand() === 'orbes' ? 'orbs' : 'fragments';
  await showStore(interaction, currency);
}

module.exports = { data, execute };
