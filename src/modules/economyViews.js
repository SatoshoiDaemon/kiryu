const {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ContainerBuilder, MediaGalleryBuilder, MediaGalleryItemBuilder, MessageFlags,
  SectionBuilder, SeparatorBuilder, StringSelectMenuBuilder, TextDisplayBuilder, ThumbnailBuilder,
} = require('discord.js');
const { ORBS, ORB_TYPES, FRAGMENT_EMOJI, formatFragments } = require('./economyUtils');
const { itemAvailability } = require('./economyService');
const { decorateContainer, headerSection, resourceSection, systemAsset } = require('./components');
const config = require('../config');

function makeContainer({ text = null, sections = [], rows = [], accentColor = 0x5865F2 } = {}) {
  const container = new ContainerBuilder().setAccentColor(accentColor);
  const heading = text ? String(text).split('\n').find((line) => /^#{1,3}\s+/.test(line)) : null;
  if (heading) {
    const cleanText = String(text).replace(heading, '').trim();
    const [subtitle = '', ...remaining] = cleanText.split('\n');
    const theme = accentColor === config.visual.fragments ? 'fragments' : accentColor === config.visual.orbs ? 'orbs' : accentColor === config.visual.store ? 'store' : 'brand';
    container.addSectionComponents(headerSection(heading.replace(/^#{1,3}\s+/, ''), subtitle, theme));
    if (remaining.join('\n').trim()) container.addTextDisplayComponents(new TextDisplayBuilder().setContent(remaining.join('\n').trim()));
  } else if (text) container.addTextDisplayComponents(new TextDisplayBuilder().setContent(text));
  for (const section of sections) container.addSectionComponents(section);
  for (const row of rows) container.addActionRowComponents(row);
  return decorateContainer(container);
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

function storeContainer(items, currency, page, pages, now = new Date(), ownerId = '') {
  const isOrbs = currency === 'orbs';
  const title = isOrbs ? 'Loja de Orbes' : 'Loja de Fragmentos';
  const intro = isOrbs
    ? 'Itens avançados comprados com Orbes. Selecione o preço para confirmar uma compra.'
    : 'Itens do Eternity Realms comprados com Fragmentos. Selecione o preço para confirmar uma compra.';
  const container = new ContainerBuilder().setAccentColor(isOrbs ? config.visual.orbs : config.visual.store)
    .addSectionComponents(headerSection(title, intro, isOrbs ? 'orbs' : 'store'));
  const rows = [];

  if (!items.length) {
    container.addSeparatorComponents(new SeparatorBuilder());
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent('**As prateleiras estão vazias por enquanto.**\nA equipe deve anunciar a próxima leva pelo painel de configuração.'));
  } else {
    items.forEach((item, index) => {
      if (index) container.addSeparatorComponents(new SeparatorBuilder());
      const status = availabilityLabel(item, now);
      const description = String(item.description || 'Sem descrição.').replace(/\s+/g, ' ').slice(0, 100);
      const cost = item.currency === 'fragments' ? formatFragments(item.price * item.purchaseQuantity) : (item.price * item.purchaseQuantity).toLocaleString('pt-BR') + ' ' + (ORBS[item.orbType]?.sigil || '✦');
      const itemText = '**' + (item.emoji || '📦') + ' ' + item.name + '**\n' + description + '\n\n**' + cost + '** por unidade configurada · ' + status;
      const button = new ButtonBuilder()
        .setCustomId('econ:store:detail:' + ownerId + ':' + item._id + ':' + currency + ':' + page)
        .setLabel('Ver detalhes')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(!itemAvailability(item, now).available);
      const section = new SectionBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent(itemText));
      if (item.thumbnailUrl && /^https:\/\//i.test(item.thumbnailUrl)) {
        section.setThumbnailAccessory(new ThumbnailBuilder().setURL(item.thumbnailUrl).setDescription(item.name));
        rows.push(new ActionRowBuilder().addComponents(button));
      } else {
        section.setButtonAccessory(button);
      }
      container.addSectionComponents(section);
    });
  }

  container.addSeparatorComponents(new SeparatorBuilder());
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent('Página **' + (page + 1) + '/' + pages + '** · Use os botões para navegar.'));
  for (const row of rows) container.addActionRowComponents(row);
  container.addActionRowComponents(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('econ:store:page:' + currency + ':' + Math.max(0, page - 1) + ':previous').setLabel('Página anterior').setStyle(ButtonStyle.Secondary).setDisabled(page <= 0),
    new ButtonBuilder().setCustomId('econ:store:page:' + currency + ':' + Math.min(pages - 1, page + 1) + ':next').setLabel('Próxima página').setStyle(ButtonStyle.Primary).setDisabled(page >= pages - 1),
  ));
  return decorateContainer(container);
}

function storeItemContainer(item, currency, page, ownerId, units = 1, selectedChoice = null) {
  const unitCount = item.purchaseQuantity * units;
  const total = item.price * unitCount;
  const price = item.currency === 'fragments' ? formatFragments(total) : total.toLocaleString('pt-BR') + ' ' + (ORBS[item.orbType]?.sigil || '✦') + ' Orbes ' + ORBS[item.orbType]?.label;
  const header = headerSection(item.name, 'Detalhes do item · ' + (item.emoji || '📦'), currency === 'orbs' ? 'orbs' : 'store');
  const container = new ContainerBuilder().setAccentColor(currency === 'orbs' ? config.visual.orbs : config.visual.store)
    .addSectionComponents(header)
    .addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder()
      .setURL(item.thumbnailUrl && /^https:\/\//i.test(item.thumbnailUrl) ? item.thumbnailUrl : systemAsset(currency === 'orbs' ? 'orbs' : 'store'))
      .setDescription(item.name)));
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
    String(item.description || 'Sem descrição.').slice(0, 950) +
    '\n\n**Preço total:** ' + price + '\n**Quantidade:** ' + unitCount.toLocaleString('pt-BR') +
    (item.stock === null ? '\n**Estoque:** ilimitado' : '\n**Estoque:** ' + item.stock.toLocaleString('pt-BR')) +
    '\n**Entrega:** ' + (item.delivery === 'inventory' ? 'inventário' : 'imediata') +
    (item.usable ? ' · utilizável pelo inventário' : ''),
  ));
  const quantity = new StringSelectMenuBuilder().setCustomId('econ:store:quantity:' + ownerId + ':' + item._id + ':' + currency + ':' + page)
    .setPlaceholder('Quantidade')
    .addOptions([1, 2, 5, 10].map((value) => ({ label: (item.purchaseQuantity * value).toLocaleString('pt-BR') + ' unidade(s)', value: String(value), default: value === units })));
  container.addActionRowComponents(new ActionRowBuilder().addComponents(quantity));
  if (item.purchaseChoices?.length) {
    const variants = new StringSelectMenuBuilder().setCustomId('econ:store:variant:' + ownerId + ':' + item._id + ':' + currency + ':' + page + ':' + units)
      .setPlaceholder(selectedChoice ? 'Opção: ' + selectedChoice.label : 'Escolha uma opção')
      .addOptions(item.purchaseChoices.slice(0, 25).map((choice) => ({
        label: choice.label, value: choice.value, description: choice.description || choice.label,
        default: selectedChoice?.value === choice.value,
      })));
    container.addActionRowComponents(new ActionRowBuilder().addComponents(variants));
  }
  const choiceIndex = selectedChoice ? item.purchaseChoices.findIndex((choice) => choice.value === selectedChoice.value) : -1;
  container.addActionRowComponents(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('econ:store:confirm:' + ownerId + ':' + item._id + ':' + currency + ':' + page + ':' + units + ':' + (choiceIndex < 0 ? 'x' : choiceIndex))
      .setLabel('Confirmar · ' + price).setStyle(ButtonStyle.Success).setDisabled(Boolean(item.purchaseChoices?.length && !selectedChoice)),
    new ButtonBuilder().setCustomId('econ:store:back:' + ownerId + ':' + currency + ':' + page).setLabel('Voltar à vitrine').setStyle(ButtonStyle.Secondary),
  ));
  return decorateContainer(container);
}

