/**
 * BolãoCopa26 — Camada de Dados Supabase
 *
 * Substitui o localStorage por chamadas reais ao Supabase.
 * Todas as funções retornam Promises.
 *
 * ⚠️ CONFIGURE suas credenciais abaixo antes de usar.
 */

// ============================================================
// CONFIGURAÇÃO — troque pelos valores do seu projeto Supabase
// Dashboard → Settings → API
// ============================================================
const SUPABASE_URL = 'https://nmacngyeafenmracxfip.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5tYWNuZ3llYWZlbm1yYWN4ZmlwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE4OTY5MzMsImV4cCI6MjA5NzQ3MjkzM30.pw6wrBCFh0RZh3SmnG2BLhfHOLsobuH5C9jMSJMIu9o';

// ID do bolão que este frontend gerencia
const BOLAO_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

// ============================================================
// CLIENTE SUPABASE (via CDN — sem npm)
// ============================================================
const { createClient } = supabase;
const sb = createClient(SUPABASE_URL, SUPABASE_ANON);

// ============================================================
// ESTADO GLOBAL (cache em memória — substituiu o objeto DB)
// ============================================================
const DB = {
  config: {},
  participantes: [],
  jogos: [],
  grupos: {},
  palpites: {},   // { 'j<uuid>': { c, f } }
  log: [],
  bolao: {},
};

// ============================================================
// HELPERS INTERNOS
// ============================================================

/** Lança erro com mensagem legível se a query falhar */
function check(result, ctx) {
  if (result.error) {
    console.error(`[Supabase] ${ctx}:`, result.error);
    throw new Error(`Erro ao ${ctx}: ${result.error.message}`);
  }
  return result.data;
}

/**
 * Mapeia a linha do Supabase (snake_case / UUIDs) para o
 * formato que o app.js já usa (camelCase / campos simples).
 */
function mapParticipante(row) {
  return {
    id: row.id,
    nome: row.nome,
    email: row.email,
    whats: row.whatsapp || '',
    pontos: row.pontos_total || 0,
    palpites: row.total_palpites || 0,
    pago: row.status_pagamento || 'Pendente',
    avatar: row.avatar_iniciais,
    cor: row.cor_fundo,
    corT: row.cor_texto,
    posicao: row.posicao || null,
  };
}

function mapJogo(row) {
  // Supabase retorna data_hora como ISO string
  const dt = new Date(row.data_hora);
  const data = dt.toISOString().slice(0, 10);
  const hora = dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  return {
    id: row.id,
    casa: `${row.time_casa_flag} ${row.time_casa_nome}`,
    fora: `${row.time_fora_flag} ${row.time_fora_nome}`,
    data,
    hora,
    grupo: row.fase,
    status: mapStatus(row.status),
    golsCasa: row.gols_casa ?? null,
    golsFora: row.gols_fora ?? null,
    estadio: row.estadio || '',
    // UUIDs originais (para edição/update)
    _timeCasaId: row.time_casa_id,
    _timeForaId: row.time_fora_id,
  };
}

/** Normaliza status do Supabase (enum) para o que o app.js usa */
function mapStatus(s) {
  const map = {
    'Aberto': 'Aberto',
    'Ao Vivo': 'Ao Vivo',
    'Encerrado': 'Encerrado',
    'Prorrogacao': 'Prorrogação',
    'Penaltis': 'Pênaltis',
    'Cancelado': 'Cancelado',
  };
  return map[s] || s;
}

function mapStatusInverse(s) {
  const map = {
    'Aberto': 'Aberto',
    'Ao Vivo': 'Ao Vivo',
    'Encerrado': 'Encerrado',
    'Prorrogação': 'Prorrogacao',
    'Pênaltis': 'Penaltis',
    'Cancelado': 'Cancelado',
  };
  return map[s] || s;
}

// ============================================================
// INICIALIZAÇÃO — carrega tudo do Supabase
// ============================================================

