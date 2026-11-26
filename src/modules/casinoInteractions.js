const {
  ActionRowBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle, ContainerBuilder,
  MediaGalleryBuilder, MediaGalleryItemBuilder, MessageFlags, ModalBuilder,
  StringSelectMenuBuilder, TextDisplayBuilder, TextInputBuilder, TextInputStyle,
} = require('discord.js');
const config = require('../config');
const { EconomyError, formatFragments } = require('./economyUtils');
const { renderCasinoImage } = require('./casinoArt');
const { headerSection, decorateContainer, resourceSection } = require('./components');
const { getAccount, getSettings, playCasino, assertCasinoChannel } = require('./economyService');
const { startBlackjack, blackjackAction, startMines, minesAction, blackjackView } = require('./casinoSessionService');
const { buyLotteryTickets, lotterySummary } = require('./lotteryService');
const { createGameRoom } = require('./gameRoomService');
const { say } = require('./personality');
const { EconomyTransaction } = require('../database');

const GAME_NAMES = {
  slots: 'Caça-níquel', blackjack: 'Blackjack', roulette: 'Roleta', coinflip: 'Cara ou coroa', dice: 'Dados',
  mines: 'Minas', highlow: 'Maior ou menor', wheel: 'Roda da fortuna', keno: 'Keno', treasure: 'Baús do tesouro',
  lottery: 'Loteria da comunidade',
  racing: 'Corridas', poker: 'Poker recreativo',
};
const GAME_RULES = {
  slots: 'Três símbolos iguais pagam 5× o total; um par devolve a aposta.',
  blackjack: 'Chegue perto de 21 sem ultrapassar. Natural paga 2,5×; vitória 2×; empate devolve a aposta.',
  roulette: 'Roleta europeia: 0 verde, 18 vermelhos e 18 pretos. Cor/paridade paga 2×; número exato paga 36×.',
  coinflip: 'Acerte cara ou coroa para receber 2× o total da aposta.',
  dice: 'Escolha alto (5–6) ou baixo (1–3). O 4 devolve a aposta; acerto paga 2×.',
  mines: 'Tabuleiro de 24 casas e 5 minas. A cada casa segura, cresce o retorno possível; você decide quando sair.',
  highlow: 'Compare duas cartas. Acerte se a segunda for maior ou menor; empate devolve a aposta.',
  wheel: '16 setores: 4× 0, 3× 0,5, 8× 1 e 1× 3. O pagamento total segue o setor indicado.',
  keno: 'Escolha 5 números de 1–40; 10 são sorteados. Acertos 0–5 pagam 0×, 0×, 0,5×, 3×, 15× e 100×.',
  treasure: 'Escolha 1 de 5 baús: pagamentos totais 0×, 0×, 1×, 1× e 3×, embaralhados a cada rodada.',
  lottery: 'Cada bilhete custa o valor publicado. O prêmio acumula e uma entrada é sorteada diariamente à meia-noite de São Paulo.',
  racing: 'Corridas multiplayer recreativas para até oito participantes, sem apostas.',
  poker: 'Poker de Texas hold’em recreativo para até seis participantes, sem apostas.',
};

function gameRule(game, settings = {}) {
  const casino = settings.casino || {};
  const source = game === 'coinflip' ? casino.flip : casino[game];
  const multiplier = Number(source?.multiplier) || (game === 'slots' ? 5 : 2);
  if (game === 'slots') return 'Três símbolos iguais pagam ' + multiplier + '× o total; um par devolve a aposta.';
  if (game === 'coinflip') return 'Acerte cara ou coroa para receber ' + multiplier + '× o total da aposta.';
  if (game === 'dice') return 'Escolha alto (5–6) ou baixo (1–3). O 4 devolve a aposta; acerto paga ' + multiplier + '×.';
  return GAME_RULES[game];
}

function resultRule(game, result) {
  if (game === 'slots') return 'Três símbolos iguais pagam ' + result.multiplier + '×; um par devolve a aposta.';
  if (game === 'coinflip') return 'A escolha correta paga ' + result.multiplier + '× o total apostado.';
  if (game === 'dice') return 'O 4 devolve a aposta; um acerto paga ' + result.multiplier + '×.';
  return GAME_RULES[game];
}

