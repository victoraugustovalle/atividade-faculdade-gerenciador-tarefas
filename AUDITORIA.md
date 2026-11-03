# AUDITORIA.md — Gerenciador de Tarefas

> Auditoria abrangente feita com o **Prompt 4 (Auditoria completa, sem alterações)** sobre a versão inicial do projeto (commit `5b30ede`).
> Nesta etapa nenhum arquivo do projeto foi alterado, nenhuma migration foi executada e nada foi instalado. Foram feitas apenas a leitura do código e requisições de leitura e escrita contra um servidor local com banco **em memória** (`DB_PATH=:memory:`), que não toca nenhum dado real.

**Escopo:** `server.js` (API + banco), `public/app.js` (front-end), `public/index.html`, `public/style.css`.
**Stack:** Node.js 24 + Express 4 + SQLite nativo (`node:sqlite`), front-end em HTML/CSS/JS puro.

---

## Os 5 achados de maior risco (em ordem)

| # | Achado | Risco | Arquivo:linha |
|---|--------|-------|---------------|
| 1 | **SQL Injection** na busca: o parâmetro `q` é concatenado direto no SQL. A busca `x') OR 1=1 --` retornou **todas** as tarefas. | **Alto** | `server.js:37` |
| 2 | **XSS armazenado**: título e descrição são inseridos com `innerHTML` sem escape. Uma tarefa com o título `<img src=x onerror=alert(1)>` foi aceita pela API (201) e executa script no navegador de quem abrir a lista. | **Alto** | `public/app.js:75-82` |
| 3 | **Validação só no cliente**: prioridade, status, formato e data no passado só são validados no front. A API aceitou `priority: "urgentissima"`, `status: "hackeado"`, `due_date: "ontem"`, `due_date: "2000-01-01"`, título com apenas espaços e título de 5000 caracteres. | **Alto** | `server.js:58, 64, 77, 82` / `public/app.js:43-50` |
| 4 | **Vazamento de detalhes internos**: erros 500 devolvem `err.stack`, o que expõe o caminho do servidor (`C:\Users\...\server.js:64`). O JSON malformado devolve uma página HTML de erro do Express com o stack. | **Médio** | `server.js:44, 68` |
| 5 | **Alteração de status não idempotente**: `PATCH /status` alterna o valor (toggle). Um clique duplo ou uma requisição repetida desfaz a ação do usuário. | **Médio** | `server.js:87-90` |

---

## Etapa 1 — Testes de integração

- **Ferramenta de teste configurada?** Não. O `package.json` não tem script `test` nem dependência de testes.
- **Banco de teste separado?** Não existe configuração específica. O caminho do banco já pode ser trocado pela variável `DB_PATH`, o que permite usar `:memory:` nos testes.
- **Comando para rodar tudo:** não existe. **Resultado: 0 testes, 0 passam, 0 falham.**

| Fluxo crítico | Teste batendo na rota | Só teste unitário com mock | Sem teste |
|---|---|---|---|
| Cadastrar tarefa (`POST /api/tasks`) | — | — | ✔ |
| Listar/pesquisar (`GET /api/tasks`) | — | — | ✔ |
| Consultar (`GET /api/tasks/:id`) | — | — | ✔ |
| Editar (`PUT /api/tasks/:id`) | — | — | ✔ |
| Alterar status (`PATCH /api/tasks/:id/status`) | — | — | ✔ |
| Excluir (`DELETE /api/tasks/:id`) | — | — | ✔ |
| Login, checkout, assinatura, webhooks | não se aplica (o sistema não tem esses fluxos) | | |

| Achado | Risco | Arquivo e linha | Correção sugerida |
|---|---|---|---|
| Nenhum teste automatizado | Alto | `package.json` | Criar testes de integração com `node:test` + `supertest` (Prompt 3) |
| A aplicação inicia o servidor no mesmo arquivo em que é criada, o que impede importá-la em testes sem abrir a porta | Médio | `server.js:102` | Exportar o `app` e separar o `listen` (ex.: `app.js` + `server.js`) |
| Não há banco de teste separado | Médio | `server.js:7` | Nos testes, usar `DB_PATH=:memory:`; nunca apontar para `data/tasks.db` |

## Etapa 2 — Confiança no cliente

**Regras que só existem no front:**

| Achado | Risco | Arquivo e linha | Correção sugerida |
|---|---|---|---|
| Título com no mínimo 3 caracteres e sem só espaços: só no front | Alto | `public/app.js:45-46`, `server.js:58` | Validar no servidor com `trim()` e limites de tamanho |
| Prazo não pode estar no passado: só no front | Médio | `public/app.js:47` | Validar no servidor (no cadastro) |
| Prioridade (`baixa/media/alta`) e status (`pendente/concluida`) não são validados no servidor | Alto | `server.js:64, 82` | Lista de valores permitidos no servidor + `CHECK` no banco |
| Formato de data não é validado (aceitou `"ontem"`) | Médio | `server.js:64` | Validar `AAAA-MM-DD` e data real |
| Título numérico vira `"12345.0"` (o SQLite converte o número para REAL e depois para TEXT) | Baixo | `server.js:64` | Exigir `typeof title === 'string'` |
| Título com objeto (`{x:1}`) causa erro 500 (`Unknown named parameter`) | Médio | `server.js:64` | Validar tipos antes de chamar o banco |
| Tamanho máximo (100/500) só via `maxlength` do HTML | Médio | `public/index.html:21,26`, `server.js` | Limitar no servidor |
| Saída sem escape (`innerHTML`) → XSS armazenado | Alto | `public/app.js:75-92` | Montar o DOM com `textContent`/`createElement` e trocar `onclick` inline por `addEventListener` |
| SQL montado por concatenação com entrada do usuário | Alto | `server.js:37` | Usar parâmetros `?` para o `LIKE` |

