// ═══════════════════════════════════════════════════════════════
//  api/usuarios.js — Portal Comercial Coopefarma
//  Cria, lista, troca senha e remove usuarios do Supabase Auth.
//
//  ESTE CODIGO RODA NO SERVIDOR DA VERCEL, nunca no navegador.
//  A chave de servico (service_role) vem da Environment Variable
//  SUPABASE_SERVICE_ROLE_KEY e jamais e enviada para a pagina.
//
//  Variaveis usadas na Vercel:
//    SUPABASE_SERVICE_ROLE_KEY  (obrigatoria)  chave secreta do Supabase
//    ADMIN_EMAILS               (opcional)     lista separada por virgula
//    SUPABASE_URL               (opcional)     se um dia mudar de projeto
// ═══════════════════════════════════════════════════════════════

const SB_URL      = process.env.SUPABASE_URL || 'https://uofcbqqbubvvltnzvhsx.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const PUBLIC_KEY  = process.env.SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_SQ0x7RDU9B0u5lqvn2pr1Q_4NwoJMY9';

const ADMINS = (process.env.ADMIN_EMAILS || 'drogariaflorania@yahoo.com.br,rede@coopefarma.com')
  .split(',').map(e => e.trim().toLowerCase()).filter(Boolean);

// Quem esta chamando? Confere o token da sessao do navegador no Supabase.
async function usuarioDaSessao(req) {
  const cab = req.headers.authorization || '';
  const token = cab.startsWith('Bearer ') ? cab.slice(7) : '';
  if (!token) return null;
  try {
    const r = await fetch(SB_URL + '/auth/v1/user', {
      headers: { apikey: PUBLIC_KEY, Authorization: 'Bearer ' + token }
    });
    if (!r.ok) return null;
    return await r.json();
  } catch (e) { return null; }
}

// Chamada na API de administracao do Supabase, com a chave secreta.
function admin(caminho, opcoes = {}) {
  return fetch(SB_URL + '/auth/v1/admin/' + caminho, {
    ...opcoes,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: 'Bearer ' + SERVICE_KEY,
      'Content-Type': 'application/json'
    }
  });
}

function traduzirErro(d) {
  const m = ((d && (d.msg || d.message || d.error_description || d.error)) || '').toString();
  if (/already been registered|already registered|email_exists|duplicate/i.test(m))
    return 'Ja existe um usuario com esse e-mail.';
  if (/password.*(6|short|weak)/i.test(m))
    return 'Senha muito curta — use pelo menos 6 caracteres.';
  if (/invalid.*email/i.test(m))
    return 'E-mail invalido.';
  return m || 'Nao foi possivel concluir a operacao no Supabase.';
}

function corpo(req) {
  if (!req.body) return {};
  if (typeof req.body === 'string') { try { return JSON.parse(req.body); } catch (e) { return {}; } }
  return req.body;
}

module.exports = async function handler(req, res) {
  if (!SERVICE_KEY) {
    return res.status(500).json({ erro: 'A chave de servico ainda nao foi configurada na Vercel (SUPABASE_SERVICE_ROLE_KEY).' });
  }

  const eu = await usuarioDaSessao(req);
  if (!eu) return res.status(401).json({ erro: 'Sessao expirada. Entre novamente.' });

  const meuEmail = (eu.email || '').toLowerCase();
  if (!ADMINS.includes(meuEmail)) {
    return res.status(403).json({ erro: 'Seu usuario nao tem permissao para gerenciar acessos.' });
  }

  try {
    // ── LISTAR ────────────────────────────────────────────────
    if (req.method === 'GET') {
      const r = await admin('users?page=1&per_page=200');
      const d = await r.json();
      if (!r.ok) return res.status(r.status).json({ erro: traduzirErro(d) });
      const usuarios = (d.users || []).map(u => ({
        id: u.id,
        email: u.email,
        criado_em: u.created_at,
        ultimo_acesso: u.last_sign_in_at,
        confirmado: !!u.email_confirmed_at,
        admin: ADMINS.includes((u.email || '').toLowerCase())
      })).sort((a, b) => (a.email || '').localeCompare(b.email || ''));
      return res.status(200).json({ usuarios, eu: meuEmail });
    }

    // ── CRIAR ─────────────────────────────────────────────────
    if (req.method === 'POST') {
      const b = corpo(req);
      const email = (b.email || '').trim().toLowerCase();
      const senha = (b.senha || '').toString();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ erro: 'E-mail invalido.' });
      if (senha.length < 6) return res.status(400).json({ erro: 'A senha precisa ter pelo menos 6 caracteres.' });

      const r = await admin('users', {
        method: 'POST',
        body: JSON.stringify({ email, password: senha, email_confirm: true })
      });
      const d = await r.json();
      if (!r.ok) return res.status(r.status).json({ erro: traduzirErro(d) });
      return res.status(200).json({ ok: true, id: d.id, email: d.email });
    }

    // ── TROCAR SENHA ──────────────────────────────────────────
    if (req.method === 'PUT') {
      const b = corpo(req);
      const id = (b.id || '').toString();
      const senha = (b.senha || '').toString();
      if (!id) return res.status(400).json({ erro: 'Usuario nao informado.' });
      if (senha.length < 6) return res.status(400).json({ erro: 'A senha precisa ter pelo menos 6 caracteres.' });

      const r = await admin('users/' + id, {
        method: 'PUT',
        body: JSON.stringify({ password: senha, email_confirm: true })
      });
      const d = await r.json();
      if (!r.ok) return res.status(r.status).json({ erro: traduzirErro(d) });
      return res.status(200).json({ ok: true });
    }

    // ── REMOVER ───────────────────────────────────────────────
    if (req.method === 'DELETE') {
      const b = corpo(req);
      const id = ((req.query && req.query.id) || b.id || '').toString();
      const email = ((req.query && req.query.email) || b.email || '').toString().toLowerCase();
      if (!id) return res.status(400).json({ erro: 'Usuario nao informado.' });
      if (email && email === meuEmail) return res.status(400).json({ erro: 'Voce nao pode remover o seu proprio acesso.' });

      const r = await admin('users/' + id, { method: 'DELETE' });
      if (!r.ok) {
        let d = {};
        try { d = await r.json(); } catch (e) {}
        return res.status(r.status).json({ erro: traduzirErro(d) });
      }
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ erro: 'Metodo nao suportado.' });
  } catch (e) {
    return res.status(500).json({ erro: 'Erro inesperado no servidor: ' + (e && e.message ? e.message : e) });
  }
}
