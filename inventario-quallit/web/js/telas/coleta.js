// Inventário Quallit — tela: coleta (gerado a partir do app.js; imports e exports conferidos automaticamente)
import { URL_CURTA, URL_PUBLICA } from '../config.js';
import { barrasSvg, qrSvg } from '../etiquetas.js';
import { carregarMaquinas } from '../dados.js';
import { confirmar } from '../dialogos.js';
import { $, $$, F_PADRAO, MQ, cdCod, cdNome, cdsAtivos, ehAdmin, erroMsg, esc, imprimirQuandoPronto, mostrarColCD, pill, sb, setores, state, toast, titulo } from '../nucleo.js';
import { montarKitColetores, montarKitInventLocal } from '../planilha.js';
import { modalImportarColeta } from '../telas/importacao.js';
import { campo, modal, opts } from '../telas/maquinas.js';

/* =====================================================================
   LINK DE INSTALAÇÃO (para enviar ao colaborador)
   ===================================================================== */
export const tokensLink = new Map(); // um token de link por CD
export async function obterTokenLink(cd, novo = false) {
  const chave = cd || 'meu';
  if (tokensLink.has(chave) && !novo) return tokensLink.get(chave);
  const { data: t, error } = await sb.rpc('obter_token_link', { p_cd: cd || null, p_novo: novo });
  if (error) throw error;
  tokensLink.set(chave, t);
  return t;
}
export function baseInstalar(pagina = 'instalar.html') {
  const base = URL_PUBLICA ? URL_PUBLICA.replace(/\/?$/, '/') : new URL('.', location.href).href;
  return base + pagina;
}

