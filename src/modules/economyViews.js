const {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ContainerBuilder, MessageFlags,
  SectionBuilder, SeparatorBuilder, StringSelectMenuBuilder, TextDisplayBuilder,
} = require('discord.js');
const { ORBS, ORB_TYPES, FRAGMENT_EMOJI, formatFragments } = require('./economyUtils');
const { itemAvailability } = require('./economyService');

function makeContainer({ text = null, sections = [], rows = [], accentColor = 0x5865F2 } = {}) {
  const container = new ContainerBuilder().setAccentColor(accentColor);
  if (text) container.addTextDisplayComponents(new TextDisplayBuilder().setContent(text));
  for (const section of sections) container.addSectionComponents(section);
  for (const row of rows) container.addActionRowComponents(row);
  return container;
}

function basicContainer(text, rows = [], accentColor = 0x5865F2) {
  return makeContainer({ text, rows, accentColor });
}

function payload(container, ephemeral = false) {
  return {
    components: [container],
    flags: ephemeral ? MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral : MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  };
}

async function respond(interaction, response) {
  if (interaction.deferred || interaction.replied) {
    return interaction.editReply({
      components: response.components,
      flags: MessageFlags.IsComponentsV2,
      allowedMentions: response.allowedMentions || { parse: [] },
    });
  }
  return interaction.reply(response);
}

function priceLabel(item) {
  if (item.currency === 'fragments') return formatFragments(item.price * item.purchaseQuantity);
  const orb = ORBS[item.orbType];
  return (item.price * item.purchaseQuantity).toLocaleString('pt-BR') + ' ' + (orb?.emoji || '🔮');
}

function availabilityLabel(item, now) {
  if (item.availableFrom && new Date(item.availableFrom).getTime() > new Date(now).getTime()) {
    return '⏳ Disponível a partir de ' + new Date(item.availableFrom).toLocaleString('pt-BR', { timeZone: 'UTC' }) + ' UTC';
  }
  const status = itemAvailability(item, now);
  if (!status.available) return '⛔ ' + status.reason;
  const details = [];
  if (item.stock !== null) details.push('Estoque: ' + item.stock.toLocaleString('pt-BR'));
  if (item.availableUntil) details.push('Disponível até ' + new Date(item.availableUntil).toLocaleString('pt-BR', { timeZone: 'UTC' }) + ' UTC');
  return details.length ? '✅ ' + details.join(' · ') : '✅ Disponível';
}

function storeContainer(items, currency, page, pages, now = new Date()) {
  const isOrbs = currency === 'orbs';
  const title = isOrbs ? 'Loja de Orbes' : 'Loja de Fragmentos';
  const intro = isOrbs
    ? 'Itens avançados comprados com Orbes. Selecione o preço para confirmar uma compra.'
    : 'Itens do Eternity Realms comprados com Fragmentos. Selecione o preço para confirmar uma compra.';
  const container = new ContainerBuilder().setAccentColor(isOrbs ? 0xE08B24 : 0x008C52)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent('# ' + title + '\n' + intro));

  if (!items.length) {
    container.addSeparatorComponents(new SeparatorBuilder());
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent('A loja está vazia no momento.'));
  } else {
    items.forEach((item, index) => {
      if (index) container.addSeparatorComponents(new SeparatorBuilder());
      const status = availabilityLabel(item, now);
      const description = String(item.description || 'Sem descrição.').slice(0, 950);
      const itemText = '**' + (item.emoji || '📦') + ' ' + item.name + '**\n' + description + '\n\n' + status;
      const button = new ButtonBuilder()
        .setCustomId('econ:store:buy:' + item._id + ':' + currency + ':' + page)
        .setLabel((item.price * item.purchaseQuantity).toLocaleString('pt-BR'))
        .setStyle(ButtonStyle.Success)
        .setDisabled(!itemAvailability(item, now).available);
      if (item.currency === 'fragments') button.setEmoji({ id: '1568121720857170000', name: 'fragmento' });
      else button.setEmoji(ORBS[item.orbType]?.emoji || '🔮');
      container.addSectionComponents(new SectionBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(itemText))
        .setButtonAccessory(button));
    });
  }

  container.addSeparatorComponents(new SeparatorBuilder());
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent('Página **' + (page + 1) + '/' + pages + '** · Use os botões para navegar.'));
  container.addActionRowComponents(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('econ:store:page:' + currency + ':' + Math.max(0, page - 1)).setLabel('Página anterior').setStyle(ButtonStyle.Secondary).setDisabled(page <= 0),
    new ButtonBuilder().setCustomId('econ:store:page:' + currency + ':' + Math.min(pages - 1, page + 1)).setLabel('Próxima página').setStyle(ButtonStyle.Primary).setDisabled(page >= pages - 1),
  ));
  return container;
}

