// Página pública "Registrar computador": o colaborador informa patrimônio e setor, baixa o
// Invent_local (sem instalação) e vê o computador ser registrado ao vivo.
// O que é deste link (token, patrimônio, setor) fica num convite no servidor; o Invent_local
// leva o código do convite no config.json e envia os dados por ele.
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';
import { lerArquivoPlanilha, coletasDaPlanilha, montarKitInventLocal } from './planilha.js';

const $ = (s) => document.querySelector(s);
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* sem storage */ } },
};

// ---------------------------------------------------------------- parâmetros do link
const p = new URLSearchParams(location.hash.slice(1));
const link = {
  token: p.get('k') || '',
  ativo: (p.get('pat') || '').trim(),
  setor: (p.get('setor') || '').trim(),
  localizacao: (p.get('loc') || '').trim(),
  responsavel: (p.get('resp') || '').trim(),
  proxy: (p.get('proxy') || '').trim(),
};

if (!/^[a-f0-9]{32,64}$/i.test(link.token)) {
  $('#sem-link').hidden = false;
  await new Promise(() => {}); // link inválido: para a execução aqui
}
$('#conteudo').hidden = false;

// código que liga este download à máquina (válido por 6 dias neste navegador)
function codigoInstalacao() {
  const salvo = store.get('iq-codigo');
  const ts = Number(store.get('iq-codigo-ts') || 0);
  if (salvo && Date.now() - ts < 6 * 864e5) return salvo;
  const novo = [...crypto.getRandomValues(new Uint8Array(12))].map((b) => b.toString(16).padStart(2, '0')).join('');
  store.set('iq-codigo', novo); store.set('iq-codigo-ts', String(Date.now()));
  return novo;
}
const codigo = codigoInstalacao();

const rpc = (fn, corpo) => fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
  method: 'POST',
  headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}`, 'Content-Type': 'application/json' },
  body: JSON.stringify(corpo),
});

let convite = null;

// chips com o que o técnico já definiu
$('#chips').innerHTML = [
  link.ativo && `Patrimônio <b>${esc(link.ativo)}</b>`,
  link.setor && `Setor <b>${esc(link.setor)}</b>`,
  link.localizacao && `Local <b>${esc(link.localizacao)}</b>`,
  link.responsavel && `Responsável <b>${esc(link.responsavel)}</b>`,
].filter(Boolean).map((t) => `<span class="pill">${t}</span>`).join('');

// ---------------------------------------------------------------- detecção do sistema pelo navegador
(async () => {
  const ua = navigator.userAgent;
  const ehWindows = navigator.userAgentData?.platform === 'Windows' || /Windows NT/i.test(ua);
  if (!ehWindows) {
    const av = $('#aviso-so');
    av.hidden = false;
    av.innerHTML = 'Este link precisa ser aberto <b>no computador Windows</b> que será registrado. No celular ou em outro sistema o Invent_local não funciona.';
    return;
  }
  if (navigator.userAgentData?.platform !== 'Windows') return;
  try {
    const hv = await navigator.userAgentData.getHighEntropyValues(['platformVersion']);
    const maior = Number((hv?.platformVersion || '').split('.')[0]);
    if (maior) $('#chips').insertAdjacentHTML('beforeend', `<span class="pill">Detectado: <b>Windows ${maior >= 13 ? '11' : '10'}</b></span>`);
  } catch { /* navegador sem client hints */ }
})();

// ---------------------------------------------------------------- reconhecimento ao vivo
async function verificar() {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/verificar_instalacao`, {
    method: 'POST',
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_codigo: codigo }),
  });
  if (!r.ok) return null;
  return r.json();
}

const gb = (v) => {
  if (v == null) return '—';
  v = Number(v);
  return v >= 1000 ? (v / 1000).toFixed(v % 1000 ? 1 : 0).replace('.', ',') + ' TB' : Math.round(v) + ' GB';
};
const TIPO = { desktop: 'Desktop', notebook: 'Notebook', coletor: 'Coletor de dados', servidor: 'Servidor', outro: 'Outro' };

