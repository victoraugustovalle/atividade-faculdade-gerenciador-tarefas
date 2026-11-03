// Acesso a dados das tarefas: único lugar do projeto que escreve SQL.
const db = require('../db');

function buscarPorId(id) {
  return db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
}

function listar({ status, q } = {}) {
  let sql = 'SELECT * FROM tasks WHERE 1=1';
  const params = [];
  if (status) {
    sql += ' AND status = ?';
    params.push(status);
  }
  if (q) {
    // Parâmetros + ESCAPE: o termo é sempre tratado como texto (sem SQL Injection, % e _ literais)
    const termo = '%' + q.replace(/[\\%_]/g, '\\$&') + '%';
    sql += " AND (title LIKE ? ESCAPE '\\' OR description LIKE ? ESCAPE '\\')";
    params.push(termo, termo);
  }
  sql += ' ORDER BY status DESC, due_date IS NULL, due_date ASC, id DESC';
  return db.prepare(sql).all(...params);
}

function criar(dados) {
  const result = db
    .prepare('INSERT INTO tasks (title, description, priority, due_date, status) VALUES (?, ?, ?, ?, ?)')
    .run(dados.title, dados.description, dados.priority, dados.due_date, dados.status);
  return buscarPorId(result.lastInsertRowid);
}

function atualizar(id, dados) {
  db.prepare(
    "UPDATE tasks SET title = ?, description = ?, priority = ?, due_date = ?, status = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(dados.title, dados.description, dados.priority, dados.due_date, dados.status, id);
  return buscarPorId(id);
}

// Retorna a tarefa atualizada ou undefined se o ID não existir
function definirStatus(id, status) {
  const result = db.prepare("UPDATE tasks SET status = ?, updated_at = datetime('now') WHERE id = ?").run(status, id);
  return result.changes === 0 ? undefined : buscarPorId(id);
}

// Retorna true se removeu
function excluir(id) {
  return db.prepare('DELETE FROM tasks WHERE id = ?').run(id).changes > 0;
}

module.exports = { buscarPorId, listar, criar, atualizar, definirStatus, excluir };