async function initDB() {
  try {
    showLoading(true);
    await Promise.all([
      loadConfig(),
      loadParticipantes(),
      loadJogos(),
      loadGrupos(),
      loadPalpites(),
      loadLog(),
    ]);
    showLoading(false);
  } catch (err) {
    showLoading(false);
    showToast('❌ Erro ao conectar ao banco: ' + err.message);
    console.error(err);
  }
}

// ============================================================
// CONFIG
// ============================================================

async function loadConfig() {
  const data = check(
    await sb.from('boloes').select('*').eq('id', BOLAO_ID).single(),
    'carregar configurações'
  );
  DB.bolao = data;
  DB.config = {
    nome: data.nome,
    valorPorPart: parseFloat(data.valor_por_part),
    ptsExato: data.pts_exato,
    ptsSaldo: data.pts_saldo,
    ptsVencedor: data.pts_vencedor,
    prazoMin: data.prazo_min,
  };
}

async function saveConfig(cfg) {
  check(
    await sb.from('boloes').update({
      nome: cfg.nome,
      valor_por_part: cfg.valorPorPart,
      pts_exato: cfg.ptsExato,
      pts_saldo: cfg.ptsSaldo,
      pts_vencedor: cfg.ptsVencedor,
      prazo_min: cfg.prazoMin,
    }).eq('id', BOLAO_ID),
    'salvar configurações'
  );
  Object.assign(DB.config, cfg);
  await addLog('Configurações do bolão atualizadas');
}

// ============================================================
// PARTICIPANTES
// ============================================================

async function loadParticipantes() {
  // Usa a view vw_ranking que já traz pontos e status de pagamento
  const data = check(
    await sb
      .from('vw_ranking')
      .select(`
        participante_id,
        bolao_id,
        nome,
        email,
        avatar_iniciais,
        cor_fundo,
        cor_texto,
        pontos_total,
        total_palpites,
        acertos_exatos,
        acertos_saldo,
        acertos_vencedor,
        erros,
        pct_acerto,
        posicao
      `)
      .eq('bolao_id', BOLAO_ID)
      .order('posicao'),
    'carregar participantes'
  );

  // Busca status de pagamento de cada participante
  const pagamentos = check(
    await sb
      .from('pagamentos')
      .select('participante_id, status')
      .eq('bolao_id', BOLAO_ID),
    'carregar pagamentos'
  );
  const pagMap = Object.fromEntries(pagamentos.map(p => [p.participante_id, p.status]));

  // Busca dados extras (whatsapp) da tabela participantes
  const extras = check(
    await sb
      .from('participantes')
      .select('id, whatsapp')
      .eq('bolao_id', BOLAO_ID),
    'carregar whatsapp'
  );
  const extrasMap = Object.fromEntries(extras.map(e => [e.id, e]));

  DB.participantes = data.map(row => ({
    id: row.participante_id,
    nome: row.nome,
    email: row.email,
    whats: extrasMap[row.participante_id]?.whatsapp || '',
    pontos: row.pontos_total || 0,
    palpites: row.total_palpites || 0,
    pago: pagMap[row.participante_id] || 'Pendente',
    avatar: row.avatar_iniciais,
    cor: row.cor_fundo,
    corT: row.cor_texto,
    posicao: row.posicao,
    acertosExatos: row.acertos_exatos || 0,
    acertosSaldo: row.acertos_saldo || 0,
    acertosVencedor: row.acertos_vencedor || 0,
    erros: row.erros || 0,
    pctAcerto: row.pct_acerto || 0,
  }));
}

async function addParticipanteDB(dados) {
  const { nome, email, whats, pago, avatar, cor, corT } = dados;

  const data = check(
    await sb.from('participantes').insert({
      bolao_id: BOLAO_ID,
      nome,
      email,
      whatsapp: whats,
      avatar_iniciais: avatar,
      cor_fundo: cor,
      cor_texto: corT,
      papel: 'participante',
    }).select().single(),
    'adicionar participante'
  );

  // Atualiza status de pagamento se não for Pendente
  if (pago !== 'Pendente') {
    check(
      await sb.from('pagamentos')
        .update({ status: pago })
        .eq('participante_id', data.id)
        .eq('bolao_id', BOLAO_ID),
      'definir pagamento inicial'
    );
  }

  await loadParticipantes();
  await addLog(`${nome} entrou no bolão`);
  return data;
}

