const { SlashCommandBuilder } = require('discord.js');
const { randomInt } = require('node:crypto');
const { chooseOption } = require('../../modules/choose');
const { replyV2, replyMessageV2 } = require('../../modules/components');

const data = new SlashCommandBuilder()
  .setName('choose')
  .setDescription('Escolhe uma opção aleatoriamente')
  .addStringOption((option) => option.setName('opcoes').setDescription('Opções separadas por vírgula').setRequired(true).setMaxLength(1800));

function pick(input) {
  return chooseOption(input, () => randomInt(0, 1000000) / 1000000).choice;
}

async function execute(interaction) {
  try {
    await replyV2(interaction, '🎲 Minha escolha: **' + pick(interaction.options.getString('opcoes')) + '**');
  } catch (error) {
    await replyV2(interaction, error.message);
  }
}

async function executePrefix(message, args) {
  try {
    await replyMessageV2(message, '🎲 Minha escolha: **' + pick(args.join(' ')) + '**');
  } catch (error) {
    await replyMessageV2(message, error.message);
  }
}

module.exports = { data, execute, executePrefix };
