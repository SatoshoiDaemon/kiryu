const { commandData, editorPreview } = require('../src/modules/adminCommands');

describe('editor de mensagens e templates', () => {
  test('serializa comandos de criação, edição e gestão de templates', () => {
    const definition = commandData.embed.toJSON();
    expect(definition.options.map((option) => option.name)).toEqual(['create', 'edit', 'template']);
    expect(definition.options[1].options.map((option) => option.name)).toEqual(['message_id', 'channel']);
    expect(definition.options[2].options.map((option) => option.name)).toEqual(['list', 'delete', 'export', 'import', 'apply']);
  });

  test('monta Components V2 com thumbnail, texto, seção, separador, galeria e links', () => {
    const payload = editorPreview({
      mode: 'v2', title: 'Expedição', body: 'Saída às 19h.', color: '#9D174D',
      imageUrl: 'https://cdn.example.org/map.png', elements: [
        { type: 'text', content: 'Vale da Lua' },
        { type: 'section', content: 'Traga seu grupo.', thumbnailUrl: 'https://cdn.example.org/crest.png' },
        { type: 'separator' },
        { type: 'gallery', url: 'https://cdn.example.org/map.png' },
        { type: 'link', label: 'Detalhes', url: 'https://example.org/event' },
        { type: 'link', label: 'Regras', url: 'https://example.org/rules' },
      ],
    });
    expect(payload.flags).toBeDefined();
    const json = payload.components[0].toJSON();
    expect(json.type).toBe(17);
    const types = json.components.map((component) => component.type);
    expect(types).toContain(9);
    expect(types).toContain(10);
    expect(types).toContain(14);
    expect(types).toContain(12);
    const buttons = json.components.find((component) => component.type === 1);
    expect(buttons.components).toHaveLength(2);
    expect(json.components[0].accessory.type).toBe(11);
  });

  test('mantém um embed tradicional como formato alternativo', () => {
    const payload = editorPreview({ mode: 'embed', title: 'Aviso', body: 'Manutenção hoje.', color: '#C0265A', imageUrl: '', elements: [] });
    expect(payload.embeds[0].toJSON()).toMatchObject({ title: 'Aviso', description: 'Manutenção hoje.', color: 0xc0265a });
  });
});
