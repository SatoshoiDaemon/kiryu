const { SlashCommandBuilder } = require('discord.js');
const { showInventory } = require('../../modules/economyInteractions');
const config = require('../../config');

const data = new SlashCommandBuilder().setName('inventario').setDescription('Consulte e utilize seus itens.');

async function execute(interaction) {
  if (interaction.guildId !== config.guildId) return;
  await showInventory(interaction, interaction.user.id, interaction.user.id, 0);
}

module.exports = { data, execute };
