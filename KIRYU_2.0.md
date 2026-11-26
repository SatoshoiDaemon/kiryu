# Kiryu 2.0 — Fases 3 e 4

Esta versão amplia as fases anteriores com uma economia comunitária e um cassino persistido. XP e níveis, saldos de Fragmentos e Orbes, banco, inventários, catálogo, perfis, badges, configurações e históricos existentes permanecem compatíveis e não são zerados.

## Fase 3 — Economia comunitária

- Carteira e banco: consulta, depósitos, saques, transferências, histórico, rankings por carteira/banco/patrimônio, ajustes individuais e em massa por cargo e auditoria administrativa.
- Limites configuráveis para carteira e banco; saldos iniciais apenas para contas criadas após a configuração. O leitor de configurações não reescreve faixas de recompensa já gravadas.
- Daily com renovação civil à meia-noite de `America/Sao_Paulo`, trabalho, expedição, crime fictício com chance/multa publicadas, renda passiva opcional, recompensas por cargo e ajustes administrativos.
- Mercado com busca, categoria, ordenação, vendedor, quantidade, preço unitário, histórico, cancelamento e expiração opcional. O estoque é reservado enquanto o anúncio está aberto e é liberado ou entregue por marcadores idempotentes.
- Trocas de Fragmentos, Orbes e itens com convite, alteração de oferta, confirmação bilateral, cancelamento, expiração e histórico. Cada edição altera a revisão e limpa as confirmações anteriores.
- Leilões com lance inicial, incremento, compra imediata, reserva do lance, devolução a quem foi superado, encerramento automático e recuperação de liquidação.

## Fase 4 — Kiryu Casino

- Central `/casino` com saldo, jogos ativos, regras, limites, histórico, estatísticas e navegação interativa. Os jogos usam somente Fragmentos virtuais; não há depósitos, resgates, conversão monetária ou prêmios financeiros.
- Jogos individuais: slots, blackjack, roleta europeia, cara ou coroa, dados, minas, maior/menor, roda, keno, baús e loteria comunitária. Blackjack e minas têm sessões persistidas e ações por botões.
- Jogos comunitários: RPS, Quatro em linha, jogo da velha, corrida e poker recreativo. Salas públicas ou privadas guardam jogadores, turnos, estado, expiração, abandono e histórico; o estado pode ser reaberto após reconexão.
- Probabilidades e retornos são fixos e apresentados antes da participação. Não são alterados pelo saldo, histórico ou perdas. A interface usa imagens PNG renderizadas pelo renderer do cassino, cartões, tabuleiros e botões.
- `/config` administra faixas e cooldowns de renda, saldo inicial e limites, taxas de mercado e leilão, incremento mínimo, canais, ativação de jogos, aposta máxima, cooldown e limites de sessão/perda.

## Integridade e persistência

A conexão econômica foi projetada para MongoDB standalone, sem depender de transações de replica set. Cada alteração de conta é atômica no documento do membro. Operações com mais de uma conta usam diário persistido, IDs idempotentes, marcadores de conta, compensação e recuperação pelo agendador; falhas que não podem ser compensadas ficam em `manual_review` para auditoria em `/money audit`. Estoques e lances usam reservas atômicas. A capacidade do banco não é suficiente para alegar atomicidade distribuída: os pontos de compensação e revisão manual são parte do protocolo.

## Comandos novos

- `/income adventure|crime|passive`
- `/market browse|seller|sell|cancel|history`
- `/trade invite|accept|offer|confirm|view|cancel|history`
- `/auction list|view|create|bid|buy-now|cancel|history`
- `/casino` (central) ou `/casino game:<jogo>`; `bet`, `pick`, `number`, `numbers` e `tickets` são entradas opcionais conforme o jogo.
- `/game create|list|join|start|move|choose|leave|view|history`
- `/money leaderboard [category]`, `/money audit`, `/money add-role` e `/money remove-role`.

As opções e nomes são em inglês; as respostas são em português. A árvore carregada tem 57 comandos. O README lista a árvore, configuração e exemplos completos.

## Validação local

Execute `npm test` para a suíte completa. `node --check` pode verificar a sintaxe dos módulos sem precisar de Discord ou MongoDB. PNGs gerados por `casinoArt` e serializações de interfaces comerciais ficam em `artifacts/visual-previews/phase-3-4/`. Testes locais não comprovam permissões reais do Discord, conectividade de produção, renderização em cada cliente móvel ou comportamento do cluster MongoDB de produção.

