jest.mock('../src/modules/xpService', () => ({
  getGuildConfig: jest.fn(),
}));

const { getGuildConfig } = require('../src/modules/xpService');
const { isAuthorized } = require('../src/modules/permissions');
const config = require('../src/config');

describe('autorização administrativa', () => {
  beforeEach(() => getGuildConfig.mockReset());

  test('sempre autoriza o proprietário sem consulta ao banco', async () => {
    await expect(isAuthorized(null, config.ownerId, config.guildId)).resolves.toBe(true);
    expect(getGuildConfig).not.toHaveBeenCalled();
  });

  test('autoriza quem possui um cargo configurado', async () => {
    getGuildConfig.mockResolvedValue({ adminRoleIds: ['admin-role'] });
    const member = { roles: { cache: new Map([['admin-role', {}]]) } };
    await expect(isAuthorized(member, 'other-user', config.guildId)).resolves.toBe(true);
  });

  test('também aceita a forma de cargos em array da API de interações', async () => {
    getGuildConfig.mockResolvedValue({ adminRoleIds: ['admin-role'] });
    const member = { roles: ['member-role', 'admin-role'] };
    await expect(isAuthorized(member, 'other-user', config.guildId)).resolves.toBe(true);
  });

  test('nega usuários sem cargo configurado', async () => {
    getGuildConfig.mockResolvedValue({ adminRoleIds: ['admin-role'] });
    const member = { roles: { cache: new Map([['member-role', {}]]) } };
    await expect(isAuthorized(member, 'other-user', config.guildId)).resolves.toBe(false);
  });

  test('nega inclusive o proprietário fora do servidor configurado', async () => {
    await expect(isAuthorized(null, config.ownerId, 'different-guild')).resolves.toBe(false);
  });
});
