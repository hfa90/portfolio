/**
 * BolãoCopa26 — Lógica da Aplicação (versão Supabase)
 *
 * Todas as operações que antes chamavam saveDB() agora chamam
 * as funções async do db.js. O padrão é:
 *   1. Chama função DB (await xxxDB())
 *   2. Re-renderiza a UI com dados frescos do cache DB.*
 */

// ============================================================
// NAVEGAÇÃO
// ============================================================

const PAGE_TITLES = {
  home: 'Dashboard',
  palpitar: 'Fazer Palpites',
  ranking: 'Ranking Geral',
  grupos: 'Grupos da Copa',
  premiacao: 'Premiação',
  admin: 'Painel Administrativo',
  participantes: 'Participantes',
  resultados: 'Inserir Resultados',
};

function navigateTo(pageId) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const target = document.getElementById('page-' + pageId);
  if (target) target.classList.add('active');

  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.toggle('active', item.dataset.page === pageId);
  });

  document.getElementById('page-title').textContent = PAGE_TITLES[pageId] || pageId;
  document.getElementById('sidebar').classList.remove('open');

  const renders = {
    home: renderHome,
    palpitar: renderJogos,
    ranking: () => renderRanking('geral'),
    grupos: renderGrupos,
    premiacao: renderPremiacao,
    admin: renderAdmin,
    participantes: renderParticipantes,
    resultados: renderResultados,
  };

  if (renders[pageId]) renders[pageId]();
}

// ============================================================
// COUNTDOWN
// ============================================================

function updateCountdown() {
  const target = new Date('2026-06-11T16:00:00-04:00');
  const diff = target - new Date();

  if (diff <= 0) {
    ['cd-d', 'cd-h', 'cd-m', 'cd-s'].forEach(id => document.getElementById(id).textContent = '00');
    return;
  }

  const d = Math.floor(diff / 86400000);
  const h = Math.floor((diff % 86400000) / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);

  document.getElementById('cd-d').textContent = String(d).padStart(2, '0');
  document.getElementById('cd-h').textContent = String(h).padStart(2, '0');
  document.getElementById('cd-m').textContent = String(m).padStart(2, '0');
  document.getElementById('cd-s').textContent = String(s).padStart(2, '0');
}

// ============================================================
// HOME
// ============================================================

function renderHome() {
  updateCountdown();

  const totalPart = DB.participantes.length;
  const totalPremio = totalPart * (DB.config.valorPorPart || 30);
  const abertas = DB.jogos.filter(j => j.status !== 'Encerrado').length;

  document.getElementById('stat-total-part').textContent = totalPart;
  document.getElementById('stat-total-premio').textContent = 'R$' + totalPremio;
  document.getElementById('stat-jogos-abertos').textContent = abertas;

  renderTop5();
  renderProximos();
}

function renderTop5() {
  const sorted = [...DB.participantes].sort((a, b) => b.pontos - a.pontos).slice(0, 5);
  const medals = ['🥇', '🥈', '🥉'];
  const maxPts = sorted[0]?.pontos || 1;

  document.getElementById('home-top5').innerHTML = sorted.map((p, i) => {
    const pct = Math.round((p.pontos / maxPts) * 100);
    const medal = i < 3 ? medals[i] : `<span class="rank-num">${i + 1}</span>`;
    return `
      <div class="top5-item">
        <span class="top5-rank">${medal}</span>
        <div class="top5-avatar" style="background:${p.cor};color:${p.corT}">${p.avatar}</div>
        <div style="flex:1;min-width:0">
          <div class="top5-name">${p.nome}</div>
          <div class="pts-bar">
            <div class="pts-fill" style="width:${pct}%;background:linear-gradient(90deg,${p.corT}88,${p.corT})"></div>
          </div>
        </div>
        <span class="top5-pts" style="color:${p.corT}">${p.pontos}</span>
      </div>`;
  }).join('');
}

