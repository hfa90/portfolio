// Página pública: o colaborador baixa o instalador já configurado e vê o computador ser reconhecido.
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

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

const nomeArquivo = `Inventario-Quallit${link.ativo ? '-' + link.ativo.replace(/[^\w-]/g, '') : ''}.cmd`;
$('#nome-arquivo').textContent = nomeArquivo;
$('#mock-nome').textContent = nomeArquivo;

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

function b64utf8(texto) {
  const bytes = new TextEncoder().encode(texto);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

async function gerarInstalador() {
  const v = Date.now();
  const [coletor, modelo] = await Promise.all([
    fetch(`agente/coletor.ps1?v=${v}`).then((r) => { if (!r.ok) throw new Error('coletor.ps1 não encontrado'); return r.text(); }),
    fetch(`agente/instalador.ps1?v=${v}`).then((r) => { if (!r.ok) throw new Error('instalador.ps1 não encontrado'); return r.text(); }),
  ]);
  const config = {
    supabase_url: SUPABASE_URL,
    supabase_anon_key: SUPABASE_ANON_KEY,
    agente_token: link.token,
    proxy: link.proxy,
    ativo: link.ativo,
    setor: link.setor,
    localizacao: link.localizacao,
    responsavel: link.responsavel,
    codigo_instalacao: codigo,
  };
  const coletorB64 = b64utf8(coletor).match(/.{1,100}/g).join('\n');
  const ps = modelo
    .replace('__COLETOR_B64__', () => coletorB64)
    .replace('__CONFIG_B64__', () => b64utf8(JSON.stringify(config)));
  const cabecalho = [
    '@echo off',
    'setlocal',
    'title Inventario Quallit - Instalacao',
    'set "IQ_SELF=%~f0"',
    'powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$t=[IO.File]::ReadAllText($env:IQ_SELF); $i=$t.LastIndexOf(\'#__INSTALADOR__\'); Invoke-Expression $t.Substring($i)"',
    'exit /b %errorlevel%',
    '',
  ].join('\n');
  return (cabecalho + ps).replace(/\r?\n/g, '\r\n');
}

$('#btn-baixar').addEventListener('click', async (e) => {
  const btn = e.currentTarget;
  btn.disabled = true;
  try {
    const conteudo = await gerarInstalador();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([conteudo], { type: 'application/octet-stream' }));
    a.download = nomeArquivo;
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
  const discos = [...new Set((m.discos || []).map((d) => d.tipo).filter((t) => t && t !== 'Desconhecido'))].join(' + ');
  const so = (m.so_nome || '—').replace(/^Microsoft\s+/i, '') + (m.so_display_version ? ' ' + m.so_display_version : '');
  $('#resultado').innerHTML = `
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
      <p class="fim">✓ Tudo certo. Pode fechar esta página.</p>
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
