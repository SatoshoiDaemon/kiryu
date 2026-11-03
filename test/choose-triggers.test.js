const { parseOptions, chooseOption } = require('../src/modules/choose');
const { findTrigger, chooseResponse, normalizeTriggerText } = require('../src/modules/triggers');

describe('escolha aleatória', () => {
  test('remove espaços excedentes e ignora opções vazias', () => {
    expect(parseOptions(' a,   b ,, c ')).toEqual(['a', 'b', 'c']);
  });

  test('escolhe a opção indicada pelo sorteio', () => {
    expect(chooseOption('a, b, c', () => 0.75).choice).toBe('c');
  });

  test('rejeita menos de duas opções', () => {
    expect(() => chooseOption('a, ,')).toThrow(/duas opções/);
  });
});

describe('gatilhos', () => {
  const triggers = [
    { text: '!prodigio', responses: ['Resposta A', 'Resposta B'], enabled: true },
    { text: 'pausado', responses: ['não responder'], enabled: false },
  ];

  test('normaliza caixa e espaços para correspondência exata', () => {
    expect(normalizeTriggerText('  BOM   dia Kiryu ')).toBe('bom dia kiryu');
    expect(findTrigger(triggers, '  !PRODIGIO  ')).toBe(triggers[0]);
    expect(findTrigger(triggers, '!prodígio')).toBeNull();
  });

  test('ignora gatilhos desativados e seleciona uma resposta', () => {
    expect(findTrigger(triggers, 'pausado')).toBeNull();
    expect(chooseResponse(triggers[0], () => 0.99)).toBe('Resposta B');
  });
});