function renderProximos() {
  const proximos = DB.jogos.filter(j => j.status !== 'Encerrado').slice(0, 4);

  document.getElementById('home-proximos').innerHTML = proximos.map(j => {
    const isLive = j.status === 'Ao Vivo';
    const dateFmt = j.data.slice(8) + '/Jun';
    return `
      <div class="proximos-item">
        <div class="proximos-meta">
          <span>Grupo ${j.grupo} · ${dateFmt} ${j.hora}</span>
          ${isLive ? '<span class="live-badge"><span class="live-dot"></span>AO VIVO</span>' : ''}
        </div>
        <div class="score-row">
          <span class="team-flag">${j.casa.split(' ')[0]}</span>
          <span class="score-team">${j.casa.replace(/\S+ /, '')}</span>
          ${isLive
        ? `<div class="score-nums"><span>${j.golsCasa}</span><span class="score-sep-small">:</span><span>${j.golsFora}</span></div>`
        : `<span class="score-vs">VS</span>`}
          <span class="score-team right">${j.fora.replace(/\S+ /, '')}</span>
          <span class="team-flag">${j.fora.split(' ')[0]}</span>
        </div>
      </div>`;
  }).join('') || '<p style="padding:16px;color:var(--text3)">Nenhum jogo aberto no momento.</p>';
}

// ============================================================
// PALPITAR
// ============================================================

let jogoFilter = 'todos';

function renderJogos() {
  let jogos = DB.jogos;
  if (jogoFilter === 'abertos') jogos = jogos.filter(j => j.status !== 'Encerrado');
  if (jogoFilter === 'encerrados') jogos = jogos.filter(j => j.status === 'Encerrado');

  document.getElementById('jogos-grid').innerHTML = jogos.map(j => {
    const key = `j${j.id}`;
    const palpite = DB.palpites[key] || { c: '', f: '' };
    const isEnc = j.status === 'Encerrado';
    const isLive = j.status === 'Ao Vivo';
    const dateFmt = j.data.slice(8) + '/Jun';

    const palpiteSection = isEnc
      ? `<div class="encerrado-badge">Encerrado</div>`
      : `<div class="palpite-section">
           <div class="palpite-label">Seu palpite</div>
           <div class="palpite-inputs">
             <input class="palpite-input" type="number" min="0" max="20"
               id="p-${key}-c" value="${palpite.c}" placeholder="?">
             <span class="palpite-sep">×</span>
             <input class="palpite-input" type="number" min="0" max="20"
               id="p-${key}-f" value="${palpite.f}" placeholder="?">
           </div>
         </div>`;

    return `
      <div class="jogo-card ${isLive ? 'live' : ''}">
        <div class="jogo-meta">
          <div class="jogo-date">${dateFmt}</div>
          <div class="jogo-time ${isLive ? 'live-time' : ''}">${isLive ? '● ' : ''}${j.hora}</div>
          <span class="grupo-badge">${j.grupo}</span>
        </div>
        <div class="jogo-teams">
          <div class="jogo-team-row">
            <span class="team-flag">${j.casa.split(' ')[0]}</span>
            <span class="team-name">${j.casa.replace(/\S+ /, '')}</span>
            ${(isEnc || isLive) ? `<span class="team-score-num">${j.golsCasa}</span>` : ''}
          </div>
          <div class="jogo-team-row">
            <span class="team-flag">${j.fora.split(' ')[0]}</span>
            <span class="team-name">${j.fora.replace(/\S+ /, '')}</span>
            ${(isEnc || isLive) ? `<span class="team-score-num">${j.golsFora}</span>` : ''}
          </div>
          <div style="font-size:11px;color:var(--text3);margin-top:3px">${j.estadio}</div>
        </div>
        ${palpiteSection}
      </div>`;
  }).join('') || '<p style="color:var(--text3);padding:20px">Nenhum jogo encontrado.</p>';
}

async function salvarPalpites() {
  const novos = [];
  for (const j of DB.jogos) {
    if (j.status === 'Encerrado') continue;
    const key = `j${j.id}`;
    const ci = document.getElementById(`p-${key}-c`);
    const fi = document.getElementById(`p-${key}-f`);
    if (ci && fi && ci.value !== '' && fi.value !== '') {
      novos.push({ jogoId: j.id, golsCasa: parseInt(ci.value), golsFora: parseInt(fi.value) });
    }
  }

  if (!novos.length) { showToast('⚠️ Preencha ao menos um palpite!'); return; }

  try {
    setBtnLoading('btn-salvar-palpites', true);
    await salvarPalpitesDB(novos);

    const abertas = DB.jogos.filter(j => j.status !== 'Encerrado').length;
    const comPalpite = Object.keys(DB.palpites).filter(k =>
      DB.jogos.find(j => `j${j.id}` === k && j.status !== 'Encerrado')
    ).length;
    document.getElementById('badge-abertos').textContent = Math.max(0, abertas - comPalpite);
    showToast(`✅ ${novos.length} palpite(s) salvos!`);
  } catch (err) {
    showToast('❌ ' + err.message);
  } finally {
    setBtnLoading('btn-salvar-palpites', false);
  }
}

