// Inventário Quallit — nucleo (gerado a partir do app.js; imports e exports conferidos automaticamente)
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from './config.js';

export const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* =====================================================================
   Utilidades
   ===================================================================== */
export const $ = (s, el = document) => el.querySelector(s);
export const $$ = (s, el = document) => [...el.querySelectorAll(s)];
export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const up = (v) => String(v ?? '').trim().toUpperCase();
export const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
export const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* sem storage */ } },
};

export const STATUS = { em_uso: 'Em uso', estoque: 'Estoque', manutencao: 'Manutenção', emprestado: 'Emprestado', descartado: 'Descartado', extraviado: 'Extraviado' };
export const STATUS_COR = { em_uso: 'ok', estoque: 'info', manutencao: 'warn', emprestado: 'info', descartado: '', extraviado: 'bad' };
export const PROPRIEDADE = { proprio: 'Próprio', alugado: 'Alugado' };
export const TIPO = { desktop: 'Desktop', notebook: 'Notebook', coletor: 'Coletor de dados', servidor: 'Servidor', outro: 'Outro' };
// situação pela ÚLTIMA COLETA (Invent_local / kit dos coletores). As chaves antigas (online, recente…) ficam
// porque também são as classes de cor (dot--online etc.).
export const SIT = { online: 'Coletado em 30 dias', recente: '30 a 90 dias', ausente: '90 dias a 6 meses', offline: 'Mais de 6 meses', nunca: 'Nunca coletado' };
export const SIT_COR = { online: 'ok', recente: 'info', ausente: 'warn', offline: 'bad', nunca: 'idle' };
export const ALERTAS = {
  hw_reduzido:        { l: 'Peça removida?', d: 'Memória ou armazenamento diminuiu — pente com defeito ou peça retirada', grave: true },
  emprestimo_atrasado:{ l: 'Devolução atrasada', d: 'Empréstimo com data de devolução vencida', grave: true },
  so_sem_suporte:     { l: 'Windows sem suporte', d: 'Windows 10 ou anterior — fim do suporte Microsoft em 14/10/2025', grave: true },
  estoque_online:     { l: 'Estoque coletado', d: 'Marcada como estoque/descartada/extraviada, mas foi coletada nos últimos 3 dias (voltou a ser usada?)', grave: true },
  fora_do_cd:         { l: 'Fora do CD', d: 'Apareceu na rede de outro CD (pela faixa de IP cadastrada em Agente → Redes)', grave: true },
  hostname_duplicado: { l: 'Hostname duplicado', d: 'Mais de uma máquina ativa com o mesmo nome', grave: true },
  disco_cheio:        { l: 'Disco cheio', d: 'Menos de 15 GB ou 10% livre', grave: true },
  ram_baixa:          { l: 'RAM < 8 GB', d: 'Memória abaixo de 8 GB', grave: false },
  hdd:                { l: 'Disco HDD', d: 'Possui disco mecânico (candidato a troca por SSD)', grave: false },
  sem_contato:        { l: 'Coleta desatualizada', d: 'Sem nova coleta há mais de 6 meses: passe o Invent_local (ou o kit dos coletores) de novo', grave: false },
  sem_ativo:          { l: 'Sem patrimônio', d: 'Sem número de patrimônio cadastrado', grave: false },
  garantia_vencendo:  { l: 'Garantia vencendo', d: 'Garantia termina nos próximos 30 dias', grave: false },
  renovacao:          { l: 'Mais de 5 anos', d: 'Comprada há mais de 5 anos — candidata a renovação', grave: false },
  sem_bitlocker:      { l: 'BitLocker desligado', d: 'Disco do sistema sem criptografia: em caso de perda/roubo os dados ficam expostos (LGPD)', grave: true },
  antivirus_off:      { l: 'Antivírus desligado', d: 'Nenhum antivírus ativo, ou antivírus desatualizado, na última coleta', grave: true },
  windows_desatualizado: { l: 'Windows sem atualização', d: 'Nenhuma atualização do Windows instalada nos 45 dias antes da última coleta', grave: false },
  aluguel_vencendo:   { l: 'Aluguel vencendo', d: 'Equipamento alugado com contrato terminando nos próximos 30 dias (ou já terminado): renove ou devolva à locadora', grave: true },
  bateria_ruim:       { l: 'Bateria ruim', d: 'Coletor com bateria com defeito ou abaixo de 80% da capacidade original — candidata a troca', grave: true },
};
export const CAMPOS_HIST = {
  cadastro: 'Cadastro', hostname: 'Hostname', ativo: 'Patrimônio', tipo: 'Tipo', status: 'Status', numero_serie: 'Nº de série',
  fabricante: 'Fabricante', modelo: 'Modelo', cpu: 'Processador', memoria_gb: 'Memória', armazenamento_total_gb: 'Armazenamento',
  so_nome: 'Sistema', so_display_version: 'Versão do SO', so_build: 'Build', setor: 'Setor', localizacao: 'Localização', responsavel: 'Responsável',
  cd_id: 'CD', data_compra: 'Data de compra', fornecedor: 'Fornecedor', nota_fiscal: 'Nota fiscal', garantia_fim: 'Fim da garantia', hw_verificado: 'Verificação',
  propriedade: 'Propriedade', locadora: 'Locadora', contrato: 'Contrato', aluguel_fim: 'Fim do aluguel',
};
export const CAMPOS_HW = ['memoria_gb', 'armazenamento_total_gb', 'cpu', 'numero_serie', 'so_nome', 'so_display_version'];

