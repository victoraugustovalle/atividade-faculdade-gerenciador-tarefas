const express = require('express');
const path = require('path');
const { PORT } = require('./src/config');
const db = require('./src/db');
const repo = require('./src/tasks/taskRepository');
const { STATUS, TITULO_MAX, validarTarefa, idValido } = require('./src/tasks/taskValidation');

const app = express();

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
  if (status && !STATUS.includes(status)) return res.status(400).json({ error: 'Status inválido.' });
  if (q && (typeof q !== 'string' || q.length > TITULO_MAX)) return res.status(400).json({ error: 'Busca inválida.' });
  res.json(repo.listar({ status, q }));
});

// Consultar uma tarefa
app.get('/api/tasks/:id', (req, res) => {
  const task = repo.buscarPorId(req.params.id);
  if (!task) return res.status(404).json({ error: 'Tarefa não encontrada.' });
  res.json(task);
});

// Cadastrar tarefa
app.post('/api/tasks', (req, res) => {
  const { dados, erros } = validarTarefa(req.body, { criando: true });
  if (erros) return res.status(400).json({ error: Object.values(erros)[0], fields: erros });
  res.status(201).json(repo.criar(dados));
});

// Editar tarefa
app.put('/api/tasks/:id', (req, res) => {
  if (!repo.buscarPorId(req.params.id)) return res.status(404).json({ error: 'Tarefa não encontrada.' });
  const { dados, erros } = validarTarefa(req.body, { criando: false });
  if (erros) return res.status(400).json({ error: Object.values(erros)[0], fields: erros });
  res.json(repo.atualizar(req.params.id, dados));
});

// Definir status (idempotente: o cliente informa o status desejado)
app.patch('/api/tasks/:id/status', (req, res) => {
  const status = req.body && req.body.status;
  if (!STATUS.includes(status)) {
    return res.status(400).json({ error: 'Status inválido. Use pendente ou concluida.' });
  }
  const task = repo.definirStatus(req.params.id, status);
  if (!task) return res.status(404).json({ error: 'Tarefa não encontrada.' });
  res.json(task);
});

// Excluir tarefa
app.delete('/api/tasks/:id', (req, res) => {
  if (!repo.excluir(req.params.id)) return res.status(404).json({ error: 'Tarefa não encontrada.' });
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
