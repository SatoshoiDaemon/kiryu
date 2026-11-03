const config = require('../config');
const { getGuildConfig } = require('./xpService');

async function isAuthorized(member, userId, guildId) {
  if (!guildId || guildId !== config.guildId) return false;
  if (userId === config.ownerId) return true;
  if (!member) return false;
  const guildConfig = await getGuildConfig(guildId);
  const roles = member.roles?.cache;
  if (roles?.has) return guildConfig.adminRoleIds.some((roleId) => roles.has(roleId));
  if (Array.isArray(member.roles)) return guildConfig.adminRoleIds.some((roleId) => member.roles.includes(roleId));
  return false;
}

module.exports = { isAuthorized };
