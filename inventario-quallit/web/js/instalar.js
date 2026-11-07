// Página pública: o colaborador baixa o instalador e vê o computador ser reconhecido.
// O instalador é um .ps1 FIXO (igual para todos, pode ser assinado pela CA da empresa). O que é
// deste link (token, patrimônio, setor) fica num convite no servidor; o código curto do convite
// vai no nome do arquivo baixado e o instalador busca a configuração por ele.
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

// convite no servidor: devolve o código curto (o mesmo enquanto este navegador usar o mesmo código de instalação)
let convite = null;
async function prepararConvite() {
  if (convite) return convite;
  const r = await rpc('preparar_instalacao', {
    p_token: link.token, p_codigo_instalacao: codigo,
    p_dados: { ativo: link.ativo, setor: link.setor, localizacao: link.localizacao, responsavel: link.responsavel, proxy: link.proxy },
  });
  if (!r.ok) {
    const j = await r.json().catch(() => ({}));
    throw new Error(/invalido|expirado/i.test(j.message || '') ? 'este link expirou. Peça um link novo para o técnico de TI.' : (j.message || 'servidor indisponível'));
  }
  convite = await r.json();
  return convite;
}
const nomeArquivo = (cod) => `Instalar-InventarioQuallit-${cod}.ps1`;
const codFmt = (cod) => cod.slice(0, 5) + '-' + cod.slice(5);
function mostrarCodigo(cod) {
  $('#nome-arquivo').textContent = nomeArquivo(cod);
  $('#mock-nome').textContent = nomeArquivo(cod);
  $('#codigo-inst').textContent = codFmt(cod);
  $('#bloco-codigo').hidden = false;
}
prepararConvite().then(mostrarCodigo).catch((err) => { $('#nome-arquivo').textContent = 'Não foi possível preparar a instalação: ' + err.message; });
$('#btn-copiar-cod')?.addEventListener('click', () => navigator.clipboard?.writeText(convite || '').then(() => { $('#btn-copiar-cod').textContent = 'Copiado'; setTimeout(() => ($('#btn-copiar-cod').textContent = 'Copiar'), 1500); }));

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
    av.innerHTML = 'Este link precisa ser aberto <b>no computador Windows</b> que será registrado. No celular ou em outro sistema o instalador não funciona.';
    return;
  }
  if (navigator.userAgentData?.platform !== 'Windows') return;
  try {
    const hv = await navigator.userAgentData.getHighEntropyValues(['platformVersion']);
    const maior = Number((hv?.platformVersion || '').split('.')[0]);
    if (maior) $('#chips').insertAdjacentHTML('beforeend', `<span class="pill">Detectado: <b>Windows ${maior >= 13 ? '11' : '10'}</b></span>`);
  } catch { /* navegador sem client hints */ }
})();

// ---------------------------------------------------------------- passos
function passo(n) {
  [1, 2, 3].forEach((i) => {
    $('#passo' + i).dataset.estado = i < n ? 'feito' : i === n ? 'atual' : 'espera';
  });
}

async function baixarInstalador() {
  const cod = await prepararConvite();
  // o arquivo é o mesmo para todos (fixo e assinável): os bytes vão sem nenhuma alteração
  const r = await fetch(`agente/Instalar-InventarioQuallit.ps1?v=${Date.now()}`, { cache: 'no-store' });
  if (!r.ok) throw new Error('instalador não encontrado no site');
  const blob = new Blob([await r.arrayBuffer()], { type: 'application/octet-stream' });
  return { cod, blob };
}

$('#btn-baixar').addEventListener('click', async (e) => {
  const btn = e.currentTarget;
  btn.disabled = true;
  try {
    const { cod, blob } = await baixarInstalador();
    mostrarCodigo(cod);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = nomeArquivo(cod);
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    store.set('iq-baixou', String(Date.now()));
    passo(2);
    aguardar();
  } catch (err) {
    $('#nome-arquivo').textContent = 'Não foi possível gerar o instalador: ' + err.message;
  } finally {
    btn.disabled = false;
  }
});

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
const TIPO = { desktop: 'Desktop', notebook: 'Notebook', servidor: 'Servidor', outro: 'Outro' };

