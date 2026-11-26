# Kiryu — Eternity Realms

Bot comunitário do Eternity Realms: progressão de XP, Fragmentos, Orbes, lojas, inventário, recompensas por cargo, cassino virtual, perfis ilustrados, rankings e painel administrativo. Interfaces interativas usam Discord Components V2; cartões de perfil são PNG renderizados pelo próprio bot.

## Executar localmente

- Node.js 20.19 ou superior.
- MongoDB e aplicação Discord com intents Guild Members, Message Content e Guild Voice States.
- Execute `npm ci`, copie `.env.example` para `.env`, preencha as credenciais, rode `npm run db:setup` e depois `npm start`.

O banco padrão chama-se `kiryu`. A atualização de schemas é aditiva: XP e níveis, carteiras, banco, seis saldos de Orbe, inventários, catálogo e históricos existentes permanecem nos mesmos registros. O seed cria somente SKUs ausentes e não redefine preços, estoques nem snapshots comprados. O fator de conversão inicial segue em 10:1 até ser alterado no painel.

## Árvore definitiva de comandos

Nomes de comandos, grupos, subcomandos e opções são em inglês. Descrições, telas e respostas são em português. As opções `member` aceitam usuários do servidor; operações administrativas verificam o proprietário ou os cargos autorizados.

### Administração

- `/config` — painel permanente do proprietário; a equipe autorizada também pode abrir a seção de badges especiais. As configurações gerais e a seção de permissões continuam exclusivas do proprietário.
- `/xp add|remove|set member amount`, `/xp reset member` — operações administrativas sobre XP acumulado.
- `/xp level view [member]` — consulta pública do nível.
- `/xp level add|remove|set member amount` — operações administrativas sobre nível.
- `/money add|remove|set member amount [account]` — ajustes administrativos de Fragmentos na carteira ou no banco.
- `/orbs add|remove|set member category amount` — ajustes administrativos de Orbes.
- `/inventory add|remove member sku quantity` — entrega e remoção pontual de itens pela equipe.
- `/badges assign|remove member` — atribui ou remove badges especiais da staff por seletor nativo.

### Economia e recompensas

- `/money balance` — carteira e banco próprios.
- `/money transfer member amount` — transfere Fragmentos para outra pessoa.
- `/money history [member] [page]` — histórico econômico; consultar outra pessoa exige permissão administrativa.
- `/money deposit amount` e `/money withdraw amount` — move Fragmentos entre carteira e banco.
- `/orbs balance` — consulta os seis saldos de Orbe.
- `/orbs convert` — abre a conversão para a categoria seguinte pela taxa definida em `/config`.
- `/daily` — recompensa diária por data civil, com virada à meia-noite em `America/Sao_Paulo`.
- `/work` — recompensa de trabalho com intervalo configurado em `/config`.
- `/rewards claim` — coleta recompensas recorrentes liberadas pelos cargos.
- `/shop fragments` e `/shop orbs` — vitrines com detalhe, quantidade, opções, estoque, custo total e confirmação antes da compra.
- `/inventory view [member]` — inventário próprio ou de outra pessoa, com navegação e detalhes.
- `/casino flip|dice|slots side bet` — jogos de Fragmentos virtuais.

### Perfil e ferramentas comunitárias

- `/profile [member]` — consulta rápida do próprio cartão ou do perfil de outra pessoa.
- `/profile-edit` — editor completo com prévia, rascunho, aplicação, cancelamento e restauração dos padrões.
- `/ranking board` — quadro de níveis ou patrimônio em Fragmentos.
- `/choose options` — escolhe entre opções separadas por vírgula.
- `/coinflip` — lança uma moeda.
- `/roll expression` — rola dados, por exemplo `1d20` ou `4d20+10`.

O Discord só admite `/xp level` como um grupo quando há um subcomando abaixo dele; por isso, a consulta aparece como `/xp level view`. `/inventory view` também identifica a consulta em uma árvore válida. A sincronização substitui em lote os comandos do servidor com a árvore carregada, removendo do registro ativo os nomes obsoletos.

## Configuração

`/config` organiza as opções persistentes em seções navegáveis. A equipe administra pelos controles nativos do Discord sempre que o valor é uma escolha fixa; modais são usados para textos, limites numéricos e intervalos personalizados.

