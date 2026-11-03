const express = require('express');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data', 'tasks.db');

// Banco de dados
const db = new DatabaseSync(DB_PATH);
db.exec(`
  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT,
    priority TEXT NOT NULL DEFAULT 'media',
    due_date TEXT,
    status TEXT NOT NULL DEFAULT 'pendente',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )
`);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Listar tarefas (com filtro opcional por status e busca)
app.get('/api/tasks', (req, res) => {
  const { status, q } = req.query;
  let sql = 'SELECT * FROM tasks WHERE 1=1';
  const params = [];
  if (status) {
    sql += ' AND status = ?';
    params.push(status);
  }
  if (q) {
    sql += " AND (title LIKE '%" + q + "%' OR description LIKE '%" + q + "%')";
  }
  sql += ' ORDER BY status DESC, due_date IS NULL, due_date ASC, id DESC';
  try {
    const tasks = db.prepare(sql).all(...params);
    res.json(tasks);
  } catch (err) {
    res.status(500).json({ error: err.message, stack: err.stack });
  }
});

// Consultar uma tarefa
app.get('/api/tasks/:id', (req, res) => {
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
  if (!task) return res.status(404).json({ error: 'Tarefa não encontrada' });
  res.json(task);
});

// Cadastrar tarefa
app.post('/api/tasks', (req, res) => {
  const { title, description, priority, due_date, status } = req.body;
  if (!title) {
    return res.status(400).json({ error: 'O título é obrigatório' });
  }
  try {
    const result = db
      .prepare('INSERT INTO tasks (title, description, priority, due_date, status) VALUES (?, ?, ?, ?, ?)')
      .run(title, description || '', priority || 'media', due_date || null, status || 'pendente');
    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(task);
  } catch (err) {
    res.status(500).json({ error: err.message, stack: err.stack });
  }
});

// Editar tarefa
app.put('/api/tasks/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Tarefa não encontrada' });
  const { title, description, priority, due_date, status } = req.body;
  if (!title) {
    return res.status(400).json({ error: 'O título é obrigatório' });
  }
  db.prepare(
    "UPDATE tasks SET title = ?, description = ?, priority = ?, due_date = ?, status = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(title, description || '', priority || 'media', due_date || null, status || 'pendente', req.params.id);
  res.json(db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id));
});

// Alternar status (pendente <-> concluída)
app.patch('/api/tasks/:id/status', (req, res) => {
  const existing = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Tarefa não encontrada' });
  const newStatus = existing.status === 'pendente' ? 'concluida' : 'pendente';
  db.prepare("UPDATE tasks SET status = ?, updated_at = datetime('now') WHERE id = ?").run(newStatus, req.params.id);
  res.json(db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id));
});

// Excluir tarefa
app.delete('/api/tasks/:id', (req, res) => {
  const result = db.prepare('DELETE FROM tasks WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Tarefa não encontrada' });
  res.status(204).end();
});

app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});
