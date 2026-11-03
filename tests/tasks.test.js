// Testes de integração (estilo request spec): cada teste chama a rota HTTP de verdade,
// com um banco SQLite de verdade, porém em memória e separado do banco de produção.
// Nada é mockado: banco, validações e regras de negócio rodam como em produção.
process.env.DB_PATH = ':memory:';
process.env.APP_TIMEZONE = 'America/Sao_Paulo';

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const app = require('../server');

// Trava de segurança: aborta se, por qualquer motivo, o banco não for o de teste.
assert.equal(app.db.location(), null, 'Os testes devem usar banco em memória, nunca o de produção');

const api = () => request(app);
const hojeSP = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
const tarefaValida = (extra = {}) => ({ title: 'Estudar Git', description: 'Capítulo 3', priority: 'alta', due_date: '2099-12-31', ...extra });
const criar = (extra) => api().post('/api/tasks').send(tarefaValida(extra));

beforeEach(() => {
  app.db.exec("DELETE FROM tasks; DELETE FROM sqlite_sequence WHERE name = 'tasks';");
});

describe('Cadastro de tarefa (POST /api/tasks)', () => {
  it('quando os dados são válidos, então cria a tarefa como pendente e devolve 201', async () => {
    const res = await criar();
    assert.equal(res.status, 201);
    assert.equal(res.body.id, 1);
    assert.equal(res.body.title, 'Estudar Git');
    assert.equal(res.body.priority, 'alta');
    assert.equal(res.body.status, 'pendente');
    const noBanco = app.db.prepare('SELECT * FROM tasks WHERE id = 1').get();
    assert.equal(noBanco.title, 'Estudar Git');
  });

  it('quando só o título é enviado, então usa prioridade média, status pendente e sem prazo', async () => {
    const res = await api().post('/api/tasks').send({ title: 'Ler livro' });
    assert.equal(res.status, 201);
    assert.equal(res.body.priority, 'media');
    assert.equal(res.body.status, 'pendente');
    assert.equal(res.body.due_date, null);
  });

  it('quando o título tem espaços nas pontas, então grava o título sem eles', async () => {
    const res = await criar({ title: '   Comprar pão   ' });
    assert.equal(res.body.title, 'Comprar pão');
  });

  it('quando o título está ausente, então devolve 400 com mensagem e não grava', async () => {
    const res = await api().post('/api/tasks').send({ priority: 'alta' });
    assert.equal(res.status, 400);
    assert.match(res.body.error, /título é obrigatório/);
    assert.ok(res.body.fields.title);
    assert.equal(app.db.prepare('SELECT COUNT(*) AS n FROM tasks').get().n, 0);
  });

  it('quando o título tem só espaços, então devolve 400', async () => {
    const res = await criar({ title: '     ' });
    assert.equal(res.status, 400);
  });

  it('quando o título tem menos de 3 caracteres, então devolve 400', async () => {
    const res = await criar({ title: 'ab' });
    assert.equal(res.status, 400);
    assert.match(res.body.fields.title, /pelo menos 3/);
  });

  it('quando o título tem exatamente 3 e 100 caracteres, então aceita (limites)', async () => {
    assert.equal((await criar({ title: 'abc' })).status, 201);
    assert.equal((await criar({ title: 'x'.repeat(100) })).status, 201);
  });

  it('quando o título passa de 100 caracteres, então devolve 400', async () => {
    const res = await criar({ title: 'x'.repeat(101) });
    assert.equal(res.status, 400);
    assert.match(res.body.fields.title, /no máximo 100/);
  });

  it('quando o título não é texto (número ou objeto), então devolve 400 e não erro 500', async () => {
    assert.equal((await criar({ title: 12345 })).status, 400);
    assert.equal((await criar({ title: { x: 1 } })).status, 400);
  });

  it('quando a descrição passa de 500 caracteres, então devolve 400', async () => {
    const res = await criar({ description: 'd'.repeat(501) });
    assert.equal(res.status, 400);
    assert.ok(res.body.fields.description);
  });

  it('quando a prioridade não é baixa/media/alta, então devolve 400', async () => {
    const res = await criar({ priority: 'urgentissima' });
    assert.equal(res.status, 400);
    assert.ok(res.body.fields.priority);
  });

  it('quando o status não é pendente/concluida, então devolve 400', async () => {
    const res = await criar({ status: 'hackeado' });
    assert.equal(res.status, 400);
    assert.ok(res.body.fields.status);
  });

  it('quando o prazo não está no formato AAAA-MM-DD ou não existe, então devolve 400', async () => {
    assert.equal((await criar({ due_date: 'ontem' })).status, 400);
    assert.equal((await criar({ due_date: '2026-02-30' })).status, 400);
    assert.equal((await criar({ due_date: '31/12/2099' })).status, 400);
  });

  it('quando o prazo está no passado, então devolve 400', async () => {
    const res = await criar({ due_date: '2000-01-01' });
    assert.equal(res.status, 400);
    assert.match(res.body.fields.due_date, /passado/);
  });

  it('quando o prazo é hoje, então aceita (limite)', async () => {
    const res = await criar({ due_date: hojeSP() });
    assert.equal(res.status, 201);
  });

  it('quando são 21h30 no Brasil (já é o dia seguinte em UTC) e o prazo é hoje, então aceita', async (t) => {
    // 2026-11-03T00:30Z = 2026-11-02 21:30 em São Paulo. Regressão do bug de UTC.
    t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-11-03T00:30:00Z') });
    const res = await criar({ due_date: '2026-11-02' });
    assert.equal(res.status, 201);
  });

  it('quando o corpo é um JSON malformado, então devolve 400 em JSON, sem stack', async () => {
    const res = await api().post('/api/tasks').set('Content-Type', 'application/json').send('{x');
    assert.equal(res.status, 400);
    assert.equal(res.body.error, 'JSON inválido no corpo da requisição.');
    assert.ok(!JSON.stringify(res.body).includes('stack'));
  });

  it('quando o corpo passa de 10kb, então devolve 413', async () => {
    const res = await criar({ description: 'x'.repeat(20000) });
    assert.equal(res.status, 413);
  });

  it('quando o título contém HTML, então grava como texto puro (a tela exibe com textContent)', async () => {
    const res = await criar({ title: '<img src=x onerror=alert(1)>' });
    assert.equal(res.status, 201);
    assert.equal(res.body.title, '<img src=x onerror=alert(1)>');
  });

  it('quando o mesmo cadastro é enviado 2 vezes ao mesmo tempo, então ambos são criados com IDs distintos', async () => {
    // Comportamento aceito e documentado na AUDITORIA (duplicar tarefa é inofensivo).
    const [a, b] = await Promise.all([criar(), criar()]);
    assert.equal(a.status, 201);
    assert.equal(b.status, 201);
    assert.notEqual(a.body.id, b.body.id);
  });
});

