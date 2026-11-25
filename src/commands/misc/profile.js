const {
  ActionRowBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle, ContainerBuilder,
  MediaGalleryBuilder, MediaGalleryItemBuilder, MessageFlags, ModalBuilder,
  StringSelectMenuBuilder, TextDisplayBuilder, TextInputBuilder, TextInputStyle,
} = require('discord.js');
const { SlashCommandBuilder } = require('discord.js');
const { getProfile } = require('../../modules/xpService');
const { getMemberProfile, renderMemberCard, getRank, updateCustomization } = require('../../modules/memberProfiles');
const { decorateContainer, headerSection } = require('../../modules/components');
const config = require('../../config');

const data = new SlashCommandBuilder().setName('profile').setDescription('Veja e personalize seu cartão de membro.')
  .addUserOption((option) => option.setName('member').setDescription('Perfil para visitar').setRequired(false));

const choices = {
  accent: [
    { label: 'Rosa Kiryu', value: 'rose' }, { label: 'Violeta', value: 'violet' },
    { label: 'Dourado', value: 'gold' }, { label: 'Esmeralda', value: 'emerald' }, { label: 'Gelo', value: 'ice' },
  ],
  background: [
    { label: 'Crepúsculo', value: 'dusk', description: 'Noite profunda em tons de ameixa' },
    { label: 'Carmesim', value: 'crimson', description: 'Veludo escuro e vermelho' },
    { label: 'Aurora', value: 'aurora', description: 'Luzes frias sobre o horizonte' },
    { label: 'Pergaminho', value: 'parchment', description: 'Tons antigos e dourados' },
  ],
  frame: [
    { label: 'Clássica', value: 'classic' }, { label: 'Real', value: 'royal' },
    { label: 'Neon', value: 'neon' }, { label: 'Rúnica', value: 'rune' },
  ],
  badges: [
    { label: 'Estrela', value: 'star' }, { label: 'Lua', value: 'moon' },
    { label: 'Chama', value: 'flame' }, { label: 'Cometa', value: 'comet' }, { label: 'Loureiro', value: 'laurel' },
  ],
};

function customizeSelect(kind, current) {
  const select = new StringSelectMenuBuilder()
    .setCustomId('profile:' + kind + ':self')
    .setPlaceholder(kind === 'accent' ? 'Paleta do cartão' : kind === 'background' ? 'Fundo do cartão' : kind === 'frame' ? 'Moldura do cartão' : 'Insígnias · até quatro')
    .addOptions(choices[kind].map((choice) => ({ ...choice, default: kind === 'badges' ? current.includes(choice.value) : current === choice.value })));
  if (kind === 'badges') select.setMinValues(0).setMaxValues(4);
  return new ActionRowBuilder().addComponents(select);
}

function editButton(action, label) {
  return new ButtonBuilder().setCustomId('profile:' + action + ':self').setLabel(label).setStyle(ButtonStyle.Secondary);
}

async function makePayload(user, guildId, ownerId, editable) {
  const [xp, customization] = await Promise.all([
    getProfile(guildId, user.id), getMemberProfile(guildId, user.id),
  ]);
  const rank = await getRank(guildId, xp);
  const image = await renderMemberCard(user, xp, customization, rank);
  const files = [new AttachmentBuilder(image, { name: 'perfil-kiryu.png' })];
  const card = new ContainerBuilder().setAccentColor(config.visual.profile)
    .addSectionComponents(headerSection((user.globalName || user.username) + ' · Perfil', 'Uma pequena vitrine da sua presença no Eternity.', 'profile'))
    .addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL('attachment://perfil-kiryu.png').setDescription('Cartão personalizado de ' + user.username)));
  if (editable) {
    card.addTextDisplayComponents(new TextDisplayBuilder().setContent('-# PRÉ-VISUALIZAÇÃO · as escolhas abaixo atualizam este cartão na hora'));
    card.addActionRowComponents(new ActionRowBuilder().addComponents(editButton('bio', 'Biografia'), editButton('title', 'Título'), editButton('reset', 'Voltar ao padrão')));
    card.addActionRowComponents(customizeSelect('accent', customization.accent || 'rose'));
    card.addActionRowComponents(customizeSelect('background', customization.background || 'dusk'));
    card.addActionRowComponents(customizeSelect('frame', customization.frame || 'classic'));
    card.addActionRowComponents(customizeSelect('badges', customization.badges || []));
  }
  decorateContainer(card);
  return { components: [card], files, attachments: [], flags: MessageFlags.IsComponentsV2, allowedMentions: { parse: [] } };
}

async function execute(interaction) {
  if (interaction.guildId !== config.guildId) return;
  const target = interaction.options.getUser('member') || interaction.user;
  await interaction.editReply(await makePayload(target, interaction.guildId, interaction.user.id, target.id === interaction.user.id));
}

function textModal(ownerId, field, title, label, maxLength) {
  const input = new TextInputBuilder().setCustomId(field).setLabel(label).setStyle(TextInputStyle.Short)
    .setMaxLength(maxLength).setRequired(false).setPlaceholder(field === 'title' ? 'Membro do Eternity' : 'Uma frase que tenha a sua cara');
  if (field === 'bio') input.setStyle(TextInputStyle.Paragraph);
  return new ModalBuilder().setCustomId('profile:save:' + field + ':' + ownerId).setTitle(title).addComponents(new ActionRowBuilder().addComponents(input));
}

async function refreshProfile(interaction, ownerId) {
  await interaction.editReply(await makePayload(interaction.user, interaction.guildId, ownerId, true));
}

async function handleProfileInteraction(interaction) {
  const id = interaction.customId || '';
  if (!id.startsWith('profile:')) return false;
  const parts = id.split(':');
  const action = parts[1];
  const ownerKey = action === 'save' ? parts[3] : parts[2];
  const ownerId = ownerKey === 'self' ? interaction.user.id : ownerKey;
  if (ownerId !== interaction.user.id || interaction.guildId !== config.guildId) {
    await require('../../modules/components').replyV2(interaction, 'Esse cartão pertence a outra pessoa.', { ephemeral: true });
    return true;
  }
  if (action === 'bio' && interaction.isButton()) {
    await interaction.showModal(textModal(ownerId, 'bio', 'Biografia do perfil', 'Uma linha sobre você', 160));
    return true;
  }
  if (action === 'title' && interaction.isButton()) {
    await interaction.showModal(textModal(ownerId, 'title', 'Título do perfil', 'Como quer aparecer no Eternity?', 40));
    return true;
  }
  if (action === 'reset' && interaction.isButton()) {
    await interaction.deferUpdate();
    await updateCustomization(interaction.guildId, ownerId, { accent: 'rose', background: 'dusk', frame: 'classic', badges: [], title: 'Membro do Eternity', bio: '' });
    await refreshProfile(interaction, ownerId);
    return true;
  }
  if (['accent', 'background', 'frame', 'badges'].includes(action) && interaction.isStringSelectMenu()) {
    const patch = action === 'badges' ? { badges: interaction.values } : { [action]: interaction.values[0] };
    await interaction.deferUpdate();
    await updateCustomization(interaction.guildId, ownerId, patch);
    await refreshProfile(interaction, ownerId);
    return true;
  }
  if (action === 'save' && interaction.isModalSubmit()) {
    const field = parts[2];
    const value = interaction.fields.getTextInputValue(field).trim();
    await interaction.deferUpdate();
    await updateCustomization(interaction.guildId, ownerId, { [field]: value });
    await refreshProfile(interaction, ownerId);
    return true;
  }
  return false;
}

module.exports = { data, execute, handleProfileInteraction, makePayload, choices };
