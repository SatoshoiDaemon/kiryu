const { SlashCommandBuilder } = require('discord.js');
const { isAuthorized } = require('../../modules/permissions');
const { deliverItem, removeInventoryItems } = require('../../modules/economyService');
const { parseSku } = require('../../modules/economyAdminService');
const { showInventory } = require('../../modules/economyInteractions');
const { replyV2 } = require('../../modules/components');
const config = require('../../config');

function adjustment(subcommand, description) {
  return subcommand.addUserOption((option) => option.setName('member').setDescription('Membro afetado').setRequired(true))
    .addStringOption((option) => option.setName('sku').setDescription('Identificador do item no catálogo').setRequired(true).setMaxLength(32))
    .addIntegerOption((option) => option.setName('quantity').setDescription('Unidades').setMinValue(1).setMaxValue(1000000).setRequired(true));
}

const data = new SlashCommandBuilder().setName('inventory').setDescription('Veja seu inventário ou faça uma entrega pontual de equipe.')
  .addSubcommand((sub) => sub.setName('view').setDescription('Abra seu inventário ou visite o de outra pessoa')
    .addUserOption((option) => option.setName('member').setDescription('Pessoa cujo inventário quer ver').setRequired(false)))
  .addSubcommand((sub) => adjustment(sub.setName('add').setDescription('Entrega itens a um membro')))
  .addSubcommand((sub) => adjustment(sub.setName('remove').setDescription('Remove itens de um inventário')));

async function execute(interaction) {
  if (interaction.guildId !== config.guildId) return;
  const operation = interaction.options.getSubcommand();
  if (operation === 'view') {
    const target = interaction.options.getUser('member') || interaction.user;
    return showInventory(interaction, interaction.user.id, target.id, 0, false);
  }
  if (!(await isAuthorized(interaction.member, interaction.user.id, interaction.guildId))) {
    await replyV2(interaction, 'Essa operação pontual é exclusiva da equipe autorizada.', { ephemeral: true });
    return;
  }
  const member = interaction.options.getUser('member');
  const sku = parseSku(interaction.options.getString('sku'));
  const quantity = interaction.options.getInteger('quantity');
  if (operation === 'add') {
    const item = await deliverItem({ guildId: interaction.guildId, actorId: interaction.user.id, userId: member.id, sku, quantity });
    await replyV2(interaction, '# Item entregue\n' + item.emoji + ' **' + item.name + '** × ' + quantity.toLocaleString('pt-BR') + ' para ' + member + '.', { ephemeral: true, accentColor: config.visual.store });
  } else {
    const result = await removeInventoryItems({ guildId: interaction.guildId, actorId: interaction.user.id, userId: member.id, sku, quantity });
    await replyV2(interaction, '# Inventário atualizado\nRemovidas **' + result.removed.toLocaleString('pt-BR') + '** unidade(s) do inventário de ' + member + '.', { ephemeral: true, accentColor: config.visual.store });
  }
}

module.exports = { data, execute };
