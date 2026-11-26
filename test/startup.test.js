jest.mock('../src/database', () => ({
  connectDatabase: jest.fn(),
  initializeDatabase: jest.fn(),
  closeDatabase: jest.fn(),
}));

const { Client, Partials } = require('discord.js');
const database = require('../src/database');
const config = require('../src/config');
const { createBot, shutdown } = require('../src');
const { loadCommands } = require('../src/handlers/loadCommands');

describe('inicialização do bot', () => {
  const order = [];
  let loginSpy;

  beforeEach(() => {
    config.token ||= 'test-token';
    config.clientId ||= 'test-client';
    config.guildId ||= 'test-guild';
    config.mongoUri ||= 'mock-mongo-uri';
    order.length = 0;
    database.connectDatabase.mockReset().mockImplementation(async () => { order.push('mongo-connect'); });
    database.initializeDatabase.mockReset().mockImplementation(async () => { order.push('database-init'); });
    database.closeDatabase.mockReset().mockResolvedValue(undefined);
    loginSpy = jest.spyOn(Client.prototype, 'login').mockImplementation(async () => {
      order.push('discord-login');
      return 'mock-token';
    });
  });

  afterEach(() => {
    loginSpy.mockRestore();
  });

  test('registra operações pontuais em grupos sem expor configuração fora de /config', () => {
    const commands = loadCommands();
    const names = [...commands.keys()];
    expect(names).toEqual(expect.arrayContaining(['config', 'xp', 'money', 'orbs', 'inventory']));
    expect(names).not.toContain('economia');
    for (const command of commands.values()) expect(() => command.data.toJSON()).not.toThrow();
    const xpOptions = commands.get('xp').data.toJSON().options;
    expect(xpOptions.map((option) => option.name)).toEqual(expect.arrayContaining(['add', 'remove', 'set', 'reset', 'level']));
    expect(xpOptions.find((option) => option.name === 'level').options.map((option) => option.name)).toEqual(['view', 'add', 'remove', 'set']);
    expect(commands.get('money').data.toJSON().options.map((option) => option.name)).toEqual(expect.arrayContaining(['balance', 'transfer', 'history', 'deposit', 'withdraw', 'add', 'remove', 'set']));
    expect(commands.get('orbs').data.toJSON().options.map((option) => option.name)).toEqual(expect.arrayContaining(['balance', 'convert', 'add', 'remove', 'set']));
    expect(commands.has('profile')).toBe(true);
    expect(commands.has('profile-edit')).toBe(true);
    expect(commands.has('badges')).toBe(true);
    expect(commands.has('shop')).toBe(true);
    expect(commands.has('casino')).toBe(true);
    expect(commands.has('banco')).toBe(false);
    expect(commands.has('carteira')).toBe(false);
    expect(commands.has('inventario')).toBe(false);
    expect(commands.has('use')).toBe(false);
  });

  test('conecta e inicializa o Mongo antes de iniciar o gateway Discord', async () => {
    const client = await createBot();
    expect(order).toEqual(['mongo-connect', 'database-init', 'discord-login']);
    expect(client.commands.size).toBe(57);
    expect(client.options.partials).toContain(Partials.Message);
    expect(client.listenerCount('interactionCreate')).toBe(1);
    await shutdown(client);
    expect(database.closeDatabase).toHaveBeenCalled();
  });
});
