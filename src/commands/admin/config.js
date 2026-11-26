const { SlashCommandBuilder } = require('discord.js');
const { executeConfigCommand } = require('../../modules/configPanel');

const data = new SlashCommandBuilder()
  .setName('config')
  .setDescription('Abre o painel de configuração para o proprietário e a equipe autorizada');

module.exports = { data, execute: executeConfigCommand, deferEphemeral: true };
