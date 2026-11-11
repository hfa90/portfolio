// Inventário Quallit — tela: usuarios (gerado a partir do app.js; imports e exports conferidos automaticamente)
import { confirmar } from '../dialogos.js';
import { $, $$, cdCod, cdNome, cdsAtivos, dataHora, debounce, erroMsg, esc, pill, rel, sb, state, toast, up, titulo } from '../nucleo.js';
import { renderSidebar } from '../rotas.js';
import { baseIndex } from '../telas/etiquetas.js';
import { campo, modal, opts } from '../telas/maquinas.js';
import { relatorioCD } from '../telas/relatorios.js';

/* =====================================================================
   USUÁRIOS E CDs (somente administrador)
   ===================================================================== */
export async function chamarAdmin(body) {
  const { data: d, error } = await sb.functions.invoke('admin-usuarios', { body });
  if (error) {
    let msg = error.message;
    const status = error.context?.status;
    try { const j = await error.context.json(); if (j?.error) msg = j.error; } catch { /* sem corpo */ }
    const e = new Error(msg);
    if (status === 404 || /Failed to send|FunctionsFetchError|FunctionsRelayError/i.test(`${error.name} ${error.message}`)) e.semFuncao = true;
    throw e;
  }
  if (d?.error) throw new Error(d.error);
  return d;
}
export function gerarSenha() {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const v = crypto.getRandomValues(new Uint32Array(10));
  let s = [...v].map((n) => abc[n % abc.length]).join('');
  if (!/\d/.test(s)) s = s.slice(0, 9) + '7';
  return s;
}
export const PAPEL = { admin: 'Administrador', field: 'Field' };
export const urlPainel = () => baseIndex();

export async function renderUsuarios(aba = 'usuarios') {
  const el = $('#view-usuarios');
  el.innerHTML = `
    <div class="view-head">
      ${titulo('Usuários e CDs', '', `Crie acessos para os Fields de cada CD e para outros administradores. Fields enxergam apenas o próprio CD.`)}
      <div class="actions" id="us-acoes"></div>
    </div>
    <div class="tabs tabs--page"><a class="tab ${aba === 'usuarios' ? 'active' : ''}" href="#usuarios/usuarios">Usuários</a><a class="tab ${aba === 'cds' ? 'active' : ''}" href="#usuarios/cds">CDs</a></div>
    <div id="us-corpo"><div class="skeleton">Carregando…</div></div>`;
  if (aba === 'cds') return renderCDsAdmin();
  return renderListaUsuarios();
}

