jest.mock('../src/modules/economyService', () => ({
  ...jest.requireActual('../src/modules/economyService'),
  getAccount: jest.fn(),
}));

const { MessageFlags } = require('discord.js');
const config = require('../src/config');
const economyService = require('../src/modules/economyService');
const money = require('../src/commands/economy/money');
const orbs = require('../src/commands/economy/orbs');

function componentText(response) {
  return JSON.stringify(response.components[0].toJSON());
}

function interactionFor(command, member = null) {
  return {
    guildId: 'guild',
    user: { id: 'requester', username: 'Solicitante', toString: () => '<@requester>' },
    options: {
      getSubcommand: () => command,
      getUser: (name) => name === 'member' ? member : null,
    },
    reply: jest.fn().mockResolvedValue(undefined),
  };
}

describe('consultas públicas de saldos econômicos', () => {
  beforeEach(() => {
    config.guildId = 'guild';
    economyService.getAccount.mockReset().mockResolvedValue({
      wallet: 950,
      bank: 75,
      orbs: { green: 1, blue: 2, orange: 3, red: 4, black: 5, gold: 6 },
    });
  });

  test('/money balance aceita um membro opcional e mostra a conta selecionada sem controles do solicitante', async () => {
    const balance = money.data.toJSON().options.find((option) => option.name === 'balance');
    expect(balance.options).toEqual([
      expect.objectContaining({ name: 'member', type: 6, required: false }),
    ]);

    const member = { id: 'target', username: 'Membro-alvo', toString: () => '<@target>' };
    const interaction = interactionFor('balance', member);
    await money.execute(interaction);

    expect(economyService.getAccount).toHaveBeenCalledWith('guild', 'target');
    const response = interaction.reply.mock.calls[0][0];
    const text = componentText(response);
    expect(text).toContain('Membro-alvo');
    expect(text).toContain('950');
    expect(text).not.toContain('econ:wallet:deposit:');
    expect(response.flags & MessageFlags.Ephemeral).toBe(0);
  });

  test('/money balance sem alvo continua mostrando a própria conta e seus controles', async () => {
    const interaction = interactionFor('balance');
    await money.execute(interaction);

    expect(economyService.getAccount).toHaveBeenCalledWith('guild', 'requester');
    expect(componentText(interaction.reply.mock.calls[0][0])).toContain('econ:wallet:deposit:requester');
  });

  test('/orbs balance aceita um membro, publica os saldos e não oferece conversão na conta visitada', async () => {
    const balance = orbs.data.toJSON().options.find((option) => option.name === 'balance');
    expect(balance.options).toEqual([
      expect.objectContaining({ name: 'member', type: 6, required: false }),
    ]);

    const member = { id: 'target', username: 'Membro-alvo', toString: () => '<@target>' };
    const interaction = interactionFor('balance', member);
    await orbs.execute(interaction);

    expect(economyService.getAccount).toHaveBeenCalledWith('guild', 'target');
    const response = interaction.reply.mock.calls[0][0];
    const text = componentText(response);
    expect(text).toContain('Membro-alvo');
    expect(text).not.toContain('econ:orbs:source:');
    expect(response.flags & MessageFlags.Ephemeral).toBe(0);
  });

  test('/orbs balance sem alvo mostra as próprias Orbes e mantém a conversão disponível', async () => {
    const interaction = interactionFor('balance');
    await orbs.execute(interaction);

    expect(economyService.getAccount).toHaveBeenCalledWith('guild', 'requester');
    expect(componentText(interaction.reply.mock.calls[0][0])).toContain('econ:orbs:source:requester');
    expect(interaction.reply.mock.calls[0][0].flags & MessageFlags.Ephemeral).toBe(0);
  });
});
