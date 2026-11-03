const app = require('./src/app');
const db = require('./src/db');
const { PORT } = require('./src/config');

// Só abre a porta quando executado diretamente (node server.js); nos testes o app é importado.
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Servidor rodando em http://localhost:${PORT}`);
  });
}

module.exports = app;
module.exports.db = db;
