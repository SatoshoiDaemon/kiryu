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
      rewardRanges: {
        fragments: { min: 400, max: 1000 },
        orbs: {
          green: { min: 10, max: 100 }, blue: { min: 10, max: 50 }, orange: { min: 5, max: 10 },
          red: { min: 0, max: 0 }, black: { min: 0, max: 0 }, gold: { min: 0, max: 0 },
        },
      },
      cooldownMs: 86400000,
      rangesConfigured: true,
    },
    save: jest.fn().mockResolvedValue(),
  };
  db.EconomySettings.findById.mockResolvedValue(settings);
  db.EconomyTransaction.create.mockRejectedValue(new Error('histórico indisponível'));
  const startSession = jest.spyOn(mongoose, 'startSession');

  await expect(configureDaily({
    guildId: 'guild', actorId: 'admin', fragmentRange: { min: 400, max: 1000 }, cooldownHours: 24,
    orbRanges: {
      green: { min: 10, max: 100 }, blue: { min: 10, max: 50 }, orange: { min: 5, max: 10 },
    },
  })).resolves.toBe(settings);

  expect(settings.daily.rewardRanges).toMatchObject({
    fragments: { min: 400, max: 1000 },
    orbs: {
      green: { min: 10, max: 100 }, blue: { min: 10, max: 50 }, orange: { min: 5, max: 10 },
      red: { min: 0, max: 0 }, black: { min: 0, max: 0 }, gold: { min: 0, max: 0 },
    },
  });
  expect(settings.daily.rangesConfigured).toBe(true);
  expect(settings.save).toHaveBeenCalledWith();
  expect(startSession).not.toHaveBeenCalled();
  expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Configuração aplicada'));
  startSession.mockRestore();
});
