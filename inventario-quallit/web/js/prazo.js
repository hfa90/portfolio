// Prazo dos inventários: anel de contagem regressiva, rótulos por urgência e ritmo estimado.
// Usado pelo painel e pelo app de campo. Os relógios se atualizam sozinhos (iniciarRelogios).

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const ESTADOS = {
  folga:    { rotulo: 'Tempo de sobra',        emoji: '🟢' },
  atencao:  { rotulo: 'Fique de olho',          emoji: '⏳' },
  urgente:  { rotulo: 'Reta final!',            emoji: '🔥' },
  vencido:  { rotulo: 'Prazo vencido',          emoji: '⏰' },
  futuro:   { rotulo: 'Ainda não começou',      emoji: '📅' },
  cumprido: { rotulo: 'Concluído no prazo',     emoji: '🏁' },
  atrasado: { rotulo: 'Concluído com atraso',   emoji: '🐢' },
};

export function fmtDuracao(ms, curto = false) {
  const neg = ms < 0; ms = Math.abs(ms);
  const s = Math.floor(ms / 1000), m = Math.floor(s / 60), h = Math.floor(m / 60), d = Math.floor(h / 24);
  let t;
  if (d >= 1) t = `${d}d ${h % 24}h`;
  else if (h >= 1) t = curto ? `${h}h${String(m % 60).padStart(2, '0')}` : `${h}h ${m % 60}min`;
  else if (m >= 1) t = `${m}min`;
  else t = `${s}s`;
  return neg ? `-${t}` : t;
}

export function estadoPrazo(c, agora = Date.now()) {
  if (!c?.prazo_em) return null;
  const ini = new Date(c.inicio_em || c.criado_em).getTime();
  const fim = new Date(c.prazo_em).getTime();
  const total = Math.max(60_000, fim - ini);
  if (c.status === 'finalizada') {
    const fin = new Date(c.finalizado_em || agora).getTime();
    const ok = fin <= fim;
    return { estado: ok ? 'cumprido' : 'atrasado', ini, fim, total, restante: fim - fin, usado: Math.min(1, (fin - ini) / total), sobra: fim - fin };
  }
  if (agora < ini) return { estado: 'futuro', ini, fim, total, restante: fim - agora, usado: 0, faltaComecar: ini - agora };
  const restante = fim - agora;
  const usado = Math.min(1, Math.max(0, (agora - ini) / total));
  const estado = restante < 0 ? 'vencido' : usado < 0.5 ? 'folga' : usado < 0.8 ? 'atencao' : 'urgente';
  return { estado, ini, fim, total, restante, usado };
}

function textoPrincipal(p) {
  if (p.estado === 'cumprido') return `com ${fmtDuracao(p.sobra)} de folga`;
  if (p.estado === 'atrasado') return `${fmtDuracao(-p.sobra)} depois do prazo`;
  if (p.estado === 'futuro') return `começa em ${fmtDuracao(p.faltaComecar)}`;
  if (p.estado === 'vencido') return `vencido há ${fmtDuracao(-p.restante)}`;
  return `${fmtDuracao(p.restante)} restantes`;
}
const horaFim = (p) => new Date(p.fim).toLocaleString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

// anel SVG: o arco é o TEMPO QUE RESTA (esvazia com o tempo)
export function anelPrazo(c, { tam = 56, progresso = null } = {}) {
  const p = estadoPrazo(c);
  if (!p) return '';
  const r = 42, circ = 2 * Math.PI * r;
  const resta = ['cumprido', 'atrasado'].includes(p.estado) ? 1 : p.estado === 'futuro' ? 1 : 1 - p.usado;
  const centro = ['cumprido'].includes(p.estado) ? '🏁' : p.estado === 'atrasado' ? '🐢' : p.estado === 'futuro' ? '📅'
    : p.estado === 'vencido' ? '⏰' : fmtDuracao(p.restante, true);
  return `<span class="relogio rel-${p.estado}" style="--tam:${tam}px" data-relogio data-ini="${p.ini}" data-fim="${p.fim}" data-status="${esc(c.status)}" data-finalizado="${esc(c.finalizado_em || '')}" title="${esc(ESTADOS[p.estado].rotulo)} · prazo ${esc(horaFim(p))}">
    <svg viewBox="0 0 100 100" aria-hidden="true">
      <circle cx="50" cy="50" r="${r}" class="rel-fundo"/>
      <circle cx="50" cy="50" r="${r}" class="rel-arco" stroke-dasharray="${circ.toFixed(1)}" stroke-dashoffset="${(circ * (1 - resta)).toFixed(1)}" data-circ="${circ.toFixed(1)}"/>
      ${progresso != null ? `<circle cx="50" cy="50" r="31" class="rel-prog-fundo"/><circle cx="50" cy="50" r="31" class="rel-prog" stroke-dasharray="${(2 * Math.PI * 31).toFixed(1)}" stroke-dashoffset="${(2 * Math.PI * 31 * (1 - progresso)).toFixed(1)}"/>` : ''}
    </svg>
    <b class="rel-num">${esc(centro)}</b>
  </span>`;
}