// ============================================================
// RANKING
// ============================================================

function renderRanking(mode) {
  const sorted = [...DB.participantes].sort((a, b) => b.pontos - a.pontos);
  const medals = ['🥇', '🥈', '🥉'];

  document.getElementById('ranking-tbody').innerHTML = sorted.map((p, i) => {
    const medal = i < 3 ? `<span class="rank-medal">${medals[i]}</span>` : `<span class="rank-num">${i + 1}</span>`;
    const corPts = i === 0 ? 'var(--gold2)' : i === 1 ? '#c0c0c0' : i === 2 ? '#cd7f32' : 'var(--text)';
    return `
      <tr>
        <td>${medal}</td>
        <td>
          <div class="participant-cell">
            <div class="p-avatar" style="background:${p.cor};color:${p.corT}">${p.avatar}</div>
            <div>
              <div class="p-name">${p.nome}</div>
              <div class="p-sub">${p.email}</div>
            </div>
          </div>
        </td>
        <td style="font-weight:700;color:${corPts}">${p.pontos}</td>
        <td>${p.palpites}</td>
        <td>${p.acertosExatos + p.acertosSaldo + p.acertosVencedor}</td>
        <td>${p.acertosExatos}</td>
        <td>${p.pctAcerto}%</td>
      </tr>`;
  }).join('');
}

// ============================================================
// GRUPOS
// ============================================================

function renderGrupos() {
  document.getElementById('grupos-grid').innerHTML = Object.entries(DB.grupos).map(([letra, times]) => {
    const rows = [...times]
      .sort((a, b) => b.pts - a.pts || (b.gp - b.gc) - (a.gp - a.gc) || b.gp - a.gp)
      .map((t, i) => {
        const saldo = t.gp - t.gc;
        const color = t.pts >= 4 ? 'var(--green-light)' : t.pts >= 1 ? 'var(--orange)' : 'var(--red)';
        const qualif = i < 2 ? 'border-left:3px solid var(--green2)' : '';
        return `
          <tr style="${qualif}">
            <td>${t.nome}</td>
            <td style="text-align:center">${t.pj}</td>
            <td style="text-align:center">${t.v}</td>
            <td style="text-align:center">${t.e}</td>
            <td style="text-align:center">${t.d}</td>
            <td style="text-align:center">${t.gp}</td>
            <td style="text-align:center">${t.gc}</td>
            <td style="text-align:center">${saldo >= 0 ? '+' : ''}${saldo}</td>
            <td style="text-align:center;font-weight:700;color:${color}">${t.pts}</td>
          </tr>`;
      }).join('');

    return `
      <div class="card">
        <div class="card-header"><h3>Grupo ${letra}</h3></div>
        <table class="data-table">
          <thead>
            <tr>
              <th>Seleção</th><th style="text-align:center">PJ</th>
              <th style="text-align:center">V</th><th style="text-align:center">E</th>
              <th style="text-align:center">D</th><th style="text-align:center">GP</th>
              <th style="text-align:center">GC</th><th style="text-align:center">SG</th>
              <th style="text-align:center">PTS</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
        <p style="font-size:10px;color:var(--text3);padding:6px 14px 8px">Borda verde = classificados</p>
      </div>`;
  }).join('');
}

// ============================================================
// PREMIAÇÃO
// ============================================================

