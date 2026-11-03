const path = require('path');

module.exports = {
  PORT: process.env.PORT || 3000,
  DB_PATH: process.env.DB_PATH || path.join(__dirname, '..', 'data', 'tasks.db'),
  TIMEZONE: process.env.APP_TIMEZONE || 'America/Sao_Paulo',
  // Máximo de escritas (POST, PUT, PATCH, DELETE) por IP a cada minuto
  LIMITE_ESCRITAS_POR_MINUTO: Number(process.env.LIMITE_ESCRITAS_POR_MINUTO) || 60,
};
