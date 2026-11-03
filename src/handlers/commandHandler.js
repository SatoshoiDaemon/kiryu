const logger = require('../logger');
const { handleConfigInteraction } = require('../modules/configPanel');

async function handleInteraction(interaction, client) {
  if (interaction.isChatInputCommand()) {
    const command = client.commands.get(interaction.commandName);
    if (!command) return;
    try {
      await command.execute(interaction, client);
    } catch (error) {
      logger.error('Falha ao executar /' + interaction.commandName + ' (' + (error?.code || error?.name || 'erro') + ').');
      const response = { content: 'O comando encontrou um erro. Tente novamente em instantes.', ephemeral: true };
      if (interaction.deferred || interaction.replied) await interaction.followUp(response).catch(() => {});
      else await interaction.reply(response).catch(() => {});
    }
    return;
  }

  if (interaction.isButton() || interaction.isAnySelectMenu() || interaction.isModalSubmit()) {
    await handleConfigInteraction(interaction);
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
    logger.error('Falha ao executar comando de texto ' + name.toLowerCase() + ' (' + (error?.code || error?.name || 'erro') + ').');
    await message.reply({ content: 'O comando encontrou um erro. Tente novamente em instantes.', allowedMentions: { repliedUser: false } }).catch(() => {});
  }
}

module.exports = { handleInteraction, handlePrefixMessage };
