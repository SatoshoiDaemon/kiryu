const { errorDetails } = require('../modules/errorDetails');
const { MessageFlags } = require('discord.js');
const logger = require('../logger');
const { handleConfigInteraction } = require('../modules/configPanel');
const { replyV2, followUpV2, replyMessageV2 } = require('../modules/components');
const { handleEconomyInteraction } = require('../modules/economyInteractions');
const { handleProfileInteraction } = require('../commands/misc/profile');
const { handleBadgeInteraction } = require('../commands/admin/badges');
const metrics = require('../modules/performanceMetrics');
const { say } = require('../modules/personality');
const config = require('../config');

async function processInteraction(interaction, client) {
  if (interaction.isChatInputCommand()) {
    const command = client.commands.get(interaction.commandName);
    if (!command) {
      await replyV2(interaction, say('error'), { ephemeral: true, accentColor: config.visual.error }).catch(() => {});
      return;
    }
    try {
      // Deferred interaction responses can set Ephemeral. Set the V2 flag on the
      // first actual message edit/reply, together with its V2 container.
      const flags = command.deferEphemeral ? MessageFlags.Ephemeral : undefined;
      await interaction.deferReply(flags === undefined ? {} : { flags });
      await command.execute(interaction, client);
    } catch (error) {
      logger.error('Falha ao executar /' + interaction.commandName + ' (' + errorDetails(error) + ').');
      const detail = error.publicMessage || (error instanceof RangeError ? error.message : '');
      const message = say('error') + (detail ? '\n\n' + detail : '');
      await replyV2(interaction, message, {
        ephemeral: !interaction.deferred && !interaction.replied,
        accentColor: config.visual.error,
      }).catch(() => {});
    }
    return;
  }

  if (interaction.isButton() || interaction.isAnySelectMenu() || interaction.isModalSubmit()) {
    try {
      if (await handleProfileInteraction(interaction)) return;
      if (await handleBadgeInteraction(interaction)) return;
      if (await handleConfigInteraction(interaction)) return;
      await handleEconomyInteraction(interaction);
    } catch (error) {
      logger.error('Falha ao processar interação (' + errorDetails(error) + ').');
      const detail = error.publicMessage || (error instanceof RangeError ? error.message : 'Tente novamente ou reabra a interface.');
      const message = say('error') + '\n\n' + detail;
      if (interaction.deferred || interaction.replied) await followUpV2(interaction, message, { accentColor: config.visual.error }).catch(() => {});
      else await replyV2(interaction, message, { ephemeral: true, accentColor: config.visual.error }).catch(() => {});
    }
  }
}

function interactionLabel(interaction) {
  if (interaction.isChatInputCommand?.()) return 'command/' + interaction.commandName;
  const parts = String(interaction.customId || '').split(':');
  return 'component/' + (parts.slice(0, 2).join(':') || 'unknown');
}

function instrumentAcknowledgement(interaction, label, startedAt) {
  let recorded = false;
  for (const method of ['deferReply', 'deferUpdate', 'reply', 'update', 'showModal']) {
    const original = interaction[method];
    if (typeof original !== 'function') continue;
    try {
      Object.defineProperty(interaction, method, {
        configurable: true,
        writable: true,
        value: async function instrumentedAcknowledgement(...args) {
          try { return await original.apply(interaction, args); }
          finally {
            if (!recorded) {
              recorded = true;
              metrics.record('ack', label + '/' + method, metrics.performance.now() - startedAt);
            }
          }
        },
      });
    } catch { /* Instrumentação não pode interromper uma interação. */ }
  }
}

async function handleInteraction(interaction, client) {
  const startedAt = metrics.performance.now();
  const label = interactionLabel(interaction);
  instrumentAcknowledgement(interaction, label, startedAt);
  try {
    return await processInteraction(interaction, client);
  } finally {
    metrics.record('handler', label, metrics.performance.now() - startedAt);
  }
}

async function handlePrefixMessage(message, client) {
  if (message.author.bot || !message.guild || !message.content.startsWith(client.config.prefix)) return;
  const content = message.content.slice(client.config.prefix.length).trim();
  if (!content) return;
  const [name, ...args] = content.split(/\s+/);
  const command = client.commands.get(name.toLowerCase());
  if (!command?.executePrefix) return;
  try {
    await command.executePrefix(message, args, client);
  } catch (error) {
    logger.error('Falha ao executar comando de texto ' + name.toLowerCase() + ' (' + errorDetails(error) + ').');
    await replyMessageV2(message, say('error')).catch(() => {});
  }
}

module.exports = { handleInteraction, handlePrefixMessage };
