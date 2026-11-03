const { DatabaseSync } = require('node:sqlite');
const { DB_PATH } = require('./config');
const { TITULO_MIN, TITULO_MAX, DESCRICAO_MAX } = require('./tasks/taskValidation');

// Banco de dados (CHECK garante as regras mesmo se alguém gravar sem passar pela API)
const db = new DatabaseSync(DB_PATH);
db.exec(`
  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL CHECK (length(trim(title)) BETWEEN ${TITULO_MIN} AND ${TITULO_MAX}),
    description TEXT NOT NULL DEFAULT '' CHECK (length(description) <= ${DESCRICAO_MAX}),
    priority TEXT NOT NULL DEFAULT 'media' CHECK (priority IN ('baixa', 'media', 'alta')),
    due_date TEXT CHECK (due_date IS NULL OR date(due_date) = due_date),
    status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'concluida')),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )
`);

module.exports = db;