const INVENTORY_FILTERS = [
  { label: 'Tudo', value: 'all', description: 'Todos os itens visíveis' },
  { label: 'Prontos para uso', value: 'usable', description: 'Itens que podem ser acionados pelo bot' },
  { label: 'Lembranças', value: 'persistent', description: 'Itens que permanecem após o uso' },
  { label: 'Uso no RP', value: 'not_usable', description: 'Itens consultados e aplicados no RP textual' },
];

function inventoryContainer(pageData, userId, ownerId, page = 0, filter = 'all') {
  const container = new ContainerBuilder().setAccentColor(config.visual.brand)
    .addSectionComponents(headerSection('Inventário', 'Pertence a <@' + userId + '> · ' + pageData.total.toLocaleString('pt-BR') + ' item(ns) nesta categoria.', 'profile'));
  const filterMenu = new StringSelectMenuBuilder().setCustomId('econ:inventory:filter:' + ownerId + ':' + userId)
    .setPlaceholder('Filtrar inventário')
    .addOptions(INVENTORY_FILTERS.map((entry) => ({ ...entry, default: entry.value === filter })));
  container.addActionRowComponents(new ActionRowBuilder().addComponents(filterMenu));
  if (!pageData.items.length) {
    container.addSeparatorComponents(new SeparatorBuilder());
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(filter === 'all' ? 'A mochila está vazia por enquanto. A próxima lembrança pode vir de uma loja ou evento.' : 'Nenhum item combina com este filtro. Troque a categoria para procurar em outro bolso.'));
  } else {
    pageData.items.forEach((entry, index) => {
      const item = entry.itemSnapshot;
      const selectedChoice = item.selectedChoice?.label ? '\n**Escolha:** ' + item.selectedChoice.label : '';
      const text = '**' + (item.emoji || '📦') + ' ' + item.name + '** × ' + entry.quantity.toLocaleString('pt-BR') + selectedChoice + '\n' + (item.usable ? '🟢 Pronto para usar' : item.consumeOnUse === false ? '◇ Permanece após o uso' : '✧ Aplicado no RP');
      const button = new ButtonBuilder().setCustomId('econ:inventory:detail:' + ownerId + ':' + userId + ':' + entry._id + ':' + page + ':' + filter)
        .setLabel('Detalhes').setStyle(ButtonStyle.Primary);
      container.addSectionComponents(new SectionBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(text))
        .setButtonAccessory(button));
    });
  }
  container.addSeparatorComponents(new SeparatorBuilder());
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent('Página **' + (page + 1) + '/' + pageData.pages + '**'));
  container.addActionRowComponents(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('econ:inventory:page:' + ownerId + ':' + userId + ':' + Math.max(0, page - 1) + ':previous:' + filter).setLabel('Anterior').setStyle(ButtonStyle.Secondary).setDisabled(page <= 0),
      new ButtonBuilder().setCustomId('econ:inventory:page:' + ownerId + ':' + userId + ':' + Math.min(pageData.pages - 1, page + 1) + ':next:' + filter).setLabel('Próxima').setStyle(ButtonStyle.Primary).setDisabled(page >= pageData.pages - 1),
  ));
  return decorateContainer(container);
}