function inventoryContainer(pageData, userId, ownerId, page = 0) {
  const container = new ContainerBuilder().setAccentColor(0x8B0000)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent('# Inventário\nItens de <@' + userId + '> · ' + pageData.total.toLocaleString('pt-BR') + ' entrada(s).'));
  if (!pageData.items.length) {
    container.addSeparatorComponents(new SeparatorBuilder());
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent('Este inventário está vazio.'));
  } else {
    pageData.items.forEach((entry, index) => {
      if (index) container.addSeparatorComponents(new SeparatorBuilder());
      const item = entry.itemSnapshot;
      const description = String(item.description || 'Sem descrição.').slice(0, 800);
      const usable = item.usable ? '✅ Utilizável' : '⛔ Não utilizável';
      const text = '**' + (item.emoji || '📦') + ' ' + item.name + '** × ' + entry.quantity.toLocaleString('pt-BR') + '\n' + description + '\n\n' + usable + ' · ID: `' + entry.sku + '`';
      const button = new ButtonBuilder()
        .setCustomId('econ:inventory:use:' + ownerId + ':' + entry.sku + ':' + page)
        .setLabel(item.usable ? 'Usar' : 'Não utilizável')
        .setStyle(item.usable ? ButtonStyle.Success : ButtonStyle.Secondary)
        .setDisabled(!item.usable || ownerId !== userId);
      container.addSectionComponents(new SectionBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(text))
        .setButtonAccessory(button));
    });
  }
  container.addSeparatorComponents(new SeparatorBuilder());
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent('Página **' + (page + 1) + '/' + pageData.pages + '**'));
  container.addActionRowComponents(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('econ:inventory:page:' + ownerId + ':' + userId + ':' + Math.max(0, page - 1)).setLabel('Anterior').setStyle(ButtonStyle.Secondary).setDisabled(page <= 0),
    new ButtonBuilder().setCustomId('econ:inventory:page:' + ownerId + ':' + userId + ':' + Math.min(pageData.pages - 1, page + 1)).setLabel('Próxima').setStyle(ButtonStyle.Primary).setDisabled(page >= pageData.pages - 1),
  ));
  return container;
}

function walletContainer(user, account, ownerId, allowControls = true) {
  const total = BigInt(account.wallet || 0) + BigInt(account.bank || 0);
  const text = [
    '# Carteira de ' + user.username,
    user.toString ? user.toString() : '<@' + user.id + '>',
    '## Fragmentos',
    '• Em mãos: **' + formatFragments(account.wallet) + '**',
    '• No banco: **' + formatFragments(account.bank) + '**',
    '• Total: **' + formatFragments(total) + '**',
  ].join('\n');
  const rows = allowControls ? [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('econ:wallet:inventory:' + ownerId).setLabel('Abrir inventário').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('econ:wallet:deposit:' + ownerId).setLabel('Depositar').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('econ:wallet:withdraw:' + ownerId).setLabel('Sacar').setStyle(ButtonStyle.Secondary),
    ),
  ] : [];
  return basicContainer(text, rows, 0x008C52);
}

function orbBalanceText(account) {
  return ORB_TYPES.map((type) => '• ' + ORBS[type].emoji + ' **' + ORBS[type].label + '**: ' + Number(account.orbs?.[type] || 0).toLocaleString('pt-BR')).join('\n');
}

function orbsContainer(account, ownerId, notice = '') {
  const sourceOptions = ORB_TYPES.slice(0, -1).map((type) => ({
    label: ORBS[type].label,
    value: type,
    description: 'Converter 10 ' + ORBS[type].label + ' em 1 ' + ORBS[ORB_TYPES[ORB_TYPES.indexOf(type) + 1]].label,
    emoji: ORBS[type].emoji,
  }));
  const select = new StringSelectMenuBuilder()
    .setCustomId('econ:orbs:source:' + ownerId)
    .setPlaceholder('Selecione a Orbe de origem')
    .addOptions(sourceOptions);
  return basicContainer((notice ? notice + '\n\n' : '') + '# Orbes\nSaldos independentes de Fragmentos. A conversão é sempre de 10 para 1 e exige confirmação.\n\n' + orbBalanceText(account), [
    new ActionRowBuilder().addComponents(select),
  ], 0x6B4BA1);
}

function collectContainer(rules, ownerId, page = 0) {
  const pageSize = 25;
  const pages = Math.max(1, Math.ceil(rules.length / pageSize));
  const currentPage = Math.min(Math.max(0, page), pages - 1);
  const visible = rules.slice(currentPage * pageSize, (currentPage + 1) * pageSize);
  const description = visible.length
    ? visible.map((rule) => '• **' + String(rule.name).slice(0, 60) + '** — ' + rule.fragments.toLocaleString('pt-BR') + ' ' + FRAGMENT_EMOJI + (rule.orbType && rule.orbAmount ? ' · ' + rule.orbAmount.toLocaleString('pt-BR') + ' ' + ORBS[rule.orbType].emoji : '')).join('\n')
    : 'Nenhuma recompensa está disponível para seus cargos agora.';
  const rows = visible.length ? [new ActionRowBuilder().addComponents(new StringSelectMenuBuilder()
    .setCustomId('econ:collect:select:' + ownerId)
    .setPlaceholder('Escolha uma recompensa')
    .addOptions(visible.map((rule) => ({
      label: String(rule.name).slice(0, 100),
      value: String(rule._id),
      description: (rule.stackable ? 'Pode acumular com outras regras elegíveis' : 'Coleta individual') + ' · ' + rule.frequency,
    }))))] : [];
  if (pages > 1) rows.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('econ:collect:page:' + ownerId + ':' + Math.max(0, currentPage - 1)).setLabel('Anterior').setStyle(ButtonStyle.Secondary).setDisabled(currentPage <= 0),
    new ButtonBuilder().setCustomId('econ:collect:page:' + ownerId + ':' + Math.min(pages - 1, currentPage + 1)).setLabel('Próxima').setStyle(ButtonStyle.Primary).setDisabled(currentPage >= pages - 1),
  ));
  const footer = pages > 1 ? '\n\nPágina ' + (currentPage + 1) + '/' + pages + '.' : '';
  return basicContainer('# Recompensas por cargo\nAs recompensas disponíveis são determinadas pelos cargos que você possui.\n\n' + description + footer, rows, 0x8B0000);
}

module.exports = {
  makeContainer, basicContainer, payload, respond, priceLabel, availabilityLabel, storeContainer,
  inventoryContainer, walletContainer, orbBalanceText, orbsContainer, collectContainer,
};
