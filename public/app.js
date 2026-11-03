const API = '/api/tasks';

const form = document.getElementById('task-form');
const lista = document.getElementById('lista');
const vazio = document.getElementById('vazio');
const avisoLimite = document.getElementById('aviso-limite');
const mensagem = document.getElementById('mensagem');
const btnSalvar = document.getElementById('btn-salvar');
const btnCancelar = document.getElementById('btn-cancelar');
const formTitulo = document.getElementById('form-titulo');
const busca = document.getElementById('busca');
const filtroStatus = document.getElementById('filtro-status');

const campos = {
  id: document.getElementById('task-id'),
  title: document.getElementById('title'),
  description: document.getElementById('description'),
  priority: document.getElementById('priority'),
  due_date: document.getElementById('due_date'),
  status: document.getElementById('status'),
};

const nomesPrioridade = { baixa: 'Baixa', media: 'Média', alta: 'Alta' };

function mostrarMensagem(texto, tipo) {
  mensagem.textContent = texto;
  mensagem.className = 'mensagem ' + tipo;
  mensagem.hidden = false;
  clearTimeout(mostrarMensagem.timer);
  mostrarMensagem.timer = setTimeout(() => (mensagem.hidden = true), 4000);
}

function formatarData(iso) {
  if (!iso) return '';
  const [a, m, d] = iso.split('-');
  return `${d}/${m}/${a}`;
}

// Data local (AAAA-MM-DD). toISOString() usaria UTC e, à noite no Brasil, já seria "amanhã".
function hoje() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Validação do formulário
function validar(dados) {
  const erros = {};
  if (!dados.title.trim()) erros.title = 'Informe o título da tarefa.';
  else if (dados.title.trim().length < 3) erros.title = 'O título deve ter pelo menos 3 caracteres.';
  if (dados.due_date && !campos.id.value && dados.due_date < hoje()) {
    erros.due_date = 'O prazo não pode estar no passado.';
  }
  return erros;
}

function exibirErros(erros) {
  ['title', 'due_date'].forEach((c) => {
    document.getElementById('erro-' + c).textContent = erros[c] || '';
    campos[c].classList.toggle('invalido', !!erros[c]);
  });
}

async function carregar() {
  const params = new URLSearchParams();
  if (filtroStatus.value) params.set('status', filtroStatus.value);
  if (busca.value.trim()) params.set('q', busca.value.trim());
  try {
    const resp = await fetch(API + '?' + params);
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const tarefas = await resp.json();
    renderizar(tarefas);
    // O servidor devolve no máximo 200 tarefas; o total real vem no cabeçalho
    const total = Number(resp.headers.get('X-Total-Count')) || tarefas.length;
    avisoLimite.hidden = total <= tarefas.length;
    avisoLimite.textContent = `Mostrando ${tarefas.length} de ${total} tarefas. Use a busca ou o filtro para encontrar as demais.`;
  } catch (e) {
    mostrarMensagem('Não foi possível carregar as tarefas.', 'falha');
  }
}

function criar(tag, classe, texto) {
  const el = document.createElement(tag);
  if (classe) el.className = classe;
  if (texto !== undefined) el.textContent = texto;
  return el;
}

function botao(texto, acao, id, extra) {
  const b = criar('button', 'btn pequeno' + (extra ? ' ' + extra : ''), texto);
  b.type = 'button';
  b.dataset.acao = acao;
  b.dataset.id = id;
  return b;
}

// Monta a lista com textContent: o conteúdo digitado pelo usuário nunca é interpretado como HTML.
function renderizar(tarefas) {
  vazio.hidden = tarefas.length > 0;
  lista.replaceChildren(
    ...tarefas.map((t) => {
      const atrasada = t.status === 'pendente' && t.due_date && t.due_date < hoje();
      const li = criar('li', 'tarefa');
      li.classList.add(t.priority, t.status);

      const info = criar('div');
      info.append(criar('p', 'tarefa-titulo', t.title));
      if (t.description) info.append(criar('p', 'tarefa-desc', t.description));
      const meta = criar('div', 'tarefa-meta');
      meta.append(criar('span', 'selo', 'Prioridade: ' + (nomesPrioridade[t.priority] || t.priority)));
      if (t.due_date) {
        meta.append(
          criar('span', 'selo' + (atrasada ? ' atrasada' : ''), 'Prazo: ' + formatarData(t.due_date) + (atrasada ? ' (atrasada)' : ''))
        );
      }
      meta.append(criar('span', 'selo', t.status === 'concluida' ? 'Concluída' : 'Pendente'));
      info.append(meta);

      const acoes = criar('div', 'tarefa-acoes');
      acoes.append(
        botao(t.status === 'pendente' ? 'Concluir' : 'Reabrir', t.status === 'pendente' ? 'concluir' : 'reabrir', t.id),
        botao('Editar', 'editar', t.id),
        botao('Excluir', 'excluir', t.id, 'perigo')
      );
      li.append(info, acoes);
      return li;
    })
  );
}