function inventoryDetailContainer(entry, ownerId, userId, page = 0, filter = 'all') {
  const item = entry.itemSnapshot;
  const description = String(item.description || 'Este item não tem descrição adicional.').slice(0, 900);
  const selectedChoice = item.selectedChoice?.label ? '\n\n**Escolha:** ' + item.selectedChoice.label : '';
  const use = new ButtonBuilder().setCustomId('econ:inventory:use:' + ownerId + ':' + entry._id + ':' + page + ':' + filter)
    .setLabel(item.usable ? 'Usar item' : 'Usado no RP')
    .setStyle(item.usable ? ButtonStyle.Success : ButtonStyle.Secondary)
    .setDisabled(!item.usable || ownerId !== userId);
  const detail = new ContainerBuilder().setAccentColor(config.visual.store)
    .addSectionComponents(headerSection(item.name, (item.emoji || '📦') + ' · detalhe do inventário', 'store'))
    .addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder()
      .setURL(item.thumbnailUrl && /^https:\/\//i.test(item.thumbnailUrl) ? item.thumbnailUrl : systemAsset('store'))
      .setDescription('Arte de ' + item.name)))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(description + selectedChoice + '\n\n**SKU:** `' + entry.sku + '` · use em `/market sell`\n**Quantidade:** ' + entry.quantity.toLocaleString('pt-BR') + '\n**Comportamento:** ' + (item.usable ? (item.consumeOnUse === false ? 'Pode ser usado e permanece no inventário.' : 'Pode ser usado; a configuração define consumo.') : 'O efeito é interpretado dentro do RP textual.')))
    .addActionRowComponents(new ActionRowBuilder().addComponents(use, new ButtonBuilder().setCustomId('econ:inventory:back:' + ownerId + ':' + userId + ':' + page + ':' + filter).setLabel('Voltar').setStyle(ButtonStyle.Secondary)));
  return decorateContainer(detail);
}

