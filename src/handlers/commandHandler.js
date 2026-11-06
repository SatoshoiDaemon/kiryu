const { errorDetails } = require('../modules/errorDetails');
const { MessageFlags } = require('discord.js');
const logger = require('../logger');
const { handleConfigInteraction } = require('../modules/configPanel');
const { replyV2 } = require('../modules/components');
const { handleEconomyInteraction } = require('../modules/economyInteractions');

async function handleInteraction(interaction, client) {
  if (interaction.isChatInputCommand()) {
    const command = client.commands.get(interaction.commandName);
    if (!command) {
      await interaction.reply({ content: 'Este comando não está disponível no momento.', flags: MessageFlags.Ephemeral }).catch(() => {});
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
      const message = error.publicMessage || (error instanceof RangeError ? error.message : 'O comando encontrou um erro. Tente novamente em instantes.');
      await replyV2(interaction, message, {
        ephemeral: !interaction.deferred && !interaction.replied,
      }).catch(() => {});
    }
    return;
  }

  if (interaction.isButton() || interaction.isAnySelectMenu() || interaction.isModalSubmit()) {
    try {
      if (await handleConfigInteraction(interaction)) return;
      await handleEconomyInteraction(interaction);
    } catch (error) {
      logger.error('Falha ao processar interação (' + errorDetails(error) + ').');
      if (!interaction.deferred && !interaction.replied) {
        await interaction.reply({ content: 'Não foi possível processar esta ação.', flags: MessageFlags.Ephemeral }).catch(() => {});
      }
    }
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
    await message.reply({ content: 'O comando encontrou um erro. Tente novamente em instantes.', allowedMentions: { repliedUser: false } }).catch(() => {});
  }
}

module.exports = { handleInteraction, handlePrefixMessage };