function renderPremiacao() {
  const total = DB.participantes.length * (DB.config.valorPorPart || 30);
  const p1 = Math.round(total * 0.5);
  const p2 = Math.round(total * 0.3);
  const p3 = total - p1 - p2;

  document.getElementById('premio-resumo').textContent =
    `${DB.participantes.length} participantes × R$${DB.config.valorPorPart} = R$${total} total`;
  document.getElementById('premio-1').textContent = 'R$' + p1;
  document.getElementById('premio-2').textContent = 'R$' + p2;
  document.getElementById('premio-3').textContent = 'R$' + p3;

  const chipMap = { Pago: 'chip-green', Pendente: 'chip-orange', Atrasado: 'chip-red' };
  const labelMap = { Pago: '✓ Pago', Pendente: '⏳ Pendente', Atrasado: '✗ Atrasado' };

  document.getElementById('pagamento-tbody').innerHTML = DB.participantes.map(p => {
    const acao = p.pago !== 'Pago'
      ? `<button class="btn btn-sm btn-primary" onclick="confirmarPagamento('${p.id}')">Confirmar</button>`
      : '—';
    return `
      <tr>
        <td>${p.nome}</td>
        <td>R$${DB.config.valorPorPart}</td>
        <td><span class="chip ${chipMap[p.pago]}">${labelMap[p.pago]}</span></td>
        <td style="color:var(--text3)">${p.pago === 'Pago' ? 'Confirmado' : '—'}</td>
        <td>${acao}</td>
      </tr>`;
  }).join('');
}

// ============================================================
// ADMIN
// ============================================================

function renderAdmin() {
  const pagos = DB.participantes.filter(p => p.pago === 'Pago').length;
  const pendentes = DB.participantes.filter(p => p.pago !== 'Pago').length;
  const arrecad = pagos * (DB.config.valorPorPart || 30);
  const abertos = DB.jogos.filter(j => j.status !== 'Encerrado').length;

  document.getElementById('admin-arrecadado').textContent = 'R$' + arrecad;
  document.getElementById('admin-jogos').textContent = abertos;
  document.getElementById('admin-pendencias').textContent = pendentes;

  renderLog();

  document.getElementById('cfg-nome').value = DB.config.nome || '';
  document.getElementById('cfg-valor').value = DB.config.valorPorPart || 30;
  document.getElementById('cfg-pts-exato').value = DB.config.ptsExato || 10;
  document.getElementById('cfg-pts-saldo').value = DB.config.ptsSaldo || 7;
  document.getElementById('cfg-pts-venc').value = DB.config.ptsVencedor || 4;
  document.getElementById('cfg-prazo').value = DB.config.prazoMin || 15;
}

function renderLog() {
  const el = document.getElementById('activity-log');
  if (!el) return;
  el.innerHTML = DB.log.slice(0, 8).map(e => `
    <div class="activity-item">
      <div class="activity-dot"></div>
      <div class="activity-msg">${e.msg}</div>
      <div class="activity-time">${e.time}</div>
    </div>`).join('');
}

async function salvarConfig() {
  const cfg = {
    nome: document.getElementById('cfg-nome').value.trim(),
    valorPorPart: parseFloat(document.getElementById('cfg-valor').value) || 30,
    ptsExato: parseInt(document.getElementById('cfg-pts-exato').value) || 10,
    ptsSaldo: parseInt(document.getElementById('cfg-pts-saldo').value) || 7,
    ptsVencedor: parseInt(document.getElementById('cfg-pts-venc').value) || 4,
    prazoMin: parseInt(document.getElementById('cfg-prazo').value) || 15,
  };
  try {
    setBtnLoading('btn-salvar-cfg', true);
    await saveConfig(cfg);
    showToast('💾 Configurações salvas!');
    renderAdmin();
  } catch (err) {
    showToast('❌ ' + err.message);
  } finally {
    setBtnLoading('btn-salvar-cfg', false);
  }
}

async function recalcularPontuacao() {
  try {
    setBtnLoading('btn-recalcular', true);
    const total = await recalcularPontuacaoDB();
    showToast(`🔄 Pontuação recalculada! ${total} palpites processados.`);
    renderAdmin();
  } catch (err) {
    showToast('❌ ' + err.message);
  } finally {
    setBtnLoading('btn-recalcular', false);
  }
}

// ============================================================
// PARTICIPANTES
// ============================================================

function renderParticipantes() {
  const chipMap = { Pago: 'chip-green', Pendente: 'chip-orange', Atrasado: 'chip-red' };
  const labelMap = { Pago: '✓ Pago', Pendente: '⏳ Pendente', Atrasado: '✗ Atrasado' };

  document.getElementById('participantes-tbody').innerHTML = DB.participantes.map(p => `
    <tr>
      <td>
        <div class="participant-cell">
          <div class="p-avatar" style="background:${p.cor};color:${p.corT}">${p.avatar}</div>
          <div>
            <div class="p-name">${p.nome}</div>
            <div class="p-sub">${p.whats}</div>
          </div>
        </div>
      </td>
      <td style="color:var(--text3);font-size:12px">${p.email}</td>
      <td style="font-weight:700">${p.pontos}</td>
      <td>${p.palpites}</td>
      <td><span class="chip ${chipMap[p.pago]}">${labelMap[p.pago]}</span></td>
      <td>
        <div style="display:flex;gap:5px">
          <button class="btn btn-sm btn-ghost" onclick="confirmarPagamento('${p.id}')">💳</button>
          <button class="btn btn-sm btn-danger" onclick="removerParticipante('${p.id}')">✕</button>
        </div>
      </td>
    </tr>`).join('');
}

