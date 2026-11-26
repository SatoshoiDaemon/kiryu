const {
  ActionRowBuilder, MessageFlags, StringSelectMenuBuilder, SlashCommandBuilder,
} = require('discord.js');
const { BadgeDefinition, MemberProfile } = require('../../database');
const { isAuthorized } = require('../../modules/permissions');
const { createContainer, replyV2 } = require('../../modules/components');
const config = require('../../config');

const data = new SlashCommandBuilder().setName('badges').setDescription('Atribua badges especiais da staff a membros.')
  .addSubcommand((subcommand) => subcommand.setName('assign').setDescription('Atribui uma badge especial').addUserOption((option) => option.setName('member').setDescription('Membro que receberá a badge').setRequired(true)))
  .addSubcommand((subcommand) => subcommand.setName('remove').setDescription('Remove uma badge especial').addUserOption((option) => option.setName('member').setDescription('Membro da equipe ou comunidade').setRequired(true)));

async function execute(interaction) {
  if (!await isAuthorized(interaction.member, interaction.user.id, interaction.guildId)) {
    return replyV2(interaction, 'Você não tem permissão para atribuir badges especiais.', { ephemeral: true });
  }
  const mode = interaction.options.getSubcommand();
  const member = interaction.options.getUser('member', true);
  const assigned = mode === 'remove' ? await MemberProfile.findOne({ guildId: interaction.guildId, userId: member.id }).lean() : null;
  const filter = mode === 'remove' ? { guildId: interaction.guildId, _id: { $in: assigned?.specialBadges || [] } } : { guildId: interaction.guildId };
  const badges = await BadgeDefinition.find(filter).sort({ category: 1, name: 1 }).limit(25).lean();
  if (!badges.length) return replyV2(interaction, mode === 'remove' ? 'Esse membro não tem badges especiais para remover.' : 'Não há badges especiais cadastradas. Use `/config` para criar uma.', { ephemeral: true });
  const menu = new StringSelectMenuBuilder().setCustomId('badge-admin:' + mode + ':' + member.id)
    .setPlaceholder(mode === 'remove' ? 'Escolher badges para remover' : 'Escolher badges para atribuir')
    .setMinValues(1).setMaxValues(Math.min(25, badges.length))
    .addOptions(badges.map((badge) => ({ label: badge.name, value: String(badge._id), description: (badge.symbol + ' · ' + badge.category).slice(0, 100) })));
  await interaction.editReply({
    components: [createContainer('# Badges especiais · ' + (mode === 'remove' ? 'Remover' : 'Atribuir') + '\nMembro: <@' + member.id + '>\nSelecione uma ou mais badges.', [new ActionRowBuilder().addComponents(menu)], config.visual.profile)],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  });
}

async function handleBadgeInteraction(interaction) {
  const customId = interaction.customId || '';
  if (!customId.startsWith('badge-admin:') || !interaction.isStringSelectMenu()) return false;
  const [, mode, memberId] = customId.split(':');
  if (!['assign', 'remove'].includes(mode) || !await isAuthorized(interaction.member, interaction.user.id, interaction.guildId)) {
    await replyV2(interaction, 'Acesso negado ou operação inválida.', { ephemeral: true }); return true;
  }
  const badges = await BadgeDefinition.find({ guildId: interaction.guildId, _id: { $in: interaction.values } }).select('_id').lean();
  const badgeIds = badges.map((badge) => String(badge._id));
  if (!badgeIds.length) return replyV2(interaction, 'As badges selecionadas não estão mais disponíveis.', { ephemeral: true });
  if (mode === 'assign') {
    await MemberProfile.findOneAndUpdate({ guildId: interaction.guildId, userId: memberId }, { $addToSet: { specialBadges: { $each: badgeIds } } }, { upsert: true, returnDocument: 'after', runValidators: true });
  } else {
    await MemberProfile.updateOne({ guildId: interaction.guildId, userId: memberId }, { $pullAll: { specialBadges: badgeIds } });
  }
  await interaction.update({ components: [createContainer('# Badges atualizadas\n' + badgeIds.length + ' badge(s) ' + (mode === 'assign' ? 'atribuída(s) a ' : 'removida(s) de ') + '<@' + memberId + '>.', [], config.visual.profile)], flags: MessageFlags.IsComponentsV2, allowedMentions: { parse: [] } });
  return true;
}

module.exports = { data, execute, deferEphemeral: true, handleBadgeInteraction };
