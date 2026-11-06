const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  ChannelType,
  ModalBuilder,
  RoleSelectMenuBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
  MessageFlags,
} = require('discord.js');
const config = require('../config');
const { getGuildConfig } = require('./xpService');
const { normalizeTriggerText } = require('./triggers');
const { createContainer, replyV2 } = require('./components');

function button(customId, label, style = ButtonStyle.Secondary) {
  return new ButtonBuilder().setCustomId(customId).setLabel(label).setStyle(style);
}

function row(...components) {
  return new ActionRowBuilder().addComponents(components);
}

function navRow() {
  return row(new StringSelectMenuBuilder()
    .setCustomId('config:nav')
    .setPlaceholder('Abrir seção do painel')
    .addOptions(
      { label: 'Experiência e níveis', value: 'xp', description: 'XP, canais e buffs por cargos' },
      { label: 'Permissões', value: 'permissions', description: 'Cargos autorizados a administrar o bot' },
      { label: 'Gatilhos', value: 'triggers', description: 'Respostas automáticas configuráveis' },
    ));
}

function container(text, rows = []) {
  return createContainer(text, rows, 0x8B0000);
}

function channelList(ids) {
  const visible = ids.slice(0, 20).map((id) => '<#' + id + '>');
  if (ids.length > visible.length) visible.push('+' + (ids.length - visible.length) + ' outros');
  return visible.join(', ') || 'nenhum';
}

