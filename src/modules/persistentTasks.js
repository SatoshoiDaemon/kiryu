const { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const { Reminder, Giveaway, CommunityPoll } = require('../database');
const { replyMessageV2 } = require('./components');
const metrics = require('./performanceMetrics');
const { randomInt } = require('node:crypto');
const { replayPendingEconomicOperations } = require('./economyService');
const { recoverCasinoSessions, expireCasinoSessions } = require('./casinoSessionService');
const { processMarketListings } = require('./economyExchangeService');
const { processTradeSessions } = require('./economyTradeService');
const { processAuctions } = require('./auctionService');
const { processGameRooms } = require('./gameRoomService');
const { processLotteries } = require('./lotteryService');

let timer = null;
let running = false;

async function deliverReminder(client, reminder) {
  const started = metrics.performance.now();
  try {
    const channel = await client.channels.fetch(reminder.channelId).catch(() => null);
    if (!channel?.isTextBased?.()) return false;
    await channel.send({
      content: '<@' + reminder.userId + '> ⏰ Você pediu para eu lembrar: **' + reminder.text + '**',
      allowedMentions: { users: [reminder.userId], parse: [] },
      nonce: String(reminder._id).slice(-24), enforceNonce: true,
    });
    return true;
  } catch { return false; }
  finally { metrics.record('task', 'reminder', metrics.performance.now() - started); }
}

async function processReminders(client, now = new Date()) {
  for (let count = 0; count < 50; count += 1) {
    const reminder = await Reminder.findOneAndUpdate({ $or: [
      { status: 'queued', dueAt: { $lte: now } },
      { status: 'sending', leaseUntil: { $lte: now } },
    ] }, { $set: { status: 'sending', leaseUntil: new Date(now.getTime() + 60_000) }, $inc: { attempts: 1 } }, { sort: { dueAt: 1 }, new: true }).lean();
    if (!reminder) break;
    const delivered = await deliverReminder(client, reminder);
    if (delivered) await Reminder.updateOne({ _id: reminder._id, status: 'sending' }, { $set: { status: 'sent', processedAt: now, leaseUntil: null } });
    else await Reminder.updateOne({ _id: reminder._id, status: 'sending' }, {
      $set: { status: reminder.attempts >= 5 ? 'failed' : 'queued', dueAt: new Date(now.getTime() + 60_000), leaseUntil: null },
    });
  }
}

function pickWinners(entrants, winnerCount, previousWinners = []) {
  const excluded = new Set(previousWinners);
  const pool = entrants.filter((id) => !excluded.has(id));
  const winners = [];
  while (pool.length && winners.length < winnerCount) winners.push(pool.splice(randomInt(0, pool.length), 1)[0]);
  return winners;
}

function giveawayComponents(giveaway, disabled = false) {
  return [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('giveaway:join:' + giveaway.messageId).setLabel('Participar').setStyle(ButtonStyle.Success).setDisabled(disabled),
  )];
}

async function announceGiveawayResult(client, giveaway) {
  if (giveaway.announcementSentAt) return;
  try {
    const channel = await client.channels.fetch(giveaway.channelId).catch(() => null);
    if (!channel?.isTextBased?.()) return;
    const message = await channel.messages.fetch(giveaway.messageId).catch(() => null);
    if (!message) return;
    const mentions = giveaway.winners.length ? giveaway.winners.map((id) => '<@' + id + '>').join(', ') : 'Ninguém participou desta vez.';
    await message.edit({
      content: '🎉 **Sorteio encerrado: ' + giveaway.prize + '**\nVencedores: ' + mentions,
      components: giveawayComponents(giveaway, true),
      allowedMentions: { users: giveaway.winners, parse: [] },
    });
    await Giveaway.updateOne({ _id: giveaway._id, announcementSentAt: null }, { $set: { announcementSentAt: new Date() } });
  } catch { /* A following tick safely edits the same message again. */ }
}

async function closeGiveaway(client, giveaway, { reroll = false } = {}) {
  if (!reroll && giveaway.status !== 'ending') {
    const claimed = await Giveaway.findOneAndUpdate({ _id: giveaway._id, status: 'active' }, { $set: { status: 'ending', endingLeaseUntil: new Date(Date.now() + 60_000) } }, { new: true }).lean();
    if (!claimed) return;
    giveaway = claimed;
  }
  const winners = pickWinners(giveaway.entrants || [], giveaway.winnerCount, reroll ? giveaway.winners : []);
  const filter = reroll ? { _id: giveaway._id, status: 'ended', rerolls: giveaway.rerolls } : { _id: giveaway._id, status: 'ending' };
  const update = reroll
    ? { $set: { winners, announcementSentAt: null }, $inc: { rerolls: 1 } }
    : { $set: { status: 'ended', winners, endedAt: new Date(), announcementSentAt: null, endingLeaseUntil: null } };
  const saved = await Giveaway.findOneAndUpdate(filter, update, { new: true }).lean();
  if (saved) await announceGiveawayResult(client, saved);
}