function casinoContainer(content, { game = 'lobby', state = null, outcome = null, details = {}, sections = [], rows = [] } = {}) {
  const image = renderCasinoImage({ game, state, outcome, details, title: GAME_NAMES[game] || 'Salão da Kiryu' });
  const filename = 'kiryu-casino-' + game + '.png';
  const container = new ContainerBuilder().setAccentColor(config.visual.casino)
    .addSectionComponents(headerSection(GAME_NAMES[game] || 'Salão da Kiryu', 'Jogos com moeda virtual da comunidade · sem valor financeiro real', 'casino'))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(content))
    .addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL('attachment://' + filename).setDescription('Mesa ' + (GAME_NAMES[game] || 'Kiryu Casino'))));
  sections.forEach((section) => container.addSectionComponents(section));
  rows.forEach((row) => container.addActionRowComponents(row));
  decorateContainer(container);
  return { container, image, filename };
}

async function editCasino(interaction, content, options = {}) {
  const view = casinoContainer(content, options);
  const attachment = new AttachmentBuilder(view.image, { name: view.filename });
  const payload = { components: [view.container], files: [attachment], flags: MessageFlags.IsComponentsV2 | (options.ephemeral ? MessageFlags.Ephemeral : 0), allowedMentions: { parse: [] } };
  if (interaction.deferred || interaction.replied) return interaction.editReply(payload);
  return interaction.reply(payload);
}

function gameMenu(ownerId, settings = {}) {
  return new ActionRowBuilder().addComponents(new StringSelectMenuBuilder()
    .setCustomId('casino:choose:' + ownerId).setPlaceholder('Escolha um jogo ou evento do cassino')
    .addOptions(Object.entries(GAME_NAMES).map(([value, label]) => ({ label, value, description: gameRule(value, settings).slice(0, 100) }))));
}

function lobbyText(account, settings) {
  const enabled = Object.keys(GAME_NAMES).filter((game) => (game === 'coinflip' ? settings.casino?.flip?.enabled !== false : settings.casino?.games?.[game]?.enabled !== false)
    && settings.casino?.[game]?.enabled !== false);
  const names = enabled.map((game) => '• **' + GAME_NAMES[game] + '** · ' + gameRule(game, settings)).join('\n');
  return '# Central do cassino\n**Saldo disponível:** ' + formatFragments(account.wallet)
    + '\n**Aposta máxima:** ' + formatFragments(settings.casino?.maxBet || 1000000000)
    + '\n**Cooldown:** ' + (settings.casino?.cooldownMs ? Math.ceil(settings.casino.cooldownMs / 1000) + ' segundos' : 'sem intervalo entre rodadas')
    + '\n**Limite diário de perdas:** ' + (settings.casino?.dailyLossLimit ? formatFragments(settings.casino.dailyLossLimit) : 'desativado')
    + '\n\n## Jogos e eventos\n' + (names || 'Todos os jogos estão temporariamente desativados.')
    + '\n\n## Multiplayer\nUse `/game list` para corridas recreativas, poker, RPS, Quatro em linha e jogo da velha. A loteria comunitária vende bilhetes em moeda virtual e sorteia no horário publicado.\n\nAs regras e pagamentos são fixos e publicados. Nenhum resultado depende do saldo, histórico ou comportamento de quem joga.';
}

function sessionRows(session) {
  if (session.game === 'blackjack') {
    const actions = session.status === 'active'
      ? [new ButtonBuilder().setCustomId('casino:bj:' + session.sessionId + ':hit').setLabel('Pedir carta').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('casino:bj:' + session.sessionId + ':stand').setLabel('Parar').setStyle(ButtonStyle.Success)]
      : [new ButtonBuilder().setCustomId('casino:refresh:' + session.sessionId).setLabel('Atualizar estado').setStyle(ButtonStyle.Secondary).setDisabled(true)];
    return [new ActionRowBuilder().addComponents(actions)];
  }
  if (session.game === 'mines' && session.status === 'active') {
    const rows = [];
    for (let row = 0; row < 4; row += 1) {
      rows.push(new ActionRowBuilder().addComponents(Array.from({ length: 5 }, (_, col) => {
        const cell = row * 5 + col;
        const revealed = session.state.revealed.includes(cell);
        return new ButtonBuilder().setCustomId('casino:mine:' + session.sessionId + ':' + cell)
          .setLabel(revealed ? '◆' : String(cell + 1)).setStyle(revealed ? ButtonStyle.Success : ButtonStyle.Secondary).setDisabled(revealed);
      })));
    }
    rows.push(new ActionRowBuilder().addComponents(
      ...Array.from({ length: 4 }, (_, col) => {
        const cell = 20 + col;
        const revealed = session.state.revealed.includes(cell);
        return new ButtonBuilder().setCustomId('casino:mine:' + session.sessionId + ':' + cell)
          .setLabel(revealed ? '◆' : String(cell + 1)).setStyle(revealed ? ButtonStyle.Success : ButtonStyle.Secondary).setDisabled(revealed);
      }),
      new ButtonBuilder().setCustomId('casino:minecash:' + session.sessionId).setLabel('Sacar').setStyle(ButtonStyle.Success),
    ));
    return rows;
  }
  return [];
}

