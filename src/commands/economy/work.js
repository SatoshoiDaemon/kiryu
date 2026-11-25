const { SlashCommandBuilder } = require('discord.js');
const { claimWork } = require('../../modules/economyService');
const { replyV2 } = require('../../modules/components');
const { formatFragments } = require('../../modules/economyUtils');
const config = require('../../config');
const { say } = require('../../modules/personality');

const data = new SlashCommandBuilder().setName('work').setDescription('Faça um serviço e receba Fragmentos.');
const jobs = ['conferiu a lista de tarefas da comunidade', 'ajudou a pôr ordem nos bastidores', 'resolveu um pequeno favor antes que virasse um grande problema', 'deu uma mão a alguém que precisava', 'fechou um serviço sem fazer alarde'];

async function execute(interaction) {
  if (interaction.guildId !== config.guildId) return;
  const result = await claimWork({ guildId: interaction.guildId, userId: interaction.user.id });
  const job = jobs[Math.floor(Math.random() * jobs.length)];
  await replyV2(interaction, '# Turno encerrado\n' + say('work') + '\n\nVocê ' + job + ' e recebeu **' + formatFragments(result.reward) + '**.\n**Carteira:** ' + formatFragments(result.account.wallet), { accentColor: config.visual.fragments });
}

module.exports = { data, execute };