export async function renderListaUsuarios(recarregar = true) {
  const corpo = $('#us-corpo');
  $('#us-acoes').innerHTML = '<button class="btn btn--primary" id="btn-novo-us">+ Novo usuário</button>';
  $('#btn-novo-us').onclick = () => modalUsuario();
  if (recarregar || !state.usuarios) {
    try {
      state.usuarios = (await chamarAdmin({ acao: 'listar' })).usuarios;
      state.usuariosSemFuncao = false;
    } catch (e) {
      if (!e.semFuncao) { corpo.innerHTML = `<div class="card card-pad erro">${esc(e.message)}</div>`; return; }
      state.usuariosSemFuncao = true;
      const { data: perfis } = await sb.from('perfis').select('*').order('nome');
      state.usuarios = (perfis || []).map((p) => ({ id: p.user_id, nome: p.nome, email: p.email, papel: p.papel, cd_id: p.cd_id, ativo: p.ativo }));
    }
  }
  const f = state.usFiltro || (state.usFiltro = { q: '', papel: '', cd: '', status: '' });
  if (state.cdAtual && !f.cdTocado) f.cd = state.cdAtual;
  corpo.innerHTML = `
    ${state.usuariosSemFuncao ? `<div class="banner banner--bad" style="margin-bottom:14px"><div><strong>Falta publicar a função de usuários no Supabase</strong>
      <span>Sem ela, a lista abaixo é só leitura. No Supabase: <b>Edge Functions → Deploy a new function → Via Editor</b>, nome <code>admin-usuarios</code>, cole o arquivo <code>supabase/functions/admin-usuarios/index.ts</code> e clique em <b>Deploy</b>.</span></div></div>` : ''}
    <div class="card">
      <div class="toolbar">
        <div class="search"><input id="us-q" type="search" placeholder="Buscar nome ou e-mail…" value="${esc(f.q)}"></div>
        <select id="us-papel">${opts([['', 'Todos os perfis'], ['admin', 'Administradores'], ['field', 'Fields']], f.papel)}</select>
        <select id="us-cd">${opts([['', 'Todos os CDs'], ...state.cds.map((c) => [c.id, `${c.codigo} · ${c.nome}`])], f.cd)}</select>
        <select id="us-status">${opts([['', 'Ativos e inativos'], ['ativo', 'Ativos'], ['inativo', 'Desativados']], f.status)}</select>
        <span class="count" id="us-count"></span>
      </div>
      <div class="table-wrap" style="max-height:none"><table><thead><tr><th>Nome</th><th>Perfil</th><th>CD</th><th>Status</th><th>Último acesso</th><th></th></tr></thead><tbody id="us-tbody"></tbody></table></div>
    </div>`;
  const desenhar = () => {
    const termos = up(f.q).split(/\s+/).filter(Boolean);
    const lista = state.usuarios
      .filter((u) => !f.papel || u.papel === f.papel)
      .filter((u) => !f.cd || u.cd_id === f.cd)
      .filter((u) => !f.status || (f.status === 'ativo' ? u.ativo : !u.ativo))
      .filter((u) => termos.every((t) => up(`${u.nome} ${u.email}`).includes(t)))
      .sort((a, b) => (a.papel === b.papel ? 0 : a.papel === 'admin' ? -1 : 1) || String(a.nome || a.email).localeCompare(String(b.nome || b.email), 'pt-BR'));
    $('#us-count').textContent = `${lista.length} usuário(s)`;
    const ro = state.usuariosSemFuncao;
    $('#us-tbody').innerHTML = lista.length ? lista.map((u) => `<tr data-us="${u.id}">
      <td><strong>${esc(u.nome || '—')}</strong>${u.id === state.user.id ? ' <span class="pill">você</span>' : ''}<span class="sub">${esc(u.email || '')}</span></td>
      <td>${u.sem_perfil ? pill('sem acesso', 'warn') : pill(PAPEL[u.papel] || u.papel, u.papel === 'admin' ? 'brand' : '')}</td>
      <td>${u.papel === 'admin' ? '<span class="muted">Todos</span>' : `<span class="pill pill--cd">${esc(cdCod(u.cd_id))}</span> ${esc(cdNome(u.cd_id))}`}</td>
      <td>${u.ativo ? pill('Ativo', 'ok') : pill('Desativado', 'bad')}</td>
      <td>${u.ultimo_acesso ? `${rel(u.ultimo_acesso)}<span class="sub">${dataHora(u.ultimo_acesso)}</span>` : '<span class="muted">nunca</span>'}</td>
      <td class="acoes">${ro ? '' : `<button class="btn btn--sm" data-ac="editar">${u.sem_perfil ? 'Liberar acesso' : 'Editar'}</button>
        <button class="btn btn--sm btn--ghost" data-ac="senha">Senha</button>
        ${u.id !== state.user.id ? '<button class="btn btn--sm btn--ghost btn--txt-bad" data-ac="excluir">Excluir</button>' : ''}`}</td></tr>`).join('')
      : '<tr><td colspan="6" class="empty">Nenhum usuário com esses filtros.</td></tr>';
  };
  $('#us-q').oninput = debounce((e) => { f.q = e.target.value; desenhar(); }, 120);
  $('#us-papel').onchange = (e) => { f.papel = e.target.value; desenhar(); };
  $('#us-cd').onchange = (e) => { f.cd = e.target.value; f.cdTocado = true; desenhar(); };
  $('#us-status').onchange = (e) => { f.status = e.target.value; desenhar(); };
  $('#us-tbody').onclick = async (e) => {
    const b = e.target.closest('[data-ac]'); if (!b) return;
    const u = state.usuarios.find((x) => x.id === b.closest('tr').dataset.us);
    if (b.dataset.ac === 'editar') modalUsuario(u);
    if (b.dataset.ac === 'senha') modalSenha(u);
    if (b.dataset.ac === 'excluir') {
      if (!(await confirmar(`O login de ${u.nome || u.email} deixa de existir. Para bloquear só por um tempo, use Editar → Desativar.`, { titulo: 'Excluir o usuário?', ok: 'Excluir', perigo: true }))) return;
      try { await chamarAdmin({ acao: 'excluir', id: u.id }); toast('Usuário excluído'); renderListaUsuarios(); } catch (er) { toast(er.message, true); }
    }
  };
  desenhar();
}

