const { SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, MessageFlags, SectionBuilder, ThumbnailBuilder } = require('discord.js');
const { UserXp, EconomyAccount } = require('../../database');
const { decorateContainer, systemAsset } = require('../../modules/components');
const { formatFragments } = require('../../modules/economyUtils');
const config = require('../../config');

const data = new SlashCommandBuilder().setName('ranking').setDescription('Veja quem está no topo do Eternity.')
  .addStringOption((option) => option.setName('board').setDescription('Quadro de líderes').setRequired(true).addChoices(
    { name: 'Níveis do Eternity', value: 'levels' }, { name: 'Fragmentos na carteira', value: 'wallet' },
  ));

async function execute(interaction) {
  if (interaction.guildId !== config.guildId) return;
  const category = interaction.options.getString('board');
  const rows = category === 'levels'
    ? await UserXp.find({ guildId: interaction.guildId }).sort({ level: -1, xp: -1 }).limit(10).lean()
    : await EconomyAccount.find({ guildId: interaction.guildId }).sort({ wallet: -1 }).limit(10).lean();
  const levelBoard = category === 'levels';
  const container = new ContainerBuilder().setAccentColor(levelBoard ? config.visual.xp : config.visual.fragments)
    .addSectionComponents(require('../../modules/components').headerSection(levelBoard ? 'Hall do Eternity' : 'Fortuna do servidor', levelBoard ? 'Os níveis atuais do RP em destaque.' : 'As bolsas mais pesadas da comunidade.', levelBoard ? 'xp' : 'fragments'));
  if (!rows.length) container.addTextDisplayComponents(new TextDisplayBuilder().setContent('Ainda não há nomes no quadro. Alguém vai inaugurar essa lista.'));
  rows.forEach((entry, index) => {
    if (index === 3) container.addSeparatorComponents(new SeparatorBuilder());
    const user = interaction.client.users.cache.get(entry.userId);
    const avatar = user?.displayAvatarURL({ extension: 'png', size: 128 }) || systemAsset('profile');
    const line = levelBoard
      ? (index === 0 ? '👑' : index === 1 ? '🥈' : index === 2 ? '🥉' : '**' + String(index + 1).padStart(2, '0')) + '  ·  **<@' + entry.userId + '>**\nNível **' + entry.level + '** · ' + entry.xp.toLocaleString('pt-BR') + ' XP neste nível'
      : '**' + String(index + 1).padStart(2, '0') + '  ·  <@' + entry.userId + '>**\nCarteira: ' + formatFragments(entry.wallet);
    container.addSectionComponents(new SectionBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent(line))
      .setThumbnailAccessory(new ThumbnailBuilder().setURL(avatar).setDescription('Membro na posição ' + (index + 1))));
  });
  decorateContainer(container);
  await interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2, allowedMentions: { parse: [] } });
}

module.exports = { data, execute };