async function removerParticipanteDB(id) {
  const p = DB.participantes.find(x => x.id === id);
  check(
    await sb.from('participantes').delete().eq('id', id).eq('bolao_id', BOLAO_ID),
    'remover participante'
  );
  await loadParticipantes();
  await addLog(`${p?.nome || 'Participante'} foi removido do bolão`);
}

async function confirmarPagamentoDB(participanteId) {
  const p = DB.participantes.find(x => x.id === participanteId);
  check(
    await sb.from('pagamentos')
      .update({
        status: 'Pago',
        valor_pago: DB.config.valorPorPart,
        forma_pagamento: 'Pix',
        confirmado_em: new Date().toISOString(),
      })
      .eq('participante_id', participanteId)
      .eq('bolao_id', BOLAO_ID),
    'confirmar pagamento'
  );
  await loadParticipantes();
  await addLog(`Pagamento de ${p?.nome || ''} confirmado`);
}

async function registrarPagamentoDB({ participanteId, valorPago, forma, observacao }) {
  const p = DB.participantes.find(x => x.id === participanteId);
  check(
    await sb.from('pagamentos')
      .update({
        status: 'Pago',
        valor_pago: valorPago,
        forma_pagamento: forma,
        observacao,
        confirmado_em: new Date().toISOString(),
      })
      .eq('participante_id', participanteId)
      .eq('bolao_id', BOLAO_ID),
    'registrar pagamento'
  );
  await loadParticipantes();
  await addLog(`Pagamento de ${p?.nome || ''} registrado via ${forma}`);
}

// ============================================================
// JOGOS
// ============================================================

async function loadJogos() {
  const data = check(
    await sb
      .from('vw_jogos')
      .select('*')
      .eq('bolao_id', BOLAO_ID)
      .order('data_hora'),
    'carregar jogos'
  );
  DB.jogos = data.map(mapJogo);
}

async function addJogoDB(dados) {
  const { casaNome, foraNome, data, hora, grupo, estadio } = dados;

  // Busca UUIDs das seleções pelo nome
  const [casaSel, foraSel] = await Promise.all([
    sb.from('selecoes').select('id').ilike('nome', `%${casaNome}%`).single(),
    sb.from('selecoes').select('id').ilike('nome', `%${foraNome}%`).single(),
  ]);

  if (casaSel.error || foraSel.error) {
    throw new Error('Seleção não encontrada. Verifique os nomes dos times.');
  }

  const dataHora = `${data}T${hora}:00`;

  check(
    await sb.from('jogos').insert({
      bolao_id: BOLAO_ID,
      time_casa_id: casaSel.data.id,
      time_fora_id: foraSel.data.id,
      fase: grupo,
      estadio,
      data_hora: dataHora,
      status: 'Aberto',
    }),
    'adicionar jogo'
  );

  await loadJogos();
  await addLog(`Jogo adicionado: ${casaNome} × ${foraNome}`);
}

async function salvarResultadoDB({ jogoId, golsCasa, golsFora, status }) {
  const statusDB = mapStatusInverse(status);
  check(
    await sb.from('jogos')
      .update({
        gols_casa: golsCasa,
        gols_fora: golsFora,
        status: statusDB,
      })
      .eq('id', jogoId)
      .eq('bolao_id', BOLAO_ID),
    'salvar resultado'
  );

  // Se encerrou, recarrega participantes (pontuação calculada pelo trigger)
  if (status === 'Encerrado') {
    await Promise.all([loadJogos(), loadParticipantes()]);
  } else {
    await loadJogos();
  }

  const jogo = DB.jogos.find(j => j.id === jogoId);
  await addLog(`Resultado: ${jogo?.casa || ''} ${golsCasa}×${golsFora} ${jogo?.fora || ''}`);
}

