# Kiryu — Eternity Realms

Bot comunitário do Eternity Realms: progressão de XP, economia de Fragmentos e Orbes, lojas, inventários, mercado entre membros, trocas, leilões, cassino virtual, jogos multiplayer, perfis ilustrados, rankings, Square Cloud Blob e ferramentas comunitárias. Interfaces usam Discord Components V2; cartões e mesas de jogo são renderizados em PNG pelo próprio bot.

## Executar localmente

- Node.js 20.19 ou superior.
- MongoDB e aplicação Discord com intents Guild Members, Message Content e Guild Voice States.
- Coloque `ca-certificate.crt`, `certificate.pem` e `private-key.key` em `certs/` na raiz do projeto. Copie `.env.example` para `.env`, preencha as credenciais, execute `npm ci`, `npm run db:setup` e `npm start`. Caminhos relativos definidos em `MONGODB_CA_FILE`, `MONGODB_CERT_FILE` e `MONGODB_KEY_FILE` são resolvidos a partir da raiz do projeto; caminhos absolutos também são aceitos.

O banco padrão chama-se `kiryu`. A atualização de schemas é aditiva: XP e níveis, carteiras, banco, seis saldos de Orbe, inventários, catálogo e históricos existentes permanecem nos mesmos registros. O seed cria somente SKUs ausentes e não redefine preços, estoques nem snapshots comprados. O fator de conversão inicial segue em 10:1 até ser alterado no painel.

## Árvore definitiva de comandos

Nomes de comandos, grupos, subcomandos e opções são em inglês. Descrições, telas e respostas são em português. As opções `member` aceitam usuários do servidor; operações administrativas verificam o proprietário ou os cargos autorizados.

### Administração e configuração

- `/config` — painel central com seções de armazenamento, utilitários, moderação, sorteios, templates, permissões e limites. `prompt_file` importa System Prompt; `asset_file` envia imagens ao Blob.
- `/purge`, `/announce`, `/slowmode`, `/lock`, `/unlock`, `/kick`, `/ban`, `/unban`, `/timeout apply|remove`, `/warn` e `/warnings` — ferramentas de moderação, anúncios e gestão de mensagens com permissões nativas, hierarquia de cargos e registros persistentes.
- `/embed create|edit` — editor de mensagens tradicionais e Components V2. `/embed template list|delete|export|import|apply` gerencia modelos reutilizáveis.
- `/giveaway start|end|cancel|reroll|entrants|history` — sorteios persistentes com múltiplos vencedores, requisitos opcionais por cargo e encerramento automático.
- `/xp add|remove|set member amount`, `/xp reset member` — operações administrativas sobre XP acumulado.
- `/xp level view [member]` — consulta pública do nível.
- `/xp level add|remove|set member amount` — operações administrativas sobre nível.
- `/money add|remove|set member amount [account]` — ajustes administrativos de Fragmentos na carteira ou no banco; `/money add-role|remove-role role amount [account]` faz ajustes em lote com resultado por membro.
- `/orbs add|remove|set member category amount` — ajustes administrativos de Orbes.
- `/inventory add|remove member sku quantity` — entrega e remoção pontual de itens pela equipe.
- `/badges assign|remove member` — atribui ou remove badges especiais da staff por seletor nativo.

### Economia e recompensas

