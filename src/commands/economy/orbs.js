const { SlashCommandBuilder } = require('discord.js');
const { getAccount, adjustOrbs } = require('../../modules/economyService');
const { orbsContainer, payload, respond } = require('../../modules/economyViews');
const { isAuthorized } = require('../../modules/permissions');
const { replyV2 } = require('../../modules/components');
const { ORBS, ORB_TYPES } = require('../../modules/economyUtils');
const config = require('../../config');

function orbTypeOption(option) {
  return option.setName('category').setDescription('Categoria da Orbe').setRequired(true)
    .addChoices(...ORB_TYPES.map((type) => ({ name: ORBS[type].label, value: type })));
}

function adjustmentOptions(sub, min = 1) {
  return sub.addUserOption((option) => option.setName('member').setDescription('Membro afetado').setRequired(true))
    .addStringOption((option) => orbTypeOption(option))
    .addIntegerOption((option) => option.setName('amount').setDescription('Quantidade').setMinValue(min).setMaxValue(1000000000000).setRequired(true));
}

const data = new SlashCommandBuilder().setName('orbs').setDescription('Consulte, converta e administre Orbes.')
  .addSubcommand((sub) => sub.setName('balance').setDescription('Consulte suas categorias de Orbes'))
  .addSubcommand((sub) => sub.setName('convert').setDescription('Converta Orbes pela taxa definida pela equipe'))
  .addSubcommand((sub) => adjustmentOptions(sub.setName('add').setDescription('Adiciona Orbes a um membro')))
  .addSubcommand((sub) => adjustmentOptions(sub.setName('remove').setDescription('Remove Orbes de um membro')))
  .addSubcommand((sub) => adjustmentOptions(sub.setName('set').setDescription('Define o saldo de uma categoria'), 0));

async function execute(interaction) {
  if (interaction.guildId !== config.guildId) return;
  const operation = interaction.options.getSubcommand();
  if (!['balance', 'convert'].includes(operation)) {
    if (!(await isAuthorized(interaction.member, interaction.user.id, interaction.guildId))) {
      await replyV2(interaction, 'Essa operação é exclusiva da equipe autorizada.', { ephemeral: true });
      return;
    }
    const member = interaction.options.getUser('member');
    const type = interaction.options.getString('category');
    const amount = interaction.options.getInteger('amount');
    const account = await adjustOrbs({ guildId: interaction.guildId, actorId: interaction.user.id, userId: member.id, type, amount, mode: operation, operation: 'admin_orbs_' + operation });
    await replyV2(interaction, '# Orbes atualizadas\n' + member + '\n**' + ORBS[type].emoji + ' ' + ORBS[type].label + ':** ' + account.orbs[type].toLocaleString('pt-BR'), { ephemeral: true, accentColor: config.visual.orbs });
    return;
  }
  const account = await getAccount(interaction.guildId, interaction.user.id);
  await respond(interaction, payload(orbsContainer(account, interaction.user.id), true));
}

module.exports = { data, execute, deferEphemeral: true };