function cartaoMaquina(m, fim = '✓ Tudo certo. Pode fechar esta página.') {
  const discos = [...new Set((m.discos || []).map((d) => d.tipo).filter((t) => t && t !== 'Desconhecido'))].join(' + ');
  const so = (m.so_nome || '—').replace(/^Microsoft\s+/i, '') + (m.so_display_version ? ' ' + m.so_display_version : '');
  return `
    <div class="inst-ok">
      <div class="host">${esc(m.hostname)} <span class="pill pill--ok">${esc(TIPO[m.tipo] || m.tipo)}</span></div>
      <dl class="inst-specs">
        <div><dt>Patrimônio</dt><dd>${esc(m.ativo || 'a definir pela TI')}</dd></div>
        <div><dt>Modelo</dt><dd>${esc([m.fabricante, m.modelo].filter(Boolean).join(' ') || '—')}</dd></div>
        <div><dt>Memória</dt><dd>${gb(m.memoria_gb)}</dd></div>
        <div><dt>Armazenamento</dt><dd>${gb(m.armazenamento_total_gb)}${discos ? ' · ' + esc(discos) : ''}</dd></div>
        <div><dt>Sistema</dt><dd>${esc(so)}</dd></div>
        <div><dt>Processador</dt><dd>${esc((m.cpu || '—').replace(/\(R\)|\(TM\)|CPU/g, '').replace(/\s+/g, ' '))}</dd></div>
      </dl>
      ${fim ? `<p class="fim">${esc(fim)}</p>` : ''}
    </div>`;
}

// ================================================================ Invent_local (planilha do Excel + envio automático)
// 1. a pessoa informa patrimônio/setor aqui → vão no convite e no config.json do .zip (o Invent_local roda sem perguntas)
// 2. a página acompanha ao vivo: baixado → Invent_local aberto (status_instalacao) → dados recebidos (verificar_instalacao)
// 3. mostra o computador registrado; se não chegar (sem internet), oferece a importação manual da planilha
// ---------------------------------------------------------------- estado (sobrevive a recarregar a página)
const JANELA = 30 * 60 * 1000;   // acompanha por 30 min depois do download
const lerEstado = () => { try { return JSON.parse(store.get('iq-pl') || 'null'); } catch { return null; } };
const salvarEstado = (e) => store.set('iq-pl', JSON.stringify(e));
let est = lerEstado();            // { ts, dados, auto }
let registrado = false, acompanhando = false;

function passoB(n) {
  [1, 2, 3].forEach((i) => { $('#pb' + i).dataset.estado = i < n ? 'feito' : i === n ? 'atual' : 'espera'; });
}
function trilha(fase, extra) {
  const ordem = ['baixado', 'aberto', 'recebido'];
  const n = ordem.indexOf(fase);
  document.querySelectorAll('#trilha li').forEach((li) => {
    const i = ordem.indexOf(li.dataset.t);
    li.dataset.estado = i < n ? 'feito' : i === n ? (fase === 'recebido' ? 'feito' : 'atual') : 'espera';
  });
  if (extra) $(`#trilha li[data-t="${fase}"] small`).innerHTML = extra;
}

// ---------------------------------------------------------------- 1. formulário
const campos = { ativo: '#f-ativo', setor: '#f-setor', localizacao: '#f-loc', responsavel: '#f-resp' };
function preencherForm(d) {
  for (const [k, sel] of Object.entries(campos)) if (d?.[k]) $(sel).value = d[k];
}
preencherForm({ ativo: link.ativo, setor: link.setor, localizacao: link.localizacao, responsavel: link.responsavel });
if (est?.dados) preencherForm(est.dados);
$('#setores').innerHTML = [...new Set([link.setor, est?.dados?.setor].filter(Boolean))].map((s) => `<option value="${esc(s)}">`).join('');
$('#f-ativo').addEventListener('input', (e) => { const p0 = e.target.selectionStart; e.target.value = e.target.value.toUpperCase(); e.target.setSelectionRange(p0, p0); });