describe('Listagem e pesquisa (GET /api/tasks)', () => {
  it('quando não há tarefas, então devolve lista vazia', async () => {
    const res = await api().get('/api/tasks');
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, []);
  });

  it('quando há tarefas, então lista pendentes antes das concluídas e por prazo mais próximo', async () => {
    await criar({ title: 'Prazo longe', due_date: '2099-12-31' });
    await criar({ title: 'Prazo perto', due_date: '2099-01-01' });
    await criar({ title: 'Já feita', status: 'concluida' });
    const res = await api().get('/api/tasks');
    assert.deepEqual(res.body.map((t) => t.title), ['Prazo perto', 'Prazo longe', 'Já feita']);
  });

  it('quando filtra por status, então devolve só as tarefas daquele status', async () => {
    await criar({ title: 'Aberta' });
    await criar({ title: 'Fechada', status: 'concluida' });
    const res = await api().get('/api/tasks?status=concluida');
    assert.deepEqual(res.body.map((t) => t.title), ['Fechada']);
  });

  it('quando o filtro de status é inválido, então devolve 400', async () => {
    const res = await api().get('/api/tasks?status=qualquer');
    assert.equal(res.status, 400);
  });

  it('quando pesquisa um termo, então encontra no título ou na descrição', async () => {
    await criar({ title: 'Estudar Git', description: '' });
    await criar({ title: 'Mercado', description: 'comprar café' });
    await criar({ title: 'Academia', description: '' });
    assert.deepEqual((await api().get('/api/tasks?q=git')).body.map((t) => t.title), ['Estudar Git']);
    assert.deepEqual((await api().get('/api/tasks?q=café')).body.map((t) => t.title), ['Mercado']);
  });

  it('quando a busca contém injeção de SQL, então trata como texto e não devolve tudo', async () => {
    await criar({ title: 'Tarefa secreta' });
    const res = await api().get('/api/tasks').query({ q: "x') OR 1=1 --" });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, []);
  });

  it('quando a busca contém % ou _, então trata como caractere literal', async () => {
    await criar({ title: 'Meta 100% concluída' });
    await criar({ title: 'Outra tarefa' });
    assert.equal((await api().get('/api/tasks').query({ q: '%' })).body.length, 1);
    assert.equal((await api().get('/api/tasks').query({ q: '_' })).body.length, 0);
  });
});

describe('Consulta de uma tarefa (GET /api/tasks/:id)', () => {
  it('quando o ID existe, então devolve a tarefa', async () => {
    await criar();
    const res = await api().get('/api/tasks/1');
    assert.equal(res.status, 200);
    assert.equal(res.body.title, 'Estudar Git');
  });

  it('quando o ID não existe, então devolve 404', async () => {
    const res = await api().get('/api/tasks/999');
    assert.equal(res.status, 404);
    assert.match(res.body.error, /não encontrada/);
  });

  it('quando o ID não é inteiro positivo, então devolve 400', async () => {
    for (const id of ['abc', '0', '-1', '1.5']) {
      assert.equal((await api().get('/api/tasks/' + id)).status, 400, 'id ' + id);
    }
  });
});