**Chaves e tokens:** nenhuma chave, token ou segredo foi encontrado no front ou no back. O projeto não usa variáveis com prefixo público (`NEXT_PUBLIC_`, `VITE_` etc.). As únicas variáveis de ambiente são `PORT` e `DB_PATH`, e nenhuma delas é secreta. **Nada precisa ser rotacionado.**

**Supabase/RLS:** não se aplica, porque o projeto não usa Supabase nem banco exposto por API. O SQLite é acessado apenas pelo servidor.

| Achado | Risco | Arquivo e linha | Correção sugerida |
|---|---|---|---|
| Não há autenticação: qualquer pessoa com o link pode criar, editar e apagar tarefas | Médio (aceito no escopo acadêmico) | `server.js` (todas as rotas) | Fora do escopo da atividade (sistema de usuário único). Fica documentado no README como limitação |
| Falta de cabeçalhos de segurança (`X-Content-Type-Options`, `X-Frame-Options`, CSP) e o Express expõe `X-Powered-By` | Baixo | `server.js:5` | Desligar `x-powered-by` e definir os cabeçalhos manualmente |
| O stack trace é devolvido ao cliente | Médio | `server.js:44, 68` | Usar um middleware de erro central com mensagem genérica |
| JSON malformado devolve a página HTML padrão do Express (com o stack em desenvolvimento) | Baixo | `server.js:24` | Tratar `SyntaxError` do body-parser e responder 400 em JSON |

## Etapa 3 — Race condition

O SQLite (`node:sqlite`) é síncrono e o Node executa cada handler sem intercalar entre a leitura e a gravação, então duas requisições não chegam a intercalar dentro de uma mesma rota. Mesmo assim:

| Achado | Risco | Arquivo e linha | Correção sugerida |
|---|---|---|---|
| `PATCH /status` lê o status e grava o oposto. Com 2 requisições iguais, a segunda **desfaz** a primeira (o estado final volta ao original) | Médio | `server.js:87-91` | Rota idempotente: o cliente informa o status desejado (`{ "status": "concluida" }`) e o servidor só grava esse valor |
| `PUT` sem controle de versão: duas abas editando a mesma tarefa fazem a última gravação vencer (*lost update*) | Baixo | `server.js:74-84` | Aceito no escopo (usuário único). Opcional: checar `updated_at` |
| Não há recurso limitado (estoque, saldo, cupom) e nenhuma proteção depende de lock em memória ou Redis | — | — | Não se aplica |

## Etapa 4 — Idempotência

| Achado | Risco | Arquivo e linha | Correção sugerida |
|---|---|---|---|
| Clique duplo em "Cadastrar" com 2 POSTs simultâneos criou **2 registros**. O front desabilita o botão, mas isso não protege contra requisições repetidas | Baixo | `server.js:56`, `public/app.js:121` | Aceito: é um gerenciador de tarefas e duplicar é inofensivo e reversível. O botão desabilitado já cobre o uso normal |
| Webhooks | — | — | **Não se aplica**: o sistema não recebe webhooks |
| Gateway de pagamento / idempotency key | — | — | **Não se aplica**: o sistema não processa pagamentos |

## Etapa 5 — Separação de responsabilidades

| Arquivo | Linhas | Mistura camadas? |
|---|---|---|
| `public/app.js` | 187 | Sim: UI (DOM, eventos), regra (validação, atraso) e acesso à API (`fetch`) |
| `public/style.css` | 110 | Não (só estilo) |
| `server.js` | 104 | Sim: criação do banco, SQL, validação, rotas HTTP e `listen`, tudo junto |

| Achado | Risco | Arquivo e linha | Correção sugerida |
|---|---|---|---|
| `server.js` mistura as camadas de dados, regra e HTTP, e ainda vai crescer com a validação no servidor (Prompt 1) | Médio | `server.js` (inteiro) | **Candidato nº 1 para refatorar**: separar `db`, `repositório`, `validação`, `rotas`, `app` e `server` |
| `public/app.js` mistura UI, validação e `fetch` | Baixo | `public/app.js` | Candidato nº 2 (separar `api.js`) |

---

## Recomendação final

**Rodar primeiro o Prompt 1 (Auditoria de segurança).** Os dois achados de risco alto (SQL Injection e XSS armazenado) podem ser explorados por qualquer pessoa assim que o sistema for publicado na internet, e a falta de validação no servidor permite gravar dados inválidos no banco. Em seguida vêm o Prompt 3 (testes que travem essas correções) e por último o Prompt 2 (refatorar `server.js`).