function sessionText(session) {
  const bet = session.state.bet;
  if (session.game === 'blackjack') {
    const view = blackjackView(session);
    const resultLine = session.status === 'active' ? 'A mão está em andamento. Escolha uma ação; as cartas já reveladas não mudam.'
      : view.outcome === 'natural' ? 'Blackjack natural. O retorno total é 2,5×.'
        : view.outcome === 'win' ? 'Você venceu a mão. O retorno total é 2×.'
          : view.outcome === 'push' ? 'Empate. A aposta voltou inteira.' : 'A mão terminou sem pagamento.';
    return '# Blackjack · mesa individual\n' + resultLine + '\n\n**Aposta:** ' + formatFragments(bet)
      + '\n**Sua mão:** ' + view.playerTotal + (view.dealerTotal == null ? ' · Dealer: carta oculta' : ' · **Dealer:** ' + view.dealerTotal)
      + (session.status === 'completed' ? '\n**Pagamento total:** ' + formatFragments(session.state.payout || 0) : '');
  }
  const state = session.state;
  const payout = Math.floor(bet * state.multiplier);
  const status = session.status === 'active'
    ? 'Revele uma casa. Você pode sacar após revelar ao menos uma casa segura.'
    : state.outcome === 'mine' ? 'Uma mina apareceu. A rodada foi encerrada.'
      : state.outcome === 'cash_out' ? 'Você sacou antes de encontrar uma mina.' : 'A sessão foi encerrada.';
  return '# Minas · tabuleiro 24 casas\n' + status + '\n\n**Aposta:** ' + formatFragments(bet)
    + '\n**Casas seguras:** ' + state.revealed.length + ' · **Multiplicador:** ' + Number(state.multiplier || 1).toFixed(2) + '×'
    + '\n**Pagamento se sacar agora:** ' + formatFragments(payout)
    + (session.status === 'completed' ? '\n**Pagamento final:** ' + formatFragments(session.state.payout || 0) : '');
}

async function showSession(interaction, session) {
  const details = session.game === 'blackjack'
    ? { playerTotal: blackjackView(session).playerTotal, dealerTotal: blackjackView(session).dealerTotal }
    : {};
  const account = await getAccount(session.guildId, session.ownerId);
  return editCasino(interaction, sessionText(session), {
    game: session.game, state: session.state, details,
    sections: [resourceSection('Aposta', formatFragments(session.state.bet), '◈', 'casino'), resourceSection('Carteira', formatFragments(account.wallet), '✦', 'fragments')],
    rows: sessionRows(session),
  });
}

function parseModalFields(interaction) {
  const betText = interaction.fields.getTextInputValue('bet').trim();
  if (!/^\d+$/.test(betText) || !Number.isSafeInteger(Number(betText)) || Number(betText) < 1) throw new RangeError('Aposta deve ser um número inteiro positivo.');
  const pick = interaction.fields.getTextInputValue('pick')?.trim() || '';
  const numbers = interaction.fields.fields.has('numbers') ? interaction.fields.getTextInputValue('numbers').trim() : '';
  return { bet: Number(betText), pick, numbers };
}

