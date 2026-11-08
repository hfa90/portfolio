// Página pública "Registrar coletor": abre no navegador do próprio coletor (Android), sem cabo USB.
// O navegador não informa o nº de série: ele é BIPADO da etiqueta, junto com o patrimônio.
// Modelo e versão do Android são lidos do navegador quando disponíveis (a carga da bateria só aparece na tela:
// ela não diz a saúde da bateria e apagaria os dados mais completos do kit USB).
// Envia pela mesma função da página "Registrar computador" (registrar_por_planilha), com os mesmos limites.
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

const $ = (s) => document.querySelector(s);
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const store = { get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch { /* sem storage */ } } };

const p = new URLSearchParams(location.hash.slice(1));
const link = { token: p.get('k') || '', setor: (p.get('setor') || '').trim(), localizacao: (p.get('loc') || '').trim() };
if (!/^[a-f0-9]{32,64}$/i.test(link.token)) { $('#sem-link').hidden = false; await new Promise(() => {}); }
$('#conteudo').hidden = false;

const rpc = (fn, corpo) => fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
  method: 'POST',
  headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}`, 'Content-Type': 'application/json' },
  body: JSON.stringify(corpo),
});

// ---------------------------------------------------------------- o que o navegador informa
const FABRICANTES = [[/^(TC|MC|EC|CC|ET|WT|PS|L10)\d/i, 'Zebra Technologies'], [/^(CT|CK|EDA|CN|ScanPal)/i, 'Honeywell'], [/^(Memor|Skorpio|Joya)/i, 'Datalogic'], [/^(DT|RT|i\d)/i, 'Urovo'], [/^(MT|NLS)/i, 'Newland']];
const fabDe = (modelo) => FABRICANTES.find(([rx]) => rx.test(modelo || ''))?.[1] || '';
const disp = { modelo: '', android: '', bateria: null, tela: `${screen.width}×${screen.height}` };
async function detectar() {
  const ua = navigator.userAgent;
  const m = ua.match(/Android\s([\d.]+);\s*([^;)]+?)(?:\sBuild|\))/);
  if (m) { disp.android = m[1]; disp.modelo = m[2].trim() === 'K' ? '' : m[2].trim(); }
  try {
    const hv = await navigator.userAgentData?.getHighEntropyValues?.(['model', 'platformVersion']);
    if (hv?.model) disp.modelo = hv.model;
    if (hv?.platformVersion) disp.android = hv.platformVersion.split('.')[0] === '0' ? disp.android : hv.platformVersion.replace(/\.0(\.0)?$/, '');
  } catch { /* navegador sem client hints */ }
  try { const b = await navigator.getBattery?.(); if (b) disp.bateria = Math.round(b.level * 100); } catch { /* sem API de bateria */ }
  const android = /Android/i.test(ua);
  $('#chips').innerHTML = [
    android ? `Android <b>${esc(disp.android || '?')}</b>` : '<b>Não é Android</b>: marque "outro coletor" e preencha o modelo',
    disp.modelo && `Modelo <b>${esc(disp.modelo)}</b>`,
    disp.bateria != null && `Bateria <b>${disp.bateria}%</b>`,
    link.setor && `Setor <b>${esc(link.setor)}</b>`,
  ].filter(Boolean).map((t) => `<span class="pill">${t}</span>`).join('');
  if (!android) $('#f-outro').checked = true;
  preencherModelo();
}
function preencherModelo() {
  const outro = $('#f-outro').checked;
  if (!outro) { $('#f-modelo').value = disp.modelo; $('#f-fab').value = fabDe(disp.modelo); }
  else if ($('#f-modelo').value === disp.modelo) { $('#f-modelo').value = store.get('col-modelo') || ''; $('#f-fab').value = fabDe($('#f-modelo').value); }
}
$('#f-outro').onchange = preencherModelo;
$('#f-modelo').oninput = (e) => { if (!$('#f-fab').value || FABRICANTES.some(([, f]) => f === $('#f-fab').value)) $('#f-fab').value = fabDe(e.target.value); };

// leitor do coletor manda Enter no fim da leitura: passa para o próximo campo
const ordem = ['#f-serie', '#f-ativo', '#f-setor'];
ordem.forEach((sel, i) => $(sel).addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); if (ordem[i + 1]) $(ordem[i + 1]).focus(); else $('#form-coletor').requestSubmit(); } }));
for (const sel of ['#f-serie', '#f-ativo']) $(sel).addEventListener('input', (e) => { const p0 = e.target.selectionStart; e.target.value = e.target.value.toUpperCase(); e.target.setSelectionRange(p0, p0); });
$('#f-setor').value = link.setor || store.get('col-setor') || '';
$('#f-loc').value = link.localizacao || store.get('col-loc') || '';

// ---------------------------------------------------------------- envio
const codigo = [...crypto.getRandomValues(new Uint8Array(12))].map((b) => b.toString(16).padStart(2, '0')).join('');
let registrados = 0;
$('#form-coletor').addEventListener('submit', async (e) => {
  e.preventDefault();
  const v = (s) => $(s).value.trim().replace(/\s+/g, ' ');
  const d = { serie: v('#f-serie').toUpperCase(), ativo: v('#f-ativo').toUpperCase(), modelo: v('#f-modelo'), fab: v('#f-fab'), setor: v('#f-setor'), loc: v('#f-loc') };
  const outro = $('#f-outro').checked;
  let erro = '';
  if (!/^[A-Z0-9-]{5,40}$/.test(d.serie)) erro = 'Nº de série inválido: bipe a etiqueta "S/N" (só letras, números e hífen).';
  else if (!/^[A-Z0-9][A-Z0-9 ./-]{1,29}$/.test(d.ativo)) erro = 'Patrimônio inválido: bipe a etiqueta de patrimônio.';
  else if (d.ativo === d.serie) erro = 'Patrimônio e nº de série estão iguais: bipe cada etiqueta no campo certo.';
  else if (d.setor.length < 2) erro = 'Informe o setor.';
  $('#form-erro').hidden = !erro; $('#form-erro').textContent = erro;
  if (erro) return;
  const btn = $('#btn-enviar'); btn.disabled = true; btn.textContent = 'Registrando…';
  const modelo = d.modelo || 'COLETOR';
  const linha = {
    hostname: `${modelo.replace(/\s+/g, '')}-${d.serie.slice(-6)}`, tipo: 'coletor', numero_serie: d.serie, ativo: d.ativo,
    fabricante: d.fab || null, modelo: d.modelo || null, setor: d.setor, localizacao: d.loc || null,
    ...(!outro && disp.android ? { so_nome: `Android ${disp.android}`, so_display_version: disp.android } : {}),
    coleta: outro ? 'pagina-coletor (etiquetas)' : 'pagina-coletor', coletado_em: new Date().toISOString(),
  };
  try {
    const r = await rpc('registrar_por_planilha', { p_token: link.token, p_codigo_instalacao: codigo, p_linhas: [linha] });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(/invalido|expirado/i.test(j.message || '') ? 'este link não vale mais. Peça um link novo para o técnico de TI.' : (j.message || 'servidor indisponível'));
    if (!((j.criadas || 0) + (j.atualizadas || 0))) throw new Error(j.avisos?.[0]?.msg || 'o inventário não aceitou o registro.');
    registrados++;
    store.set('col-setor', d.setor); store.set('col-loc', d.loc); if (outro) store.set('col-modelo', d.modelo);
    $('#resultado').innerHTML = `<div class="inst-ok"><div class="host">✓ ${esc(d.ativo)} registrado <span class="pill pill--ok">${j.criadas ? 'novo' : 'atualizado'}</span></div>
      <dl class="inst-specs"><div><dt>Nº de série</dt><dd>${esc(d.serie)}</dd></div><div><dt>Modelo</dt><dd>${esc([d.fab, d.modelo].filter(Boolean).join(' ') || '—')}</dd></div>
      <div><dt>Setor</dt><dd>${esc(d.setor)}</dd></div>${!outro && disp.android ? `<div><dt>Android</dt><dd>${esc(disp.android)}</dd></div>` : ''}</dl>
      <p class="fim">${registrados > 1 ? `${registrados} coletores registrados nesta sessão. ` : ''}Para registrar outro, bipe a próxima etiqueta.</p></div>`;
    $('#f-serie').value = ''; $('#f-ativo').value = '';
    if (!outro) { $('#f-outro').checked = true; preencherModelo(); }   // o próximo provavelmente é outro aparelho
    $('#f-serie').focus();
  } catch (err) {
    $('#form-erro').hidden = false; $('#form-erro').textContent = 'Não foi possível registrar: ' + err.message;
  } finally { btn.disabled = false; btn.textContent = 'Registrar coletor'; }
});

detectar();
setTimeout(() => $('#f-serie').focus(), 300);
