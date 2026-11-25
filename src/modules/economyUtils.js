const ORB_TYPES = ['green', 'blue', 'orange', 'red', 'black', 'gold'];
const ORBS = {
  green: { label: 'Verde', emoji: '🟢', sigil: '✦' },
  blue: { label: 'Azul', emoji: '🔵', sigil: '❖' },
  orange: { label: 'Laranja', emoji: '🟠', sigil: '✺' },
  red: { label: 'Vermelha', emoji: '🔴', sigil: '✹' },
  black: { label: 'Preta', emoji: '⚫', sigil: '◈' },
  gold: { label: 'Dourada', emoji: '🟡', sigil: '✧' },
};
const FRAGMENT_EMOJI = '<:fragmento:1568121720857170000>';
const MAX_AMOUNT = 1000000000000;
const DEFAULT_TIME_ZONE = 'America/Sao_Paulo';

class EconomyError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'EconomyError';
    this.publicMessage = message;
    Object.assign(this, details);
  }
}

function assertAmount(value, label = 'Quantidade', { min = 1, max = MAX_AMOUNT } = {}) {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new RangeError(label + ' deve ser um número inteiro entre ' + min.toLocaleString('pt-BR') + ' e ' + max.toLocaleString('pt-BR') + '.');
  }
  return value;
}

function orbConversion(source, amount, conversionRate = 10) {
  const index = ORB_TYPES.indexOf(source);
  if (index < 0 || index >= ORB_TYPES.length - 1) throw new RangeError('Selecione uma categoria de Orbe que possa ser convertida para a próxima.');
  assertAmount(amount, 'Quantidade de Orbes');
  assertAmount(conversionRate, 'Taxa de conversão', { min: 2, max: 1000000 });
  if (amount % conversionRate !== 0) throw new RangeError('A quantidade precisa ser múltipla de ' + conversionRate + '.');
  return { source, destination: ORB_TYPES[index + 1], amount, result: amount / conversionRate, conversionRate };
}

function remainingMs(lastAt, cooldownMs, now = Date.now()) {
  if (!lastAt) return 0;
  return Math.max(0, new Date(lastAt).getTime() + cooldownMs - now);
}

function formatDuration(ms) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [days && days + 'd', hours && hours + 'h', minutes && minutes + 'min', seconds && seconds + 's'].filter(Boolean).join(' ') || '0s';
}

function isoWeek(date) {
  const value = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  value.setUTCDate(value.getUTCDate() + 4 - (value.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(value.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((value - yearStart) / 86400000) + 1) / 7);
  return value.getUTCFullYear() + '-W' + String(week).padStart(2, '0');
}

function periodKey(rule, now = new Date()) {
  const date = new Date(now);
  if (rule.frequency === 'daily') return date.toISOString().slice(0, 10);
  if (rule.frequency === 'weekly') return isoWeek(date);
  if (rule.frequency === 'monthly') return date.toISOString().slice(0, 7);
  if (rule.frequency === 'interval') {
    const interval = Math.max(60000, Number(rule.intervalMs) || 60000);
    return 'interval:' + Math.floor(date.getTime() / interval);
  }
  if (rule.frequency === 'calendar') {
    const calendarUnit = rule.calendarUnit;
    const value = Number(rule.calendarValue);
    if (calendarUnit === 'month') return 'calendar-month:' + date.toISOString().slice(0, 7) + ':' + value;
    if (calendarUnit === 'week') return 'calendar-week:' + isoWeek(date) + ':' + value;
  }
  throw new RangeError('Frequência de coleta inválida.');
}

function isCalendarDue(rule, now = new Date()) {
  if (rule.frequency !== 'calendar') return true;
  const date = new Date(now);
  if (rule.calendarUnit === 'month') return date.getUTCDate() === Number(rule.calendarValue);
  if (rule.calendarUnit === 'week') return date.getUTCDay() === Number(rule.calendarValue);
  return false;
}

function formatFragments(value) {
  const formatted = typeof value === 'bigint'
    ? value.toLocaleString('pt-BR')
    : Number(value || 0).toLocaleString('pt-BR');
  return formatted + ' ' + FRAGMENT_EMOJI;
}

function zonedDateParts(value, timeZone = DEFAULT_TIME_ZONE) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date(value));
  return Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
}

function zonedMidnightUtc(year, month, day, timeZone = DEFAULT_TIME_ZONE) {
  const targetWallTime = Date.UTC(year, month - 1, day, 0, 0, 0);
  let guess = targetWallTime;
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  });
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const parts = Object.fromEntries(formatter.formatToParts(new Date(guess))
      .filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
    const representedWallTime = Date.UTC(
      Number(parts.year), Number(parts.month) - 1, Number(parts.day),
      Number(parts.hour), Number(parts.minute), Number(parts.second),
    );
    const correction = representedWallTime - targetWallTime;
    if (correction === 0) break;
    guess -= correction;
  }
  return new Date(guess);
}

function dailyCycle(now = new Date(), timeZone = DEFAULT_TIME_ZONE) {
  const date = new Date(now);
  const parts = zonedDateParts(date, timeZone);
  const year = Number(parts.year);
  const month = Number(parts.month);
  const day = Number(parts.day);
  const nextCalendarDate = new Date(Date.UTC(year, month - 1, day + 1));
  const resetAt = zonedMidnightUtc(year, month, day, timeZone);
  const dayKey = [parts.year, parts.month, parts.day].join('-');
  return {
    dayKey,
    resetAt,
    nextResetAt: zonedMidnightUtc(
      nextCalendarDate.getUTCFullYear(),
      nextCalendarDate.getUTCMonth() + 1,
      nextCalendarDate.getUTCDate(),
      timeZone,
    ),
  };
}

module.exports = {
  ORB_TYPES, ORBS, FRAGMENT_EMOJI, MAX_AMOUNT, EconomyError, assertAmount, orbConversion,
  remainingMs, formatDuration, periodKey, isCalendarDue, formatFragments,
  DEFAULT_TIME_ZONE, zonedDateParts, zonedMidnightUtc, dailyCycle,
};
