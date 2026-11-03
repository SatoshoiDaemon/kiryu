const { ContainerBuilder, TextDisplayBuilder, MessageFlags } = require('discord.js');

function createContainer(content, rows = [], accentColor = 0x5865F2) {
  const container = new ContainerBuilder()
    .setAccentColor(accentColor)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(content));
  for (const row of rows) container.addActionRowComponents(row);
  return container;
}

async function replyV2(interaction, content, options = {}) {
  const container = createContainer(content, options.rows || [], options.accentColor);
  if (interaction.deferred || interaction.replied) {
    return interaction.editReply({
      components: [container],
      flags: MessageFlags.IsComponentsV2,
      allowedMentions: { parse: [] },
    });
  }
  return interaction.reply({
    components: [container],
    flags: options.ephemeral === true ? MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral : MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  });
}

async function replyMessageV2(message, content) {
  return message.reply({
    components: [createContainer(content)],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { repliedUser: false, parse: [] },
  });
}

module.exports = { createContainer, replyV2, replyMessageV2 };
