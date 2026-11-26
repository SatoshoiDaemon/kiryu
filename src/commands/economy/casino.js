const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getAccount, getSettings, assertCasinoChannel } = require('../../modules/economyService');
const { editCasino, gameMenu, lobbyText, GAME_NAMES, startSelectedGame } = require('../../modules/casinoInteractions');
const { replyV2 } = require('../../modules/components');
const config = require('../../config');

const games = Object.entries(GAME_NAMES).map(([value, name]) => ({ name, value }));
const data = new SlashCommandBuilder().setName('casino').setDescription('Abra o salão da Kiryu ou escolha um jogo individual.')
  .addStringOption((option) => option.setName('game').setDescription('Jogo individual; sem escolha abre a central').setRequired(false).addChoices(...games))
  .addIntegerOption((option) => option.setName('bet').setDescription('Aposta em Fragmentos').setMinValue(1).setMaxValue(1000000000).setRequired(false))
  .addStringOption((option) => option.setName('pick').setDescription('Escolha: heads/tails, high/low, cor ou baú').setRequired(false).addChoices(
    { name: 'Cara', value: 'heads' }, { name: 'Coroa', value: 'tails' }, { name: 'Alto', value: 'high' }, { name: 'Baixo', value: 'low' },
    { name: 'Vermelho', value: 'red' }, { name: 'Preto', value: 'black' }, { name: 'Par', value: 'even' }, { name: 'Ímpar', value: 'odd' },
    { name: 'Baú 1', value: '1' }, { name: 'Baú 2', value: '2' }, { name: 'Baú 3', value: '3' }, { name: 'Baú 4', value: '4' }, { name: 'Baú 5', value: '5' },
  ))
  .addIntegerOption((option) => option.setName('number').setDescription('Número da roleta, entre 0 e 36').setMinValue(0).setMaxValue(36).setRequired(false))
  .addStringOption((option) => option.setName('numbers').setDescription('Keno: cinco números separados por vírgulas').setRequired(false).setMaxLength(32))
  .addIntegerOption((option) => option.setName('tickets').setDescription('Loteria: bilhetes nesta compra · 1 a 10').setMinValue(1).setMaxValue(10).setRequired(false));

function homeRows(ownerId, settings) {
  return [gameMenu(ownerId, settings), new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('casino:history:' + ownerId).setLabel('Meu histórico').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('casino:stats:' + ownerId).setLabel('Minhas estatísticas').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('casino:rooms:' + ownerId).setLabel('Salas multiplayer').setStyle(ButtonStyle.Primary),
  )];
}

async function execute(interaction) {
  if (interaction.guildId !== config.guildId) return;
  const game = interaction.options.getString('game');
  const account = await getAccount(interaction.guildId, interaction.user.id);
  const settings = await getSettings(interaction.guildId);
  assertCasinoChannel(settings, interaction.channelId);
  if (!game) {
    return editCasino(interaction, lobbyText(account, settings), {
      game: 'lobby', rows: homeRows(interaction.user.id, settings),
    });
  }
  if (game === 'lottery') {
    return startSelectedGame(interaction, game, null, null, null, interaction.options.getInteger('tickets') || 1);
  }
  if (game === 'racing' || game === 'poker') return startSelectedGame(interaction, game, null, null, null);
  const bet = interaction.options.getInteger('bet');
  if (!bet) throw new RangeError('Informe a aposta em `bet` antes de iniciar.');
  const pick = interaction.options.getString('pick');
  const number = interaction.options.getInteger('number');
  const numbers = interaction.options.getString('numbers');
  const choice = game === 'coinflip' || game === 'dice' || game === 'highlow' ? pick
    : game === 'roulette' ? (number != null ? String(number) : pick)
      : game === 'treasure' ? pick : null;
  if (['coinflip', 'dice', 'highlow', 'roulette', 'treasure'].includes(game) && choice == null) throw new RangeError('Escolha seu palpite antes de iniciar o jogo.');
  if (game === 'keno' && !numbers) throw new RangeError('Informe cinco números para jogar Keno.');
  return startSelectedGame(interaction, game, bet, choice, numbers);
}

module.exports = { data, execute, homeRows };
