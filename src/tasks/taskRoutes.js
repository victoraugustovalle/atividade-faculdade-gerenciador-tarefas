// Camada HTTP das tarefas: recebe a requisição, valida e chama o repositório.
const express = require('express');
const repo = require('./taskRepository');
const { STATUS, TITULO_MAX, validarTarefa, idValido } = require('./taskValidation');

const router = express.Router();

// Rejeita IDs que não são inteiros positivos antes de consultar o banco
router.param('id', (req, res, next, id) => {
  if (!idValido(id)) return res.status(400).json({ error: 'ID inválido.' });
  next();
});

// Listar tarefas (com filtro opcional por status e busca). O total real vai no cabeçalho X-Total-Count.
router.get('/', (req, res) => {
  const { status, q } = req.query;
  if (status && !STATUS.includes(status)) return res.status(400).json({ error: 'Status inválido.' });
  if (q && (typeof q !== 'string' || q.length > TITULO_MAX)) return res.status(400).json({ error: 'Busca inválida.' });
  const { tarefas, total } = repo.listar({ status, q });
  res.set('X-Total-Count', String(total));
  res.json(tarefas);
});

// Consultar uma tarefa
router.get('/:id', (req, res) => {
  const task = repo.buscarPorId(req.params.id);
  if (!task) return res.status(404).json({ error: 'Tarefa não encontrada.' });
  res.json(task);
});

// Cadastrar tarefa
router.post('/', (req, res) => {
  const { dados, erros } = validarTarefa(req.body, { criando: true });
  if (erros) return res.status(400).json({ error: Object.values(erros)[0], fields: erros });
  res.status(201).json(repo.criar(dados));
});

// Editar tarefa
router.put('/:id', (req, res) => {
  if (!repo.buscarPorId(req.params.id)) return res.status(404).json({ error: 'Tarefa não encontrada.' });
  const { dados, erros } = validarTarefa(req.body, { criando: false });
  if (erros) return res.status(400).json({ error: Object.values(erros)[0], fields: erros });
  res.json(repo.atualizar(req.params.id, dados));
});

// Definir status (idempotente: o cliente informa o status desejado)
router.patch('/:id/status', (req, res) => {
  const status = req.body && req.body.status;
  if (!STATUS.includes(status)) {
    return res.status(400).json({ error: 'Status inválido. Use pendente ou concluida.' });
  }
  const task = repo.definirStatus(req.params.id, status);
  if (!task) return res.status(404).json({ error: 'Tarefa não encontrada.' });
  res.json(task);
});

// Excluir tarefa
router.delete('/:id', (req, res) => {
  if (!repo.excluir(req.params.id)) return res.status(404).json({ error: 'Tarefa não encontrada.' });
  res.status(204).end();
});

module.exports = router;
