const {
  ORB_TYPES, orbConversion, remainingMs, formatDuration, periodKey, isCalendarDue, dailyCycle,
} = require('../src/modules/economyUtils');
const { itemAvailability } = require('../src/modules/economyService');
const { validateItem, normalizeRule } = require('../src/modules/economyAdminService');
const { itemEditModal, itemWizardContainer } = require('../src/modules/economyInteractions');
const { loadCommands } = require('../src/handlers/loadCommands');
const { setTotalXp, setLevel } = require('../src/modules/xp');

describe('regras puras da economia', () => {
  test('converte à taxa configurada, usando dez para um como padrão', () => {
    expect(orbConversion('green', 20)).toEqual({ source: 'green', destination: 'blue', amount: 20, result: 2, conversionRate: 10 });
    expect(orbConversion('green', 12, 6).result).toBe(2);
    expect(orbConversion('black', 10).destination).toBe('gold');
  });

  test('recusa categoria final, quantidade não múltipla e saldo inválido', () => {
    expect(() => orbConversion('gold', 10)).toThrow();
    expect(() => orbConversion('blue', 11)).toThrow(/múltipla de 10/);
    expect(() => orbConversion('blue', 13, 6)).toThrow(/múltipla de 6/);
    expect(() => orbConversion('blue', 0)).toThrow();
    expect(ORB_TYPES).toHaveLength(6);
  });

  test('calcula recarga e duração sem perder a persistência de timestamps', () => {
    expect(remainingMs(new Date(1000), 5000, 2000)).toBe(4000);
    expect(formatDuration(90061000)).toBe('1d 1h 1min 1s');
  });

  test('define XP acumulado preservando a fórmula e pode fixar um nível', () => {
    expect(setTotalXp({ level: 0, xp: 0 }, 300)).toEqual({ level: 2, xp: 0, totalXp: 300 });
    expect(setTotalXp({ level: 0, xp: 0 }, 299)).toEqual({ level: 1, xp: 199, totalXp: 299 });
    expect(setLevel({ level: 4, xp: 350 }, 2)).toEqual({ level: 2, xp: 299, levelsChanged: -2 });
  });

  test('gera períodos diários, semanais e intervalos de calendário em UTC', () => {
    const monday = new Date('2026-11-02T10:00:00.000Z');
    expect(periodKey({ frequency: 'daily' }, monday)).toBe('2026-11-02');
    expect(periodKey({ frequency: 'monthly' }, monday)).toBe('2026-11');
    expect(periodKey({ frequency: 'weekly' }, monday)).toMatch(/^2026-W/);
    expect(periodKey({ frequency: 'calendar', calendarUnit: 'month', calendarValue: 2 }, monday)).toBe('calendar-month:2026-11:2');
    expect(isCalendarDue({ frequency: 'calendar', calendarUnit: 'week', calendarValue: 1 }, monday)).toBe(true);
  });

  test('daily acompanha a virada do dia civil em São Paulo, não um cooldown móvel', () => {
    const before = dailyCycle(new Date('2026-11-25T02:59:00Z'));
    const after = dailyCycle(new Date('2026-11-25T03:00:00Z'));
    expect(before.dayKey).toBe('2026-11-24');
    expect(before.nextResetAt.toISOString()).toBe('2026-11-25T03:00:00.000Z');
    expect(before.resetAt.toISOString()).toBe('2026-11-24T03:00:00.000Z');
    expect(after.dayKey).toBe('2026-11-25');
    expect(after.nextResetAt.toISOString()).toBe('2026-11-26T03:00:00.000Z');
  });

  test('bloqueia itens expirados, ainda indisponíveis e sem estoque', () => {
    const now = new Date('2026-11-06T12:00:00Z');
    expect(itemAvailability({ stock: null, purchaseQuantity: 1, availableUntil: new Date('2026-11-06T11:59:00Z') }, now).available).toBe(false);
    expect(itemAvailability({ stock: null, purchaseQuantity: 1, availableFrom: new Date('2026-11-07T00:00:00Z') }, now).available).toBe(false);
    expect(itemAvailability({ stock: 0, purchaseQuantity: 1 }, now).available).toBe(false);
  });

  test('valida ação automática contra códigos arbitrários e campos do item', () => {
    expect(() => validateItem({ sku: 'pocao', name: 'Poção', description: 'Uso', price: 1, currency: 'fragments', action: 'eval' })).toThrow(/Ação de item inválida/);
    expect(() => validateItem({ sku: 'pocao', name: 'Poção', description: 'Uso', price: 1, currency: 'orbs' })).toThrow(/categoria/);
  });

  test('valida frequência de cargo e exige dados de calendário', () => {
    expect(() => normalizeRule({ name: 'Nobre', frequency: 'calendar', fragments: 10 })).toThrow(/calendário/);
    expect(normalizeRule({ name: 'Nobre', frequency: 'interval', intervalMs: 3600000, fragments: 10 }).intervalMs).toBe(3600000);
  });

  test('painel de item divide a configuração em modais dentro dos limites do Discord', () => {
    for (const section of ['price', 'availability', 'inventory', 'action']) {
      const modal = itemEditModal('12345678901234567890', 'antidoto', section).toJSON();
      expect(modal.components.length).toBeLessThanOrEqual(5);
    }
    expect(itemWizardContainer('12345678901234567890', 'antidoto').toJSON().type).toBe(17);
  });

  test('todos os comandos slash serializam dentro dos limites de opções', () => {
    const commands = loadCommands();
    for (const command of commands.values()) command.data.toJSON();
    expect(commands.has('economia')).toBe(false);
    expect(commands.has('addxp')).toBe(false);
    expect(commands.has('xp')).toBe(true);
    const xpOptions = commands.get('xp').data.toJSON().options;
    expect(xpOptions.map((option) => option.name)).toEqual(['add', 'remove', 'set', 'reset', 'level']);
    expect(commands.get('inventory').data.toJSON().options.map((option) => option.name)).toEqual(['view', 'add', 'remove']);
  });
});