function mostrarMaquina(m) {
  passo(4);
  $('#p3-titulo').textContent = 'Computador reconhecido!';
  $('#p3-texto').textContent = 'Estes dados já estão no inventário da TI.';
  $('#resultado').innerHTML = cartaoMaquina(m);
}
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

let aguardando = false;
async function aguardar() {
  if (aguardando) return;
  aguardando = true;
  $('#resultado').innerHTML = '<div class="inst-aguarda"><span class="spinner"></span>Aguardando o arquivo ser aberto neste computador…</div>';
  const fim = Date.now() + 20 * 60 * 1000;
  while (Date.now() < fim) {
    try {
      const m = await verificar();
      if (m && m.hostname) { aguardando = false; return mostrarMaquina(m); }
    } catch { /* rede instável: tenta de novo */ }
    await new Promise((r) => setTimeout(r, 3000));
  }
  aguardando = false;
  $('#resultado').innerHTML = '<p class="muted">Ainda não recebemos os dados. Abra o arquivo baixado ou baixe de novo.</p>';
}

// ao voltar para a página depois de instalar, já mostra o resultado
(async () => {
  try {
    const m = await verificar();
    if (m && m.hostname) return mostrarMaquina(m);
  } catch { /* sem rede */ }
  if (store.get('iq-baixou')) { passo(2); aguardar(); }
})();

// ---------------------------------------------------------------- botão "Executar coleta agora"
$('#btn-executar').addEventListener('click', () => {
  const msg = $('#exec-msg');
  const inicio = Date.now();
  let saiu = false;
  const onBlur = () => { saiu = true; };
  window.addEventListener('blur', onBlur, { once: true });
  msg.textContent = 'Abrindo o Inventário Quallit…';
  setTimeout(async () => {
    window.removeEventListener('blur', onBlur);
    if (!saiu) {
      msg.innerHTML = 'Nada aconteceu? O agente ainda não está instalado neste computador. Use o <b>passo 1</b> acima.';
      return;
    }
    msg.textContent = 'Coleta iniciada. Uma janela mostra o resultado e fecha sozinha.';
    // se este navegador fez a instalação, confirma quando o dado novo chegar
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 3000));
      try {
        const m = await verificar();
        if (m?.ultimo_online && new Date(m.ultimo_online).getTime() > inicio - 5000) {
          msg.innerHTML = `✓ Dados de <b>${esc(m.hostname)}</b> recebidos agora.`;
          mostrarMaquina(m);
          return;
        }
      } catch { /* ignora */ }
    }
  }, 2500);
});

// ================================================================ SEM INSTALAR: Invent_local (planilha do Excel)
function trocarModo(modo, salvar = true) {
  document.querySelectorAll('.inst-modo').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.modo === modo)));
  $('#modo-agente').hidden = modo !== 'agente';
  $('#modo-planilha').hidden = modo !== 'planilha';
  $('.inst-rodape').textContent = modo === 'agente'
    ? 'Instala um pequeno agente da TI que envia apenas dados técnicos do equipamento (hardware, Windows, rede). Nenhum arquivo pessoal é lido.'
    : 'O Invent_local não instala nada: lê apenas dados técnicos do equipamento (hardware, Windows, rede) e grava a planilha. Nenhum arquivo pessoal é lido.';
  if (salvar) store.set('iq-modo', modo);
}
document.querySelectorAll('.inst-modo').forEach((b) => b.addEventListener('click', () => trocarModo(b.dataset.modo)));
trocarModo(p.get('modo') === 'planilha' ? 'planilha' : (store.get('iq-modo') || 'agente'), false);

