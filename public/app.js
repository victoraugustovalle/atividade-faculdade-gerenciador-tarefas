const API = '/api/tasks';

const form = document.getElementById('task-form');
const lista = document.getElementById('lista');
const vazio = document.getElementById('vazio');
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

function hoje() {
  return new Date().toISOString().slice(0, 10);
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
    const tarefas = await resp.json();
    renderizar(tarefas);
  } catch (e) {
    mostrarMensagem('Não foi possível carregar as tarefas.', 'falha');
  }
}

function renderizar(tarefas) {
  vazio.hidden = tarefas.length > 0;
  lista.innerHTML = tarefas
    .map((t) => {
      const atrasada = t.status === 'pendente' && t.due_date && t.due_date < hoje();
      return `
      <li class="tarefa ${t.priority} ${t.status}">
        <div>
          <p class="tarefa-titulo">${t.title}</p>
          ${t.description ? `<p class="tarefa-desc">${t.description}</p>` : ''}
          <div class="tarefa-meta">
            <span class="selo">Prioridade: ${nomesPrioridade[t.priority] || t.priority}</span>
            ${t.due_date ? `<span class="selo ${atrasada ? 'atrasada' : ''}">Prazo: ${formatarData(t.due_date)}${atrasada ? ' (atrasada)' : ''}</span>` : ''}
            <span class="selo">${t.status === 'concluida' ? 'Concluída' : 'Pendente'}</span>
          </div>
        </div>
        <div class="tarefa-acoes">
          <button class="btn pequeno" onclick="alternarStatus(${t.id})">${t.status === 'pendente' ? 'Concluir' : 'Reabrir'}</button>
          <button class="btn pequeno" onclick="editar(${t.id})">Editar</button>
          <button class="btn pequeno perigo" onclick="excluir(${t.id})">Excluir</button>
        </div>
      </li>`;
    })
    .join('');
}

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

async function alternarStatus(id) {
  const resp = await fetch(`${API}/${id}/status`, { method: 'PATCH' });
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
