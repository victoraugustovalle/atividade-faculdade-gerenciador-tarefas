const { TIMEZONE } = require('../config');

const PRIORIDADES = ['baixa', 'media', 'alta'];
const STATUS = ['pendente', 'concluida'];
const TITULO_MIN = 3;
const TITULO_MAX = 100;
const DESCRICAO_MAX = 500;

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

module.exports = { PRIORIDADES, STATUS, TITULO_MIN, TITULO_MAX, DESCRICAO_MAX, hoje, dataValida, validarTarefa, idValido };
