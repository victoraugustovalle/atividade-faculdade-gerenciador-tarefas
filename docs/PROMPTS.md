# Registro do desenvolvimento com IA e dos 4 prompts

Ferramenta usada: **Claude Code** (assistente de programação da Anthropic) no VS Code.
Cada etapa abaixo corresponde a um ou mais commits, e o histórico (`git log`) mostra a evolução.

| Commit | Etapa |
|---|---|
| `feat: versão inicial…` | Etapas 1 e 2: planejamento e primeira versão gerada pela IA |
| `docs: AUDITORIA.md…` | Prompt 4: auditoria completa, sem alterações |
| `fix(segurança)…` | Prompt 1: correções de segurança |
| `test: testes de integração…` | Prompt 3: testes de integração |
| `refactor(passo 1…4)` | Prompt 2: refatoração segura em 4 passos |
| `fix(segurança)` (5 commits após o deploy) | Prompt 1, segunda rodada, com o sistema já publicado |

---

## Etapa 1 — Planejamento com IA

**Tema escolhido:** A. Gerenciador de tarefas.
**Problema:** tarefas anotadas em lugares diferentes, sem prioridade nem prazo, e sem forma fácil de ver o que está atrasado.

**Requisitos funcionais definidos com a IA:**

1. RF01: cadastrar tarefa (título obrigatório, descrição, prioridade, prazo e status).
2. RF02: listar tarefas, com as pendentes primeiro e ordenadas pelo prazo.
3. RF03: pesquisar por texto e filtrar por status.
4. RF04: editar tarefa.
5. RF05: concluir/reabrir tarefa.
6. RF06: excluir com confirmação.
7. RF07: destacar tarefas atrasadas.
8. RNF: validação, mensagens claras, responsividade, persistência em banco.

**Telas:** uma página única com formulário (cadastro/edição) e lista com busca e filtros. Essa opção foi preferida a várias telas para manter o sistema simples de demonstrar.

**Estrutura e stack:** Node + Express + SQLite. Esta opção foi escolhida em vez de um site estático com `localStorage` porque o servidor permite aplicar de verdade os prompts de segurança (validar no servidor) e de testes de integração (bater na rota real).

**Proposta revisada:** login de usuários foi descartado, porque não é exigido pelo enunciado e não haveria tempo para implementá-lo e testá-lo adequadamente dentro do prazo. Fica como limitação documentada.

## Etapa 2 — Problemas encontrados no desenvolvimento e como foram corrigidos

| # | Problema | Como foi encontrado | Correção |
|---|---|---|---|
| 1 | A busca montava o SQL concatenando o texto digitado (SQL Injection) | Teste manual com `x') OR 1=1 --` + Prompt 4 | Parâmetros `?` com `ESCAPE` |
| 2 | A lista usava `innerHTML` com o título digitado (XSS) | Leitura do código + teste com `<img onerror>` | Montagem do DOM com `textContent` |
| 3 | A data "hoje" era calculada em UTC: depois das 21h no Brasil, o prazo de hoje era recusado como "no passado" | Percebido ao testar à noite | Data local no front e fuso `America/Sao_Paulo` no servidor + teste de regressão |
| 4 | Título numérico (`12345`) era gravado como `"12345.0"` | Prompt 4 (requisição de teste) | Exigir `typeof title === 'string'` |
| 5 | Ao mover a busca para `taskRepository.js`, as barras invertidas do `ESCAPE` foram perdidas e a busca passou a dar erro | **Os testes do Prompt 3 falharam** (3 testes) no passo 2 da refatoração | Restaurado o escape correto; testes voltaram a 45/45 |
| 6 | O servidor abria a porta ao ser importado, o que impedia os testes de importá-lo | Prompt 4 (etapa de testes) | `require.main === module` e, depois, separação em `src/app.js` |

---

## Prompt 4 — Auditoria completa, sem alterações

Relatório completo: **[AUDITORIA.md](../AUDITORIA.md)**.

**Principais achados:**

| # | Achado | Risco |
|---|---|---|
| 1 | SQL Injection na busca | Alto |
| 2 | XSS armazenado na lista | Alto |
| 3 | Validação só no cliente (prioridade, status, data e tamanho aceitavam qualquer valor na API) | Alto |
| 4 | Stack trace e caminho do servidor devolvidos nos erros | Médio |
| 5 | PATCH de status era um "toggle": clique duplo desfazia a ação | Médio |

Também: nenhum teste automatizado, ausência de cabeçalhos de segurança e `server.js` misturando todas as camadas.
**Não se aplica:** Supabase/RLS, webhooks e pagamentos (o sistema não tem esses recursos). Não foram encontrados segredos.

