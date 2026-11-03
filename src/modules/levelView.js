const { requiredXP, progressBar } = require('./xp');
const { createContainer } = require('./components');

function levelContainer(user, profile) {
  const required = requiredXP(profile.level);
  const percent = Math.min(100, Math.floor((profile.xp / required) * 100));
  const content = [
    '## Perfil de experiência',
    '**Usuário:** ' + user,
    '**Nível:** ' + profile.level,
    '**XP neste nível:** ' + profile.xp + ' / ' + required,
    '**Progresso:** ' + progressBar(profile.xp, profile.level) + ' ' + percent + '%',
    '**Próximo nível:** faltam ' + Math.max(0, required - profile.xp) + ' XP',
  ].join('\n');
  return createContainer(content);
}

module.exports = { levelContainer };