## Registro anterior — Fase 2.3

As seções seguintes preservam a documentação das fases anteriores e seu contexto de validação.

---

# Kiryu 2.0 — estado da Fase 2.3

## Resultado

A Fase 2 e os refinamentos 2.1–2.2 permanecem preservados. A Fase 2.3 adiciona a integração central de Square Cloud Blob, ferramentas comunitárias, administração, editor de mensagens, lembretes, enquetes e sorteios persistentes. A expansão econômica, comércio, mercado e leilões continua reservada para a Fase 3.

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
- **Armazenamento:** upload, listagem paginada e filtrada, prévia, categoria, rename, substituição, referências, órfãos, limites, estatísticas, cache e exclusão protegida de assets do Blob.
- **Utilitários:** ativação de lembretes, enquetes e AFK, limites de prazo e quantidade.
- **Moderação e logs:** ativação, canais de registros e limite para alertas de advertências.
- **Sorteios e templates:** ativação, canal de logs, duração máxima e consulta de modelos de mensagem.

Valores livres usam modais; cargos, canais, categorias e ações fixas usam os componentes nativos apropriados. Ajustes pontuais de recursos permanecem em `/xp`, `/money`, `/orbs` e `/inventory` com checagem de permissão.

## Comandos

Todos os nomes de comandos, grupos, subcomandos e opções são ingleses; descrições e respostas são portuguesas. `/profile [member]` consulta o cartão sem oferecer controles de edição; `/profile-edit` abre a oficina e aceita imagem do próprio Discord. `/badges assign|remove member` administra selos especiais. A consulta de XP fica em `/xp level view`, porque o Discord exige um subcomando filho quando `level` é um grupo. O inventário usa `/inventory view|add|remove`. `/roll` foi aprimorado sob o nome `/dice`; `/coinflip` e `/dice` são separados do cassino.