export function modalUsuario(u = null) {
  const novo = !u;
  let papel = u?.papel || 'field';
  const senha = novo ? gerarSenha() : '';
  modal(`
    <form id="us-form" autocomplete="off">
      <div class="modal-head"><h2>${novo ? 'Novo usuário' : u.sem_perfil ? 'Liberar acesso' : 'Editar usuário'}</h2></div>
      <div class="modal-body">
        <div class="papeis">
          <label class="papel"><input type="radio" name="papel" value="field" ${papel === 'field' ? 'checked' : ''}><span><b>Field</b><small>Trabalha em um CD: máquinas, inventários, empréstimos e etiquetas só daquele CD.</small></span></label>
          <label class="papel"><input type="radio" name="papel" value="admin" ${papel === 'admin' ? 'checked' : ''}><span><b>Administrador</b><small>Todos os CDs, usuários, exclusões e relatórios gerais.</small></span></label>
        </div>
        <div class="form-grid">
          ${campo('nome', 'Nome *', u?.nome || '', 'text', 'required')}
          ${campo('email', 'E-mail (login) *', u?.email || '', 'email', 'required autocomplete="off"')}
          <label class="full" id="us-cd-wrap">CD *<select name="cd_id">${opts([['', 'Selecione o CD'], ...cdsAtivos().map((c) => [c.id, `${c.codigo} · ${c.nome}`])], u?.cd_id || state.cdAtual || '')}</select></label>
          ${novo ? `<label class="full">Senha inicial *<span class="input-row"><input name="senha" id="us-senha" class="mono" value="${senha}" minlength="8" required><button type="button" class="btn" id="us-gerar">Gerar</button></span><small class="muted">Mínimo 8 caracteres. Você verá a senha para enviar ao usuário.</small></label>`
               : `<label class="check full"><input type="checkbox" name="ativo" ${u.ativo || u.sem_perfil ? 'checked' : ''}> Acesso ativo (desmarque para bloquear o login sem excluir)</label>`}
        </div>
        <p class="erro" id="us-erro"></p>
      </div>
      <div class="modal-foot"><button type="button" class="btn" data-close>Cancelar</button><button class="btn btn--primary" id="us-salvar">${novo ? 'Criar usuário' : 'Salvar'}</button></div>
    </form>`, (dlg) => {
    const sincPapel = () => { papel = $('#us-form [name=papel]:checked').value; $('#us-cd-wrap').hidden = papel === 'admin'; };
    $$('#us-form [name=papel]').forEach((r) => (r.onchange = sincPapel));
    sincPapel();
    $('#us-gerar')?.addEventListener('click', () => { $('#us-senha').value = gerarSenha(); });
    $('#us-form').onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const body = {
        acao: novo ? 'criar' : 'atualizar',
        id: u?.id,
        nome: String(fd.get('nome')).trim(),
        email: String(fd.get('email')).trim(),
        papel,
        cd_id: papel === 'field' ? fd.get('cd_id') || null : null,
      };
      if (papel === 'field' && !body.cd_id) return ($('#us-erro').textContent = 'Escolha o CD do Field.');
      if (novo) body.senha = String(fd.get('senha'));
      else body.ativo = !!fd.get('ativo');
      $('#us-salvar').disabled = true;
      try {
        await chamarAdmin(body);
        dlg.close();
        if (novo) mostrarCredenciais(body.nome, body.email, body.senha, 'Usuário criado');
        else toast('Usuário atualizado');
        renderListaUsuarios();
      } catch (er) {
        $('#us-erro').textContent = er.message;
        $('#us-salvar').disabled = false;
      }
    };
  });
}