async function addParticipante() {
  const nome = document.getElementById('inp-nome').value.trim();
  if (!nome) { showToast('⚠️ Insira o nome do participante!'); return; }

  const initials = nome.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  const palettes = [
    ['rgba(88,166,255,.2)', '#58a6ff'],
    ['rgba(34,136,63,.2)', '#4ade80'],
    ['rgba(210,153,34,.2)', '#d29922'],
    ['rgba(201,162,39,.2)', '#e8bc2e'],
    ['rgba(248,81,73,.15)', '#f85149'],
    ['rgba(192,192,192,.2)', '#c0c0c0'],
  ];
  const [cor, corT] = palettes[DB.participantes.length % palettes.length];

  try {
    setBtnLoading('btn-add-participante', true);
    await addParticipanteDB({
      nome,
      email: document.getElementById('inp-email').value.trim(),
      whats: document.getElementById('inp-whats').value.trim(),
      pago: document.getElementById('inp-pag').value,
      avatar: initials,
      cor,
      corT,
    });

    closeModal();
    showToast(`✅ ${nome} adicionado ao bolão!`);
    document.getElementById('stat-total-part').textContent = DB.participantes.length;
    document.getElementById('stat-total-premio').textContent =
      'R$' + DB.participantes.length * DB.config.valorPorPart;

    ['inp-nome', 'inp-email', 'inp-whats'].forEach(id => document.getElementById(id).value = '');

    if (document.getElementById('page-participantes').classList.contains('active')) {
      renderParticipantes();
    }
  } catch (err) {
    showToast('❌ ' + err.message);
  } finally {
    setBtnLoading('btn-add-participante', false);
  }
}

async function removerParticipante(id) {
  const p = DB.participantes.find(x => x.id === id);
  if (!confirm(`Remover "${p?.nome}" do bolão? Esta ação não pode ser desfeita.`)) return;

  try {
    await removerParticipanteDB(id);
    showToast(`🗑️ ${p?.nome} removido.`);
    renderParticipantes();
  } catch (err) {
    showToast('❌ ' + err.message);
  }
}

async function confirmarPagamento(id) {
  const p = DB.participantes.find(x => x.id === id);
  try {
    await confirmarPagamentoDB(id);
    showToast(`✅ Pagamento de ${p?.nome} confirmado!`);
    if (document.getElementById('page-participantes').classList.contains('active')) renderParticipantes();
    if (document.getElementById('page-premiacao').classList.contains('active')) renderPremiacao();
  } catch (err) {
    showToast('❌ ' + err.message);
  }
}

// ============================================================
// RESULTADOS
// ============================================================

function renderResultados() {
  const chipMap = {
    'Encerrado': 'chip-gray',
    'Ao Vivo': 'chip-red',
    'Aberto': 'chip-blue',
    'Prorrogação': 'chip-orange',
    'Pênaltis': 'chip-orange',
  };

  document.getElementById('resultados-tbody').innerHTML = DB.jogos.map(j => `
    <tr>
      <td><strong>${j.casa}</strong> × <strong>${j.fora}</strong></td>
      <td><span class="grupo-badge" style="font-size:10px">${j.grupo}</span></td>
      <td style="color:var(--text3);font-size:12px">${j.data} ${j.hora}</td>
      <td>
        ${j.golsCasa !== null
      ? `<span style="font-size:18px;font-weight:800">${j.golsCasa} — ${j.golsFora}</span>`
      : '<span style="color:var(--text3)">—</span>'}
      </td>
      <td><span class="chip ${chipMap[j.status] || 'chip-gray'}">${j.status}</span></td>
      <td>
        <button class="btn btn-sm btn-primary" onclick="editarResultado('${j.id}')">
          ${j.golsCasa !== null ? '✏️ Editar' : '+ Resultado'}
        </button>
      </td>
    </tr>`).join('');
}

