const { SlashCommandBuilder } = require('discord.js');
const { executeConfigCommand } = require('../../modules/configPanel');

const data = new SlashCommandBuilder()
  .setName('config')
  .setDescription('Abre o painel de configuração para o proprietário e a equipe autorizada')
  .addAttachmentOption((option) => option.setName('prompt_file').setDescription('Importa um System Prompt em arquivo .txt (até 32.000 caracteres)').setRequired(false))
  .addAttachmentOption((option) => option.setName('asset_file').setDescription('Envia uma imagem para o Square Cloud Blob').setRequired(false))
  .addStringOption((option) => option.setName('asset_category').setDescription('Categoria do asset').setRequired(false).addChoices(
    { name: 'Perfil', value: 'profile' }, { name: 'Badge', value: 'badge' }, { name: 'Moldura', value: 'frame' },
    { name: 'Cosmético', value: 'cosmetic' }, { name: 'Produto', value: 'product' }, { name: 'Cassino', value: 'casino' },
    { name: 'Banner', value: 'banner' }, { name: 'Divisória', value: 'divider' }, { name: 'Design System', value: 'design-system' },
    { name: 'Gatilho', value: 'trigger' }, { name: 'Outro', value: 'other' },
  ))
  .addStringOption((option) => option.setName('asset_name').setDescription('Nome do asset').setRequired(false).setMaxLength(100))
  .addStringOption((option) => option.setName('asset_target_sku').setDescription('SKU de produto para associar a imagem').setRequired(false).setMaxLength(32))
  .addStringOption((option) => option.setName('asset_trigger_id').setDescription('ID do gatilho para associar imagem ou GIF').setRequired(false).setMaxLength(30))
  .addStringOption((option) => option.setName('asset_badge_id').setDescription('ID de badge especial para associar uma arte').setRequired(false).setMaxLength(30))
  .addStringOption((option) => option.setName('asset_cosmetic_id').setDescription('ID de badge cosmética para adicionar uma arte').setRequired(false).setMaxLength(40))
  .addStringOption((option) => option.setName('asset_frame').setDescription('Moldura global para adicionar uma sobreposição PNG').setRequired(false).addChoices(
    { name: 'Clássica', value: 'classic' }, { name: 'Real', value: 'royal' }, { name: 'Neon', value: 'neon' }, { name: 'Rúnica', value: 'rune' },
    { name: 'Ornamentada', value: 'ornate' }, { name: 'Minimalista', value: 'minimal' }, { name: 'Dourada', value: 'gilded' }, { name: 'Espinhos', value: 'thorn' },
  ))
  .addStringOption((option) => option.setName('replace_object_id').setDescription('ID do objeto Blob que esta imagem substituirá').setRequired(false).setMaxLength(100));

module.exports = { data, execute: executeConfigCommand, deferEphemeral: true };
