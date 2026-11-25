const { SlashCommandBuilder } = require('discord.js');
const { claimDaily } = require('../../modules/economyService');
const { replyV2, resourceSection } = require('../../modules/components');
const { say } = require('../../modules/personality');
const { ORBS, ORB_TYPES, formatFragments } = require('../../modules/economyUtils');
const config = require('../../config');

const data = new SlashCommandBuilder().setName('daily').setDescription('Resgate sua recompensa diária de Fragmentos e Orbes.');

async function execute(interaction) {
  if (interaction.guildId !== config.guildId) return;
  const result = await claimDaily({ guildId: interaction.guildId, userId: interaction.user.id });
  const orbs = ORB_TYPES.filter((type) => result.orbs[type] > 0).map((type) => resourceSection(
    'Orbe ' + ORBS[type].label, '+' + result.orbs[type].toLocaleString('pt-BR'), ORBS[type].sigil, 'orb-' + type,
  ));
  const timestamp = Math.floor(result.nextResetAt.getTime() / 1000);
  const text = [
    '# O cofre do dia é seu',
    say('daily'),
    '**Na carteira agora:** ' + formatFragments(result.account.wallet),
    '**Resgatado:** <t:' + Math.floor(result.collectedAt.getTime() / 1000) + ':F>',
    '**Próxima abertura:** <t:' + timestamp + ':R> · <t:' + timestamp + ':t>',
  ].join('\n');
  await replyV2(interaction, text, { accentColor: config.visual.fragments, sections: [
    resourceSection('Fragmentos recebidos', '+' + formatFragments(result.fragments), '✧', 'fragments'), ...orbs,
  ] });
}

module.exports = { data, execute };