Árvore completa e parâmetros: [README.md](README.md#árvore-definitiva-de-comandos). A sincronização usa substituição em lote dos comandos guild-scoped carregados, o que remove comandos antigos do registro ativo na próxima sincronização bem-sucedida.

## Interfaces e experiência

- Interfaces interativas usam Components V2 compartilhados, cores por sistema, selos, divisória local, cabeçalhos, timestamps nativos e rodapé `Developer by Krieg.js`.
- Loja exige detalhe e confirmação antes de cobrar; opções e quantidades exibem preço total. Inventário e catálogo são paginados e os IDs de documentos não aparecem em texto de interface.
- A oficina de perfil atualiza a prévia no mesmo cartão e mantém um rascunho até aplicar; oferece cancelamento e restauração dos padrões. `/profile` é somente leitura.
- A personalidade contextual acompanha recompensas, trabalho, transferência, compra, cassino, subida de nível e erros.

## Desempenho

Instrumentação agrega acknowledgement/handler e comandos MongoDB com contagem, média, pico e histograma. Consultas repetidas de configuração foram reduzidas ao reutilizar o documento já carregado nos cálculos de XP por mensagem e voz. Índices e cache de cartões/ranking permanecem aditivos. Nenhum ganho de produção é alegado: não há telemetria de gateway/MongoDB de produção nesta sessão.

Benchmark CPU local reproduzível (`node scripts/benchmark-local.js`, Node v26.13.1): renderer PNG p50 de 77,739 ms sem cache e p95 de 0,014 ms com cache aquecido; serializar a árvore de 52 comandos teve p95 de 0,47 ms. O relatório anterior de 17 comandos não mede esta árvore atual. O ensaio usa fixture sem Discord, rede ou MongoDB e não representa latência de produção.

## Validação reproduzível

- `npm test` valida a serialização e hierarquia slash, permissões, painel, componentes V2, configurações da economia, operações atômicas, daily em São Paulo, perfis, ranking e interações.
- `artifacts/visual-previews/components-v2-fixtures.json` foi serializado pelos builders reais. Cinco PNGs de perfil com layouts distintos são produzidos pelo renderer usado pelo bot.
- O cliente Discord autenticado e o MongoDB de produção não estão conectados. A conferência visual desktop/mobile, interações reais, sincronização dos comandos no servidor, CDN dos assets e métricas end-to-end precisam ser confirmadas após implantação.

## Fora do escopo desta fase

Comércio entre jogadores, mercado, presentes/trocas, leilões e expansão econômica seguem na Fase 3. Jogos novos e gatilhos com regex/regras complexas de mídia continuam fora da Fase 2.3.

## Rodada de refinamento 2.1 — pós-lançamento

A Fase 2 permanece concluída. Esta rodada atende ao feedback de uso real e não substitui nem reduz o escopo planejado para a Fase 3.

- **Notificações de XP:** a equipe escolhe um canal de texto ou anúncios pelo seletor nativo no painel XP. O envio de anúncios de nível pode ser desligado. Sem canal, nada é publicado nas conversas; canais removidos ou sem Ver canal/Enviar mensagens são ignorados e registrados no log. XP por mensagem e voz continua sendo calculado pelo mesmo serviço.
- **Comandos de perfil:** `/profile [member]` é uma consulta sem opções de edição. `/profile-edit` abre uma oficina privada com prévia no cartão, navegação por categoria, rascunho, aplicar, cancelar e restaurar.
- **Cores e estilos:** sete campos de cor aceitam HEX ou RGB. Membros podem escolher gradiente, transparência dos elementos, imagem de fundo HTTPS, cinco layouts, estilos de moldura, avatar e barra de XP, títulos, biografia, visibilidade e badges cosméticas em ordem definida.
- **Compatibilidade:** os campos anteriores `accent`, `background`, `frame`, `badges`, `title` e `bio` continuam sendo lidos. As novas preferências ficam em campos aditivos de perfil; XP e dados econômicos não são alterados.
- **Badges:** o catálogo cosmético tem mais de 70 ícones em categorias variadas. As badges especiais criadas pela staff são armazenadas separadamente, atribuídas manualmente em `/config` ou em `/badges`. Cargos autorizados podem abrir apenas a seção de badges do `/config`; as demais configurações e permissões permanecem exclusivas do proprietário. Badges especiais não representam automaticamente raças, classes ou fatos narrativos.
- **Exemplos e validação:** `artifacts/visual-previews/profile-classic.png`, `profile-wide.png`, `profile-portrait.png`, `profile-folio.png` e `profile-orbital.png` são cartões PNG reais gerados pelo renderer do bot. A suíte local cobre serialização, roteamento, permissões, cores, layouts, compatibilidade e cache; o Discord e o MongoDB de produção continuam fora deste ambiente.

## Rodada de refinamento 2.2 — Kiryu Intelligence

A Fase 2 permanece concluída; esta rodada pós-lançamento não inicia nem reduz o escopo da Fase 3. A Kiryu foi integrada ao Gateway oficial de IA da Square Cloud e participa das conversas comuns sem comando slash de chat.

- **Gateway:** somente `POST https://api.squarecloud.app/v2/ai/chat/completions`, com chave `SQUARECLOUD_API_KEY` e modelo conversacional `cubic`. A API não fornece endpoint de descoberta de modelos; `cubic-decision` é um endpoint separado de decisões e não aparece como opção de conversa. Fontes: [documentação oficial](https://docs.squarecloud.app/pt-br/api-reference/ai-gateway), [página de recursos](https://squarecloud.app/en/resources/ai-gateway) e [OpenAPI](https://api.squarecloud.app/v2/openapi.json). Não há `top_p` ou custo individual no contrato de chat atual.
- **Gatilhos:** menção direta por ID nativo do bot ou resposta a uma mensagem da Kiryu. Coletivos, cargos, bots, webhooks e a própria Kiryu são ignorados. Cada resposta é ligada à mensagem de origem, usa typing, desativa todas as menções nas saídas e divide respostas extensas no limite do Discord.
- **System Prompt:** configurável em `/config` por modal, importação de `.txt` ou exportação; o arquivo é limitado a 128 KiB e o texto a 32.000 caracteres. O padrão é vazio, sem personalidade fixa no código. Atualizações persistidas no MongoDB valem sem reinicialização. Mensagens de membros permanecem em roles de usuário.
- **Contexto:** janela ajustável de 1–100 mensagens recentes no mesmo canal e servidor, com autoria, ordenação cronológica, falas da Kiryu e referência respondida. Histórico não relacionado é removido para respeitar orçamento local. Não existe memória permanente ou banco vetorial nesta etapa.
- **Configuração:** ativação, único modelo documentado, teste de conexão, identidade, temperatura, limite de saída, `reasoning_effort`, janela/contexto, timeout, concorrência, cooldown, limites diários de chamadas e tokens e seletores nativos para canais/cargos permitidos e bloqueados. Bloqueios prevalecem.
- **Confiabilidade e dados:** streaming SSE com usage quando disponível; timeout e cancelamento, concorrência, espaçamento conservador de chamadas, retentativas seletivas, deduplicação e contadores diários atômicos no MongoDB. Telemetria registra modelo, tipo, estado, tokens e latência sem persistir prompts ou respostas; TTL de 400 dias. Stats apresentam utilização diária, semanal e mensal, membro/modelo, latência média e p95. Preço por chamada não é retornado pelo Gateway.
- **Limites documentados por plano:** Standard: contexto 65.536 tokens, saída 6.144, concorrência 4; Pro: 131.072 / 8.192 / 8; Enterprise: 262.144 / 12.288 / 16. A Kiryu limita a saída localmente e trata limites/rate limits do provedor. O modelo `cubic` suporta `temperature`, `max_completion_tokens` e `reasoning_effort` conforme o contrato atual.
- **Isolamento funcional:** nenhuma ferramenta econômica ou administrativa é exposta ao modelo. XP, daily, trabalho, lojas, cassino, transferências, comandos e anúncios de nível mantêm os serviços existentes. O recurso começa desativado e uma indisponibilidade do Gateway não altera esses sistemas.
- **Validação:** testes locais cobrem autenticação simulada, parâmetros e modelo, streaming/usage, rate limits, cancelamento, métricas, limite local, duplicatas, filtros, contexto multiusuário e interface administrativa. Em 25/11/2026, uma chamada pelo próprio serviço foi autenticada com a chave somente em memória; o Gateway respondeu com `cubic`, aplicou o System Prompt de verificação e retornou 768 tokens (755 de entrada e 13 de saída). A chave e o conteúdo não foram registrados. MongoDB e sessão Discord de produção não estavam conectados neste checkout; a persistência real e as interações no servidor dependem do deploy.

## Fase 2.3 — Storage & Utilities

- **Square Cloud Blob:** SDK oficial `@squarecloud/blob`, namespace `kiryu/<guild>/<category>`, validação de imagem, upload, download com cache, metadados, listagem, estatísticas, substituição, exclusão, limites por servidor e metadados no MongoDB. IDs retornados pelo Blob são referências persistentes; URLs temporárias do Discord só são usadas para baixar anexos durante o upload. Fundos antigos por URL permanecem compatíveis.
- **Assets integrados:** fundos de perfil enviados pelo membro, badges, molduras, cosméticos, arte de produtos, cassino, banners/divisórias do Design System, gatilhos e imagens de templates. O painel `/config` lista e filtra objetos, mostra prévias, referências e órfãos e bloqueia exclusão de objetos compartilhados.
- **Comandos informativos:** `/avatar`, `/banner`, `/userinfo`, `/serverinfo`, `/roleinfo`, `/channelinfo`, `/emojiinfo`, `/stickerinfo`, `/botinfo`, `/ping`, `/uptime`, `/membercount` e `/help`.
- **Ferramentas gerais:** `/remind`, `/timestamp`, `/poll`, `/choose`, `/random`, `/calculate`, `/translate`, `/color`, `/qr`, `/afk`, `/dice` e `/coinflip`. Tradução chama o Square Cloud AI Gateway via serviço de quotas existente. Lembretes, votos e ausências são persistidos.
- **Administração:** `/purge`, `/announce`, `/embed`, `/giveaway`, `/slowmode`, `/lock`, `/unlock`, `/kick`, `/ban`, `/unban`, `/timeout`, `/warn` e `/warnings`. Checagens usam permissões nativas, cargos e hierarquia do Discord; auditoria no MongoDB inclui ator, alvo, motivo, data, operação e detalhes.
- **Editor e templates:** editor interativo alterna entre embed e Components V2 e organiza Text Displays, Sections, separadores, galerias, thumbnails e botões de link. Prévia, publicação, edição de mensagens administradas e modelos importáveis/exportáveis são persistidos.
- **Recuperação:** agendador processa lembretes, fechamento de enquetes e sorteios após reinício. Sorteios usam leases, grava vencedores antes de editar a mensagem e repetem atualização da mesma mensagem sem publicar duplicatas.
- **Validação:** `npm test` inclui serialização dos comandos, hierarquia de moderação, parser seguro, validação de imagens, componentes gerenciados e tarefas persistentes. `npm run blob:validate` executou no serviço real upload, info, listagem, download, substituição versionada, estatísticas e exclusão usando a chave local sem exibi-la. Fixtures V2 e demonstração visual ficam em `artifacts/visual-previews/`.
- **Escopo:** nenhuma funcionalidade da Fase 3 foi iniciada.