async function showHome(interaction, update = false) {
  const content = [
    '# Kiryu · Configuração',
    'Painel administrativo do servidor Eternity Realms.',
    'Escolha uma seção para editar os dados persistidos no MongoDB.',
  ].join('\n');
  const payload = { components: [container(content, [navRow()])], allowedMentions: { parse: [] } };
  if (update) return interaction.update(payload);
  if (interaction.deferred || interaction.replied) {
    return interaction.editReply({ ...payload, flags: MessageFlags.IsComponentsV2 });
  }
  return interaction.reply({ ...payload, flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
}

async function showXp(interaction, update = true) {
  const cfg = await getGuildConfig(interaction.guildId);
  const visibleBuffs = cfg.buffs.slice(0, 25);
  const buffs = visibleBuffs.length
    ? visibleBuffs.map((buff) => '• <@&' + buff.roleId + '>: **' + buff.multiplier + 'x**').join('\n')
      + (cfg.buffs.length > visibleBuffs.length ? '\n• +' + (cfg.buffs.length - visibleBuffs.length) + ' outros cargos' : '')
    : 'Nenhum cargo cadastrado.';
  const content = [
    '# Experiência e níveis',
    '## Mensagens',
    '• XP: ' + cfg.messageXp.min + '–' + cfg.messageXp.max + ' por mensagem\n• Cooldown: ' + (cfg.messageXp.cooldownMs / 1000) + ' s',
    '## Voz',
    '• XP: ' + cfg.voiceXp.min + '–' + cfg.voiceXp.max + ' a cada ' + (cfg.voiceXp.intervalMs / 60000) + ' min',
    '## Canais excluídos',
    '• Mensagens: ' + channelList(cfg.messageXp.excludedChannelIds),
    '• Voz: ' + channelList(cfg.voiceXp.excludedChannelIds),
    '## Buffs por cargo',
    buffs,
    'Com vários cargos: **' + (cfg.stackBuffs ? 'multiplicadores acumulados' : 'maior multiplicador') + '**.',
  ].join('\n\n');
  const rows = [
    navRow(),
    row(
      button('config:xp:message', 'XP por mensagem', ButtonStyle.Primary),
      button('config:xp:voice', 'XP por voz', ButtonStyle.Primary),
      button('config:xp:stack', cfg.stackBuffs ? 'Usar maior buff' : 'Acumular buffs', ButtonStyle.Secondary),
    ),
    row(new ChannelSelectMenuBuilder().setCustomId('config:xp:exclude').setPlaceholder('Alternar exclusões de canais').setChannelTypes(ChannelType.GuildText, ChannelType.GuildVoice, ChannelType.GuildStageVoice).setMinValues(1).setMaxValues(10)),
    row(new RoleSelectMenuBuilder().setCustomId('config:xp:buff:add').setPlaceholder('Selecionar cargo para cadastrar buff').setMinValues(1).setMaxValues(1)),
  ];
  if (cfg.buffs.length) {
    rows.push(row(new StringSelectMenuBuilder()
      .setCustomId('config:xp:buff:remove')
      .setPlaceholder('Selecionar um buff para remover')
      .addOptions(cfg.buffs.slice(0, 25).map((buff) => ({
        label: String(interaction.guild.roles.cache.get(buff.roleId)?.name || buff.roleId).slice(0, 100),
        value: buff.roleId,
        description: buff.multiplier + 'x',
      })))));
  }
  return interaction.update({ components: [container(content, rows)], allowedMentions: { parse: [] } });
}

async function showPermissions(interaction, update = true) {
  const cfg = await getGuildConfig(interaction.guildId);
  const visibleRoles = cfg.adminRoleIds.slice(0, 25);
  const roles = visibleRoles.length
    ? visibleRoles.map((id) => '• <@&' + id + '>').join('\n')
      + (cfg.adminRoleIds.length > visibleRoles.length ? '\n• +' + (cfg.adminRoleIds.length - visibleRoles.length) + ' outros cargos' : '')
    : 'Nenhum cargo autorizado. O proprietário sempre tem acesso.';
  return interaction.update({
    components: [container('# Permissões administrativas\nCargos autorizados a usar os comandos de gerenciamento:\n\n' + roles, [
      navRow(),
      row(new RoleSelectMenuBuilder().setCustomId('config:permissions:add').setPlaceholder('Adicionar cargos autorizados').setMinValues(1).setMaxValues(10)),
      ...(cfg.adminRoleIds.length ? [row(new StringSelectMenuBuilder()
        .setCustomId('config:permissions:remove')
        .setPlaceholder('Selecionar cargos para remover')
        .addOptions(cfg.adminRoleIds.slice(0, 25).map((id) => ({
          label: String(interaction.guild.roles.cache.get(id)?.name || id).slice(0, 100),
          value: id,
        }))))] : []),
    ])],
    allowedMentions: { parse: [] },
  });
}

async function showTriggers(interaction, update = true) {
  const cfg = await getGuildConfig(interaction.guildId);
  const list = cfg.triggers.length
    ? cfg.triggers.slice(0, 25).map((trigger) => '• ' + (trigger.enabled ? '✅' : '⏸️') + ' **' + trigger.text + '** · ' + trigger.responses.length + ' resposta(s)').join('\n')
    : 'Nenhum gatilho cadastrado.';
  const rows = [navRow(), row(button('config:trigger:create', 'Criar gatilho', ButtonStyle.Success))];
  if (cfg.triggers.length) {
    rows.push(row(new StringSelectMenuBuilder()
      .setCustomId('config:trigger:select')
      .setPlaceholder('Editar ou consultar um gatilho')
      .addOptions(cfg.triggers.slice(0, 25).map((trigger) => ({
        label: String(trigger.text).slice(0, 100),
        value: trigger._id.toString(),
        description: (trigger.enabled ? 'Ativo' : 'Desativado') + ' · ' + trigger.responses.length + ' resposta(s)',
      })))));
  }
  return interaction.update({ components: [container('# Gatilhos personalizados\nReconhecimento exato, sem diferenciar maiúsculas e minúsculas; espaços repetidos são normalizados.\n\n' + list, rows)], allowedMentions: { parse: [] } });
}

async function showTriggerDetail(interaction, triggerId, update = true) {
  const cfg = await getGuildConfig(interaction.guildId);
  const trigger = cfg.triggers.id(triggerId);
  if (!trigger) return showTriggers(interaction, update);
  const visibleResponses = trigger.responses.slice(0, 25);
  const responseList = visibleResponses.length ? visibleResponses.map((response, index) => {
    const preview = String(response).replace(/\s+/g, ' ');
    return (index + 1) + '. ' + preview.slice(0, 90) + (preview.length > 90 ? '…' : '');
  }).join('\n') + (trigger.responses.length > visibleResponses.length ? '\n… +' + (trigger.responses.length - visibleResponses.length) + ' respostas' : '') : 'Sem respostas.';
  const rows = [
    navRow(),
    row(button('config:trigger:text:' + triggerId, 'Editar texto'), button('config:trigger:response:add:' + triggerId, 'Adicionar resposta', ButtonStyle.Success), button('config:trigger:toggle:' + triggerId, trigger.enabled ? 'Desativar' : 'Ativar')),
  ];
  if (trigger.responses.length) {
    rows.push(row(new StringSelectMenuBuilder()
      .setCustomId('config:trigger:response:select:' + triggerId)
      .setPlaceholder('Selecionar uma resposta para editar ou remover')
      .addOptions(trigger.responses.slice(0, 25).map((response, index) => ({
        label: (index + 1) + '. ' + String(response).slice(0, 90),
        value: String(index),
      })))));
  }
  rows.push(row(button('config:trigger:delete:' + triggerId, 'Excluir gatilho', ButtonStyle.Danger), button('config:triggers', 'Voltar à lista')));
  return interaction.update({ components: [container('## Gatilho: ' + trigger.text + '\n**Status:** ' + (trigger.enabled ? 'ativo' : 'desativado') + '\n**Respostas:**\n' + responseList, rows)], allowedMentions: { parse: [] } });
}

function shortInput(customId, label, options = {}) {
  const input = new TextInputBuilder()
    .setCustomId(customId)
    .setLabel(label)
    .setStyle(options.paragraph ? TextInputStyle.Paragraph : TextInputStyle.Short)
    .setRequired(options.required !== false);
  if (options.placeholder) input.setPlaceholder(options.placeholder);
  if (options.value != null) input.setValue(String(options.value).slice(0, options.maxLength || 4000));
  if (options.minLength) input.setMinLength(options.minLength);
  if (options.maxLength) input.setMaxLength(options.maxLength);
  return input;
}

function modal(customId, title, fields) {
  const builder = new ModalBuilder().setCustomId(customId).setTitle(title);
  builder.addComponents(...fields.map((field) => new ActionRowBuilder().addComponents(field)));
  return builder;
}

function parseNumber(value, { min, max, label }) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max) throw new RangeError(label + ' deve estar entre ' + min + ' e ' + max + '.');
  return number;
}