function validar() {
  const d = Object.fromEntries(Object.entries(campos).map(([k, sel]) => [k, $(sel).value.trim().replace(/\s+/g, ' ')]));
  d.ativo = d.ativo.toUpperCase();
  let erro = '', foco = null;
  if (!d.ativo) { erro = 'Informe o número do patrimônio (está na etiqueta do computador).'; foco = '#f-ativo'; }
  else if (!/^[A-Z0-9][A-Z0-9 ./-]{1,29}$/.test(d.ativo)) { erro = 'Patrimônio inválido: use só letras, números, ponto, barra ou hífen.'; foco = '#f-ativo'; }
  else if (d.setor.length < 2) { erro = 'Informe o setor onde o computador fica.'; foco = '#f-setor'; }
  document.querySelectorAll('.inst-form input').forEach((i) => i.removeAttribute('aria-invalid'));
  $('#form-erro').hidden = !erro; $('#form-erro').textContent = erro;
  if (foco) { $(foco).setAttribute('aria-invalid', 'true'); $(foco).focus(); return null; }
  return d;
}
function mostrarResumo(d) {
  $('#form-dados').hidden = true;
  $('#resumo-dados').hidden = false;
  $('#resumo-dados').innerHTML = `
    <div class="inst-chips inst-chips--esq">
      <span class="pill">Patrimônio <b>${esc(d.ativo)}</b></span><span class="pill">Setor <b>${esc(d.setor)}</b></span>
      ${d.localizacao ? `<span class="pill">Local <b>${esc(d.localizacao)}</b></span>` : ''}${d.responsavel ? `<span class="pill">Responsável <b>${esc(d.responsavel)}</b></span>` : ''}
    </div>
    <p class="inst-mini">✓ Invent_local.zip baixado com estes dados.
      <button type="button" class="inst-txtbtn" id="btn-alterar">Alterar dados</button> ·
      <button type="button" class="inst-txtbtn" id="btn-baixar-de-novo">Baixar de novo</button></p>`;
  $('#btn-alterar').onclick = () => { $('#resumo-dados').hidden = true; $('#form-dados').hidden = false; passoB(1); $('#f-ativo').focus(); };
  $('#btn-baixar-de-novo').onclick = () => baixarKit(d);
}

async function baixarKit(d) {
  const btn = $('#btn-baixar-kit'); btn.disabled = true;
  $('#kit-msg').textContent = 'Preparando o Invent_local…';
  try {
    // convite com os dados da página (a página e o Invent_local usam o mesmo código). Sem convite, o kit sai só com a planilha.
    let cfg = { ...d, sem_perguntas: true };
    try {
      const r = await rpc('preparar_instalacao', { p_token: link.token, p_codigo_instalacao: codigo, p_dados: { ...d, proxy: link.proxy } });
      if (!r.ok) throw new Error();
      convite = await r.json();
      cfg = { supabase_url: SUPABASE_URL, supabase_anon_key: SUPABASE_ANON_KEY, convite, ...cfg };
    } catch { /* link inválido ou sem rede: só planilha */ }
    const zip = await montarKitInventLocal('agente/planilha/', cfg);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(zip); a.download = 'Invent_local.zip';
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    est = { ts: Date.now(), dados: d, auto: !!cfg.convite };
    salvarEstado(est);
    registrado = false;
    iniciarAcompanhamento();
    $('#kit-msg').textContent = 'Invent_local.zip · já vai com estes dados';
  } catch (err) {
    $('#kit-msg').textContent = 'Não foi possível baixar: ' + err.message;
  } finally { btn.disabled = false; }
}
$('#form-dados').addEventListener('submit', (e) => { e.preventDefault(); const d = validar(); if (d) baixarKit(d); });

