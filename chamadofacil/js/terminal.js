/* =========================================================
   CHAMADO FÁCIL — Terminal de bipagem (retirada / devolução)
   Funciona com leitor USB/Bluetooth (modo teclado + Enter),
   com digitação manual ou com a câmera do tablet/celular.
   ========================================================= */
(async function () {
  const { sb, icon, esc, fmtHora, primeiroNome, codigoColetor, soDigitos, turnoAtual, beep, debounce } = CF;
  const $ = (s) => document.querySelector(s);

  const p = await CF.meuPerfil();
  if (!p) { location.replace('index.html?ir=terminal'); return; }

  $('#ic-scan').outerHTML = icon('barcode');
  $('#btn-cam').innerHTML = icon('camera') + 'Usar câmera';
  $('#btn-limpar').innerHTML = icon('x') + 'Limpar (Esc)';
  $('#btn-painel').innerHTML = icon('monitor') + 'Painel do supervisor';

  const relogio = () => {
    $('#relogio').textContent = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: CF.C.FUSO });
    $('#turno').textContent = turnoAtual().id;
  };
  relogio(); setInterval(relogio, 15000);

  /* ---------- cadastro local para mostrar nome na hora ---------- */
  let colabs = new Map(), coletores = new Map();
  async function carregarBase() {
    const rows = await CF.buscarTudo(() => sb.from('colaboradores').select('matricula,nome,equipe,ativo'));
    colabs = new Map(rows.map((r) => [r.matricula.replace(/^0+/, ''), r]));
    const { data } = await sb.from('coletores').select('numero,codigo,status,portador_nome,portador_matricula,retirado_em,turno_retirada');
    coletores = new Map((data || []).map((c) => [c.numero, c]));
  }
  await carregarBase();
  const pessoaDe = (mat) => colabs.get(String(mat).replace(/^0+/, ''));

  /* ---------- estado da leitura ---------- */
  const st = { mat: null, col: null, ocupado: false, timer: null, pendTransfer: null, pergunta: null };
  const inp = $('#scan');

  function pintar() {
    const pes = st.mat && pessoaDe(st.mat);
    $('#val-pessoa').textContent = st.mat ? (pes ? primeiroNome(pes.nome) : st.mat) : '';
    $('#val-coletor').textContent = st.col ? codigoColetor(st.col) : '';
    $('#st-pessoa').className = 'tstep ' + (st.mat ? 'done' : 'active');
    $('#st-coletor').className = 'tstep ' + (st.col ? 'done' : st.mat ? 'active' : '');
    inp.placeholder = !st.mat && !st.col ? 'Aguardando leitura…' : !st.mat ? 'Agora bipe seu crachá…' : 'Agora bipe o coletor…';
  }
  function limpar() {
    st.mat = null; st.col = null; st.pendTransfer = null;
    clearTimeout(st.timer);
    inp.value = '';
    pintar();
    foco();
  }
  const reiniciarInatividade = () => { clearTimeout(st.timer); st.timer = setTimeout(() => { if (st.mat || st.col) limpar(); esconderResultado(); }, 25000); };

  function mostrarResultado(tipo, titulo, texto, extra = '', ms = 4000) {
    const r = $('#result');
    const ic = { RETIRADA: 'up', DEVOLUCAO: 'down', ERRO: 'alert', AVISO: 'swap', INFO: 'scanner', OCORRENCIA: 'wrench' }[tipo];
    r.className = `term-result show ${tipo === 'INFO' ? 'AVISO' : tipo}`;
    r.innerHTML = `<div class="ri">${icon(ic)}</div><div style="flex:1;min-width:200px"><h2>${titulo}</h2><p>${texto}</p></div>${extra}`;
    clearTimeout(r._t);
    if (ms) r._t = setTimeout(esconderResultado, ms);
  }
  function esconderResultado() { $('#result').className = 'term-result'; }

  /* ---------- interpreta o que foi bipado ---------- */
  function classificar(raw) {
    const v = String(raw || '').trim().toUpperCase();
    if (!v) return null;
    let m = v.match(/^COL[^0-9A-Z]{0,2}0*(\d{1,6})$/);
    if (m) return { tipo: 'col', val: +m[1] };
    m = v.match(/^(?:MAT[:\-\s]?)(\d+)$/);
    if (m) return { tipo: 'mat', val: m[1] };
    const d = soDigitos(v);
    if (d && d === v.replace(/\s/g, '')) {
      // matrículas têm 5+ dígitos; números curtos são coletores digitados
      if (d.length >= 5) return { tipo: 'mat', val: d };
      return { tipo: 'col', val: +d };
    }
    return { tipo: 'invalido', val: v };
  }

  async function ler(raw) {
    if (st.ocupado) return;
    // respondendo "o coletor tem problema?" pelo teclado/leitor: 0 ou Enter = tudo certo, 1-6 = problema
    if (st.pergunta) {
      const v = String(raw || '').trim();
      if (v === '' || v === '0') { inp.value = ''; return responderOcorrencia(null); }
      if (/^[1-6]$/.test(v)) { inp.value = ''; return responderOcorrencia(OPCOES[+v - 1][0]); }
      responderOcorrencia(null, true); // bipou outra coisa: segue sem problema
    }
    const c = classificar(raw);
    inp.value = '';
    if (!c) return;
    reiniciarInatividade();

    // confirmação de transferência: bipar o mesmo coletor de novo confirma
    if (st.pendTransfer && c.tipo === 'col' && c.val === st.pendTransfer.col) { return transferir(); }

    if (c.tipo === 'invalido') {
      beep('err');
      mostrarResultado('ERRO', 'Código não reconhecido', `Li “${esc(c.val)}”. Bipe o crachá (matrícula) ou o QR do coletor.`);
      return;
    }
    if (c.tipo === 'mat') {
      const pes = pessoaDe(c.val);
      if (!pes) { beep('err'); mostrarResultado('ERRO', 'Matrícula não encontrada', `${esc(c.val)} não está no cadastro do CD-AM. Procure seu supervisor.`); return; }
      st.mat = c.val; beep('ok');
      const tem = [...coletores.values()].filter((x) => x.status === 'EM_USO' && String(x.portador_matricula).replace(/^0+/, '') === String(c.val).replace(/^0+/, ''));
      const atr = tem.filter((x) => CF.estaAtrasado(x));
      if (!st.col && atr.length) {
        beep('err');
        mostrarResultado('ERRO', `${esc(primeiroNome(pes.nome))}, devolva ${atr.length > 1 ? 'os coletores' : 'o ' + esc(atr[0].codigo)}!`,
          `Você está com ${atr.map((x) => `<b>${esc(x.codigo)}</b> desde ${CF.fmtData(x.retirado_em)} ${fmtHora(x.retirado_em)}`).join(', ')} e o turno já acabou. Bipe o coletor agora para devolver.`, '', 0);
      } else if (!st.col) mostrarResultado('INFO', `Olá, ${esc(primeiroNome(pes.nome))}!`,
        tem.length ? `Você está com <b>${tem.map((x) => x.codigo).join(', ')}</b>. Bipe o coletor para devolver ou retirar outro.` : 'Agora bipe o coletor.', '', 0);
    } else {
      st.col = c.val; beep('ok');
      const col = coletores.get(c.val);
      if (!st.mat) mostrarResultado('INFO', `${codigoColetor(c.val)}`,
        col ? (col.status === 'EM_USO' ? `Em uso por ${esc(primeiroNome(col.portador_nome))}. Bipe seu crachá para devolver.` : 'Bipe seu crachá para retirar.') : 'Bipe seu crachá.', '', 0);
    }
    pintar();
    if (st.mat && st.col) await enviar();
  }

  async function enviar(transferir = false) {
    st.ocupado = true;
    inp.disabled = true;
    try {
      const { data, error } = await sb.rpc('registrar_bipagem', {
        p_matricula: st.mat, p_coletor: codigoColetor(st.col), p_acao: 'AUTO', p_transferir: transferir, p_origem: 'TERMINAL', p_obs: null,
      });
      if (error) throw error;
      if (data.ok) {
        beep(data.tipo === 'RETIRADA' ? 'ret' : 'dev');
        const pn = primeiroNome(data.nome);
        mostrarResultado(data.tipo,
          data.tipo === 'RETIRADA' ? `Retirada · ${esc(data.coletor)}` : `Devolução · ${esc(data.coletor)}`,
          data.tipo === 'RETIRADA'
            ? `${esc(pn)} está com o coletor. Bom trabalho! <span style="opacity:.75">(${esc(data.turno)} · ${fmtHora(data.criado_em)})</span>${data.transferido_de ? `<br>Recebido de ${esc(primeiroNome(data.transferido_de))}.` : ''}`
            : `Obrigado, ${esc(pn)}! Coletor devolvido às ${fmtHora(data.criado_em)}.`,
          data.tipo === 'DEVOLUCAO' ? perguntaHtml() : '', data.tipo === 'DEVOLUCAO' ? 0 : 4500);
        if (data.tipo === 'DEVOLUCAO') abrirPergunta(data.coletor, data.matricula);
        limpar();
        carregarBase();
      } else if (data.erro === 'EM_USO_OUTRO') {
        beep('err');
        st.pendTransfer = { col: st.col };
        mostrarResultado('AVISO', `${esc(data.coletor)} está com ${esc(primeiroNome(data.portador))}`,
          'Se ele passou o coletor para você, toque em <b>Transferir para mim</b> ou bipe o coletor de novo. Caso contrário, devolva ao responsável.',
          `<div style="display:flex;gap:8px;width:100%"><button class="btn btn-primary" id="bt-transf" style="flex:1;min-height:52px">${icon('swap')}Transferir para mim</button><button class="btn" id="bt-cancel" style="background:rgba(255,255,255,.15);color:#fff;min-height:52px">Cancelar</button></div>`, 15000);
        $('#bt-transf').onclick = transferir;
        $('#bt-cancel').onclick = () => { esconderResultado(); limpar(); };
      } else {
        beep('err');
        mostrarResultado('ERRO', 'Não foi possível registrar', esc(data.mensagem), '', 6000);
        if (data.erro === 'SEM_PERMISSAO') setTimeout(() => location.replace('index.html?ir=terminal'), 2500);
        limpar();
      }
    } catch (e) {
      beep('err');
      mostrarResultado('ERRO', 'Sem conexão', 'Verifique a internet e bipe novamente. ' + esc(e.message || ''), '', 6000);
      limpar();
    } finally {
      st.ocupado = false; inp.disabled = false; foco();
    }
  }
  /* ---------- ocorrência na devolução ---------- */
  const OPCOES = [['BATERIA', 'Bateria'], ['TELA', 'Tela'], ['NAO_LIGA', 'Não liga'], ['LEITOR', 'Leitor/gatilho'], ['TECLADO', 'Teclado'], ['OUTRO', 'Outro problema']];
  const SEG_PERGUNTA = 9;
  function perguntaHtml() {
    return `<div class="oc-ask"><span>O coletor está com algum problema?</span>
      <div class="opts"><button class="okb" data-oc="">${icon('check')}Tudo certo <kbd>Enter</kbd></button>
      ${OPCOES.map(([k, l], i) => `<button data-oc="${k}">${l} <kbd>${i + 1}</kbd></button>`).join('')}</div>
      <div class="oc-bar"><i style="animation-duration:${SEG_PERGUNTA}s"></i></div></div>`;
  }
  function abrirPergunta(coletor, matricula) {
    clearTimeout(st.pergunta?.timer);
    st.pergunta = { coletor, matricula, timer: setTimeout(() => responderOcorrencia(null), SEG_PERGUNTA * 1000) };
    document.querySelectorAll('#result [data-oc]').forEach((b) => b.onclick = () => responderOcorrencia(b.dataset.oc || null));
  }
  async function responderOcorrencia(tipo, silencioso = false) {
    const p = st.pergunta;
    if (!p) return;
    clearTimeout(p.timer);
    st.pergunta = null;
    if (!tipo) { if (!silencioso) esconderResultado(); foco(); return; }
    st.ocupado = true;
    try {
      const { data, error } = await sb.rpc('registrar_ocorrencia', { p_coletor: p.coletor, p_tipo: tipo, p_matricula: p.matricula, p_descricao: null, p_origem: 'TERMINAL', p_manutencao: true });
      if (error || !data?.ok) throw new Error(error?.message || data?.mensagem);
      beep('dev');
      mostrarResultado('OCORRENCIA', `${esc(p.coletor)} foi para manutenção`, `Problema: <b>${esc(data.tipo)}</b>. Obrigado por avisar — o supervisor já foi notificado. Pegue outro coletor.`, '', 6000);
      carregarBase();
    } catch (e) {
      beep('err');
      mostrarResultado('ERRO', 'Não consegui registrar o problema', 'Avise o supervisor. ' + esc(e.message || ''), '', 6000);
    } finally { st.ocupado = false; foco(); }
  }

  async function transferir() {
    if (!st.pendTransfer) return;
    st.pendTransfer = null;
    await enviar(true);
  }

  /* ---------- entrada pelo leitor (modo teclado) ---------- */
  $('#form').addEventListener('submit', (e) => { e.preventDefault(); ler(inp.value); });
  // alguns leitores enviam TAB no fim em vez de Enter
  inp.addEventListener('keydown', (e) => { if (e.key === 'Tab' && inp.value) { e.preventDefault(); ler(inp.value); } });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { if (st.pergunta) responderOcorrencia(null); esconderResultado(); limpar(); } });
  $('#btn-limpar').onclick = () => { esconderResultado(); limpar(); };
  const foco = () => { if (!document.querySelector('.modal-back') && document.activeElement !== inp && !st.camOn) inp.focus({ preventScroll: true }); };
  setInterval(foco, 1500);
  document.addEventListener('click', (e) => { if (!e.target.closest('button,a,input')) foco(); });

  /* ---------- câmera ---------- */
  let cam = null;
  $('#btn-cam').onclick = async () => {
    if (!window.Html5Qrcode) return CF.toast('Câmera indisponível', 'Biblioteca ainda carregando.', 'err');
    const box = $('#cam-box');
    if (cam) { try { await cam.stop(); } catch (e) { /* */ } cam = null; st.camOn = false; box.classList.add('hidden'); $('#btn-cam').innerHTML = icon('camera') + 'Usar câmera'; foco(); return; }
    box.classList.remove('hidden');
    st.camOn = true;
    cam = new Html5Qrcode('cam');
    let ultimo = '', quando = 0;
    try {
      await cam.start({ facingMode: 'environment' }, {
        fps: 12,
        qrbox: (w, h) => ({ width: Math.floor(Math.min(w * 0.9, 380)), height: Math.floor(Math.min(h * 0.6, 220)) }),
        experimentalFeatures: { useBarCodeDetectorIfSupported: true },
      }, (txt) => {
        if (txt === ultimo && Date.now() - quando < 2500) return;
        ultimo = txt; quando = Date.now();
        ler(txt);
      });
      $('#btn-cam').innerHTML = icon('x') + 'Fechar câmera';
    } catch (e) {
      st.camOn = false; box.classList.add('hidden'); cam = null;
      CF.toast('Não foi possível abrir a câmera', String(e.message || e), 'err');
    }
  };

  /* ---------- feed do dia (tempo real) ---------- */
  const hojeISO = () => new Date(`${new Date().toLocaleDateString('en-CA', { timeZone: CF.C.FUSO })}T00:00:00-04:00`).toISOString();
  async function carregarFeed() {
    const { data } = await sb.from('movimentos').select('*').gte('criado_em', hojeISO()).order('criado_em', { ascending: false }).limit(40);
    $('#feed').innerHTML = (data || []).length ? data.map((m) => `<div class="tf"><span class="tag ${m.tipo}">${m.tipo === 'RETIRADA' ? 'SAIU' : 'VOLTOU'}</span>
      <div><b class="mono">${esc(m.coletor_codigo)}</b> · ${esc(primeiroNome(m.nome))}<br><small>${esc(m.turno || '')}${m.origem === 'MANUAL' ? ' · manual' : ''}</small></div><small>${fmtHora(m.criado_em)}</small></div>`).join('')
      : '<div style="color:rgba(255,255,255,.5);padding:20px;text-align:center">Nenhuma movimentação hoje.</div>';
  }
  carregarFeed();
  const rec = debounce(() => { carregarFeed(); carregarBase(); }, 300);
  sb.channel('terminal').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'movimentos' }, rec)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'coletores' }, rec).subscribe();

  pintar();
  foco();
})();