**Recomendação da auditoria:** rodar primeiro o Prompt 1, porque os dois riscos altos seriam exploráveis assim que o sistema fosse publicado.

## Prompt 1 — Auditoria de segurança

**Relatório (antes de alterar):**

| Achado | Risco | Arquivo e linha (versão inicial) | Correção proposta | Decisão |
|---|---|---|---|---|
| Regra "título ≥ 3 caracteres" só no front | Alto | `public/app.js:46` | Validar no servidor | ✅ Aplicada |
| Regra "prazo não pode estar no passado" só no front | Médio | `public/app.js:47` | Validar no servidor, no fuso local | ✅ Aplicada |
| Prioridade e status sem validação no servidor | Alto | `server.js:64,82` | Lista de permitidos + `CHECK` no banco | ✅ Aplicada |
| Tamanho máximo só no `maxlength` do HTML | Médio | `index.html:21,26` | Limite no servidor + `CHECK` + corpo ≤ 10 kb | ✅ Aplicada |
| SQL Injection na busca | Alto | `server.js:37` | Parâmetros + `ESCAPE` | ✅ Aplicada |
| XSS armazenado | Alto | `public/app.js:75-92` | `textContent` e `addEventListener` | ✅ Aplicada |
| Stack trace na resposta | Médio | `server.js:44,68` | Middleware de erro com mensagem genérica | ✅ Aplicada |
| Sem cabeçalhos de segurança; `X-Powered-By` exposto | Baixo | `server.js` | CSP, `nosniff`, `X-Frame-Options`, `Referrer-Policy` (sem biblioteca nova) | ✅ Aplicada |
| Status não idempotente | Médio | `server.js:87-90` | Cliente envia o status desejado | ✅ Aplicada |
| Sem autenticação | Médio | todas as rotas | Login por usuário | ❌ Fora do escopo; documentado |

**Segredos:** não existem chaves, tokens ou variáveis públicas (`NEXT_PUBLIC_`, `VITE_`…). As variáveis `PORT`, `DB_PATH` e `APP_TIMEZONE` não são secretas. **Nada a rotacionar.** O `.env` está no `.gitignore` e há um `.env.example`.
**Banco exposto por API / RLS:** não se aplica, porque o SQLite só é acessado pelo servidor. No lugar das policies, as regras foram reforçadas com `CHECK` na tabela.
**Nenhuma proteção existente foi desligada.** A CSP foi adicionada junto com a troca dos `onclick` inline, para não "quebrar e afrouxar".

**Verificação:** as mesmas requisições maliciosas da auditoria foram repetidas depois da correção. Todas passaram a responder 400 ou foram tratadas como texto.

### Segunda rodada do Prompt 1 (com o sistema já publicado)

Depois do deploy no Render, o Prompt 1 foi executado de novo sobre o código atual, porque um sistema acessível pela internet muda o peso de alguns riscos. Primeiro veio só o relatório; depois, uma correção por vez, cada uma com o próprio commit, os testes rodando e aprovação antes de seguir.

**Confirmado nesta rodada:** todas as regras do front também existem no servidor. Os campos `id`, `created_at` e `updated_at` enviados pelo cliente são ignorados. Parâmetros repetidos na URL respondem 400. Tentativas de baixar o banco (`/../data/tasks.db`) respondem 404. Não há segredos em nenhum commit do histórico.

| # | Achado | Risco | Decisão |
|:-:|---|:-:|---|
| 1 | Sem autenticação: com o sistema público, qualquer pessoa com o link pode alterar as tarefas | Alto | ❌ Não aplicado. Login não faz parte do enunciado e mudaria o escopo da atividade. Fica como limitação documentada |
| 2 | Dependências com vulnerabilidades de negação de serviço (`body-parser`, `path-to-regexp`, `qs`, via `express@4.21.2`) | Alto | ✅ `npm audit fix`: express 4.22.3, **0 vulnerabilidades** |
| 3 | Sem limite de requisições: um script poderia encher o banco | Médio | ✅ 60 escritas por minuto por IP (resposta 429), sem biblioteca nova |
| 4 | Listagem sem limite de tamanho | Baixo | ✅ No máximo 200 tarefas por resposta, com o total no cabeçalho `X-Total-Count` e aviso na tela |
| 5 | Prazo no passado é aceito na edição | Baixo | ❌ Mantido. É regra de negócio, não falha de segurança, e é igual no front e no servidor (já anotado no Prompt 2) |
| 6 | Falta o cabeçalho HSTS | Baixo | ✅ `Strict-Transport-Security` enviado nas respostas por HTTPS |
| 7 | O health check do Render listava todas as tarefas | Baixo | ✅ Nova rota `/api/health` |
| 8 | O selo "atrasada" usa o relógio do navegador | Baixo | ❌ Mantido. Só afeta a exibição |

