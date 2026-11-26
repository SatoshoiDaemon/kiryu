const { fetchTargetMember } = require('../src/modules/adminCommands');

function member(id, position) {
  const highest = { comparePositionTo: (other) => position - other.position, position };
  return { id, user: { id }, roles: { highest: { ...highest, comparePositionTo: highest.comparePositionTo } } };
}

function interaction({ actor = 10, target = 5, bot = 20, ownerId = 'owner' } = {}) {
  const actorMember = member('moderator', actor);
  const targetMember = member('target', target);
  const botMember = member('bot', bot);
  const members = new Map([[actorMember.id, actorMember], [targetMember.id, targetMember]]);
  return {
    user: { id: actorMember.id },
    guild: {
      ownerId,
      members: { me: botMember, fetch: async (id) => members.get(id) || null },
    },
  };
}

describe('hierarquia de moderação Discord', () => {
  test('permite agir quando o cargo de quem executa e do bot estão acima do alvo', async () => {
    await expect(fetchTargetMember(interaction(), { id: 'target' })).resolves.toMatchObject({ id: 'target' });
  });

  test('bloqueia alvo com cargo igual ou superior ao moderador', async () => {
    await expect(fetchTargetMember(interaction({ actor: 5 }), { id: 'target' })).rejects.toThrow(/igual ou superior/);
  });

  test('bloqueia alvo com cargo igual ou superior ao bot, mesmo para o proprietário', async () => {
    const target = member('target', 10);
    const guild = { ownerId: 'owner', members: { me: member('bot', 10), fetch: async (id) => id === target.id ? target : member(id, 20) } };
    await expect(fetchTargetMember({ user: { id: 'owner' }, guild }, { id: 'target' })).rejects.toThrow(/cargo mais alto do bot/);
  });
});