- **Experiência e níveis:** XP por mensagem/voz, cooldowns, intervalos, canais excluídos, multiplicadores por cargo e empilhamento; notificações de subida de nível ativáveis, modelo com `{member}`, `{level}` e `{xp}` e canal de texto dedicado selecionado pelo Discord. Sem canal configurado, nenhum anúncio aparece nas conversas. A Kiryu valida Ver canal/Enviar mensagens e ignora destinos removidos ou inacessíveis sem alterar o XP concedido.
- **Permissões:** cargos autorizados às operações administrativas pontuais.
- **Recompensas:** faixas do daily para Fragmentos e todas as seis categorias de Orbe, valor/intervalo de trabalho, taxa de conversão e recompensas recorrentes por cargo. Regras permitem editar cargo, frequência diária/semanal/mensal, intervalo, calendário, valores e acúmulo.
- **Cassino:** liga/desliga individual para cada jogo, aposta máxima e pagamento total de cara ou coroa, dados e caça-níquel.
- **Aparência:** paletas prontas persistidas e aplicadas às interfaces do servidor.
- **Badges especiais:** criação, edição, atribuição e remoção de selos especiais pela equipe; o proprietário e cargos autorizados podem usar esta seção. `/badges assign|remove` oferece operações administrativas diretas. Badges especiais ficam separadas das cosméticas selecionáveis pelos membros.
- **Lojas e itens:** catálogo paginado, nome, descrição, emoji, arte, preço, moeda, estoque, datas, visibilidade, entrega, uso, ação segura, unidades por compra e opções.
- **Gatilhos:** texto exato, várias respostas, ativação e edição visual.

Operações individuais de XP, saldo, Orbes e inventário ficam nos comandos administrativos correspondentes; elas não alteram os registros de configuração permanente.

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
- Previews PNG renderizados pelo mesmo renderer usado pelo bot e fixtures dos builders ficam em `artifacts/visual-previews/`; regenere com `node scripts/render-visual-previews.js`.
- Variantes de personalidade contextual ficam em `src/modules/personality.js`.

## Desempenho e validação

`KIRYU_SLOW_OPERATION_MS` define o limite de aviso (padrão 750 ms). O bot agrega latência de acknowledgement/handler, comandos MongoDB e chamadas de IA em memória e descarrega contagem, média, pico e histograma no log. Estatísticas de IA e consumo de tokens também ficam persistidos por servidor. Isso não equivale a latência end-to-end em produção.

No benchmark local reproduzível (`node scripts/benchmark-local.js`, Node v26.13.1), o cartão PNG teve p50 de 87,734 ms sem cache e p95 de 0,024 ms com cache aquecido; serializar os 17 comandos teve p95 de 0,338 ms. A amostra usa fixture local, sem Discord, rede ou MongoDB; os resultados completos ficam em `artifacts/visual-previews/performance-local.json`.

Execute `npm test` para a suíte local sem Discord/MongoDB. A integração do Gateway possui testes unitários com respostas simuladas; uma chamada real deve ser feita pelo teste de conexão em `/config` ou durante a validação operacional sem imprimir a chave. `artifacts/visual-previews/components-v2-fixtures.json` contém serializações dos builders reais. As telas são verificadas quanto aos limites de componentes, mas a renderização final depende do cliente Discord.

## Refinamento pós-lançamento 2.1

A Fase 2 permanece concluída. As rodadas 2.1 e 2.2 incorporam feedback de uso real e não substituem nem reduzem o escopo planejado para a Fase 3. As mudanças de perfil, notificações e Kiryu Intelligence estão descritas acima; cinco cartões de estilos diferentes estão disponíveis em `artifacts/visual-previews/`.

## Validação que depende de produção

Este ambiente não tem sessão Discord autenticada nem conexão ao MongoDB do servidor. Portanto, as interações com permissões reais, persistência no banco de produção, renderização desktop/mobile e alcance dos assets/CDN devem ser conferidos no deploy. O Gateway possui validação real separada da suíte local; veja a etapa de disponibilidade registrada em `KIRYU_2.0.md`.
