/* =========================================================
   CHAMADO FÁCIL · CD-AM — aplicação do supervisor
   ========================================================= */
(async function () {
  const { sb, C, icon, esc, fmtHora, fmtData, fmtDataHora, fmtDuracao, relTempo, iniciais, primeiroNome,
    codigoColetor, soDigitos, turnoAtual, toast, beep, modal, confirmar, debounce, baixarCSV, buscarTudo } = CF;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const pintarIcones = (root = document) => $$('[data-i]', root).forEach((el) => { el.outerHTML = icon(el.dataset.i); });

  const me = await CF.exigirLogin();
  const ehCoord = ['coordenador', 'admin'].includes(me.perfil);
  pintarIcones();

  /* ---------------- estado ---------------- */
  const S = {
    colabs: new Map(),   // matricula -> colaborador
    coletores: [],
    chamados: [],
    view: null,
    filtroKpi: '',
    meus: 'todos',
    notifs: carregarNotifs(),
  };

  $('#me-nome').textContent = primeiroNome(me.nome);
  $('#me-info').textContent = `${me.perfil === 'coordenador' ? 'Coordenação' : 'Supervisão'} · ${me.equipe || 'CD-AM'}`;
  $('#me-av').textContent = iniciais(me.nome);
  $('#btn-sair').onclick = CF.sair;
  $('#btn-conta').onclick = abrirConta;
  const atualizaTurno = () => { $('#turno').textContent = turnoAtual().id; };
  atualizaTurno(); setInterval(atualizaTurno, 60000);

  /* ---------------- navegação ---------------- */
  const TITULOS = { chamados: 'Chamados', coletores: 'Coletores de dados', turno: 'Turno', historico: 'Movimentações', equipe: 'Equipe' };
  function ir(v) {
    if (!TITULOS[v]) v = 'chamados';
    S.view = v;
    $$('.view').forEach((el) => el.classList.toggle('on', el.id === 'v-' + v));
    $$('[data-go]').forEach((el) => el.classList.toggle('on', el.dataset.go === v));
    $('#titulo').textContent = TITULOS[v];
    $('#crumb').textContent = `Olá, ${primeiroNome(me.nome).split(' ')[0]} · CD-AM`;
    history.replaceState(null, '', '#' + v);
    if (v === 'historico') carregarHistorico();
    if (v === 'turno') carregarTurno();
    if (v === 'equipe') renderEquipe();
    if (v === 'chamados') carregarChamados();
    window.scrollTo(0, 0);
  }
  $$('[data-go]').forEach((el) => el.addEventListener('click', () => ir(el.dataset.go)));

  /* ---------------- dados base ---------------- */
  async function carregarColabs() {
    const rows = await buscarTudo(() => sb.from('colaboradores').select('*').order('nome'));
    S.colabs = new Map(rows.map((r) => [r.matricula, r]));
    const equipes = [...new Set(rows.map((r) => r.equipe).filter(Boolean))].sort();
    ['#col-equipe', '#h-equipe', '#eq-equipe'].forEach((sel) => {
      const el = $(sel), v = el.value;
      el.innerHTML = `<option value="">Todas as equipes</option>` + equipes.map((e) => `<option>${esc(e)}</option>`).join('');
      el.value = v;
    });
  }
  const equipesLista = () => [...new Set([...S.colabs.values()].map((r) => r.equipe).filter(Boolean))].sort();
  const gestores = () => [...S.colabs.values()].filter((c) => c.perfil !== 'colaborador' && c.ativo);

  async function carregarColetores() {
    const { data, error } = await sb.from('coletores').select('*').order('numero');
    if (error) { toast('Erro ao carregar coletores', error.message, 'err'); return; }
    S.coletores = data;
    renderColetores();
  }

  /* =========================================================
     1. CHAMADOS
     ========================================================= */
  const ACOES = {
    TEAMS: ['Reset de senha'],
    WMS: ['Reset de senha', 'Criação de acesso', 'Desbloqueio de usuário'],
  };
  const NOME_SISTEMA = { TEAMS: 'Microsoft Teams (Gente Mobile / Universidade RD)', WMS: 'WMS Manhattan' };

  $$('[data-ticket]').forEach((b) => b.addEventListener('click', () => abrirChamado(b.dataset.ticket)));
  document.addEventListener('keydown', (e) => {
    if (S.view !== 'chamados' || document.querySelector('.modal-back') || /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return;
    if (e.key === '1') abrirChamado('TEAMS');
    if (e.key === '2') abrirChamado('WMS');
  });

  function textoChamado(tipo, acao, p, obs) {
    const linhas = [
      `Solicitação: ${acao} – ${NOME_SISTEMA[tipo]}`,
      `Colaborador: ${p.nome}`,
      `Matrícula: ${p.matricula}`,
    ];
    if (p.cargo) linhas.push(`Cargo: ${p.cargo}`);
    if (p.setor) linhas.push(`Setor: ${p.setor}`);
    linhas.push('Unidade: CD-AM (Manaus)');
    if (tipo === 'TEAMS') linhas.push('Observação: a mesma senha é usada no Teams, Gente Mobile e Universidade RD.');
    if (obs) linhas.push(`Detalhes: ${obs}`);
    linhas.push(`Solicitante: ${me.nome} (mat. ${me.matricula}) – ${me.cargo || 'Supervisor'}`);
    return linhas.join('\n');
  }

  function seletorPessoa(container, aoEscolher, { placeholder = 'Digite o nome ou a matrícula…' } = {}) {
    container.innerHTML = `<div class="field"><label>Colaborador</label>
      <div class="search" style="max-width:none">${icon('search')}<input class="input" data-busca placeholder="${placeholder}" autocomplete="off"></div></div>
      <div class="pick-list" data-lista style="margin-top:8px"></div>`;
    const inp = $('[data-busca]', container), lista = $('[data-lista]', container);
    let itens = [], idx = 0;
    const desenhar = () => {
      const q = inp.value.trim().toLowerCase();
      const dig = soDigitos(q);
      itens = [...S.colabs.values()].filter((c) => c.ativo && (!q || c.nome.toLowerCase().includes(q) || (dig && c.matricula.includes(dig)))).slice(0, 40);
      if (dig && dig.length >= 4 && !S.colabs.has(dig) && !itens.length) {
        lista.innerHTML = `<div class="pick-item" data-novo><div class="avatar">?</div><div><b>Matrícula ${esc(dig)} não cadastrada</b><span>Clique para informar o nome manualmente</span></div></div>`;
        $('[data-novo]', lista).onclick = () => {
          const nome = prompt('Nome completo do colaborador:');
          if (nome) aoEscolher({ matricula: dig, nome: nome.trim(), cargo: '', setor: '', equipe: '' });
        };
        return;
      }
      idx = Math.min(idx, Math.max(0, itens.length - 1));
      lista.innerHTML = itens.length ? itens.map((c, i) => `<div class="pick-item ${i === idx ? 'on' : ''}" data-k="${i}">
        <div class="avatar">${esc(iniciais(c.nome))}</div><div><b>${esc(c.nome)}</b><span>${esc(c.matricula)} · ${esc(c.cargo || '')}${c.equipe ? ' · ' + esc(c.equipe) : ''}</span></div></div>`).join('')
        : `<div class="empty" style="padding:16px">Ninguém encontrado.</div>`;
      $$('[data-k]', lista).forEach((el) => el.addEventListener('click', () => aoEscolher(itens[+el.dataset.k])));
    };
    inp.addEventListener('input', () => { idx = 0; desenhar(); });
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { idx = Math.min(idx + 1, itens.length - 1); desenhar(); e.preventDefault(); }
      if (e.key === 'ArrowUp') { idx = Math.max(idx - 1, 0); desenhar(); e.preventDefault(); }
      if (e.key === 'Enter' && itens[idx]) { aoEscolher(itens[idx]); e.preventDefault(); }
    });
    desenhar();
    setTimeout(() => inp.focus(), 50);
  }

  function abrirChamado(tipo) {
    let pessoa = null, acao = ACOES[tipo][0];
    const titulo = tipo === 'TEAMS' ? `${icon('key')} Reset de senha · Teams` : `${icon('box')} WMS · Manhattan`;
    const m = modal({
      titulo: `<span style="display:inline-flex;gap:8px;align-items:center">${titulo}</span>`,
      corpo: `<div class="form-stack">
        ${ACOES[tipo].length > 1 ? `<div class="field"><label>O que precisa?</label><div class="seg" data-acoes>${ACOES[tipo].map((a, i) => `<button type="button" class="${i ? '' : 'on'}" data-a="${esc(a)}">${esc(a)}</button>`).join('')}</div></div>` : ''}
        <div data-pessoa></div>
        <div class="field"><label>Detalhes (opcional)</label><input class="input" data-obs placeholder="Ex.: usuário bloqueado após 3 tentativas"></div>
        <div class="field hidden" data-prev-wrap><label>Texto do chamado (vai copiado)</label><div class="preview-text" data-prev></div></div>
        <div class="steps-hint">
          <div><b>1. Copiar e abrir</b>O texto vai para a área de transferência.</div>
          <div><b>2. Colar no ServiceNow</b>Cole na descrição e envie.</div>
          <div><b>3. Anotar o nº</b>Registre o RITM aqui para acompanhar.</div>
        </div>
      </div>`,
      rodape: `<button class="btn btn-ghost" data-close>Cancelar</button>
        <button class="btn btn-primary" data-enviar disabled>${icon('copy')}Copiar e abrir ServiceNow</button>`,
    });
    const atualizar = () => {
      const ok = !!pessoa;
      m.$('[data-enviar]').disabled = !ok;
      m.$('[data-prev-wrap]').classList.toggle('hidden', !ok);
      if (ok) m.$('[data-prev]').textContent = textoChamado(tipo, acao, pessoa, m.$('[data-obs]').value.trim());
    };
    const escolher = (p) => {
      pessoa = p;
      m.$('[data-pessoa]').innerHTML = `<div class="field"><label>Colaborador</label><div class="selected-person">
        <div class="avatar">${esc(iniciais(p.nome))}</div><div><b>${esc(p.nome)}</b><span>Mat. ${esc(p.matricula)}${p.cargo ? ' · ' + esc(p.cargo) : ''}</span></div>
        <button class="btn btn-ghost btn-sm" data-trocar>Trocar</button></div></div>`;
      m.$('[data-trocar]').onclick = () => { pessoa = null; seletorPessoa(m.$('[data-pessoa]'), escolher); atualizar(); };
      atualizar();
      m.$('[data-enviar]').focus();
    };
    seletorPessoa(m.$('[data-pessoa]'), escolher);
    m.$$('[data-a]').forEach((b) => b.addEventListener('click', () => {
      acao = b.dataset.a;
      m.$$('[data-a]').forEach((x) => x.classList.toggle('on', x === b));
      atualizar();
    }));
    m.$('[data-obs]').addEventListener('input', atualizar);

    m.$('[data-enviar]').onclick = async () => {
      const obs = m.$('[data-obs]').value.trim();
      const texto = textoChamado(tipo, acao, pessoa, obs);
      let copiou = false;
      try { await navigator.clipboard.writeText(texto); copiou = true; } catch (e) { /* fallback abaixo */ }
      const janela = window.open(C.LINKS[tipo], '_blank');
      if (janela) { try { janela.opener = null; } catch (e) { /* */ } }
      const { data, error } = await sb.from('chamados').insert({
        tipo, acao, matricula: pessoa.matricula, nome: pessoa.nome, descricao: texto,
        aberto_por: me.matricula, aberto_por_nome: me.nome,
      }).select().single();
      m.close();
      if (error) toast('Chamado não registrado', error.message, 'err');
      if (!janela) toast('Pop-up bloqueado', 'Permita pop-ups deste site para abrir o ServiceNow.', 'err', 7000);
      posAbertura(data, texto, copiou, tipo);
      carregarChamados();
    };
  }

  function posAbertura(reg, texto, copiou, tipo) {
    const m = modal({
      titulo: `${copiou ? 'Texto copiado' : 'Copie o texto'} · cole no ServiceNow`,
      corpo: `<div class="form-stack">
        <p style="margin:0" class="muted">${copiou ? 'O texto já está na área de transferência. No ServiceNow, clique na descrição e use <b>Ctrl+V</b>.' : 'Selecione e copie o texto abaixo.'}</p>
        <div class="preview-text">${esc(texto)}</div>
        <div class="field"><label>Número do chamado (opcional)</label><input class="input mono" data-num placeholder="Ex.: RITM0123456"></div>
      </div>`,
      rodape: `<a class="btn btn-ghost" href="${esc(C.LINKS[tipo])}" target="_blank" rel="noopener">${icon('ext')}Abrir de novo</a>
        <button class="btn btn-ghost" data-copiar>${icon('copy')}Copiar</button>
        <button class="btn btn-primary" data-salvar>Concluir</button>`,
    });
    m.$('[data-copiar]').onclick = async () => { try { await navigator.clipboard.writeText(texto); toast('Copiado!'); } catch (e) { toast('Não foi possível copiar', '', 'err'); } };
    m.$('[data-salvar]').onclick = async () => {
      const n = m.$('[data-num]').value.trim().toUpperCase();
      if (n && reg) await sb.from('chamados').update({ numero_servicenow: n }).eq('id', reg.id);
      m.close();
      toast('Chamado registrado', `${reg?.nome || ''}${n ? ' · ' + n : ''}`);
      carregarChamados();
    };
  }

  let chFiltro = 'ABERTO';
  $$('#ch-filtro button').forEach((b) => b.addEventListener('click', () => {
    chFiltro = b.dataset.f;
    $$('#ch-filtro button').forEach((x) => x.classList.toggle('on', x === b));
    carregarChamados();
  }));
  async function carregarChamados() {
    let q = sb.from('chamados').select('*').order('criado_em', { ascending: false }).limit(100);
    if (chFiltro) q = q.eq('status', chFiltro);
    const { data, error } = await q;
    const t = $('#ch-tabela');
    if (error) { t.innerHTML = `<tr><td class="empty">${esc(error.message)}</td></tr>`; return; }
    if (!data.length) { t.innerHTML = `<tr><td class="empty">${icon('ticket')}<div>Nenhum chamado ${chFiltro === 'ABERTO' ? 'aberto' : chFiltro === 'RESOLVIDO' ? 'resolvido' : ''} por aqui.</div></td></tr>`; return; }
    t.innerHTML = `<thead><tr><th>Quando</th><th>Sistema</th><th>Colaborador</th><th class="hide-sm">Aberto por</th><th>Nº ServiceNow</th><th></th></tr></thead><tbody>` +
      data.map((c) => `<tr data-id="${c.id}">
        <td><b>${fmtData(c.criado_em)}</b> <span class="muted">${fmtHora(c.criado_em)}</span></td>
        <td><span class="chip nodot ${c.tipo === 'TEAMS' ? 'pr-CD' : 'pr-ALUGADO'}">${c.tipo === 'TEAMS' ? 'Teams' : 'WMS'}</span><div class="muted" style="font-size:.8rem;margin-top:3px">${esc(c.acao)}</div></td>
        <td><b>${esc(c.nome || '')}</b><div class="muted mono" style="font-size:.8rem">${esc(c.matricula || '')}</div></td>
        <td class="hide-sm">${esc(primeiroNome(c.aberto_por_nome || ''))}</td>
        <td><input class="input mono" style="min-height:34px;padding:.35rem .6rem;max-width:160px" data-num value="${esc(c.numero_servicenow || '')}" placeholder="RITM…"></td>
        <td style="text-align:right;white-space:nowrap">
          <button class="btn btn-ghost btn-sm" data-copy title="Copiar texto">${icon('copy')}</button>
          ${c.status === 'ABERTO' ? `<button class="btn btn-primary btn-sm" data-ok>${icon('check')}Resolvido</button>` : `<span class="chip st-DISPONIVEL">Resolvido</span>`}
        </td></tr>`).join('') + '</tbody>';
    $$('tr[data-id]', t).forEach((tr) => {
      const c = data.find((x) => String(x.id) === tr.dataset.id);
      $('[data-num]', tr).addEventListener('change', async (e) => {
        await sb.from('chamados').update({ numero_servicenow: e.target.value.trim().toUpperCase() || null }).eq('id', c.id);
        toast('Número salvo');
      });
      $('[data-copy]', tr).onclick = async () => { try { await navigator.clipboard.writeText(c.descricao || ''); toast('Texto copiado'); } catch (e) { /* */ } };
      const ok = $('[data-ok]', tr);
      if (ok) ok.onclick = async () => {
        await sb.from('chamados').update({ status: 'RESOLVIDO', resolvido_em: new Date().toISOString() }).eq('id', c.id);
        toast('Chamado resolvido', c.nome);
        carregarChamados();
      };
    });
  }

  /* =========================================================
     2. COLETORES
     ========================================================= */
  const atrasado = (c) => CF.estaAtrasado(c);
  const ehMeu = (c) => c.supervisor_matricula === me.matricula || (!!me.equipe && c.equipe === me.equipe);
  const STATUS_TXT = { DISPONIVEL: 'Disponível', EM_USO: 'Em uso', MANUTENCAO: 'Manutenção', INATIVO: 'Inativo' };

  function renderKpis() {
    const base = S.meus === 'meus' ? S.coletores.filter(ehMeu) : S.coletores;
    const k = [
      ['', 'Total', base.length, 'var(--rd-900)'],
      ['DISPONIVEL', 'Disponíveis', base.filter((c) => c.status === 'DISPONIVEL').length, 'var(--ok)'],
      ['EM_USO', 'Em uso', base.filter((c) => c.status === 'EM_USO').length, 'var(--uso)'],
      ['MANUTENCAO', 'Manutenção', base.filter((c) => c.status === 'MANUTENCAO').length, 'var(--manut)'],
      ['ALUGADO', 'Alugados', base.filter((c) => c.propriedade === 'ALUGADO').length, 'var(--alug)'],
      ['ATRASADO', 'Não devolvidos', base.filter(atrasado).length, 'var(--danger)'],
    ];
    $('#kpis').innerHTML = k.map(([f, l, n, cor]) => `<button class="kpi ${S.filtroKpi === f ? 'on' : ''} ${f === 'ATRASADO' && n ? 'alert' : ''}" data-k="${f}">
      <span><i style="background:${cor}"></i>${l}</span><b>${n}</b></button>`).join('');
    $$('#kpis .kpi').forEach((b) => b.onclick = () => { S.filtroKpi = S.filtroKpi === b.dataset.k ? '' : b.dataset.k; renderColetores(); });
    const emUso = S.coletores.filter((c) => c.status === 'EM_USO').length;
    $('#nav-uso').textContent = emUso ? `${emUso} em uso` : '';
  }

  function renderColetores() {
    renderKpis();
    renderBannerAtraso();
    const q = $('#col-busca').value.trim().toLowerCase(), eq = $('#col-equipe').value, pr = $('#col-prop').value;
    const lista = S.coletores.filter((c) => {
      if (S.meus === 'meus' && !ehMeu(c)) return false;
      if (eq && c.equipe !== eq) return false;
      if (pr && c.propriedade !== pr) return false;
      if (S.filtroKpi === 'ALUGADO' && c.propriedade !== 'ALUGADO') return false;
      if (S.filtroKpi === 'ATRASADO' && !atrasado(c)) return false;
      if (['DISPONIVEL', 'EM_USO', 'MANUTENCAO'].includes(S.filtroKpi) && c.status !== S.filtroKpi) return false;
      if (q) {
        const alvo = [c.codigo, String(c.numero), c.modelo, c.serie, c.portador_nome, c.portador_matricula, c.locadora, c.equipe].join(' ').toLowerCase();
        if (!alvo.includes(q)) return false;
      }
      return true;
    });
    const g = $('#col-grid');
    if (!S.coletores.length) {
      g.innerHTML = `<div class="card empty" style="grid-column:1/-1">${icon('scanner')}<h3 style="margin:6px 0">Nenhum coletor cadastrado</h3><p>Cadastre um a um ou vários de uma vez com “Em lote”.</p><button class="btn btn-primary" onclick="document.getElementById('btn-lote').click()">${icon('plus')}Cadastrar em lote</button></div>`;
      return;
    }
    if (!lista.length) { g.innerHTML = `<div class="card empty" style="grid-column:1/-1">Nenhum coletor com esses filtros.</div>`; return; }
    g.innerHTML = lista.map((c) => {
      const sup = S.colabs.get(c.supervisor_matricula);
      const late = atrasado(c);
      const holder = c.status === 'EM_USO'
        ? `<div class="col-holder"><b>${esc(c.portador_nome || '')}</b>
            <div class="meta">Mat. ${esc(c.portador_matricula || '')} · ${esc(c.turno_retirada || '')} · desde ${fmtHora(c.retirado_em)}</div>
            <div class="meta ${late ? 'late' : ''}" data-tempo="${c.retirado_em}">${late ? `Não devolvido · turno acabou ${fmtHora(CF.fimTurno(c.retirado_em, c.turno_retirada))}` : 'Com a pessoa há ' + fmtDuracao(Date.now() - new Date(c.retirado_em))}</div></div>`
        : `<div class="col-holder free">${c.status === 'DISPONIVEL' ? 'No armário · pronto para uso' : esc(c.observacao || STATUS_TXT[c.status])}</div>`;
      return `<article class="col-card st-card-${c.status} ${late ? 'atrasado' : ''}" data-id="${c.id}">
        <div class="col-top">
          <div class="col-qr" data-zoom title="Ampliar QR e código de barras">${CF.qrSvg(c.codigo, 0)}</div>
          <div style="min-width:0;flex:1">
            <div class="col-num">${esc(c.codigo)}</div>
            <div class="col-model">${esc([c.modelo, c.serie && 'S/N ' + c.serie].filter(Boolean).join(' · ') || 'Modelo não informado')}</div>
            <div class="col-chips"><span class="chip st-${c.status}">${STATUS_TXT[c.status]}</span>
              <span class="chip nodot pr-${c.propriedade}">${c.propriedade === 'CD' ? 'Do CD' : 'Alugado' + (c.locadora ? ' · ' + esc(c.locadora) : '')}</span></div>
          </div>
          <button class="menu-btn" data-menu aria-label="Ações">${icon('dots')}</button>
        </div>
        ${holder}
        <div class="col-foot">${icon('users')}<span>${esc(c.equipe || 'Sem equipe')}${sup ? ' · ' + esc(primeiroNome(sup.nome)) : ''}</span>
          <span class="spacer"></span>
          ${c.status === 'EM_USO' ? `<button class="btn btn-ghost btn-sm" data-dev>${icon('down')}Devolver</button>`
            : c.status === 'DISPONIVEL' ? `<button class="btn btn-ghost btn-sm" data-ret>${icon('up')}Entregar</button>` : ''}
        </div>
      </article>`;
    }).join('');
    $$('.col-card', g).forEach((el) => {
      const c = S.coletores.find((x) => x.id === el.dataset.id);
      $('[data-menu]', el).onclick = (e) => menuColetor(c, e.currentTarget);
      $('[data-zoom]', el).onclick = () => zoomQR(c);
      const r = $('[data-ret]', el), d = $('[data-dev]', el);
      if (r) r.onclick = () => movManual(c, 'RETIRADA');
      if (d) d.onclick = () => movManual(c, 'DEVOLUCAO');
    });
  }
  setInterval(() => { if (S.view === 'coletores') renderColetores(); }, 60000);

  $('#col-busca').addEventListener('input', debounce(renderColetores, 120));
  $('#col-equipe').addEventListener('change', renderColetores);
  $('#col-prop').addEventListener('change', renderColetores);
  $$('#col-meus button').forEach((b) => b.addEventListener('click', () => {
    S.meus = b.dataset.m;
    $$('#col-meus button').forEach((x) => x.classList.toggle('on', x === b));
    renderColetores();
  }));
  $('#btn-novo').onclick = () => formColetor();
  $('#btn-lote').onclick = formLote;

  function menuColetor(c, anchor) {
    $$('.ctx-menu').forEach((x) => x.remove());
    const menu = document.createElement('div');
    menu.className = 'ctx-menu card';
    menu.style.cssText = 'position:fixed;z-index:90;padding:6px;min-width:210px;box-shadow:var(--shadow-3)';
    const itens = [
      ['edit', 'Editar', () => formColetor(c)],
      ['history', 'Histórico do coletor', () => historicoColetor(c)],
      c.status === 'EM_USO' ? ['down', 'Registrar devolução', () => movManual(c, 'DEVOLUCAO')] : null,
      c.status === 'DISPONIVEL' ? ['up', 'Registrar retirada', () => movManual(c, 'RETIRADA')] : null,
      c.status !== 'EM_USO' ? [c.status === 'MANUTENCAO' ? 'check' : 'wrench', c.status === 'MANUTENCAO' ? 'Voltar a disponível' : 'Enviar p/ manutenção', () => trocarStatus(c, c.status === 'MANUTENCAO' ? 'DISPONIVEL' : 'MANUTENCAO')] : null,
      ['alert', 'Registrar ocorrência', () => formOcorrencia(c)],
      ['print', 'Imprimir etiqueta', () => window.open(`etiquetas.html?n=${c.numero}`, '_blank')],
      ['trash', 'Excluir', () => excluirColetor(c), true],
    ].filter(Boolean);
    menu.innerHTML = itens.map(([ic, l, , perigo], i) => `<button class="nav-item" data-i2="${i}" style="color:${perigo ? 'var(--danger)' : 'var(--text)'};padding:9px 10px;font-size:.88rem">${icon(ic)}${l}</button>`).join('');
    document.body.appendChild(menu);
    const r = anchor.getBoundingClientRect();
    menu.style.top = Math.min(r.bottom + 4, innerHeight - menu.offsetHeight - 8) + 'px';
    menu.style.left = Math.max(8, Math.min(r.right - menu.offsetWidth, innerWidth - menu.offsetWidth - 8)) + 'px';
    $$('[data-i2]', menu).forEach((b) => b.onclick = () => { menu.remove(); itens[+b.dataset.i2][2](); });
    setTimeout(() => document.addEventListener('click', function f(e) { if (!menu.contains(e.target)) { menu.remove(); document.removeEventListener('click', f); } }), 0);
  }

  function zoomQR(c) {
    modal({
      titulo: esc(c.codigo),
      corpo: `<div style="display:grid;place-items:center;gap:12px"><div style="width:min(260px,70vw)">${CF.qrSvg(c.codigo, 1)}</div>
        <div style="width:min(340px,80vw)">${CF.barrasSvg(c.codigo, { altura: 60 }).replace('class="barcode"', 'class="barcode" style="width:100%;height:80px;display:block"')}</div>
        <div class="col-num" style="font-size:2.4rem">${esc(c.codigo)}</div><p class="muted" style="margin:0">Aponte o leitor para o QR ou para o código de barras.</p></div>`,
    });
  }

  function opcoesEquipe(sel) {
    return `<option value="">— sem equipe —</option>` + equipesLista().map((e) => `<option ${e === sel ? 'selected' : ''}>${esc(e)}</option>`).join('');
  }
  function opcoesSupervisor(sel) {
    return `<option value="">— nenhum —</option>` + gestores().map((g) => `<option value="${esc(g.matricula)}" ${g.matricula === sel ? 'selected' : ''}>${esc(g.nome)} · ${esc(g.equipe || '')}</option>`).join('');
  }
  const proxNumero = () => (S.coletores.reduce((m, c) => Math.max(m, c.numero), 0) + 1);

  function camposColetor(c = {}) {
    const prop = c.propriedade || 'CD';
    return `
      <div class="grid-2">
        <div class="field"><label>Modelo</label><input class="input" name="modelo" value="${esc(c.modelo || '')}" placeholder="Ex.: Zebra MC3300" list="dl-modelos"></div>
        <div class="field"><label>Propriedade</label><div class="seg" data-prop>
          <button type="button" data-v="CD" class="${prop === 'CD' ? 'on' : ''}">Do CD</button>
          <button type="button" data-v="ALUGADO" class="${prop === 'ALUGADO' ? 'on' : ''}">Alugado</button></div></div>
      </div>
      <div class="field ${prop === 'ALUGADO' ? '' : 'hidden'}" data-loc><label>Locadora</label><input class="input" name="locadora" value="${esc(c.locadora || '')}" placeholder="Nome da empresa locadora"></div>
      <div class="grid-2">
        <div class="field"><label>Equipe</label><select class="input" name="equipe">${opcoesEquipe(c.equipe ?? me.equipe)}</select></div>
        <div class="field"><label>Supervisor responsável</label><select class="input" name="supervisor_matricula">${opcoesSupervisor(c.supervisor_matricula ?? me.matricula)}</select></div>
      </div>
      <datalist id="dl-modelos">${[...new Set(S.coletores.map((x) => x.modelo).filter(Boolean))].map((m) => `<option>${esc(m)}</option>`).join('')}</datalist>`;
  }
  function lerCampos(m) {
    const v = (n) => (m.$(`[name="${n}"]`)?.value || '').trim() || null;
    const propriedade = m.$('[data-prop] .on').dataset.v;
    return { modelo: v('modelo'), propriedade, locadora: propriedade === 'ALUGADO' ? v('locadora') : null, equipe: v('equipe'), supervisor_matricula: v('supervisor_matricula') };
  }
  function ligarProp(m) {
    m.$$('[data-prop] button').forEach((b) => b.addEventListener('click', () => {
      m.$$('[data-prop] button').forEach((x) => x.classList.toggle('on', x === b));
      m.$('[data-loc]').classList.toggle('hidden', b.dataset.v !== 'ALUGADO');
    }));
  }

  function formColetor(c = null) {
    const novo = !c;
    const m = modal({
      titulo: novo ? 'Novo coletor' : `Editar ${esc(c.codigo)}`,
      corpo: `<div class="form-stack">
        <div class="grid-2">
          <div class="field"><label>Número</label><input class="input mono" name="numero" type="number" min="1" value="${novo ? proxNumero() : c.numero}"><small class="muted" data-cod></small></div>
          <div class="field"><label>Nº de série</label><input class="input mono" name="serie" value="${esc(c?.serie || '')}" placeholder="Opcional"></div>
        </div>
        ${camposColetor(c || {})}
        <div class="grid-2">
          <div class="field"><label>Situação</label>
            ${c?.status === 'EM_USO' ? `<div class="input" style="background:var(--surface-2)">Em uso com ${esc(primeiroNome(c.portador_nome))}</div>`
              : `<select class="input" name="status">${['DISPONIVEL', 'MANUTENCAO', 'INATIVO'].map((s) => `<option value="${s}" ${c?.status === s ? 'selected' : ''}>${STATUS_TXT[s]}</option>`).join('')}</select>`}
          </div>
          <div class="field"><label>Observação</label><input class="input" name="observacao" value="${esc(c?.observacao || '')}" placeholder="Ex.: tela trincada"></div>
        </div>
      </div>`,
      rodape: `<button class="btn btn-ghost" data-close>Cancelar</button><button class="btn btn-primary" data-salvar>${novo ? 'Cadastrar' : 'Salvar'}</button>`,
    });
    ligarProp(m);
    const num = m.$('[name="numero"]');
    const mostraCod = () => { m.$('[data-cod]').textContent = num.value ? 'Código: ' + codigoColetor(num.value) : ''; };
    num.addEventListener('input', mostraCod); mostraCod();
    m.$('[data-salvar]').onclick = async () => {
      const payload = { ...lerCampos(m), numero: +num.value, serie: m.$('[name="serie"]').value.trim() || null, observacao: m.$('[name="observacao"]').value.trim() || null };
      const st = m.$('[name="status"]'); if (st) payload.status = st.value;
      if (!(payload.numero > 0)) { toast('Informe o número', '', 'err'); return; }
      const r = novo ? await sb.from('coletores').insert(payload) : await sb.from('coletores').update(payload).eq('id', c.id);
      if (r.error) { toast('Não foi possível salvar', /duplicate|unique/i.test(r.error.message) ? `Já existe o ${codigoColetor(payload.numero)}.` : r.error.message, 'err'); return; }
      m.close();
      toast(novo ? 'Coletor cadastrado' : 'Coletor atualizado', codigoColetor(payload.numero));
      carregarColetores();
    };
  }

  function formLote() {
    const ini = proxNumero();
    const m = modal({
      titulo: 'Cadastrar coletores em lote',
      corpo: `<div class="form-stack">
        <div class="grid-2">
          <div class="field"><label>Do número</label><input class="input mono" name="de" type="number" min="1" value="${ini}"></div>
          <div class="field"><label>Até o número</label><input class="input mono" name="ate" type="number" min="1" value="${ini + 9}"></div>
        </div>
        <p class="muted" style="margin:0" data-resumo></p>
        ${camposColetor({})}
      </div>`,
      rodape: `<button class="btn btn-ghost" data-close>Cancelar</button><button class="btn btn-primary" data-salvar>Cadastrar</button>`,
    });
    ligarProp(m);
    const resumo = () => {
      const a = +m.$('[name="de"]').value, b = +m.$('[name="ate"]').value;
      m.$('[data-resumo]').textContent = b >= a && a > 0 ? `Serão criados ${b - a + 1} coletores: ${codigoColetor(a)} até ${codigoColetor(b)}. Números já existentes são ignorados.` : 'Intervalo inválido.';
    };
    m.$$('[name="de"],[name="ate"]').forEach((i) => i.addEventListener('input', resumo)); resumo();
    m.$('[data-salvar]').onclick = async () => {
      const a = +m.$('[name="de"]').value, b = +m.$('[name="ate"]').value;
      if (!(b >= a && a > 0) || b - a > 500) { toast('Intervalo inválido', 'Máximo de 500 por vez.', 'err'); return; }
      const existentes = new Set(S.coletores.map((c) => c.numero));
      const base = lerCampos(m);
      const rows = [];
      for (let n = a; n <= b; n++) if (!existentes.has(n)) rows.push({ ...base, numero: n });
      if (!rows.length) { toast('Nada a criar', 'Todos esses números já existem.', 'err'); return; }
      const { error } = await sb.from('coletores').insert(rows);
      if (error) { toast('Erro no cadastro', error.message, 'err'); return; }
      m.close();
      toast(`${rows.length} coletores cadastrados`, `${codigoColetor(a)} a ${codigoColetor(b)}`);
      await carregarColetores();
      if (await confirmar('Imprimir etiquetas?', `Deseja imprimir as etiquetas QR de ${codigoColetor(a)} a ${codigoColetor(b)}?`, 'Imprimir')) {
        window.open(`etiquetas.html?de=${a}&ate=${b}`, '_blank');
      }
    };
  }

  async function trocarStatus(c, status) {
    const { error } = await sb.from('coletores').update({ status }).eq('id', c.id);
    if (error) return toast('Erro', error.message, 'err');
    toast(`${c.codigo} · ${STATUS_TXT[status]}`);
    carregarColetores();
  }

  async function excluirColetor(c) {
    const aviso = c.status === 'EM_USO' ? `<br><br><b style="color:var(--danger)">Atenção: está em uso com ${esc(c.portador_nome)}.</b>` : '';
    if (!await confirmar(`Excluir ${c.codigo}?`, `O cadastro será removido. O histórico de movimentações é mantido.${aviso}`, 'Excluir', true)) return;
    const { error } = await sb.from('coletores').delete().eq('id', c.id);
    if (error) return toast('Erro ao excluir', error.message, 'err');
    toast(`${c.codigo} excluído`);
    carregarColetores();
  }

  function movManual(c, tipo) {
    let pessoa = null;
    if (tipo === 'DEVOLUCAO') pessoa = S.colabs.get(c.portador_matricula) || { matricula: c.portador_matricula, nome: c.portador_nome };
    const m = modal({
      titulo: `${tipo === 'RETIRADA' ? 'Entregar' : 'Receber'} ${esc(c.codigo)}`,
      corpo: `<div class="form-stack">
        ${tipo === 'DEVOLUCAO'
          ? `<div class="selected-person"><div class="avatar">${esc(iniciais(pessoa.nome))}</div><div><b>${esc(pessoa.nome)}</b><span>Devolvendo · retirado ${relTempo(c.retirado_em)}</span></div></div>`
          : '<div data-pessoa></div>'}
        <div class="field"><label>Observação (opcional)</label><input class="input" data-obs placeholder="Ex.: registrado manualmente pelo supervisor"></div>
      </div>`,
      rodape: `<button class="btn btn-ghost" data-close>Cancelar</button><button class="btn btn-primary" data-ok ${tipo === 'RETIRADA' ? 'disabled' : ''}>Confirmar ${tipo === 'RETIRADA' ? 'retirada' : 'devolução'}</button>`,
    });
    if (tipo === 'RETIRADA') {
      const escolher = (p) => {
        pessoa = p;
        m.$('[data-pessoa]').innerHTML = `<div class="selected-person"><div class="avatar">${esc(iniciais(p.nome))}</div><div><b>${esc(p.nome)}</b><span>Mat. ${esc(p.matricula)}</span></div></div>`;
        m.$('[data-ok]').disabled = false;
      };
      seletorPessoa(m.$('[data-pessoa]'), escolher);
    }
    m.$('[data-ok]').onclick = async () => {
      const { data, error } = await sb.rpc('registrar_bipagem', {
        p_matricula: pessoa.matricula, p_coletor: c.codigo, p_acao: tipo, p_transferir: false, p_origem: 'MANUAL',
        p_obs: m.$('[data-obs]').value.trim() || 'Registro manual pelo supervisor',
      });
      if (error || !data?.ok) { toast('Não registrado', error?.message || data?.mensagem, 'err'); return; }
      m.close();
      carregarColetores();
    };
  }

  async function historicoColetor(c) {
    const m = modal({ titulo: `Histórico · ${esc(c.codigo)}`, corpo: '<div class="empty">Carregando…</div>', largo: true });
    const [{ data }, { data: ocs }] = await Promise.all([
      sb.from('movimentos').select('*').eq('coletor_id', c.id).order('criado_em', { ascending: false }).limit(200),
      sb.from('ocorrencias').select('*').eq('coletor_id', c.id).order('criado_em', { ascending: false }).limit(50),
    ]);
    const blocoOc = ocs?.length ? `<h4 style="margin:0 0 8px">Ocorrências</h4><div class="stat-list" style="margin-bottom:18px">${ocs.map((o) => `
      <div class="oc-row"><span class="chip ${o.status === 'ABERTA' ? 'st-MANUTENCAO' : 'st-DISPONIVEL'}">${o.status === 'ABERTA' ? 'Aberta' : 'Resolvida'}</span>
      <div><b>${esc(OC_TXT[o.tipo] || o.tipo)}</b>${o.descricao ? ' · ' + esc(o.descricao) : ''}<div class="muted" style="font-size:.8rem">${fmtDataHora(o.criado_em)}${o.nome ? ' · ' + esc(primeiroNome(o.nome)) : ''}${o.resolvido_em ? ' · resolvida ' + fmtDataHora(o.resolvido_em) : ''}</div></div></div>`).join('')}</div>` : '';
    m.$('.modal-body').innerHTML = blocoOc + (data?.length ? `<h4 style="margin:0 0 8px">Movimentações</h4><div class="table-wrap"><table class="table"><thead><tr><th>Quando</th><th>Tipo</th><th>Colaborador</th><th>Turno</th><th class="hide-sm">Obs.</th></tr></thead><tbody>
      ${data.map((r) => `<tr><td>${fmtDataHora(r.criado_em)}</td><td><span class="chip tp-${r.tipo}">${r.tipo === 'RETIRADA' ? 'Retirada' : 'Devolução'}</span></td>
      <td><b>${esc(r.nome)}</b><div class="muted mono" style="font-size:.8rem">${esc(r.matricula)}</div></td><td>${esc(r.turno || '')}</td><td class="hide-sm muted">${esc(r.observacao || (r.origem === 'MANUAL' ? 'Manual' : ''))}</td></tr>`).join('')}
      </tbody></table></div>` : '<div class="empty">Ainda sem movimentações.</div>');
  }

  const OC_TXT = { BATERIA: 'Bateria', TELA: 'Tela', NAO_LIGA: 'Não liga', LEITOR: 'Leitor/gatilho', TECLADO: 'Teclado', OUTRO: 'Outro' };
  function formOcorrencia(c) {
    let tipo = 'BATERIA';
    const emUso = c.status === 'EM_USO';
    const m = modal({
      titulo: `Ocorrência · ${esc(c.codigo)}`,
      corpo: `<div class="form-stack">
        <div class="field"><label>Problema</label><div class="seg" data-tipos>${Object.entries(OC_TXT).map(([k, v], i) => `<button type="button" data-t="${k}" class="${i ? '' : 'on'}">${v}</button>`).join('')}</div></div>
        <div class="field"><label>Descrição (opcional)</label><input class="input" data-desc placeholder="Ex.: descarrega em 2 horas"></div>
        <label style="display:flex;gap:8px;align-items:center;font-weight:700"><input type="checkbox" data-manut ${emUso ? 'disabled' : 'checked'}> Enviar para manutenção (bloqueia retirada)</label>
        ${emUso ? `<p class="muted" style="margin:0;font-size:.85rem">O coletor está em uso com ${esc(primeiroNome(c.portador_nome))}. A ocorrência fica registrada; envie para manutenção depois da devolução.</p>` : ''}
      </div>`,
      rodape: `<button class="btn btn-ghost" data-close>Cancelar</button><button class="btn btn-primary" data-ok>Registrar</button>`,
    });
    m.$$('[data-t]').forEach((b) => b.onclick = () => { tipo = b.dataset.t; m.$$('[data-t]').forEach((x) => x.classList.toggle('on', x === b)); });
    m.$('[data-ok]').onclick = async () => {
      const { data, error } = await sb.rpc('registrar_ocorrencia', {
        p_coletor: c.codigo, p_tipo: tipo, p_matricula: c.portador_matricula || null,
        p_descricao: m.$('[data-desc]').value.trim() || null, p_origem: 'MANUAL', p_manutencao: m.$('[data-manut]').checked,
      });
      if (error || !data?.ok) return toast('Não registrado', error?.message || data?.mensagem, 'err');
      m.close(); toast('Ocorrência registrada', `${c.codigo} · ${OC_TXT[tipo]}`);
      carregarColetores();
    };
  }

  /* =========================================================
     3. HISTÓRICO
     ========================================================= */
  let hPeriodo = 'hoje', hDados = [];
  const OFFSET = '-04:00'; // Manaus (sem horário de verão)
  const ymdLocal = (d) => d.toLocaleDateString('en-CA', { timeZone: C.FUSO });
  function intervalo() {
    const hoje = ymdLocal(new Date());
    const d0 = new Date(`${hoje}T00:00:00${OFFSET}`);
    if (hPeriodo === 'hoje') return [d0, null];
    if (hPeriodo === 'semana') {
      const dow = (new Date(`${hoje}T12:00:00${OFFSET}`).getUTCDay() + 6) % 7; // segunda = 0
      return [new Date(d0.getTime() - dow * 864e5), null];
    }
    if (hPeriodo === 'mes') return [new Date(`${hoje.slice(0, 8)}01T00:00:00${OFFSET}`), null];
    const de = $('#h-de').value || hoje, ate = $('#h-ate').value || hoje;
    return [new Date(`${de}T00:00:00${OFFSET}`), new Date(new Date(`${ate}T00:00:00${OFFSET}`).getTime() + 864e5)];
  }
  $$('#h-periodo button').forEach((b) => b.addEventListener('click', () => {
    hPeriodo = b.dataset.p;
    $$('#h-periodo button').forEach((x) => x.classList.toggle('on', x === b));
    $('#h-de').classList.toggle('hidden', hPeriodo !== 'custom');
    $('#h-ate').classList.toggle('hidden', hPeriodo !== 'custom');
    if (hPeriodo === 'custom' && !$('#h-de').value) { const h = ymdLocal(new Date()); $('#h-de').value = h; $('#h-ate').value = h; }
    carregarHistorico();
  }));
  ['#h-de', '#h-ate'].forEach((s) => $(s).addEventListener('change', carregarHistorico));
  $('#h-busca').addEventListener('input', debounce(renderHistorico, 150));
  ['#h-tipo', '#h-equipe'].forEach((s) => $(s).addEventListener('change', renderHistorico));
  $('#h-csv').onclick = () => {
    const l = filtrarHist();
    baixarCSV(`movimentacoes_${hPeriodo}_${ymdLocal(new Date())}.csv`, [
      ['Data', 'Hora', 'Tipo', 'Coletor', 'Matrícula', 'Nome', 'Equipe', 'Turno', 'Origem', 'Observação'],
      ...l.map((r) => [fmtData(r.criado_em), fmtHora(r.criado_em), r.tipo, r.coletor_codigo, r.matricula, r.nome, r.equipe, r.turno, r.origem, r.observacao]),
    ]);
  };

  async function carregarHistorico() {
    const [de, ate] = intervalo();
    $('#h-tabela').innerHTML = `<tr><td class="empty">Carregando…</td></tr>`;
    try {
      hDados = await buscarTudo(() => {
        let q = sb.from('movimentos').select('*').gte('criado_em', de.toISOString()).order('criado_em', { ascending: false });
        if (ate) q = q.lt('criado_em', ate.toISOString());
        return q;
      });
    } catch (e) { $('#h-tabela').innerHTML = `<tr><td class="empty">${esc(e.message)}</td></tr>`; return; }
    renderHistorico();
  }
  function filtrarHist() {
    const q = $('#h-busca').value.trim().toLowerCase(), t = $('#h-tipo').value, eq = $('#h-equipe').value;
    return hDados.filter((r) => (!t || r.tipo === t) && (!eq || r.equipe === eq) &&
      (!q || [r.nome, r.matricula, r.coletor_codigo].join(' ').toLowerCase().includes(q)));
  }
  function renderHistorico() {
    const l = filtrarHist();
    const t = $('#h-tabela');
    t.innerHTML = l.length ? `<thead><tr><th>Quando</th><th>Movimento</th><th>Coletor</th><th>Colaborador</th><th class="hide-sm">Equipe</th><th>Turno</th><th class="hide-sm">Obs.</th></tr></thead><tbody>` +
      l.slice(0, 1500).map((r) => `<tr><td>${hPeriodo === 'hoje' ? '' : `<b>${fmtData(r.criado_em)}</b> `}${fmtHora(r.criado_em)}</td>
        <td><span class="chip tp-${r.tipo}">${r.tipo === 'RETIRADA' ? 'Retirada' : 'Devolução'}</span></td>
        <td class="mono"><b>${esc(r.coletor_codigo)}</b></td>
        <td><b>${esc(r.nome)}</b><div class="muted mono" style="font-size:.78rem">${esc(r.matricula)}</div></td>
        <td class="hide-sm">${esc(r.equipe || '')}</td><td>${esc(r.turno || '')}</td>
        <td class="hide-sm muted" style="font-size:.82rem">${esc(r.observacao || (r.origem === 'MANUAL' ? 'Manual' : ''))}</td></tr>`).join('') + '</tbody>'
      : `<tr><td class="empty">${icon('history')}<div>Nenhuma movimentação no período.</div></td></tr>`;

    // resumo
    const ret = l.filter((r) => r.tipo === 'RETIRADA').length, dev = l.length - ret;
    const pessoas = new Set(l.map((r) => r.matricula)).size, cols = new Set(l.map((r) => r.coletor_codigo)).size;
    // série temporal
    const porHora = hPeriodo === 'hoje';
    const buckets = new Map();
    const chave = (d) => porHora ? new Date(d).toLocaleTimeString('en-GB', { hour: '2-digit', hour12: false, timeZone: C.FUSO }) : ymdLocal(new Date(d));
    if (porHora) for (let h = 0; h < 24; h++) buckets.set(String(h).padStart(2, '0'), [0, 0]);
    else {
      const [de, ate] = intervalo();
      const fim = ate || new Date();
      for (let d = new Date(de); d < fim; d = new Date(d.getTime() + 864e5)) buckets.set(ymdLocal(d), [0, 0]);
    }
    l.forEach((r) => { const k = chave(r.criado_em); if (!buckets.has(k)) buckets.set(k, [0, 0]); buckets.get(k)[r.tipo === 'RETIRADA' ? 0 : 1]++; });
    const vals = [...buckets.entries()].sort();
    const max = Math.max(1, ...vals.map(([, v]) => Math.max(v[0], v[1])));
    const top = Object.entries(l.filter((r) => r.tipo === 'RETIRADA').reduce((a, r) => (a[r.nome] = (a[r.nome] || 0) + 1, a), {})).sort((a, b) => b[1] - a[1]).slice(0, 6);
    const turnos = Object.entries(l.reduce((a, r) => (a[r.turno || '–'] = (a[r.turno || '–'] || 0) + 1, a), {})).sort();
    const pend = S.coletores.filter((c) => c.status === 'EM_USO');
    $('#h-resumo').innerHTML = `
      <div class="kpis" style="grid-template-columns:1fr 1fr;margin:0">
        <div class="kpi"><span><i style="background:var(--uso)"></i>Retiradas</span><b>${ret}</b></div>
        <div class="kpi"><span><i style="background:var(--ok)"></i>Devoluções</span><b>${dev}</b></div>
        <div class="kpi"><span>Pessoas</span><b>${pessoas}</b></div>
        <div class="kpi"><span>Coletores</span><b>${cols}</b></div>
      </div>
      <div class="card card-pad"><b style="font-family:var(--font-display)">${porHora ? 'Por hora' : 'Por dia'}</b>
        <div class="spark" title="Retiradas e devoluções">${vals.map(([k, v]) => `<div title="${k}: ${v[0]} retiradas, ${v[1]} devoluções"><i class="r" style="height:${v[0] / max * 50}%"></i><i class="d" style="height:${v[1] / max * 50}%"></i></div>`).join('')}</div>
        <div class="legend"><span><i style="background:var(--uso)"></i>Retiradas</span><span><i style="background:var(--rd-500)"></i>Devoluções</span>
          <span style="margin-left:auto">${porHora ? '00h → 23h' : vals.length ? fmtData(vals[0][0] + 'T12:00:00' + OFFSET) + ' → ' + fmtData(vals[vals.length - 1][0] + 'T12:00:00' + OFFSET) : ''}</span></div></div>
      <div class="card card-pad"><b style="font-family:var(--font-display)">Por turno</b><div class="stat-list" style="margin-top:10px">
        ${turnos.length ? turnos.map(([t, n]) => `<div class="bar-row"><span>${esc(t)}</span><b>${n}</b><div class="bar"><i style="width:${n / l.length * 100}%"></i></div></div>`).join('') : '<span class="muted">—</span>'}</div></div>
      <div class="card card-pad"><b style="font-family:var(--font-display)">Quem mais retirou</b><div class="stat-list" style="margin-top:10px">
        ${top.length ? top.map(([n, q]) => `<div class="bar-row"><span>${esc(primeiroNome(n))}</span><b>${q}</b><div class="bar"><i style="width:${q / top[0][1] * 100}%"></i></div></div>`).join('') : '<span class="muted">—</span>'}</div></div>
      <div class="card card-pad"><b style="font-family:var(--font-display)">Ainda não devolvidos agora</b><div class="stat-list" style="margin-top:10px;font-size:.86rem">
        ${pend.length ? pend.slice(0, 12).map((c) => `<div style="display:flex;gap:8px"><b class="mono">${esc(c.codigo)}</b><span style="flex:1">${esc(primeiroNome(c.portador_nome))}</span><span class="${atrasado(c) ? 'late' : 'muted'}" style="${atrasado(c) ? 'color:var(--danger);font-weight:800' : ''}">${fmtDuracao(Date.now() - new Date(c.retirado_em))}</span></div>`).join('') : '<span class="muted">Todos devolvidos ✔</span>'}</div></div>`;
  }

  /* =========================================================
     4. EQUIPE
     ========================================================= */
  $('#eq-busca').addEventListener('input', debounce(renderEquipe, 120));
  $('#eq-equipe').addEventListener('change', renderEquipe);
  $('#eq-novo').onclick = () => formColab();
  $('#eq-importar').onclick = importarWorkArea;
  function renderEquipe() {
    const q = $('#eq-busca').value.trim().toLowerCase(), eq = $('#eq-equipe').value, dig = soDigitos(q);
    const l = [...S.colabs.values()].filter((c) => (!eq || c.equipe === eq) && (!q || c.nome.toLowerCase().includes(q) || (dig && c.matricula.includes(dig))));
    const comColetor = new Map(S.coletores.filter((c) => c.status === 'EM_USO').map((c) => [c.portador_matricula, c.codigo]));
    $('#eq-crachas').href = `etiquetas.html?tipo=cracha${eq ? '&equipe=' + encodeURIComponent(eq) : ''}`;
    $('#eq-tabela').innerHTML = `<thead><tr><th>Colaborador</th><th>Matrícula</th><th class="hide-sm">Cargo</th><th>Equipe</th><th>Turno</th><th>Coletor</th><th></th></tr></thead><tbody>` +
      l.map((c) => `<tr data-m="${esc(c.matricula)}" style="${c.ativo ? '' : 'opacity:.5'}">
        <td><div style="display:flex;gap:10px;align-items:center"><div class="avatar" style="width:32px;height:32px;font-size:.72rem;${c.perfil !== 'colaborador' ? '' : 'background:var(--rd-100);color:var(--rd-700)'}">${esc(iniciais(c.nome))}</div>
          <div><b>${esc(c.nome)}</b>${c.perfil !== 'colaborador' ? ` <span class="chip nodot pr-CD" style="font-size:.64rem">${esc(c.perfil)}</span>` : ''}${c.ativo ? '' : ' <span class="chip st-INATIVO">inativo</span>'}</div></div></td>
        <td class="mono">${esc(c.matricula)}</td><td class="hide-sm muted" style="font-size:.84rem">${esc(c.cargo || '')}</td><td>${esc(c.equipe || '')}</td>
        <td><select class="input" data-turno style="min-height:32px;padding:.2rem .5rem;width:auto"><option value="">auto</option>${C.TURNOS.map((t) => `<option ${c.turno === t.id ? 'selected' : ''}>${t.id}</option>`).join('')}</select></td>
        <td>${comColetor.has(c.matricula) ? `<span class="chip st-EM_USO">${esc(comColetor.get(c.matricula))}</span>` : '<span class="muted">—</span>'}</td>
        <td style="text-align:right"><button class="menu-btn" data-edit title="Editar">${icon('edit')}</button></td></tr>`).join('') + '</tbody>';
    $$('#eq-tabela tr[data-m]').forEach((tr) => {
      const c = S.colabs.get(tr.dataset.m);
      $('[data-turno]', tr).onchange = async (e) => {
        const { error } = await sb.from('colaboradores').update({ turno: e.target.value || null }).eq('matricula', c.matricula);
        if (error) return toast('Erro', error.message, 'err');
        c.turno = e.target.value || null; toast('Turno atualizado', c.nome);
      };
      $('[data-edit]', tr).onclick = () => formColab(c);
    });
  }

  function formColab(c = null) {
    const novo = !c;
    const m = modal({
      titulo: novo ? 'Novo colaborador' : 'Editar colaborador',
      corpo: `<div class="form-stack">
        <div class="grid-2"><div class="field"><label>Matrícula</label><input class="input mono" name="matricula" value="${esc(c?.matricula || '')}" ${novo ? '' : 'disabled'} inputmode="numeric"></div>
        <div class="field"><label>Equipe</label><input class="input" name="equipe" value="${esc(c?.equipe || me.equipe || '')}" list="dl-eq"></div></div>
        <div class="field"><label>Nome completo</label><input class="input" name="nome" value="${esc(c?.nome || '')}"></div>
        <div class="field"><label>Cargo</label><input class="input" name="cargo" value="${esc(c?.cargo || '')}"></div>
        ${novo ? '' : `<label style="display:flex;gap:8px;align-items:center;font-weight:700"><input type="checkbox" name="ativo" ${c.ativo ? 'checked' : ''}> Ativo (desmarque para desligados)</label>`}
        <datalist id="dl-eq">${equipesLista().map((e) => `<option>${esc(e)}</option>`).join('')}</datalist>
      </div>`,
      rodape: `<button class="btn btn-ghost" data-close>Cancelar</button><button class="btn btn-primary" data-ok>Salvar</button>`,
    });
    m.$('[data-ok]').onclick = async () => {
      const v = (n) => m.$(`[name="${n}"]`).value.trim();
      const row = { nome: v('nome'), cargo: v('cargo') || null, equipe: v('equipe') || null };
      if (!row.nome) return toast('Informe o nome', '', 'err');
      let r;
      if (novo) {
        const mat = soDigitos(v('matricula'));
        if (!mat) return toast('Informe a matrícula', '', 'err');
        r = await sb.from('colaboradores').insert({ ...row, matricula: mat });
      } else {
        row.ativo = m.$('[name="ativo"]').checked;
        r = await sb.from('colaboradores').update(row).eq('matricula', c.matricula);
      }
      if (r.error) return toast('Erro ao salvar', /duplicate/i.test(r.error.message) ? 'Matrícula já cadastrada.' : r.error.message, 'err');
      m.close(); toast('Colaborador salvo', row.nome);
      await carregarColabs(); renderEquipe();
    };
  }

  function importarWorkArea() {
    const m = modal({
      titulo: 'Importar listagem WorkArea',
      corpo: `<div class="form-stack">
        <p class="muted" style="margin:0">Envie a planilha <b>Listagem_Funcionarios_WorkArea</b> (.xlsx) com as colunas Funcionário, Matrícula, Cargo e Setor. Quem já existe é atualizado; novos são incluídos.</p>
        <input type="file" class="input" accept=".xlsx,.xls,.csv" data-arq>
        <label style="display:flex;gap:8px;align-items:center;font-weight:600"><input type="checkbox" data-inativar> Marcar como inativo quem não estiver na planilha</label>
        <div data-res class="muted"></div>
      </div>`,
      rodape: `<button class="btn btn-ghost" data-close>Fechar</button><button class="btn btn-primary" data-ok disabled>Importar</button>`,
    });
    let linhas = [];
    m.$('[data-arq]').onchange = async (e) => {
      const f = e.target.files[0]; if (!f) return;
      if (!window.XLSX) return toast('Leitor de planilha ainda carregando', 'Tente novamente em instantes.', 'err');
      const wb = XLSX.read(await f.arrayBuffer());
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false });
      const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
      const hi = rows.findIndex((r) => r.some((x) => norm(x) === 'matricula'));
      if (hi < 0) { m.$('[data-res]').textContent = 'Não encontrei a coluna "Matrícula".'; return; }
      const h = rows[hi].map(norm);
      const ix = { nome: h.findIndex((x) => /funcionario|nome/.test(x)), mat: h.indexOf('matricula'), cargo: h.indexOf('cargo'), setor: h.indexOf('setor') };
      linhas = rows.slice(hi + 1).filter((r) => r[ix.mat] && r[ix.nome]).map((r) => {
        const nome = String(r[ix.nome]).trim().split(/\s+/).map((w) => w.length > 2 ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w.toLowerCase()).join(' ');
        const setor = ix.setor >= 0 ? String(r[ix.setor] || '').trim() : '';
        return { matricula: soDigitos(r[ix.mat]), nome, cargo: ix.cargo >= 0 ? String(r[ix.cargo] || '').trim() : null, setor, equipe: CF.equipeDoSetor(setor) || null, ativo: true };
      });
      const novos = linhas.filter((l) => !S.colabs.has(l.matricula)).length;
      m.$('[data-res]').innerHTML = `<b>${linhas.length}</b> colaboradores encontrados · <b>${novos}</b> novos · <b>${linhas.length - novos}</b> para atualizar.`;
      m.$('[data-ok]').disabled = !linhas.length;
    };
    m.$('[data-ok]').onclick = async () => {
      m.$('[data-ok]').disabled = true;
      const { error } = await sb.from('colaboradores').upsert(linhas, { onConflict: 'matricula' });
      if (error) { toast('Erro na importação', error.message, 'err'); m.$('[data-ok]').disabled = false; return; }
      if (m.$('[data-inativar]').checked) {
        const set = new Set(linhas.map((l) => l.matricula));
        const fora = [...S.colabs.values()].filter((c) => c.ativo && !set.has(c.matricula) && c.perfil === 'colaborador').map((c) => c.matricula);
        if (fora.length) await sb.from('colaboradores').update({ ativo: false }).in('matricula', fora);
      }
      m.close(); toast('Importação concluída', `${linhas.length} colaboradores`);
      await carregarColabs(); renderEquipe();
    };
  }

  /* =========================================================
     MINHA CONTA
     ========================================================= */
  function abrirConta() {
    const m = modal({
      titulo: 'Minha conta',
      corpo: `<div class="form-stack">
        <div class="selected-person"><div class="avatar">${esc(iniciais(me.nome))}</div><div><b>${esc(me.nome)}</b><span>Mat. ${esc(me.matricula)} · ${esc(me.cargo || '')}</span></div></div>
        <div class="field"><label>Nova senha</label><input class="input" type="password" name="s1" autocomplete="new-password" placeholder="Mínimo 6 caracteres"></div>
        <div class="field"><label>Repita a nova senha</label><input class="input" type="password" name="s2" autocomplete="new-password"></div>
        <p class="muted" style="margin:0;font-size:.85rem">Esqueceu a senha? Peça para a TI rodar novamente sua linha em <span class="mono">03_acessos_supervisores.sql</span> — a senha volta a ser o CPF.</p>
      </div>`,
      rodape: `<button class="btn btn-ghost" data-close>Fechar</button><button class="btn btn-primary" data-ok>Trocar senha</button>`,
    });
    m.$('[data-ok]').onclick = async () => {
      const a = m.$('[name="s1"]').value, b = m.$('[name="s2"]').value;
      if (a.length < 6) return toast('Senha muito curta', 'Use pelo menos 6 caracteres.', 'err');
      if (a !== b) return toast('As senhas não conferem', '', 'err');
      const { error } = await sb.auth.updateUser({ password: a });
      if (error) return toast('Não foi possível trocar', error.message, 'err');
      m.close(); toast('Senha alterada');
    };
  }

  /* =========================================================
     5. TURNO — presença, pendências, passagem e fechamento
     ========================================================= */
  const PRES_TXT = { PRESENTE: 'Presente', ATRASO: 'Atraso', FALTA: 'Falta', FOLGA: 'Folga', ATESTADO: 'Atestado', FERIAS: 'Férias', AFASTADO: 'Afastado' };
  const T = { data: null, turno: null, equipe: ehCoord ? '' : (me.equipe || ''), dados: null };
  {
    const ti = CF.turnoInfo();
    T.data = ti.data; T.turno = ti.id;
  }

  async function dadosTurno(data, turno, eq) {
    const j = CF.janelaTurno(data, turno);
    const de = new Date(j.inicio.getTime() - 60 * 60000), ate = new Date(j.fim.getTime() + 60 * 60000);
    const [movs, { data: pres }, { data: ocs }, { data: pass }] = await Promise.all([
      buscarTudo(() => sb.from('movimentos').select('*').gte('criado_em', de.toISOString()).lt('criado_em', ate.toISOString()).order('criado_em')),
      sb.from('presencas').select('*').eq('data', data).eq('turno', turno),
      sb.from('ocorrencias').select('*').gte('criado_em', de.toISOString()).lt('criado_em', ate.toISOString()).order('criado_em', { ascending: false }),
      sb.from('passagens').select('*').order('criado_em', { ascending: false }).limit(30),
    ]);
    const colPorId = new Map(S.coletores.map((c) => [c.id, c]));
    const filtroEq = (x) => !eq || x.equipe === eq || colPorId.get(x.coletor_id)?.equipe === eq;
    const mv = movs.filter(filtroEq);
    const presMap = new Map((pres || []).map((p) => [p.matricula, p]));
    // escala: quem tem esse turno fixo na equipe
    const escala = [...S.colabs.values()].filter((c) => c.ativo && c.perfil === 'colaborador' && c.turno === turno && (!eq || c.equipe === eq));
    const bipou = new Map();
    mv.filter((m) => m.tipo === 'RETIRADA' && new Date(m.criado_em) >= de && new Date(m.criado_em) < j.fim).forEach((m) => { if (!bipou.has(m.matricula)) bipou.set(m.matricula, m); });
    const extras = [...bipou.keys()].filter((mat) => !escala.some((e) => e.matricula === mat)).map((mat) => S.colabs.get(mat) || { matricula: mat, nome: bipou.get(mat).nome });
    const semTurno = [...S.colabs.values()].filter((c) => c.ativo && c.perfil === 'colaborador' && !c.turno && (!eq || c.equipe === eq));
    const linhas = [...escala, ...extras].map((c) => {
      const p = presMap.get(c.matricula), b = bipou.get(c.matricula);
      const status = p?.status || (b ? 'PRESENTE' : null);
      return { c, p, b, status, auto: !p && !!b, extra: !escala.includes(c) };
    }).sort((a, b) => (a.status ? 1 : 0) - (b.status ? 1 : 0) || a.c.nome.localeCompare(b.c.nome));
    const pendentes = S.coletores.filter((c) => c.status === 'EM_USO' && (!eq || c.equipe === eq));
    const manut = S.coletores.filter((c) => c.status === 'MANUTENCAO' && (!eq || c.equipe === eq));
    const passagens = (pass || []).filter((x) => !eq || !x.equipe || x.equipe === eq);
    return {
      j, mv, ocs: (ocs || []).filter((o) => !eq || o.equipe === eq), linhas, extras, semTurno, pendentes, manut, passagens,
      ret: mv.filter((m) => m.tipo === 'RETIRADA' && new Date(m.criado_em) >= de && new Date(m.criado_em) < j.fim).length,
      dev: mv.filter((m) => m.tipo === 'DEVOLUCAO' && new Date(m.criado_em) >= j.inicio && new Date(m.criado_em) < ate).length,
    };
  }

  function contaPresenca(linhas) {
    const n = (st) => linhas.filter((l) => l.status === st).length;
    return { esperados: linhas.filter((l) => !l.extra).length, presentes: n('PRESENTE') + n('ATRASO'), atrasos: n('ATRASO'), faltas: n('FALTA'),
      justificados: n('FOLGA') + n('ATESTADO') + n('FERIAS') + n('AFASTADO'), semRegistro: linhas.filter((l) => !l.status).length };
  }

  // ----- tela -----
  $('#t-data').value = T.data;
  $('#t-data').onchange = () => { T.data = $('#t-data').value || T.data; carregarTurno(); };
  $$('#t-turno button').forEach((b) => b.addEventListener('click', () => { T.turno = b.dataset.t; carregarTurno(); }));
  $('#t-agora').onclick = () => { const ti = CF.turnoInfo(); T.data = ti.data; T.turno = ti.id; $('#t-data').value = T.data; carregarTurno(); };
  $('#t-equipe').onchange = () => { T.equipe = $('#t-equipe').value; carregarTurno(); };
  $('#t-fechar').onclick = () => abrirFechamento();
  $('#btn-fechar-turno').onclick = () => abrirFechamento();

  async function carregarTurno() {
    $$('#t-turno button').forEach((b) => b.classList.toggle('on', b.dataset.t === T.turno));
    const sel = $('#t-equipe');
    if (!sel.options.length || sel.dataset.pronto !== '1') {
      sel.innerHTML = `<option value="">Todas as equipes</option>` + equipesLista().map((e) => `<option>${esc(e)}</option>`).join('');
      sel.dataset.pronto = '1';
    }
    sel.value = T.equipe;
    $('#t-grid').style.opacity = '.55';
    try { T.dados = await dadosTurno(T.data, T.turno, T.equipe); } catch (e) { toast('Erro ao carregar o turno', e.message, 'err'); return; }
    $('#t-grid').style.opacity = '';
    renderTurno();
    renderAlertasTurno();
  }

  function renderTurno() {
    const d = T.dados, k = contaPresenca(d.linhas);
    const agora = CF.turnoInfo();
    const ehAtual = agora.data === T.data && agora.id === T.turno;
    $('#t-titulo').innerHTML = `${esc(T.turno)} · ${fmtData(d.j.inicio)} <span class="muted" style="font-weight:600;font-size:.9rem">${fmtHora(d.j.inicio)}–${fmtHora(d.j.fim)}${ehAtual ? ' · em andamento' : ''}</span>`;
    $('#t-kpis').innerHTML = [
      ['Esperados', k.esperados, 'var(--rd-900)'], ['Presentes', k.presentes, 'var(--ok)'], ['Faltas', k.faltas, 'var(--danger)'],
      ['Folga/atestado', k.justificados, 'var(--alug)'], ['Sem registro', k.semRegistro, 'var(--uso)'],
      ['Retiradas', d.ret, 'var(--uso)'], ['Não devolvidos', d.pendentes.filter(atrasado).length, 'var(--danger)'],
    ].map(([l, n, c]) => `<div class="kpi" style="cursor:default"><span><i style="background:${c}"></i>${l}</span><b>${n}</b></div>`).join('');

    // presença
    const pres = $('#t-presenca');
    if (!d.linhas.length) {
      pres.innerHTML = `<div class="empty">${icon('users')}<div>Ninguém na escala do ${esc(T.turno)}${T.equipe ? ' da equipe ' + esc(T.equipe) : ''}.</div>
        <p style="margin:6px 0 0;font-size:.86rem">Defina o turno de cada colaborador logo abaixo (ou na aba Equipe) — depois disso a presença aparece aqui automaticamente.</p></div>`;
    } else {
      pres.innerHTML = `<table class="table"><thead><tr><th>Colaborador</th><th>Coletor no turno</th><th style="width:170px">Presença</th></tr></thead><tbody>` +
        d.linhas.map((l) => `<tr data-m="${esc(l.c.matricula)}">
          <td><b>${esc(l.c.nome)}</b><div class="muted mono" style="font-size:.78rem">${esc(l.c.matricula)}${l.extra ? ' · <span style="color:var(--alug);font-family:var(--font)">fora da escala</span>' : ''}</div></td>
          <td>${l.b ? `<span class="chip tp-RETIRADA">${esc(l.b.coletor_codigo)}</span> <span class="muted" style="font-size:.82rem">${fmtHora(l.b.criado_em)}</span>` : '<span class="muted">—</span>'}</td>
          <td><select class="input pres-sel ${l.status ? 'ps-' + l.status : ''}" data-pres>
            <option value="">${l.auto ? 'Bipou ✓' : 'Sem registro'}</option>
            ${Object.entries(PRES_TXT).map(([kk, v]) => `<option value="${kk}" ${l.p?.status === kk ? 'selected' : ''}>${v}</option>`).join('')}
          </select></td></tr>`).join('') + '</tbody></table>';
      $$('tr[data-m]', pres).forEach((tr) => {
        $('[data-pres]', tr).onchange = async (e) => {
          const st = e.target.value, mat = tr.dataset.m;
          const r = st
            ? await sb.from('presencas').upsert({ data: T.data, turno: T.turno, matricula: mat, status: st, marcado_por: me.matricula, atualizado_em: new Date().toISOString() }, { onConflict: 'data,turno,matricula' })
            : await sb.from('presencas').delete().eq('data', T.data).eq('turno', T.turno).eq('matricula', mat);
          if (r.error) return toast('Erro ao marcar presença', r.error.message, 'err');
          carregarTurno();
        };
      });
    }
    // sem turno definido
    const st = $('#t-semturno');
    st.innerHTML = d.semTurno.length ? `<details><summary><b>${d.semTurno.length}</b> colaborador${d.semTurno.length > 1 ? 'es' : ''}${T.equipe ? ' da ' + esc(T.equipe) : ''} sem turno definido — defina para entrarem na escala</summary>
      <div class="stat-list" style="margin-top:10px">${d.semTurno.slice(0, 80).map((c) => `<div class="semturno-row" data-m="${esc(c.matricula)}"><span>${esc(c.nome)} <span class="muted mono" style="font-size:.78rem">${esc(c.matricula)}</span></span>
        <div class="seg">${C.TURNOS.map((t) => `<button type="button" data-set="${t.id}">${t.id}</button>`).join('')}</div></div>`).join('')}</div></details>` : '';
    $$('.semturno-row [data-set]', st).forEach((b) => b.onclick = async () => {
      const mat = b.closest('[data-m]').dataset.m;
      const { error } = await sb.from('colaboradores').update({ turno: b.dataset.set }).eq('matricula', mat);
      if (error) return toast('Erro', error.message, 'err');
      S.colabs.get(mat).turno = b.dataset.set;
      carregarTurno();
    });

    // pendências
    $('#t-pend').innerHTML = `
      ${d.pendentes.length ? d.pendentes.map((c) => `<div class="pend-row ${atrasado(c) ? 'late' : ''}"><b class="mono">${esc(c.codigo)}</b>
        <span>${esc(primeiroNome(c.portador_nome))}<small>${esc(c.turno_retirada || '')} · desde ${fmtData(c.retirado_em)} ${fmtHora(c.retirado_em)}</small></span>
        <em>${atrasado(c) ? 'Não devolvido' : fmtDuracao(Date.now() - new Date(c.retirado_em))}</em></div>`).join('') : '<div class="muted" style="padding:6px 0">Nenhum coletor fora do armário ✔</div>'}
      ${d.manut.length ? `<div class="mini-title">Em manutenção</div>${d.manut.map((c) => `<div class="pend-row"><b class="mono">${esc(c.codigo)}</b><span>${esc(c.observacao || 'Manutenção')}</span><em></em></div>`).join('')}` : ''}
      ${d.ocs.length ? `<div class="mini-title">Ocorrências neste turno</div>${d.ocs.map((o) => `<div class="pend-row"><b class="mono">${esc(o.coletor_codigo)}</b><span>${esc(OC_TXT[o.tipo])}${o.descricao ? ' · ' + esc(o.descricao) : ''}<small>${o.nome ? esc(primeiroNome(o.nome)) + ' · ' : ''}${fmtHora(o.criado_em)}</small></span><em class="${o.status === 'ABERTA' ? '' : 'ok'}">${o.status === 'ABERTA' ? 'Aberta' : 'Resolvida'}</em></div>`).join('')}` : ''}`;
    $('#t-cobrar').classList.toggle('hidden', !d.pendentes.filter(atrasado).length);

    // passagens
    $('#t-passagens').innerHTML = d.passagens.length ? d.passagens.slice(0, 8).map((x) => `<div class="pass-row" data-id="${x.id}">
      <div><b>${esc(x.turno)} · ${fmtData(x.data + 'T12:00:00' + C.OFFSET)}</b>${x.equipe ? ` <span class="chip nodot pr-CD">${esc(x.equipe)}</span>` : ''}
        <small>por ${esc(primeiroNome(x.autor_nome))} · ${fmtHora(x.criado_em)}</small></div>
      ${x.ciente_em ? `<span class="chip st-DISPONIVEL" title="${esc(x.ciente_nome || '')}">Ciente · ${esc(primeiroNome(x.ciente_nome || '').split(' ')[0])}</span>` : '<span class="chip st-EM_USO">Aguardando ciente</span>'}
    </div>`).join('') : '<div class="muted">Nenhuma passagem registrada ainda.</div>';
    $$('#t-passagens .pass-row').forEach((el) => el.onclick = () => verPassagem(d.passagens.find((x) => String(x.id) === el.dataset.id)));

    carregarRanking();
  }

  async function carregarRanking() {
    const inicioMes = new Date(`${CF.ymdLocal().slice(0, 8)}01T00:00:00${C.OFFSET}`);
    const { data, error } = await sb.from('v_emprestimos').select('matricula,nome,equipe,atrasou').gte('retirado_em', inicioMes.toISOString());
    const box = $('#t-ranking');
    if (error) { box.innerHTML = `<span class="muted">${esc(error.message)}</span>`; return; }
    const tot = {}, atr = {};
    (data || []).filter((r) => !T.equipe || r.equipe === T.equipe).forEach((r) => {
      tot[r.matricula] = (tot[r.matricula] || 0) + 1;
      if (r.atrasou) atr[r.matricula] = { n: (atr[r.matricula]?.n || 0) + 1, nome: r.nome };
    });
    const top = Object.entries(atr).sort((a, b) => b[1].n - a[1].n).slice(0, 8);
    box.innerHTML = top.length ? top.map(([mat, v]) => `<div class="bar-row"><span>${esc(primeiroNome(v.nome))} <span class="muted" style="font-size:.78rem">${v.n} de ${tot[mat]}</span></span><b>${v.n}</b>
      <div class="bar"><i style="width:${v.n / top[0][1].n * 100}%;background:var(--danger)"></i></div></div>`).join('')
      : '<span class="muted">Ninguém atrasou devolução este mês 👏</span>';
  }

  function renderAlertasTurno() {
    const box = $('#t-alertas');
    const pend = passagensPendentes();
    box.innerHTML = pend.map((x) => `<div class="banner info" data-id="${x.id}">${icon('swap')}<div><b>Passagem de turno do ${esc(x.turno)} (${esc(primeiroNome(x.autor_nome))})</b><span>Leia e dê o ciente.</span></div><button class="btn btn-dark btn-sm">Abrir</button></div>`).join('');
    $$('.banner[data-id]', box).forEach((el) => el.querySelector('button').onclick = () => verPassagem(S.passagens.find((x) => String(x.id) === el.dataset.id)));
  }

  // ----- passagens pendentes de ciente (para o supervisor que entra) -----
  S.passagens = [];
  async function carregarPassagensPendentes() {
    const desde = new Date(Date.now() - 20 * 3600e3).toISOString();
    const { data } = await sb.from('passagens').select('*').is('ciente_em', null).gte('criado_em', desde).order('criado_em', { ascending: false });
    S.passagens = data || [];
    renderAlertasTurno();
    const n = passagensPendentes().length;
    $('#nav-turno').textContent = n ? `${n} p/ ciente` : '';
  }
  const passagensPendentes = () => S.passagens.filter((x) => !x.ciente_em && x.autor_matricula !== me.matricula && (ehCoord || !x.equipe || !me.equipe || x.equipe === me.equipe));

  function verPassagem(x) {
    if (!x) return;
    const pode = !x.ciente_em && x.autor_matricula !== me.matricula;
    const m = modal({
      titulo: `Passagem de turno · ${esc(x.turno)} ${fmtData(x.data + 'T12:00:00' + C.OFFSET)}`,
      largo: true,
      corpo: `<div class="form-stack">
        <div class="selected-person"><div class="avatar">${esc(iniciais(x.autor_nome))}</div><div><b>${esc(x.autor_nome || '')}</b><span>${x.equipe ? 'Equipe ' + esc(x.equipe) + ' · ' : ''}registrado ${fmtDataHora(x.criado_em)}</span></div></div>
        ${x.anotacoes ? `<div class="field"><label>Recado do supervisor</label><div class="recado">${esc(x.anotacoes)}</div></div>` : ''}
        <div class="field"><label>Resumo do turno</label><div class="preview-text">${esc(x.resumo || '')}</div></div>
        ${x.ciente_em ? `<div class="banner ok">${icon('check')}<div><b>Ciente de ${esc(x.ciente_nome)}</b><span>${fmtDataHora(x.ciente_em)}</span></div></div>` : ''}
      </div>`,
      rodape: `<button class="btn btn-ghost" data-close>Fechar</button>${pode ? `<button class="btn btn-primary" data-ciente>${icon('check')}Dar ciente</button>` : ''}`,
    });
    const b = m.$('[data-ciente]');
    if (b) b.onclick = async () => {
      const { error } = await sb.from('passagens').update({ ciente_matricula: me.matricula, ciente_nome: me.nome, ciente_em: new Date().toISOString() }).eq('id', x.id).is('ciente_em', null);
      if (error) return toast('Erro', error.message, 'err');
      m.close(); toast('Ciente registrado', `Passagem do ${x.turno}`);
      await carregarPassagensPendentes();
      if (S.view === 'turno') carregarTurno();
    };
  }

  // ----- fechamento de turno -----
  function textoFechamento(d, eq, anot) {
    const k = contaPresenca(d.linhas);
    const atr = d.pendentes.filter(atrasado);
    const L = [];
    L.push(`*Fechamento de turno ${T.turno} – ${fmtData(d.j.inicio)}${eq ? ' – Equipe ' + eq : ''}*`);
    L.push(`Supervisor: ${me.nome}`);
    L.push(`Coletores: ${d.ret} retiradas · ${d.dev} devoluções`);
    if (d.pendentes.length) {
      L.push(`⚠️ Fora do armário (${d.pendentes.length}):`);
      d.pendentes.forEach((c) => L.push(`• ${c.codigo} – ${c.portador_nome} (mat. ${c.portador_matricula}) desde ${fmtHora(c.retirado_em)}${atrasado(c) ? ' – NÃO DEVOLVIDO' : ''}`));
    } else L.push('✅ Todos os coletores devolvidos');
    if (d.ocs.length) {
      L.push(`🔧 Ocorrências (${d.ocs.length}):`);
      d.ocs.forEach((o) => L.push(`• ${o.coletor_codigo} – ${OC_TXT[o.tipo]}${o.descricao ? ': ' + o.descricao : ''}${o.nome ? ' (' + primeiroNome(o.nome) + ')' : ''}`));
    }
    if (d.manut.length) L.push(`🛠️ Em manutenção: ${d.manut.map((c) => c.codigo).join(', ')}`);
    if (k.esperados || k.presentes) {
      L.push(`👥 Presença: ${k.presentes}/${k.esperados}${k.atrasos ? ` · ${k.atrasos} atraso(s)` : ''}`);
      const grupo = (st) => d.linhas.filter((l) => l.status === st).map((l) => primeiroNome(l.c.nome));
      ['FALTA', 'ATESTADO', 'FOLGA', 'FERIAS', 'AFASTADO'].forEach((st) => { const g = grupo(st); if (g.length) L.push(`   ${PRES_TXT[st]}: ${g.join(', ')}`); });
      if (k.semRegistro) L.push(`   Sem registro: ${d.linhas.filter((l) => !l.status).map((l) => primeiroNome(l.c.nome)).join(', ')}`);
    }
    if (anot) L.push(`📝 ${anot}`);
    if (atr.length) L.push('', 'Favor devolver os coletores pendentes no armário.');
    return L.join('\n');
  }

  async function abrirFechamento() {
    const ti = CF.turnoInfo();
    // padrão: turno que está acabando (atual). Se a tela Turno estiver aberta, usa o selecionado.
    if (S.view !== 'turno') { T.data = ti.data; T.turno = ti.id; }
    const eq = S.view === 'turno' ? T.equipe : (ehCoord ? '' : me.equipe || '');
    const m = modal({ titulo: `Encerrar turno ${esc(T.turno)}`, corpo: '<div class="empty">Montando o resumo…</div>', largo: true });
    let d;
    try { d = await dadosTurno(T.data, T.turno, eq); } catch (e) { m.$('.modal-body').innerHTML = `<div class="empty">${esc(e.message)}</div>`; return; }
    const k = contaPresenca(d.linhas);
    m.$('.modal-body').innerHTML = `<div class="form-stack">
      <div class="kpis" style="grid-template-columns:repeat(4,1fr);margin:0">
        <div class="kpi"><span>Retiradas</span><b>${d.ret}</b></div>
        <div class="kpi"><span>Devoluções</span><b>${d.dev}</b></div>
        <div class="kpi ${d.pendentes.length ? 'alert' : ''}"><span>Fora do armário</span><b>${d.pendentes.length}</b></div>
        <div class="kpi"><span>Presença</span><b>${k.presentes}/${k.esperados}</b></div>
      </div>
      ${k.semRegistro ? `<div class="banner warn">${icon('alert')}<div><b>${k.semRegistro} pessoa(s) da escala sem registro</b><span>Marque falta/folga/atestado na tela Turno antes de encerrar, se for o caso.</span></div></div>` : ''}
      <div class="field"><label>Recado para o próximo supervisor</label><textarea class="input" data-anot placeholder="Ex.: doca 3 com pallet pendente; COL-007 aguardando técnico; Fulano saiu mais cedo (consulta)"></textarea></div>
      <div class="field"><label>Resumo (vai copiado)</label><div class="preview-text" data-prev></div></div>
    </div>`;
    const foot = document.createElement('div');
    foot.className = 'modal-foot';
    foot.innerHTML = `<button class="btn btn-ghost" data-copiar>${icon('copy')}Copiar</button>
      <a class="btn btn-ghost" data-wpp target="_blank" rel="noopener">${icon('ext')}WhatsApp</a>
      <button class="btn btn-primary" data-salvar>${icon('swap')}Registrar passagem de turno</button>`;
    m.$('.modal').appendChild(foot);
    const texto = () => textoFechamento(d, eq, m.$('[data-anot]').value.trim());
    const atualiza = () => { m.$('[data-prev]').textContent = texto(); m.$('[data-wpp]').href = 'https://wa.me/?text=' + encodeURIComponent(texto()); };
    m.$('[data-anot]').addEventListener('input', atualiza); atualiza();
    m.$('[data-copiar]').onclick = async () => { try { await navigator.clipboard.writeText(texto()); toast('Resumo copiado'); } catch (e) { toast('Não foi possível copiar', '', 'err'); } };
    m.$('[data-salvar]').onclick = async () => {
      const txt = texto();
      const { error } = await sb.from('passagens').insert({
        data: T.data, turno: T.turno, equipe: eq || null, autor_matricula: me.matricula, autor_nome: me.nome,
        resumo: txt, anotacoes: m.$('[data-anot]').value.trim() || null,
        pendencias: {
          fora_do_armario: d.pendentes.map((c) => ({ codigo: c.codigo, nome: c.portador_nome, matricula: c.portador_matricula, desde: c.retirado_em, atrasado: atrasado(c) })),
          ocorrencias: d.ocs.map((o) => ({ codigo: o.coletor_codigo, tipo: o.tipo, descricao: o.descricao })),
          manutencao: d.manut.map((c) => c.codigo),
          presenca: k,
        },
      });
      if (error) return toast('Não foi possível registrar', error.message, 'err');
      try { await navigator.clipboard.writeText(txt); } catch (e) { /* */ }
      m.close();
      toast('Passagem de turno registrada', 'Resumo copiado — o próximo supervisor será avisado para dar ciente.');
      if (S.view === 'turno') carregarTurno();
    };
  }

  /* =========================================================
     6. COBRANÇA DE NÃO DEVOLVIDOS
     ========================================================= */
  const meusOuTodos = (c) => ehCoord || ehMeu(c);
  function textoCobranca(lista) {
    return [`*Coletores não devolvidos – ${fmtDataHora(new Date())}*`,
      ...lista.map((c) => `• ${c.codigo} – ${c.portador_nome} (mat. ${c.portador_matricula}) – retirado ${fmtData(c.retirado_em)} ${fmtHora(c.retirado_em)} no ${c.turno_retirada || 'turno'}`),
      '', 'Favor devolver no armário e bipar no terminal. Obrigado!'].join('\n');
  }
  function cobrar(lista = S.coletores.filter((c) => atrasado(c) && meusOuTodos(c))) {
    const txt = textoCobranca(lista);
    const m = modal({
      titulo: `Cobrar ${lista.length} coletor${lista.length > 1 ? 'es' : ''} não devolvido${lista.length > 1 ? 's' : ''}`,
      corpo: `<div class="preview-text">${esc(txt)}</div>`,
      rodape: `<button class="btn btn-ghost" data-copiar>${icon('copy')}Copiar</button><a class="btn btn-primary" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(txt)}">${icon('ext')}Enviar no WhatsApp</a>`,
    });
    m.$('[data-copiar]').onclick = async () => { try { await navigator.clipboard.writeText(txt); toast('Copiado'); } catch (e) { /* */ } };
  }
  $('#t-cobrar').onclick = () => cobrar();

  function renderBannerAtraso() {
    const lista = S.coletores.filter((c) => atrasado(c) && meusOuTodos(c));
    const box = $('#col-alerta');
    box.innerHTML = lista.length ? `<div class="banner warn">${icon('alert')}<div><b>${lista.length} coletor${lista.length > 1 ? 'es' : ''} não devolvido${lista.length > 1 ? 's' : ''} após o fim do turno</b>
      <span>${lista.slice(0, 4).map((c) => `${c.codigo} · ${esc(primeiroNome(c.portador_nome))}`).join(' — ')}${lista.length > 4 ? ' …' : ''}</span></div>
      <button class="btn btn-ghost btn-sm" data-ver>Ver</button><button class="btn btn-dark btn-sm" data-cobrar>Cobrar</button></div>` : '';
    const v = $('[data-ver]', box), c = $('[data-cobrar]', box);
    if (v) v.onclick = () => { S.filtroKpi = 'ATRASADO'; ir('coletores'); renderColetores(); };
    if (c) c.onclick = () => cobrar(lista);
  }

  function verificarAtrasos() {
    renderBannerAtraso();
    let avisados;
    try { avisados = new Set(JSON.parse(localStorage.getItem('cf-cobrados') || '[]')); } catch (e) { avisados = new Set(); }
    const novos = S.coletores.filter((c) => atrasado(c) && meusOuTodos(c) && !avisados.has(c.id + '|' + c.retirado_em));
    if (!novos.length) return;
    novos.forEach((c) => {
      avisados.add(c.id + '|' + c.retirado_em);
      pushNotif({ kind: 'atraso', id: 'a' + c.id + c.retirado_em, titulo: `${c.codigo} não devolvido`, texto: `${primeiroNome(c.portador_nome)} · retirado ${fmtHora(c.retirado_em)} (${c.turno_retirada || '–'})`, em: new Date().toISOString() });
    });
    try { localStorage.setItem('cf-cobrados', JSON.stringify([...avisados].slice(-300))); } catch (e) { /* */ }
    const t = novos.length === 1 ? `${novos[0].codigo} não foi devolvido` : `${novos.length} coletores não devolvidos`;
    const sub = novos.slice(0, 3).map((c) => `${c.codigo} · ${primeiroNome(c.portador_nome)}`).join(', ');
    toast(t, sub + ' — o turno já acabou.', 'err', 9000);
    beep('err');
    sistema(t, `${sub}. O turno terminou e o coletor não voltou ao armário.`, 'atraso');
  }
  setInterval(verificarAtrasos, 60000);

  /* =========================================================
     NOTIFICAÇÕES EM TEMPO REAL
     ========================================================= */
  function carregarNotifs() { try { return JSON.parse(localStorage.getItem('cf-notifs') || '[]'); } catch (e) { return []; } }
  function salvarNotifs() { try { localStorage.setItem('cf-notifs', JSON.stringify(S.notifs.slice(0, 80))); } catch (e) { /* */ } }
  const relevante = (mv) => ehCoord || mv.supervisor_matricula === me.matricula || (!!me.equipe && mv.equipe === me.equipe) ||
    S.coletores.some((c) => c.id === mv.coletor_id && ehMeu(c));
  const NOTIF_ICON = { RETIRADA: ['up', 'tp-RETIRADA'], DEVOLUCAO: ['down', 'tp-DEVOLUCAO'], oc: ['wrench', 'st-MANUTENCAO'], atraso: ['alert', 'st-MANUTENCAO'], passagem: ['swap', 'pr-CD'] };

  function pushNotif(n) { S.notifs.unshift({ lida: false, ...n }); salvarNotifs(); renderNotifs(); }
  function sistema(titulo, corpo, tag) {
    if ('Notification' in window && Notification.permission === 'granted' && document.visibilityState !== 'visible') {
      try { new Notification(titulo, { body: corpo, icon: 'assets/icon-192.png', tag }); } catch (e) { /* */ }
    }
  }
  function renderNotifs() {
    const nao = S.notifs.filter((n) => !n.lida).length;
    $('#bell-dot').textContent = nao > 9 ? '9+' : nao;
    $('#bell-dot').classList.toggle('hidden', !nao);
    $('#notif-lista').innerHTML = S.notifs.length ? S.notifs.map((n) => {
      const kind = n.kind || n.tipo;
      const [ic, cls] = NOTIF_ICON[kind] || ['bell', 'pr-CD'];
      const corpo = n.titulo ? `<b>${esc(n.titulo)}</b>${n.texto ? ' · ' + esc(n.texto) : ''}`
        : `<b>${esc(primeiroNome(n.nome))}</b> ${n.tipo === 'RETIRADA' ? 'retirou' : 'devolveu'} o <b class="mono">${esc(n.coletor)}</b>`;
      return `<div class="notif ${n.lida ? '' : 'new'}"><div class="ni chip nodot ${cls}" style="padding:0">${icon(ic)}</div>
        <div>${corpo}<time>${fmtDataHora(n.em)}${n.turno ? ' · ' + esc(n.turno) : ''}</time></div></div>`;
    }).join('')
      : `<div class="empty">Sem notificações ainda.<br>Você será avisado a cada retirada, devolução, problema ou atraso dos seus coletores.</div>`;
    const perm = $('#notif-perm');
    perm.classList.toggle('hidden', !('Notification' in window) || Notification.permission === 'granted');
  }
  $('#bell').onclick = (e) => {
    e.stopPropagation();
    const p = $('#notif-panel');
    p.classList.toggle('hidden');
    if (!p.classList.contains('hidden')) { setTimeout(() => { S.notifs.forEach((n) => n.lida = true); salvarNotifs(); renderNotifs(); }, 1500); }
  };
  document.addEventListener('click', (e) => { const p = $('#notif-panel'); if (!p.contains(e.target)) p.classList.add('hidden'); });
  $('#notif-perm').onclick = async () => { await Notification.requestPermission(); renderNotifs(); };

  function notificar(mv) {
    pushNotif({ kind: mv.tipo, tipo: mv.tipo, nome: mv.nome, coletor: mv.coletor_codigo, turno: mv.turno, em: mv.criado_em, id: mv.id,
      titulo: `${primeiroNome(mv.nome)} ${mv.tipo === 'RETIRADA' ? 'retirou' : 'devolveu'} o ${mv.coletor_codigo}`, texto: `mat. ${mv.matricula}` });
    const verbo = mv.tipo === 'RETIRADA' ? 'retirou' : 'devolveu';
    toast(`${primeiroNome(mv.nome)} ${verbo} o ${mv.coletor_codigo}`, `Mat. ${mv.matricula} · ${mv.turno || ''} · ${fmtHora(mv.criado_em)}`, mv.tipo === 'RETIRADA' ? 'ret' : 'ok', 7000);
    beep('notif');
    sistema(`${mv.coletor_codigo} ${mv.tipo === 'RETIRADA' ? 'retirado' : 'devolvido'}`, `${mv.nome} (mat. ${mv.matricula}) ${verbo} o coletor ${mv.coletor_codigo} · ${mv.turno || ''}`, 'mov-' + mv.id);
  }
  function notificarOcorrencia(o) {
    if (!(ehCoord || o.supervisor_matricula === me.matricula || (!!me.equipe && o.equipe === me.equipe))) return;
    const t = `${o.coletor_codigo} com problema: ${OC_TXT[o.tipo] || o.tipo}`;
    const sub = `${o.nome ? primeiroNome(o.nome) + ' · ' : ''}${o.descricao || 'relatado ' + (o.origem === 'TERMINAL' ? 'no terminal' : 'no painel')}`;
    pushNotif({ kind: 'oc', id: 'o' + o.id, titulo: t, texto: sub, em: o.criado_em });
    toast(t, sub, 'err', 8000); beep('notif');
    sistema(t, sub + ' — enviado para manutenção.', 'oc-' + o.id);
  }
  function notificarPassagem(x) {
    if (x.autor_matricula === me.matricula) return;
    if (!(ehCoord || !x.equipe || !me.equipe || x.equipe === me.equipe)) return;
    const t = `Passagem de turno do ${x.turno}`;
    pushNotif({ kind: 'passagem', id: 'p' + x.id, titulo: t, texto: `por ${primeiroNome(x.autor_nome)} — dê o ciente`, em: x.criado_em });
    toast(t, `${primeiroNome(x.autor_nome)} registrou. Abra a aba Turno para dar ciente.`, 'info', 8000); beep('notif');
    sistema(t, `${x.autor_nome} registrou a passagem de turno. Dê o ciente.`, 'pa-' + x.id);
  }

  const recarregarColetores = debounce(async () => { await carregarColetores(); verificarAtrasos(); if (S.view === 'turno') carregarTurno(); }, 400);
  sb.channel('cf-realtime')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'movimentos' }, ({ new: mv }) => {
      if (relevante(mv)) notificar(mv);
      if (S.view === 'historico') carregarHistorico();
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'coletores' }, recarregarColetores)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'ocorrencias' }, ({ new: o }) => notificarOcorrencia(o))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'passagens' }, ({ new: x, eventType }) => {
      if (eventType === 'INSERT' && x) notificarPassagem(x);
      carregarPassagensPendentes();
      if (S.view === 'turno') carregarTurno();
    })
    .subscribe();

  /* ---------------- início ---------------- */
  await carregarColabs();
  await carregarColetores();
  renderNotifs();
  verificarAtrasos();
  carregarPassagensPendentes();
  ir((location.hash || '#chamados').slice(1));
  window.addEventListener('hashchange', () => ir((location.hash || '#chamados').slice(1)));
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