- `/money balance` — carteira e banco próprios.
- `/money transfer member amount` — transfere Fragmentos para outra pessoa.
- `/money history [member] [page]` — histórico econômico; consultar outra pessoa exige permissão administrativa.
- `/money deposit amount` e `/money withdraw amount` — move Fragmentos entre carteira e banco.
- `/money leaderboard [category]` — rankings separados de carteira, banco e patrimônio total.
- `/money audit` — reconcilia limites e operações pendentes e mostra casos comerciais que exigem revisão; equipe autorizada.
- `/orbs balance` — consulta os seis saldos de Orbe.
- `/orbs convert` — abre a conversão para a categoria seguinte pela taxa definida em `/config`.
- `/daily` — recompensa diária por data civil, com virada à meia-noite em `America/Sao_Paulo`.
- `/work` — trabalho configurável; `/income adventure|crime|passive` acrescenta expedição, golpe fictício e coleta opcional de renda passiva.
- `/rewards claim` — coleta recompensas recorrentes liberadas pelos cargos.
- `/shop fragments` e `/shop orbs` — vitrines com detalhe, quantidade, opções, estoque, custo total e confirmação antes da compra.
- `/inventory view [member]` — inventário próprio ou de outra pessoa, com navegação e detalhes.
- `/market browse|seller|sell|cancel|history` — busca paginada por item, categoria e ordem; venda reserva unidades do inventário até conclusão, cancelamento ou expiração.
- `/trade invite|accept|offer|confirm|view|cancel|history` — ofertas de Fragmentos, Orbes e itens com confirmação bilateral; qualquer edição invalida as confirmações anteriores.
- `/auction list|view|create|bid|buy-now|cancel|history` — leilões persistentes com lances reservados, incrementos, compra imediata e entrega automática.
- `/casino` — central interativa com saldo, regras, catálogo, histórico, estatísticas e salas. Escolha um jogo no seletor; `/casino game bet pick|number|numbers` também inicia uma rodada diretamente.
- Jogos apostados: caça-níquel, blackjack, roleta europeia, cara ou coroa, dados, minas, maior/menor, roda, keno, baús e loteria comunitária. Usam apenas Fragmentos virtuais, sem depósitos, resgates ou conversão monetária.
- `/game create|list|join|start|move|choose|leave|view|history` — salas públicas ou privadas para RPS, Quatro em linha, jogo da velha, corridas e poker recreativos, sem apostas.

### Informações

- `/avatar [member] [server]`, `/banner [member]`, `/userinfo [member]`, `/serverinfo`, `/roleinfo role`, `/channelinfo [channel]`, `/emojiinfo emoji`, `/stickerinfo sticker_id`, `/botinfo`, `/ping`, `/uptime` e `/membercount` — consultas com imagens, timestamps e dados de serviço.
- `/help` — central interativa que mostra categorias e comandos disponíveis conforme as permissões do membro.
- `/profile [member]` — consulta rápida do próprio cartão ou do perfil de outra pessoa.
- `/profile-edit image:<anexo>` — personaliza o fundo enviando uma imagem pelo Discord; o editor também mantém as opções existentes e URLs legadas.
- `/ranking board` — quadro de níveis ou patrimônio em Fragmentos.

### Ferramentas gerais

- `/remind create|list|cancel` — lembretes persistentes por membro.
- `/timestamp`, `/poll create|close`, `/choose options`, `/random min max`, `/calculate expression`, `/translate text to [from]`, `/color value [format]`, `/qr content` e `/afk [message]`.
- `/dice expression` — rolagem recreativa independente do cassino; `/coinflip` também não altera saldos.

O Discord só admite `/xp level` como um grupo quando há um subcomando abaixo dele; por isso, a consulta aparece como `/xp level view`. `/inventory view` também identifica a consulta em uma árvore válida. A antiga rolagem `/roll` passa a ser `/dice`. A sincronização substitui em lote os **57 comandos** do servidor com a árvore carregada, removendo do registro ativo os nomes obsoletos.

## Configuração

`/config` organiza as opções persistentes em seções navegáveis. A equipe administra pelos controles nativos do Discord sempre que o valor é uma escolha fixa; modais são usados para textos, limites numéricos e intervalos personalizados.

