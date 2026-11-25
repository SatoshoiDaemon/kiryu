const { SlashCommandBuilder } = require('discord.js');
const { getClaimableRules } = require('../../modules/economyService');
const { getRoleIds } = require('../../modules/economyInteractions');
const { collectContainer, payload, respond } = require('../../modules/economyViews');
const config = require('../../config');

const data = new SlashCommandBuilder().setName('rewards').setDescription('Consulte e resgate suas recompensas da comunidade.')
  .addSubcommand((sub) => sub.setName('claim').setDescription('Ver e coletar recompensas disponíveis'));

async function execute(interaction) {
  if (interaction.guildId !== config.guildId) return;
  const roleIds = getRoleIds(interaction.member);
  const rules = await getClaimableRules(interaction.guildId, roleIds, interaction.user.id);
  await respond(interaction, payload(collectContainer(rules, interaction.user.id), true));
}

module.exports = { data, execute, deferEphemeral: true };