function editarResultado(id) {
  const jogo = DB.jogos.find(j => j.id === id);
  if (!jogo) return;

  populateResultadoModal();
  document.getElementById('res-jogo-sel').value = id;
  document.getElementById('res-casa').value = jogo.golsCasa ?? 0;
  document.getElementById('res-fora').value = jogo.golsFora ?? 0;
  document.getElementById('res-status').value = jogo.status;

  openModal('resultado');
}

async function salvarResultado() {
  const jogoId = document.getElementById('res-jogo-sel').value;
  const golsCasa = parseInt(document.getElementById('res-casa').value);
  const golsFora = parseInt(document.getElementById('res-fora').value);
  const status = document.getElementById('res-status').value;

  if (!jogoId) { showToast('⚠️ Selecione um jogo!'); return; }

  try {
    setBtnLoading('btn-salvar-resultado', true);
    await salvarResultadoDB({ jogoId, golsCasa, golsFora, status });
    closeModal();
    showToast('✅ Resultado salvo! Pontuação atualizada.');
    if (document.getElementById('page-resultados').classList.contains('active')) renderResultados();
  } catch (err) {
    showToast('❌ ' + err.message);
  } finally {
    setBtnLoading('btn-salvar-resultado', false);
  }
}

async function addJogo() {
  const casaRaw = document.getElementById('jogo-casa').value;
  const foraRaw = document.getElementById('jogo-fora').value;
  const data = document.getElementById('jogo-data').value;

  if (!data) { showToast('⚠️ Selecione uma data!'); return; }
  if (casaRaw === foraRaw) { showToast('⚠️ Os dois times precisam ser diferentes!'); return; }

  // Remove o emoji (primeiro token) para passar só o nome
  const casaNome = casaRaw.replace(/\S+ /, '').trim();
  const foraNome = foraRaw.replace(/\S+ /, '').trim();

  try {
    setBtnLoading('btn-add-jogo', true);
    await addJogoDB({
      casaNome,
      foraNome,
      data,
      hora: document.getElementById('jogo-hora').value,
      grupo: document.getElementById('jogo-grupo').value,
      estadio: document.getElementById('jogo-estadio').value,
    });
    closeModal();
    showToast(`✅ Jogo ${casaNome} × ${foraNome} adicionado!`);
    document.getElementById('jogo-estadio').value = '';
    document.getElementById('jogo-data').value = '';
  } catch (err) {
    showToast('❌ ' + err.message);
  } finally {
    setBtnLoading('btn-add-jogo', false);
  }
}

// ============================================================
// MODAL
// ============================================================

function openModal(id) {
  const overlay = document.getElementById('modal-overlay');
  overlay.classList.add('open');

  document.querySelectorAll('.modal').forEach(m => m.classList.remove('open'));
  const modal = document.getElementById('modal-' + id);
  if (modal) {
    modal.style.display = 'block';
    setTimeout(() => modal.classList.add('open'), 10);
  }

  if (id === 'resultado') populateResultadoModal();
  if (id === 'pagamento') populatePagamentoModal();
}

function closeModal() {
  document.getElementById('modal-overlay').classList.remove('open');
  document.querySelectorAll('.modal').forEach(m => {
    m.classList.remove('open');
    setTimeout(() => m.style.display = 'none', 200);
  });
}

function populateResultadoModal() {
  document.getElementById('res-jogo-sel').innerHTML = DB.jogos.map(j =>
    `<option value="${j.id}">${j.casa.replace(/\S+ /, '')} × ${j.fora.replace(/\S+ /, '')} (${j.grupo})</option>`
  ).join('');
}

function populatePagamentoModal() {
  const pending = DB.participantes.filter(p => p.pago !== 'Pago');
  document.getElementById('pag-part').innerHTML = pending.length
    ? pending.map(p => `<option value="${p.id}">${p.nome}</option>`).join('')
    : `<option disabled>Todos já pagaram!</option>`;
}

async function registrarPagamento() {
  const partId = document.getElementById('pag-part').value;
  const p = DB.participantes.find(x => x.id === partId);
  if (!p) { showToast('⚠️ Selecione um participante!'); return; }

  try {
    setBtnLoading('btn-confirmar-pag', true);
    await registrarPagamentoDB({
      participanteId: partId,
      valorPago: parseFloat(document.getElementById('pag-valor').value) || DB.config.valorPorPart,
      forma: document.getElementById('pag-forma').value,
      observacao: document.getElementById('pag-obs').value,
    });
    closeModal();
    showToast(`✅ Pagamento de ${p.nome} registrado!`);
  } catch (err) {
    showToast('❌ ' + err.message);
  } finally {
    setBtnLoading('btn-confirmar-pag', false);
  }
}

