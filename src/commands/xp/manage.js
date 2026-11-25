const { SlashCommandBuilder } = require('discord.js');
const { isAuthorized } = require('../../modules/permissions');
const { replyV2 } = require('../../modules/components');
const { grantXp, subtractXp, grantLevels, subtractLevels, setTotalXp, setLevel, getProfile } = require('../../modules/xpService');
const config = require('../../config');
const { levelContainer } = require('../../modules/levelView');

function userAndAmount(command, maxValue = 1000000000000, minValue = 1) {
  return command.addUserOption((option) => option.setName('member').setDescription('Membro afetado').setRequired(true))
    .addIntegerOption((option) => option.setName('amount').setDescription('Valor inteiro').setRequired(true).setMinValue(minValue).setMaxValue(maxValue));
}

const data = new SlashCommandBuilder().setName('xp').setDescription('Gerencie XP e níveis do Eternity.')
  .addSubcommand((sub) => userAndAmount(sub.setName('add').setDescription('Adiciona XP acumulado'), 1000000000000))
  .addSubcommand((sub) => userAndAmount(sub.setName('remove').setDescription('Remove XP acumulado'), 1000000000000))
  .addSubcommand((sub) => userAndAmount(sub.setName('set').setDescription('Define o XP acumulado total'), 1000000000000, 0))
  .addSubcommand((sub) => sub.setName('reset').setDescription('Zera XP e nível de um membro')
    .addUserOption((option) => option.setName('member').setDescription('Membro afetado').setRequired(true)))
  .addSubcommandGroup((group) => group.setName('level').setDescription('Operações diretas de nível')
    .addSubcommand((sub) => sub.setName('view').setDescription('Consulte o nível atual do Eternity')
      .addUserOption((option) => option.setName('member').setDescription('Perfil para consultar').setRequired(false)))
    .addSubcommand((sub) => userAndAmount(sub.setName('add').setDescription('Adiciona níveis'), 1000000))
    .addSubcommand((sub) => userAndAmount(sub.setName('remove').setDescription('Remove níveis'), 1000000))
    .addSubcommand((sub) => userAndAmount(sub.setName('set').setDescription('Define o nível'), 1000000, 0)));

async function execute(interaction) {
  if (interaction.guildId !== config.guildId) return;
  const group = interaction.options.getSubcommandGroup(false);
  const operation = interaction.options.getSubcommand();
  if (group === 'level' && operation === 'view') {
    const target = interaction.options.getUser('member') || interaction.user;
    const profile = await getProfile(interaction.guildId, target.id);
    return interaction.editReply({ components: [levelContainer(target, profile)], flags: require('discord.js').MessageFlags.IsComponentsV2, allowedMentions: { parse: [] } });
  }
  if (!(await isAuthorized(interaction.member, interaction.user.id, interaction.guildId))) {
    await replyV2(interaction, 'Essa operação pontual é exclusiva da equipe autorizada.', { ephemeral: true });
    return;
  }
  const member = interaction.options.getUser('member');
  const amount = group === 'level' || operation === 'reset' ? (operation === 'reset' ? 0 : interaction.options.getInteger('amount')) : interaction.options.getInteger('amount');
  let result;
  if (group === 'level') {
    if (operation === 'add') result = await grantLevels(interaction.guildId, member.id, amount);
    else if (operation === 'remove') result = await subtractLevels(interaction.guildId, member.id, amount);
    else result = await setLevel(interaction.guildId, member.id, amount);
  } else if (operation === 'add') result = await grantXp(interaction.guildId, member.id, amount, null, { applyBuff: false });
  else if (operation === 'remove') result = await subtractXp(interaction.guildId, member.id, amount);
  else result = await setTotalXp(interaction.guildId, member.id, amount);
  const profile = await getProfile(interaction.guildId, member.id);
  const label = group === 'level' ? 'nível' : 'XP acumulado';
  const outcome = operation === 'reset' ? 'XP e nível foram zerados.' : 'Alteração aplicada ao perfil persistente.';
  await replyV2(interaction, '# Eternity · Progressão atualizada\n' + member + ' · ' + outcome + '\n\n**Nível:** ' + profile.level.toLocaleString('pt-BR') + ' · **XP neste nível:** ' + profile.xp.toLocaleString('pt-BR') + '\n**Operação:** ' + (group === 'level' ? operation + ' ' + amount : operation + ' ' + amount.toLocaleString('pt-BR') + ' ' + label), { ephemeral: true, accentColor: config.visual.xp });
}

module.exports = { data, execute, deferEphemeral: true };
