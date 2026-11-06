# Kiryu

Bot do servidor Eternity Realms com XP, níveis, economia, inventário, lojas, comandos utilitários, gatilhos personalizados e painel administrativo.

## Requisitos

- Node.js 20.19 ou superior
- MongoDB em replica set (necessário para transações de compras e alterações de saldo/estoque)
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

Fragmentos têm saldo separado de carteira e banco. /carteira exibe os saldos e oferece atalhos para inventário, depósito e saque. Orbes são saldos independentes em seis categorias; /orbes permite converter quantidades múltiplas de 10 para a categoria seguinte depois de uma prévia e confirmação.

As lojas usam Containers e Components V2, têm três itens por página e verificam estoque e datas de disponibilidade no servidor durante cada compra. O histórico registra compras, usos, recompensas, depósitos, saques e ações administrativas. Itens removidos do catálogo continuam nos inventários e nos registros existentes.

Subcomandos administrativos mais usados:

- `/economia fragmentos-adicionar`, `fragmentos-remover`, `fragmentos-definir` (escolha carteira ou banco).
- `/economia orbes-adicionar`, `orbes-remover`, `orbes-definir`.
- `/economia trabalho-config` e `daily-config` para recompensas e cooldowns.
- `/economia regra-criar`, `regra-editar`, `regra-excluir` para recompensas de cargos; regras podem acumular ou exigir coleta individual.
- `/economia item-criar`, `item-editar`, `item-excluir`, `item-estoque`, `item-ativar`, `item-entregar`, `item-remover`.
- `/economia transacoes` consulta o histórico com filtro de usuário e paginação.

O Discord não permite que `/loja` abra diretamente uma loja e também tenha subcomandos abaixo dela. Por isso, as duas opções são `/loja fragmentos` e `/loja orbes`. A criação de itens oferece um painel interativo para configurar preço/estoque, disponibilidade, inventário/entrega e ações seguras em etapas.

As compras e operações que alteram múltiplos documentos usam transações MongoDB; a instância conectada precisa estar configurada como replica set. Se o banco atual for standalone, habilite replica set antes de usar as lojas e recompensas.

## Testes

Execute npm test. A suíte cobre as regras de negócio sem conectar ao Discord ou ao MongoDB.

## Primeiro envio manual à Square Cloud

O squarecloud.app e o script start já apontam para src/index.js. No painel da Square Cloud:

1. Cadastre a aplicação manualmente e configure as variáveis do .env nos segredos/variáveis da aplicação.
2. Envie o código com package.json, package-lock.json, src/, scripts/ e squarecloud.app.
3. Transfira os certificados para a aplicação por um canal seguro e configure os caminhos correspondentes. Não inclua .env no pacote.
4. Inicie a aplicação pelo painel e verifique os logs de conexão ao MongoDB.

O deploy automatizado por GitHub Actions ainda não está configurado.