function walletContainer(user, account, ownerId, allowControls = true) {
  const total = BigInt(account.wallet || 0) + BigInt(account.bank || 0);
  const text = ['# Bolsa de ' + user.username, 'Os Fragmentos circulam por toda Eternity.', 'Em mãos: **' + formatFragments(account.wallet) + '** · No banco: **' + formatFragments(account.bank) + '** · Patrimônio: **' + formatFragments(total) + '**'].join('\n');
  const rows = allowControls ? [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('econ:wallet:inventory:' + ownerId).setLabel('Abrir inventário').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('econ:wallet:deposit:' + ownerId).setLabel('Depositar').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('econ:wallet:withdraw:' + ownerId).setLabel('Sacar').setStyle(ButtonStyle.Secondary),
    ),
  ] : [];
  return basicContainer(text, rows, config.visual.fragments);
}

function orbBalanceText(account) {
  return ORB_TYPES.map((type) => ORBS[type].sigil + ' **' + ORBS[type].label + '**: ' + Number(account.orbs?.[type] || 0).toLocaleString('pt-BR')).join('\n');
}

function orbsContainer(account, ownerId, notice = '', allowControls = true, member = null) {
  const sourceOptions = ORB_TYPES.slice(0, -1).map((type) => ({
    label: ORBS[type].label,
    value: type,
    description: 'Converter pela taxa definida no painel de configuração',
    emoji: ORBS[type].emoji,
  }));
  const rows = allowControls ? [new ActionRowBuilder().addComponents(new StringSelectMenuBuilder()
    .setCustomId('econ:orbs:source:' + ownerId)
    .setPlaceholder('Selecione a Orbe de origem')
    .addOptions(sourceOptions))] : [];
  const sections = ORB_TYPES.map((type) => resourceSection(ORBS[type].label, Number(account.orbs?.[type] || 0).toLocaleString('pt-BR') + ' Orbes', ORBS[type].sigil, 'orb-' + type));
  const title = member ? 'Reliquário de ' + member.username : 'Reliquário de Orbes';
  const instructions = allowControls
    ? 'Cada categoria mantém seu próprio saldo. A conversão segue a taxa atual definida pela equipe.'
    : 'Saldos públicos de Orbes do membro selecionado.';
  return makeContainer({ text: (notice ? notice + '\n\n' : '') + '# ' + title + '\n' + instructions, sections, rows, accentColor: config.visual.orbs });
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
  return basicContainer('# Recompensas por cargo\nAs recompensas disponíveis são determinadas pelos cargos que você possui.\n\n' + description + footer, rows, config.visual.brand);
}

module.exports = {
  makeContainer, basicContainer, payload, respond, priceLabel, availabilityLabel, storeContainer,
  storeItemContainer, inventoryContainer, inventoryDetailContainer, INVENTORY_FILTERS, walletContainer, orbBalanceText, orbsContainer, collectContainer,
};