// ============================================================
// GRUPOS (calculado a partir das seleções)
// ============================================================

async function loadGrupos() {
  const data = check(
    await sb
      .from('selecoes')
      .select('nome, emoji_bandeira, grupo')
      .not('grupo', 'is', null)
      .order('grupo'),
    'carregar grupos'
  );

  // Agrupa por letra
  const grupos = {};
  for (const sel of data) {
    const g = sel.grupo;
    if (!grupos[g]) grupos[g] = [];
    grupos[g].push({
      nome: `${sel.emoji_bandeira} ${sel.nome}`,
      pj: 0, v: 0, e: 0, d: 0, gp: 0, gc: 0, pts: 0,
    });
  }

  // Calcula estatísticas a partir dos jogos encerrados
  for (const jogo of DB.jogos) {
    if (jogo.status !== 'Encerrado' || jogo.golsCasa === null) continue;
    const fase = jogo.grupo;
    if (!grupos[fase]) continue;

    const gc = jogo.golsCasa;
    const gf = jogo.golsFora;

    const casaLabel = jogo.casa;
    const foraLabel = jogo.fora;

    const timeCasa = grupos[fase]?.find(t => t.nome === casaLabel);
    const timeFora = grupos[fase]?.find(t => t.nome === foraLabel);

    if (timeCasa) {
      timeCasa.pj++;
      timeCasa.gp += gc;
      timeCasa.gc += gf;
      if (gc > gf) { timeCasa.v++; timeCasa.pts += 3; }
      else if (gc === gf) { timeCasa.e++; timeCasa.pts += 1; }
      else { timeCasa.d++; }
    }
    if (timeFora) {
      timeFora.pj++;
      timeFora.gp += gf;
      timeFora.gc += gc;
      if (gf > gc) { timeFora.v++; timeFora.pts += 3; }
      else if (gc === gf) { timeFora.e++; timeFora.pts += 1; }
      else { timeFora.d++; }
    }
  }

  DB.grupos = grupos;
}

// ============================================================
// PALPITES
// ============================================================

async function loadPalpites() {
  // Carrega palpites do participante logado
  // Por ora usa o primeiro admin como "usuário atual" — adapte ao auth real
  const meParticipante = DB.participantes.find(p => p.email === 'marcos@email.com');
  if (!meParticipante) return;

  const data = check(
    await sb
      .from('palpites')
      .select('jogo_id, gols_casa, gols_fora, pontos_obtidos, calculado')
      .eq('participante_id', meParticipante.id)
      .eq('bolao_id', BOLAO_ID),
    'carregar palpites'
  );

  DB.palpites = {};
  for (const p of data) {
    DB.palpites[`j${p.jogo_id}`] = {
      c: p.gols_casa,
      f: p.gols_fora,
      pontos: p.pontos_obtidos,
      calc: p.calculado,
    };
  }
}

async function salvarPalpitesDB(palpitesNovos) {
  // palpitesNovos: [{ jogoId, golsCasa, golsFora }]
  const meParticipante = DB.participantes.find(p => p.email === 'marcos@email.com');
  if (!meParticipante) throw new Error('Participante atual não encontrado.');

  const rows = palpitesNovos.map(p => ({
    jogo_id: p.jogoId,
    participante_id: meParticipante.id,
    bolao_id: BOLAO_ID,
    gols_casa: p.golsCasa,
    gols_fora: p.golsFora,
  }));

  check(
    await sb.from('palpites')
      .upsert(rows, { onConflict: 'jogo_id,participante_id' }),
    'salvar palpites'
  );

  await loadPalpites();
  await addLog(`${meParticipante.nome} salvou ${palpitesNovos.length} palpite(s)`);
}

// ============================================================
// LOG DE ATIVIDADE
// ============================================================

