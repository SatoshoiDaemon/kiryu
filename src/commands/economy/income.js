const { SlashCommandBuilder } = require('discord.js');
const { claimAdventure, claimCrime, claimPassiveIncome } = require('../../modules/economyService');
const { replyV2, resourceSection } = require('../../modules/components');
const { formatFragments } = require('../../modules/economyUtils');
const { say } = require('../../modules/personality');
const config = require('../../config');

const data = new SlashCommandBuilder().setName('income').setDescription('Outras fontes de Fragmentos da comunidade.')
  .addSubcommand((sub) => sub.setName('adventure').setDescription('Explore uma expedição da Kiryu'))
  .addSubcommand((sub) => sub.setName('crime').setDescription('Tente um golpe fictício de alto risco'))
  .addSubcommand((sub) => sub.setName('passive').setDescription('Resgate renda passiva, se estiver ativa'));

const adventures = [
  'Você encontrou um posto de entrega perdido e levou o pacote ao destino.',
  'Uma trilha antiga revelou um pequeno estoque comunitário de Fragmentos.',
  'Você ajudou a equipe de campo e voltou com uma recompensa justa.',
  'A Kiryu marcou um caminho seguro; você trouxe o que encontrou de volta.',
];
const crimeWins = [
  'O plano fictício saiu limpo e ninguém ficou no prejuízo.',
  'Você recuperou uma caixa de Fragmentos abandonada no cenário.',
  'O golpe de brincadeira funcionou; a Kiryu registrou o resultado.',
];
const crimeFails = [
  'O plano foi descoberto no ensaio e a multa virtual saiu da carteira.',
  'A Kiryu percebeu a encenação antes do fim. A multa ficou no registro.',
  'O golpe fictício falhou e a segurança do salão aplicou a multa virtual.',
];

async function execute(interaction) {
  if (interaction.guildId !== config.guildId) return;
  const source = interaction.options.getSubcommand();
  if (source === 'passive') {
    const result = await claimPassiveIncome({ guildId: interaction.guildId, userId: interaction.user.id });
    await replyV2(interaction, '# Renda passiva resgatada\n' + say('passiveIncome') + '\n\nVocê recebeu **' + formatFragments(result.reward) + '**. A próxima coleta respeita o intervalo configurado.', {
      accentColor: config.visual.fragments,
      sections: [resourceSection('Carteira', formatFragments(result.account.wallet), '✦', 'fragments')],
    });
    return;
  }
  if (source === 'adventure') {
    const result = await claimAdventure({ guildId: interaction.guildId, userId: interaction.user.id });
    const story = adventures[Math.floor(Math.random() * adventures.length)];
    await replyV2(interaction, '# Expedição concluída\n' + say('adventure') + '\n\n' + story + '\n**Recompensa:** ' + formatFragments(result.reward), {
      accentColor: config.visual.fragments,
      sections: [resourceSection('Carteira', formatFragments(result.account.wallet), '✦', 'fragments')],
    });
    return;
  }
  const result = await claimCrime({ guildId: interaction.guildId, userId: interaction.user.id });
  const story = result.success ? crimeWins[Math.floor(Math.random() * crimeWins.length)] : crimeFails[Math.floor(Math.random() * crimeFails.length)];
  const amount = result.success ? formatFragments(result.reward) + ' adicionados' : formatFragments(result.fine) + ' de multa';
  await replyV2(interaction, '# Golpe de ficção · ' + (result.success ? 'sucesso' : 'interrompido') + '\n' + say(result.success ? 'crimeWin' : 'crimeFail') + '\n\n' + story + '\n**Resultado:** ' + amount + '.\n**Probabilidade de falha:** ' + result.settings.crime.failChancePercent + '%', {
    accentColor: result.success ? config.visual.fragments : config.visual.error,
    sections: [resourceSection('Carteira', formatFragments(result.account.wallet), '✦', 'fragments')],
  });
}

module.exports = { data, execute, adventures, crimeWins, crimeFails };
