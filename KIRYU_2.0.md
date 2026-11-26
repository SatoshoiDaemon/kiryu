# Kiryu 2.0 — estado da Fase 2

## Resultado

A Fase 2 está implementada no checkout. Esta rodada consolidou o painel `/config`, a árvore slash, as interfaces V2, os fluxos econômicos e a instrumentação. Não adiciona comércio entre membros, leilões, jogos novos, expansão de automações ou eventos; esses itens permanecem fora desta fase.

## Dados e compatibilidade

- XP, nível, carteira, banco, seis saldos de Orbe, inventários, snapshots e SKUs mantêm seus registros e fórmulas existentes.
- Novas propriedades administrativas são aditivas e usam os valores atuais como padrão. O fator de conversão inicial permanece 10 Orbes por uma da categoria seguinte.
- O seed adiciona produtos ausentes sem redefinir preços/estoques ajustados pela equipe; remoção do catálogo preserva compras e histórico.
- O daily usa data civil e reseta à meia-noite de `America/Sao_Paulo`.

## Configuração permanente

`/config` é o único painel de configuração duradoura. Suas seções navegáveis cobrem:

- **XP:** faixas e cooldown de mensagem, faixas e intervalo de voz, canais excluídos, buffs por cargo, empilhamento e anúncio de level up com ativação, modelo textual e canal dedicado.
- **Permissões:** cargos autorizados para operações administrativas.
- **Recompensas:** daily de Fragmentos e todas as categorias de Orbe, trabalho e seu intervalo, fator de conversão de Orbes e regras recorrentes por cargo.
- **Regras por cargo:** cargo elegível, recompensa, recorrência diária/semanal/mensal, intervalo ou calendário, e acúmulo.
- **Lojas:** cadastro, edição paginada, nome, descrição, emoji, arte, preço, moeda/categoria, estoque, datas, visibilidade, entrega, inventário, consumo, ação, quantidade e opções de compra.
- **Cassino:** ativação individual de jogos, aposta máxima e multiplicadores de pagamento.
- **Aparência:** paletas de sistema persistidas e aplicadas após a seleção e também na inicialização.
- **Badges especiais:** cadastro, edição, atribuição e remoção pela equipe autorizada.
- **Gatilhos:** texto exato, múltiplas respostas, ativação e remoção.

Valores livres usam modais; cargos, canais, categorias e ações fixas usam os componentes nativos apropriados. Ajustes pontuais de recursos permanecem em `/xp`, `/money`, `/orbs` e `/inventory` com checagem de permissão.

## Comandos

Todos os nomes de comandos, grupos, subcomandos e opções são ingleses; descrições e respostas são portuguesas. `/profile [member]` consulta o cartão sem oferecer controles de edição; `/profile-edit` abre a oficina de personalização. `/badges assign|remove member` administra selos especiais. A consulta de XP fica em `/xp level view`, porque o Discord exige um subcomando filho quando `level` é um grupo. O inventário usa `/inventory view|add|remove`.

Árvore completa e parâmetros: [README.md](README.md#árvore-definitiva-de-comandos). A sincronização usa substituição em lote dos comandos guild-scoped carregados, o que remove comandos antigos do registro ativo na próxima sincronização bem-sucedida.

## Interfaces e experiência

- Interfaces interativas usam Components V2 compartilhados, cores por sistema, selos, divisória local, cabeçalhos, timestamps nativos e rodapé `Developer by Krieg.js`.
- Loja exige detalhe e confirmação antes de cobrar; opções e quantidades exibem preço total. Inventário e catálogo são paginados e os IDs de documentos não aparecem em texto de interface.
- A oficina de perfil atualiza a prévia no mesmo cartão e mantém um rascunho até aplicar; oferece cancelamento e restauração dos padrões. `/profile` é somente leitura.
- A personalidade contextual acompanha recompensas, trabalho, transferência, compra, cassino, subida de nível e erros.

## Desempenho

Instrumentação agrega acknowledgement/handler e comandos MongoDB com contagem, média, pico e histograma. Consultas repetidas de configuração foram reduzidas ao reutilizar o documento já carregado nos cálculos de XP por mensagem e voz. Índices e cache de cartões/ranking permanecem aditivos. Nenhum ganho de produção é alegado: não há telemetria de gateway/MongoDB de produção nesta sessão.

Benchmark CPU local reproduzível (`node scripts/benchmark-local.js`, Node v26.13.1): renderer PNG p50 de 87,734 ms sem cache e p95 de 0,024 ms com cache aquecido; serialização dos 17 comandos p95 de 0,338 ms. O relatório JSON inclui média, p50, p95 e pico. O ensaio usa fixture sem Discord, rede ou MongoDB e não representa latência de produção.

## Validação reproduzível

- `npm test` valida a serialização e hierarquia slash, permissões, painel, componentes V2, configurações da economia, operações atômicas, daily em São Paulo, perfis, ranking e interações.
- `artifacts/visual-previews/components-v2-fixtures.json` foi serializado pelos builders reais. Cinco PNGs de perfil com layouts distintos são produzidos pelo renderer usado pelo bot.
- O cliente Discord autenticado e o MongoDB de produção não estão conectados. A conferência visual desktop/mobile, interações reais, sincronização dos comandos no servidor, CDN dos assets e métricas end-to-end precisam ser confirmadas após implantação.

## Fora do escopo desta fase

Comércio entre jogadores, presentes/trocas, leilões, novos jogos, respostas automáticas com regex/regras de mídia e novos sistemas de eventos não fazem parte da conclusão da Fase 2.

## Rodada de refinamento 2.1 — pós-lançamento

A Fase 2 permanece concluída. Esta rodada atende ao feedback de uso real e não substitui nem reduz o escopo planejado para a Fase 3.

- **Notificações de XP:** a equipe escolhe um canal de texto ou anúncios pelo seletor nativo no painel XP. O envio de anúncios de nível pode ser desligado. Sem canal, nada é publicado nas conversas; canais removidos ou sem Ver canal/Enviar mensagens são ignorados e registrados no log. XP por mensagem e voz continua sendo calculado pelo mesmo serviço.
- **Comandos de perfil:** `/profile [member]` é uma consulta sem opções de edição. `/profile-edit` abre uma oficina privada com prévia no cartão, navegação por categoria, rascunho, aplicar, cancelar e restaurar.
- **Cores e estilos:** sete campos de cor aceitam HEX ou RGB. Membros podem escolher gradiente, transparência dos elementos, imagem de fundo HTTPS, cinco layouts, estilos de moldura, avatar e barra de XP, títulos, biografia, visibilidade e badges cosméticas em ordem definida.
- **Compatibilidade:** os campos anteriores `accent`, `background`, `frame`, `badges`, `title` e `bio` continuam sendo lidos. As novas preferências ficam em campos aditivos de perfil; XP e dados econômicos não são alterados.
- **Badges:** o catálogo cosmético tem mais de 70 ícones em categorias variadas. As badges especiais criadas pela staff são armazenadas separadamente, atribuídas manualmente em `/config` ou em `/badges`. Cargos autorizados podem abrir apenas a seção de badges do `/config`; as demais configurações e permissões permanecem exclusivas do proprietário. Badges especiais não representam automaticamente raças, classes ou fatos narrativos.
- **Exemplos e validação:** `artifacts/visual-previews/profile-classic.png`, `profile-wide.png`, `profile-portrait.png`, `profile-folio.png` e `profile-orbital.png` são cartões PNG reais gerados pelo renderer do bot. A suíte local cobre serialização, roteamento, permissões, cores, layouts, compatibilidade e cache; o Discord e o MongoDB de produção continuam fora deste ambiente.
