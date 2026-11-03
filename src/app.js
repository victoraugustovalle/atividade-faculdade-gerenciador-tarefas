const express = require('express');
const path = require('path');
const taskRoutes = require('./tasks/taskRoutes');
const { limitarRequisicoes } = require('./rateLimit');
const { LIMITE_ESCRITAS_POR_MINUTO } = require('./config');

const limiteEscritas = limitarRequisicoes({ max: LIMITE_ESCRITAS_POR_MINUTO, janelaMs: 60 * 1000 });

const app = express();

app.disable('x-powered-by');
// O Render fica na frente do app como proxy: confia só no primeiro salto para obter o IP real do visitante
app.set('trust proxy', 1);
app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
  });
  // HSTS só faz sentido em HTTPS; em HTTP (localhost) o navegador ignoraria e o cabeçalho só confundiria
  if (req.secure) res.set('Strict-Transport-Security', 'max-age=31536000');
  next();
});
app.use(express.json({ limit: '10kb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

// Leituras ficam livres; só as escritas contam para o limite
app.use('/api/tasks', (req, res, next) => (req.method === 'GET' || req.method === 'HEAD' ? next() : limiteEscritas(req, res, next)));
app.use('/api/tasks', taskRoutes);

// Health check do Render: responde sem consultar nem devolver tarefas
app.get('/api/health', (req, res) => {
  res.json({ ok: true });
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

module.exports = app;
module.exports.limiteEscritas = limiteEscritas;
