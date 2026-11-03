// Acesso a dados das tarefas: único lugar do projeto que escreve SQL.
const db = require('../db');

function buscarPorId(id) {
  return db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
}

// Máximo de tarefas devolvidas por listagem, para a resposta não crescer sem limite
const LISTAGEM_MAX = 200;

// Retorna { tarefas, total }: no máximo LISTAGEM_MAX tarefas e o total que atende ao filtro
function listar({ status, q } = {}) {
  let where = ' WHERE 1=1';
  const params = [];
  if (status) {
    where += ' AND status = ?';
    params.push(status);
  }
  if (q) {
    // Parâmetros + ESCAPE: o termo é sempre tratado como texto (sem SQL Injection, % e _ literais)
    const termo = '%' + q.replace(/[\\%_]/g, '\\$&') + '%';
    where += " AND (title LIKE ? ESCAPE '\\' OR description LIKE ? ESCAPE '\\')";
    params.push(termo, termo);
  }
  const tarefas = db
    .prepare('SELECT * FROM tasks' + where + ' ORDER BY status DESC, due_date IS NULL, due_date ASC, id DESC LIMIT ?')
    .all(...params, LISTAGEM_MAX);
  const { total } = db.prepare('SELECT COUNT(*) AS total FROM tasks' + where).get(...params);
  return { tarefas, total };
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

module.exports = { LISTAGEM_MAX, buscarPorId, listar, criar, atualizar, definirStatus, excluir };
