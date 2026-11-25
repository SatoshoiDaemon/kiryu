const {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags, ModalBuilder,
  StringSelectMenuBuilder, TextInputBuilder, TextInputStyle,
} = require('discord.js');
const { isAuthorized } = require('./permissions');
const { EconomyItem } = require('../database');
const {
  getAccount, getSettings, buyItem, getStoreItem, listInventory, useInventoryItem, bankTransfer,
  convertOrbes, getClaimableRules, claimCollectRules, deleteCatalogItem, getStorePage,
} = require('./economyService');
const { editCatalogItem } = require('./economyAdminService');
const { ORBS, ORB_TYPES, EconomyError, orbConversion, formatFragments } = require('./economyUtils');
const {
  basicContainer, payload, respond, storeContainer, storeItemContainer, inventoryContainer, inventoryDetailContainer, orbBalanceText, walletContainer,
  collectContainer, orbsContainer,
} = require('./economyViews');
const { followUpV2, replyV2 } = require('./components');
const { say } = require('./personality');

const STORE_PAGE_SIZE = 3;
const INVENTORY_PAGE_SIZE = 3;

async function replyText(interaction, text, ephemeral = true) {
  const data = payload(basicContainer(text, [], 0x8B0000), ephemeral);
  if (interaction.deferred || interaction.replied) return interaction.followUp(data);
  return interaction.reply(data);
}

async function replyTextWithRows(interaction, text, rows) {
  const data = payload(basicContainer(text, rows, 0x8B0000), true);
  if (interaction.deferred || interaction.replied) return interaction.followUp(data);
  return interaction.reply(data);
}

function customButton(id, label, style = ButtonStyle.Secondary) {
  return new ButtonBuilder().setCustomId(id).setLabel(label).setStyle(style);
}

function interactionUpdate(container) {
  return { components: [container], allowedMentions: { parse: [] } };
}

function updateInteraction(interaction, data) {
  return interaction.deferred ? interaction.editReply(data) : interaction.update(data);
}

function verifyOwner(interaction, ownerId) {
  if (interaction.user.id === ownerId) return true;
  throw new EconomyError('Este componente foi aberto por outra pessoa. Use seu próprio comando para continuar.');
}

function getRoleIds(member) {
  if (member?.roles?.cache?.keys) return [...member.roles.cache.keys()];
  if (Array.isArray(member?.roles)) return member.roles;
  return [];
}

function getModalInput(customId, label, placeholder = 'Ex.: 100') {
  return new ModalBuilder().setCustomId(customId).setTitle(label)
    .addComponents(new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('amount').setLabel(label).setPlaceholder(placeholder)
        .setStyle(TextInputStyle.Short).setRequired(true).setMinLength(1).setMaxLength(16),
    ));
}

function field(customId, label, { required = true, paragraph = false, placeholder = '', value = null, maxLength = 100 } = {}) {
  const input = new TextInputBuilder().setCustomId(customId).setLabel(label).setStyle(paragraph ? TextInputStyle.Paragraph : TextInputStyle.Short).setRequired(required);
  if (placeholder) input.setPlaceholder(placeholder);
  input.setMaxLength(maxLength);
  if (value != null && String(value) !== '') input.setValue(String(value).slice(0, maxLength));
  return input;
}

function itemWizardContainer(actorId, sku) {
  const buttons = [
    ['price', 'Preço e estoque'],
    ['availability', 'Disponibilidade'],
    ['inventory', 'Inventário e entrega'],
    ['action', 'Ação segura'],
  ].map(([section, label]) => customButton('econ:admin:itemmodal:' + actorId + ':' + sku + ':' + section, label, ButtonStyle.Primary));
  buttons.push(customButton('econ:admin:itemmodal:' + actorId + ':' + sku + ':details', 'Nome, descrição e compra', ButtonStyle.Secondary));
  buttons.push(customButton('econ:admin:itemmodal:' + actorId + ':' + sku + ':choices', 'Opções de compra', ButtonStyle.Secondary));
  return basicContainer('# Configurar item\nEdite cada grupo em etapas. As alterações ficam disponíveis imediatamente depois de salvar.\n\n**Preço e estoque:** valor, moeda e limite de unidades.\n**Disponibilidade:** datas de início e encerramento.\n**Inventário e entrega:** visibilidade, acúmulo, uso e consumo.\n**Ação segura:** efeito de uso e concessões.\n**Detalhes:** nome, texto, ícone, arte e quantidade por compra.\n**Opções:** variantes oferecidas ao comprador.', [new ActionRowBuilder().addComponents(buttons.slice(0, 4)), new ActionRowBuilder().addComponents(buttons.slice(4))], 0x8B0000);
}

