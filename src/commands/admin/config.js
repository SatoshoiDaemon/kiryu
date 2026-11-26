const { SlashCommandBuilder } = require('discord.js');
const { executeConfigCommand } = require('../../modules/configPanel');

const data = new SlashCommandBuilder()
  .setName('config')
  .setDescription('Abre o painel de configuração para o proprietário e a equipe autorizada')
  .addAttachmentOption((option) => option.setName('prompt_file').setDescription('Importa um System Prompt em arquivo .txt (até 32.000 caracteres)').setRequired(false));

module.exports = { data, execute: executeConfigCommand, deferEphemeral: true };