async function processGiveaways(client, now = new Date()) {
  for (let count = 0; count < 20; count += 1) {
    const giveaway = await Giveaway.findOneAndUpdate({ status: 'active', endsAt: { $lte: now } }, { $set: { status: 'ending', endingLeaseUntil: new Date(now.getTime() + 60_000) } }, { sort: { endsAt: 1 }, new: true }).lean();
    if (!giveaway) break;
    await closeGiveaway(client, giveaway);
  }
  for (let count = 0; count < 20; count += 1) {
    const giveaway = await Giveaway.findOneAndUpdate({ status: 'ending', $or: [{ endingLeaseUntil: null }, { endingLeaseUntil: { $lte: now } }] }, { $set: { endingLeaseUntil: new Date(now.getTime() + 60_000) } }, { sort: { endsAt: 1 }, new: true }).lean();
    if (!giveaway) break;
    await closeGiveaway(client, giveaway);
  }
  const pending = await Giveaway.find({ status: 'ended', announcementSentAt: null }).limit(20).lean();
  for (const giveaway of pending) await announceGiveawayResult(client, giveaway);
}

async function processPolls(client, now = new Date()) {
  const due = await CommunityPoll.find({ status: 'open', closesAt: { $lte: now } }).limit(25).lean();
  const closing = [];
  for (const poll of due) {
    const closed = await CommunityPoll.findOneAndUpdate({ _id: poll._id, status: 'open' }, { $set: { status: 'closed' } }, { new: true }).lean();
    if (closed) closing.push(closed);
  }
  const retry = await CommunityPoll.find({ status: 'closed', resultPostedAt: null, closesAt: { $lte: now } }).limit(25).lean();
  const pending = new Map([...closing, ...retry].map((poll) => [String(poll._id), poll]));
  for (const poll of pending.values()) {
    try {
      const channel = await client.channels.fetch(poll.channelId).catch(() => null);
      const message = await channel?.messages?.fetch(poll.messageId).catch(() => null);
      if (message) await message.edit({ components: [], embeds: [], content: pollSummary(poll), allowedMentions: { parse: [] } });
      await CommunityPoll.updateOne({ _id: poll._id, status: 'closed', resultPostedAt: null }, { $set: { resultPostedAt: new Date() } });
    } catch { /* The vote record remains available for manual review. */ }
  }
}

function pollSummary(poll) {
  const counts = poll.options.map((option, index) => ({ option, count: poll.votes.filter((vote) => vote.option === index).length }));
  const lines = counts.map((item, index) => (index + 1) + '. **' + item.option + '** · ' + item.count + ' voto(s)');
  return '📊 **' + poll.question + '**\n' + lines.join('\n') + '\n\nEnquete encerrada.';
}

async function runPersistentTasks(client) {
  if (running) return;
  running = true;
  const started = metrics.performance.now();
  try {
    await replayPendingEconomicOperations();
    await recoverCasinoSessions();
    await expireCasinoSessions();
    await processMarketListings();
    await processTradeSessions();
    await processAuctions();
    await processGameRooms();
    await processLotteries();
    await processReminders(client);
    await processGiveaways(client);
    await processPolls(client);
  } catch (error) {
    require('../logger').warn('Uma tarefa persistente não foi processada (' + (error?.code || error?.name || 'erro') + ').');
  } finally {
    running = false;
    metrics.record('task', 'scheduler', metrics.performance.now() - started);
  }
}

function startPersistentTasks(client, intervalMs = 15_000) {
  stopPersistentTasks();
  void runPersistentTasks(client);
  timer = setInterval(() => void runPersistentTasks(client), intervalMs);
  timer.unref?.();
}

function stopPersistentTasks() { if (timer) clearInterval(timer); timer = null; }

module.exports = { startPersistentTasks, stopPersistentTasks, runPersistentTasks, processReminders, processGiveaways, processPolls, closeGiveaway, pickWinners, giveawayComponents, pollSummary };