**Testes:** 8 testes novos (limite de escritas, HSTS, health check e limite da listagem). Resultado: **53 passam, 0 falham.**
**Nenhuma proteção existente foi desligada** (CSP, CHECKs, validação e limite de 10 kb continuam iguais).

## Prompt 3 — Testes de integração

**Ferramenta:** o projeto não tinha nenhuma. Foi escolhida a opção mais simples para a stack: `node:test` (já vem no Node) + `supertest` (chama as rotas do Express).
**Banco de teste:** SQLite em memória (`DB_PATH=:memory:`), recriado a cada teste. Há uma trava que aborta se o banco não for o de memória.
**Comando único:** `npm test`.

**Fluxos críticos:** cadastro, listagem/pesquisa, consulta, edição, alteração de status e exclusão. Login, checkout, webhooks e dados de outro usuário **não se aplicam** (o sistema não tem usuários nem pagamentos).

**Frases de comportamento (describe / it):**

- **Cadastro (POST /api/tasks)**
  - quando os dados são válidos, então cria a tarefa como pendente e devolve 201 *(caminho feliz)*
  - quando só o título é enviado, então usa prioridade média, status pendente e sem prazo
  - quando o título tem espaços nas pontas, então grava o título sem eles
  - quando o título está ausente / só espaços / < 3 / > 100 caracteres, então devolve 400 *(erro esperado)*
  - quando o título tem exatamente 3 e 100 caracteres, então aceita *(limite)*
  - quando o título não é texto (número ou objeto), então devolve 400 e não erro 500
  - quando a descrição passa de 500 caracteres, então devolve 400 *(limite)*
  - quando a prioridade ou o status não são válidos, então devolve 400
  - quando o prazo não é uma data válida (`ontem`, `2026-02-30`, `31/12/2099`), então devolve 400
  - quando o prazo está no passado, então devolve 400; quando é hoje, então aceita *(limite)*
  - quando são 21h30 no Brasil (já é o dia seguinte em UTC) e o prazo é hoje, então aceita *(regressão do bug 3)*
  - quando o JSON é malformado, então devolve 400 sem stack; quando passa de 10 kb, então devolve 413
  - quando o título contém HTML, então grava como texto puro
  - quando o mesmo cadastro é enviado 2 vezes ao mesmo tempo, então ambos são criados *(repetição; comportamento aceito)*
- **Listagem e pesquisa (GET /api/tasks)**
  - quando não há tarefas, então devolve lista vazia
  - quando há tarefas, então lista pendentes antes de concluídas e por prazo mais próximo
  - quando filtra por status, então devolve só aquele status; filtro inválido devolve 400
  - quando pesquisa um termo, então encontra no título ou na descrição
  - quando a busca contém injeção de SQL, então trata como texto e não devolve tudo *(segurança)*
  - quando a busca contém `%` ou `_`, então trata como caractere literal
- **Consulta (GET /api/tasks/:id):** existe → 200; não existe → 404; ID `abc`, `0`, `-1` ou `1.5` → 400
- **Edição (PUT /api/tasks/:id):** válido → 200 e banco atualizado; inválido → 400 e banco intacto; ID inexistente → 404; prazo antigo mantido na edição → 200
- **Status (PATCH /api/tasks/:id/status):** concluir e reabrir; **2 cliques simultâneos em "Concluir" → termina concluída** *(repetição)*; status inválido/ausente → 400; ID inexistente → 404
- **Exclusão (DELETE /api/tasks/:id):** existe → 204; **2 exclusões simultâneas → uma 204 e outra 404** *(repetição)*; inexistente → 404
- **Segurança:** cabeçalhos CSP/nosniff/X-Frame-Options e sem `X-Powered-By`; rota de API inexistente → 404 JSON; erro interno real do banco → 500 com mensagem genérica, sem stack
- **Adicionados na segunda rodada do Prompt 1:** a 61ª escrita no minuto recebe 429 e não grava; outro IP continua gravando; leituras continuam liberadas; HSTS só em HTTPS; `/api/health` responde sem devolver tarefas; com 201 tarefas, a listagem traz 200 e informa o total (também com filtro)

**Mocks:** nenhum. O teste de erro interno provoca uma falha **real** do banco (a tabela é renomeada temporariamente). O único "mock" é o relógio (`Date`), usado no teste do fuso horário.
**E2E (Playwright):** não foi feito (era opcional).