describe('Edição de tarefa (PUT /api/tasks/:id)', () => {
  it('quando os dados são válidos, então atualiza e devolve a tarefa', async () => {
    await criar();
    const res = await api().put('/api/tasks/1').send(tarefaValida({ title: 'Estudar GitHub', priority: 'baixa' }));
    assert.equal(res.status, 200);
    assert.equal(res.body.title, 'Estudar GitHub');
    assert.equal(res.body.priority, 'baixa');
    assert.equal(app.db.prepare('SELECT title FROM tasks WHERE id = 1').get().title, 'Estudar GitHub');
  });

  it('quando a tarefa já tem prazo no passado, então a edição mantém o prazo (regra só vale no cadastro)', async () => {
    await criar();
    app.db.prepare("UPDATE tasks SET due_date = '2020-01-01' WHERE id = 1").run();
    const res = await api().put('/api/tasks/1').send(tarefaValida({ due_date: '2020-01-01' }));
    assert.equal(res.status, 200);
  });

  it('quando os dados são inválidos, então devolve 400 e não altera o banco', async () => {
    await criar();
    const res = await api().put('/api/tasks/1').send(tarefaValida({ title: '', priority: 'xyz' }));
    assert.equal(res.status, 400);
    assert.equal(app.db.prepare('SELECT title FROM tasks WHERE id = 1').get().title, 'Estudar Git');
  });

  it('quando o ID não existe, então devolve 404', async () => {
    const res = await api().put('/api/tasks/999').send(tarefaValida());
    assert.equal(res.status, 404);
  });
});

describe('Alteração de status (PATCH /api/tasks/:id/status)', () => {
  it('quando marca como concluída, então grava o status', async () => {
    await criar();
    const res = await api().patch('/api/tasks/1/status').send({ status: 'concluida' });
    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'concluida');
  });

  it('quando reabre uma tarefa concluída, então volta a pendente', async () => {
    await criar({ status: 'concluida' });
    const res = await api().patch('/api/tasks/1/status').send({ status: 'pendente' });
    assert.equal(res.body.status, 'pendente');
  });

  it('quando o usuário clica 2 vezes em "Concluir" ao mesmo tempo, então a tarefa termina concluída', async () => {
    await criar();
    const respostas = await Promise.all([
      api().patch('/api/tasks/1/status').send({ status: 'concluida' }),
      api().patch('/api/tasks/1/status').send({ status: 'concluida' }),
    ]);
    respostas.forEach((r) => assert.equal(r.status, 200));
    assert.equal(app.db.prepare('SELECT status FROM tasks WHERE id = 1').get().status, 'concluida');
  });

  it('quando o status é inválido ou não é informado, então devolve 400', async () => {
    await criar();
    assert.equal((await api().patch('/api/tasks/1/status').send({ status: 'feito' })).status, 400);
    assert.equal((await api().patch('/api/tasks/1/status').send({})).status, 400);
  });

  it('quando o ID não existe, então devolve 404', async () => {
    const res = await api().patch('/api/tasks/999/status').send({ status: 'concluida' });
    assert.equal(res.status, 404);
  });
});

describe('Exclusão de tarefa (DELETE /api/tasks/:id)', () => {
  it('quando o ID existe, então remove e devolve 204', async () => {
    await criar();
    const res = await api().delete('/api/tasks/1');
    assert.equal(res.status, 204);
    assert.equal((await api().get('/api/tasks/1')).status, 404);
  });

  it('quando a mesma exclusão é enviada 2 vezes ao mesmo tempo, então uma remove (204) e a outra recebe 404', async () => {
    await criar();
    const status = (await Promise.all([api().delete('/api/tasks/1'), api().delete('/api/tasks/1')])).map((r) => r.status).sort();
    assert.deepEqual(status, [204, 404]);
  });

  it('quando o ID não existe, então devolve 404', async () => {
    assert.equal((await api().delete('/api/tasks/999')).status, 404);
  });
});

describe('Segurança da aplicação', () => {
  it('quando a página é servida, então envia cabeçalhos de segurança e não expõe X-Powered-By', async () => {
    const res = await api().get('/');
    assert.equal(res.status, 200);
    assert.match(res.headers['content-security-policy'], /script-src 'self'/);
    assert.equal(res.headers['x-content-type-options'], 'nosniff');
    assert.equal(res.headers['x-frame-options'], 'DENY');
    assert.equal(res.headers['x-powered-by'], undefined);
  });

  it('quando acessa uma rota de API inexistente, então devolve 404 em JSON', async () => {
    const res = await api().get('/api/nada');
    assert.equal(res.status, 404);
    assert.equal(res.body.error, 'Rota não encontrada.');
  });

  it('quando ocorre um erro interno, então devolve mensagem genérica sem stack', async (t) => {
    // Falha real do banco (tabela indisponível), sem mock: renomeia a tabela e depois restaura.
    t.mock.method(console, 'error', () => {});
    app.db.exec('ALTER TABLE tasks RENAME TO tasks_tmp');
    let res;
    try {
      res = await api().get('/api/tasks');
    } finally {
      app.db.exec('ALTER TABLE tasks_tmp RENAME TO tasks');
    }
    assert.equal(res.status, 500);
    assert.deepEqual(res.body, { error: 'Erro interno do servidor.' });
  });
});