function passoB(n) {
  [1, 2, 3].forEach((i) => { $('#pb' + i).dataset.estado = i < n ? 'feito' : i === n ? 'atual' : 'espera'; });
}
function mostrarImportar(focar) {
  $('#pb3').hidden = false;
  if (focar) { passoB(3); $('#pb3').scrollIntoView({ behavior: 'smooth', block: 'center' }); }
}
if (store.get('iq-kit-baixou')) { passoB(2); mostrarImportar(false); }

$('#btn-baixar-kit').addEventListener('click', async (e) => {
  const btn = e.currentTarget; btn.disabled = true;
  try {
    const zip = await montarKitInventLocal();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(zip); a.download = 'Invent_local.zip';
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    store.set('iq-kit-baixou', String(Date.now()));
    $('#kit-msg').textContent = '✓ Invent_local.zip baixado. Siga o passo 2.';
    passoB(2); mostrarImportar(false);
  } catch (err) {
    $('#kit-msg').textContent = 'Não foi possível baixar: ' + err.message;
  } finally { btn.disabled = false; }
});
$('#btn-ja-tenho').addEventListener('click', () => mostrarImportar(true));

// ---------------------------------------------------------------- importar a planilha
let coletas = [];
const espec = (rot, val) => `<div><dt>${rot}</dt><dd>${val}</dd></div>`;
async function lerEscolhido(f) {
  if (!f) return;
  passoB(3);
  $('#resultado-planilha').innerHTML = '';
  $('#prev-planilha').innerHTML = '<div class="inst-aguarda"><span class="spinner"></span>Lendo a planilha…</div>';
  try {
    const res = coletasDaPlanilha(await lerArquivoPlanilha(f));
    if (res.erro) throw new Error(res.erro);
    // o que o técnico definiu no link vale quando a planilha não trouxer
    coletas = res.lista.map((r) => ({
      ...r,
      ativo: r.ativo || link.ativo || null, setor: r.setor || link.setor || null,
      localizacao: r.localizacao || link.localizacao || null, responsavel: r.responsavel || link.responsavel || null,
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
    $('#prev-planilha').innerHTML = '';
    const gravadas = (j.criadas || 0) + (j.atualizadas || 0);
    passoB(gravadas ? 4 : 3);
    $('#pb3-titulo').textContent = gravadas ? (coletas.length === 1 ? 'Computador registrado!' : 'Planilha importada!') : 'Nada foi registrado';
    $('#pb3-texto').textContent = !gravadas ? 'Veja o motivo abaixo e avise o técnico de TI.'
      : coletas.length === 1 ? 'Estes dados já estão no inventário da TI.'
      : `${j.criadas} computador(es) novo(s) e ${j.atualizadas} atualizado(s) no inventário.`;
    let html = '';
    if (gravadas && coletas.length === 1) {
      const m = await verificar().catch(() => null);
      html = cartaoMaquina(m && m.hostname ? m : coletas[0]);
    } else if (gravadas) {
      html = '<div class="inst-ok"><p class="fim" style="margin:0">✓ Tudo certo. Pode fechar esta página.</p></div>';
    }
    if (j.avisos?.length) html += `<div class="inst-erro" style="background:var(--warn-soft);color:var(--warn);border-color:var(--warn)">${j.avisos.slice(0, 6).map((a) => esc((a.host ? a.host + ': ' : '') + a.msg)).join('<br>')}</div>`;
    $('#resultado-planilha').innerHTML = html;
  } catch (err) {
    btn.disabled = false; btn.textContent = 'Enviar para o inventário';
    $('#resultado-planilha').innerHTML = `<div class="inst-erro">Não foi possível enviar: ${esc(err.message)}</div>`;
  }
}
$('#arq-planilha').addEventListener('change', (e) => { lerEscolhido(e.target.files[0]); e.target.value = ''; });
const drop = $('#drop');
['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('arrastando'); }));
['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('arrastando'); }));
drop.addEventListener('drop', (e) => lerEscolhido(e.dataTransfer.files[0]));
