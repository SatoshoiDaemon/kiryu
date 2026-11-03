const { SlashCommandBuilder } = require('discord.js');
const { isAuthorized } = require('../../modules/permissions');
const { replyV2 } = require('../../modules/components');
const { grantXp, subtractXp, grantLevels, subtractLevels, getProfile } = require('../../modules/xpService');

const operations = {
  addxp: { label: 'XP adicionado', run: grantXp, valueName: 'quantidade', noBuff: true },
  removexp: { label: 'XP removido', run: subtractXp, valueName: 'quantidade' },
  addlevel: { label: 'níveis adicionados', run: grantLevels, valueName: 'quantidade' },
  removelevel: { label: 'níveis removidos', run: subtractLevels, valueName: 'quantidade' },
};

function createAdminCommand(name, description) {
  const operation = operations[name];
  const data = new SlashCommandBuilder()
    .setName(name)
    .setDescription(description)
    .addUserOption((option) => option.setName('usuario').setDescription('Usuário que receberá a alteração').setRequired(true))
    .addIntegerOption((option) => option.setName('quantidade').setDescription('Quantidade positiva').setRequired(true).setMinValue(1).setMaxValue(name.endsWith('level') ? 10000 : 1000000000));

  async function execute(interaction) {
    const allowed = await isAuthorized(interaction.member, interaction.user.id, interaction.guildId);
    if (!allowed) {
      await replyV2(interaction, 'Você não tem permissão para usar este comando.', { ephemeral: true });
      return;
    }

    const user = interaction.options.getUser('usuario');
    const amount = interaction.options.getInteger('quantidade');
    const args = operation.noBuff ? { applyBuff: false } : undefined;
    const result = await operation.run(interaction.guildId, user.id, amount, null, args);
    const profile = await getProfile(interaction.guildId, user.id);
    const actualAmount = name === 'removexp' ? result.xpRemoved
      : name === 'removelevel' ? result.levelsLost
        : name === 'addlevel' ? result.levelsGained
          : result.xpAdded;
    const quantityLabel = name.endsWith('level') ? 'nível(is)' : 'XP';
    const heading = name.endsWith('level') ? 'Níveis atualizados' : 'XP atualizado';
    await replyV2(interaction, '## ' + heading + '\n' + user + ': ' + operation.label + ' (**' + actualAmount + ' ' + quantityLabel + '**).\n**Nível:** ' + profile.level + ' · **XP atual:** ' + profile.xp, { ephemeral: true });
  }

  return { data, execute, deferEphemeral: true };
}

module.exports = { createAdminCommand };
