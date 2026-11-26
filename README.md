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

## Identidade visual e arquivos de demonstração

- Componentes, paletas e selos por sistema: `src/modules/components.js`, `src/config.js` e `assets/systems/`.
- Divisória local versionada em `assets/kiryu-divider.gif`; `KIRYU_ASSET_BASE_URL` pode apontar para um CDN próprio.
- Cartões PNG são renderizados em `src/modules/memberProfiles.js`. O editor permite sete cores livres em HEX/RGB, gradiente, transparência, imagem de fundo HTTPS, cinco layouts, oito molduras, cinco formatos de avatar, cinco barras de XP, títulos, biografia, seis badges cosméticas organizáveis e visibilidade por elemento. Os campos antigos de perfil continuam válidos; os novos são aditivos.
- O catálogo inclui mais de 70 badges cosméticas em categorias visuais distintas. Badges especiais criadas pela staff não são associadas automaticamente a raças, classes ou narrativas do Eternity.
- Previews PNG renderizados pelo mesmo renderer usado pelo bot e fixtures dos builders ficam em `artifacts/visual-previews/`; regenere com `node scripts/render-visual-previews.js`.
- Variantes de personalidade contextual ficam em `src/modules/personality.js`.

## Desempenho e validação

`KIRYU_SLOW_OPERATION_MS` define o limite de aviso (padrão 750 ms). O bot agrega latência de acknowledgement/handler e comandos MongoDB em memória e descarrega contagem, média, pico e histograma no log. Isso não equivale a latência end-to-end em produção; este checkout não tem gateway ou MongoDB de produção conectados.

No benchmark local reproduzível (`node scripts/benchmark-local.js`, Node v26.13.1), o cartão PNG teve p50 de 87,734 ms sem cache e p95 de 0,024 ms com cache aquecido; serializar os 17 comandos teve p95 de 0,338 ms. A amostra usa fixture local, sem Discord, rede ou MongoDB; os resultados completos ficam em `artifacts/visual-previews/performance-local.json`.

Execute `npm test` para a suíte local sem Discord/MongoDB. `artifacts/visual-previews/components-v2-fixtures.json` contém serializações dos builders reais. As telas são verificadas quanto aos limites de componentes, mas a renderização final depende do cliente Discord.

## Refinamento pós-lançamento 2.1

A Fase 2 permanece concluída. Esta rodada incorpora feedback de uso real e não substitui nem reduz o escopo planejado para a Fase 3. As mudanças de perfil e notificações estão descritas acima; cinco cartões de estilos diferentes estão disponíveis em `artifacts/visual-previews/`.

## Validação que depende de produção

Este ambiente não tem sessão Discord autenticada nem conexão ao MongoDB do servidor. Portanto, permanecem para a implantação: sincronizar e confirmar a remoção dos comandos antigos no servidor, testar interações com permissões reais, conferir a renderização desktop/mobile e verificar o alcance dos assets/CDN. O workflow Square Cloud existente não foi alterado; erros externos de infraestrutura e deploy devem ser avaliados separadamente de falhas locais de build ou teste.
