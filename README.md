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

- `/config` — painel permanente do proprietário. Reúne progressão, permissões, recompensas, taxa de conversão, regras por cargo, catálogo e respostas automáticas.
- `/xp add|remove|set member amount`, `/xp reset member` — operações administrativas sobre XP acumulado.
- `/xp level view [member]` — consulta pública do nível.
- `/xp level add|remove|set member amount` — operações administrativas sobre nível.
- `/money add|remove|set member amount [account]` — ajustes administrativos de Fragmentos na carteira ou no banco.
- `/orbs add|remove|set member category amount` — ajustes administrativos de Orbes.
- `/inventory add|remove member sku quantity` — entrega e remoção pontual de itens pela equipe.

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

- `/profile [member]` — cartão de perfil; o próprio membro pode editar fundo, moldura, paleta, insígnias, título e biografia.
- `/ranking board` — quadro de níveis ou patrimônio em Fragmentos.
- `/choose options` — escolhe entre opções separadas por vírgula.
- `/coinflip` — lança uma moeda.
- `/roll expression` — rola dados, por exemplo `1d20` ou `4d20+10`.

O Discord só admite `/xp level` como um grupo quando há um subcomando abaixo dele; por isso, a consulta aparece como `/xp level view`. `/inventory view` também identifica a consulta em uma árvore válida. A sincronização substitui em lote os comandos do servidor com a árvore carregada, removendo do registro ativo os nomes obsoletos.

## Configuração

`/config` organiza as opções persistentes em seções navegáveis. A equipe administra pelos controles nativos do Discord sempre que o valor é uma escolha fixa; modais são usados para textos, limites numéricos e intervalos personalizados.

- **Experiência e níveis:** XP por mensagem/voz, cooldowns, intervalos, canais excluídos, multiplicadores por cargo e empilhamento; anúncio de nível habilitado e texto com `{member}`, `{level}` e `{xp}`.
- **Permissões:** cargos autorizados às operações administrativas pontuais.
- **Recompensas:** faixas do daily para Fragmentos e todas as seis categorias de Orbe, valor/intervalo de trabalho, taxa de conversão e recompensas recorrentes por cargo. Regras permitem editar cargo, frequência diária/semanal/mensal, intervalo, calendário, valores e acúmulo.
- **Cassino:** liga/desliga individual para cada jogo, aposta máxima e pagamento total de cara ou coroa, dados e caça-níquel.
- **Aparência:** paletas prontas persistidas e aplicadas às interfaces do servidor.
- **Lojas e itens:** catálogo paginado, nome, descrição, emoji, arte, preço, moeda, estoque, datas, visibilidade, entrega, uso, ação segura, unidades por compra e opções.
- **Gatilhos:** texto exato, várias respostas, ativação e edição visual.

Operações individuais de XP, saldo, Orbes e inventário ficam nos comandos administrativos correspondentes; elas não alteram os registros de configuração permanente.

## Identidade visual e arquivos de demonstração

- Componentes, paletas e selos por sistema: `src/modules/components.js`, `src/config.js` e `assets/systems/`.
- Divisória local versionada em `assets/kiryu-divider.gif`; `KIRYU_ASSET_BASE_URL` pode apontar para um CDN próprio.
- Cartões PNG são renderizados em `src/modules/memberProfiles.js`. Previews verificáveis dos builders e uma imagem renderizada ficam em `artifacts/visual-previews/`; regenere com `node scripts/render-visual-previews.js`.
- Variantes de personalidade contextual ficam em `src/modules/personality.js`.

## Desempenho e validação

`KIRYU_SLOW_OPERATION_MS` define o limite de aviso (padrão 750 ms). O bot agrega latência de acknowledgement/handler e comandos MongoDB em memória e descarrega contagem, média, pico e histograma no log. Isso não equivale a latência end-to-end em produção; este checkout não tem gateway ou MongoDB de produção conectados.

No benchmark local reproduzível (`node scripts/benchmark-local.js`, Node v26.13.1), o renderer PNG teve p50 de 83,183 ms sem cache e p95 de 0,004 ms com cache aquecido; serializar os 15 comandos teve p95 de 0,201 ms. A amostra usou fixture local, sem Discord, rede ou MongoDB. Os resultados completos ficam em `artifacts/visual-previews/performance-local.json`.

Execute `npm test` para a suíte local sem Discord/MongoDB. `artifacts/visual-previews/components-v2-fixtures.json` contém serializações dos builders reais. As telas são verificadas quanto aos limites de componentes, mas a renderização final depende do cliente Discord.

## Validação que depende de produção

Este ambiente não tem sessão Discord autenticada nem conexão ao MongoDB do servidor. Portanto, permanecem para a implantação: sincronizar e confirmar a remoção dos comandos antigos no servidor, testar interações com permissões reais, conferir a renderização desktop/mobile e verificar o alcance dos assets/CDN. O workflow Square Cloud existente não foi alterado; erros externos de infraestrutura e deploy devem ser avaliados separadamente de falhas locais de build ou teste.