**Resultado:**

| Versão | Passam | Falham |
|---|---|---|
| Versão inicial gerada pela IA (`5b30ede`) | 23 | **22** |
| Depois do Prompt 1 | **45** | 0 |
| Depois de cada passo do Prompt 2 | **45** | 0 (no passo 2 houve 3 falhas, que revelaram o bug 5 e foram corrigidas antes do commit) |
| Depois da segunda rodada do Prompt 1 (8 testes novos) | **53** | 0 |

Saídas em [`evidencias/testes-prompt3-v2.txt`](evidencias/testes-prompt3-v2.txt), [`evidencias/testes-final.txt`](evidencias/testes-final.txt) (53 testes) e [`evidencias/testes-contra-versao-inicial.txt`](evidencias/testes-contra-versao-inicial.txt).
Nenhum teste foi apagado, pulado ou afrouxado.

## Prompt 2 — Refatoração segura

**Arquivo escolhido:** `server.js` (candidato nº 1 da auditoria; ~200 linhas misturando banco, SQL, validação, rotas e inicialização).

**Mapa do arquivo (antes):**

| Trecho | Camada |
|---|---|
| Constantes `PORT`, `DB_PATH`, `TIMEZONE` | Configuração |
| `new DatabaseSync` + `CREATE TABLE` | Acesso a dados |
| `hoje`, `dataValida`, `validarTarefa`, `idValido`, listas de prioridade/status | Regra de negócio |
| `db.prepare(...)` dentro de cada rota | Acesso a dados (misturado com HTTP) |
| `app.get/post/put/patch/delete`, `app.param` | HTTP (equivale à "UI" do back-end) |
| Cabeçalhos, `express.json`, `static`, 404, tratamento de erro | HTTP / infraestrutura |
| `app.listen` + `module.exports` | Inicialização |

**Dependências cruzadas e problemas:** o SQL aparecia repetido (`SELECT * FROM tasks WHERE id = ?` 5 vezes); o `db` era estado global usado em todas as rotas; as constantes de tamanho eram usadas tanto no `CREATE TABLE` quanto na validação.

**Testes de caracterização:** já existiam os 45 testes de integração do Prompt 3, que registram o comportamento atual das rotas, então não foi preciso criar outros.

**Plano executado (um pedaço por passo, testes ao final de cada um, um commit por passo):**

1. Extrair configuração (`src/config.js`) e validação (`src/tasks/taskValidation.js`): 45/45 ✔
2. Extrair o banco (`src/db.js`) e o SQL (`src/tasks/taskRepository.js`): 42/45 ✖ → bug do escape corrigido → 45/45 ✔
3. Mover as rotas para um `express.Router` (`src/tasks/taskRoutes.js`): 45/45 ✔
4. Separar a montagem do app (`src/app.js`) da inicialização (`server.js`): 45/45 ✔

**Preservado:** as mesmas rotas, os mesmos códigos e mensagens, as mesmas colunas e o mesmo `module.exports` do `server.js`. Nenhum framework ou biblioteca nova foi adicionado.

**Bugs/pontos anotados durante a refatoração (não corrigidos, para não mudar comportamento):**

- `PUT` sem o campo `status` volta a tarefa para "pendente" (semântica de substituição completa). O front sempre envia o status, então não afeta o uso normal.
- Na edição é possível definir um prazo no passado (a regra só vale no cadastro, tanto no front quanto no servidor). É uma decisão discutível; foi mantida.
- `created_at`/`updated_at` são gravados em UTC (`datetime('now')`). Hoje não são exibidos na tela.
- Duas abas editando a mesma tarefa: a última gravação vence (*lost update*).

---

## Relato final

**O que a IA produziu corretamente:** a estrutura do projeto, o CRUD completo funcionando de primeira, a interface responsiva, as mensagens de erro e sucesso e uma boa base de cenários de teste.

**O que precisou ser corrigido:** a primeira versão "funcionava", mas tinha falhas sérias que só apareceram na auditoria: SQL Injection, XSS, validação apenas no navegador, vazamento de stack e o bug do fuso horário. Durante a refatoração, uma mudança aparentemente inofensiva (mover a busca de arquivo) quebrou a pesquisa, e foram os testes que pegaram isso na hora.

**Aprendizados:** código gerado por IA precisa ser lido e testado, não apenas executado. Validação no front é para usabilidade; a regra de verdade tem que estar no servidor (e, se possível, no banco). Testes de integração que batem na rota real são o que dá segurança para refatorar e para aceitar novas sugestões da IA: depois de qualquer alteração, `npm test`.
