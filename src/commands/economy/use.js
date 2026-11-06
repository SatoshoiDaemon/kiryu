const { SlashCommandBuilder } = require('discord.js');
const { useInventoryItem } = require('../../modules/economyService');
const { replyV2 } = require('../../modules/components');
const config = require('../../config');

const data = new SlashCommandBuilder()
  .setName('use')
  .setDescription('Utilize um item do seu inventário pelo identificador.')
  .addStringOption((option) => option.setName('item').setDescription('Identificador do item, exibido na configuração da loja').setRequired(true).setMaxLength(32));

async function execute(interaction) {
  if (interaction.guildId !== config.guildId) return;
  const sku = interaction.options.getString('item').toLowerCase();
  const result = await useInventoryItem({ guildId: interaction.guildId, userId: interaction.user.id, sku });
  const text = result.item.useMessage || result.item.effectDescription || 'O item foi utilizado. Seu efeito pode ser interpretado dentro do RP.';
  await replyV2(interaction, '## ' + result.item.emoji + ' ' + result.item.name + '\n' + text + '\n' + (result.consumed ? 'O item foi consumido.' : 'O item permanece no inventário.'));
}

module.exports = { data, execute };
