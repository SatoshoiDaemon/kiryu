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
const { configureDaily, configureCasino, configureIncome, configureEconomy } = require('../src/modules/economyAdminService');

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
    guildId: 'guild', actorId: 'admin', fragmentRange: { min: 400, max: 1000 },
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

test('painel persiste ativações e pagamentos individuais do cassino', async () => {
  const settings = { casino: {
    maxBet: 1000000000,
    flip: { enabled: true, multiplier: 2 }, dice: { enabled: true, multiplier: 2 }, slots: { enabled: true, multiplier: 5 },
  }, save: jest.fn().mockResolvedValue() };
  db.EconomySettings.findById.mockResolvedValue(settings);
  await configureCasino({ guildId: 'guild', actorId: 'admin', changes: {
    maxBet: 5000, flip: { enabled: false }, dice: { multiplier: 3 }, slots: { multiplier: 7 },
  } });
  expect(settings.casino).toEqual({
    maxBet: 5000, flip: { enabled: false, multiplier: 2 }, dice: { enabled: true, multiplier: 3 }, slots: { enabled: true, multiplier: 7 },
  });
  expect(settings.save).toHaveBeenCalled();
});

test('painel persiste faixas de renda, disponibilidade e cooldowns', async () => {
  const settings = {
    adventure: { enabled: true, min: 80, max: 800, cooldownMs: 7200000 },
    crime: { enabled: true, min: 100, max: 1200, fineMin: 50, fineMax: 400, failChancePercent: 35, cooldownMs: 10800000 },
    passiveIncome: { enabled: false, amount: 0, intervalMs: 86400000 },
    save: jest.fn().mockResolvedValue(),
  };
  db.EconomySettings.findById.mockResolvedValue(settings);
  await configureIncome({ guildId: 'guild', actorId: 'admin', changes: {
    adventure: { min: 90, max: 600, cooldownMinutes: 90 },
    crime: { enabled: false, failChancePercent: 45, fineMin: 75, fineMax: 500 },
    passiveIncome: { enabled: true, amount: 250, intervalHours: 12 },
  } });
  expect(settings.adventure).toMatchObject({ min: 90, max: 600, cooldownMs: 5400000 });
  expect(settings.crime).toMatchObject({ enabled: false, failChancePercent: 45, fineMin: 75, fineMax: 500 });
  expect(settings.passiveIncome).toMatchObject({ enabled: true, amount: 250, intervalMs: 43200000 });
  expect(settings.save).toHaveBeenCalled();
});

test('painel administra saldos iniciais e limites sem alterar contas existentes', async () => {
  const settings = { economy: { initialWallet: 0, initialBank: 0, walletLimit: 1000, bankLimit: 5000 }, save: jest.fn().mockResolvedValue() };
  db.EconomySettings.findById.mockResolvedValue(settings);
  await configureEconomy({ guildId: 'guild', actorId: 'admin', changes: { initialWallet: 250, walletLimit: 5000, marketFeePercent: 3, auctionMinIncrement: 25 } });
  expect(settings.economy).toMatchObject({ initialWallet: 250, walletLimit: 5000, marketFeePercent: 3, auctionMinIncrement: 25 });
  expect(settings.save).toHaveBeenCalled();
  await expect(configureEconomy({ guildId: 'guild', actorId: 'admin', changes: { initialWallet: 1000, walletLimit: 500 } }))
    .rejects.toThrow(/saldo inicial/);
});
