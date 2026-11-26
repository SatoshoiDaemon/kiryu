const {
  ActionRowBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle, ChannelSelectMenuBuilder, ChannelType,
  MessageFlags, ModalBuilder, RoleSelectMenuBuilder, StringSelectMenuBuilder,
  TextInputBuilder, TextInputStyle,
} = require('discord.js');
const { getGuildConfig } = require('./xpService');
const aiGateway = require('./aiGateway');
const { createContainer, followUpV2, replyV2 } = require('./components');
const config = require('../config');

const AI_PAGES = [
  { label: 'Geral', value: 'home' },
  { label: 'Personalidade', value: 'personality' },
  { label: 'Geração', value: 'generation' },
  { label: 'Canais e acesso', value: 'access' },
  { label: 'Estatísticas', value: 'stats' },
];
const ACCESS_FIELDS = [
  { value: 'allowedChannelIds', label: 'Canais permitidos' },
  { value: 'blockedChannelIds', label: 'Canais bloqueados' },
  { value: 'allowedRoleIds', label: 'Cargos autorizados' },
  { value: 'blockedRoleIds', label: 'Cargos bloqueados' },
];
const AI_COLOR = config.visual.admin;

function row(...components) { return new ActionRowBuilder().addComponents(components); }

function button(customId, label, style = ButtonStyle.Secondary) {
  return new ButtonBuilder().setCustomId(customId).setLabel(label).setStyle(style);
}

function aiPageMenu(page) {
  return row(new StringSelectMenuBuilder().setCustomId('config:ai:page').setPlaceholder('Oficina de IA')
    .addOptions(AI_PAGES.map((item) => ({ label: item.label, value: item.value, default: item.value === page }))));
}

function panelPayload(title, body, rows = []) {
  return {
    components: [createContainer('# Kiryu Intelligence · ' + title + '\n' + body, rows, AI_COLOR, { divider: false })],
    allowedMentions: { parse: [] },
  };
}