- **Experiência e níveis:** XP por mensagem/voz, cooldowns, intervalos, canais excluídos, multiplicadores por cargo e empilhamento; notificações de subida de nível ativáveis, modelo com `{member}`, `{level}` e `{xp}` e canal de texto dedicado selecionado pelo Discord. Sem canal configurado, nenhum anúncio aparece nas conversas. A Kiryu valida Ver canal/Enviar mensagens e ignora destinos removidos ou inacessíveis sem alterar o XP concedido.
- **Permissões:** cargos autorizados às operações administrativas pontuais.
- **Recompensas:** faixas do daily para Fragmentos e seis categorias de Orbe, liga/desliga e intervalo de trabalho, expedições, golpes fictícios (ganho, multa e chance de falha), renda passiva, taxa de conversão e recompensas recorrentes por cargo. Regras permitem editar cargo, frequência diária/semanal/mensal, intervalo, calendário, valores e acúmulo.
- **Economia:** saldo inicial aplicado apenas a novas contas, limites de carteira e banco, taxas e expiração do mercado, tamanho do catálogo individual, taxas e incremento dos leilões, expiração de trocas e taxa da loteria. Nenhum valor de recompensa existente é reescrito na leitura das configurações.
- **Cassino:** ativação individual de jogos, canais permitidos, aposta máxima, cooldown, limite diário de perdas, duração de sessão, prazo por turno, preço e volume de bilhetes; pagamentos clássicos de cara ou coroa, dados e caça-níquel.
- **Aparência:** paletas prontas persistidas e aplicadas às interfaces do servidor.
- **Badges especiais:** criação, edição, atribuição e remoção de selos especiais pela equipe; o proprietário e cargos autorizados podem usar esta seção. `/badges assign|remove` oferece operações administrativas diretas. Badges especiais ficam separadas das cosméticas selecionáveis pelos membros.
- **Lojas e itens:** catálogo paginado, nome, descrição, emoji, arte, preço, moeda, estoque, datas, visibilidade, entrega, uso, ação segura, unidades por compra e opções.
- **Gatilhos:** texto exato, várias respostas, ativação e edição visual.
- **Armazenamento:** limites por servidor, tamanho máximo por imagem, pausa de uploads, filtros por categoria, paginação, prévia, referências, órfãos, rename e remoção segura.
- **Utilitários:** ativação de lembretes, enquetes e estados AFK; limite de lembretes por membro e horizonte máximo.
- **Moderação e logs:** ativação, canal administrativo, limite para alertas de advertências.
- **Sorteios:** ativação, canal de logs e duração máxima.
- **Templates:** consulta e utilização dos templates persistentes do editor.

Operações individuais de XP, saldo, Orbes e inventário ficam nos comandos administrativos correspondentes; elas não alteram os registros de configuração permanente.

## Square Cloud Blob