export function mostrarCredenciais(nome, email, senha, titulo) {
  const texto = `Olá, ${nome}! Seu acesso ao Inventário Quallit:\n${urlPainel()}\nLogin: ${email}\nSenha: ${senha}`;
  modal(`
    <div class="modal-head"><h2>${esc(titulo)}</h2><p class="muted" style="margin:4px 0 0">Envie estes dados ao usuário. A senha não fica visível depois.</p></div>
    <div class="modal-body"><div class="token-box" style="white-space:pre-line">${esc(texto)}</div></div>
    <div class="modal-foot"><a class="btn" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(texto)}">WhatsApp</a>
      <button class="btn" id="cred-copiar">Copiar</button><button class="btn btn--primary" data-close>Concluir</button></div>`,
  () => { $('#cred-copiar').onclick = () => navigator.clipboard.writeText(texto).then(() => toast('Copiado')); });
}

export function modalSenha(u) {
  modal(`
    <form id="pw-form">
      <div class="modal-head"><h2>Alterar senha</h2><p class="muted" style="margin:4px 0 0">${esc(u.nome || '')} · ${esc(u.email)}</p></div>
      <div class="modal-body">
        <label>Nova senha<span class="input-row"><input name="senha" id="pw-senha" class="mono" minlength="8" required value="${gerarSenha()}"><button type="button" class="btn" id="pw-gerar">Gerar</button></span></label>
        <p class="erro" id="pw-erro"></p>
      </div>
      <div class="modal-foot"><button type="button" class="btn" data-close>Cancelar</button><button class="btn btn--primary" id="pw-salvar">Alterar senha</button></div>
    </form>`, (dlg) => {
    $('#pw-gerar').onclick = () => { $('#pw-senha').value = gerarSenha(); };
    $('#pw-form').onsubmit = async (e) => {
      e.preventDefault();
      const senha = $('#pw-senha').value;
      $('#pw-salvar').disabled = true;
      try {
        await chamarAdmin({ acao: 'senha', id: u.id, senha });
        dlg.close();
        mostrarCredenciais(u.nome || u.email, u.email, senha, 'Senha alterada');
      } catch (er) { $('#pw-erro').textContent = er.message; $('#pw-salvar').disabled = false; }
    };
  });
}

export async function recarregarCDs() {
  const { data: d } = await sb.from('cds').select('*').order('codigo');
  state.cds = d || [];
  if (state.cdAtual && !state.cds.some((c) => c.id === state.cdAtual)) state.cdAtual = '';
  renderSidebar();
}