async function updatePanel(interaction, payload, update = true) {
  if (interaction.deferred || interaction.replied) return interaction.editReply({ ...payload, flags: MessageFlags.IsComponentsV2 });
  if (update && interaction.update) return interaction.update(payload);
  return interaction.reply({ ...payload, flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
}

async function getAIConfig(guildId) {
  const guildConfig = await getGuildConfig(guildId);
  return { guildConfig, ai: guildConfig.ai };
}

async function saveAI(interaction, changes) {
  const { guildConfig } = await getAIConfig(interaction.guildId);
  guildConfig.ai ||= {};
  for (const [key, value] of Object.entries(changes)) guildConfig.ai[key] = value;
  await guildConfig.save();
  return guildConfig.ai;
}

function healthSummary(ai) {
  if (ai.lastHealthStatus === 'available' && ai.lastHealthCheckAt) return 'Último teste do Gateway: **disponível** · <t:' + Math.floor(new Date(ai.lastHealthCheckAt).getTime() / 1000) + ':R>.';
  if (ai.lastHealthStatus === 'unavailable' && ai.lastHealthCheckAt) return 'Último teste do Gateway: **indisponível** · <t:' + Math.floor(new Date(ai.lastHealthCheckAt).getTime() / 1000) + ':R>.';
  return 'Gateway ainda não testado nesta configuração.';
}

async function showAIHome(interaction, update = true, note = '') {
  const { ai } = await getAIConfig(interaction.guildId);
  const content = [
    '**Estado:** ' + (ai.enabled ? 'ativada' : 'desativada') + ' · **Modelo:** ' + (ai.model || 'cubic'),
    healthSummary(ai),
    'A Kiryu só conversa quando é mencionada diretamente ou quando alguém responde a uma mensagem dela. Não há comando slash de chat. O modelo de chat disponível no Gateway é `cubic`.',
    note,
  ].filter(Boolean).join('\n\n');
  return updatePanel(interaction, panelPayload('IA', content, [
    aiPageMenu('home'),
    row(button('config:ai:toggle', ai.enabled ? 'Desativar IA' : 'Ativar IA', ai.enabled ? ButtonStyle.Danger : ButtonStyle.Success), button('config:ai:connection-test', 'Testar conexão', ButtonStyle.Primary)),
    row(new StringSelectMenuBuilder().setCustomId('config:ai:model').setPlaceholder('Modelo de chat do Gateway')
      .addOptions(aiGateway.MODEL_CATALOG.map((model) => ({ label: model.label, value: model.id, default: (ai.model || 'cubic') === model.id })))),
    row(button('config:home', 'Voltar ao /config')),
  ]), update);
}

async function showAIPersonality(interaction, update = true, note = '') {
  const { ai } = await getAIConfig(interaction.guildId);
  const prompt = String(ai.systemPrompt || '');
  const preview = prompt ? prompt.slice(0, 2300) + (prompt.length > 2300 ? '\n\n[Prévia abreviada. Exporte o .txt para ver o prompt completo.]' : '') : '*Nenhum System Prompt configurado. Edite ou importe um arquivo .txt antes de ativar a IA.*';
  const content = [
    '**System Prompt** · ' + prompt.length.toLocaleString('pt-BR') + ' / 32.000 caracteres',
    'As mensagens dos membros são enviadas separadamente como conteúdo de conversa. O prompt atualiza no MongoDB e passa a valer nas próximas respostas.',
    'Para prompts acima de 4.000 caracteres, importe um `.txt` com `/config prompt_file:<arquivo>`; exporte a versão atual aqui.',
    '```text\n' + preview.replace(/```/g, 'ˋˋˋ') + '\n```',
    note,
  ].filter(Boolean).join('\n\n');
  return updatePanel(interaction, panelPayload('Personalidade', content, [
    aiPageMenu('personality'),
    row(button('config:ai:prompt:edit', 'Editar prompt', ButtonStyle.Primary), button('config:ai:prompt:import-help', 'Importar .txt'), button('config:ai:prompt:export', 'Exportar .txt')),
    row(button('config:ai:prompt:reset', 'Restaurar padrão', ButtonStyle.Danger), button('config:ai:personality-test', 'Testar personalidade', ButtonStyle.Success)),
    row(button('config:home', 'Voltar ao /config')),
  ]), update);
}

async function showAIGeneration(interaction, update = true, note = '') {
  const { ai } = await getAIConfig(interaction.guildId);
  const content = [
    '**Geração:** temperatura ' + ai.temperature + ' · saída até ' + ai.maxCompletionTokens + ' tokens · raciocínio `' + ai.reasoningEffort + '`.',
    '**Contexto local:** até ' + ai.contextMessages + ' mensagens e aproximadamente ' + Number(ai.contextTokenBudget).toLocaleString('pt-BR') + ' tokens de histórico (System Prompt somado separadamente). O Gateway aceita até 500 mensagens e limita contexto/saída pelo plano.',
    '**Confiabilidade:** timeout ' + Math.round(ai.timeoutMs / 1000) + ' s · máximo ' + ai.maxConcurrent + ' geração(ões) em paralelo. O bot espaça chamadas em 1 s para respeitar também o plano Standard.',
    note,
  ].filter(Boolean).join('\n\n');
  return updatePanel(interaction, panelPayload('Geração', content, [
    aiPageMenu('generation'),
    row(new StringSelectMenuBuilder().setCustomId('config:ai:reasoning').setPlaceholder('Parâmetro de raciocínio suportado')
      .addOptions(['none', 'minimal', 'low', 'medium', 'high'].map((value) => ({ label: 'Raciocínio · ' + value, value, default: ai.reasoningEffort === value })))),
    row(button('config:ai:generation:basic', 'Temperatura, saída e contexto', ButtonStyle.Primary)),
    row(button('config:ai:generation:member-limits', 'Cooldown e limites por membro'), button('config:ai:generation:global-limits', 'Limites globais e concorrência')),
    row(button('config:home', 'Voltar ao /config')),
  ]), update);
}

function accessName(field) { return ACCESS_FIELDS.find((item) => item.value === field)?.label || 'Canais e acesso'; }

function idLabel(interaction, field, id) {
  if (field.endsWith('ChannelIds')) return interaction.guild?.channels?.cache?.get(id)?.name || id;
  return interaction.guild?.roles?.cache?.get(id)?.name || id;
}

async function showAIAccess(interaction, update = true, selectedField = '', note = '') {
  const { ai } = await getAIConfig(interaction.guildId);
  const active = ACCESS_FIELDS.find((field) => field.value === selectedField) || null;
  const fieldSelect = row(new StringSelectMenuBuilder().setCustomId('config:ai:access:field').setPlaceholder('Escolha a lista que deseja editar')
    .addOptions(ACCESS_FIELDS.map((field) => ({ label: field.label, value: field.value, default: field.value === selectedField }))));
  const controls = [aiPageMenu('access'), fieldSelect];
  if (active?.value.endsWith('ChannelIds')) controls.push(row(new ChannelSelectMenuBuilder().setCustomId('config:ai:access:channels:' + active.value)
    .setPlaceholder('Substituir lista · escolha canais').setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.GuildForum, ChannelType.GuildPublicThread, ChannelType.GuildPrivateThread).setMinValues(1).setMaxValues(25)));
  if (active?.value.endsWith('RoleIds')) controls.push(row(new RoleSelectMenuBuilder().setCustomId('config:ai:access:roles:' + active.value)
    .setPlaceholder('Substituir lista · escolha cargos').setMinValues(1).setMaxValues(25)));
  const selectedIds = active ? (ai[active.value] || []) : [];
  if (active && selectedIds.length) controls.push(row(new StringSelectMenuBuilder().setCustomId('config:ai:access:remove:' + active.value)
    .setPlaceholder('Remover itens selecionados da lista').setMinValues(1).setMaxValues(Math.min(25, selectedIds.length))
    .addOptions(selectedIds.slice(0, 25).map((id) => ({ label: idLabel(interaction, active.value, id).slice(0, 100), value: id })))));
  if (active) controls.push(row(button('config:ai:access:clear:' + active.value, 'Limpar ' + accessName(active.value), ButtonStyle.Danger)));
  const accessLines = ACCESS_FIELDS.map((field) => {
    const ids = ai[field.value] || [];
    const entries = ids.slice(0, 6).map((id) => idLabel(interaction, field.value, id).slice(0, 40));
    const summary = entries.length ? entries.join(', ') + (ids.length > entries.length ? ' e +' + (ids.length - entries.length) + ' outros' : '') : 'nenhum';
    return '**' + field.label + ':** ' + summary;
  });
  const content = [
    'Listas permitidas vazias aceitam qualquer canal/cargo. Listas bloqueadas prevalecem sobre as permitidas. Em threads, a regra do canal-pai também vale.',
    ...accessLines,
    note,
  ].filter(Boolean).join('\n\n');
  return updatePanel(interaction, panelPayload('Canais e acesso', content, controls), update);
}

function fmt(value) { return Number(value || 0).toLocaleString('pt-BR'); }

function periodSummary(label, stats) {
  return '**' + label + '** · ' + fmt(stats.requests) + ' requisições · ' + fmt(stats.success) + ' êxitos · ' + fmt(stats.errors) + ' erros\n'
    + 'Tokens: ' + fmt(stats.inputTokens) + ' entrada / ' + fmt(stats.outputTokens) + ' saída / ' + fmt(stats.totalTokens) + ' total · média ' + fmt(stats.averageLatencyMs) + ' ms · p95 ' + fmt(stats.p95LatencyMs) + ' ms';
}

async function showAIStats(interaction, update = true) {
  const periods = await Promise.all(['day', 'week', 'month'].map((period) => aiGateway.getUsageStats(interaction.guildId, { period })));
  const users = periods[2].byMember.slice(0, 5).map((entry) => '<@' + entry._id + '> · ' + fmt(entry.requests) + ' requisições · ' + fmt(entry.totalTokens) + ' tokens').join('\n') || 'Ainda sem utilização registrada.';
  const models = periods[2].byModel.map((entry) => '`' + entry._id + '` · ' + fmt(entry.requests) + ' req. · ' + fmt(entry.totalTokens) + ' tokens').join('\n') || '`cubic` · sem utilização';
  const content = [
    periodSummary('Hoje (UTC)', periods[0]), periodSummary('Esta semana (UTC)', periods[1]), periodSummary('Este mês (UTC)', periods[2]),
    '**Por modelo no mês**\n' + models, '**Membros com maior uso no mês**\n' + users,
    'O Gateway retorna tokens, mas não informa custo por chamada. Os registros de uso não guardam prompts nem respostas e expiram após 400 dias.',
  ].join('\n\n');
  return updatePanel(interaction, panelPayload('Estatísticas', content, [aiPageMenu('stats'), row(button('config:ai:stats:refresh', 'Atualizar estatísticas'), button('config:home', 'Voltar ao /config'))]), update);
}

async function showAIPage(interaction, page = 'home', update = true, options = {}) {
  if (page === 'personality') return showAIPersonality(interaction, update, options.note || '');
  if (page === 'generation') return showAIGeneration(interaction, update, options.note || '');
  if (page === 'access') return showAIAccess(interaction, update, options.field || '', options.note || '');
  if (page === 'stats') return showAIStats(interaction, update);
  return showAIHome(interaction, update, options.note || '');
}

function textInput(customId, label, value, maxLength, paragraph = false) {
  const input = new TextInputBuilder().setCustomId(customId).setLabel(label)
    .setStyle(paragraph ? TextInputStyle.Paragraph : TextInputStyle.Short).setRequired(false).setMaxLength(maxLength);
  if (value != null && String(value).length) input.setValue(String(value).slice(0, maxLength));
  return input;
}

function modal(customId, title, fields) {
  const builder = new ModalBuilder().setCustomId(customId).setTitle(title);
  builder.addComponents(...fields.map((field) => new ActionRowBuilder().addComponents(field)));
  return builder;
}

function modalNumber(interaction, id, { min, max, integer = true, label }) {
  const raw = interaction.fields.getTextInputValue(id).trim();
  const number = Number(raw);
  if (!raw || !Number.isFinite(number) || (integer && !Number.isInteger(number)) || number < min || number > max) {
    throw new RangeError(label + ' deve estar entre ' + min + ' e ' + max + '.');
  }
  return number;
}

function persistStatusLine(success, result) {
  if (success) return 'Gateway disponível · modelo cubic · ' + fmt(result.usage?.totalTokens) + ' tokens nesta verificação.';
  return 'Gateway indisponível neste teste (' + String(result.errorCode || result.status || 'erro') + ').';
}

async function runConnectionTest(interaction, ai) {
  const result = await aiGateway.complete({
    guildId: interaction.guildId, userId: interaction.user.id,
    messages: [{ role: 'user', content: 'Retorne apenas a palavra OK.' }],
    settings: { ...ai, temperature: 0, maxCompletionTokens: 16, reasoningEffort: 'none', timeoutMs: 15000 },
    kind: 'connection-test',
  });
  const success = result.ok;
  await saveAI(interaction, { lastHealthCheckAt: new Date(), lastHealthStatus: success ? 'available' : 'unavailable' });
  await showAIHome(interaction, true, persistStatusLine(success, result));
  return result;
}

async function runPersonalityTest(interaction, ai) {
  if (!String(ai.systemPrompt || '').trim()) {
    await showAIPersonality(interaction, true, 'Defina um System Prompt antes de testar a personalidade.');
    return { ok: false, status: 'invalid', errorCode: 'empty_system_prompt' };
  }
  const result = await aiGateway.complete({
    guildId: interaction.guildId, userId: interaction.user.id,
    messages: [{ role: 'system', content: ai.systemPrompt }, { role: 'user', content: 'Escreva uma saudação breve para os membros do Eternity Realms. Não diga que isto é um teste.' }],
    settings: { ...ai, maxCompletionTokens: Math.min(256, ai.maxCompletionTokens || 256) }, kind: 'personality-test',
  });
  if (result.ok) await followUpV2(interaction, '**Resposta de teste · ' + fmt(result.usage?.totalTokens) + ' tokens**\n' + result.content.slice(0, 2200) + (result.content.length > 2200 ? '\n\n[Resposta abreviada para caber no painel.]' : ''));
  else await followUpV2(interaction, 'O teste não foi concluído (' + String(result.errorCode || result.status) + ').');
  return result;
}

async function applyModal(interaction, customId) {
  if (customId === 'config:modal:ai:prompt') {
    const systemPrompt = interaction.fields.getTextInputValue('systemPrompt');
    await saveAI(interaction, { systemPrompt });
    return showAIPersonality(interaction, false, 'System Prompt salvo. A próxima menção já usa a nova versão.');
  }
  if (customId === 'config:modal:ai:generation:basic') {
    const temperature = modalNumber(interaction, 'temperature', { min: 0, max: 2, integer: false, label: 'Temperatura' });
    const maxCompletionTokens = modalNumber(interaction, 'maxCompletionTokens', { min: 16, max: 6144, label: 'Limite de saída' });
    const contextMessages = modalNumber(interaction, 'contextMessages', { min: 1, max: 100, label: 'Mensagens de contexto' });
    const contextTokenBudget = modalNumber(interaction, 'contextTokenBudget', { min: 512, max: 32000, label: 'Orçamento de tokens do histórico' });
    const timeoutSeconds = modalNumber(interaction, 'timeoutSeconds', { min: 5, max: 90, label: 'Timeout em segundos' });
    await saveAI(interaction, { temperature, maxCompletionTokens, contextMessages, contextTokenBudget, timeoutMs: timeoutSeconds * 1000 });
    return showAIGeneration(interaction, false, 'Parâmetros salvos.');
  }
  if (customId === 'config:modal:ai:generation:member-limits') {
    const memberCooldownSeconds = modalNumber(interaction, 'memberCooldownSeconds', { min: 0, max: 86400, label: 'Cooldown por membro em segundos' });
    const maxRequestsPerMemberPerDay = modalNumber(interaction, 'memberRequests', { min: 1, max: 1000, label: 'Requisições diárias por membro' });
    const maxTokensPerMemberPerDay = modalNumber(interaction, 'memberTokens', { min: 1000, max: 1000000, label: 'Tokens diários por membro' });
    await saveAI(interaction, { memberCooldownSeconds, maxRequestsPerMemberPerDay, maxTokensPerMemberPerDay });
    return showAIGeneration(interaction, false, 'Limites por membro salvos.');
  }
  if (customId === 'config:modal:ai:generation:global-limits') {
    const maxConcurrent = modalNumber(interaction, 'maxConcurrent', { min: 1, max: 16, label: 'Gerações simultâneas' });
    const maxRequestsPerDay = modalNumber(interaction, 'maxRequestsPerDay', { min: 1, max: 10000, label: 'Requisições globais por dia' });
    const maxTokensPerDay = modalNumber(interaction, 'maxTokensPerDay', { min: 1000, max: 20000000, label: 'Tokens globais por dia' });
    await saveAI(interaction, { maxConcurrent, maxRequestsPerDay, maxTokensPerDay });
    return showAIGeneration(interaction, false, 'Limites globais salvos.');
  }
  return false;
}

async function importPromptAttachment(guildId, attachment) {
  if (!attachment?.url || !/\.txt$/i.test(attachment.name || '') || (attachment.size && attachment.size > 131072)) {
    throw new RangeError('Importe um arquivo .txt com até 128 KiB.');
  }
  let url;
  try { url = new URL(attachment.url); } catch { throw new RangeError('O anexo não tem uma URL válida.'); }
  if (url.protocol !== 'https:' || !['cdn.discordapp.com', 'media.discordapp.net'].includes(url.hostname) || url.username || url.password) {
    throw new RangeError('A importação aceita apenas anexos hospedados pelo Discord.');
  }
  const response = await fetch(url, { signal: AbortSignal.timeout(10000), redirect: 'error' });
  const contentType = response.headers.get('content-type') || '';
  if (!response.ok || !/^(text\/plain|application\/octet-stream)\b/i.test(contentType)) throw new RangeError('O arquivo precisa ser texto simples (.txt).');
  const reader = response.body?.getReader();
  if (!reader) throw new RangeError('Não foi possível ler o arquivo de texto.');
  const chunks = [];
  let byteLength = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      byteLength += value.byteLength;
      if (byteLength > 131072) {
        await reader.cancel();
        throw new RangeError('O arquivo excede 128 KiB.');
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  let systemPrompt;
  try { systemPrompt = new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n'); }
  catch { throw new RangeError('O arquivo precisa usar codificação UTF-8.'); }
  if (!systemPrompt.trim()) throw new RangeError('O arquivo está vazio.');
  if (systemPrompt.length > 32000) throw new RangeError('O System Prompt pode ter até 32.000 caracteres.');
  const guildConfig = await getGuildConfig(guildId);
  guildConfig.ai.systemPrompt = systemPrompt;
  await guildConfig.save();
  return systemPrompt.length;
}

async function handleAIConfigInteraction(interaction) {
  const customId = interaction.customId || '';
  if (!customId.startsWith('config:ai:') && !customId.startsWith('config:modal:ai:')) return false;
  if (interaction.isModalSubmit?.()) {
    const result = await applyModal(interaction, customId);
    return result === false ? false : true;
  }
  const { ai } = await getAIConfig(interaction.guildId);
  if (interaction.isStringSelectMenu?.()) {
    const value = interaction.values?.[0];
    if (customId === 'config:ai:page') return showAIPage(interaction, AI_PAGES.some((page) => page.value === value) ? value : 'home');
    if (customId === 'config:ai:model') {
      if (!aiGateway.MODEL_CATALOG.some((model) => model.id === value)) throw new RangeError('O Gateway disponibiliza somente `cubic` para conversas.');
      await saveAI(interaction, { model: value });
      return showAIHome(interaction, true, 'Modelo atualizado.');
    }
    if (customId === 'config:ai:reasoning') {
      if (!['none', 'minimal', 'low', 'medium', 'high'].includes(value)) throw new RangeError('Escolha um nível de raciocínio suportado.');
      await saveAI(interaction, { reasoningEffort: value });
      return showAIGeneration(interaction, true, 'Parâmetro de raciocínio salvo.');
    }
    if (customId === 'config:ai:access:field') return showAIAccess(interaction, true, value);
    if (customId.startsWith('config:ai:access:remove:')) {
      const field = customId.split(':').at(-1);
      if (!ACCESS_FIELDS.some((item) => item.value === field)) throw new RangeError('Lista de acesso inválida.');
      const next = (ai[field] || []).filter((id) => !interaction.values.includes(id));
      await saveAI(interaction, { [field]: next });
      return showAIAccess(interaction, true, field, 'Itens removidos da lista.');
    }
  }
  if (interaction.isChannelSelectMenu?.() && customId.startsWith('config:ai:access:channels:')) {
    const field = customId.split(':').at(-1);
    if (!['allowedChannelIds', 'blockedChannelIds'].includes(field)) throw new RangeError('Lista de canais inválida.');
    await saveAI(interaction, { [field]: [...new Set(interaction.values)].slice(0, 25) });
    return showAIAccess(interaction, true, field, 'Lista de canais salva.');
  }
  if (interaction.isRoleSelectMenu?.() && customId.startsWith('config:ai:access:roles:')) {
    const field = customId.split(':').at(-1);
    if (!['allowedRoleIds', 'blockedRoleIds'].includes(field)) throw new RangeError('Lista de cargos inválida.');
    await saveAI(interaction, { [field]: [...new Set(interaction.values)].slice(0, 25) });
    return showAIAccess(interaction, true, field, 'Lista de cargos salva.');
  }
  if (interaction.isButton?.()) {
    if (customId === 'config:ai:toggle') {
      const enabled = !ai.enabled;
      if (enabled && !String(ai.systemPrompt || '').trim()) throw new RangeError('Defina um System Prompt na seção Personalidade antes de ativar a IA.');
      if (enabled && !process.env.SQUARECLOUD_API_KEY) throw new Error('SQUARECLOUD_API_KEY não está disponível no ambiente do bot.');
      await saveAI(interaction, { enabled });
      return showAIHome(interaction, true, 'Configuração salva sem reiniciar a Kiryu.');
    }
    if (customId === 'config:ai:connection-test') return runConnectionTest(interaction, ai);
    if (customId === 'config:ai:prompt:edit') {
      const value = String(ai.systemPrompt || '');
      if (value.length > 4000) {
        await followUpV2(interaction, 'O prompt atual excede o limite de 4.000 caracteres do modal. Exporte o `.txt`, edite o arquivo e importe a nova versão com `/config prompt_file`.');
        return true;
      }
      await interaction.showModal(modal('config:modal:ai:prompt', 'Editar System Prompt', [textInput('systemPrompt', 'Prompt · até 4.000 caracteres', value, 4000, true)]));
      return true;
    }
    if (customId === 'config:ai:prompt:import-help') {
      await followUpV2(interaction, 'Use `/config prompt_file:<arquivo.txt>` para importar um prompt de até 32.000 caracteres. A nova versão fica ativa imediatamente.');
      return true;
    }
    if (customId === 'config:ai:prompt:export') {
      const prompt = String(ai.systemPrompt || '');
      await interaction.followUp({ content: 'System Prompt atual · UTF-8', files: [new AttachmentBuilder(Buffer.from(prompt, 'utf8'), { name: 'kiryu-system-prompt.txt' })], ephemeral: true, allowedMentions: { parse: [] } });
      return true;
    }
    if (customId === 'config:ai:prompt:reset') {
      await saveAI(interaction, { systemPrompt: '' });
      return showAIPersonality(interaction, true, 'System Prompt restaurado ao padrão vazio; defina uma personalidade antes de ativar a IA.');
    }
    if (customId === 'config:ai:personality-test') return runPersonalityTest(interaction, ai);
    if (customId === 'config:ai:generation:basic') {
      await interaction.showModal(modal('config:modal:ai:generation:basic', 'Geração e contexto', [
        textInput('temperature', 'Temperatura (0 a 2)', ai.temperature, 4),
        textInput('maxCompletionTokens', 'Tokens de saída (16 a 6.144)', ai.maxCompletionTokens, 4),
        textInput('contextMessages', 'Mensagens recentes (1 a 100)', ai.contextMessages, 3),
        textInput('contextTokenBudget', 'Tokens estimados do histórico (512 a 32.000)', ai.contextTokenBudget, 5),
        textInput('timeoutSeconds', 'Timeout em segundos (5 a 90)', Math.round(ai.timeoutMs / 1000), 2),
      ]));
      return true;
    }
    if (customId === 'config:ai:generation:member-limits') {
      await interaction.showModal(modal('config:modal:ai:generation:member-limits', 'Cooldown e limites por membro', [
        textInput('memberCooldownSeconds', 'Cooldown por membro em segundos (0 a 86.400)', ai.memberCooldownSeconds, 5),
        textInput('memberRequests', 'Requisições por membro por dia (1 a 1.000)', ai.maxRequestsPerMemberPerDay, 4),
        textInput('memberTokens', 'Tokens por membro por dia (1.000 a 1.000.000)', ai.maxTokensPerMemberPerDay, 7),
      ]));
      return true;
    }
    if (customId === 'config:ai:generation:global-limits') {
      await interaction.showModal(modal('config:modal:ai:generation:global-limits', 'Limites globais de utilização', [
        textInput('maxConcurrent', 'Gerações simultâneas (1 a 16)', ai.maxConcurrent, 2),
        textInput('maxRequestsPerDay', 'Requisições por dia (1 a 10.000)', ai.maxRequestsPerDay, 5),
        textInput('maxTokensPerDay', 'Tokens por dia (1.000 a 20.000.000)', ai.maxTokensPerDay, 8),
      ]));
      return true;
    }
    if (customId.startsWith('config:ai:access:clear:')) {
      const field = customId.split(':').at(-1);
      if (!ACCESS_FIELDS.some((item) => item.value === field)) throw new RangeError('Lista de acesso inválida.');
      await saveAI(interaction, { [field]: [] });
      return showAIAccess(interaction, true, field, 'Lista limpa.');
    }
    if (customId === 'config:ai:stats:refresh') return showAIStats(interaction, true);
    if (customId === 'config:home') {
      const { showHome } = require('./configPanel');
      return showHome(interaction, true);
    }
  }
  return true;
}

module.exports = { AI_PAGES, ACCESS_FIELDS, showAIHome, showAIPage, showAIPersonality, showAIStats, handleAIConfigInteraction, importPromptAttachment };
