const { SlashCommandBuilder } = require('discord.js');
const { claimDaily } = require('../../modules/economyService');
const { replyV2 } = require('../../modules/components');
const { ORBS, ORB_TYPES, formatFragments } = require('../../modules/economyUtils');
const config = require('../../config');

const data = new SlashCommandBuilder().setName('daily').setDescription('Resgate sua recompensa diária de Fragmentos e Orbes.');

async function execute(interaction) {
  if (interaction.guildId !== config.guildId) return;
  const result = await claimDaily({ guildId: interaction.guildId, userId: interaction.user.id });
  const orbs = ORB_TYPES.filter((type) => result.orbs[type] > 0).map((type) => '• ' + ORBS[type].emoji + ' ' + result.orbs[type].toLocaleString('pt-BR') + ' Orbe(s) ' + ORBS[type].label);
  const text = [
    '# Recompensa diária coletada',
    '• **' + formatFragments(result.fragments) + '**',
    ...orbs,
    '',
    '**Carteira:** ' + formatFragments(result.account.wallet),
    '**Última coleta:** <t:' + Math.floor(result.collectedAt.getTime() / 1000) + ':F>',
  ].join('\n');
  await replyV2(interaction, text, { accentColor: 0x008C52 });
}

module.exports = { data, execute };
