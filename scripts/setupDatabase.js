const { connectDatabase, initializeDatabase, closeDatabase } = require('../src/database');
const logger = require('../src/logger');

async function setup() {
  try {
    await connectDatabase();
    await initializeDatabase();
    logger.info('Verificação de conexão e inicialização do banco concluídas.');
  } catch {
    process.exitCode = 1;
  } finally {
    await closeDatabase().catch(() => {});
  }
}

setup();
