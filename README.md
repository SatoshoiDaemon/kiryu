# Kiryu

Bot do servidor Eternity Realms com XP, níveis, economia, inventário, lojas, comandos utilitários, gatilhos personalizados e painel administrativo.

## Requisitos

- Node.js 20.19 ou superior
- MongoDB; `/trabalhar`, `/daily` e operações de saldo funcionam também em servidor standalone
- Aplicação Discord com os intents Guild Members, Message Content e Guild Voice States habilitados no Developer Portal
- Certificados MongoDB locais em certs/ (a pasta não é versionada)

## Configuração local

1. Instale as dependências com npm ci.
2. Copie .env.example para .env e preencha DISCORD_TOKEN, CLIENT_ID, SERVER_ID e MONGODB_URI.
3. Coloque os três certificados recebidos em certs/, ou configure os caminhos MONGODB_*_FILE no .env.
4. Inicialize o banco e confirme a conexão com npm run db:setup.
5. Inicie o bot com npm start.

O bot usa o banco kiryu por padrão. Defina MONGODB_DB_NAME para escolher outro nome. A inicialização cria as coleções e índices necessários; novas configurações, contas e perfis são gravados sob demanda.

O arquivo .env existente pode continuar usando o nome antigo DICORD_TOKEN; DISCORD_TOKEN é o nome recomendado para novas instalações.

## Comandos

- Slash: /level, /choose, /roll, /coinflip, /config, /addxp, /removexp, /addlevel, /removelevel
- Economia: /trabalhar, /daily, /coletar, /carteira, /banco depositar, /banco sacar, /orbes
- Loja e itens: /loja fragmentos, /loja orbes, /inventario, /use
- Administração da economia: operações de saldo, recompensas, regras de cargo, itens, estoque e histórico ficam nos subcomandos de /economia.
- Prefixo $: $level, $choose, $roll, $coinflip
- /config é exclusivo do proprietário 1290969388933054528. Os cargos autorizados nele configurados podem usar os comandos de gerenciamento de XP.
- Os cargos configurados na seção Permissões de /config também autorizam os subcomandos administrativos de /economia.

## Economia

Fragmentos têm saldo separado de carteira e banco. /carteira exibe os saldos e oferece atalhos para inventário, depósito e saque. Orbes são saldos independentes em seis categorias; /orbes permite converter quantidades múltiplas de 10 para a categoria seguinte depois de uma prévia e confirmação. A recompensa diária sorteia cada valor de forma independente: 400–1.000 Fragmentos, 10–100 Orbes verdes, 10–50 azuis e 5–10 laranjas; Orbes vermelhas, pretas e douradas começam em zero. `/economia daily-config` permite alterar cada mínimo e máximo, e configurações diárias antigas recebem essas faixas padrão uma única vez.

As lojas usam Containers e Components V2, têm três itens por página e verificam estoque e datas de disponibilidade no servidor durante cada compra. O histórico registra compras, usos, recompensas, depósitos, saques e ações administrativas. Itens removidos do catálogo continuam nos inventários e nos registros existentes.

Subcomandos administrativos mais usados:

- `/economia fragmentos-adicionar`, `fragmentos-remover`, `fragmentos-definir` (escolha carteira ou banco).
- `/economia orbes-adicionar`, `orbes-remover`, `orbes-definir`.
- `/economia trabalho-config` e `daily-config` para recompensas e cooldowns.
- `/economia regra-criar`, `regra-editar`, `regra-excluir` para recompensas de cargos; regras podem acumular ou exigir coleta individual.
- `/economia item-criar`, `item-editar`, `item-excluir`, `item-estoque`, `item-ativar`, `item-entregar`, `item-remover`.
- `/economia transacoes` consulta o histórico com filtro de usuário e paginação.

O Discord não permite que `/loja` abra diretamente uma loja e também tenha subcomandos abaixo dela. Por isso, as duas opções são `/loja fragmentos` e `/loja orbes`. A criação de itens oferece um painel interativo para configurar preço/estoque, disponibilidade, inventário/entrega e ações seguras em etapas.

Saldo, cooldowns de `/trabalhar` e `/daily`, depósitos, saques e conversões são atualizados atomicamente em um único documento de conta e funcionam em MongoDB standalone. O registro de histórico é gravado em seguida; se essa gravação falhar, o saldo permanece correto e o bot registra o problema.

Operações que alteram vários documentos como uma única ação — por exemplo, compras com estoque e inventário e algumas coletas de recompensa — ainda usam transações e exigem MongoDB em replica set. Em standalone, essas operações falham com uma mensagem explicativa; recompensas e operações de saldo continuam disponíveis.

## Testes

Execute npm test. A suíte cobre as regras de negócio sem conectar ao Discord ou ao MongoDB.

## Deploy na Square Cloud

O workflow `.github/workflows/deploy.yml` envia o código ao app `09e5147f116d46eba2ff92ed5a583dd0` e o reinicia a cada push em `main`. Também é possível iniciar o deploy manualmente pela aba **Actions** do GitHub.

O workflow usa o secret `SQUARECLOUD_API_TOKEN` do repositório GitHub (**Settings → Secrets and variables → Actions**). Configure as variáveis do `.env` e os certificados MongoDB diretamente na Square Cloud; não coloque esses valores no workflow ou no repositório.

Para o primeiro envio, faça o deploy pelo workflow ou pelo painel da Square Cloud. O `squarecloud.app` e o script `start` já apontam para `src/index.js`.

### Erro MongoServerError

MongoDB standalone não oferece transações entre vários documentos. Se uma compra,
entrega de item ou coleta que precise alterar vários registros falhar com esse
erro, configure um replica set para essas funções. `/trabalhar`, `/daily`, banco
e conversões de Orbes não dependem dele. Adicionar `retryWrites=false` não ativa
transações. Os logs incluem mensagem e código do servidor, ocultando credenciais.
