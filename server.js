const express = require('express');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data', 'tasks.db');
const TIMEZONE = process.env.APP_TIMEZONE || 'America/Sao_Paulo';

const PRIORIDADES = ['baixa', 'media', 'alta'];
const STATUS = ['pendente', 'concluida'];
const TITULO_MIN = 3;
const TITULO_MAX = 100;
const DESCRICAO_MAX = 500;

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

// Data de hoje (AAAA-MM-DD) no fuso do usuário, e não em UTC
function hoje() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE }).format(new Date());
}

function dataValida(valor) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false;
  const d = new Date(valor + 'T00:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === valor;
}

// Valida e normaliza os dados de uma tarefa. Retorna { dados } ou { erros }.
function validarTarefa(body, { criando }) {
  const erros = {};
  const entrada = body && typeof body === 'object' ? body : {};
  const { title, description, priority, due_date, status } = entrada;

  if (typeof title !== 'string' || !title.trim()) {
    erros.title = 'O título é obrigatório.';
  } else if (title.trim().length < TITULO_MIN) {
    erros.title = `O título deve ter pelo menos ${TITULO_MIN} caracteres.`;
  } else if (title.trim().length > TITULO_MAX) {
    erros.title = `O título deve ter no máximo ${TITULO_MAX} caracteres.`;
  }

  if (description !== undefined && description !== null && typeof description !== 'string') {
    erros.description = 'A descrição deve ser um texto.';
  } else if (description && description.length > DESCRICAO_MAX) {
    erros.description = `A descrição deve ter no máximo ${DESCRICAO_MAX} caracteres.`;
  }

  if (priority !== undefined && !PRIORIDADES.includes(priority)) {
    erros.priority = 'Prioridade inválida. Use baixa, media ou alta.';
  }

  if (status !== undefined && !STATUS.includes(status)) {
    erros.status = 'Status inválido. Use pendente ou concluida.';
  }

  if (due_date !== undefined && due_date !== null && due_date !== '') {
    if (typeof due_date !== 'string' || !dataValida(due_date)) {
      erros.due_date = 'Prazo inválido. Use o formato AAAA-MM-DD.';
    } else if (criando && due_date < hoje()) {
      erros.due_date = 'O prazo não pode estar no passado.';
    }
  }

  if (Object.keys(erros).length) return { erros };
  return {
    dados: {
      title: title.trim(),
      description: (description || '').trim(),
      priority: priority || 'media',
      due_date: due_date || null,
      status: status || 'pendente',
    },
  };
}

function idValido(valor) {
  return /^[1-9]\d*$/.test(valor);
}

app.disable('x-powered-by');
app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
  });
  next();
});
app.use(express.json({ limit: '10kb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Rejeita IDs que não são inteiros positivos antes de consultar o banco
app.param('id', (req, res, next, id) => {
  if (!idValido(id)) return res.status(400).json({ error: 'ID inválido.' });
  next();
});

// Listar tarefas (com filtro opcional por status e busca)
app.get('/api/tasks', (req, res) => {
  const { status, q } = req.query;
  let sql = 'SELECT * FROM tasks WHERE 1=1';
  const params = [];
  if (status) {
    if (!STATUS.includes(status)) return res.status(400).json({ error: 'Status inválido.' });
    sql += ' AND status = ?';
    params.push(status);
  }
  if (q) {
    if (typeof q !== 'string' || q.length > TITULO_MAX) return res.status(400).json({ error: 'Busca inválida.' });
    const termo = '%' + q.replace(/[\\%_]/g, '\\$&') + '%';
    sql += " AND (title LIKE ? ESCAPE '\\' OR description LIKE ? ESCAPE '\\')";
    params.push(termo, termo);
  }
  sql += ' ORDER BY status DESC, due_date IS NULL, due_date ASC, id DESC';
  res.json(db.prepare(sql).all(...params));
});

// Consultar uma tarefa
app.get('/api/tasks/:id', (req, res) => {
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
  if (!task) return res.status(404).json({ error: 'Tarefa não encontrada.' });
  res.json(task);
});

// Cadastrar tarefa
app.post('/api/tasks', (req, res) => {
  const { dados, erros } = validarTarefa(req.body, { criando: true });
  if (erros) return res.status(400).json({ error: Object.values(erros)[0], fields: erros });
  const result = db
    .prepare('INSERT INTO tasks (title, description, priority, due_date, status) VALUES (?, ?, ?, ?, ?)')
    .run(dados.title, dados.description, dados.priority, dados.due_date, dados.status);
  res.status(201).json(db.prepare('SELECT * FROM tasks WHERE id = ?').get(result.lastInsertRowid));
});

// Editar tarefa
app.put('/api/tasks/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Tarefa não encontrada.' });
  const { dados, erros } = validarTarefa(req.body, { criando: false });
  if (erros) return res.status(400).json({ error: Object.values(erros)[0], fields: erros });
  db.prepare(
    "UPDATE tasks SET title = ?, description = ?, priority = ?, due_date = ?, status = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(dados.title, dados.description, dados.priority, dados.due_date, dados.status, req.params.id);
  res.json(db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id));
});

// Definir status (idempotente: o cliente informa o status desejado)
app.patch('/api/tasks/:id/status', (req, res) => {
  const status = req.body && req.body.status;
  if (!STATUS.includes(status)) {
    return res.status(400).json({ error: 'Status inválido. Use pendente ou concluida.' });
  }
  const result = db
    .prepare("UPDATE tasks SET status = ?, updated_at = datetime('now') WHERE id = ?")
    .run(status, req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Tarefa não encontrada.' });
  res.json(db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id));
});

// Excluir tarefa
app.delete('/api/tasks/:id', (req, res) => {
  const result = db.prepare('DELETE FROM tasks WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Tarefa não encontrada.' });
  res.status(204).end();
});

// Rotas de API inexistentes
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Rota não encontrada.' });
});

// Tratamento central de erros: nunca devolve stack ou detalhes internos ao cliente
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'JSON inválido no corpo da requisição.' });
  }
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Requisição muito grande.' });
  }
  console.error(err);
  res.status(500).json({ error: 'Erro interno do servidor.' });
});

// Só abre a porta quando executado diretamente (node server.js); nos testes o app é importado.
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Servidor rodando em http://localhost:${PORT}`);
  });
}

module.exports = app;
module.exports.db = db;