function itemEditModal(actorId, sku, section, item = {}) {
  const customId = 'econ:modal:adminitem:' + actorId + ':' + sku + ':' + section;
  const modal = new ModalBuilder().setCustomId(customId);
  let fields;
  if (section === 'price') {
    modal.setTitle('Preço e estoque');
    fields = [
      field('price', 'Preço unitário inteiro', { placeholder: 'Ex.: 500', value: item.price }),
      field('currency', 'Moeda: fragmentos ou orbes', { placeholder: 'fragmentos', value: item.currency === 'orbs' ? 'orbes' : 'fragmentos' }),
      field('orbType', 'Categoria Orbe', { required: false, placeholder: 'verde', value: item.orbType || '' }),
      field('stock', 'Estoque inteiro; -1 ilimitado', { placeholder: '-1', value: item.stock == null ? '-1' : item.stock }),
    ];
  } else if (section === 'availability') {
    modal.setTitle('Disponibilidade do item');
    fields = [
      field('start', 'Início ISO 8601 (vazio remove)', { required: false, placeholder: '2026-11-06T18:00:00Z', value: item.availableFrom ? new Date(item.availableFrom).toISOString() : '' }),
      field('end', 'Fim ISO 8601 (vazio remove)', { required: false, placeholder: '2026-12-01T00:00:00Z', value: item.availableUntil ? new Date(item.availableUntil).toISOString() : '' }),
    ];
  } else if (section === 'inventory') {
    modal.setTitle('Inventário e entrega');
    fields = [
      field('inventoryVisible', 'Aparece no inventário: sim ou nao', { placeholder: 'sim', value: item.inventoryVisible ? 'sim' : 'nao' }),
      field('stackable', 'Acumulável: sim ou nao', { placeholder: 'sim', value: item.stackable ? 'sim' : 'nao' }),
      field('usable', 'Utilizável: sim ou nao', { placeholder: 'nao', value: item.usable ? 'sim' : 'nao' }),
      field('consume', 'Consome ao usar: sim ou nao', { placeholder: 'sim', value: item.consumeOnUse ? 'sim' : 'nao' }),
      field('delivery', 'Entrega: inventario ou imediata', { placeholder: 'inventario', value: item.delivery === 'immediate' ? 'imediata' : 'inventario' }),
    ];
  } else if (section === 'details') {
    modal.setTitle('Detalhes do item');
    fields = [
      field('name', 'Nome exibido', { placeholder: item.name || 'Nome do item', value: item.name, maxLength: 80 }),
      field('description', 'Descrição', { required: false, paragraph: true, placeholder: item.description || 'Descrição do item', value: item.description, maxLength: 1000 }),
      field('emoji', 'Emoji', { placeholder: item.emoji || '📦', value: item.emoji, maxLength: 64 }),
      field('thumbnailUrl', 'Arte HTTPS (vazio remove)', { required: false, placeholder: item.thumbnailUrl || 'https://...', value: item.thumbnailUrl, maxLength: 500 }),
      field('purchaseQuantity', 'Unidades entregues por compra', { placeholder: String(item.purchaseQuantity || 1), value: item.purchaseQuantity || 1, maxLength: 14 }),
    ];
  } else if (section === 'choices') {
    modal.setTitle('Opções de compra');
    fields = [field('purchaseChoices', 'JSON: [{"value":"a","label":"Opção A"}]', {
      required: false, paragraph: true, placeholder: '[]', value: JSON.stringify(item.purchaseChoices || []), maxLength: 1000,
    })];
  } else {
    modal.setTitle('Ação automática segura');
    fields = [
      field('action', 'Ação: nenhuma, fragmentos ou orbe', { placeholder: 'nenhuma', value: item.action === 'grant_fragments' ? 'fragmentos' : item.action === 'grant_orb' ? 'orbe' : 'nenhuma' }),
      field('amount', 'Quantidade inteira; 0 para nenhuma', { placeholder: '0', value: item.actionAmount || 0 }),
      field('orbType', 'Categoria Orbe', { required: false, placeholder: 'verde', value: item.actionOrbType || '' }),
      field('effect', 'Descrição do efeito (opcional)', { required: false, paragraph: true, value: item.effectDescription || '' }),
      field('useMessage', 'Mensagem ao utilizar (opcional)', { required: false, paragraph: true, value: item.useMessage || '' }),
    ];
  }
  modal.addComponents(...fields.map((input) => new ActionRowBuilder().addComponents(input)));
  return modal;
}

function parseBoolean(value, label) {
  const normalized = String(value).trim().toLowerCase();
  if (['sim', 's', 'yes', 'true'].includes(normalized)) return true;
  if (['nao', 'não', 'n', 'no', 'false'].includes(normalized)) return false;
  throw new RangeError(label + ' deve ser sim ou não.');
}

function parseWholeNumber(value, label, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const text = String(value).trim();
  if (!/^\d+$/.test(text)) throw new RangeError(label + ' deve ser um número inteiro.');
  const number = Number(text);
  if (!Number.isSafeInteger(number) || number < min || number > max) throw new RangeError(label + ' está fora do limite permitido.');
  return number;
}