/* ---- Link CURTO do coletor: QR code e código de barras na tela, para ler com o próprio coletor ---- */
async function obterLinkCurto(cd, novo = false) {
  if (novo) await obterTokenLink(cd, true);   // invalida o token (e o código curto junto)
  const { data, error } = await sb.rpc('obter_link_curto', { p_cd: cd || null });
  if (error) throw error;
  return data;
}
async function modalLinkColetor() {
  let cd = ehAdmin() ? (state.cdAtual || cdsAtivos()[0]?.id) : state.perfil?.cd_id;
  let cod;
  try { cod = await obterLinkCurto(cd); } catch (e) {
    return toast(/obter_link_curto/.test(erroMsg(e)) ? 'Falta aplicar a migração do banco (atualizar-banco). Veja o README.' : erroMsg(e), true);
  }
  const urlDe = (c) => `${URL_CURTA}#${c}`;
  const semEsquema = (u) => u.replace(/^https?:\/\//, '');   // no código de barras: menor = mais fácil de ler
  modal(`
    <div class="modal-head"><h2>Link para registrar coletores</h2>
      <p class="muted" style="margin:4px 0 0">Leia o QR code ou o código de barras <b>com o próprio coletor</b>, na barra de endereço do navegador.</p></div>
    <div class="modal-body">
      ${ehAdmin() && cdsAtivos().length > 1 ? `<label>CD onde os coletores serão cadastrados<select id="lc-cd">${opts(cdsAtivos().map((c) => [c.id, `${c.codigo} · ${c.nome}`]), cd)}</select></label>` : ''}
      <div class="lc-codigos">
        <div class="lc-qr" id="lc-qr"></div>
        <div class="lc-lado">
          <div class="lc-url mono" id="lc-url"></div>
          <ol class="lc-passos">
            <li>No coletor, abra o <b>Chrome</b> e toque na <b>barra de endereço</b>.</li>
            <li>Aperte o gatilho e leia o <b>QR code</b> (ou o código de barras abaixo).</li>
            <li>Se não abrir sozinho, toque em <b>Ir</b>.</li>
          </ol>
        </div>
      </div>
      <div class="lc-barras" id="lc-barras"></div>
      <div class="actions">
        <button class="btn btn--primary" id="lc-copiar">Copiar link</button>
        <a class="btn" id="lc-wa" target="_blank" rel="noopener">WhatsApp</a>
        <button class="btn" id="lc-imprimir">Imprimir</button>
        <a class="btn btn--ghost" id="lc-abrir" target="_blank" rel="noopener">Abrir página ↗</a>
      </div>
    </div>
    <div class="modal-foot" style="justify-content:space-between">
      ${ehAdmin() ? '<button class="btn btn--ghost btn--sm" id="lc-rotacionar" title="Links, QR codes e folhas impressas antes deixam de funcionar">Invalidar links antigos deste CD</button>' : '<span></span>'}
      <button class="btn" data-close>Fechar</button>
    </div>`, (dlg) => {
    const desenhar = () => {
      const url = urlDe(cod);
      $('#lc-qr', dlg).innerHTML = qrSvg(url);
      $('#lc-barras', dlg).innerHTML = barrasSvg(semEsquema(url));
      $('#lc-url', dlg).textContent = semEsquema(url);
      $('#lc-abrir', dlg).href = url;
      $('#lc-wa', dlg).href = 'https://wa.me/?text=' + encodeURIComponent(`Registro de coletores no inventário: abra este link NO NAVEGADOR DO COLETOR, bipe a etiqueta do nº de série (S/N) e a do patrimônio e toque em Registrar:\n${url}`);
    };
    $('#lc-copiar', dlg).onclick = () => navigator.clipboard.writeText(urlDe(cod)).then(() => toast('Link copiado'));
    $('#lc-cd', dlg)?.addEventListener('change', async (e) => {
      cd = e.target.value;
      try { cod = await obterLinkCurto(cd); desenhar(); } catch (er) { toast(erroMsg(er), true); }
    });
    $('#lc-rotacionar', dlg)?.addEventListener('click', async () => {
      if (!(await confirmar(`Os links, QR codes e folhas impressas do ${cdCod(cd)} param de funcionar (inclusive os links de registro de computadores). Depois, use o novo.`, { titulo: 'Invalidar os links antigos?', ok: 'Invalidar e gerar novo', perigo: true }))) return;
      try { cod = await obterLinkCurto(cd, true); desenhar(); toast('Novo link gerado'); } catch (e) { toast(erroMsg(e), true); }
    });
    // folha para colar perto dos coletores (ou na sala da TI)
    $('#lc-imprimir', dlg).onclick = () => {
      const w = window.open('', '_blank');
      if (!w) return toast('Permita pop-ups deste site para imprimir.', true);
      const url = urlDe(cod);
      w.document.open();
      w.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Registrar coletor — ${esc(cdCod(cd))}</title><style>
        @page { size: A4; margin: 16mm; } body { font: 15px/1.5 "Segoe UI", Arial, sans-serif; color: #111; text-align: center; margin: 0; }
        h1 { font-size: 26px; margin: 0 0 4px; } .sub { color: #555; margin: 0 0 22px; }
        .qr svg { width: 85mm; height: 85mm; } .barras svg { width: 170mm; height: 26mm; margin-top: 16mm; display: block; margin-left: auto; margin-right: auto; }
        .url { font: 600 17px Consolas, monospace; margin: 8px 0 18px; } ol { text-align: left; display: inline-block; margin: 18px 0 0; font-size: 16px; }
      </style></head><body>
        <h1>Registrar coletor no inventário</h1><p class="sub">${esc(cdCod(cd))} · ${esc(cdNome(cd))}</p>
        <div class="qr">${qrSvg(url)}</div><div class="url">${esc(semEsquema(url))}</div>
        <div class="barras">${barrasSvg(semEsquema(url))}</div>
        <ol><li>No coletor, abra o <b>Chrome</b> e toque na barra de endereço.</li><li>Leia o <b>QR code</b> (ou o código de barras).</li><li>Bipe a etiqueta do <b>nº de série</b> e a do <b>patrimônio</b> e toque em <b>Registrar coletor</b>.</li></ol>
      </body></html>`);
      w.document.close();
      imprimirQuandoPronto(w);
    };
    desenhar();
  });
}

export async function modalLinkInstalacao(pre = {}) {
  if (pre.pagina === 'coletor.html') return modalLinkColetor();
  let cd = ehAdmin() ? (pre.cd_id || state.cdAtual || cdsAtivos()[0]?.id) : state.perfil?.cd_id;
  let token;
  try { token = await obterTokenLink(cd); } catch (e) {
    return toast('Não foi possível obter o token de links. Confira se as migrações do banco foram aplicadas. (' + erroMsg(e) + ')', true);
  }
  const local = /^(localhost|127\.|0\.0\.0\.0|\[::1\])/.test(location.hostname) || location.protocol === 'file:';
  modal(`
    <div class="modal-head"><h2>${pre.pagina === 'coletor.html' ? 'Link para registrar coletores' : 'Link de registro'}</h2>
      <p class="muted" style="margin:4px 0 0">${pre.pagina === 'coletor.html'
        ? 'Abra <b>no navegador do coletor</b> (ou envie para quem está com ele). Bipa-se a etiqueta do nº de série e a do patrimônio; modelo e Android são lidos sozinhos. Serve quando a Depuração USB está bloqueada.'
        : 'Envie para o colaborador abrir <b>no computador</b>. Ele baixa o Invent_local, abre o <b>COLETAR.bat</b> e pronto: os dados vão sozinhos para o inventário.'}</p></div>
    <div class="modal-body">
      <div class="form-grid" id="lk-form">
        ${ehAdmin() ? `<label class="full">CD onde a máquina será cadastrada<select id="lk-cd">${opts(cdsAtivos().map((c) => [c.id, `${c.codigo} · ${c.nome}`]), cd)}</select></label>` : `<label class="full">CD<input value="${esc(cdCod(cd) + ' · ' + cdNome(cd))}" disabled></label>`}
        ${campo('pat', 'Patrimônio (opcional)', pre.ativo, 'text', 'class="mono" placeholder="Etiqueta da máquina"')}
        ${campo('setor', 'Setor', pre.setor, 'text', 'list="dl-lk-set"')}
        ${campo('loc', 'Localização', pre.localizacao)}
        ${campo('resp', 'Responsável', pre.responsavel)}
      </div>
      <datalist id="dl-lk-set">${setores().map((s) => `<option value="${esc(s)}">`).join('')}</datalist>
      <p class="muted" style="margin:0;font-size:12.5px">Setor, localização e responsável só são gravados se a máquina ainda não tiver esses dados. Deixe tudo vazio para um link genérico que serve para qualquer computador.</p>
      <label>Link<input id="lk-url" readonly class="mono" style="font-size:12px"></label>
      ${local ? `<p class="tag" style="white-space:normal;padding:8px 10px;font-size:12.5px;font-weight:500">O painel está aberto em <b>${esc(location.host || 'arquivo local')}</b>, então este link só funciona neste computador. Publique a pasta <code>web</code> (ex.: GitHub Pages) e preencha <code>URL_PUBLICA</code> em <code>js/config.js</code>.</p>` : ''}
      <div class="actions">
        <button class="btn btn--primary" id="lk-copiar">Copiar link</button>
        <button class="btn" id="lk-msg">Copiar mensagem</button>
        <a class="btn" id="lk-wa" target="_blank" rel="noopener">WhatsApp</a>
        <a class="btn" id="lk-mail">E-mail</a>
        <a class="btn btn--ghost" id="lk-abrir" target="_blank" rel="noopener">Abrir página ↗</a>
      </div>
    </div>
    <div class="modal-foot" style="justify-content:space-between">
      ${ehAdmin() ? '<button class="btn btn--ghost btn--sm" id="lk-rotacionar" title="Links enviados antes deixam de funcionar">Invalidar links antigos deste CD</button>' : '<span></span>'}
      <button class="btn" data-close>Fechar</button>
    </div>`, () => {
    const atualizar = () => {
      const q = new URLSearchParams({ k: token });
      for (const n of ['pat', 'setor', 'loc', 'resp']) {
        const v = $(`#lk-form [name=${n}]`).value.trim();
        if (v) q.set(n, v);
      }
      const url = `${baseInstalar(pre.pagina)}#${q.toString()}`;
      const texto = pre.pagina === 'coletor.html'
        ? `Registro de coletores no inventário: abra este link NO NAVEGADOR DO COLETOR, bipe a etiqueta do nº de série (S/N) e a do patrimônio e toque em Registrar:\n${url}`
        : `Olá! A TI está atualizando o inventário de computadores. Abra este link NO SEU COMPUTADOR, informe o patrimônio e o setor, baixe o Invent_local e dê dois cliques no COLETAR.bat. Leva menos de 1 minuto:\n${url}`;
      $('#lk-url').value = url;
      $('#lk-abrir').href = url;
      $('#lk-wa').href = 'https://wa.me/?text=' + encodeURIComponent(texto);
      $('#lk-mail').href = 'mailto:?subject=' + encodeURIComponent('Registro do computador no inventário de TI') + '&body=' + encodeURIComponent(texto);
      $('#lk-msg').onclick = () => navigator.clipboard.writeText(texto).then(() => toast('Mensagem copiada'));
    };
    $('#lk-form').oninput = (e) => { if (e.target.id !== 'lk-cd') atualizar(); };
    $('#lk-cd')?.addEventListener('change', async (e) => {
      cd = e.target.value;
      try { token = await obterTokenLink(cd); atualizar(); } catch (er) { toast(erroMsg(er), true); }
    });
    $('#lk-copiar').onclick = () => navigator.clipboard.writeText($('#lk-url').value).then(() => toast('Link copiado'));
    $('#lk-url').onclick = (e) => e.target.select();
    $('#lk-rotacionar')?.addEventListener('click', async () => {
      if (!(await confirmar(`Todos os links de registro já enviados do ${cdCod(cd)} param de funcionar. Depois, envie o link novo a quem precisar.`, { titulo: 'Invalidar os links antigos?', ok: 'Invalidar e gerar novo', perigo: true }))) return;
      try { token = await obterTokenLink(cd, true); atualizar(); toast('Novo token gerado'); } catch (e) { toast(erroMsg(e), true); }
    });
    atualizar();
  });
}

/* =====================================================================
   AGENTE
   ===================================================================== */
export const ABAS_COLETA = [['instalacao', 'Como coletar'], ['redes', 'Redes e setores']];
export async function renderColeta(aba = 'instalacao') {
  if (!ABAS_COLETA.some(([k]) => k === aba)) aba = 'instalacao';
  const el = $('#view-coleta');
  const abas = !ehAdmin() ? '' : `<div class="tabs tabs--page">${ABAS_COLETA.map(([k, l]) => `<a class="tab ${aba === k ? 'active' : ''}" href="#coleta/${k}">${l}</a>`).join('')}</div>`;
  if (aba === 'redes') return renderRedes(el, abas);
  const L = MQ().filter((m) => m.status !== 'descartado');
  const porPlanilha = L.filter((m) => m.origem === 'planilha').length;
  const antigas = L.filter((m) => m.origem === 'agente').length;   // registradas pelo agente antigo (removido)
  const manuais = L.length - porPlanilha - antigas;
  const desatualizadas = L.filter((m) => !m.ultimo_online || Date.now() - new Date(m.ultimo_online) > 180 * 864e5).length;

  el.innerHTML = `
    <div class="view-head">${titulo('Coleta', 'Como trazer os dados técnicos dos computadores e coletores.', 'Os dados técnicos são lidos pelo <b>Invent_local</b> (computadores) e pelo <b>kit dos coletores</b> (Android). Nada é instalado: cada leitura gera uma planilha do Excel que entra no inventário sozinha ou pela importação.')}</div>
    ${abas}
    <div class="card card-pad" style="margin-bottom:16px;display:flex;gap:18px;align-items:center;justify-content:space-between;flex-wrap:wrap;border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-soft)">
      <div style="flex:1 1 320px"><h2>Mais fácil: envie um link para o colaborador</h2>
        <p class="muted" style="margin:4px 0 0">Ele abre no computador e segue os passos da página. Não instala nada.</p></div>
      <button class="btn btn--primary" id="btn-link-agente">Gerar link de registro</button>
    </div>
    <div class="card card-pad" style="margin-bottom:16px">
      <div class="card-head"><h2>Invent_local: vários computadores pela pasta de rede</h2><button class="btn btn--sm btn--primary" id="btn-coleta-agente">Importar planilha</button></div>
      <p class="muted" style="margin-top:0">O <b>COLETAR.bat</b> grava série, memória, discos, Windows, IP e usuário na planilha <code>inventario-quallit.xlsx</code>.</p>
      <div class="actions"><button class="btn btn--sm" id="btn-kit-zip">Baixar Invent_local.zip</button></div>
      <details class="mais-recolhido"><summary>Como fazer, passo a passo</summary>
      <ol class="muted" style="font-size:13px;margin:0 0 10px;padding-left:18px">
        <li>Baixe o <b>Invent_local.zip</b> e extraia numa pasta de rede (ex.: <code>&#92;&#92;servidor&#92;TI&#92;Inventario</code>), com permissão de gravação para quem vai coletar.</li>
        <li>Em cada computador: abra a pasta e dê duplo clique em <b>COLETAR.bat</b>. Executar de novo atualiza a mesma linha (não duplica).</li>
        <li>Aqui: botão <b>Importar planilha</b> e escolha o <code>inventario-quallit.xlsx</code>. Pode importar quantas vezes quiser.</li>
      </ol>
      <p><a class="btn btn--sm btn--ghost" href="agente/planilha/LEIA-ME.txt" target="_blank" rel="noopener">LEIA-ME</a></p>
      <p class="muted" style="font-size:12.5px;margin-bottom:0">Automático, sem perguntas: use como script de logon da GPO <code>powershell -NoProfile -ExecutionPolicy Bypass -File &#92;&#92;servidor&#92;TI&#92;Inventario&#92;coletar.ps1 -Silencioso</code>. Se a planilha estiver aberta no Excel, os dados ficam salvos na pasta <code>dados</code> e a planilha é refeita na próxima execução.</p>
      </details>
    </div>
    <div class="grid-2">
      <div class="card card-pad">
        <div class="card-head"><h2>📟 Coletores de dados Android (cabo USB)</h2><button class="btn btn--sm btn--primary" id="btn-coleta-coletores">Importar planilha</button></div>
        <p class="muted" style="margin-top:0">Pelo cabo USB (completo, com <b>saúde da bateria</b>) ou pelo <b>link no navegador do coletor</b> (sem cabo).</p>
        <div class="actions"><button class="btn btn--sm" id="btn-link-coletor" title="Sem cabo USB: registrar pelo navegador do próprio coletor">Link para o coletor</button><button class="btn btn--sm" id="btn-kit-coletores">Baixar Coletores_Quallit.zip</button></div>
        <details class="mais-recolhido"><summary>Como fazer, passo a passo</summary>
        <ol class="muted" style="font-size:13px;margin:0 0 10px;padding-left:18px">
          <li>Em cada coletor (uma vez): <i>Sobre o telefone</i> → 7 toques em <b>Número da versão</b> → <i>Opções do desenvolvedor</i> → ative <b>Depuração USB</b>.</li>
          <li>Execute o <b>COLETAR-COLETORES.bat</b> no computador, conecte o coletor, toque em <b>Permitir</b> e bipe o patrimônio.</li>
          <li>Importe o <code>coletores-quallit.xlsx</code> pelo botão <b>Importar planilha</b> acima.</li>
        </ol>
        <p><a class="btn btn--sm btn--ghost" href="agente/coletores/LEIA-ME.txt" target="_blank" rel="noopener">LEIA-ME</a></p>
        <p class="muted" style="font-size:12.5px;margin-bottom:0">Depuração USB bloqueada pelo MDM (SOTI, Zebra StageNow, Intune…)? Use o <b>Link para o coletor</b>: abre no navegador do coletor, bipa-se o nº de série e o patrimônio. Sem bateria e memória, mas sem precisar de cabo.</p>
        </details>
      </div>
      <div class="card card-pad">
        <div class="card-head"><h2>Cobertura</h2></div>
        <div class="kpis" style="margin:0">
          <div class="card kpi" style="cursor:default"><div class="kpi-label">Pela coleta</div><div class="kpi-value">${porPlanilha + antigas}</div><div class="kpi-sub">de ${L.length} equipamentos</div></div>
          <div class="card kpi" style="cursor:default"><div class="kpi-label">Cadastro manual</div><div class="kpi-value">${manuais}</div><div class="kpi-sub">sem dados técnicos</div></div>
          <div class="card kpi" style="cursor:default"><div class="kpi-label">Coleta antiga</div><div class="kpi-value ${desatualizadas ? 't-warn' : ''}">${desatualizadas}</div><div class="kpi-sub">sem leitura há 6 meses</div></div>
        </div>
        ${antigas ? `<p class="muted" style="font-size:12.5px;margin:12px 0 0">${antigas} equipamento(s) ainda estão com os dados do agente antigo (removido). Na próxima vez que passarem pelo Invent_local, os dados são atualizados normalmente.</p>` : ''}
      </div>
    </div>`;
  $('#btn-link-agente').onclick = () => modalLinkInstalacao();
  $('#btn-coleta-agente').onclick = modalImportarColeta;
  $('#btn-coleta-coletores').onclick = modalImportarColeta;
  const baixarZip = async (montar, nome) => {
    try {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(await montar()); a.download = nome; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    } catch (err) { toast('Não foi possível montar o kit: ' + err.message, true); }
  };
  $('#btn-kit-zip').onclick = () => baixarZip(montarKitInventLocal, 'Invent_local.zip');
  $('#btn-kit-coletores').onclick = () => baixarZip(montarKitColetores, 'Coletores_Quallit.zip');
  $('#btn-link-coletor').onclick = () => modalLinkInstalacao({ pagina: 'coletor.html' });
}

/* ---- Redes e setores: faixa de IP → CD/setor ---- */
export const ipNum = (ip) => { const p = String(ip || '').split('.').map(Number); return p.length === 4 && p.every((n) => Number.isInteger(n) && n >= 0 && n <= 255) ? ((p[0] << 24) >>> 0) + (p[1] << 16) + (p[2] << 8) + p[3] : null; };
export function cidrOk(c) {
  const m = String(c || '').trim().match(/^(\d{1,3}(?:\.\d{1,3}){3})\/(\d{1,2})$/);
  if (!m || ipNum(m[1]) == null || +m[2] < 8 || +m[2] > 32) return null;
  const bits = +m[2], mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  const base = (ipNum(m[1]) & mask) >>> 0;
  return { bits, base, mask, txt: `${[24, 16, 8, 0].map((s) => (base >>> s) & 255).join('.')}/${bits}` };
}
export const ipNaRede = (ip, c) => { const n = ipNum(ip), r = cidrOk(c); return n != null && r && ((n & r.mask) >>> 0) === r.base; };

export async function renderRedes(el, abas) {
  el.innerHTML = `<div class="view-head">${titulo('Coleta', '', 'Cadastre as faixas de IP de cada CD e setor. A máquina que aparece numa faixa recebe o setor automaticamente, e o painel avisa quando ela surge na rede de outro CD.')}
      <div class="actions">${ehAdmin() ? '<button class="btn" id="rd-aplicar" title="Reaplica as faixas usando o último IP de cada máquina">Aplicar agora</button><button class="btn btn--primary" id="rd-nova">+ Nova rede</button>' : ''}</div></div>
    ${abas}<div id="rd-corpo"><div class="skeleton">Carregando…</div></div>`;
  const { data: redes, error } = await sb.from('redes').select('*').order('cidr');
  const corpo = $('#rd-corpo');
  if (error) {
    corpo.innerHTML = /redes|does not exist|schema cache/i.test(error.message)
      ? '<div class="card card-pad"><h2>Falta um passo no banco</h2><p class="muted">Aplique as migrações do banco (<code>supabase db push --remote</code>; veja o README) para liberar as redes e setores.</p></div>'
      : `<div class="card card-pad erro">${esc(erroMsg(error))}</div>`;
    return;
  }
  state.redes = redes || [];
  const lista = state.redes.filter((r) => !state.cdAtual || r.cd_id === state.cdAtual);
  const maqs = MQ();
  const naRede = (r) => maqs.filter((m) => m.rede?.id === r.id || (!m.rede && ipNaRede(m.ip, r.cidr)));
  // sugestões: IPs de máquinas sem faixa, agrupados por /24
  const sem = maqs.filter((m) => m.ip && ipNum(m.ip) != null && !state.redes.some((r) => ipNaRede(m.ip, r.cidr)));
  const grupos = {};
  for (const m of sem) { const k = m.ip.split('.').slice(0, 3).join('.') + '.0/24'; (grupos[k] ||= []).push(m); }
  const moda = (arr) => { const c = {}; arr.filter(Boolean).forEach((x) => (c[x] = (c[x] || 0) + 1)); return Object.entries(c).sort((a, b) => b[1] - a[1])[0]?.[0] || ''; };
  const sugestoes = Object.entries(grupos).map(([cidr, ms]) => ({ cidr, ms, setor: moda(ms.map((m) => m.setor)), cd: moda(ms.map((m) => m.cd_id)) }))
    .sort((a, b) => b.ms.length - a.ms.length).slice(0, 8);

  corpo.innerHTML = `
    <div class="card"><div class="table-wrap" style="max-height:none"><table class="mini-table tab-redes">
      <thead><tr>${mostrarColCD() ? '<th>CD</th>' : ''}<th>Faixa de IP</th><th>Setor</th><th>Localização</th><th>Automático</th><th class="num">Máquinas</th>${ehAdmin() ? '<th></th>' : ''}</tr></thead>
      <tbody>${lista.length ? lista.map((r) => { const n = naRede(r); const fora = n.filter((m) => m.cd_id !== r.cd_id).length; return `<tr>
        ${mostrarColCD() ? `<td><span class="pill pill--cd">${esc(cdCod(r.cd_id))}</span></td>` : ''}
        <td><code>${esc(r.cidr)}</code>${r.descricao ? `<div class="muted" style="font-size:12px">${esc(r.descricao)}</div>` : ''}</td>
        <td>${esc(r.setor || '—')}</td><td>${esc(r.localizacao || '—')}</td>
        <td>${r.aplicar_setor ? pill('grava setor', 'ok') : pill('só identifica')}</td>
        <td class="num"><a href="#" data-ver-rede="${r.id}">${n.length}</a>${fora ? ` <span class="tag tag--bad" title="Máquinas de outro CD nesta faixa">${fora} de outro CD</span>` : ''}</td>
        ${ehAdmin() ? `<td class="acoes-linha"><button class="btn btn--sm btn--ghost" data-ed-rede="${r.id}">Editar</button><button class="btn btn--sm btn--ghost btn--danger-txt" data-del-rede="${r.id}">Excluir</button></td>` : ''}
      </tr>`; }).join('') : `<tr><td colspan="7" class="vazio-linha">Nenhuma rede cadastrada${state.cdAtual ? ' neste CD' : ''}. ${ehAdmin() ? 'Use as sugestões abaixo ou “+ Nova rede”.' : 'Peça ao administrador para cadastrar.'}</td></tr>`}</tbody>
    </table></div></div>
    ${sugestoes.length ? `<h3 class="sec-rel">Redes encontradas sem cadastro <span class="muted">agrupadas pelo IP que as máquinas informaram</span></h3>
    <div class="rede-sugs">${sugestoes.map((g) => `<div class="card rede-sug">
      <div><code>${esc(g.cidr)}</code><strong>${g.ms.length} máquina(s)</strong>
        <span class="muted">${esc([cdCod(g.cd), g.setor && 'maioria em ' + g.setor].filter(Boolean).join(' · '))}</span></div>
      ${ehAdmin() ? `<button class="btn btn--sm" data-sug="${esc(g.cidr)}" data-sug-cd="${esc(g.cd)}" data-sug-setor="${esc(g.setor)}">Cadastrar</button>` : ''}
    </div>`).join('')}</div>` : ''}
    <p class="muted dica-redes">Dica: a faixa mais específica vence (um /24 do setor tem prioridade sobre o /16 do CD inteiro). Notebooks emprestados não têm o setor alterado. Ao salvar, as faixas são aplicadas na hora com o último IP conhecido; o agente confirma na próxima coleta.</p>`;

  $$('[data-ver-rede]', corpo).forEach((a) => (a.onclick = (e) => { e.preventDefault(); const r = state.redes.find((x) => x.id === a.dataset.verRede); state.f = { ...F_PADRAO, q: r.cidr.split('/')[0].split('.').slice(0, Math.max(1, Math.floor(cidrOk(r.cidr).bits / 8))).join('.') + '.' }; location.hash = '#maquinas'; }));
  $$('[data-ed-rede]', corpo).forEach((b) => (b.onclick = () => modalRede(state.redes.find((r) => r.id === b.dataset.edRede))));
  $$('[data-del-rede]', corpo).forEach((b) => (b.onclick = async () => {
    const r = state.redes.find((x) => x.id === b.dataset.delRede);
    if (!(await confirmar(`As máquinas mantêm o setor atual.`, { titulo: `Excluir a rede ${r.cidr}?`, ok: 'Excluir', perigo: true }))) return;
    const { error: er } = await sb.from('redes').delete().eq('id', r.id);
    if (er) return toast(erroMsg(er), true);
    await sb.rpc('aplicar_redes'); await carregarMaquinas(); toast('Rede excluída'); renderColeta('redes');
  }));
  $$('[data-sug]', corpo).forEach((b) => (b.onclick = () => modalRede(null, { cidr: b.dataset.sug, cd_id: b.dataset.sugCd, setor: b.dataset.sugSetor })));
  $('#rd-nova')?.addEventListener('click', () => modalRede());
  $('#rd-aplicar')?.addEventListener('click', async () => {
    const { data: n, error: er } = await sb.rpc('aplicar_redes');
    if (er) return toast(erroMsg(er), true);
    await carregarMaquinas(); toast(n ? `${n} máquina(s) atualizada(s)` : 'Tudo já estava de acordo com as redes'); renderColeta('redes');
  });
}

export function modalRede(r = null, pre = {}) {
  const v = { cidr: '', cd_id: state.cdAtual || cdsAtivos()[0]?.id, setor: '', localizacao: '', descricao: '', aplicar_setor: true, ...pre, ...(r || {}) };
  if (!v.cd_id) v.cd_id = state.cdAtual || cdsAtivos()[0]?.id;
  const setores = [...new Set(state.maquinas.map((m) => m.setor).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  modal(`<form id="rd-form">
    <div class="modal-head"><h2>${r ? 'Editar rede' : 'Nova rede'}</h2><p class="muted" style="margin:4px 0 0">Ex.: <code>10.12.5.0/24</code> para um setor ou <code>10.12.0.0/16</code> para o CD inteiro.</p></div>
    <div class="modal-body"><div class="form-grid">
      <label>Faixa de IP (CIDR) *<input name="cidr" class="mono" required value="${esc(v.cidr)}" placeholder="10.12.5.0/24" autocomplete="off"></label>
      <label>CD *<select name="cd_id" required>${opts(cdsAtivos().map((c) => [c.id, `${c.codigo} · ${c.nome}`]), v.cd_id)}</select></label>
      <label>Setor<input name="setor" list="dl-rd-set" value="${esc(v.setor || '')}" placeholder="Vazio = só identifica o CD"></label>
      <label>Localização<input name="localizacao" value="${esc(v.localizacao || '')}" placeholder="Ex.: Doca 2"></label>
      <label class="full">Descrição<input name="descricao" value="${esc(v.descricao || '')}" placeholder="Ex.: Wi-Fi da expedição, VLAN 20"></label>
      <label class="check full"><input type="checkbox" name="aplicar_setor" ${v.aplicar_setor ? 'checked' : ''}> Gravar setor e localização automaticamente nas máquinas desta rede</label>
      <datalist id="dl-rd-set">${setores.map((x) => `<option value="${esc(x)}">`).join('')}</datalist>
    </div>
    <div class="ag-previa" id="rd-previa"></div><p class="erro" id="rd-erro"></p></div>
    <div class="modal-foot"><button type="button" class="btn" data-close>Cancelar</button><button class="btn btn--primary" id="rd-salvar">Salvar</button></div>
  </form>`, (dlg) => {
    const f = $('#rd-form');
    const previa = () => {
      const c = cidrOk(f.cidr.value);
      if (!c) { $('#rd-previa').innerHTML = '<span class="muted">Digite a faixa no formato <code>IP/prefixo</code>.</span>'; return; }
      const ms = MQ().filter((m) => ipNaRede(m.ip, c.txt));
      const total = 2 ** (32 - c.bits);
      $('#rd-previa').innerHTML = `<strong>${esc(c.txt)}</strong> · ${total.toLocaleString('pt-BR')} endereços<br><span class="muted">${ms.length ? `${ms.length} máquina(s) do inventário estão nesta faixa agora${f.aplicar_setor.checked && f.setor.value.trim() ? ` e passam para o setor <b>${esc(f.setor.value.trim())}</b>` : ''}.` : 'Nenhuma máquina do inventário está nesta faixa agora.'}</span>`;
    };
    f.oninput = previa; previa();
    f.onsubmit = async (e) => {
      e.preventDefault();
      const c = cidrOk(f.cidr.value);
      if (!c) { $('#rd-erro').textContent = 'Faixa inválida. Use o formato 10.12.5.0/24 (prefixo entre 8 e 32).'; return; }
      const row = { cidr: c.txt, cd_id: f.cd_id.value, setor: f.setor.value.trim() || null, localizacao: f.localizacao.value.trim() || null, descricao: f.descricao.value.trim() || null, aplicar_setor: f.aplicar_setor.checked };
      $('#rd-salvar').disabled = true;
      const { error } = r ? await sb.from('redes').update(row).eq('id', r.id) : await sb.from('redes').insert(row);
      $('#rd-salvar').disabled = false;
      if (error) { $('#rd-erro').textContent = /redes_cidr_uk|duplicate/i.test(error.message) ? 'Essa faixa já está cadastrada.' : erroMsg(error); return; }
      const { data: n } = await sb.rpc('aplicar_redes');
      dlg.close(); await carregarMaquinas();
      toast(`Rede salva${n ? ` · ${n} máquina(s) atualizada(s)` : ''}`);
      renderColeta('redes');
    };
  });
}