lista.addEventListener('click', (e) => {
  const b = e.target.closest('button[data-acao]');
  if (!b) return;
  const id = Number(b.dataset.id);
  if (b.dataset.acao === 'editar') editar(id);
  else if (b.dataset.acao === 'excluir') excluir(id);
  else alterarStatus(id, b.dataset.acao === 'concluir' ? 'concluida' : 'pendente');
});

function limparFormulario() {
  form.reset();
  campos.id.value = '';
  formTitulo.textContent = 'Nova tarefa';
  btnSalvar.textContent = 'Cadastrar';
  btnCancelar.hidden = true;
  exibirErros({});
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const dados = {
    title: campos.title.value,
    description: campos.description.value,
    priority: campos.priority.value,
    due_date: campos.due_date.value,
    status: campos.status.value,
  };
  const erros = validar(dados);
  exibirErros(erros);
  if (Object.keys(erros).length) return;

  const id = campos.id.value;
  btnSalvar.disabled = true;
  try {
    const resp = await fetch(id ? `${API}/${id}` : API, {
      method: id ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dados),
    });
    const corpo = await resp.json();
    if (!resp.ok) {
      if (corpo.fields) exibirErros(corpo.fields);
      mostrarMensagem(corpo.error || 'Erro ao salvar a tarefa.', 'falha');
      return;
    }
    mostrarMensagem(id ? 'Tarefa atualizada com sucesso!' : 'Tarefa cadastrada com sucesso!', 'sucesso');
    limparFormulario();
    carregar();
  } catch (err) {
    mostrarMensagem('Erro de conexão com o servidor.', 'falha');
  } finally {
    btnSalvar.disabled = false;
  }
});

btnCancelar.addEventListener('click', limparFormulario);

async function editar(id) {
  const resp = await fetch(`${API}/${id}`);
  if (!resp.ok) return mostrarMensagem('Tarefa não encontrada.', 'falha');
  const t = await resp.json();
  campos.id.value = t.id;
  campos.title.value = t.title;
  campos.description.value = t.description || '';
  campos.priority.value = t.priority;
  campos.due_date.value = t.due_date || '';
  campos.status.value = t.status;
  formTitulo.textContent = 'Editar tarefa';
  btnSalvar.textContent = 'Salvar alterações';
  btnCancelar.hidden = false;
  exibirErros({});
  form.scrollIntoView({ behavior: 'smooth' });
}

async function alterarStatus(id, status) {
  const resp = await fetch(`${API}/${id}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  });
  if (!resp.ok) return mostrarMensagem('Não foi possível alterar o status.', 'falha');
  const t = await resp.json();
  mostrarMensagem(t.status === 'concluida' ? 'Tarefa concluída!' : 'Tarefa reaberta.', 'sucesso');
  carregar();
}

async function excluir(id) {
  if (!confirm('Deseja realmente excluir esta tarefa?')) return;
  const resp = await fetch(`${API}/${id}`, { method: 'DELETE' });
  if (!resp.ok) return mostrarMensagem('Não foi possível excluir a tarefa.', 'falha');
  mostrarMensagem('Tarefa excluída com sucesso!', 'sucesso');
  if (campos.id.value == id) limparFormulario();
  carregar();
}

let timerBusca;
busca.addEventListener('input', () => {
  clearTimeout(timerBusca);
  timerBusca = setTimeout(carregar, 300);
});
filtroStatus.addEventListener('change', carregar);

carregar();
