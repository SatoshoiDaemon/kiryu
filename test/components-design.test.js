const config = require('../src/config');
const { createContainer, footerText } = require('../src/modules/components');

describe('sistema visual compartilhado', () => {
  test('padroniza crédito, timestamp e divisória em um container V2 serializável', () => {
    const previous = config.visual.dividerUrl;
    config.visual.dividerUrl = 'https://cdn.example.org/kiryu-divider.gif';
    try {
      const container = createContainer('# Kiryu\nInterface de teste', [], config.visual.brand, { now: 1_800_000_000_000 }).toJSON();
      const content = JSON.stringify(container);
      expect(container.type).toBe(17);
      expect(content).toContain('Developer by Krieg.js');
      expect(content).toContain('<t:1800000000:R>');
      expect(content).toContain('https://cdn.example.org/kiryu-divider.gif');
      expect(footerText(1_800_000_000_000)).toContain('Developer by Krieg.js');
    } finally {
      config.visual.dividerUrl = previous;
    }
  });
});
