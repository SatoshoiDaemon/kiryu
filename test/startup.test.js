jest.mock('../src/database', () => ({
  connectDatabase: jest.fn(),
  initializeDatabase: jest.fn(),
  closeDatabase: jest.fn(),
}));

const { Client } = require('discord.js');
const database = require('../src/database');
const config = require('../src/config');
const { createBot, shutdown } = require('../src');

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

  test('conecta e inicializa o Mongo antes de iniciar o gateway Discord', async () => {
    const client = await createBot();
    expect(order).toEqual(['mongo-connect', 'database-init', 'discord-login']);
    expect(client.commands.size).toBe(9);
    await shutdown(client);
    expect(database.closeDatabase).toHaveBeenCalled();
  });
});
