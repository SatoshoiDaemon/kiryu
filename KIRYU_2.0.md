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

- **XP:** faixas e cooldown de mensagem, faixas e intervalo de voz, canais excluídos, buffs por cargo, empilhamento e anúncio de level up (ativação e modelo textual).
- **Permissões:** cargos autorizados para operações administrativas.
- **Recompensas:** daily de Fragmentos e todas as categorias de Orbe, trabalho e seu intervalo, fator de conversão de Orbes e regras recorrentes por cargo.
- **Regras por cargo:** cargo elegível, recompensa, recorrência diária/semanal/mensal, intervalo ou calendário, e acúmulo.
- **Lojas:** cadastro, edição paginada, nome, descrição, emoji, arte, preço, moeda/categoria, estoque, datas, visibilidade, entrega, inventário, consumo, ação, quantidade e opções de compra.
- **Cassino:** ativação individual de jogos, aposta máxima e multiplicadores de pagamento.
- **Aparência:** paletas de sistema persistidas e aplicadas após a seleção e também na inicialização.
- **Gatilhos:** texto exato, múltiplas respostas, ativação e remoção.

Valores livres usam modais; cargos, canais, categorias e ações fixas usam os componentes nativos apropriados. Ajustes pontuais de recursos permanecem em `/xp`, `/money`, `/orbs` e `/inventory` com checagem de permissão.

## Comandos

Todos os nomes de comandos, grupos, subcomandos e opções são ingleses; descrições e respostas são portuguesas. A consulta de XP fica em `/xp level view`, porque o Discord exige um subcomando filho quando `level` é um grupo. O inventário usa `/inventory view|add|remove`.

Árvore completa e parâmetros: [README.md](README.md#árvore-definitiva-de-comandos). A sincronização usa substituição em lote dos comandos guild-scoped carregados, o que remove comandos antigos do registro ativo na próxima sincronização bem-sucedida.

## Interfaces e experiência

- Interfaces interativas usam Components V2 compartilhados, cores por sistema, selos, divisória local, cabeçalhos, timestamps nativos e rodapé `Developer by Krieg.js`.
- Loja exige detalhe e confirmação antes de cobrar; opções e quantidades exibem preço total. Inventário e catálogo são paginados e os IDs de documentos não aparecem em texto de interface.
- Perfil atualiza a prévia na mesma mensagem; conversão mostra confirmação antes de alterar saldos. Interações verificam proprietário, permissões, disponibilidade, saldo e estado dos componentes.
- A personalidade contextual acompanha recompensas, trabalho, transferência, compra, cassino, subida de nível e erros.

## Desempenho

Instrumentação agrega acknowledgement/handler e comandos MongoDB com contagem, média, pico e histograma. Consultas repetidas de configuração foram reduzidas ao reutilizar o documento já carregado nos cálculos de XP por mensagem e voz. Índices e cache de cartões/ranking permanecem aditivos. Nenhum ganho de produção é alegado: não há telemetria de gateway/MongoDB de produção nesta sessão.

Benchmark CPU local reproduzível (`node scripts/benchmark-local.js`, Node v26.13.1): renderer PNG p50 83,183 ms em cache frio e p95 0,004 ms em cache aquecido; serialização dos 15 comandos p95 0,201 ms. O relatório JSON inclui média, p50, p95 e pico. O ensaio usa fixture sem Discord, rede ou MongoDB e não representa latência de produção.

## Validação reproduzível

- `npm test` valida a serialização e hierarquia slash, permissões, painel, componentes V2, configurações da economia, operações atômicas, daily em São Paulo, perfis, ranking e interações.
- `artifacts/visual-previews/components-v2-fixtures.json` foi serializado pelos builders reais. `artifacts/visual-previews/profile-member.png` é produzido pelo renderer de perfil usado pelo bot.
- O cliente Discord autenticado e o MongoDB de produção não estão conectados. A conferência visual desktop/mobile, interações reais, sincronização dos comandos no servidor, CDN dos assets e métricas end-to-end precisam ser confirmadas após implantação.

## Fora do escopo desta fase

Comércio entre jogadores, presentes/trocas, leilões, novos jogos, respostas automáticas com regex/regras de mídia e novos sistemas de eventos não fazem parte da conclusão da Fase 2.