async function startSelectedGame(interaction, game, bet, pick, numbers, ticketCount = 1) {
  if (game === 'racing' || game === 'poker') {
    const session = await createGameRoom({ guildId: interaction.guildId, ownerId: interaction.user.id, game, visibility: 'public', interactionId: interaction.id, channelId: interaction.channelId });
    let publicRoom = null;
    try {
      publicRoom = await interaction.channel.send({ components: [require('../commands/games/game').roomContainer(session)], allowedMentions: { parse: [] } });
      await require('../database').GameSession.updateOne({ sessionId: session.sessionId }, { $set: { messageId: publicRoom.id, channelId: publicRoom.channelId } });
    } catch { /* The persistent room remains available through /game view. */ }
    return replyV2(interaction, '# Sala multiplayer criada\n' + say('gameRoom') + '\n\n**Jogo:** ' + GAME_NAMES[game] + '\n**ID:** `' + session.sessionId + '`' + (publicRoom ? '\nA sala pública está neste canal.' : '\nAbra com `/game view session_id:' + session.sessionId + '`.') + '\n\nPartida recreativa, sem apostas ou prêmios financeiros.', { accentColor: config.visual.casino, ephemeral: true });
  }
  if (game === 'lottery') {
    const purchased = await buyLotteryTickets({ guildId: interaction.guildId, userId: interaction.user.id, count: ticketCount, interactionId: interaction.id, channelId: interaction.channelId });
    return editCasino(interaction, lotterySummary(purchased.session) + '\n\nVocê comprou **' + purchased.count + ' bilhete(s)** por ' + formatFragments(purchased.total) + '.', {
      game, sections: [resourceSection('Bilhetes desta compra', String(purchased.count), '🎟️', 'casino')],
    });
  }
  if (game === 'blackjack') return showSession(interaction, await startBlackjack({ guildId: interaction.guildId, userId: interaction.user.id, bet, interactionId: interaction.id, channelId: interaction.channelId }));
  if (game === 'mines') return showSession(interaction, await startMines({ guildId: interaction.guildId, userId: interaction.user.id, bet, interactionId: interaction.id, channelId: interaction.channelId }));
  const choice = game === 'coinflip' ? pick : game === 'dice' || game === 'highlow' ? pick : game === 'roulette' ? pick : game === 'treasure' ? String(Number(pick) - 1) : null;
  let selectedNumbers = null;
  if (game === 'keno') {
    selectedNumbers = numbers.split(/[ ,]+/).filter(Boolean).map(Number);
    if (selectedNumbers.length !== 5) throw new RangeError('Keno pede cinco números separados por vírgula.');
  }
  const result = await playCasino({ guildId: interaction.guildId, userId: interaction.user.id, game, amount: bet, choice, numbers: selectedNumbers, interactionId: interaction.id, channelId: interaction.channelId });
  const outcome = typeof result.outcome === 'object' ? result.outcome : null;
  const face = game === 'slots' ? '**Símbolos:** ' + result.outcome.join(' · ')
    : game === 'roulette' ? '**Casa:** ' + result.outcome.pocket + ' · ' + (result.outcome.color === 'green' ? 'verde' : result.outcome.color === 'red' ? 'vermelho' : 'preto')
      : game === 'keno' ? '**Sorteados:** ' + result.outcome.draw.join(', ') + '\n**Acertos:** ' + result.outcome.hits + '/5'
        : game === 'treasure' ? '**Baús:** ' + result.outcome.chests.map((multiplier, index) => (index === result.outcome.selected ? '▣' : '▢') + ' ' + (index + 1)).join('  ')
          : game === 'highlow' ? '**Cartas:** ' + result.outcome.first + ' → ' + result.outcome.second
            : game === 'wheel' ? '**Setor:** ' + result.outcome.multiplier + '×'
              : '**Resultado:** ' + String(result.outcome).toUpperCase();
  const delta = result.net > 0 ? '+' + formatFragments(result.net) : result.net < 0 ? '−' + formatFragments(-result.net) : formatFragments(0);
  return editCasino(interaction, '# ' + GAME_NAMES[game] + ' · resultado\n' + say(result.net > 0 ? 'casinoWin' : result.net < 0 ? 'casinoLoss' : 'casinoPush')
    + '\n\n' + face + '\n**Pagamento total:** ' + formatFragments(result.payout) + ' · **Variação:** ' + delta
    + '\n\n' + resultRule(game, result) + '\n\nA partida terminou. Não há animação de quase vitória nem alteração de probabilidades por jogador.', {
    game, outcome: outcome || result.outcome, details: result.details,
    sections: [resourceSection('Aposta', formatFragments(bet), '◈', 'casino'), resourceSection('Carteira', formatFragments(result.account.wallet), '✦', 'fragments')],
  });
}

