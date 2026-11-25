const { SlashCommandBuilder } = require('discord.js');
const { playCasino } = require('../../modules/economyService');
const { replyV2, resourceSection } = require('../../modules/components');
const { formatFragments } = require('../../modules/economyUtils');
const { say } = require('../../modules/personality');
const config = require('../../config');

const stake = (option) => option.setName('bet').setDescription('Fragmentos apostados').setMinValue(1).setMaxValue(1000000000).setRequired(true);
const data = new SlashCommandBuilder().setName('casino').setDescription('Jogue por Fragmentos no salão da Kiryu.')
  .addSubcommand((sub) => sub.setName('flip').setDescription('Escolha cara ou coroa')
    .addStringOption((option) => option.setName('side').setDescription('Seu palpite').setRequired(true).addChoices({ name: 'Cara', value: 'heads' }, { name: 'Coroa', value: 'tails' }))
    .addIntegerOption(stake))
  .addSubcommand((sub) => sub.setName('dice').setDescription('Escolha alto ou baixo; quatro devolve a aposta')
    .addStringOption((option) => option.setName('side').setDescription('Alto (5–6) ou baixo (1–3)').setRequired(true).addChoices({ name: 'Alto', value: 'high' }, { name: 'Baixo', value: 'low' }))
    .addIntegerOption(stake))
  .addSubcommand((sub) => sub.setName('slots').setDescription('Trio paga 5×; par devolve sua aposta')
    .addIntegerOption(stake));

function narrative(result, game) {
  if (game === 'slots' && result.net > result.amount) return say('jackpot');
  if (result.net > 0) return say('casinoWin');
  if (result.net === 0) return say('casinoPush');
  return say('casinoLoss');
}

async function execute(interaction) {
  if (interaction.guildId !== config.guildId) return;
  const selected = interaction.options.getSubcommand();
  const game = selected === 'flip' ? 'coin' : selected;
  const side = game === 'slots' ? null : interaction.options.getString('side');
  const choice = game === 'coin' ? (side === 'heads' ? 'cara' : 'coroa') : game === 'dice' ? (side === 'high' ? 'alto' : 'baixo') : null;
  const amount = interaction.options.getInteger('bet');
  const result = await playCasino({ guildId: interaction.guildId, userId: interaction.user.id, game, choice, amount });
  const payout = result.net > 0 ? '+' + formatFragments(result.net) : result.net < 0 ? '−' + formatFragments(-result.net) : formatFragments(0);
  const heading = game === 'coin' ? 'A moeda caiu' : game === 'dice' ? 'Os dados pararam' : 'A máquina revelou';
  const face = game === 'slots' ? '╭──────────────╮\n│　' + result.outcome.join('　') + '　│\n╰──────────────╯'
    : game === 'coin' ? '╭──────────╮\n│　🪙　' + String(result.outcome).toUpperCase() + '　│\n╰──────────╯'
      : '╭──────────╮\n│　🎲　' + result.outcome + '　│\n╰──────────╯';
  const message = [
    '# ' + heading,
    '**' + narrative(result, game) + '**',
    '',
    face,
    '',
    result.message,
  ].join('\n');
  await replyV2(interaction, message, {
    accentColor: config.visual.casino,
    sections: [
      resourceSection('Aposta', formatFragments(amount), '⬖', 'fragments'),
      resourceSection('Variação da carteira', payout, result.net > 0 ? '✦' : '◈', 'casino'),
      resourceSection('Fragmentos em mãos', formatFragments(result.account.wallet), '✧', 'fragments'),
    ],
  });
}

module.exports = { data, execute, narrative };