function normalizeOrbType(value) {
  const normalized = String(value || '').trim().toLowerCase();
  const values = { verde: 'green', azul: 'blue', laranja: 'orange', vermelha: 'red', preta: 'black', dourada: 'gold' };
  return values[normalized] || normalized;
}

function normalizeCurrency(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'fragmentos') return 'fragments';
  if (normalized === 'orbes') return 'orbs';
  return normalized;
}

function parseModalAmount(interaction) {
  const raw = interaction.fields.getTextInputValue('amount').trim();
  if (!/^\d+$/.test(raw)) throw new RangeError('Informe uma quantidade em números inteiros.');
  const amount = Number(raw);
  if (!Number.isSafeInteger(amount) || amount < 1) throw new RangeError('A quantidade deve ser um inteiro positivo.');
  return amount;
}

async function showStore(interaction, currency, page = 0, update = false) {
  const result = await getStorePage(interaction.guildId, currency, { page: Math.max(0, page), pageSize: STORE_PAGE_SIZE });
  const container = storeContainer(result.items, currency, result.page, result.pages, new Date(), interaction.user.id);
  if (update) return updateInteraction(interaction, interactionUpdate(container));
  return respond(interaction, payload(container));
}

async function showInventory(interaction, ownerId, userId, page = 0, update = false, ephemeral = false, filter = 'all') {
  const data = await listInventory(interaction.guildId, userId, { page, pageSize: INVENTORY_PAGE_SIZE, filter });
  const currentPage = Math.min(Math.max(0, page), data.pages - 1);
  data.page = currentPage;
  const container = inventoryContainer(data, userId, ownerId, currentPage, filter);
  if (update) return updateInteraction(interaction, interactionUpdate(container));
  return respond(interaction, payload(container, ephemeral));
}

function collectionSelectionContainer(rule, ownerId) {
  const base = '## ' + rule.name + '\n' + (rule.description || 'Recompensa por cargo.') + '\n\n**Recompensa:** ' + formatFragments(rule.fragments) + (rule.orbType && rule.orbAmount ? ' · ' + rule.orbAmount.toLocaleString('pt-BR') + ' ' + ORBS[rule.orbType].emoji : '') + '\n**Frequência:** ' + rule.frequency + '\n**Coleta:** ' + (rule.stackable ? 'pode acumular com outras regras elegíveis' : 'individual');
  const buttons = [customButton('econ:collect:claim:' + ownerId + ':' + rule._id, 'Coletar esta', ButtonStyle.Success)];
  if (rule.stackable) buttons.push(customButton('econ:collect:stack:' + ownerId + ':' + rule._id, 'Coletar elegíveis', ButtonStyle.Primary));
  return basicContainer('# Recompensa disponível\n' + base, [new ActionRowBuilder().addComponents(buttons)], 0x8B0000);
}

async function claimSelected(interaction, ownerId, selectedRuleId, stack) {
  verifyOwner(interaction, ownerId);
  const roleIds = getRoleIds(interaction.member);
  const claimable = await getClaimableRules(interaction.guildId, roleIds, interaction.user.id);
  const selected = claimable.find((rule) => String(rule._id) === selectedRuleId);
  if (!selected) throw new EconomyError('Essa recompensa não está mais disponível. Execute /coletar para atualizar a lista.');
  const rules = stack
    ? claimable.filter((rule) => rule.stackable)
    : [selected];
  if (stack && !selected.stackable) throw new EconomyError('Essa recompensa não permite coleta conjunta.');
  const result = await claimCollectRules({ guildId: interaction.guildId, userId: interaction.user.id, roleIds, ruleIds: rules.map((rule) => String(rule._id)) });
  const orbSummary = Object.entries(result.orbDelta).map(([type, amount]) => amount + ' ' + ORBS[type].emoji).join(' · ');
    const summary = '## Recompensa coletada\n' + say('daily') + '\n\nVocê recebeu **' + formatFragments(result.fragments) + '**' + (orbSummary ? ' e **' + orbSummary + '**' : '') + '.\n**Regras:** ' + result.rules.map((rule) => rule.name).join(', ');
  return updateInteraction(interaction, interactionUpdate(basicContainer(summary, [], 0x008C52)));
}