// ---------------------------------------------------------------- 2. acompanhamento ao vivo
async function statusConvite() {
  const r = await rpc('status_instalacao', { p_codigo_instalacao: codigo });
  return r.ok ? r.json() : null;   // banco sem a função: só não mostra a etapa "aberto"
}
function iniciarAcompanhamento() {
  mostrarResumo(est.dados);
  passoB(2);
  trilha('baixado', est.auto ? 'Aguardando você abrir o <b>COLETAR.bat</b>…' : 'Abra o <b>COLETAR.bat</b>. Depois, importe a planilha no passo 3.');
  $('#pb3-titulo').textContent = 'Pronto';
  $('#pb3-texto').textContent = est.auto ? 'O computador aparece aqui sozinho assim que o Invent_local terminar.' : 'Importe a planilha gerada pelo Invent_local.';
  $('#resultado-planilha').innerHTML = '';
  $('#manual').open = !est.auto;
  if (est.auto) acompanhar();
}
async function acompanhar() {
  if (acompanhando) return;
  acompanhando = true;
  const desde = est.ts;
  let abertoEm = 0, avisou = false;
  while (Date.now() < desde + JANELA && !registrado && est?.ts === desde) {
    try {
      const m = await verificar();
      if (m && m.hostname && m.ultimo_online && new Date(m.ultimo_online).getTime() >= desde - 5 * 60 * 1000) {
        registrado = true;
        mostrarRegistrado(m, 'Computador registrado!', 'O Invent_local terminou e enviou os dados. Já está tudo no inventário da TI.');
        break;
      }
      if (!abertoEm) {
        const s = await statusConvite().catch(() => null);
        if (s?.usado_em && new Date(s.usado_em).getTime() >= desde - 60 * 1000) {
          abertoEm = Date.now();
          trilha('aberto');
          $('#pb2').dataset.estado = 'atual';
        }
      } else if (!avisou && Date.now() - abertoEm > 3 * 60 * 1000) {
        avisou = true;   // abriu mas não enviou: provavelmente sem internet ou um aviso na janela
        trilha('aberto', 'Está demorando. Olhe a janela preta: se ela disser que o envio não foi possível, importe a planilha no passo 3.');
        $('#manual').open = true;
      }
    } catch { /* rede instável: tenta de novo */ }
    await new Promise((r) => setTimeout(r, 3000));
  }
  acompanhando = false;
  if (!registrado && est?.ts === desde && Date.now() >= desde + JANELA) {
    trilha(abertoEm ? 'aberto' : 'baixado', 'Os dados não chegaram sozinhos. Importe a planilha no passo 3.');
    $('#manual').open = true;
  }
}
function mostrarRegistrado(m, titulo, texto) {
  trilha('recebido');
  passoB(4);
  $('#pb3-titulo').textContent = titulo;
  $('#pb3-texto').textContent = texto;
  $('#manual').open = false; $('#manual').hidden = true;
  $('#prev-planilha').innerHTML = '';
  $('#resultado-planilha').innerHTML = cartaoMaquina(m);
  document.title = '✓ Registrado! · Registrar computador';
  $('#pb3').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// voltar à página: retoma de onde parou
if (est?.ts && Date.now() - est.ts < JANELA) iniciarAcompanhamento();
else passoB(1);

$('#btn-recomecar').addEventListener('click', () => {
  store.set('iq-pl', ''); est = null; registrado = false;
  $('#form-dados').hidden = false; $('#resumo-dados').hidden = true;
  $('#manual').hidden = false; $('#manual').open = false;
  $('#resultado-planilha').innerHTML = ''; $('#prev-planilha').innerHTML = '';
  document.title = 'Registrar computador';
  trilha('baixado', 'Aguardando você abrir o <b>COLETAR.bat</b>…');
  document.querySelectorAll('#trilha li').forEach((li) => { li.dataset.estado = 'espera'; });
  passoB(1);
  $('#pb1').scrollIntoView({ behavior: 'smooth', block: 'center' });
});

// ---------------------------------------------------------------- 3. importação manual (sem internet no computador)
let coletas = [];
const espec = (rot, val) => `<div><dt>${rot}</dt><dd>${val}</dd></div>`;
async function lerEscolhido(f) {
  if (!f) return;
  $('#prev-planilha').innerHTML = '<div class="inst-aguarda"><span class="spinner"></span>Lendo a planilha…</div>';
  try {
    const res = coletasDaPlanilha(await lerArquivoPlanilha(f));
    if (res.erro) throw new Error(res.erro);
    const pad = est?.dados || { ativo: link.ativo, setor: link.setor, localizacao: link.localizacao, responsavel: link.responsavel };
    coletas = res.lista.map((r) => ({
      ...r,
      ativo: r.ativo || pad.ativo || null, setor: r.setor || pad.setor || null,
      localizacao: r.localizacao || pad.localizacao || null, responsavel: r.responsavel || pad.responsavel || null,
    }));
    const um = coletas.length === 1 ? coletas[0] : null;
    const so = um ? ((um.so_nome || '—').replace(/^Microsoft\s+/i, '') + ' ' + (um.so_display_version || '')).trim() : '';
    $('#prev-planilha').innerHTML = `
      <div class="inst-prev">
        ${um ? `<div class="host">${esc(um.hostname)}</div>
          <dl class="inst-specs">
            ${espec('Patrimônio', esc(um.ativo || 'a definir pela TI'))}${espec('Setor', esc(um.setor || '—'))}
            ${espec('Modelo', esc([um.fabricante, um.modelo].filter(Boolean).join(' ') || '—'))}${espec('Nº de série', esc(um.numero_serie || '—'))}
            ${espec('Memória', gb(um.memoria_gb))}${espec('Armazenamento', gb(um.armazenamento_total_gb))}
            ${espec('Sistema', esc(so))}${espec('Processador', esc((um.cpu || '—').replace(/\(R\)|\(TM\)|CPU/g, '').replace(/\s+/g, ' ')))}
          </dl>`
        : `<div class="host">${coletas.length} computadores na planilha</div>
          <p class="muted" style="margin:6px 0 0">${esc(coletas.slice(0, 8).map((c) => c.hostname).join(', '))}${coletas.length > 8 ? '…' : ''}</p>`}
        ${res.completa ? '' : '<p class="inst-mini">Planilha antiga: entram só as colunas que ela tem. Para dados completos, use o Invent_local novo (passo 1).</p>'}
        <div class="acoes"><button class="btn btn--primary inst-btn" id="btn-enviar-planilha" style="margin-top:0">Enviar para o inventário</button>
          <button class="btn inst-btn inst-btn--sec" id="btn-outro-arq" type="button">Escolher outro arquivo</button></div>
      </div>`;
    $('#btn-enviar-planilha').onclick = enviarPlanilha;
    $('#btn-outro-arq').onclick = () => $('#arq-planilha').click();
  } catch (err) {
    coletas = [];
    $('#prev-planilha').innerHTML = `<div class="inst-erro">${esc(err.message)}</div>`;
  }
}
async function enviarPlanilha(e) {
  const btn = e.currentTarget; btn.disabled = true; btn.textContent = 'Enviando…';
  try {
    const r = await rpc('registrar_por_planilha', { p_token: link.token, p_codigo_instalacao: codigo, p_linhas: coletas });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      const msg = j.message || '';
      throw new Error(/registrar_por_planilha/.test(msg) ? 'o sistema ainda não foi atualizado para receber planilhas. Avise o técnico de TI.'
        : /invalido|expirado/i.test(msg) ? 'este link expirou. Peça um link novo para o técnico de TI.' : (msg || 'servidor indisponível'));
    }
    const gravadas = (j.criadas || 0) + (j.atualizadas || 0);
    const avisos = j.avisos?.length ? `<div class="inst-erro inst-erro--aviso">${j.avisos.slice(0, 6).map((a) => esc((a.host ? a.host + ': ' : '') + a.msg)).join('<br>')}</div>` : '';
    if (!gravadas) { btn.disabled = false; btn.textContent = 'Enviar para o inventário'; $('#prev-planilha').insertAdjacentHTML('beforeend', avisos || '<div class="inst-erro">O inventário não aceitou a planilha.</div>'); return; }
    registrado = true;
    if (coletas.length === 1) {
      const m = await verificar().catch(() => null);
      mostrarRegistrado(m && m.hostname ? m : coletas[0], 'Computador registrado!', 'A planilha foi importada. Já está tudo no inventário da TI.');
    } else {
      mostrarRegistrado({ hostname: `${gravadas} computadores`, tipo: 'outro' }, 'Planilha importada!', `${j.criadas} computador(es) novo(s) e ${j.atualizadas} atualizado(s) no inventário.`);
    }
    $('#resultado-planilha').insertAdjacentHTML('beforeend', avisos);
  } catch (err) {
    btn.disabled = false; btn.textContent = 'Enviar para o inventário';
    $('#prev-planilha').insertAdjacentHTML('beforeend', `<div class="inst-erro">Não foi possível enviar: ${esc(err.message)}</div>`);
  }
}
$('#arq-planilha').addEventListener('change', (e) => { lerEscolhido(e.target.files[0]); e.target.value = ''; });
const drop = $('#drop');
['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('arrastando'); }));
['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('arrastando'); }));
drop.addEventListener('drop', (e) => lerEscolhido(e.dataTransfer.files[0]));
