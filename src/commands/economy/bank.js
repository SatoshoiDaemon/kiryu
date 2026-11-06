const { SlashCommandBuilder } = require('discord.js');
const { bankTransfer } = require('../../modules/economyService');
const { replyV2 } = require('../../modules/components');
const { formatFragments } = require('../../modules/economyUtils');
const config = require('../../config');

const data = new SlashCommandBuilder()
  .setName('banco')
  .setDescription('Gerencie seus Fragmentos no banco.')
  .addSubcommand((subcommand) => subcommand.setName('depositar').setDescription('Deposite Fragmentos da carteira no banco')
    .addIntegerOption((option) => option.setName('quantidade').setDescription('Quantidade inteira de Fragmentos').setRequired(true).setMinValue(1).setMaxValue(1000000000000)))
  .addSubcommand((subcommand) => subcommand.setName('sacar').setDescription('Saque Fragmentos do banco para a carteira')
    .addIntegerOption((option) => option.setName('quantidade').setDescription('Quantidade inteira de Fragmentos').setRequired(true).setMinValue(1).setMaxValue(1000000000000)));

async function execute(interaction) {
  if (interaction.guildId !== config.guildId) return;
  const direction = interaction.options.getSubcommand() === 'depositar' ? 'deposit' : 'withdraw';
  const amount = interaction.options.getInteger('quantidade');
  const account = await bankTransfer({ guildId: interaction.guildId, userId: interaction.user.id, amount, direction });
  const label = direction === 'deposit' ? 'depositados no banco' : 'sacados para a carteira';
  await replyV2(interaction, '# Operação bancária concluída\n**' + formatFragments(amount) + '** ' + label + '.\n\n**Carteira:** ' + formatFragments(account.wallet) + '\n**Banco:** ' + formatFragments(account.bank), { accentColor: 0x008C52 });
}

module.exports = { data, execute };