// ============================================================
// TOAST
// ============================================================

let toastTimer = null;

function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 3500);
}

// ============================================================
// LOADING STATE NOS BOTÕES
// ============================================================

function setBtnLoading(id, loading) {
  const btn = document.getElementById(id);
  if (!btn) return;
  btn.disabled = loading;
  btn._origText = btn._origText || btn.textContent;
  btn.textContent = loading ? '⏳ Aguarde...' : btn._origText;
}

// ============================================================
// BUSCA GLOBAL
// ============================================================

let searchTimer = null;
document.getElementById('global-search').addEventListener('input', function () {
  clearTimeout(searchTimer);
  const q = this.value.trim();
  if (!q) return;
  searchTimer = setTimeout(async () => {
    try {
      const found = await buscarParticipantes(q);
      if (found.length) {
        showToast(`🔍 ${found.length} resultado(s): ${found.map(p => p.nome).join(', ')}`);
      } else {
        showToast('🔍 Nenhum participante encontrado.');
      }
    } catch (_) {
      const found = DB.participantes.filter(p =>
        p.nome.toLowerCase().includes(q.toLowerCase()) ||
        p.email.toLowerCase().includes(q.toLowerCase())
      );
      showToast(found.length
        ? `🔍 ${found.length} resultado(s): ${found.map(p => p.nome).join(', ')}`
        : '🔍 Nenhum participante encontrado.'
      );
    }
  }, 400);
});

// ============================================================
// EVENTS
// ============================================================

// Navegação
document.querySelectorAll('.nav-item[data-page]').forEach(btn => {
  btn.addEventListener('click', () => navigateTo(btn.dataset.page));
});

// Tabs de jogos
document.getElementById('tabs-jogos').addEventListener('click', e => {
  const tab = e.target.closest('.tab');
  if (!tab) return;
  document.querySelectorAll('#tabs-jogos .tab').forEach(t => t.classList.remove('active'));
  tab.classList.add('active');
  jogoFilter = tab.dataset.filter;
  renderJogos();
});

// Tabs de ranking
document.getElementById('tabs-ranking').addEventListener('click', e => {
  const tab = e.target.closest('.tab');
  if (!tab) return;
  document.querySelectorAll('#tabs-ranking .tab').forEach(t => t.classList.remove('active'));
  tab.classList.add('active');
  renderRanking(tab.dataset.mode);
});

// Fechar modal
document.getElementById('modal-overlay').addEventListener('click', e => {
  if (e.target === document.getElementById('modal-overlay')) closeModal();
});
document.querySelectorAll('[data-close]').forEach(btn => btn.addEventListener('click', closeModal));

// Botões de ação
document.getElementById('btn-salvar-palpites').addEventListener('click', salvarPalpites);
document.getElementById('btn-add-participante').addEventListener('click', addParticipante);
document.getElementById('btn-add-jogo').addEventListener('click', addJogo);
document.getElementById('btn-salvar-resultado').addEventListener('click', salvarResultado);
document.getElementById('btn-confirmar-pag').addEventListener('click', registrarPagamento);
document.getElementById('btn-salvar-cfg').addEventListener('click', salvarConfig);
document.getElementById('btn-recalcular').addEventListener('click', recalcularPontuacao);

document.getElementById('btn-reset').addEventListener('click', async () => {
  if (!confirm('⚠️ Recarregar todos os dados do banco? A tela será atualizada.')) return;
  await initDB();
  renderHome();
  showToast('🔄 Dados recarregados do banco!');
});

// Menu mobile
document.getElementById('menu-toggle').addEventListener('click', () => {
  document.getElementById('sidebar').classList.toggle('open');
});

// ============================================================
// INICIALIZAÇÃO
// ============================================================

setInterval(updateCountdown, 1000);

// Aguarda o DOM + SDK carregados, então inicia
document.addEventListener('DOMContentLoaded', async () => {
  await initDB();       // Carrega tudo do Supabase
  initRealtime();       // Liga o canal realtime
  renderHome();         // Renderiza dashboard inicial
});