async function loadLog() {
  const data = check(
    await sb
      .from('activity_log')
      .select('acao, descricao, criado_em')
      .eq('bolao_id', BOLAO_ID)
      .order('criado_em', { ascending: false })
      .limit(30),
    'carregar log'
  );

  DB.log = data.map(row => ({
    msg: row.descricao,
    time: formatRelTime(row.criado_em),
  }));
}

async function addLog(mensagem) {
  await sb.from('activity_log').insert({
    bolao_id: BOLAO_ID,
    acao: 'acao_usuario',
    descricao: mensagem,
  });
  // Atualiza cache local
  DB.log.unshift({ msg: mensagem, time: 'agora' });
  if (DB.log.length > 50) DB.log.pop();
}

// ============================================================
// RECALCULAR PONTUAÇÃO (chama função do Supabase)
// ============================================================

async function recalcularPontuacaoDB() {
  const { data, error } = await sb.rpc('fn_recalcular_bolao', { p_bolao_id: BOLAO_ID });
  if (error) throw new Error('Erro ao recalcular: ' + error.message);
  await Promise.all([loadParticipantes(), loadPalpites(), loadLog()]);
  return data; // número de palpites processados
}

// ============================================================
// BUSCA DE PARTICIPANTES (fulltext)
// ============================================================

async function buscarParticipantes(termo) {
  const data = check(
    await sb
      .from('participantes')
      .select('id, nome, email, avatar_iniciais')
      .eq('bolao_id', BOLAO_ID)
      .or(`nome.ilike.%${termo}%,email.ilike.%${termo}%`)
      .limit(10),
    'buscar participantes'
  );
  return data;
}

// ============================================================
// REALTIME — atualiza automaticamente ao mudar dados
// ============================================================

function initRealtime() {
  sb.channel('bolao-changes')
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'jogos',
      filter: `bolao_id=eq.${BOLAO_ID}`,
    }, async () => {
      await loadJogos();
      await loadGrupos();
      // Re-renderiza página ativa
      const activePage = document.querySelector('.page.active')?.id?.replace('page-', '');
      if (activePage === 'home') renderHome();
      if (activePage === 'palpitar') renderJogos();
      if (activePage === 'resultados') renderResultados();
      if (activePage === 'grupos') renderGrupos();
      showToast('🔄 Jogo atualizado em tempo real!');
    })
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'pontuacao',
      filter: `bolao_id=eq.${BOLAO_ID}`,
    }, async () => {
      await loadParticipantes();
      const activePage = document.querySelector('.page.active')?.id?.replace('page-', '');
      if (activePage === 'home') renderHome();
      if (activePage === 'ranking') renderRanking('geral');
    })
    .subscribe();
}

// ============================================================
// UTILITÁRIOS
// ============================================================

function formatRelTime(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  const h = Math.floor(diff / 3600000);
  const d = Math.floor(diff / 86400000);
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min} min`;
  if (h < 24) return `há ${h}h`;
  return `há ${d}d`;
}

function showLoading(visible) {
  let el = document.getElementById('loading-overlay');
  if (!el) {
    el = document.createElement('div');
    el.id = 'loading-overlay';
    el.innerHTML = `
      <div style="
        position:fixed;inset:0;background:rgba(13,17,23,.85);
        display:flex;align-items:center;justify-content:center;
        z-index:9999;flex-direction:column;gap:12px
      ">
        <div style="width:36px;height:36px;border:3px solid #22883f;
          border-top-color:transparent;border-radius:50%;animation:spin .7s linear infinite"></div>
        <p style="color:#8b949e;font-size:13px">Conectando ao banco...</p>
      </div>
      <style>@keyframes spin{to{transform:rotate(360deg)}}</style>`;
    document.body.appendChild(el);
  }
  el.style.display = visible ? 'block' : 'none';
}

// ============================================================
// COMPATIBILIDADE — mantém saveDB/resetDB para não quebrar
// nenhuma chamada residual no app.js
// ============================================================

/** Não faz nada: persistência agora é via Supabase */
function saveDB(_data) { /* no-op */ }

/** Recarrega tudo do banco */
async function resetDB() {
  await initDB();
  return DB;
}