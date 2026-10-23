/* Prospecta · service worker: guarda a sessão e conversa com o Supabase */
importScripts('config.js');
const C = self.PROSPECTA_CFG;

const store = {
  get: (k) => chrome.storage.local.get(k).then((r) => r[k]),
  set: (k, v) => chrome.storage.local.set({ [k]: v }),
  del: (k) => chrome.storage.local.remove(k),
};

async function token(corpo, tipo) {
  const r = await fetch(`${C.SUPABASE_URL}/auth/v1/token?grant_type=${tipo}`, {
    method: 'POST', headers: { apikey: C.SUPABASE_ANON_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(corpo),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error_description || d.msg || d.message || `Erro ${r.status}`);
  d.expires_at = Math.floor(Date.now() / 1000) + (d.expires_in || 3600);
  await store.set('sessao', d);
  return d;
}

async function sessaoValida() {
  const s = await store.get('sessao');
  if (!s) throw new Error('Faça login na extensão (ícone do Prospecta na barra do Chrome).');
  if (s.expires_at - 120 < Date.now() / 1000) return token({ refresh_token: s.refresh_token }, 'refresh_token');
  return s;
}

async function api(caminho, { method = 'GET', body, prefer } = {}) {
  const s = await sessaoValida();
  const h = { apikey: C.SUPABASE_ANON_KEY, Authorization: `Bearer ${s.access_token}`, 'Content-Type': 'application/json' };
  if (prefer) h.Prefer = prefer;
  const r = await fetch(`${C.SUPABASE_URL}${caminho}`, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
  const txt = await r.text();
  const d = txt ? JSON.parse(txt) : null;
  if (!r.ok) throw new Error(d?.message || d?.erro || d?.msg || `Erro ${r.status}`);
  return d;
}
const rpc = (nome, params) => api(`/rest/v1/rpc/${nome}`, { method: 'POST', body: params || {} });

const ACOES = {
  async entrar({ email, senha }) { const s = await token({ email, password: senha }, 'password'); return { email: s.user?.email }; },
  async sair() { await store.del('sessao'); return { ok: true }; },
  async sessao() { try { const s = await sessaoValida(); return { email: s.user?.email }; } catch { return { email: null }; } },
  async criarBusca({ busca }) {
    const [b] = await api('/rest/v1/prospecta_buscas', { method: 'POST', body: { ...busca, fonte: 'extensao', status: 'executando', iniciado_em: new Date().toISOString(), robo: 'extensao-chrome' }, prefer: 'return=representation' });
    return b;
  },
  salvarLeads: ({ busca_id, leads }) => rpc('prospecta_salvar_leads', { p_busca: busca_id, p_leads: leads }),
  progresso: ({ busca_id, campos, logs }) => rpc('prospecta_progresso', { p_busca: busca_id, p_campos: campos || {}, p_logs: logs || [] }),
  enriquecer: ({ lead_id }) => api('/functions/v1/enriquecer', { method: 'POST', body: { lead_id } }),
  abrirApp() { chrome.tabs.create({ url: C.APP_URL }); return { ok: true }; },
};

chrome.runtime.onMessage.addListener((msg, _sender, responder) => {
  const fn = ACOES[msg?.tipo];
  if (!fn) return false;
  Promise.resolve(fn(msg)).then((dados) => responder({ ok: true, dados }), (e) => responder({ ok: false, erro: e.message }));
  return true; // resposta assíncrona
});
