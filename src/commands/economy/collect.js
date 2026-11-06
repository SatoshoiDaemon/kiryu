const { SlashCommandBuilder } = require('discord.js');
const { getClaimableRules } = require('../../modules/economyService');
const { getRoleIds } = require('../../modules/economyInteractions');
const { collectContainer, payload } = require('../../modules/economyViews');
const config = require('../../config');

const data = new SlashCommandBuilder().setName('coletar').setDescription('Consulte e colete recompensas disponíveis para seus cargos.');

async function execute(interaction) {
  if (interaction.guildId !== config.guildId) return;
  const roleIds = getRoleIds(interaction.member);
  const rules = await getClaimableRules(interaction.guildId, roleIds, interaction.user.id);
  await interaction.reply(payload(collectContainer(rules, interaction.user.id), true));
}

module.exports = { data, execute };