export async function renderCDsAdmin() {
  $('#us-acoes').innerHTML = '<button class="btn btn--primary" id="btn-novo-cd">+ Novo CD</button>';
  $('#btn-novo-cd').onclick = () => modalCD();
  const { data: perfis } = await sb.from('perfis').select('cd_id, papel, ativo');
  const fields = (id) => (perfis || []).filter((p) => p.cd_id === id && p.papel === 'field' && p.ativo).length;
  const maqs = (id) => state.maquinas.filter((m) => m.cd_id === id && m.status !== 'descartado').length;
  $('#us-corpo').innerHTML = `<div class="card"><div class="table-wrap" style="max-height:none"><table>
    <thead><tr><th>Código</th><th>Nome</th><th>Cidade / UF</th><th class="num">Máquinas</th><th class="num">Fields ativos</th><th>Status</th><th></th></tr></thead>
    <tbody>${state.cds.map((c) => `<tr data-cd="${c.id}">
      <td><span class="pill pill--cd">${esc(c.codigo)}</span></td><td><strong>${esc(c.nome)}</strong></td>
      <td>${esc([c.cidade, c.uf].filter(Boolean).join(' / ') || '—')}</td>
      <td class="num">${maqs(c.id)}</td><td class="num">${fields(c.id)}</td>
      <td>${c.ativo ? pill('Ativo', 'ok') : pill('Inativo', 'bad')}</td>
      <td class="acoes"><button class="btn btn--sm" data-ac="editar">Editar</button> <button class="btn btn--sm btn--ghost" data-ac="relatorio">Relatório</button> <button class="btn btn--sm btn--ghost btn--txt-bad" data-ac="excluir">Excluir</button></td></tr>`).join('')}</tbody>
  </table></div></div>
  <p class="muted" style="font-size:12.5px">Um CD com máquinas ou usuários não pode ser excluído — desative-o em <i>Editar</i>.</p>`;
  $('#us-corpo').onclick = async (e) => {
    const b = e.target.closest('[data-ac]'); if (!b) return;
    const c = state.cds.find((x) => x.id === b.closest('tr').dataset.cd);
    if (b.dataset.ac === 'editar') modalCD(c);
    if (b.dataset.ac === 'relatorio') relatorioCD(c.id);
    if (b.dataset.ac === 'excluir') {
      if (!(await confirmar(`${c.codigo} · ${c.nome}`, { titulo: 'Excluir o CD?', ok: 'Excluir', perigo: true }))) return;
      const { error } = await sb.from('cds').delete().eq('id', c.id);
      if (error) return toast(error.code === '23503' ? 'Este CD tem máquinas, inventários ou usuários. Desative-o em vez de excluir.' : erroMsg(error), true);
      toast('CD excluído'); await recarregarCDs(); renderCDsAdmin();
    }
  };
}

export function modalCD(c = null) {
  modal(`
    <form id="cd-form">
      <div class="modal-head"><h2>${c ? 'Editar CD' : 'Novo CD'}</h2></div>
      <div class="modal-body"><div class="form-grid">
        ${campo('codigo', 'Código *', c?.codigo || '', 'text', 'required class="mono" placeholder="Ex.: CD03" maxlength="12"')}
        ${campo('nome', 'Nome *', c?.nome || '', 'text', 'required placeholder="Ex.: CD Embu das Artes"')}
        ${campo('cidade', 'Cidade', c?.cidade || '')}
        ${campo('uf', 'UF', c?.uf || '', 'text', 'maxlength="2" style="text-transform:uppercase"')}
        ${c ? `<label class="check full"><input type="checkbox" name="ativo" ${c.ativo ? 'checked' : ''}> CD ativo</label>` : ''}
      </div><p class="erro" id="cd-erro"></p></div>
      <div class="modal-foot"><button type="button" class="btn" data-close>Cancelar</button><button class="btn btn--primary">${c ? 'Salvar' : 'Criar CD'}</button></div>
    </form>`, (dlg) => {
    $('#cd-form').onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const row = { codigo: String(fd.get('codigo')).trim().toUpperCase(), nome: String(fd.get('nome')).trim(),
        cidade: String(fd.get('cidade')).trim() || null, uf: String(fd.get('uf')).trim().toUpperCase() || null };
      if (c) row.ativo = !!fd.get('ativo');
      const { error } = c ? await sb.from('cds').update(row).eq('id', c.id) : await sb.from('cds').insert(row);
      if (error) return ($('#cd-erro').textContent = error.code === '23505' ? 'Já existe um CD com esse código.' : erroMsg(error));
      dlg.close(); toast(c ? 'CD atualizado' : 'CD criado');
      await recarregarCDs(); renderCDsAdmin();
    };
  });
}