async function handleEconomyInteraction(interaction) {
  const customId = interaction.customId || '';
  if (!customId.startsWith('econ:')) return false;
  const immediateUpdate = (interaction.isButton() && (
    customId.startsWith('econ:store:page:') || customId.startsWith('econ:store:detail:') || customId.startsWith('econ:store:confirm:') || customId.startsWith('econ:store:back:') || customId.startsWith('econ:inventory:page:') || customId.startsWith('econ:inventory:detail:') || customId.startsWith('econ:inventory:back:') ||
    customId.startsWith('econ:orbs:confirm:') || customId.startsWith('econ:orbs:cancel:') ||
    customId.startsWith('econ:collect:') || customId.startsWith('econ:admin:itemwizard:') ||
    customId.startsWith('econ:admin:itemdelete:')
  )) || (interaction.isStringSelectMenu() && (
    customId.startsWith('econ:collect:select:') || customId.startsWith('econ:store:choice:') || customId.startsWith('econ:store:quantity:') || customId.startsWith('econ:store:variant:') || customId.startsWith('econ:inventory:filter:')
  ));
  if (immediateUpdate && !interaction.deferred && !interaction.replied && typeof interaction.deferUpdate === 'function') await interaction.deferUpdate();
  try {
    const parts = customId.split(':');

    if (interaction.isButton()) {
      if (parts[1] === 'store' && parts[2] === 'page') {
        const currency = parts[3] === 'orbs' ? 'orbs' : 'fragments';
        return showStore(interaction, currency, Number(parts[4]) || 0, true);
      }
      if (parts[1] === 'store' && parts[2] === 'detail') {
        const [, , , ownerId, itemId, currency, page] = parts;
        verifyOwner(interaction, ownerId);
        const item = await getStoreItem(interaction.guildId, itemId, currency);
        return updateInteraction(interaction, interactionUpdate(storeItemContainer(item, currency, Number(page) || 0, ownerId)));
      }
      if (parts[1] === 'store' && parts[2] === 'back') {
        verifyOwner(interaction, parts[3]);
        return showStore(interaction, parts[4], Number(parts[5]) || 0, true);
      }
      if (parts[1] === 'store' && parts[2] === 'confirm') {
        const [, , , ownerId, itemId, currency, page, unitsValue, choiceIndex] = parts;
        verifyOwner(interaction, ownerId);
        const item = await getStoreItem(interaction.guildId, itemId, currency);
        const purchaseChoice = choiceIndex === 'x' ? null : item.purchaseChoices?.[Number(choiceIndex)]?.value;
        if (choiceIndex !== 'x' && !purchaseChoice) throw new EconomyError('Essa opção não está mais disponível. Atualize a vitrine.');
        const result = await buyItem({ guildId: interaction.guildId, userId: ownerId, itemId, purchaseChoice, units: Number(unitsValue), interactionId: interaction.id });
        if (result.duplicate) return replyText(interaction, 'Essa compra já foi registrada; seus Fragmentos não foram cobrados novamente.');
        await showStore(interaction, currency, Number(page) || 0, true);
        const price = result.item.currency === 'fragments' ? formatFragments(result.cost) : result.cost.toLocaleString('pt-BR') + ' ' + ORBS[result.item.orbType].sigil + ' Orbes ' + ORBS[result.item.orbType].label;
        const delivery = result.deliveredToInventory ? 'O item já está no seu inventário.' : 'A entrega imediata foi processada.';
        return replyText(interaction, '# Compra confirmada\n' + say('purchase') + '\n\n**' + result.item.emoji + ' ' + result.item.name + '** × ' + result.quantity.toLocaleString('pt-BR') + '\n**Total cobrado:** ' + price + '\n' + delivery);
      }
      if (parts[1] === 'store' && parts[2] === 'buy') {
        const itemId = parts[3];
        const currency = parts[4] === 'orbs' ? 'orbs' : 'fragments';
        const page = Number(parts[5]) || 0;
        const storeItem = await getStoreItem(interaction.guildId, itemId, currency);
        if (storeItem.purchaseChoices?.length) {
          const select = new StringSelectMenuBuilder()
            .setCustomId('econ:store:choice:' + interaction.user.id + ':' + itemId + ':' + currency + ':' + page)
            .setPlaceholder('Escolha uma opção para comprar')
            .addOptions(storeItem.purchaseChoices.map((choice) => ({
              label: choice.label,
              value: choice.value,
              description: choice.description || choice.label,
            })));
          return replyTextWithRows(interaction,
            '# Escolha · ' + storeItem.emoji + ' ' + storeItem.name + '\n' + storeItem.description + '\n\nSelecione uma opção para concluir a compra por **' + (storeItem.currency === 'fragments' ? formatFragments(storeItem.price) : storeItem.price.toLocaleString('pt-BR') + ' ' + ORBS[storeItem.orbType].emoji) + '**.',
            [new ActionRowBuilder().addComponents(select)],
          );
        }
        const result = await buyItem({ guildId: interaction.guildId, userId: interaction.user.id, itemId, interactionId: interaction.id });
        if (result.duplicate) return replyText(interaction, 'Esta compra já foi processada.');
        const delivery = result.deliveredToInventory ? 'O item foi adicionado ao seu inventário.' : 'A entrega configurada foi processada imediatamente.';
        await showStore(interaction, currency, page, true);
        return replyText(interaction, '## Compra concluída\nVocê comprou **' + result.item.emoji + ' ' + result.item.name + '** × ' + result.quantity.toLocaleString('pt-BR') + ' por ' + (result.item.currency === 'fragments' ? formatFragments(result.cost) : result.cost.toLocaleString('pt-BR') + ' ' + ORBS[result.item.orbType].emoji) + '.\n' + delivery);
      }
      if (parts[1] === 'inventory' && parts[2] === 'page') {
        const ownerId = parts[3];
        verifyOwner(interaction, ownerId);
        const filter = parts[7] || 'all';
        return showInventory(interaction, ownerId, parts[4], Number(parts[5]) || 0, true, false, filter);
      }
      if (parts[1] === 'inventory' && parts[2] === 'detail') {
        const [, , , ownerId, userId, inventoryId, page, filter = 'all'] = parts;
        verifyOwner(interaction, ownerId);
        const data = await listInventory(interaction.guildId, userId, { page: Number(page) || 0, pageSize: INVENTORY_PAGE_SIZE, filter });
        const entry = data.items.find((candidate) => String(candidate._id) === inventoryId);
        if (!entry) throw new EconomyError('Esse item não aparece mais nesta página. Atualize o inventário.');
        return updateInteraction(interaction, interactionUpdate(inventoryDetailContainer(entry, ownerId, userId, Number(page) || 0, filter)));
      }
      if (parts[1] === 'inventory' && parts[2] === 'back') {
        const [, , , ownerId, userId, page, filter = 'all'] = parts;
        verifyOwner(interaction, ownerId);
        return showInventory(interaction, ownerId, userId, Number(page) || 0, true, false, filter);
      }
      if (parts[1] === 'inventory' && parts[2] === 'use') {
        const ownerId = parts[3];
        verifyOwner(interaction, ownerId);
        const inventoryId = parts[4];
        const page = Number(parts[5]) || 0;
        const filter = parts[6] || 'all';
        const result = await useInventoryItem({ guildId: interaction.guildId, userId: interaction.user.id, inventoryId });
        const effect = result.item.useMessage || result.item.effectDescription || 'O item foi utilizado. Seu efeito pode ser interpretado dentro do RP.';
        const consumption = result.consumed ? 'O item foi consumido.' : 'O item permanece no inventário.';
        await showInventory(interaction, ownerId, ownerId, page, true, false, filter);
        return replyText(interaction, '## ' + result.item.emoji + ' ' + result.item.name + '\n' + effect + '\n' + consumption);
      }
      if (parts[1] === 'wallet' && ['deposit', 'withdraw'].includes(parts[2])) {
        verifyOwner(interaction, parts[3]);
        const action = parts[2];
        return interaction.showModal(getModalInput('econ:modal:bank:' + parts[3] + ':' + action, action === 'deposit' ? 'Depositar Fragmentos' : 'Sacar Fragmentos', 'Quantidade inteira'));
      }
      if (parts[1] === 'wallet' && parts[2] === 'inventory') {
        verifyOwner(interaction, parts[3]);
        return showInventory(interaction, parts[3], parts[3], 0, false, true);
      }
      if (parts[1] === 'orbs' && parts[2] === 'amount') {
        const ownerId = parts[3];
        verifyOwner(interaction, ownerId);
        const source = parts[4];
        const settings = await getSettings(interaction.guildId);
        return interaction.showModal(getModalInput('econ:modal:orbs:' + ownerId + ':' + source, 'Converter Orbes', 'Múltiplo de ' + (settings.orbs?.conversionRate || 10)));
      }
      if (parts[1] === 'orbs' && parts[2] === 'confirm') {
        const ownerId = parts[3];
        verifyOwner(interaction, ownerId);
        const source = parts[4];
        const amount = Number(parts[5]);
        const { conversion, account } = await convertOrbes({ guildId: interaction.guildId, userId: interaction.user.id, source, amount });
        const notice = '# Conversão concluída\n' + amount.toLocaleString('pt-BR') + ' ' + ORBS[source].emoji + ' foram convertidas em ' + conversion.result.toLocaleString('pt-BR') + ' ' + ORBS[conversion.destination].emoji + '.';
        return updateInteraction(interaction, interactionUpdate(orbsContainer(account, ownerId, notice)));
      }
      if (parts[1] === 'orbs' && parts[2] === 'cancel') {
        verifyOwner(interaction, parts[3]);
        const account = await getAccount(interaction.guildId, interaction.user.id);
        return updateInteraction(interaction, interactionUpdate(orbsContainer(account, parts[3], 'Conversão cancelada. Nenhum saldo foi alterado.')));
      }
      if (parts[1] === 'collect' && ['claim', 'stack'].includes(parts[2])) {
        return claimSelected(interaction, parts[3], parts[4], parts[2] === 'stack');
      }
      if (parts[1] === 'collect' && parts[2] === 'page') {
        const ownerId = parts[3];
        verifyOwner(interaction, ownerId);
        const rules = await getClaimableRules(interaction.guildId, getRoleIds(interaction.member), interaction.user.id);
        return updateInteraction(interaction, interactionUpdate(collectContainer(rules, ownerId, Number(parts[4]) || 0)));
      }
      if (parts[1] === 'admin' && parts[2] === 'itemwizard') {
        const actorId = parts[3];
        if (interaction.user.id !== actorId || !(await isAuthorized(interaction.member, interaction.user.id, interaction.guildId))) throw new EconomyError('Você não pode editar este item.');
        return updateInteraction(interaction, interactionUpdate(itemWizardContainer(actorId, parts[4])));
      }
      if (parts[1] === 'admin' && parts[2] === 'itemmodal') {
        const actorId = parts[3];
        if (interaction.user.id !== actorId || !(await isAuthorized(interaction.member, interaction.user.id, interaction.guildId))) throw new EconomyError('Você não pode editar este item.');
        const item = await EconomyItem.findOne({ guildId: interaction.guildId, sku: parts[4], deletedAt: null }).lean();
        if (!item) throw new EconomyError('Este item não está mais no catálogo.');
        return interaction.showModal(itemEditModal(actorId, parts[4], parts[5], item));
      }
      if (parts[1] === 'admin' && parts[2] === 'itemdelete') {
        const actorId = parts[3];
        const sku = parts.slice(4).join(':');
        if (interaction.user.id !== actorId || !(await isAuthorized(interaction.member, interaction.user.id, interaction.guildId))) throw new EconomyError('Você não pode confirmar esta exclusão.');
        const item = await deleteCatalogItem({ guildId: interaction.guildId, actorId, sku });
        return updateInteraction(interaction, interactionUpdate(basicContainer('O item **' + item.name + '** foi removido da loja. Os itens já adquiridos e o histórico foram preservados.', [], 0x8B0000)));
      }
      if (parts[1] === 'admin' && parts[2] === 'itemdeletecancel') {
        if (interaction.user.id !== parts[3] || !(await isAuthorized(interaction.member, interaction.user.id, interaction.guildId))) throw new EconomyError('Você não pode cancelar esta operação.');
        return updateInteraction(interaction, interactionUpdate(basicContainer('Exclusão cancelada. O catálogo não foi alterado.', [], 0x8B0000)));
      }
    }

    if (interaction.isStringSelectMenu()) {
      if (parts[1] === 'store' && parts[2] === 'quantity') {
        const [, , , ownerId, itemId, currency, page] = parts;
        verifyOwner(interaction, ownerId);
        const item = await getStoreItem(interaction.guildId, itemId, currency);
        return updateInteraction(interaction, interactionUpdate(storeItemContainer(item, currency, Number(page) || 0, ownerId, Number(interaction.values[0]))));
      }
      if (parts[1] === 'inventory' && parts[2] === 'filter') {
        const [, , , ownerId, userId] = parts;
        verifyOwner(interaction, ownerId);
        return showInventory(interaction, ownerId, userId, 0, true, false, interaction.values[0]);
      }
      if (parts[1] === 'store' && parts[2] === 'variant') {
        const [, , , ownerId, itemId, currency, page, units] = parts;
        verifyOwner(interaction, ownerId);
        const item = await getStoreItem(interaction.guildId, itemId, currency);
        const selectedChoice = item.purchaseChoices?.find((choice) => choice.value === interaction.values[0]);
        if (!selectedChoice) throw new EconomyError('Essa opção não está mais disponível. Atualize a vitrine.');
        return updateInteraction(interaction, interactionUpdate(storeItemContainer(item, currency, Number(page) || 0, ownerId, Number(units) || 1, selectedChoice)));
      }
      if (parts[1] === 'store' && parts[2] === 'choice') {
        const ownerId = parts[3];
        verifyOwner(interaction, ownerId);
        const itemId = parts[4];
        const result = await buyItem({ guildId: interaction.guildId, userId: interaction.user.id, itemId, purchaseChoice: interaction.values[0], interactionId: interaction.id });
        if (result.duplicate) return updateInteraction(interaction, interactionUpdate(basicContainer('Esta compra já foi processada.')));
        const payment = result.item.currency === 'fragments' ? formatFragments(result.cost) : result.cost.toLocaleString('pt-BR') + ' ' + ORBS[result.item.orbType].emoji;
        const delivery = result.deliveredToInventory ? 'O item foi adicionado ao seu inventário.' : 'A entrega configurada foi processada imediatamente.';
        const choice = result.selectedChoice?.label ? '\n**Escolha:** ' + result.selectedChoice.label : '';
        return updateInteraction(interaction, interactionUpdate(basicContainer('## Compra concluída\nVocê comprou **' + result.item.emoji + ' ' + result.item.name + '** × ' + result.quantity.toLocaleString('pt-BR') + ' por ' + payment + '.' + choice + '\n' + delivery)));
      }
      if (parts[1] === 'orbs' && parts[2] === 'source') {
        verifyOwner(interaction, parts[3]);
        const source = interaction.values[0];
        if (!ORB_TYPES.includes(source) || source === 'gold') throw new RangeError('Selecione uma categoria válida para conversão.');
        const settings = await getSettings(interaction.guildId);
        return interaction.showModal(getModalInput('econ:modal:orbs:' + parts[3] + ':' + source, 'Converter Orbes ' + ORBS[source].label, 'Múltiplo de ' + (settings.orbs?.conversionRate || 10)));
      }
      if (parts[1] === 'collect' && parts[2] === 'select') {
        const ownerId = parts[3];
        verifyOwner(interaction, ownerId);
        const rule = await getClaimableRules(interaction.guildId, getRoleIds(interaction.member), interaction.user.id)
          .then((rules) => rules.find((entry) => String(entry._id) === interaction.values[0]));
        if (!rule) throw new EconomyError('Essa recompensa não está mais disponível. Execute /coletar para atualizar a lista.');
        return updateInteraction(interaction, interactionUpdate(collectionSelectionContainer(rule, ownerId)));
      }
    }

    if (interaction.isModalSubmit()) {
      if (parts[1] === 'modal' && parts[2] === 'adminitem') {
        const actorId = parts[3];
        const sku = parts[4];
        const section = parts[5];
        if (interaction.user.id !== actorId || !(await isAuthorized(interaction.member, interaction.user.id, interaction.guildId))) throw new EconomyError('Você não pode editar este item.');
        const value = (key) => interaction.fields.getTextInputValue(key).trim();
        const changes = {};
        if (section === 'price') {
          changes.price = parseWholeNumber(value('price'), 'Preço', { max: 1000000000000 });
          const stock = value('stock');
          if (!/^-?\d+$/.test(stock)) throw new RangeError('Estoque deve ser inteiro; use -1 para ilimitado.');
          const stockNumber = Number(stock);
          if (!Number.isSafeInteger(stockNumber) || stockNumber < -1 || stockNumber > 1000000000000) throw new RangeError('Estoque está fora do limite permitido.');
          changes.stock = stockNumber === -1 ? null : stockNumber;
          const currency = normalizeCurrency(value('currency'));
          if (!['fragments', 'orbs'].includes(currency)) throw new RangeError('Moeda deve ser Fragmentos ou Orbes.');
          changes.currency = currency;
          const orbType = normalizeOrbType(value('orbType'));
          changes.orbType = orbType || null;
        } else if (section === 'availability') {
          const start = value('start');
          const end = value('end');
          changes.availableFrom = start || null;
          changes.availableUntil = end || null;
        } else if (section === 'inventory') {
          changes.inventoryVisible = parseBoolean(value('inventoryVisible'), 'A visibilidade no inventário');
          changes.stackable = parseBoolean(value('stackable'), 'Acúmulo');
          changes.usable = parseBoolean(value('usable'), 'Uso');
          changes.consumeOnUse = parseBoolean(value('consume'), 'Consumo');
          const delivery = value('delivery').toLowerCase();
          changes.delivery = delivery === 'inventario' ? 'inventory' : delivery === 'imediata' ? 'immediate' : delivery;
        } else if (section === 'action') {
          const enteredAction = value('action').toLowerCase();
          const actions = { nenhuma: 'none', fragmentos: 'grant_fragments', orbe: 'grant_orb', none: 'none', grant_fragments: 'grant_fragments', grant_orb: 'grant_orb' };
          const action = actions[enteredAction];
          if (!['none', 'grant_fragments', 'grant_orb'].includes(action)) throw new RangeError('Ação inválida. Use nenhuma, Fragmentos ou Orbes.');
          changes.action = action;
          changes.actionAmount = parseWholeNumber(value('amount'), 'Quantidade da ação', { max: 1000000000000 });
          const orbType = normalizeOrbType(value('orbType'));
          changes.actionOrbType = orbType || null;
          changes.effectDescription = value('effect');
          changes.useMessage = value('useMessage');
        } else if (section === 'details') {
          changes.name = value('name');
          changes.description = value('description');
          changes.emoji = value('emoji');
          changes.thumbnailUrl = value('thumbnailUrl');
          changes.purchaseQuantity = parseWholeNumber(value('purchaseQuantity'), 'Unidades por compra', { min: 1, max: 1000000 });
        } else if (section === 'choices') {
          const raw = value('purchaseChoices');
          let choices;
          try { choices = raw ? JSON.parse(raw) : []; } catch { throw new RangeError('As opções precisam estar em um JSON válido.'); }
          if (!Array.isArray(choices) || choices.length > 25 || choices.some((choice) => !choice || typeof choice.value !== 'string' || typeof choice.label !== 'string')) {
            throw new RangeError('Informe uma lista JSON de até 25 opções, cada uma com value e label.');
          }
          changes.purchaseChoices = choices.map((choice) => ({ value: choice.value, label: choice.label, description: choice.description || '' }));
        } else {
          throw new RangeError('Etapa de configuração inválida.');
        }
        const item = await editCatalogItem({ guildId: interaction.guildId, actorId, sku, changes });
        const wizard = new ActionRowBuilder().addComponents(customButton('econ:admin:itemwizard:' + actorId + ':' + sku, 'Continuar configuração', ButtonStyle.Primary));
        return replyTextWithRows(interaction, 'Etapa salva para **' + item.emoji + ' ' + item.name + '**. As novas configurações já foram persistidas.', [wizard]);
      }
      if (parts[1] === 'modal' && parts[2] === 'bank') {
        const ownerId = parts[3];
        verifyOwner(interaction, ownerId);
        const amount = parseModalAmount(interaction);
        const direction = parts[4] === 'deposit' ? 'deposit' : 'withdraw';
        const account = await bankTransfer({ guildId: interaction.guildId, userId: interaction.user.id, amount, direction });
        if (interaction.message) {
          await interaction.message.edit({ components: [walletContainer(interaction.user, account, interaction.user.id, true)], allowedMentions: { parse: [] } }).catch(() => {});
        }
        return replyText(interaction, '## ' + (direction === 'deposit' ? 'Depósito realizado' : 'Saque realizado') + '\n' + formatFragments(amount) + (direction === 'deposit' ? ' foram depositados.' : ' foram sacados.') + '\n\n**Carteira:** ' + formatFragments(account.wallet) + '\n**Banco:** ' + formatFragments(account.bank));
      }
      if (parts[1] === 'modal' && parts[2] === 'orbs') {
        const ownerId = parts[3];
        verifyOwner(interaction, ownerId);
        const source = parts[4];
        const amount = parseModalAmount(interaction);
        const settings = await getSettings(interaction.guildId);
        const conversion = orbConversion(source, amount, settings.orbs?.conversionRate || 10);
        const account = await getAccount(interaction.guildId, interaction.user.id);
        if (Number(account.orbs?.[source] || 0) < amount) throw new EconomyError('Você não possui Orbes suficientes nessa categoria.');
        const confirm = customButton('econ:orbs:confirm:' + ownerId + ':' + source + ':' + amount, 'Confirmar conversão', ButtonStyle.Success);
        const cancel = customButton('econ:orbs:cancel:' + ownerId, 'Cancelar', ButtonStyle.Secondary);
        return interaction.reply(payload(basicContainer(
          '# Prévia da conversão\n' + amount.toLocaleString('pt-BR') + ' ' + ORBS[source].emoji + ' → **' + conversion.result.toLocaleString('pt-BR') + ' ' + ORBS[conversion.destination].emoji + '**\n\nSaldo de origem: ' + Number(account.orbs?.[source] || 0).toLocaleString('pt-BR') + ' ' + ORBS[source].emoji + '\n\nConfirme para concluir a operação.',
          [new ActionRowBuilder().addComponents(confirm, cancel)], 0x6B4BA1,
        ), true));
      }
    }

    return false;
  } catch (error) {
    const detail = error.publicMessage || (error instanceof RangeError ? error.message : '');
    const message = (/saldo|fragmentos|carteira|limite/i.test(detail) ? say('insufficient') : say('error')) + (detail ? '\n\n' + detail : '');
    if (!(error instanceof EconomyError) && !(error instanceof RangeError)) {
      require('../logger').error('Falha em componente de economia (' + (error?.code || error?.name || 'erro') + ').');
    }
    if (interaction.isButton?.() && customId.startsWith('econ:store:buy:') && !interaction.replied) {
      const [, , , , currency, page] = customId.split(':');
      await showStore(interaction, currency, Number(page) || 0, true).catch(() => {});
    }
    if (interaction.isButton?.() && customId.startsWith('econ:inventory:use:') && !interaction.replied) {
      const [, , , ownerId, , page, filter = 'all'] = customId.split(':');
      await showInventory(interaction, ownerId, ownerId, Number(page) || 0, true, false, filter).catch(() => {});
    }
    if (interaction.deferred || interaction.replied) await followUpV2(interaction, message).catch(() => {});
    else await replyV2(interaction, message, { ephemeral: true }).catch(() => {});
    return true;
  }
}

module.exports = {
  handleEconomyInteraction, showStore, showInventory, getRoleIds, STORE_PAGE_SIZE, INVENTORY_PAGE_SIZE,
  itemEditModal, itemWizardContainer,
};
