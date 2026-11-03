// Limite de requisições por IP em janela fixa, guardado em memória (sem biblioteca externa).
// Basta para um único processo, como no Render gratuito; com várias instâncias, cada uma conta sozinha.
function limitarRequisicoes({ max, janelaMs }) {
  const contagens = new Map();

  // Remove as janelas vencidas para o Map não crescer sem limite
  const limpeza = setInterval(() => {
    const agora = Date.now();
    for (const [ip, c] of contagens) if (c.fim <= agora) contagens.delete(ip);
  }, janelaMs);
  limpeza.unref();

  function middleware(req, res, next) {
    const agora = Date.now();
    let c = contagens.get(req.ip);
    if (!c || c.fim <= agora) {
      c = { total: 0, fim: agora + janelaMs };
      contagens.set(req.ip, c);
    }
    c.total++;
    if (c.total > max) {
      res.set('Retry-After', String(Math.ceil((c.fim - agora) / 1000)));
      return res.status(429).json({ error: 'Muitas requisições. Tente novamente em instantes.' });
    }
    next();
  }

  middleware.reset = () => contagens.clear();
  return middleware;
}

module.exports = { limitarRequisicoes };