async function handleConfigInteraction(interaction) {
  const customId = interaction.customId || '';
  if (!customId.startsWith('config:')) return false;
  if (interaction.user.id !== config.ownerId || interaction.guildId !== config.guildId) {
    if (interaction.deferred || interaction.replied) {
      await replyV2(interaction, 'Acesso negado.', { ephemeral: true });
    } else {
      await interaction.reply({ content: 'Acesso negado.', flags: MessageFlags.Ephemeral });
    }
    return true;
  }

  try {
    if (interaction.isStringSelectMenu()) {
      const value = interaction.values[0];
      if (customId === 'config:nav') {
        if (value === 'xp') await showXp(interaction);
        else if (value === 'permissions') await showPermissions(interaction);
        else if (value === 'triggers') await showTriggers(interaction);
        else await showHome(interaction, true);
        return true;
      }
      if (customId === 'config:trigger:select') {
        await showTriggerDetail(interaction, value);
        return true;
      }
      if (customId === 'config:xp:buff:remove') {
        const cfg = await getGuildConfig(interaction.guildId);
        cfg.buffs = cfg.buffs.filter((buff) => !interaction.values.includes(buff.roleId));
        await cfg.save();
        await showXp(interaction);
        return true;
      }
      if (customId === 'config:permissions:remove') {
        const cfg = await getGuildConfig(interaction.guildId);
        cfg.adminRoleIds = cfg.adminRoleIds.filter((id) => !interaction.values.includes(id));
        await cfg.save();
        await showPermissions(interaction);
        return true;
      }
      if (customId.startsWith('config:trigger:response:select:')) {
        const triggerId = customId.split(':').at(-1);
        const index = Number(value);
        const cfg = await getGuildConfig(interaction.guildId);
        const trigger = cfg.triggers.id(triggerId);
        const response = trigger?.responses[index];
        if (response == null) throw new Error('Resposta não encontrada.');
        await interaction.update({ components: [container('## Resposta ' + (index + 1) + '\n' + response, [
          navRow(),
          row(button('config:trigger:response:edit:' + triggerId + ':' + index, 'Editar resposta', ButtonStyle.Primary), button('config:trigger:response:remove:' + triggerId + ':' + index, 'Remover resposta', ButtonStyle.Danger)),
          row(button('config:trigger:detail:' + triggerId, 'Voltar ao gatilho')),
        ])], allowedMentions: { parse: [] } });
        return true;
      }
    }

    if (interaction.isRoleSelectMenu()) {
      const cfg = await getGuildConfig(interaction.guildId);
      if (customId === 'config:permissions:add') {
        const updatedRoles = [...new Set([...cfg.adminRoleIds, ...interaction.values])];
        if (updatedRoles.length > 25) throw new RangeError('O painel aceita até 25 cargos autorizados.');
        cfg.adminRoleIds = updatedRoles;
        await cfg.save();
        await showPermissions(interaction);
        return true;
      }
      if (customId === 'config:xp:buff:add') {
        if (cfg.buffs.length >= 25 && !cfg.buffs.some((buff) => buff.roleId === interaction.values[0])) throw new RangeError('O painel aceita até 25 buffs por cargo.');
        await interaction.showModal(modal('config:modal:buff:' + interaction.values[0], 'Configurar buff por cargo', [
          shortInput('multiplier', 'Multiplicador (1 a 100)', { placeholder: 'Ex.: 1.5', maxLength: 6 }),
        ]));
        return true;
      }
    }

    if (interaction.isChannelSelectMenu() && customId === 'config:xp:exclude') {
      const cfg = await getGuildConfig(interaction.guildId);
      for (const channelId of interaction.values) {
        const channel = interaction.guild.channels.cache.get(channelId);
        const settings = channel && [ChannelType.GuildVoice, ChannelType.GuildStageVoice].includes(channel.type)
          ? cfg.voiceXp
          : cfg.messageXp;
        settings.excludedChannelIds = settings.excludedChannelIds.includes(channelId)
          ? settings.excludedChannelIds.filter((id) => id !== channelId)
          : [...settings.excludedChannelIds, channelId];
      }
      await cfg.save();
      await showXp(interaction);
      return true;
    }

    if (interaction.isModalSubmit()) {
      if (customId === 'config:modal:message_xp') {
        const min = parseNumber(interaction.fields.getTextInputValue('min'), { min: 0, max: 10000, label: 'XP mínimo' });
        const max = parseNumber(interaction.fields.getTextInputValue('max'), { min: 0, max: 10000, label: 'XP máximo' });
        const seconds = parseNumber(interaction.fields.getTextInputValue('cooldown'), { min: 0, max: 86400, label: 'Cooldown em segundos' });
        if (min > max) throw new RangeError('XP mínimo não pode superar o XP máximo.');
        const cfg = await getGuildConfig(interaction.guildId);
        cfg.messageXp.min = min;
        cfg.messageXp.max = max;
        cfg.messageXp.cooldownMs = seconds * 1000;
        await cfg.save();
        await showXp(interaction, false);
        return true;
      }
      if (customId === 'config:modal:voice_xp') {
        const min = parseNumber(interaction.fields.getTextInputValue('min'), { min: 0, max: 10000, label: 'XP mínimo' });
        const max = parseNumber(interaction.fields.getTextInputValue('max'), { min: 0, max: 10000, label: 'XP máximo' });
        const minutes = parseNumber(interaction.fields.getTextInputValue('interval'), { min: 1, max: 1440, label: 'Intervalo em minutos' });
        if (min > max) throw new RangeError('XP mínimo não pode superar o XP máximo.');
        const cfg = await getGuildConfig(interaction.guildId);
        cfg.voiceXp.min = min;
        cfg.voiceXp.max = max;
        cfg.voiceXp.intervalMs = minutes * 60000;
        await cfg.save();
        await showXp(interaction, false);
        return true;
      }
      if (customId.startsWith('config:modal:buff:')) {
        const roleId = customId.split(':').at(-1);
        const multiplier = Number(interaction.fields.getTextInputValue('multiplier'));
        if (!Number.isFinite(multiplier) || multiplier < 1 || multiplier > 100) throw new RangeError('O multiplicador deve estar entre 1 e 100.');
        const cfg = await getGuildConfig(interaction.guildId);
        const existing = cfg.buffs.find((buff) => buff.roleId === roleId);
        if (existing) existing.multiplier = multiplier;
        else cfg.buffs.push({ roleId, multiplier });
        await cfg.save();
        await showXp(interaction, false);
        return true;
      }
      if (customId === 'config:modal:trigger:create') {
        const text = interaction.fields.getTextInputValue('text').trim().replace(/\s+/g, ' ');
        const response = interaction.fields.getTextInputValue('response').trim();
        if (!text || !response) throw new RangeError('Gatilho e resposta não podem ficar vazios.');
        if (response.length > 1900) throw new RangeError('A resposta pode ter até 1.900 caracteres.');
        const cfg = await getGuildConfig(interaction.guildId);
        if (cfg.triggers.length >= 25) throw new RangeError('O painel aceita até 25 gatilhos.');
        if (cfg.triggers.some((trigger) => normalizeTriggerText(trigger.text) === normalizeTriggerText(text))) throw new RangeError('Já existe um gatilho com esse texto.');
        cfg.triggers.push({ text, responses: [response], enabled: true });
        await cfg.save();
        await showTriggers(interaction, false);
        return true;
      }
      if (customId.startsWith('config:modal:trigger:text:')) {
        const triggerId = customId.split(':').at(-1);
        const text = interaction.fields.getTextInputValue('text').trim().replace(/\s+/g, ' ');
        if (!text) throw new RangeError('O texto do gatilho não pode ficar vazio.');
        const cfg = await getGuildConfig(interaction.guildId);
        const trigger = cfg.triggers.id(triggerId);
        if (!trigger) throw new Error('Gatilho não encontrado.');
        if (cfg.triggers.some((item) => item.id !== triggerId && normalizeTriggerText(item.text) === normalizeTriggerText(text))) throw new RangeError('Já existe um gatilho com esse texto.');
        trigger.text = text;
        await cfg.save();
        await showTriggerDetail(interaction, triggerId, false);
        return true;
      }
      if (customId.startsWith('config:modal:trigger:response:add:') || customId.startsWith('config:modal:trigger:response:edit:')) {
        const parts = customId.split(':');
        const editing = parts[4] === 'edit';
        const triggerId = parts[parts.length - (editing ? 2 : 1)];
        const index = editing ? Number(parts.at(-1)) : -1;
        const response = interaction.fields.getTextInputValue('response').trim();
        if (!response) throw new RangeError('A resposta não pode ficar vazia.');
        if (response.length > 1900) throw new RangeError('A resposta pode ter até 1.900 caracteres.');
        const cfg = await getGuildConfig(interaction.guildId);
        const trigger = cfg.triggers.id(triggerId);
        if (!trigger) throw new Error('Gatilho não encontrado.');
        if (editing) {
          if (!trigger.responses[index]) throw new Error('Resposta não encontrada.');
          trigger.responses[index] = response;
        } else {
          if (trigger.responses.length >= 25) throw new RangeError('Cada gatilho pode ter até 25 respostas.');
          trigger.responses.push(response);
        }
        await cfg.save();
        await showTriggerDetail(interaction, triggerId, false);
        return true;
      }
    }

    if (interaction.isButton()) {
      if (customId === 'config:home') return showHome(interaction, true);
      if (customId === 'config:triggers') return showTriggers(interaction);
      if (customId.startsWith('config:trigger:detail:')) return showTriggerDetail(interaction, customId.split(':').at(-1));
      if (customId === 'config:xp:message') {
        const cfg = await getGuildConfig(interaction.guildId);
        await interaction.showModal(modal('config:modal:message_xp', 'XP por mensagem', [
          shortInput('min', 'XP mínimo', { value: cfg.messageXp.min, maxLength: 5 }),
          shortInput('max', 'XP máximo', { value: cfg.messageXp.max, maxLength: 5 }),
          shortInput('cooldown', 'Cooldown em segundos', { value: cfg.messageXp.cooldownMs / 1000, maxLength: 5 }),
        ]));
        return true;
      }
      if (customId === 'config:xp:voice') {
        const cfg = await getGuildConfig(interaction.guildId);
        await interaction.showModal(modal('config:modal:voice_xp', 'XP por voz', [
          shortInput('min', 'XP mínimo', { value: cfg.voiceXp.min, maxLength: 5 }),
          shortInput('max', 'XP máximo', { value: cfg.voiceXp.max, maxLength: 5 }),
          shortInput('interval', 'Intervalo em minutos', { value: cfg.voiceXp.intervalMs / 60000, maxLength: 4 }),
        ]));
        return true;
      }
      if (customId === 'config:xp:stack') {
        const cfg = await getGuildConfig(interaction.guildId);
        cfg.stackBuffs = !cfg.stackBuffs;
        await cfg.save();
        await showXp(interaction);
        return true;
      }
      if (customId.startsWith('config:permissions:remove:')) {
        const roleId = customId.split(':').at(-1);
        const cfg = await getGuildConfig(interaction.guildId);
        cfg.adminRoleIds = cfg.adminRoleIds.filter((id) => id !== roleId);
        await cfg.save();
        await showPermissions(interaction);
        return true;
      }
      if (customId === 'config:trigger:create') {
        await interaction.showModal(modal('config:modal:trigger:create', 'Criar gatilho', [
          shortInput('text', 'Texto exato do gatilho', { maxLength: 100, minLength: 1 }),
          shortInput('response', 'Primeira resposta', { paragraph: true, maxLength: 1900, minLength: 1 }),
        ]));
        return true;
      }
      if (customId.startsWith('config:trigger:text:')) {
        const triggerId = customId.split(':').at(-1);
        const cfg = await getGuildConfig(interaction.guildId);
        const trigger = cfg.triggers.id(triggerId);
        if (!trigger) throw new Error('Gatilho não encontrado.');
        await interaction.showModal(modal('config:modal:trigger:text:' + triggerId, 'Editar texto do gatilho', [
          shortInput('text', 'Novo texto exato', { value: trigger.text, maxLength: 100, minLength: 1 }),
        ]));
        return true;
      }
      if (customId.startsWith('config:trigger:response:add:')) {
        const triggerId = customId.split(':').at(-1);
        await interaction.showModal(modal('config:modal:trigger:response:add:' + triggerId, 'Adicionar resposta', [
          shortInput('response', 'Nova resposta', { paragraph: true, maxLength: 1900, minLength: 1 }),
        ]));
        return true;
      }
      if (customId.startsWith('config:trigger:toggle:') || customId.startsWith('config:trigger:delete:')) {
        const parts = customId.split(':');
        const action = parts[2];
        const triggerId = parts.at(-1);
        const cfg = await getGuildConfig(interaction.guildId);
        const trigger = cfg.triggers.id(triggerId);
        if (!trigger) throw new Error('Gatilho não encontrado.');
        if (action === 'toggle') trigger.enabled = !trigger.enabled;
        else trigger.deleteOne();
        await cfg.save();
        return showTriggers(interaction);
      }
      if (customId.startsWith('config:trigger:response:edit:') || customId.startsWith('config:trigger:response:remove:')) {
        const parts = customId.split(':');
        const action = parts[3];
        const triggerId = parts.at(-2);
        const index = Number(parts.at(-1));
        const cfg = await getGuildConfig(interaction.guildId);
        const trigger = cfg.triggers.id(triggerId);
        if (!trigger || !trigger.responses[index]) throw new Error('Resposta não encontrada.');
        if (action === 'remove') {
          trigger.responses.splice(index, 1);
          await cfg.save();
          return showTriggerDetail(interaction, triggerId);
        }
        await interaction.showModal(modal('config:modal:trigger:response:edit:' + triggerId + ':' + index, 'Editar resposta', [
          shortInput('response', 'Texto da resposta', { paragraph: true, value: trigger.responses[index], maxLength: 1900, minLength: 1 }),
        ]));
        return true;
      }
    }

    return false;
  } catch (error) {
    const message = error instanceof RangeError ? error.message : 'Não foi possível salvar a alteração. Tente novamente.';
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp({ content: message, flags: MessageFlags.Ephemeral }).catch(() => {});
    } else {
      await interaction.reply({ content: message, flags: MessageFlags.Ephemeral }).catch(() => {});
    }
    return true;
  }
}

async function executeConfigCommand(interaction) {
  if (interaction.user.id !== config.ownerId || interaction.guildId !== config.guildId) {
    await replyV2(interaction, 'Este painel é exclusivo do proprietário do bot.', { ephemeral: true });
    return;
  }
  await getGuildConfig(interaction.guildId);
  await showHome(interaction);
}

module.exports = { executeConfigCommand, handleConfigInteraction, showHome, showXp, showPermissions, showTriggers, showTriggerDetail };