A Kiryu usa o [SDK oficial `@squarecloud/blob`](https://github.com/squarecloudofc/sdk-blob-js) para armazenar imagens e GIFs em namespaces `kiryu/<servidor>/<categoria>`. Configure `SQUARECLOUD_API_KEY` com os escopos `blob:read` e `blob:write`. O serviço valida assinatura, extensão, tamanho e quotas, grava metadados e IDs opacos no MongoDB e utiliza a URL pública retornada pelo provedor; URLs temporárias de anexos do Discord são usadas somente para a ingestão inicial.

Fundos de perfil enviados pelo comando `/profile-edit image` e assets de produtos, badges, molduras, cosméticos, cassino, design system, gatilhos e templates ficam associados a referências persistentes. O gerenciamento está em `/config` → **Armazenamento**; o painel bloqueia exclusões de objetos que ainda tenham referências ativas. URLs de fundo configuradas anteriormente continuam válidas.

O serviço mede latência de upload/download, operações de catálogo e estatísticas, mantém cache de downloads com limite de memória e TTL e trata falhas do Blob sem impedir comandos que não usam assets. Os limites internos por servidor não alteram a quota real da conta Square Cloud; as estatísticas mostram ambos. Veja a [documentação oficial do Blob](https://help.squarecloud.app/en-us/article/blob-storage-what-it-is-and-how-to-use-it-cdn-p8jf04/) para capacidades e regras do provedor.

## Lembretes, enquetes e sorteios persistentes

Lembretes e enquetes são gravados no MongoDB, com IDs e status usados para evitar processamento duplicado. Sorteios guardam participantes, prazo, requisitos, vencedores e estado de encerramento; leases permitem recuperar sorteios em processamento após reinicialização. A atualização das mensagens usa o registro persistido e não cria anúncios novos ao repetir o processamento.

## Kiryu Intelligence · refinamento 2.2

A IA usa somente o [Square Cloud AI Gateway](https://docs.squarecloud.app/pt-br/api-reference/ai-gateway), em `POST /v2/ai/chat/completions`. Configure `SQUARECLOUD_API_KEY` no ambiente do processo; `.env` é ignorado pelo Git e `.env.example` contém apenas o nome da variável. O Gateway requer uma chave com escopo `ai:chat`.

- A Kiryu conversa em mensagens do servidor quando alguém menciona diretamente o usuário do bot ou responde a uma mensagem da Kiryu. Não existe comando slash de chat. Menções coletivas e de cargos, bots, webhooks e mensagens próprias não iniciam uma conversa.
- **Kiryu Intelligence** em `/config` ativa o recurso, testa a conexão, mostra disponibilidade e seleciona o modelo. A API atual não oferece endpoint de catálogo para conversas; a documentação e o OpenAPI listam `cubic`, o único modelo mostrado no painel. `cubic-decision` pertence ao endpoint separado de decisões tipadas e não é um modelo de conversa.
- A seção **Personalidade** permite editar (até 4.000 caracteres no modal), importar e exportar `.txt` e limpar o System Prompt. `/config prompt_file:<arquivo.txt>` importa texto UTF-8 hospedado como anexo pelo Discord, com limite de 128 KiB e até 32.000 caracteres. Alterações são salvas no MongoDB e valem na próxima resposta. Conteúdo dos membros permanece em mensagens `user` e não é acrescentado ao System Prompt.
- A seção **Geração** expõe somente `temperature`, `max_completion_tokens`, `reasoning_effort` (`none`, `minimal`, `low`, `medium`, `high`) e controles locais de contexto, timeout e consumo. `top_p` não aparece no contrato atual do Gateway e não é enviado. Respostas usam streaming SSE com usage quando disponível; o bot agrupa trechos antes de enviar mensagens Discord com menções desativadas.
- O contexto recente é isolado por servidor e canal, ordenado por horário e identifica cada autor; também inclui respostas anteriores da Kiryu e a mensagem respondida. A janela local é ajustável de 1 a 100 mensagens e o contexto é reduzido para caber no orçamento configurado. O Gateway documenta até 500 mensagens por chamada.
- **Canais e acesso** tem seletores nativos para canais e cargos permitidos/bloqueados; bloqueios prevalecem. Há cooldown, limites diários de chamadas/tokens por membro e por servidor, limite de concorrência, timeout, cancelamento ao apagar a mensagem de origem, retentativas seletivas de rede/rate limit e proteção contra duplicatas. Contadores e métricas ficam no MongoDB. Registros de utilização não armazenam prompts nem respostas e expiram em 400 dias.
- **Estatísticas** mostra chamadas, êxitos, erros, tokens de entrada/saída, modelo, membros, latência média e p95 por dia/semana/mês (UTC). O Gateway retorna usage de tokens, mas não disponibiliza custo por chamada nessa API.

Limites publicados dependem do plano da Square Cloud: Standard documenta contexto de 65.536 tokens, saída de 6.144 e até 4 gerações simultâneas; Pro, 131.072 / 8.192 / 8 simultâneas; Enterprise, 262.144 / 12.288 / 16 simultâneas. A Kiryu usa limites conservadores configuráveis e trata erros `401`, `403`, `400` e `429` sem registrar a credencial nem o corpo privado da resposta. Consulte a [referência oficial do Gateway](https://docs.squarecloud.app/pt-br/api-reference/ai-gateway) para limites atuais e os [recursos e planos](https://squarecloud.app/en/resources/ai-gateway); o [OpenAPI oficial](https://api.squarecloud.app/v2/openapi.json) é a fonte do contrato de parâmetros.

O recurso começa desativado. Configure e teste a conexão em `/config` antes de ativar. Se o Gateway estiver indisponível, a Kiryu informa que não conseguiu responder; XP, comandos, economia, notificações de nível e respostas determinísticas seguem nos seus fluxos independentes.

## Identidade visual e arquivos de demonstração

- Componentes, paletas e selos por sistema: `src/modules/components.js`, `src/config.js` e `assets/systems/`.
- Divisória local versionada em `assets/kiryu-divider.gif`; `KIRYU_ASSET_BASE_URL` pode apontar para um CDN próprio.
- Cartões PNG são renderizados em `src/modules/memberProfiles.js`. O editor permite sete cores livres em HEX/RGB, gradiente, transparência, imagem de fundo HTTPS, cinco layouts, oito molduras, cinco formatos de avatar, cinco barras de XP, títulos, biografia, seis badges cosméticas organizáveis e visibilidade por elemento. Os campos antigos de perfil continuam válidos; os novos são aditivos.
- O catálogo inclui mais de 70 badges cosméticas em categorias visuais distintas. Badges especiais criadas pela staff não são associadas automaticamente a raças, classes ou narrativas do Eternity.
- Previews PNG renderizados pelo mesmo renderer usado pelo bot e fixtures dos builders ficam em `artifacts/visual-previews/`; regenere com `node scripts/render-visual-previews.js` e `node scripts/render-phase-34-previews.js`.
- Variantes de personalidade contextual ficam em `src/modules/personality.js`.

## Desempenho e validação

`KIRYU_SLOW_OPERATION_MS` define o limite de aviso (padrão 750 ms). O bot agrega latência de acknowledgement/handler, comandos MongoDB, operações de Blob e chamadas de IA em memória e descarrega contagem, média, pico e histograma no log. Estatísticas de IA e consumo de tokens também ficam persistidos por servidor. Isso não equivale a latência end-to-end em produção.

O benchmark histórico em `artifacts/visual-previews/performance-local.json` mede o renderer de perfil e a árvore anterior de 52 comandos; não é uma medição dos 57 comandos nem da economia com MongoDB. A amostra usa fixture local, sem Discord, rede ou MongoDB.

Execute `npm test` para a suíte local sem Discord/MongoDB. `npm run blob:validate` faz uma rodada real de upload, download, substituição versionada e exclusão usando `SQUARECLOUD_API_KEY` e `SERVER_ID`; os objetos temporários são removidos ao final. A integração do Gateway possui testes unitários com respostas simuladas; uma chamada real deve ser feita pelo teste de conexão em `/config` ou durante a validação operacional sem imprimir a chave. `artifacts/visual-previews/components-v2-fixtures.json` contém serializações dos builders reais. As telas são verificadas quanto aos limites de componentes, mas a renderização final depende do cliente Discord.

## Fases 3 e 4 — Economia & Cassino

A entrega atual expande a economia com limites configuráveis, auditoria, fontes de renda, comércio entre membros, trocas, leilões e loteria comunitária. O cassino tem jogos individuais e sessões persistidas; as salas de jogos multiplayer guardam turnos e recuperação no MongoDB. A topologia não depende de transações de replica set: mudanças de saldo usam atualizações atômicas por conta, diário idempotente, compensação e fila de revisão manual para falhas não conciliáveis. Registros de XP, Orbes, saldo, inventário, catálogo, perfis, badges e configurações anteriores são mantidos.

As regras de cassino são públicas e não variam conforme saldo ou histórico. Todos os jogos usam moeda virtual sem depósitos, resgates ou prêmios financeiros. O painel `/config` concentra limites, taxas, fontes de renda, canais, jogos e cooldowns.

As demonstrações PNG de mesas e jogos, além de fixtures serializadas das interfaces comerciais, ficam em `artifacts/visual-previews/phase-3-4/`.

## Validação que depende de produção

O ambiente de desenvolvimento não tem sessão Discord autenticada nem conexão ao MongoDB do servidor. Portanto, as interações com permissões reais, persistência no banco de produção e renderização desktop/mobile devem ser conferidas no deploy. O SDK do Blob possui validação real separada da suíte local; o Gateway tem validação descrita em `KIRYU_2.0.md`.
