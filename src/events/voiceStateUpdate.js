const { trackVoiceMember, removeVoiceMember } = require('../modules/voiceXp');
const config = require('../config');

function execute(oldState, newState) {
  const member = newState.member || oldState.member;
  if (!member || member.guild.id !== config.guildId || member.user?.bot) return;
  if (!newState.channelId) {
    removeVoiceMember(member);
    return;
  }
  trackVoiceMember(member, newState.channelId);
}

module.exports = { name: 'voiceStateUpdate', execute };
