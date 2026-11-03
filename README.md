# Kiryu

Bot do servidor Eternity Realms com XP, níveis, comandos utilitários, gatilhos personalizados e painel administrativo.

## Requisitos

- Node.js 20.19 ou superior
- MongoDB já provisionado na Square Cloud
- Aplicação Discord com os intents Guild Members, Message Content e Guild Voice States habilitados no Developer Portal
- Certificados MongoDB locais em certs/ (a pasta não é versionada)

## Configuração local

1. Instale as dependências com npm ci.
2. Copie .env.example para .env e preencha DISCORD_TOKEN, CLIENT_ID, SERVER_ID e MONGODB_URI.
3. Coloque os três certificados recebidos em certs/, ou configure os caminhos MONGODB_*_FILE no .env.
4. Inicialize o banco e confirme a conexão com npm run db:setup.
5. Inicie o bot com npm start.

O bot usa o banco kiryu por padrão. Defina MONGODB_DB_NAME para escolher outro nome. A inicialização cria as coleções e índices necessários; novas configurações e perfis são gravados sob demanda.

O arquivo .env existente pode continuar usando o nome antigo DICORD_TOKEN; DISCORD_TOKEN é o nome recomendado para novas instalações.

## Comandos

- Slash: /level, /choose, /roll, /coinflip, /config, /addxp, /removexp, /addlevel, /removelevel
- Prefixo $: $level, $choose, $roll, $coinflip
- /config é exclusivo do proprietário 1290969388933054528. Os cargos autorizados nele configurados podem usar os comandos de gerenciamento de XP.

## Testes

Execute npm test. A suíte cobre as regras de negócio sem conectar ao Discord ou ao MongoDB.

## Deploy na Square Cloud

O workflow `.github/workflows/deploy.yml` envia o código ao app `09e5147f116d46eba2ff92ed5a583dd0` e o reinicia a cada push em `main`. Também é possível iniciar o deploy manualmente pela aba **Actions** do GitHub.

Antes do primeiro deploy automatizado, crie uma API key em [squarecloud.app/account/security](https://squarecloud.app/account/security) e salve-a no repositório GitHub como secret `SQUARECLOUD_API_KEY` (**Settings → Secrets and variables → Actions**). Configure as variáveis do `.env` e os certificados MongoDB diretamente na Square Cloud; não coloque esses valores no workflow ou no repositório.

Para o primeiro envio, faça o deploy pelo workflow ou pelo painel da Square Cloud. O `squarecloud.app` e o script `start` já apontam para `src/index.js`.
