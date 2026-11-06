jest.mock('../src/database', () => ({
  EconomyAccount: {},
  EconomyItem: {},
  EconomyInventory: {},
  EconomyTransaction: { create: jest.fn() },
  EconomySettings: { findById: jest.fn(), findOneAndUpdate: jest.fn(), create: jest.fn() },
  EconomyCollectRule: {},
  EconomyClaim: {},
}));
jest.mock('../src/logger', () => ({ error: jest.fn() }));

const mongoose = require('mongoose');
const db = require('../src/database');
const logger = require('../src/logger');
const { configureDaily } = require('../src/modules/economyAdminService');

test('admin configura a recompensa diária com Orbes em MongoDB standalone', async () => {
  const settings = {
    daily: {
      fragments: 500,
      cooldownMs: 86400000,
      orbs: { green: 0, blue: 0, orange: 0, red: 0, black: 0, gold: 0 },
      orbsConfigured: true,
    },
    save: jest.fn().mockResolvedValue(),
  };
  db.EconomySettings.findById.mockResolvedValue(settings);
  db.EconomyTransaction.create.mockRejectedValue(new Error('histórico indisponível'));
  const startSession = jest.spyOn(mongoose, 'startSession');

  await expect(configureDaily({
    guildId: 'guild', actorId: 'admin', fragments: 500, cooldownHours: 24,
    orbs: { green: 1, blue: 0, orange: 0, red: 0, black: 0, gold: 0 },
  })).resolves.toBe(settings);

  expect(settings.daily.orbs.green).toBe(1);
  expect(settings.daily.orbsConfigured).toBe(true);
  expect(settings.save).toHaveBeenCalledWith();
  expect(startSession).not.toHaveBeenCalled();
  expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Configuração aplicada'));
  startSession.mockRestore();
});
