const { SlashCommandBuilder } = require('discord.js');
const { parseDiceExpression } = require('../../modules/dice');
const { replyV2, replyMessageV2 } = require('../../modules/components');

const data = new SlashCommandBuilder()
  .setName('roll')
  .setDescription('Rola dados usando uma expressão como 2d20+3')
  .addStringOption((option) => option.setName('expressao').setDescription('Ex.: 1d20, 4d20+10 ou 3d6-2').setRequired(true).setMaxLength(32));

function format(result) {
  const modifierText = result.modifier ? ' · modificador ' + (result.modifier > 0 ? '+' : '') + result.modifier : '';
  return '## Rolagem ' + result.expression + '\n**Dados:** ' + result.rolls.join(' + ') + modifierText + '\n**Total:** ' + result.total;
}

async function execute(interaction) {
  const expression = interaction.options.getString('expressao');
  try {
    await replyV2(interaction, format(parseDiceExpression(expression)));
  } catch (error) {
    await replyV2(interaction, error.message);
  }
}

async function executePrefix(message, args) {
  try {
    await replyMessageV2(message, format(parseDiceExpression(args.join(' '))));
  } catch (error) {
    await replyMessageV2(message, error.message);
  }
}

module.exports = { data, execute, executePrefix };
