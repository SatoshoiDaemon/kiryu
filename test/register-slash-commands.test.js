const mockPut = jest.fn().mockResolvedValue(undefined);
const mockSetToken = jest.fn().mockReturnThis();

jest.mock('discord.js', () => {
  const actual = jest.requireActual('discord.js');
  return {
    ...actual,
    REST: jest.fn().mockImplementation(() => ({ setToken: mockSetToken, put: mockPut })),
    Routes: { ...actual.Routes, applicationGuildCommands: jest.fn(() => 'application-guild-commands') },
  };
});
jest.mock('../src/logger', () => ({ info: jest.fn(), error: jest.fn() }));

const config = require('../src/config');
const { loadCommands } = require('../src/handlers/loadCommands');
const { registerSlashCommands } = require('../src/handlers/registerSlashCommands');

test('substitui em lote o registro guild-scoped pela árvore atual', async () => {
  config.token = 'test-token';
  config.clientId = 'test-client';
  config.guildId = 'test-guild';
  mockPut.mockClear();
  await registerSlashCommands({ commands: loadCommands() });
  const [route, request] = mockPut.mock.calls[0];
  expect(route).toBe('application-guild-commands');
  expect(request.body.map((command) => command.name)).toContain('orbs');
  expect(request.body.map((command) => command.name)).not.toContain('orbes');
  expect(request.body.map((command) => command.name)).toEqual(expect.arrayContaining(['profile-edit', 'badges']));
  expect(request.body).toHaveLength(52);
});
