const ORB_TYPES = ['green', 'blue', 'orange', 'red', 'black', 'gold'];
const ORBS = {
  green: { label: 'Verde', emoji: '🟢' },
  blue: { label: 'Azul', emoji: '🔵' },
  orange: { label: 'Laranja', emoji: '🟠' },
  red: { label: 'Vermelha', emoji: '🔴' },
  black: { label: 'Preta', emoji: '⚫' },
  gold: { label: 'Dourada', emoji: '🟡' },
};
const FRAGMENT_EMOJI = '<:fragmento:1568121720857170000>';
const MAX_AMOUNT = 1000000000000;

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

function orbConversion(source, amount) {
  const index = ORB_TYPES.indexOf(source);
  if (index < 0 || index >= ORB_TYPES.length - 1) throw new RangeError('Selecione uma categoria de Orbe que possa ser convertida para a próxima.');
  assertAmount(amount, 'Quantidade de Orbes');
  if (amount % 10 !== 0) throw new RangeError('A quantidade precisa ser múltipla de 10.');
  return { source, destination: ORB_TYPES[index + 1], amount, result: amount / 10 };
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

module.exports = {
  ORB_TYPES, ORBS, FRAGMENT_EMOJI, MAX_AMOUNT, EconomyError, assertAmount, orbConversion,
  remainingMs, formatDuration, periodKey, isCalendarDue, formatFragments,
};
