// Inventário Quallit — sininho de avisos (menu lateral).
// Antes, ao entrar, apareciam até 2 avisos vermelhos + a janela "Desde o seu último acesso" + o "Resumo da semana".
// Agora tudo fica aqui: o número no sininho mostra quantos avisos há e a pessoa abre quando quiser.
import { $, MQ, cdCod, dataHora, ehAdmin, erroMsg, esc, sb, toast } from '../nucleo.js';
import { irMaquinas } from '../rotas.js';
import { modal } from './maquinas.js';
import { modalResumoSemana, resumoSemanaPendente } from './resumo-semana.js';

let admin = { inventarios: [], pendentes: 0, desde: null };   // vindo do banco (avisos_admin), só para o administrador

const contarLocais = () => {
  const L = MQ();
  return {
    atrasados: L.filter((m) => (m.alertas || []).includes('emprestimo_atrasado')).length,
    pecas: L.filter((m) => (m.alertas || []).includes('hw_reduzido')).length,
  };
};

function total() {
  const { atrasados, pecas } = contarLocais();
  return admin.inventarios.length + (admin.pendentes ? 1 : 0) + (atrasados ? 1 : 0) + (pecas ? 1 : 0) + (ehAdmin() && resumoSemanaPendente() ? 1 : 0);
}

// número no sininho (chamado ao entrar e a cada atualização ao vivo)
export function atualizarSininho() {
  const b = $('#badge-avisos'); if (!b) return;
  const n = total();
  b.hidden = !n; b.textContent = n;
  const t = $('#badge-avisos-topo');
  if (t) { t.hidden = !n; t.textContent = n; }
  $('#btn-avisos')?.classList.toggle('tem', !!n);
}

export async function carregarAvisos() {
  if (ehAdmin()) {
    const { data: av, error } = await sb.rpc('avisos_admin');
    if (!error && av) admin = { inventarios: av.inventarios || [], pendentes: av.patrimonio_pendentes || 0, desde: av.desde };
  }
  atualizarSininho();
}

export function abrirAvisos() {
  const { atrasados, pecas } = contarLocais();
  const invs = admin.inventarios;
  const pctDe = (c) => (c.total_esperadas ? Math.min(100, Math.round((100 * (c.total_encontradas || 0)) / c.total_esperadas)) : null);
  const nome = (e) => esc(String(e || '—').split('@')[0]);
  const item = (cls, titulo, sub, botao) => `<div class="banner ${cls}"><div><strong>${titulo}</strong><span>${sub}</span></div>${botao}</div>`;
  const resumoNovo = ehAdmin() && resumoSemanaPendente();
  const nada = !invs.length && !admin.pendentes && !atrasados && !pecas;
  modal(`
    <div class="modal-head"><h2>🔔 Avisos</h2></div>
    <div class="modal-body avisos">
      ${atrasados ? item('banner--bad', `${atrasados} empréstimo(s) com devolução atrasada`, 'Cobre a devolução ou ajuste a data prevista.', '<button class="btn btn--sm" data-ir="emprestimo_atrasado">Ver</button>') : ''}
      ${pecas ? item('banner--warn', `${pecas} máquina(s) com memória ou disco reduzido`, 'Uma peça pode ter sido retirada: confira.', '<button class="btn btn--sm" data-ir="hw_reduzido">Ver</button>') : ''}
      ${admin.pendentes ? item('banner--warn', `${admin.pendentes} pedido(s) de baixa/transferência aguardando você`, 'Aprove ou recuse em Patrimônio.', '<a class="btn btn--sm" href="#patrimonio" data-close>Abrir</a>') : ''}
      ${invs.length ? `<h3 class="avisos-tit">Inventários finalizados ${admin.desde ? `desde ${dataHora(admin.desde)}` : 'nos últimos 7 dias'}</h3>
        ${invs.map((c) => { const p = pctDe(c); return `
        <div class="card card-pad aviso-inv">
          <div class="aviso-linha">
            <div><strong>${esc(c.nome)}</strong> <span class="pill pill--cd">${esc(cdCod(c.cd_id))}</span>
              <div class="muted">${esc(c.setor || 'Todos os setores')} · finalizado por <b>${nome(c.finalizado_por)}</b> em ${dataHora(c.finalizado_em)}</div>
              <div class="muted">Criado por ${nome(c.criado_por)}${(c.leitores || []).length ? ` · bipado por ${c.leitores.map(nome).join(', ')}` : ''}</div></div>
            <div class="aviso-pct">${p != null ? `<b class="${p >= 98 ? 't-ok' : p < 90 ? 't-bad' : 't-warn'}">${p}%</b><div class="muted">${c.total_encontradas}/${c.total_esperadas}</div>` : ''}</div>
          </div>
          ${c.resumo ? `<details><summary class="muted">Resumo enviado no grupo${c.resumo_enviado_em ? ' · ' + dataHora(c.resumo_enviado_em) : ''}</summary><pre class="mono">${esc(c.resumo)}</pre></details>` : ''}
          <a class="btn btn--sm" href="#conferencia/${c.id}" data-close>Abrir inventário</a>
        </div>`; }).join('')}` : ''}
      ${nada ? '<div class="tudo-ok">✅<strong>Nenhum aviso</strong><span class="muted">Está tudo em dia.</span></div>' : ''}
      ${item('banner--info', `📨 Resumo da semana${resumoNovo ? ' <span class="pill pill--warn">novo</span>' : ''}`, 'O que precisa de atenção em cada CD, pronto para copiar no grupo, WhatsApp ou e-mail.', '<button class="btn btn--sm" id="av-resumo">Abrir</button>')}
    </div>
    <div class="modal-foot"><button class="btn" data-close>Fechar</button>${invs.length ? '<button class="btn btn--primary" id="av-visto">Marcar inventários como vistos</button>' : ''}</div>`, (dlg) => {
    dlg.querySelectorAll('[data-ir]').forEach((b) => (b.onclick = () => { dlg.close(); irMaquinas({ alerta: b.dataset.ir }); }));
    $('#av-resumo', dlg).onclick = () => { dlg.close(); modalResumoSemana().then(atualizarSininho); };
    $('#av-visto', dlg)?.addEventListener('click', async () => {
      const { error } = await sb.rpc('marcar_avisos_vistos');
      if (error) return toast(erroMsg(error), true);
      admin.inventarios = []; atualizarSininho();
      dlg.close(); toast('Inventários marcados como vistos');
    });
  });
}
