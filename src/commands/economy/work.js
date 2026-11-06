const { SlashCommandBuilder } = require('discord.js');
const { claimWork } = require('../../modules/economyService');
const { replyV2 } = require('../../modules/components');
const { formatFragments } = require('../../modules/economyUtils');
const config = require('../../config');

const data = new SlashCommandBuilder().setName('trabalhar').setDescription('Trabalhe para receber Fragmentos.');
const jobs = ['ajudou a organizar a feira de Eternity', 'entregou uma encomenda na capital', 'colheu ervas raras nos arredores', 'auxiliou um artesão da cidade', 'guiou viajantes por uma rota segura'];

async function execute(interaction) {
  if (interaction.guildId !== config.guildId) return;
  const result = await claimWork({ guildId: interaction.guildId, userId: interaction.user.id });
  const job = jobs[Math.floor(Math.random() * jobs.length)];
  await replyV2(interaction, '# Trabalho concluído\nVocê ' + job + ' e recebeu **' + formatFragments(result.reward) + '**.\n**Carteira:** ' + formatFragments(result.account.wallet), { accentColor: 0x008C52 });
}

module.exports = { data, execute };
