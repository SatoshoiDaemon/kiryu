const { MessageFlags } = require('discord.js');
const { basicContainer, payload, respond } = require('../src/modules/economyViews');

jest.mock('../src/modules/configPanel', () => ({ handleConfigInteraction: jest.fn() }));
jest.mock('../src/modules/components', () => ({ replyV2: jest.fn() }));

const { handleInteraction } = require('../src/handlers/commandHandler');

describe('respostas de Components V2', () => {
  test('edita a resposta adiada com a flag V2 junto ao container', async () => {
    const interaction = { deferred: true, replied: false, editReply: jest.fn() };
    const response = payload(basicContainer('# Orbes'), true);

    await respond(interaction, response);

    expect(interaction.editReply).toHaveBeenCalledWith(expect.objectContaining({
      components: response.components,
      flags: MessageFlags.IsComponentsV2,
    }));
  });

  test('mantém privacidade em respostas V2 ainda não adiadas', async () => {
    const interaction = { deferred: false, replied: false, reply: jest.fn() };
    const response = payload(basicContainer('# Recompensa diária'), true);

    await respond(interaction, response);

    expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    }));
  });

  test('adia o comando sem tentar definir Components V2 antes do primeiro conteúdo', async () => {
    const execute = jest.fn();
    const interaction = {
      commandName: 'orbes',
      isChatInputCommand: () => true,
      deferReply: jest.fn(),
    };

    await handleInteraction(interaction, { commands: new Map([['orbes', { execute, deferEphemeral: true }]]) });

    expect(interaction.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
    expect(execute).toHaveBeenCalledWith(interaction, expect.any(Object));
  });
});