async function handleCasinoInteraction(interaction) {
  const id = interaction.customId || '';
  if (!id.startsWith('casino:')) return false;
  const parts = id.split(':');
  if (interaction.isStringSelectMenu() && parts[1] === 'choose') {
    if (interaction.user.id !== parts[2]) throw new EconomyError('Abra seu próprio painel do cassino para iniciar uma partida.');
    const game = interaction.values[0];
    if (game === 'racing' || game === 'poker') return startSelectedGame(interaction, game, null, null, null);
    const required = game === 'lottery' ? ['tickets'] : game === 'keno' ? ['bet', 'numbers']
      : ['coinflip', 'dice', 'highlow', 'roulette', 'treasure'].includes(game) ? ['bet', 'pick'] : ['bet'];
    const modal = new ModalBuilder().setCustomId('casino:modal:' + game + ':' + interaction.user.id).setTitle(GAME_NAMES[game]);
    const inputs = game === 'lottery' ? [new TextInputBuilder().setCustomId('tickets').setLabel('Quantidade de bilhetes · 1 a 10').setPlaceholder('Ex.: 2').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(2)]
      : [new TextInputBuilder().setCustomId('bet').setLabel('Aposta em Fragmentos').setPlaceholder('Ex.: 100').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(14)];
    if (required.includes('pick')) inputs.push(new TextInputBuilder().setCustomId('pick').setLabel('Sua escolha').setPlaceholder('cara, coroa, alto, baixo, red, 0–36...').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(16));
    if (required.includes('numbers')) inputs.push(new TextInputBuilder().setCustomId('numbers').setLabel('Cinco números de 1 a 40').setPlaceholder('2, 8, 14, 26, 39').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(32));
    if (game !== 'lottery' && !required.includes('pick') && !required.includes('numbers')) inputs.splice(1, 0, new TextInputBuilder().setCustomId('pick').setLabel('Escolha (opcional)').setPlaceholder('Deixe vazio').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(16));
    modal.addComponents(...inputs.map((input) => new ActionRowBuilder().addComponents(input)));
    await interaction.showModal(modal);
    return true;
  }
  if (interaction.isModalSubmit() && parts[1] === 'modal') {
    const [, , game, ownerId] = parts;
    if (ownerId !== interaction.user.id) throw new EconomyError('Este formulário pertence a outra pessoa.');
    if (game === 'lottery') {
      const raw = interaction.fields.getTextInputValue('tickets').trim();
      if (!/^\d+$/.test(raw) || Number(raw) < 1 || Number(raw) > 10) throw new RangeError('A quantidade deve ficar entre 1 e 10 bilhetes.');
      return startSelectedGame(interaction, game, null, null, null, Number(raw));
    }
    const { bet, pick, numbers } = parseModalFields(interaction);
    return startSelectedGame(interaction, game, bet, pick || null, numbers);
  }
  if (!interaction.isButton()) return true;
  if (parts[1] === 'bj') {
    const [, , sessionId, action] = parts;
    const session = await blackjackAction({ sessionId, userId: interaction.user.id, action });
    return showSession(interaction, session);
  }
  if (parts[1] === 'mine') {
    const [, , sessionId, cellText] = parts;
    const session = await minesAction({ sessionId, userId: interaction.user.id, cell: Number(cellText) });
    return showSession(interaction, session);
  }
  if (parts[1] === 'minecash') {
    const session = await minesAction({ sessionId: parts[2], userId: interaction.user.id, cashOut: true });
    return showSession(interaction, session);
  }
  if (parts[1] === 'history' || parts[1] === 'stats') {
    if (interaction.user.id !== parts[2]) throw new EconomyError('Este painel pertence a outra pessoa.');
    const transactions = await EconomyTransaction.find({ guildId: interaction.guildId, userId: interaction.user.id, operation: { $regex: '^casino_' } }).sort({ createdAt: -1 }).limit(10).lean();
    if (parts[1] === 'history') {
      const lines = transactions.map((entry) => '<t:' + Math.floor(new Date(entry.createdAt).getTime() / 1000) + ':R> · `' + entry.operation + '` · variação ' + (entry.walletDelta > 0 ? '+' : '') + formatFragments(entry.walletDelta));
      return editCasino(interaction, '# Seu histórico de jogos\n\n' + (lines.join('\n') || 'Você ainda não possui rodadas registradas.'), { game: 'lobby', ephemeral: true });
    }
    const aggregate = await EconomyTransaction.aggregate([
      { $match: { guildId: interaction.guildId, userId: interaction.user.id, operation: { $regex: '^casino_' } } },
      { $group: { _id: null, plays: { $sum: 1 }, net: { $sum: { $ifNull: ['$walletDelta', 0] } }, staked: { $sum: { $ifNull: ['$amount', 0] } } } },
    ]);
    const stats = aggregate[0] || { plays: 0, net: 0, staked: 0 };
    return editCasino(interaction, '# Suas estatísticas\n**Partidas registradas:** ' + stats.plays + '\n**Total apostado:** ' + formatFragments(stats.staked) + '\n**Variação líquida:** ' + (stats.net > 0 ? '+' : '') + formatFragments(stats.net) + '\n\nAs estatísticas são informativas e não alteram probabilidades.', { game: 'lobby', ephemeral: true });
  }
  if (parts[1] === 'rooms') return require('../commands/games/game').showList(interaction);
  if (parts[1] === 'refresh') {
    await interaction.deferUpdate();
    return true;
  }
  return true;
}

module.exports = { handleCasinoInteraction, editCasino, casinoContainer, lobbyText, gameMenu, gameRule, GAME_NAMES, GAME_RULES, sessionRows, sessionText, startSelectedGame };