// ritmo: compara o progresso com o tempo usado e estima quando termina
export function ritmo(c, { encontradas, esperadas, primeiraLeitura }) {
  const p = estadoPrazo(c);
  if (!p || !['folga', 'atencao', 'urgente', 'vencido'].includes(p.estado) || !esperadas) return null;
  const prog = Math.min(1, encontradas / esperadas);
  const diff = prog - p.usado;
  let previsao = null;
  if (encontradas > 0 && primeiraLeitura && encontradas < esperadas) {
    const decorrido = Date.now() - new Date(primeiraLeitura).getTime();
    if (decorrido > 60_000) {
      const porMs = encontradas / decorrido;
      const fimPrev = Date.now() + (esperadas - encontradas) / porMs;
      previsao = { fim: fimPrev, noPrazo: fimPrev <= p.fim };
    }
  }
  return { prog, usado: p.usado, adiantado: previsao ? previsao.noPrazo : diff >= -0.02, diff, previsao };
}

// bloco completo: anel + textos + corrida "tempo x progresso"
export function relogioCompleto(c, info = null) {
  const p = estadoPrazo(c);
  if (!p) return '';
  const rt = info ? ritmo(c, info) : null;
  const e = ESTADOS[p.estado];
  return `<div class="prazo-bloco rel-${p.estado}" data-relogio-bloco>
    ${anelPrazo(c, { tam: 76, progresso: info && info.esperadas ? Math.min(1, info.encontradas / info.esperadas) : null })}
    <div class="prazo-txt">
      <span class="prazo-estado">${e.emoji} ${esc(e.rotulo)}</span>
      <strong class="prazo-principal" data-rel-texto>${esc(textoPrincipal(p))}</strong>
      <span class="prazo-fim">Prazo: ${esc(horaFim(p))}</span>
      ${rt ? `<div class="corrida">
        <div class="corrida-linha"><span>Tempo usado</span><span class="corrida-barra"><i class="c-tempo" style="width:${Math.round(rt.usado * 100)}%"></i></span><b>${Math.round(rt.usado * 100)}%</b></div>
        <div class="corrida-linha"><span>Conferido</span><span class="corrida-barra"><i class="c-prog" style="width:${Math.round(rt.prog * 100)}%"></i></span><b>${Math.round(rt.prog * 100)}%</b></div>
        <span class="corrida-msg ${rt.adiantado ? 'ok' : 'ruim'}">${rt.adiantado ? '🏃 No ritmo para terminar a tempo' : '⚠️ Abaixo do ritmo necessário'}${rt.previsao ? ` · neste ritmo termina às ${new Date(rt.previsao.fim).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : ''}</span>
      </div>` : ''}
    </div>
  </div>`;
}

// etiqueta curta para listas: "⏳ 3h 12min"
export function etiquetaPrazo(c) {
  const p = estadoPrazo(c);
  if (!p) return '';
  return `<span class="prazo-etq rel-${p.estado}" data-relogio-etq data-ini="${p.ini}" data-fim="${p.fim}" data-status="${esc(c.status)}" data-finalizado="${esc(c.finalizado_em || '')}">${ESTADOS[p.estado].emoji} <span data-rel-texto>${esc(textoPrincipal(p))}</span></span>`;
}

// atualiza todos os relógios visíveis a cada segundo
let timer = null;
export function iniciarRelogios() {
  if (timer) return;
  timer = setInterval(() => {
    const agora = Date.now();
    document.querySelectorAll('[data-relogio], [data-relogio-etq]').forEach((el) => {
      const c = { inicio_em: new Date(+el.dataset.ini).toISOString(), prazo_em: new Date(+el.dataset.fim).toISOString(), status: el.dataset.status, finalizado_em: el.dataset.finalizado || null };
      const p = estadoPrazo(c, agora);
      if (!p) return;
      const cls = `rel-${p.estado}`;
      [...el.classList].filter((k) => k.startsWith('rel-') && k !== cls && !['rel-num'].includes(k)).forEach((k) => el.classList.remove(k));
      el.classList.add(cls);
      if (el.hasAttribute('data-relogio')) {
        const arco = el.querySelector('.rel-arco');
        if (arco && !['cumprido', 'atrasado', 'futuro'].includes(p.estado)) arco.setAttribute('stroke-dashoffset', (arco.dataset.circ * p.usado).toFixed(1));
        const num = el.querySelector('.rel-num');
        if (num && ['folga', 'atencao', 'urgente'].includes(p.estado)) num.textContent = fmtDuracao(p.restante, true);
        if (num && p.estado === 'vencido') num.textContent = '⏰';
        const bloco = el.closest('[data-relogio-bloco]');
        if (bloco) {
          bloco.className = bloco.className.replace(/rel-\w+/g, '').trim() + ' ' + cls;
          const t = bloco.querySelector('[data-rel-texto]'); if (t) t.textContent = textoPrincipal(p);
          const est = bloco.querySelector('.prazo-estado'); if (est) est.textContent = `${ESTADOS[p.estado].emoji} ${ESTADOS[p.estado].rotulo}`;
        }
      } else {
        const t = el.querySelector('[data-rel-texto]'); if (t) t.textContent = textoPrincipal(p);
        el.firstChild.textContent = ESTADOS[p.estado].emoji + ' ';
      }
    });
  }, 1000);
}

// ---------------- agendamentos: descrição e prévia das próximas execuções (espelha o SQL)
const DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
export const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
export function descreverAgendamento(a) {
  const h = String(a.hora || '08:00').slice(0, 5);
  const prazo = a.prazo_horas >= 24 && a.prazo_horas % 24 === 0 ? `${a.prazo_horas / 24} dia(s)` : `${a.prazo_horas}h`;
  const quando = {
    unica: `Uma vez em ${new Date(a.data_inicio + 'T12:00:00').toLocaleDateString('pt-BR')} às ${h}`,
    diaria: `Todo dia às ${h}`,
    semanal: `Toda ${(a.dias_semana || []).slice().sort().map((d) => DIAS[d]).join(', ')} às ${h}`,
    mensal: a.dia_mes >= 31 ? `Todo último dia do mês às ${h}` : `Todo dia ${a.dia_mes} do mês às ${h}`,
  }[a.recorrencia];
  return `${quando} · prazo de ${prazo}`;
}
export function proximasExecucoes(a, n = 4, depois = new Date()) {
  const out = [];
  const [hh, mm] = String(a.hora || '08:00').split(':').map(Number);
  let d = new Date((a.data_inicio || new Date().toISOString().slice(0, 10)) + 'T00:00:00');
  const hoje = new Date(depois); hoje.setHours(0, 0, 0, 0);
  if (d < hoje) d = hoje;
  const fim = a.data_fim ? new Date(a.data_fim + 'T23:59:59') : null;
  for (let i = 0; i < 400 && out.length < n; i++) {
    if (fim && d > fim) break;
    const ultimo = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    const bate = a.recorrencia === 'diaria'
      || (a.recorrencia === 'unica' && d.toISOString().slice(0, 10) === new Date(a.data_inicio + 'T00:00:00').toISOString().slice(0, 10))
      || (a.recorrencia === 'semanal' && (a.dias_semana || []).includes(d.getDay()))
      || (a.recorrencia === 'mensal' && d.getDate() === Math.min(a.dia_mes || 1, ultimo));
    if (bate) {
      const t = new Date(d); t.setHours(hh, mm, 0, 0);
      if (t > new Date(depois.getTime() - 5 * 60_000)) out.push(t);
      if (a.recorrencia === 'unica') break;
    }
    d.setDate(d.getDate() + 1);
  }
  return out;
}
