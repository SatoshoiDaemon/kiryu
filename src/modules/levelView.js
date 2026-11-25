const { requiredXP } = require('./xp');
const { createContainer, resourceSection } = require('./components');
const config = require('../config');

function levelContainer(user, profile) {
  const required = requiredXP(profile.level);
  const percent = Math.min(100, Math.floor((profile.xp / required) * 100));
  const content = [
    '# Jornada no Eternity',
    'O seu nível continua ligado diretamente à progressão do Eternity Realms.',
    '**Membro:** ' + user,
    '**Progresso:** ' + percent + '% · faltam ' + Math.max(0, required - profile.xp).toLocaleString('pt-BR') + ' XP para o próximo nível',
  ].join('\n');
  return createContainer(content, [], config.visual.xp, { sections: [
    resourceSection('Nível atual', profile.level.toLocaleString('pt-BR'), '✧', 'xp'),
    resourceSection('XP neste nível', profile.xp.toLocaleString('pt-BR') + ' / ' + required.toLocaleString('pt-BR'), '✦', 'xp'),
  ] });
}

module.exports = { levelContainer };
