// =====================================================================
//  Conferência Quallit — app de campo (PWA mobile)
//  Leituras ficam no aparelho (IndexedDB) e são enviadas ao finalizar
//  (ou antes, em "Enviar leituras agora"). Sem internet, a finalização
//  fica na fila e sincroniza sozinha quando a conexão voltar.
// =====================================================================
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../js/config.js';
import { idAleatorio, idbGet, idbSet } from '../js/offline.js';
import { anelPrazo, etiquetaPrazo, relogioCompleto, iniciarRelogios, estadoPrazo, fmtDuracao } from '../js/prazo.js';
import { montarResumo, copiarTexto, linkWhatsApp } from '../js/resumo.js';
import { confirmar } from '../js/dialogos.js';
import { dicaVersao, textoVersao } from '../js/versao.js';
import { apagarFoto, carregarMiniaturas, enviarFoto, erroFoto, listarFotos } from '../js/fotos.js';
import { VIDEO, ajustarFoco, criarDetector } from '../js/leitor-qr.js';
import { cartaoAppAndroid } from '../js/app-android.js';

const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* ------------------------------------------------------------------ utilidades */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const up = (v) => String(v ?? '').trim().toUpperCase();
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* sem storage */ } },
};
const dataHora = (ts) => (ts ? new Date(ts).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—');
const hora = (ts) => (ts ? new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '');
function rel(ts) {
  if (!ts) return 'nunca';
  const s = (Date.now() - new Date(ts)) / 1000;
  if (s < 60) return 'agora';
  if (s < 3600) return `há ${Math.floor(s / 60)} min`;
  if (s < 86400) return `há ${Math.floor(s / 3600)} h`;
  const d = Math.floor(s / 86400);
  return d < 60 ? `há ${d} dia${d > 1 ? 's' : ''}` : new Date(ts).toLocaleDateString('pt-BR');
}
const TIPO = { desktop: 'Desktop', notebook: 'Notebook', coletor: 'Coletor de dados', servidor: 'Servidor', outro: 'Outro' };
const STATUS = { em_uso: 'Em uso', estoque: 'Estoque', manutencao: 'Manutenção', emprestado: 'Emprestado', descartado: 'Descartado', extraviado: 'Extraviado' };
const msgErro = (e) => (e?.code === '42501' ? 'O inventário já foi encerrado ou você não tem permissão para gravar nele. Fale com o administrador.' : e?.message || String(e));
const erroRede = (e) => !navigator.onLine || (/Failed to fetch|NetworkError|Load failed|network/i.test(String(e?.message || e || '')) && !e?.code);

function aviso(msg, erro = false) {
  const el = document.createElement('div');
  el.className = 'aviso' + (erro ? ' erro' : '');
  el.textContent = msg;
  $('#avisos').append(el);
  setTimeout(() => el.remove(), erro ? 5000 : 3000);
}
let audio;
function sinal(tipo) {
  try { navigator.vibrate?.({ ok: 60, warn: [60, 70, 60], bad: [220] }[tipo]); } catch { /* sem vibração */ }
  try {
    audio ||= new (window.AudioContext || window.webkitAudioContext)();
    const seq = { ok: [[1046, 0.08]], warn: [[740, 0.07], [740, 0.07]], bad: [[220, 0.3]] }[tipo];
    let t = audio.currentTime;
    for (const [f, d] of seq) {
      const o = audio.createOscillator(); const g = audio.createGain();
      o.type = 'square'; o.frequency.value = f; g.gain.value = 0.045;
      o.connect(g).connect(audio.destination); o.start(t); o.stop(t + d); t += d + 0.05;
    }
  } catch { /* sem áudio */ }
}

/* ------------------------------------------------------------------ estado */
const S = {
  user: null, perfil: null, cds: [], cd: null,
  maquinas: [], confs: [],
  sess: null,          // inventário aberto: { conf, leituras: [...] }
  aba: 'faltando', busca: '',
  wake: null, instalar: null, enviando: false,
};
const ehAdmin = () => S.perfil?.papel === 'admin';
const cdInfo = (id) => S.cds.find((c) => c.id === id);
const cdTxt = (id) => { const c = cdInfo(id); return c ? `${c.codigo} · ${c.nome}` : ''; };

/* ------------------------------------------------------------------ sessões locais (IndexedDB) */
const chaveSess = (id) => 'campo:sess:' + id;
async function listaSessoes() { return (await idbGet('campo:sessoes')) || []; }
async function salvarSessao(sess = S.sess) {
  if (!sess) return;
  sess.atualizado = Date.now();
  await idbSet(chaveSess(sess.conf.id), sess);
  const l = await listaSessoes();
  if (!l.includes(sess.conf.id)) { l.push(sess.conf.id); await idbSet('campo:sessoes', l); }
  atualizarSync();
}
async function apagarSessao(id) {
  await idbSet(chaveSess(id), null);
  await idbSet('campo:sessoes', (await listaSessoes()).filter((x) => x !== id));
  atualizarSync();
}
async function contarPendencias() {
  let leituras = 0, finalizar = 0;
  for (const id of await listaSessoes()) {
    const s = await idbGet(chaveSess(id));
    if (!s) continue;
    leituras += s.leituras.filter((l) => !l.enviado).length;
    if (s.finalizarPendente) finalizar++;
  }
  return { leituras, finalizar };
}
async function atualizarSync() {
  const el = $('#sync');
  if (!el) return;
  const p = await contarPendencias();
  if (!navigator.onLine) { el.className = 'sync off'; el.textContent = p.leituras ? `Offline · ${p.leituras}` : 'Offline'; return; }
  if (p.finalizar || p.leituras) { el.className = 'sync pend'; el.textContent = p.finalizar ? `${p.finalizar} a sincronizar` : `${p.leituras} no aparelho`; return; }
  el.className = 'sync ok'; el.textContent = '✓';
}

/* ------------------------------------------------------------------ dados */
async function carregarPerfil() {
  const [p, c] = await Promise.all([
    sb.from('perfis').select('*').eq('user_id', S.user.id).maybeSingle(),
    sb.from('cds').select('*').order('codigo'),
  ]);
  if (erroRede(p.error) || erroRede(c.error)) {
    const cache = await idbGet('campo:perfil:' + S.user.id);
    if (cache) { S.perfil = cache.perfil; S.cds = cache.cds; return true; }
    return false;
  }
  if (p.error && /perfis|does not exist|schema cache/i.test(p.error.message)) {
    S.perfil = { papel: 'admin', nome: S.user.email, ativo: true }; S.cds = []; return true; // banco sem o 04
  }
  if (!p.data || !p.data.ativo) return false;
  S.perfil = p.data; S.cds = (c.data || []).filter((x) => x.ativo || x.id === p.data.cd_id);
  idbSet('campo:perfil:' + S.user.id, { perfil: S.perfil, cds: S.cds });
  return true;
}

async function carregarMaquinas() {
  const cols = 'id, hostname, ativo, numero_serie, tipo, modelo, fabricante, setor, localizacao, responsavel, status, cd_id, ultimo_online';
  const todas = [];
  try {
    for (let from = 0; ; from += 1000) {
      let q = sb.from('maquinas').select(cols).order('hostname').range(from, from + 999);
      if (S.cd) q = q.eq('cd_id', S.cd);
      const { data: d, error } = await q;
      if (error) throw error;
      todas.push(...d);
      if (d.length < 1000) break;
    }
    S.maquinas = todas;
    idbSet('campo:maq:' + (S.cd || 'todos'), { em: Date.now(), lista: todas });
  } catch (e) {
    const cache = await idbGet('campo:maq:' + (S.cd || 'todos'));
    S.maquinas = cache?.lista || [];
    if (!erroRede(e)) aviso('Erro ao carregar máquinas: ' + (e.message || e), true);
  }
}

async function carregarConfs() {
  try {
    // cria os inventários programados que já chegaram na hora (idempotente; ignora se o SQL 05 não foi rodado)
    if (navigator.onLine) { try { await sb.rpc('gerar_inventarios_agendados'); } catch { /* ok */ } }
    let q = sb.from('conferencias').select('*, conferencia_itens(maquina_id, lido_em)').order('criado_em', { ascending: false }).limit(40);
    if (S.cd) q = q.eq('cd_id', S.cd);
    const { data: d, error } = await q;
    if (error) throw error;
    S.confs = d;
    idbSet('campo:confs:' + (S.cd || 'todos'), d);
  } catch (e) {
    S.confs = (await idbGet('campo:confs:' + (S.cd || 'todos'))) || [];
    if (!erroRede(e)) aviso('Erro ao carregar inventários: ' + (e.message || e), true);
  }
}

/* ------------------------------------------------------------------ regras do inventário */
function extrairCodigo(bruto) {
  let c = String(bruto || '').trim();
  const i = c.indexOf('#maquina/');
  if (i >= 0) { try { c = decodeURIComponent(c.slice(i + 9)); } catch { c = c.slice(i + 9); } }
  return c.trim();
}
function acharMaquina(bruto) {
  const c = up(extrairCodigo(bruto));
  if (!c) return null;
  const c2 = c.replace(/^0+/, '');
  return S.maquinas.find((m) => up(m.ativo) === c || up(m.hostname) === c || up(m.numero_serie) === c
    || (c2 && up(m.ativo) && up(m.ativo).replace(/^0+/, '') === c2)) || null;
}
const esperadas = (conf) => S.maquinas.filter((m) => (!S.cds.length || m.cd_id === conf.cd_id)
  && !['descartado', 'extraviado'].includes(m.status) && (!conf.setor || m.setor === conf.setor));
function calcular(sess = S.sess) {
  const esp = esperadas(sess.conf);
  const idsEsp = new Set(esp.map((m) => m.id));
  const lidos = new Set(sess.leituras.filter((l) => l.maquina_id).map((l) => l.maquina_id));
  const encontradas = sess.leituras.filter((l) => l.maquina_id).map((l) => ({ l, m: S.maquinas.find((m) => m.id === l.maquina_id) || { id: l.maquina_id, hostname: l.codigo_lido, ativo: '', tipo: 'outro' } }));
  const fora = encontradas.filter((x) => !idsEsp.has(x.m.id));
  const faltando = esp.filter((m) => !lidos.has(m.id));
  const desconhecidas = sess.leituras.filter((l) => !l.maquina_id);
  const ok = encontradas.length - fora.length;
  return { esp, encontradas, fora, faltando, desconhecidas, ok, pct: esp.length ? Math.min(100, Math.round((100 * ok) / esp.length)) : 0 };
}

/* ------------------------------------------------------------------ navegação (botão voltar do celular funciona) */
function ir(hash) { if (location.hash !== hash) location.hash = hash; else rotear(); }
async function rotear() {
  if (!S.user) return;
  const [tela, id] = location.hash.slice(1).split('/');
  fecharFolha();
  if (tela !== 'conf') liberarTela();
  if (tela === 'conf' && id) return abrirConf(id);
  if (tela === 'final' && id) return telaFinal(id);
  if (tela === 'pend') return telaPendencias();
  if (tela === 'mudar') return telaMudanca();
  if (tela === 'procurar') return telaProcurar();
  return telaInicio();
}
function mostrar(tela, { titulo, sub, voltar }) {
  // telas escondidas são esvaziadas: os ids do leitor (#ler, #res…) existem só na tela atual
  $$('#app .tela').forEach((t) => { t.hidden = t.id !== tela; if (t.hidden) t.innerHTML = ''; });
  $('#barra-titulo').textContent = titulo;
  $('#barra-sub').textContent = sub || '';
  $('#btn-voltar').hidden = !voltar;
  $('#barra-logo').hidden = !!voltar;
  window.scrollTo(0, 0);
}

/* ------------------------------------------------------------------ INÍCIO */
async function telaInicio() {
  S.sess = null;
  const el = $('#t-inicio');
  mostrar('t-inicio', { titulo: 'Conferência', sub: S.cd ? cdTxt(S.cd) : 'Inventário Quallit' });
  const sessoes = {};
  for (const id of await listaSessoes()) { const s = await idbGet(chaveSess(id)); if (s) sessoes[id] = s; }
  const prazoMs = (c) => (c.prazo_em ? new Date(c.prazo_em).getTime() : Infinity);
  const abertos = S.confs.filter((c) => c.status === 'aberta').sort((a, b) => prazoMs(a) - prazoMs(b));
  const finalizados = S.confs.filter((c) => c.status === 'finalizada').slice(0, 6);
  const pendentes = Object.values(sessoes).filter((s) => s.finalizarPendente);
  const primeiroNome = (S.perfil?.nome || S.user.email).split(/[\s@]/)[0];

  const progresso = (c) => {
    const s = sessoes[c.id];
    if (s) { const k = calcular(s); return { ...k, local: s.leituras.filter((l) => !l.enviado).length }; }
    const esp = esperadas(c); const ids = new Set(esp.map((m) => m.id));
    const ok = new Set((c.conferencia_itens || []).map((i) => i.maquina_id).filter((x) => ids.has(x))).size;
    return { esp, ok, pct: esp.length ? Math.round((100 * ok) / esp.length) : 0, local: 0 };
  };

  el.innerHTML = `
    <div class="ola">
      <h2>Olá, ${esc(primeiroNome)}</h2>
      <p>${S.cd ? `<button class="chip-cd" id="trocar-cd" ${ehAdmin() && S.cds.length > 1 ? '' : 'disabled'}><b>${esc(cdInfo(S.cd)?.codigo || '')}</b> ${esc(cdInfo(S.cd)?.nome || '')}${ehAdmin() && S.cds.length > 1 ? ' ▾' : ''}</button>` : 'Escolha um inventário para conferir.'}</p>
    </div>
    <div class="atalhos">
      <button class="atalho" id="at-pend"><span class="atalho-ico">📋</span><b>Pendências</b>${(() => { const n = listaPendencias().length; return n ? `<span class="atalho-num">${n}</span>` : '<small>nada a fazer</small>'; })()}</button>
      <button class="atalho" id="at-mudar"><span class="atalho-ico">🚚</span><b>Mudança</b><small>setor ou mesa</small></button>
      <button class="atalho" id="at-procurar"><span class="atalho-ico">🔎</span><b>Máquina</b><small>ficha e fotos</small></button>
    </div>
    ${pendentes.length ? `<div class="cartao" style="padding:14px 16px;border-color:var(--lar);background:var(--lar-soft)">
      <strong style="color:var(--lar)">${pendentes.length} inventário(s) aguardando internet</strong>
      <div class="muted" style="font-size:15px">Foram finalizados sem conexão e serão sincronizados automaticamente.</div>
      <button class="btn btn--lar btn--bloco" style="margin-top:10px" id="sinc-agora">Sincronizar agora</button></div>` : ''}
    <div class="sec-titulo"><span>Em andamento</span><button class="btn--texto btn" id="atualizar" style="min-height:36px">↻ Atualizar</button></div>
    ${abertos.length ? abertos.map((c) => { const p = progresso(c); return `
      <button class="inv ${c.prazo_em ? 'inv--prazo' : ''}" data-conf="${c.id}">
        <div class="inv-topo">${c.prazo_em ? anelPrazo(c, { tam: 58, progresso: p.esp.length ? p.ok / p.esp.length : 0 }) : ''}<div class="inv-tit"><h3>${c.agendamento_id ? '🔁 ' : ''}${esc(c.nome)}</h3><small>${esc(c.setor || 'Todos os setores')} · ${new Date(c.inicio_em || c.criado_em).toLocaleDateString('pt-BR')}</small>${c.prazo_em ? `<div>${etiquetaPrazo(c)}</div>` : ''}</div>
          ${sessoes[c.id]?.finalizarPendente ? '<span class="etq etq--lar">Na fila</span>' : p.local ? `<span class="etq etq--lar">${p.local} no aparelho</span>` : '<span class="etq etq--pri">Aberto</span>'}</div>
        <div class="barra-prog"><i style="width:${p.pct}%"></i></div>
        <div class="inv-num"><b>${p.ok}</b> de ${p.esp.length} encontradas · ${p.pct}%</div>
      </button>`; }).join('') : `<div class="cartao vazio"><b>Nenhum inventário aberto</b>Toque em <i>Novo inventário</i> para começar a contagem.</div>`}
    ${finalizados.length ? `<div class="sec-titulo"><span>Finalizados</span></div>
      ${finalizados.map((c) => { const pct = c.total_esperadas ? Math.round((100 * (c.total_encontradas || 0)) / c.total_esperadas) : null; return `
      <div class="inv" style="opacity:.85">
        <div class="inv-topo"><div><h3>${esc(c.nome)}</h3><small>${esc(c.setor || 'Todos os setores')} · ${c.finalizado_em ? new Date(c.finalizado_em).toLocaleDateString('pt-BR') : ''}</small></div>
          <span class="etq etq--ok">${pct != null ? pct + '%' : 'Finalizado'}</span></div>
        ${c.prazo_em ? `<div>${etiquetaPrazo(c)}</div>` : ''}
        ${c.total_esperadas != null ? `<div class="inv-num"><b>${c.total_encontradas}</b> de ${c.total_esperadas} · ${c.total_faltando} faltando</div>` : ''}
      </div>`; }).join('')}` : ''}
    <div class="rodape-fixo"><div><button class="btn btn--pri btn--grande" id="novo-inv">＋ Novo inventário</button></div></div>`;

  $$('[data-conf]', el).forEach((b) => (b.onclick = () => ir('#conf/' + b.dataset.conf)));
  $('#novo-inv').onclick = folhaNovoInventario;
  $('#atualizar').onclick = async () => { await Promise.all([carregarMaquinas(), carregarConfs(), carregarPendencias()]); telaInicio(); aviso(navigator.onLine ? 'Atualizado' : 'Sem internet: mostrando dados salvos'); };
  $('#at-pend').onclick = () => ir('#pend');
  $('#at-mudar').onclick = () => ir('#mudar');
  $('#at-procurar').onclick = () => ir('#procurar');
  $('#sinc-agora')?.addEventListener('click', () => sincronizarPendentes(true));
  $('#trocar-cd')?.addEventListener('click', folhaTrocarCD);
}

function folhaTrocarCD() {
  abrirFolha(`<h2>Escolher CD</h2><p class="sub">Administrador: escolha em qual CD vai conferir.</p>
    <div class="pilha">${S.cds.map((c) => `<button class="menu-item" data-cd="${c.id}"><span>${c.id === S.cd ? '●' : '○'}</span><span><b>${esc(c.codigo)}</b> · ${esc(c.nome)}</span></button>`).join('')}</div>`);
  $$('[data-cd]', $('#folha')).forEach((b) => (b.onclick = async () => {
    S.cd = b.dataset.cd; store.set('campo-cd', S.cd); fecharFolha();
    await Promise.all([carregarMaquinas(), carregarConfs(), carregarPendencias()]); telaInicio();
  }));
}

function folhaNovoInventario() {
  if (!navigator.onLine) return aviso('É preciso internet para criar um inventário. Depois de criado, a conferência funciona offline.', true);
  const setores = [...new Set(S.maquinas.map((m) => m.setor).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const nome = `Inventário ${new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}`;
  abrirFolha(`<h2>Novo inventário</h2><p class="sub">${esc(cdTxt(S.cd) || '')}</p>
    <form id="f-novo">
      <label class="campo"><span>Nome</span><input name="nome" value="${esc(nome)}" required autocomplete="off" enterkeyhint="done"></label>
      <label class="campo"><span>Setor</span><select name="setor"><option value="">Todos os setores (CD inteiro)</option>${setores.map((s) => `<option>${esc(s)}</option>`).join('')}</select></label>
      <button class="btn btn--pri btn--grande btn--bloco" id="f-novo-ok">Começar a conferir</button>
      <p class="erro" id="f-novo-erro"></p>
    </form>`);
  $('#f-novo').onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    $('#f-novo-ok').disabled = true;
    const row = { nome: String(fd.get('nome')).trim(), setor: fd.get('setor') || null };
    if (S.cd) row.cd_id = S.cd;
    const { data: d, error } = await sb.from('conferencias').insert(row).select('*').single();
    $('#f-novo-ok').disabled = false;
    if (error) return ($('#f-novo-erro').textContent = error.message);
    d.conferencia_itens = [];
    S.confs.unshift(d);
    fecharFolha();
    ir('#conf/' + d.id);
  };
}

/* ------------------------------------------------------------------ CONFERÊNCIA */
async function abrirConf(id) {
  let sess = (S.sess?.conf.id === id && S.sess) || (await idbGet(chaveSess(id)));
  let conf = S.confs.find((c) => c.id === id) || sess?.conf;
  // busca no servidor as leituras de outras pessoas e o estado atual do inventário
  if (navigator.onLine) {
    const [rc, ri] = await Promise.all([
      sb.from('conferencias').select('*').eq('id', id).maybeSingle(),
      sb.from('conferencia_itens').select('*').eq('conferencia_id', id),
    ]);
    if (rc.data) conf = rc.data;
    if (!sess) sess = { conf, leituras: [] };
    sess.conf = conf;
    for (const it of ri.data || []) {
      const ja = sess.leituras.find((l) => l.srvId === it.id || (l.maquina_id && l.maquina_id === it.maquina_id) || up(l.codigo_lido) === up(it.codigo_lido));
      if (ja) { ja.enviado = true; ja.srvId = it.id; } else sess.leituras.push({ lid: 's' + it.id, srvId: it.id, maquina_id: it.maquina_id, codigo_lido: it.codigo_lido, localizacao: it.localizacao, lido_em: it.lido_em, lido_por: it.lido_por, enviado: true });
    }
  }
  if (!conf) { aviso('Inventário não encontrado neste aparelho. Abra com internet uma vez.', true); return ir('#inicio'); }
  if (!sess) sess = { conf, leituras: [] };
  S.sess = sess;
  await salvarSessao();
  if (sess.finalizarPendente) { aviso('Este inventário já foi finalizado neste celular e aguarda internet para sincronizar.'); return ir('#inicio'); }
  if (conf.status === 'finalizada') {
    aviso('Este inventário já foi finalizado.', true);
    await apagarSessao(id);
    return ir('#inicio');
  }
  telaConf();
}

function telaConf() {
  const sess = S.sess, c = sess.conf;
  mostrar('t-conf', { titulo: c.nome, sub: `${c.setor || 'Todos os setores'}${S.cd ? ' · ' + (cdInfo(c.cd_id)?.codigo || '') : ''}`, voltar: true });
  S.local ||= store.get('campo-local') || '';
  const el = $('#t-conf');
  el.innerHTML = `
    ${c.prazo_em ? '<div id="prazo-conf"></div>' : ''}
    <div class="cartao prog" id="prog"></div>
    <div class="cartao leitor">
      <form class="leitor-linha" id="f-ler" autocomplete="off">
        <input class="leitor-input" id="ler" placeholder="Bipe ou digite o patrimônio" autocapitalize="characters" autocorrect="off" spellcheck="false" enterkeyhint="go" inputmode="text">
        <button class="btn btn--pri leitor-ok" aria-label="Registrar">OK</button>
      </form>
      <div class="resultado" id="res"><span class="muted">Leia a etiqueta com o leitor ou a câmera, ou digite patrimônio / hostname / série. Também dá para tocar numa máquina em <b>Faltando</b> para marcar manualmente.</span></div>
      ${navigator.mediaDevices?.getUserMedia ? `<button class="btn btn-camera btn--bloco" id="btn-cam"><svg viewBox="0 0 24 24"><path d="M4 8h3l2-3h6l2 3h3v11H4z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><circle cx="12" cy="13" r="3.5" fill="none" stroke="currentColor" stroke-width="2"/></svg>Ler etiquetas com a câmera</button>` : ''}
      <button class="local-chip" id="btn-local">📍 <span>Local atual: <b id="local-txt">${esc(S.local || 'não informado')}</b></span></button>
    </div>
    <div class="abas" id="abas"></div>
    <div class="busca"><input id="busca" type="search" placeholder="Filtrar a lista…" value="${esc(S.busca)}" enterkeyhint="search" autocomplete="off"></div>
    <div class="lista" id="lista"></div>
    <div class="rodape-fixo"><div><button class="btn btn--lar btn--grande" id="btn-finalizar">Finalizar inventário</button></div></div>`;

  $('#f-ler').onsubmit = (e) => { e.preventDefault(); const v = $('#ler').value; $('#ler').value = ''; registrar(v); };
  $('#btn-cam')?.addEventListener('click', () => abrirCamera(registrar));
  $('#btn-local').onclick = folhaLocal;
  $('#btn-finalizar').onclick = () => ir('#final/' + c.id);
  $('#busca').oninput = debounce((e) => { S.busca = e.target.value; desenharLista(); }, 120);
  $('#lista').onclick = (e) => { const b = e.target.closest('[data-i]'); if (b) folhaItem(b.dataset.tipo, b.dataset.i); };
  desenharProg();
  desenharLista();
  manterTelaLigada();
}

function desenharPrazo(k) {
  const el = $('#prazo-conf');
  if (!el) return;
  const datas = S.sess.leituras.map((l) => l.lido_em).filter(Boolean).sort();
  el.innerHTML = relogioCompleto(S.sess.conf, { encontradas: k.ok, esperadas: k.esp.length, primeiraLeitura: datas[0] || null });
}
function desenharProg() {
  const k = calcular();
  desenharPrazo(k);
  const local = S.sess.leituras.filter((l) => !l.enviado).length;
  $('#prog').innerHTML = `
    <div class="prog-topo"><div class="prog-num">${k.ok}<small> / ${k.esp.length}</small></div><div class="prog-pct">${k.pct}%</div></div>
    <div class="barra-prog"><i style="width:${k.pct}%"></i></div>
    <div class="contadores">
      <button class="contador contador--bad" data-aba="faltando"><b>${k.faltando.length}</b><span>Faltando</span></button>
      <button class="contador contador--warn" data-aba="encontradas"><b>${k.fora.length}</b><span>Fora</span></button>
      <button class="contador contador--lar" data-aba="desconhecidas"><b>${k.desconhecidas.length}</b><span>Não cad.</span></button>
    </div>
    ${local ? `<div class="muted" style="font-size:13px">📱 ${local} leitura(s) no aparelho · enviadas ao finalizar</div>` : ''}`;
  $$('[data-aba]', $('#prog')).forEach((b) => (b.onclick = () => { S.aba = b.dataset.aba; desenharLista(); $('#abas').scrollIntoView({ behavior: 'smooth', block: 'start' }); }));
}

function desenharLista() {
  const k = calcular();
  const abas = [['faltando', 'Faltando', k.faltando.length], ['encontradas', 'Encontradas', k.encontradas.length], ['desconhecidas', 'Não cad.', k.desconhecidas.length]];
  $('#abas').innerHTML = abas.map(([id, l, n]) => `<button class="aba ${S.aba === id ? 'ativa' : ''}" data-a="${id}"><b>${n}</b>${l}</button>`).join('');
  $$('[data-a]', $('#abas')).forEach((b) => (b.onclick = () => { S.aba = b.dataset.a; desenharLista(); }));
  const termos = up(S.busca).split(/\s+/).filter(Boolean);
  const casa = (txt) => termos.every((t) => up(txt).includes(t));
  let html = '';
  const LIM = 150;
  if (S.aba === 'faltando') {
    const l = k.faltando.filter((m) => casa(`${m.hostname} ${m.ativo} ${m.numero_serie} ${m.modelo} ${m.setor} ${m.localizacao}`));
    html = l.slice(0, LIM).map((m) => `<button class="item" data-tipo="falta" data-i="${m.id}"><span class="ponto ponto--bad"></span>
      <span class="item-txt"><strong>${esc(m.ativo || m.hostname)}</strong><span>${esc(m.hostname)} · ${esc(TIPO[m.tipo] || '')} ${esc(m.modelo || '')}</span></span>
      <span class="item-lado">${esc(m.localizacao || m.setor || '')}</span></button>`).join('')
      + (l.length > LIM ? `<div class="mais">+ ${l.length - LIM} — use o filtro</div>` : '')
      || `<div class="cartao vazio"><b>${k.faltando.length ? 'Nada com esse filtro' : 'Nada faltando 🎉'}</b>${k.faltando.length ? '' : 'Todas as máquinas esperadas foram encontradas.'}</div>`;
  } else if (S.aba === 'encontradas') {
    const foraIds = new Set(k.fora.map((x) => x.m.id));
    const l = [...k.encontradas].sort((a, b) => new Date(b.l.lido_em) - new Date(a.l.lido_em)).filter((x) => casa(`${x.m.hostname} ${x.m.ativo} ${x.l.codigo_lido}`));
    html = l.slice(0, LIM).map((x) => `<button class="item" data-tipo="lida" data-i="${x.l.lid}"><span class="ponto ${foraIds.has(x.m.id) ? 'ponto--warn' : 'ponto--ok'}"></span>
      <span class="item-txt"><strong>${esc(x.m.ativo || x.m.hostname)}</strong><span>${esc(x.m.hostname)}${foraIds.has(x.m.id) ? ' · fora do esperado' : ''}${x.l.manual ? ' · manual' : ''}</span></span>
      <span class="item-lado">${hora(x.l.lido_em)}${x.l.enviado ? '' : '<span class="etq etq--lar">📱</span>'}</span></button>`).join('')
      || '<div class="cartao vazio"><b>Nenhuma leitura ainda</b>As máquinas lidas aparecem aqui.</div>';
  } else {
    const l = k.desconhecidas.filter((x) => casa(x.codigo_lido));
    html = l.map((x) => `<button class="item" data-tipo="desc" data-i="${x.lid}"><span class="ponto ponto--lar"></span>
      <span class="item-txt"><strong>${esc(x.codigo_lido)}</strong><span>Não cadastrada${x.localizacao ? ' · ' + esc(x.localizacao) : ''}</span></span>
      <span class="item-lado">${hora(x.lido_em)}${x.enviado ? '' : '<span class="etq etq--lar">📱</span>'}</span></button>`).join('')
      || '<div class="cartao vazio"><b>Nenhum código desconhecido</b>Códigos que não existem no inventário aparecem aqui.</div>';
  }
  $('#lista').innerHTML = html;
}

function mostrarResultado(cls, titulo, detalhe, acoes = '') {
  sinal(cls);
  const r = $('#res');
  if (r) {
    r.className = `resultado ${cls} pop`;
    r.innerHTML = `<strong>${titulo}</strong><span>${detalhe}</span>${acoes ? `<div class="acoes-res">${acoes}</div>` : ''}`;
    void r.offsetWidth;
  }
  const cu = $('#cam-ultimo');
  if (!$('#camera').hidden) { cu.hidden = false; cu.className = `cam-ultimo ${cls}`; cu.innerHTML = `${titulo}<div style="font-weight:400;font-size:15px">${detalhe}</div>`; }
}

async function registrar(bruto, { manual = false, maquina = null } = {}) {
  const codigo = extrairCodigo(bruto);
  if (!codigo) return;
  const sess = S.sess;
  const m = maquina || acharMaquina(codigo);
  const ja = sess.leituras.find((l) => (m && l.maquina_id === m.id) || up(l.codigo_lido) === up(codigo));
  if (ja) return mostrarResultado('warn', `Já lida — ${esc(m?.ativo || m?.hostname || codigo)}`, `Registrada às ${hora(ja.lido_em)}${ja.lido_por && ja.lido_por !== S.user.email ? ' por ' + esc(ja.lido_por.split('@')[0]) : ''}.`);
  const leitura = { lid: idAleatorio(), maquina_id: m?.id || null, codigo_lido: codigo, localizacao: S.local || null, lido_em: new Date().toISOString(), lido_por: S.user.email, manual, enviado: false };
  sess.leituras.push(leitura);
  await salvarSessao();
  if (!m) {
    mostrarResultado('bad', `Não cadastrada: ${esc(codigo)}`, 'Este código não existe no inventário deste CD. A leitura foi guardada para a TI analisar.',
      `<button class="btn" data-desfazer="${leitura.lid}">Desfazer</button>`);
  } else {
    const esp = esperadas(sess.conf).some((x) => x.id === m.id);
    const det = `${esc(m.hostname)} · ${esc(TIPO[m.tipo] || '')} ${esc(m.modelo || '')}${manual ? ' · marcada manualmente' : ''}`;
    const desf = `<button class="btn" data-desfazer="${leitura.lid}">Desfazer</button>`;
    if (esp) mostrarResultado('ok', `✓ ${esc(m.ativo || m.hostname)}`, det, manual ? desf : '');
    else if (['extraviado', 'descartado'].includes(m.status)) mostrarResultado('warn', `${esc(m.ativo || m.hostname)} estava como ${STATUS[m.status]}`, det + '. Avise a TI para corrigir o status.', desf);
    else mostrarResultado('warn', `${esc(m.ativo || m.hostname)} — fora do esperado`, `${det}. Cadastrada no setor ${esc(m.setor || '—')}.`, desf);
  }
  $$('[data-desfazer]').forEach((b) => (b.onclick = () => desfazer(b.dataset.desfazer)));
  desenharProg(); desenharLista();
}

async function desfazer(lid) {
  const l = S.sess.leituras.find((x) => x.lid === lid);
  if (!l) return;
  if (l.enviado) return aviso('Esta leitura já foi enviada ao sistema. Peça a um administrador para removê-la.', true);
  S.sess.leituras = S.sess.leituras.filter((x) => x.lid !== lid);
  await salvarSessao();
  $('#res').className = 'resultado'; $('#res').innerHTML = '<span class="muted">Leitura desfeita.</span>';
  desenharProg(); desenharLista();
  aviso('Leitura desfeita');
}

function folhaItem(tipo, id) {
  if (tipo === 'falta') {
    const m = S.maquinas.find((x) => x.id === id);
    abrirFolha(`<h2 class="mono">${esc(m.ativo || m.hostname)}</h2><p class="sub">${esc(TIPO[m.tipo] || '')} ${esc(m.modelo || '')}</p>
      <dl class="dados"><div><dt>Hostname</dt><dd class="mono">${esc(m.hostname)}</dd></div><div><dt>Nº de série</dt><dd class="mono">${esc(m.numero_serie || '—')}</dd></div>
        <div><dt>Setor</dt><dd>${esc(m.setor || '—')}</dd></div><div><dt>Localização</dt><dd>${esc(m.localizacao || '—')}</dd></div>
        <div><dt>Status</dt><dd>${esc(STATUS[m.status] || m.status)}</dd></div><div><dt>Última coleta</dt><dd>${rel(m.ultimo_online)}</dd></div></dl>
      <div class="pilha"><button class="btn btn--pri btn--grande btn--bloco" id="marcar">✓ Encontrei esta máquina</button>
      <button class="btn btn--bloco" data-fechar>Fechar</button></div>`);
    $('#marcar').onclick = () => { fecharFolha(); registrar(m.ativo || m.hostname, { manual: true, maquina: m }); };
    return;
  }
  const l = S.sess.leituras.find((x) => x.lid === id);
  if (!l) return;
  const m = l.maquina_id ? S.maquinas.find((x) => x.id === l.maquina_id) : null;
  abrirFolha(`<h2 class="mono">${esc(m ? m.ativo || m.hostname : l.codigo_lido)}</h2>
    <p class="sub">${m ? `${esc(m.hostname)} · ${esc(TIPO[m.tipo] || '')} ${esc(m.modelo || '')}` : 'Código não cadastrado no inventário'}</p>
    <dl class="dados"><div><dt>Lida em</dt><dd>${dataHora(l.lido_em)}</dd></div><div><dt>Por</dt><dd>${esc((l.lido_por || '').split('@')[0])}</dd></div>
      <div><dt>Local</dt><dd>${esc(l.localizacao || '—')}</dd></div><div><dt>Situação</dt><dd>${l.enviado ? 'Enviada ao sistema' : '📱 No aparelho'}</dd></div>
      ${l.manual ? '<div><dt>Forma</dt><dd>Marcada manualmente</dd></div>' : ''}</dl>
    <div class="pilha">${l.enviado ? '' : '<button class="btn btn--perigo btn--bloco" id="desf">Desfazer esta leitura</button>'}<button class="btn btn--bloco" data-fechar>Fechar</button></div>`);
  $('#desf')?.addEventListener('click', () => { fecharFolha(); desfazer(l.lid); });
}

function folhaLocal() {
  abrirFolha(`<h2>Local atual</h2><p class="sub">Fica gravado em cada leitura (ex.: corredor, doca, sala). Ajuda a TI a encontrar a máquina depois.</p>
    <form id="f-local"><label class="campo"><span>Local</span><input name="local" value="${esc(S.local)}" placeholder="Ex.: Expedição — doca 3" autocomplete="off" enterkeyhint="done"></label>
    <button class="btn btn--pri btn--grande btn--bloco">Salvar</button></form>`);
  $('#f-local').onsubmit = (e) => {
    e.preventDefault();
    S.local = String(new FormData(e.target).get('local')).trim();
    store.set('campo-local', S.local);
    $('#local-txt').textContent = S.local || 'não informado';
    fecharFolha();
  };
}

/* ------------------------------------------------------------------ leitor reaproveitável (mudança, procurar) */
function leitorHTML(placeholder = 'Bipe ou digite o patrimônio') {
  return `<div class="cartao leitor">
      <form class="leitor-linha" id="f-ler" autocomplete="off">
        <input class="leitor-input" id="ler" placeholder="${esc(placeholder)}" autocapitalize="characters" autocorrect="off" spellcheck="false" enterkeyhint="go" inputmode="text">
        <button class="btn btn--pri leitor-ok" aria-label="OK">OK</button>
      </form>
      <div class="resultado" id="res"><span class="muted">Leia a etiqueta com o leitor ou a câmera, ou digite patrimônio / hostname / série.</span></div>
      ${navigator.mediaDevices?.getUserMedia ? `<button class="btn btn-camera btn--bloco" id="btn-cam"><svg viewBox="0 0 24 24"><path d="M4 8h3l2-3h6l2 3h3v11H4z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><circle cx="12" cy="13" r="3.5" fill="none" stroke="currentColor" stroke-width="2"/></svg>Ler etiquetas com a câmera</button>` : ''}
    </div>`;
}
function ligarLeitor(aoLer) {
  $('#f-ler').onsubmit = (e) => { e.preventDefault(); const v = $('#ler').value; $('#ler').value = ''; aoLer(v); };
  $('#btn-cam')?.addEventListener('click', () => abrirCamera(aoLer));
}
const fecharCamera = () => { if (!$('#camera').hidden) cam?.fechar?.(); };

/* ------------------------------------------------------------------ PENDÊNCIAS do CD */
// Só o que o field resolve na prática. Compra, renovação, memória e HDD ficam com a gestão, no painel.
// Alertas que o administrador ocultou numa máquina já não vêm do banco.
const PEND = {
  hw_reduzido:           { l: 'Peça removida?', g: 1, dica: 'A memória ou o disco diminuiu. Confira a máquina: pente ou disco retirado ou com defeito.', acao: 'verificar' },
  estoque_online:        { l: 'Estoque sendo usado?', g: 1, dica: 'Está como estoque ou descartada, mas foi coletada nos últimos dias. Veja onde ela está e avise a TI para corrigir o status.' },
  fora_do_cd:            { l: 'Na rede de outro CD', g: 1, dica: 'Apareceu na rede de outro CD. Confira se foi transferida.' },
  hostname_duplicado:    { l: 'Nome repetido', g: 1, dica: 'Há outra máquina com o mesmo nome neste CD. Confira as duas etiquetas e avise a TI.' },
  emprestimo_atrasado:   { l: 'Devolução atrasada', g: 1, dica: 'O empréstimo passou da data de devolução. Cobre o colaborador.' },
  bateria_ruim:          { l: 'Bateria ruim', g: 1, dica: 'Coletor com bateria fraca ou com defeito. Separe para troca.' },
  disco_cheio:           { l: 'Disco cheio', g: 1, dica: 'Pouco espaço livre. Limpe arquivos temporários ou chame a TI.' },
  sem_bitlocker:         { l: 'BitLocker desligado', g: 1, dica: 'Disco sem criptografia. Chame a TI para ligar.' },
  antivirus_off:         { l: 'Antivírus desligado', g: 1, dica: 'Antivírus desligado ou desatualizado. Chame a TI.' },
  sem_ativo:             { l: 'Sem patrimônio', g: 0, dica: 'Sem número de patrimônio no sistema. Bipe ou digite a etiqueta de patrimônio da máquina.', acao: 'patrimonio' },
  sem_contato:           { l: 'Coleta desatualizada', g: 0, dica: 'Sem coleta há mais de 6 meses. Passe o Invent_local (ou o kit dos coletores) nesta máquina.' },
  windows_desatualizado: { l: 'Windows sem atualização', g: 0, dica: 'Mais de 45 dias sem atualizar o Windows. Deixe a máquina ligada na rede ou chame a TI.' },
};
S.pend = [];
async function carregarPendencias() {
  const chave = 'campo:pend:' + (S.cd || 'todos');
  try {
    let q = sb.from('vw_maquinas').select('id, hostname, ativo, numero_serie, tipo, modelo, setor, localizacao, responsavel, status, cd_id, ultimo_online, alertas, hw_reducao, emprestimo_atual').order('hostname').limit(5000);
    if (S.cd) q = q.eq('cd_id', S.cd);
    const { data: d, error } = await q;
    if (error) throw error;
    S.pend = d.filter((m) => (m.alertas || []).some((k) => PEND[k]));
    idbSet(chave, S.pend);
  } catch {
    S.pend = (await idbGet(chave)) || [];
  }
}
const listaPendencias = () => S.pend.flatMap((m) => (m.alertas || []).filter((k) => PEND[k]).map((k) => ({ k, m })));

async function telaPendencias() {
  mostrar('t-pend', { titulo: 'Pendências', sub: S.cd ? cdTxt(S.cd) : '', voltar: true });
  const desenhar = () => {
    const el = $('#t-pend');
    if (!el || el.hidden) return;
    const itens = listaPendencias();
    const grupos = Object.entries(PEND).map(([k, p]) => ({ k, ...p, ms: itens.filter((x) => x.k === k).map((x) => x.m) })).filter((g) => g.ms.length);
    el.innerHTML = `<p class="muted pend-intro">${navigator.onLine ? 'O que precisa de atenção nas máquinas do CD.' : 'Sem internet: mostrando a última lista salva.'} Toque numa máquina para ver o que fazer.</p>
      ${grupos.length ? grupos.map((g) => `<details class="pend-grupo cartao" ${grupos.length <= 3 ? 'open' : ''}>
          <summary><span class="ponto ${g.g ? 'ponto--bad' : 'ponto--warn'}"></span><b>${esc(g.l)}</b><span class="etq ${g.g ? 'etq--bad' : 'etq--lar'}">${g.ms.length}</span></summary>
          <p class="pend-dica">${esc(g.dica)}</p>
          <div class="lista">${g.ms.map((m) => `<button class="item" data-pm="${m.id}"><span class="item-txt"><strong>${esc(m.ativo || m.hostname)}</strong><span>${esc(m.hostname)} · ${esc(m.setor || 'sem setor')}${m.localizacao ? ' · ' + esc(m.localizacao) : ''}</span></span><span class="item-lado">›</span></button>`).join('')}</div>
        </details>`).join('')
        : '<div class="cartao vazio"><b>Nada pendente 🎉</b>Nenhuma máquina do CD precisa de ação agora.</div>'}`;
    $$('[data-pm]', el).forEach((b) => (b.onclick = () => fichaMaquina(S.pend.find((x) => x.id === b.dataset.pm), { aoMudar: async () => { await carregarPendencias(); desenhar(); } })));
  };
  desenhar();
  if (navigator.onLine) { await carregarPendencias(); desenhar(); }
}

/* ------------------------------------------------------------------ FICHA da máquina (folha): dados, o que fazer e fotos */
function fichaMaquina(m, opc = {}) {
  if (!m) return;
  const base = S.maquinas.find((x) => x.id === m.id);
  if (base) m = { ...m, ...base };
  const p = S.pend.find((x) => x.id === m.id);
  const pend = (p?.alertas || []).filter((k) => PEND[k]);
  const emp = p?.emprestimo_atual;
  abrirFolha(`<h2 class="mono">${esc(m.ativo || m.hostname)}</h2><p class="sub">${esc(TIPO[m.tipo] || '')} ${esc(m.modelo || '')}</p>
    ${pend.map((k) => `<div class="pend-caixa ${PEND[k].g ? 'ruim' : ''}"><b>${esc(PEND[k].l)}</b><span>${esc(PEND[k].dica)}</span>
      ${k === 'emprestimo_atrasado' && emp ? `<span>Com <b>${esc(emp.colaborador)}</b>${emp.previsto_devolucao ? ' · devolver até ' + dataHora(emp.previsto_devolucao) : ''}</span>` : ''}
      ${k === 'hw_reduzido' && p.hw_reducao ? `<span>${p.hw_reducao.campo === 'memoria_gb' ? 'Memória' : 'Armazenamento'}: ${esc(p.hw_reducao.de)} → ${esc(p.hw_reducao.para)} GB</span>` : ''}
      ${PEND[k].acao === 'verificar' ? '<button class="btn btn--pri btn--bloco" data-acao="verificar">✓ Conferi a máquina</button>' : ''}
      ${PEND[k].acao === 'patrimonio' ? '<button class="btn btn--pri btn--bloco" data-acao="patrimonio">🏷 Cadastrar o patrimônio</button>' : ''}</div>`).join('')}
    <dl class="dados"><div><dt>Hostname</dt><dd class="mono">${esc(m.hostname)}</dd></div><div><dt>Nº de série</dt><dd class="mono">${esc(m.numero_serie || '—')}</dd></div>
      <div><dt>Setor</dt><dd>${esc(m.setor || '—')}</dd></div><div><dt>Localização</dt><dd>${esc(m.localizacao || '—')}</dd></div>
      <div><dt>Responsável</dt><dd>${esc(m.responsavel || '—')}</dd></div><div><dt>Status</dt><dd>${esc(STATUS[m.status] || m.status || '—')}</dd></div>
      <div><dt>Última coleta</dt><dd>${rel(m.ultimo_online)}</dd></div></dl>
    <div class="sec-titulo ficha-sec"><span>Fotos</span></div>
    <div class="fotos-campo" id="ficha-fotos"><span class="muted">Carregando…</span></div>
    <div class="pilha" style="margin-top:14px">
      <label class="btn btn-camera btn--bloco">📷 Tirar foto<input type="file" accept="image/*" capture="environment" id="ficha-foto-arq" hidden></label>
      <a class="btn btn--bloco" href="../index.html#maquina/${encodeURIComponent(m.ativo || m.hostname)}">🖥 Abrir no painel</a>
      <button class="btn btn--bloco" data-fechar>Fechar</button>
    </div>`);
  const f = $('#folha');
  $('[data-acao=verificar]', f)?.addEventListener('click', async () => {
    if (!navigator.onLine) return aviso('Sem internet. Tente de novo quando o sinal voltar.', true);
    if (!(await confirmar('Confirma que você conferiu a máquina fisicamente (memória e disco)? O alerta some até uma nova redução.', { titulo: 'Marcar como verificado?', ok: 'Conferi' }))) return;
    const { error } = await sb.from('maquinas').update({ hw_verificado_em: new Date().toISOString() }).eq('id', m.id);
    if (error) return aviso(error.message, true);
    fecharFolha(); aviso('Alerta marcado como verificado'); opc.aoMudar?.();
  });
  $('[data-acao=patrimonio]', f)?.addEventListener('click', () => folhaPatrimonio(m, opc));
  $('#ficha-foto-arq').onchange = (e) => { const arq = e.target.files?.[0]; if (arq) novaFoto(arq, m, opc); };
  fotosDaFicha(m, opc);
}

function folhaPatrimonio(m, opc) {
  abrirFolha(`<h2>Cadastrar patrimônio</h2><p class="sub">${esc(m.hostname)} · ${esc(TIPO[m.tipo] || '')} ${esc(m.modelo || '')}</p>
    <form id="f-pat"><label class="campo"><span>Número de patrimônio</span><input name="ativo" class="leitor-input" placeholder="Bipe ou digite" autocapitalize="characters" autocorrect="off" spellcheck="false" autocomplete="off" required enterkeyhint="done"></label>
      ${navigator.mediaDevices?.getUserMedia ? '<button type="button" class="btn btn--bloco" id="pat-cam">📷 Ler a etiqueta com a câmera</button>' : ''}
      <button class="btn btn--pri btn--grande btn--bloco" id="f-pat-ok">Salvar</button>
      <p class="erro" id="f-pat-erro"></p></form>
    <button class="btn btn--bloco" id="pat-voltar">Voltar</button>`);
  const inp = $('#f-pat [name=ativo]');
  $('#pat-voltar').onclick = () => fichaMaquina(m, opc);
  $('#pat-cam')?.addEventListener('click', () => abrirCamera((v) => { fecharCamera(); inp.value = extrairCodigo(v); }));
  $('#f-pat').onsubmit = async (e) => {
    e.preventDefault();
    const ativo = up(extrairCodigo(inp.value));
    if (!ativo) return;
    if (!navigator.onLine) return ($('#f-pat-erro').textContent = 'Sem internet. Tente de novo quando o sinal voltar.');
    $('#f-pat-ok').disabled = true;
    const { error } = await sb.from('maquinas').update({ ativo }).eq('id', m.id);
    $('#f-pat-ok').disabled = false;
    if (error) return ($('#f-pat-erro').textContent = error.code === '23505' ? `O patrimônio ${ativo} já está em outra máquina. Confira a etiqueta.` : error.message);
    const local = S.maquinas.find((x) => x.id === m.id);
    if (local) local.ativo = ativo;
    fecharFolha(); aviso(`Patrimônio ${ativo} cadastrado`); opc.aoMudar?.();
  };
}

/* ---- fotos na ficha (o painel mostra as mesmas) ---- */
async function fotosDaFicha(m, opc) {
  const el = $('#ficha-fotos');
  if (!el) return;
  if (!navigator.onLine) { el.innerHTML = '<span class="muted">Sem internet: as fotos aparecem quando o sinal voltar.</span>'; return; }
  try {
    const fotos = await listarFotos(sb, m.id);
    if (!$('#ficha-fotos')) return;
    el.innerHTML = fotos.length ? fotos.map((f) => `<button class="foto-mini" data-foto-id="${f.id}"><img data-foto="${esc(f.caminho)}" alt="${esc(f.legenda || 'Foto da máquina')}"></button>`).join('')
      : '<span class="muted">Nenhuma foto ainda. Registre o estado do equipamento, um defeito ou a etiqueta.</span>';
    carregarMiniaturas(sb, el);
    $$('[data-foto-id]', el).forEach((b) => (b.onclick = () => verFoto(fotos.find((x) => String(x.id) === b.dataset.fotoId), m, opc)));
  } catch (e) { el.innerHTML = `<span class="muted">${esc(erroFoto(e))}</span>`; }
}
function verFoto(f, m, opc) {
  const pode = ehAdmin() || f.criado_por === S.user.id;
  abrirFolha(`<h2>${esc(f.legenda || 'Foto')}</h2><p class="sub">${esc(m.ativo || m.hostname)} · ${dataHora(f.criado_em)}${f.criado_por_email ? ' · ' + esc(f.criado_por_email.split('@')[0]) : ''}</p>
    <img class="foto-grande" data-foto="${esc(f.caminho)}" alt="${esc(f.legenda || 'Foto da máquina')}">
    <div class="pilha" style="margin-top:14px">${pode ? '<button class="btn btn--perigo btn--bloco" id="foto-apagar">Apagar foto</button>' : ''}<button class="btn btn--bloco" id="foto-voltar">Voltar</button></div>`);
  carregarMiniaturas(sb, $('#folha'));
  $('#foto-voltar').onclick = () => fichaMaquina(m, opc);
  $('#foto-apagar')?.addEventListener('click', async () => {
    if (!(await confirmar('A foto será apagada definitivamente.', { titulo: 'Apagar foto?', ok: 'Apagar', perigo: true }))) return;
    try { await apagarFoto(sb, f); aviso('Foto apagada'); fichaMaquina(m, opc); } catch (e) { aviso(erroFoto(e), true); }
  });
}
function novaFoto(arq, m, opc) {
  const previa = URL.createObjectURL(arq);
  abrirFolha(`<h2>Nova foto</h2><p class="sub">${esc(m.ativo || m.hostname)}</p>
    <img class="foto-grande" src="${previa}" alt="Prévia da foto">
    <form id="f-foto" style="margin-top:14px"><label class="campo"><span>Legenda (opcional)</span><input name="legenda" maxlength="200" placeholder="Ex.: tela trincada, etiqueta, mesa" autocomplete="off" enterkeyhint="done"></label>
      <button class="btn btn--pri btn--grande btn--bloco" id="f-foto-ok">Enviar foto</button></form>
    <button class="btn btn--bloco" id="f-foto-cancelar" style="margin-top:10px">Cancelar</button>`);
  const sair = () => { URL.revokeObjectURL(previa); fichaMaquina(m, opc); };
  $('#f-foto-cancelar').onclick = sair;
  $('#f-foto').onsubmit = async (e) => {
    e.preventDefault();
    if (!navigator.onLine) return aviso('Sem internet: a foto precisa de sinal para ser enviada.', true);
    const b = $('#f-foto-ok'); b.disabled = true; b.textContent = 'Enviando…';
    try { await enviarFoto(sb, m.id, arq, new FormData(e.target).get('legenda')); aviso('Foto enviada'); sair(); }
    catch (er) { b.disabled = false; b.textContent = 'Enviar foto'; aviso(erroFoto(er), true); }
  };
}

/* ------------------------------------------------------------------ MUDANÇA de setor/mesa em lote */
// Escolhe o destino uma vez e vai bipando: cada máquina muda na hora (com internet) e entra no histórico.
S.mud = null;
function telaMudanca() {
  mostrar('t-mudar', { titulo: 'Mudança de setor', sub: S.cd ? cdTxt(S.cd) : '', voltar: true });
  if (S.mud) desenharMudanca(); else formMudanca();
}
function formMudanca() {
  const el = $('#t-mudar');
  const v = S.mud || {};
  const setores = [...new Set(S.maquinas.map((m) => m.setor).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  el.innerHTML = `<div class="cartao" style="padding:16px">
    <p class="muted" style="margin:0 0 14px">Escolha para onde as máquinas vão. Depois é só bipar as etiquetas: cada máquina já muda no sistema na hora.</p>
    <form id="f-mud" class="pilha">
      <label class="campo"><span>Novo setor</span><input name="setor" list="mud-setores" value="${esc(v.setor || '')}" required autocomplete="off" enterkeyhint="next"></label>
      <datalist id="mud-setores">${setores.map((s) => `<option value="${esc(s)}">`).join('')}</datalist>
      <label class="campo"><span>Localização / mesa (opcional)</span><input name="localizacao" value="${esc(v.localizacao || '')}" placeholder="Ex.: sala 2, mesa 14" autocomplete="off" enterkeyhint="next"></label>
      <label class="campo"><span>Responsável (opcional)</span><input name="responsavel" value="${esc(v.responsavel || '')}" placeholder="Nome de quem vai usar" autocomplete="off" enterkeyhint="done"></label>
      <p class="muted" style="margin:0;font-size:15px">Campo opcional em branco não muda o que já está cadastrado.</p>
      <button class="btn btn--pri btn--grande btn--bloco">${S.mud ? 'Continuar bipando' : 'Começar a bipar'}</button>
    </form></div>`;
  $('#f-mud').onsubmit = (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const txt = (k) => String(fd.get(k) || '').trim() || null;
    S.mud = { setor: txt('setor'), localizacao: txt('localizacao'), responsavel: txt('responsavel'), movidas: S.mud?.movidas || [] };
    desenharMudanca();
  };
}
function desenharMudanca() {
  const el = $('#t-mudar');
  const d = S.mud;
  el.innerHTML = `<div class="cartao mud-destino"><div><small>Movendo para</small><b>${esc(d.setor)}</b>
      ${d.localizacao ? `<span>📍 ${esc(d.localizacao)}</span>` : ''}${d.responsavel ? `<span>👤 ${esc(d.responsavel)}</span>` : ''}</div>
      <button class="btn" id="mud-alterar">Alterar</button></div>
    ${leitorHTML()}
    <div class="sec-titulo"><span id="mud-qtd"></span></div>
    <div class="lista" id="mud-lista"></div>
    <div class="rodape-fixo"><div><button class="btn btn--pri btn--grande" id="mud-fim">Concluir mudança</button></div></div>`;
  ligarLeitor(moverMaquina);
  $('#mud-alterar').onclick = formMudanca;
  $('#mud-fim').onclick = () => {
    const n = S.mud.movidas.length;
    S.mud = null;
    if (n) aviso(`${n} máquina(s) movida(s)`);
    ir('#inicio');
  };
  el.onclick = (e) => { const b = e.target.closest('[data-desf-mud]'); if (b) desfazerMudanca(b.dataset.desfMud); };
  desenharListaMud();
}
function desenharListaMud() {
  const l = S.mud?.movidas || [];
  if (!$('#mud-lista')) return;
  $('#mud-qtd').textContent = `Movidas nesta mudança (${l.length})`;
  $('#mud-lista').innerHTML = l.map((x) => { const m = S.maquinas.find((y) => y.id === x.id) || {};
    return `<div class="item"><span class="ponto ponto--ok"></span><span class="item-txt"><strong>${esc(m.ativo || m.hostname)}</strong><span>${esc(m.hostname)} · antes: ${esc(x.antes.setor ?? m.setor ?? 'sem setor')}</span></span>
      <button class="btn btn--texto" data-desf-mud="${x.id}">Desfazer</button></div>`; }).join('')
    || '<div class="cartao vazio"><b>Nenhuma máquina ainda</b>Bipe a etiqueta de cada máquina que mudou de lugar.</div>';
}
async function moverMaquina(bruto) {
  const codigo = extrairCodigo(bruto);
  if (!codigo || !S.mud) return;
  const m = acharMaquina(codigo);
  if (!m) return mostrarResultado('bad', `Não cadastrada: ${esc(codigo)}`, 'Este código não existe nas máquinas deste CD.');
  const nome = esc(m.ativo || m.hostname);
  if (S.mud.movidas.some((x) => x.id === m.id)) return mostrarResultado('warn', `Já movida: ${nome}`, 'Esta máquina já está nesta mudança.');
  if (!navigator.onLine) return mostrarResultado('bad', 'Sem internet', 'A mudança grava direto no sistema. Bipe de novo quando o sinal voltar.');
  const novo = { setor: S.mud.setor };
  if (S.mud.localizacao) novo.localizacao = S.mud.localizacao;
  if (S.mud.responsavel) novo.responsavel = S.mud.responsavel;
  const diff = Object.fromEntries(Object.entries(novo).filter(([k, v]) => (m[k] || null) !== v));
  if (!Object.keys(diff).length) return mostrarResultado('warn', `${nome} já está aí`, `Já cadastrada em ${esc(m.setor)}${m.localizacao ? ' · ' + esc(m.localizacao) : ''}.`);
  const antes = Object.fromEntries(Object.keys(diff).map((k) => [k, m[k] ?? null]));
  const { error } = await sb.from('maquinas').update(diff).eq('id', m.id);
  if (error) return mostrarResultado('bad', 'Não foi possível mover', esc(erroRede(error) ? 'Sem internet no momento.' : error.message));
  Object.assign(m, diff);
  S.mud.movidas.unshift({ id: m.id, antes });
  mostrarResultado('ok', `✓ ${nome} → ${esc(S.mud.setor)}`, `${esc(m.hostname)} · antes: ${esc(antes.setor ?? m.setor ?? 'sem setor')}`, `<button class="btn" data-desf-mud="${m.id}">Desfazer</button>`);
  desenharListaMud();
}
async function desfazerMudanca(id) {
  const x = S.mud?.movidas.find((y) => y.id === id);
  if (!x) return;
  if (!navigator.onLine) return aviso('Sem internet para desfazer agora.', true);
  const { error } = await sb.from('maquinas').update(x.antes).eq('id', id);
  if (error) return aviso(error.message, true);
  const m = S.maquinas.find((y) => y.id === id);
  if (m) Object.assign(m, x.antes);
  S.mud.movidas = S.mud.movidas.filter((y) => y.id !== id);
  const r = $('#res'); if (r) { r.className = 'resultado'; r.innerHTML = '<span class="muted">Mudança desfeita: a máquina voltou para onde estava.</span>'; }
  aviso('Mudança desfeita');
  desenharListaMud();
}

/* ------------------------------------------------------------------ PROCURAR máquina (ficha e fotos) */
function telaProcurar() {
  mostrar('t-procurar', { titulo: 'Máquina', sub: S.cd ? cdTxt(S.cd) : '', voltar: true });
  const el = $('#t-procurar');
  el.innerHTML = `${leitorHTML('Bipe ou digite patrimônio, nome ou série')}<div class="lista" id="proc-lista" style="margin-top:12px"></div>`;
  const abrir = (bruto) => {
    const m = acharMaquina(bruto);
    if (!m) return mostrarResultado('bad', `Não encontrada: ${esc(extrairCodigo(bruto))}`, 'Nenhuma máquina deste CD com esse patrimônio, nome ou série.');
    fecharCamera();
    mostrarResultado('ok', `✓ ${esc(m.ativo || m.hostname)}`, `${esc(m.hostname)} · ${esc(m.setor || 'sem setor')}`);
    fichaMaquina(m);
  };
  ligarLeitor(abrir);
  // digitando: mostra as máquinas que combinam (parte do patrimônio, nome, série, setor ou responsável)
  $('#ler').oninput = debounce((e) => {
    const termos = up(e.target.value).split(/\s+/).filter(Boolean);
    const l = termos.join('').length < 2 ? [] : S.maquinas.filter((m) => termos.every((t) => up(`${m.ativo} ${m.hostname} ${m.numero_serie} ${m.setor} ${m.localizacao} ${m.responsavel}`).includes(t))).slice(0, 30);
    $('#proc-lista').innerHTML = l.map((m) => `<button class="item" data-proc="${m.id}"><span class="item-txt"><strong>${esc(m.ativo || m.hostname)}</strong><span>${esc(m.hostname)} · ${esc(m.setor || 'sem setor')}${m.localizacao ? ' · ' + esc(m.localizacao) : ''}</span></span><span class="item-lado">›</span></button>`).join('');
  }, 150);
  $('#proc-lista').onclick = (e) => { const b = e.target.closest('[data-proc]'); if (b) fichaMaquina(S.maquinas.find((m) => m.id === b.dataset.proc)); };
}

/* ------------------------------------------------------------------ câmera contínua */
let cam = null;
// aoLer(código): o que fazer com cada etiqueta lida (conferir, mudar de setor, abrir a ficha…)
async function abrirCamera(aoLer) {
  const box = $('#camera');
  box.hidden = false; $('#cam-ultimo').hidden = true;
  cam = { rodando: true, stream: null, ultimo: '', ultimoEm: 0 };
  const fechar = () => { cam.rodando = false; cam.stream?.getTracks().forEach((t) => t.stop()); box.hidden = true; $('#ler')?.focus({ preventScroll: true }); };
  cam.fechar = fechar;
  $('#cam-fechar').onclick = fechar;
  try {
    cam.stream = await navigator.mediaDevices.getUserMedia({ video: VIDEO, audio: false });
    const v = $('#cam-video'); v.srcObject = cam.stream; await v.play();
    const trilha = cam.stream.getVideoTracks()[0];
    ajustarFoco(trilha);
    const capac = trilha.getCapabilities?.() || {};
    const bl = $('#cam-lanterna');
    bl.hidden = !capac.torch;
    let luz = false;
    bl.onclick = () => { luz = !luz; trilha.applyConstraints({ advanced: [{ torch: luz }] }).catch(() => {}); };
    const detector = await criarDetector(v);
    $('#cam-dica').textContent = detector.nativo ? 'Aponte para o QR code ou o código de barras da etiqueta' : 'Centralize o QR code da etiqueta na mira';
    const loop = async () => {
      if (!cam.rodando) return;
      try {
        const val = await detector.ler();
        // evita registrar a mesma etiqueta várias vezes enquanto ela continua na frente da câmera
        if (val && !(val === cam.ultimo && Date.now() - cam.ultimoEm < 3500)) {
          cam.ultimo = val; cam.ultimoEm = Date.now();
          await aoLer(val);
          setTimeout(loop, 900);
          return;
        }
      } catch { /* quadro inválido */ }
      setTimeout(loop, 180);
    };
    loop();
  } catch (e) {
    fechar();
    aviso('Não foi possível abrir a câmera: ' + (e.message || e), true);
  }
}

/* ------------------------------------------------------------------ manter a tela ligada durante a conferência */
async function manterTelaLigada() {
  try { if ('wakeLock' in navigator && !S.wake) { S.wake = await navigator.wakeLock.request('screen'); S.wake.addEventListener('release', () => { S.wake = null; }); } } catch { /* não suportado */ }
}
function liberarTela() { try { S.wake?.release(); } catch { /* ok */ } S.wake = null; }
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && S.sess && !$('#t-conf').hidden) manterTelaLigada(); });

/* ------------------------------------------------------------------ FINALIZAR */
async function telaFinal(id) {
  if (!S.sess || S.sess.conf.id !== id) { const s = await idbGet(chaveSess(id)); if (!s) return ir('#inicio'); S.sess = s; }
  const k = calcular();
  const c = S.sess.conf;
  mostrar('t-final', { titulo: 'Finalizar inventário', sub: c.nome, voltar: true });
  const local = S.sess.leituras.filter((l) => !l.enviado).length;
  const pz = estadoPrazo({ ...c, status: 'finalizada', finalizado_em: new Date().toISOString() });
  const textoResumo = montarResumo({
    nome: c.nome, cd: cdTxt(c.cd_id) || 'CD', setor: c.setor, por: S.user.email, quando: Date.now(),
    esperadas: k.esp.length, encontradas: k.ok,
    faltando: k.faltando.map((m) => ({ ativo: m.ativo, hostname: m.hostname })),
    desconhecidas: k.desconhecidas.map((l) => l.codigo_lido), fora: k.fora.length,
    leitores: S.sess.leituras.map((l) => l.lido_por),
    prazo: pz ? { noPrazo: pz.estado === 'cumprido', txt: pz.estado === 'cumprido' ? `sobraram ${fmtDuracao(pz.sobra)}` : `${fmtDuracao(-pz.sobra)} depois do prazo` } : null,
  });
  $('#t-final').innerHTML = `
    <div class="cartao">
      <div class="resumo-topo">
        <div class="anel" style="--p:${k.pct}"><b>${k.pct}%</b></div>
        <div><strong style="font-size:20px">${k.ok} de ${k.esp.length} máquinas encontradas</strong>
        <div class="muted">${esc(c.setor || 'Todos os setores')}${S.cd ? ' · ' + esc(cdTxt(c.cd_id)) : ''}</div></div>
      </div>
      <div class="grade">
        <div><b style="color:var(--bad)">${k.faltando.length}</b><span>Faltando</span></div>
        <div><b style="color:var(--warn)">${k.fora.length}</b><span>Fora do esperado</span></div>
        <div><b style="color:var(--lar)">${k.desconhecidas.length}</b><span>Não cadastradas</span></div>
        <div><b>${local}</b><span>Leituras a enviar</span></div>
      </div>
    </div>
    ${(() => { const p = estadoPrazo(c); if (!p) return ''; const fora = p.estado === 'vencido';
      return `<div class="cartao aviso-prazo ${fora ? 'ruim' : 'bom'}">${fora ? `⏰ <span>O prazo venceu há <b>${fmtDuracao(-p.restante)}</b>. O inventário será registrado como <b>concluído com atraso</b>.</span>` : `🏁 <span>Você está dentro do prazo: ainda restam <b>${fmtDuracao(p.restante)}</b>.</span>`}</div>`; })()}
    ${k.faltando.length ? `<div class="sec-titulo"><span>Faltando (${k.faltando.length})</span></div>
      <div class="lista">${k.faltando.slice(0, 5).map((m) => `<div class="item"><span class="ponto ponto--bad"></span><span class="item-txt"><strong>${esc(m.ativo || m.hostname)}</strong><span>${esc(m.hostname)} · ${esc(m.localizacao || m.setor || '')}</span></span></div>`).join('')}
      ${k.faltando.length > 5 ? `<div class="mais">e mais ${k.faltando.length - 5}…</div>` : ''}</div>` : ''}
    <div class="cartao resumo-grupo" style="padding:14px 16px;margin-top:14px">
      <strong>1. Envie o resumo no grupo</strong>
      <div class="muted" style="font-size:15px">Só dá para finalizar depois de copiar ou enviar o resumo. Ele fica gravado no inventário.</div>
      <textarea id="res-texto" readonly rows="8" style="width:100%;margin-top:8px;font-size:13px;font-family:inherit">${esc(textoResumo)}</textarea>
      <div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap">
        <button class="btn" id="res-copiar">📋 Copiar</button>
        <a class="btn" id="res-wa" href="${linkWhatsApp(textoResumo)}" target="_blank" rel="noopener">WhatsApp</a>
      </div>
      <label style="display:flex;gap:8px;align-items:center;margin-top:10px;font-size:15px"><input type="checkbox" id="res-colei" ${S.sess.resumoEm ? '' : 'disabled'} style="width:22px;height:22px"> Enviei o resumo no grupo</label>
    </div>
    <div class="cartao" style="padding:14px 16px;margin-top:14px">
      ${navigator.onLine ? `<strong>Ao confirmar</strong><div class="muted" style="font-size:15px">As leituras são enviadas ao sistema e o inventário é encerrado. Depois disso, só um administrador pode reabrir.</div>`
        : `<strong style="color:var(--warn)">Você está sem internet</strong><div class="muted" style="font-size:15px">Pode finalizar mesmo assim: tudo fica guardado no celular e é sincronizado automaticamente quando a conexão voltar. Não desinstale o app até lá.</div>`}
      <div id="envio" hidden><div class="progresso-envio"><i id="envio-barra" style="width:0%"></i></div><div class="muted" id="envio-txt" style="font-size:15px"></div></div>
    </div>
    <div class="rodape-fixo"><div>
      <button class="btn" id="voltar-conf">Voltar</button>
      <button class="btn btn--lar btn--2" id="confirmar" disabled>${navigator.onLine ? 'Confirmar e sincronizar' : 'Finalizar offline'}</button>
    </div></div>`;
  $('#voltar-conf').onclick = () => history.back();
  // resumo: copiar/compartilhar libera a caixa; caixa marcada libera o "Confirmar"
  const liberar = async () => { S.sess.resumo = textoResumo; S.sess.resumoEm = new Date().toISOString(); await salvarSessao(S.sess); $('#res-colei').disabled = false; };
  $('#res-copiar').onclick = async () => { if (await copiarTexto(textoResumo, $('#res-texto'))) { $('#res-copiar').textContent = '✓ Copiado'; await liberar(); } };
  $('#res-wa').onclick = liberar;
  $('#res-colei').onchange = (e) => { $('#confirmar').disabled = !e.target.checked; };
  $('#confirmar').onclick = async () => {
    if (!S.sess.resumo) return;
    $('#confirmar').disabled = true; $('#voltar-conf').disabled = true;
    const r = await finalizar(S.sess, (feito, total, txt) => {
      $('#envio').hidden = false;
      $('#envio-barra').style.width = `${total ? Math.round((100 * feito) / total) : 100}%`;
      $('#envio-txt').textContent = txt;
    });
    telaSucesso(r, k, c);
  };
}

// envia as leituras que estão só no aparelho
async function enviarLeituras(sess, progresso = () => {}) {
  const pend = sess.leituras.filter((l) => !l.enviado);
  let feito = 0;
  const marcar = (l, srv) => { l.enviado = true; if (srv) l.srvId = srv.id; };
  for (let i = 0; i < pend.length; i += 25) {
    const lote = pend.slice(i, i + 25);
    const linhas = lote.map((l) => ({ conferencia_id: sess.conf.id, maquina_id: l.maquina_id, codigo_lido: l.codigo_lido, localizacao: l.localizacao, lido_em: l.lido_em, lido_por: l.lido_por }));
    const { data: d, error } = await sb.from('conferencia_itens').insert(linhas).select('id, codigo_lido');
    if (!error) {
      lote.forEach((l) => marcar(l, d.find((x) => up(x.codigo_lido) === up(l.codigo_lido))));
    } else if (error.code === '23505') {
      // alguém já leu algum destes: envia um a um, ignorando os repetidos
      for (let j = 0; j < lote.length; j++) {
        const r = await sb.from('conferencia_itens').insert(linhas[j]).select('id').single();
        if (!r.error || r.error.code === '23505') marcar(lote[j], r.data);
        else if (erroRede(r.error)) { await salvarSessao(sess); return { ok: false, offline: true }; }
        else { await salvarSessao(sess); return { ok: false, erro: msgErro(r.error) }; }
      }
    } else if (erroRede(error)) { await salvarSessao(sess); return { ok: false, offline: true }; }
    else { await salvarSessao(sess); return { ok: false, erro: msgErro(error) }; }
    feito += lote.length;
    progresso(feito, pend.length, `Enviando leituras: ${feito} de ${pend.length}`);
    await salvarSessao(sess);
  }
  return { ok: true, enviados: pend.length };
}

// inventário finalizado no celular antes da exigência do resumo (estava na fila): gera o resumo aqui
function resumoNaSincronizacao(sess, k) {
  return montarResumo({
    nome: sess.conf.nome, cd: cdTxt(sess.conf.cd_id) || 'CD', setor: sess.conf.setor, por: S.user.email, quando: Date.now(),
    esperadas: k.esp.length, encontradas: k.ok, faltando: k.faltando.map((m) => ({ ativo: m.ativo, hostname: m.hostname })),
    desconhecidas: k.desconhecidas.map((l) => l.codigo_lido), fora: k.fora.length, leitores: sess.leituras.map((l) => l.lido_por), prazo: null,
  }) + '\n\n(resumo gerado na sincronização: o inventário foi finalizado sem internet antes desta exigência)';
}
async function finalizar(sess, progresso = () => {}) {
  sess.finalizarPendente = true;
  await salvarSessao(sess);
  if (!navigator.onLine) return { offline: true };
  const env = await enviarLeituras(sess, progresso);
  if (!env.ok) return env.offline ? { offline: true } : { erro: env.erro };
  progresso(1, 1, 'Encerrando o inventário…');
  const k = calcular(sess);
  const { data: d, error } = await sb.from('conferencias').update({
    status: 'finalizada', finalizado_em: new Date().toISOString(), finalizado_por: S.user.email,
    total_esperadas: k.esp.length, total_encontradas: k.ok, total_faltando: k.faltando.length,
    total_desconhecidas: k.desconhecidas.length, total_fora: k.fora.length,
    faltantes: k.faltando.map((m) => ({ id: m.id, hostname: m.hostname, ativo: m.ativo, modelo: m.modelo, tipo: m.tipo, setor: m.setor, localizacao: m.localizacao, ultimo_online: m.ultimo_online })),
    resumo: sess.resumo || resumoNaSincronizacao(sess, k), resumo_enviado_em: sess.resumoEm || null,
  }).eq('id', sess.conf.id).eq('status', 'aberta').select('id');
  if (error) return erroRede(error) ? { offline: true } : { erro: msgErro(error) };
  await apagarSessao(sess.conf.id);
  const c = S.confs.find((x) => x.id === sess.conf.id);
  if (c) Object.assign(c, { status: 'finalizada', finalizado_em: new Date().toISOString(), total_esperadas: k.esp.length, total_encontradas: k.ok, total_faltando: k.faltando.length });
  if (!d?.length) return { ok: true, jaFinalizado: true };
  return { ok: true };
}

function telaSucesso(r, k, c) {
  liberarTela();
  const el = $('#t-final');
  mostrar('t-final', { titulo: c.nome, sub: '', voltar: false });
  if (r.erro) {
    el.innerHTML = `<div class="sucesso"><div class="check-grande" style="background:var(--bad)">!</div><h2>Não foi possível sincronizar</h2>
      <p class="muted">${esc(r.erro)}</p><p class="muted">Suas leituras continuam guardadas no celular.</p>
      <button class="btn btn--pri btn--grande btn--bloco" id="tentar">Tentar de novo</button><button class="btn btn--bloco" id="ini">Voltar ao início</button></div>`;
    $('#tentar').onclick = () => telaFinal(c.id);
  } else if (r.offline) {
    el.innerHTML = `<div class="sucesso"><div class="check-grande" style="background:var(--lar)">⏳</div><h2>Finalizado no aparelho</h2>
      <p class="muted">Sem internet agora. <b>${k.ok} de ${k.esp.length}</b> máquinas encontradas. Assim que a conexão voltar, o inventário é sincronizado automaticamente.</p>
      <button class="btn btn--pri btn--grande btn--bloco" id="ini">Voltar ao início</button></div>`;
  } else {
    const p = estadoPrazo(c);
    const noPrazo = p ? Date.now() <= p.fim : null;
    el.innerHTML = `<div class="sucesso"><div class="check-grande">✓</div><h2>Inventário sincronizado!</h2>
      ${noPrazo === true ? `<div class="selo-prazo bom">🏁 Concluído no prazo · sobraram ${fmtDuracao(p.fim - Date.now())}</div>` : noPrazo === false ? `<div class="selo-prazo ruim">🐢 Concluído ${fmtDuracao(Date.now() - p.fim)} depois do prazo</div>` : ''}
      <p class="muted">${r.jaFinalizado ? 'O inventário já havia sido encerrado por outra pessoa; suas leituras foram enviadas.' : 'Tudo foi enviado ao sistema e o inventário foi encerrado.'}</p>
      <div class="grade" style="width:100%;padding:0"><div><b>${k.ok}/${k.esp.length}</b><span>Encontradas (${k.pct}%)</span></div><div><b style="color:var(--bad)">${k.faltando.length}</b><span>Faltando</span></div></div>
      <button class="btn btn--pri btn--grande btn--bloco" id="ini">Voltar ao início</button></div>`;
  }
  $('#ini').onclick = async () => { S.sess = null; history.replaceState(null, '', '#inicio'); await carregarConfs(); telaInicio(); };
  atualizarSync();
}

// finalizações feitas sem internet: tenta de novo quando a conexão voltar
let sincronizando = false;
async function sincronizarPendentes(manual = false) {
  if (sincronizando || !navigator.onLine || !S.user) return;
  sincronizando = true;
  try {
    let n = 0;
    for (const id of await listaSessoes()) {
      const s = await idbGet(chaveSess(id));
      if (!s?.finalizarPendente) continue;
      const r = await finalizar(s);
      if (r.ok) { n++; aviso(`“${s.conf.nome}” sincronizado`); }
      else if (r.erro) aviso(`Erro ao sincronizar “${s.conf.nome}”: ${r.erro}`, true);
    }
    if (n) { await carregarConfs(); if (!location.hash || location.hash === '#inicio') telaInicio(); }
    else if (manual) aviso('Nada para sincronizar agora');
  } finally { sincronizando = false; atualizarSync(); }
}
window.addEventListener('online', () => { atualizarSync(); sincronizarPendentes(); });
window.addEventListener('offline', atualizarSync);

/* ------------------------------------------------------------------ folha inferior e menu */
function abrirFolha(html) {
  const f = $('#folha');
  f.innerHTML = html;
  f.hidden = false; $('#folha-fundo').hidden = false;
  $$('[data-fechar]', f).forEach((b) => (b.onclick = fecharFolha));
}
function fecharFolha() { $('#folha').hidden = true; $('#folha-fundo').hidden = true; }
$('#folha-fundo').onclick = fecharFolha;

function menu() {
  const emConf = S.sess && !$('#t-conf').hidden;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const instalado = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  abrirFolha(`<div class="pilha">
    ${emConf ? `<button class="menu-item" data-m="enviar"><span>⇪</span><span>Enviar leituras agora (sem finalizar)</span></button>
      <button class="menu-item" data-m="recarregar"><span>↻</span><span>Atualizar lista de máquinas</span></button>
      <button class="menu-item" data-m="finalizar"><span>✓</span><span>Finalizar inventário</span></button>` : ''}
    ${!instalado && (S.instalar || ios) ? '<button class="menu-item" data-m="instalar"><span>⬇</span><span>Instalar o app neste celular</span></button>' : ''}
    <button class="menu-item" data-m="painel"><span>🖥</span><span>Abrir o painel completo</span></button>
    <button class="menu-item" data-m="tema"><span>◐</span><span>Alternar tema claro/escuro</span></button>
    <button class="menu-item perigo" data-m="sair"><span>⎋</span><span>Sair (${esc(S.user.email)})</span></button>
    <div class="versao" title="${esc(dicaVersao())}">${esc(textoVersao())}</div>
  </div>`);
  $$('[data-m]', $('#folha')).forEach((b) => (b.onclick = async () => {
    const m = b.dataset.m;
    fecharFolha();
    if (m === 'enviar') {
      if (!navigator.onLine) return aviso('Sem internet. As leituras continuam guardadas no celular.', true);
      const r = await enviarLeituras(S.sess);
      aviso(r.ok ? `${r.enviados} leitura(s) enviada(s)` : r.offline ? 'Sem internet no momento' : 'Erro: ' + r.erro, !r.ok);
      desenharProg(); desenharLista();
    }
    if (m === 'recarregar') { await carregarMaquinas(); desenharProg(); desenharLista(); aviso('Lista atualizada'); }
    if (m === 'finalizar') ir('#final/' + S.sess.conf.id);
    if (m === 'instalar') instalarApp();
    if (m === 'painel') location.href = '../index.html';
    if (m === 'tema') {
      const atual = document.documentElement.dataset.tema || (matchMedia('(prefers-color-scheme: dark)').matches ? 'escuro' : 'claro');
      const novo = atual === 'escuro' ? 'claro' : 'escuro';
      document.documentElement.dataset.tema = novo; store.set('campo-tema', novo);
    }
    if (m === 'sair') {
      const p = await contarPendencias();
      if ((p.leituras || p.finalizar) && !(await confirmar(`Há ${p.leituras} leitura(s) ainda não enviadas neste celular. Elas continuam guardadas, mas só serão enviadas quando você entrar de novo. Sair mesmo assim?`, { titulo: 'Sair do app?', ok: 'Sair', perigo: true }))) return;
      await sb.auth.signOut();
    }
  }));
}
$('#btn-menu').onclick = menu;
$('#btn-voltar').onclick = () => (history.length > 1 ? history.back() : ir('#inicio'));

/* ------------------------------------------------------------------ instalar (PWA) */
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); S.instalar = e; $('#instalar-login').hidden = false; });
window.addEventListener('appinstalled', () => { S.instalar = null; $('#instalar-login').hidden = true; aviso('App instalado! Abra pelo ícone “Conferência”.'); });
async function instalarApp() {
  if (S.instalar) { S.instalar.prompt(); await S.instalar.userChoice; S.instalar = null; return; }
  abrirFolha(`<h2>Instalar no iPhone</h2><p class="sub">No Safari:</p>
    <ol style="margin:0 0 16px;padding-left:20px;display:grid;gap:8px;font-size:17px">
      <li>Toque em <b>Compartilhar</b> (o quadrado com a seta ⬆️) na barra do Safari.</li>
      <li>Role e toque em <b>Adicionar à Tela de Início</b>.</li>
      <li>Toque em <b>Adicionar</b>. O ícone “Conferência” aparece na tela inicial.</li>
    </ol><button class="btn btn--pri btn--bloco" data-fechar>Entendi</button>`);
}
$('#instalar-login').onclick = instalarApp;
if (/iphone|ipad|ipod/i.test(navigator.userAgent) && !navigator.standalone) $('#instalar-login').hidden = false;

/* ------------------------------------------------------------------ login e início */
$('#ver-senha').onclick = () => { const i = $('#login-form [name=senha]'); i.type = i.type === 'password' ? 'text' : 'password'; };
$('#login-form').onsubmit = async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  $('#btn-entrar').disabled = true; $('#login-erro').textContent = '';
  const { error } = await sb.auth.signInWithPassword({ email: String(fd.get('email')).trim(), password: String(fd.get('senha')) });
  $('#btn-entrar').disabled = false;
  if (error) $('#login-erro').textContent = /invalid/i.test(error.message) ? 'E-mail ou senha inválidos.' : erroRede(error) ? 'Sem internet. O primeiro acesso precisa de conexão.' : error.message;
};

function telaLogin(msg = '') {
  $('#app').hidden = true; $('#t-login').hidden = false;
  $('#login-erro').textContent = msg;
  cartaoAppAndroid($('#app-android-login')); // aviso do app Android (some no iPhone e dentro do app)
}

let iniciado = false;
async function entrar(session) {
  if (iniciado) return;
  iniciado = true;
  S.user = session.user;
  if (!(await carregarPerfil())) { iniciado = false; await sb.auth.signOut(); return telaLogin('Seu usuário não tem acesso liberado. Fale com o administrador.'); }
  S.cd = ehAdmin() ? (store.get('campo-cd') && S.cds.some((c) => c.id === store.get('campo-cd')) ? store.get('campo-cd') : S.cds[0]?.id || null) : S.perfil.cd_id || null;
  $('#t-login').hidden = true; $('#app').hidden = false;
  await Promise.all([carregarMaquinas(), carregarConfs(), carregarPendencias()]);
  iniciarRelogios();
  window.addEventListener('hashchange', rotear);
  if (!location.hash) history.replaceState(null, '', '#inicio');
  await rotear();
  atualizarSync();
  sincronizarPendentes();
  setInterval(sincronizarPendentes, 30_000);
  guardarBibliotecas();
}

function guardarBibliotecas() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.ready.then((reg) => {
    const urls = performance.getEntriesByType('resource').map((x) => x.name).filter((u) => /^https:\/\/(cdn\.jsdelivr\.net|fonts\.)/.test(u));
    if (!('BarcodeDetector' in window)) urls.push('https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js'); // leitor de QR para iPhone
    reg.active?.postMessage({ tipo: 'cachear', urls });
  }).catch(() => {});
}

(function iniciar() {
  const tema = store.get('campo-tema'); if (tema) document.documentElement.dataset.tema = tema;
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
  sb.auth.onAuthStateChange((ev, session) => {
    setTimeout(() => {
      $('#splash').classList.add('sai');
      if (session) entrar(session);
      else if (iniciado) location.reload();
      else telaLogin();
    }, 0);
  });
})();
