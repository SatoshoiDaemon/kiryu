const { SlashCommandBuilder } = require('discord.js');
const { randomInt } = require('node:crypto');
const { replyV2, replyMessageV2 } = require('../../modules/components');

const data = new SlashCommandBuilder()
  .setName('coinflip')
  .setDescription('Joga uma moeda: cara ou coroa');

function result() {
  return randomInt(0, 2) === 0 ? 'Cara' : 'Coroa';
}

async function execute(interaction) {
  await replyV2(interaction, '🪙 Deu **' + result() + '**!');
}

async function executePrefix(message) {
  await replyMessageV2(message, '🪙 Deu **' + result() + '**!');
}

module.exports = { data, execute, executePrefix };