export function situacao(m) {
  if (!m.ultimo_online) return 'nunca';
  const d = (Date.now() - new Date(m.ultimo_online)) / 864e5;
  if (d <= 30) return 'online';
  if (d <= 90) return 'recente';
  if (d <= 180) return 'ausente';
  return 'offline';
}
export function soFamilia(m) {
  const n = m.so_nome || '';
  const r = n.match(/Windows (Server \d{4}|\d+)/i);
  if (r) return 'Windows ' + r[1];
  if (/mac/i.test(n)) return 'macOS';
  if (/linux|ubuntu/i.test(n)) return 'Linux';
  if (/android/i.test(n)) return n.replace(/^(Android\s+\d+).*/i, '$1');
  return n ? n.replace(/^Microsoft\s+/i, '') : 'Sem dado';
}
export const soGrupo = (m) => (m.so_nome ? soFamilia(m) + (m.so_display_version ? ' · ' + m.so_display_version : '') : 'Sem dado');
export const soLabel = (m) => (m.so_nome ? m.so_nome.replace(/^Microsoft\s+/i, '') + (m.so_display_version ? ' ' + m.so_display_version : '') : '—');
export function ramFaixa(m) {
  const g = Number(m.memoria_gb);
  if (!g) return 'Sem dado';
  if (g <= 4.5) return '4 GB ou menos';
  if (g <= 8.5) return '8 GB';
  if (g <= 16.5) return '16 GB';
  return '32 GB ou mais';
}
export function tipoDisco(m) {
  const t = new Set((m.discos || []).map((d) => d.tipo));
  if (t.has('SSD') && t.has('HDD')) return 'SSD + HDD';
  if (t.has('SSD')) return 'SSD';
  if (t.has('HDD')) return 'HDD';
  if (t.has('Flash')) return t.has('SD') ? 'Interna + cartão SD' : 'Memória interna';
  return (m.discos || []).length ? 'Não identificado' : 'Sem dado';
}
export function gb(v, dec = 0) {
  if (v == null || v === '') return '—';
  v = Number(v);
  if (v >= 1000) return (v / 1000).toFixed(v % 1000 ? 1 : 0).replace('.', ',') + ' TB';
  return (dec ? v.toFixed(dec) : Math.round(v)).toString().replace('.', ',') + ' GB';
}
export function rel(ts) {
  if (!ts) return 'nunca';
  const s = (Date.now() - new Date(ts)) / 1000;
  if (s < 60) return 'agora';
  if (s < 3600) return `há ${Math.floor(s / 60)} min`;
  if (s < 86400) return `há ${Math.floor(s / 3600)} h`;
  const d = Math.floor(s / 86400);
  if (d < 60) return `há ${d} dia${d > 1 ? 's' : ''}`;
  return new Date(ts).toLocaleDateString('pt-BR');
}
export function idadeFaixa(m) {
  if (!m.data_compra) return 'Sem data de compra';
  const anos = (Date.now() - new Date(m.data_compra + 'T12:00:00')) / (365.25 * 864e5);
  if (anos < 3) return '0 a 2 anos';
  if (anos < 5) return '3 a 4 anos';
  return '5 anos ou mais';
}
export function garantiaFaixa(m) {
  if (!m.garantia_fim) return 'Sem informação';
  const dias = (new Date(m.garantia_fim + 'T23:59:59') - Date.now()) / 864e5;
  if (dias < 0) return 'Vencida';
  if (dias <= 30) return 'Vence em 30 dias';
  if (dias <= 90) return 'Vence em 90 dias';
  return 'Vigente';
}
export const dataBR = (d) => (d ? new Date(d + 'T12:00:00').toLocaleDateString('pt-BR') : '—');
export const moeda = (v) => (v == null || v === '' ? '—' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));
// aceita patrimônio, hostname, nº de série ou a URL do QR code da etiqueta (…#maquina/PAT123)
export function extrairCodigo(bruto) {
  let c = String(bruto || '').trim();
  const i = c.indexOf('#maquina/');
  if (i >= 0) { try { c = decodeURIComponent(c.slice(i + 9)); } catch { c = c.slice(i + 9); } }
  return c.trim();
}
export function acharMaquina(bruto) {
  const c = up(extrairCodigo(bruto));
  if (!c) return null;
  const c2 = c.replace(/^0+/, '');
  return state.maquinas.find((x) => up(x.ativo) === c || up(x.hostname) === c || up(x.numero_serie) === c || x.id === c.toLowerCase()
    || (c2 && up(x.ativo) && up(x.ativo).replace(/^0+/, '') === c2)) || null;
}
// logo do cliente (RaiaDrogasil) nos documentos impressos: endereço completo porque a janela de impressão é about:blank
export const LOGO_CLIENTE_URL = new URL('img/cliente-rd.png', location.href).href;
export const logoClienteDoc = () => `<div class="cliente-doc"><img src="${LOGO_CLIENTE_URL}" alt="RaiaDrogasil S.A."></div>`;
export const ESTILO_CLIENTE_DOC = '.cliente-doc { float: right; margin: 0 0 8px 16px; text-align: right; } .cliente-doc span { display: block; font-size: 9px; letter-spacing: .08em; text-transform: uppercase; color: #777; } .cliente-doc img { display: block; height: 44px; width: auto; margin-left: auto; }';
// imprime depois que as imagens (logo, assinaturas) carregarem; pelo código do painel porque a CSP bloqueia script embutido
export function imprimirQuandoPronto(w) {
  const espera = [...w.document.images].filter((i) => !i.complete).map((i) => new Promise((r) => { i.onload = r; i.onerror = r; }));
  Promise.race([Promise.all(espera), new Promise((r) => setTimeout(r, 3000))])
    .then(() => setTimeout(() => { try { w.focus(); w.print(); } catch { /* janela fechada */ } }, 250));
}
// título de tela: frase curta (opcional) e a explicação completa escondida no ⓘ
export const ajuda = (txt) => `<details class="ajuda"><summary title="O que é esta tela?" aria-label="Ajuda">ⓘ</summary><div class="ajuda-txt">${txt}</div></details>`;
export const titulo = (h, curto, txtAjuda) => `<div><div class="titulo-linha"><h1>${h}</h1>${txtAjuda ? ajuda(txtAjuda) : ''}</div>${curto ? `<p>${curto}</p>` : ''}</div>`;
// menu "Mais ▾": ações menos usadas ficam guardadas aqui
export const menuMais = (itens, rotulo = 'Mais') => `<details class="menu-mais"><summary class="btn">${rotulo} ▾</summary><div class="menu-lista">${itens}</div></details>`;
export const dataHora = (ts) => (ts ? new Date(ts).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—');
export const data = (ts) => (ts ? new Date(ts).toLocaleDateString('pt-BR') : '—');
export const pill = (txt, cor = '') => `<span class="pill ${cor ? 'pill--' + cor : ''}">${esc(txt)}</span>`;
export const statusPill = (s) => pill(STATUS[s] || s, STATUS_COR[s]);
export const dot = (m) => `<span class="dot dot--${situacao(m)}" title="${esc(SIT[situacao(m)])}"></span>`;
export const tags = (m, max = 2) => {
  const a = m.alertas || [];
  const out = a.slice(0, max).map((k) => `<span class="tag ${ALERTAS[k]?.grave ? 'tag--bad' : ''}" title="${esc(ALERTAS[k]?.d)}">${esc(ALERTAS[k]?.l || k)}</span>`).join('');
  return out + (a.length > max ? `<span class="tag">+${a.length - max}</span>` : '');
};

export function toast(msg, err = false) {
  const el = document.createElement('div');
  el.className = 'toast' + (err ? ' err' : '');
  el.textContent = msg;
  $('#toasts').append(el);
  setTimeout(() => el.remove(), err ? 6000 : 3500);
}
export function erroMsg(e) {
  if (!e) return 'Erro desconhecido';
  if (e.code === '23505') return 'Já existe outra máquina com esse patrimônio ou número de série.';
  return e.message || String(e);
}

export let audioCtx;
export function beep(tipo) {
  try {
    audioCtx ||= new (window.AudioContext || window.webkitAudioContext)();
    const seq = { ok: [[880, 0.09]], warn: [[660, 0.08], [660, 0.08]], bad: [[220, 0.28]] }[tipo];
    let t = audioCtx.currentTime;
    for (const [f, d] of seq) {
      const o = audioCtx.createOscillator(); const g = audioCtx.createGain();
      o.frequency.value = f; o.type = 'square'; g.gain.value = 0.05;
      o.connect(g).connect(audioCtx.destination); o.start(t); o.stop(t + d); t += d + 0.05;
    }
  } catch { /* sem áudio */ }
}

/* =====================================================================
   Estado
   ===================================================================== */
export const F_PADRAO = { q: '', tipo: '', status: '_ativos', situacao: '', so: '', alerta: '', ram: '', disco: '', setor: '', idade: '', garantia: '', prop: '' };
export const state = {
  user: null,
  maquinas: [],
  hist: [],
  view: 'painel',
  f: { ...F_PADRAO },
  sort: { col: 'hostname', dir: 1 },
  maqMontada: false,
  flash: new Set(),
  drawerId: null,
  drawerDirty: false,
  confs: [],
  conf: null,
  confItens: [],
  confTab: 'faltando',
  tokens: [],
  sel: new Set(),
  emprestimos: [],
  empHist: [],
  offline: false,
  cacheEm: null,
  pendentes: 0,
  etqIds: null,
  modo: (() => { const padrao = matchMedia('(max-width: 820px)').matches ? 'cartoes' : 'tabela'; try { return localStorage.getItem('maq-modo') || padrao; } catch { return padrao; } })(),
  modoOpts: (() => { try { return { agrup: 'status', metrica: 'contato', mosGrupo: '', destaque: '', ...JSON.parse(localStorage.getItem('maq-modo-opts') || '{}') }; } catch { return { agrup: 'status', metrica: 'contato', mosGrupo: '', destaque: '' }; } })(),
  perfil: null,
  cds: [],
  cdAtual: '',
  usuarios: null,
};
// ---- CD atual e perfil (admin vê todos ou escolhe um CD; Field fica preso ao seu)
export const ehAdmin = () => state.perfil?.papel === 'admin';
export const noCD = (r) => !state.cdAtual || r.cd_id === state.cdAtual;
export const MQ = () => state.maquinas.filter(noCD);
export const cdDe = (id) => state.cds.find((c) => c.id === id);
export const cdNome = (id) => cdDe(id)?.nome || '—';
export const cdCod = (id) => cdDe(id)?.codigo || '—';
export const cdsAtivos = () => state.cds.filter((c) => c.ativo);
export const mostrarColCD = () => ehAdmin() && !state.cdAtual && state.cds.length > 1;
export const ativas = () => MQ().filter((m) => m.status !== 'descartado');
export const setores = () => [...new Set(MQ().map((m) => m.setor).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
