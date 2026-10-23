const C = self.PROSPECTA_CFG;
const app = document.getElementById('app');
const enviar = (tipo, dados = {}) => new Promise((ok, falha) =>
  chrome.runtime.sendMessage({ tipo, ...dados }, (r) => (r?.ok ? ok(r.dados) : falha(new Error(r?.erro || 'Falha')))));
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

async function render(erro) {
  const { email } = await enviar('sessao').catch(() => ({ email: null }));
  if (email) {
    app.innerHTML = `<div class="ok">✓ Conectado como ${esc(email)}</div>
      <ol><li>Abra o Google Maps e pesquise (ex.: <i>dentistas em Moema</i>).</li>
      <li>Clique no botão <b>Prospecta</b> no canto da página.</li><li>Clique em <b>Capturar resultados</b>.</li></ol>
      <button id="maps">Abrir Google Maps</button>
      <button class="sec" id="painel">Abrir painel Prospecta</button>
      <button class="sec" id="sair">Sair</button>`;
    document.getElementById('maps').onclick = () => chrome.tabs.create({ url: 'https://www.google.com/maps' });
    document.getElementById('painel').onclick = () => chrome.tabs.create({ url: C.APP_URL });
    document.getElementById('sair').onclick = async () => { await enviar('sair'); render(); };
    return;
  }
  app.innerHTML = `${erro ? `<div class="err">${esc(erro)}</div>` : ''}
    <form id="f"><label>E-mail</label><input id="email" type="email" required autocomplete="username">
    <label>Senha</label><input id="senha" type="password" required autocomplete="current-password">
    <button id="btn">Entrar</button></form>
    <p class="muted">Use a mesma conta do painel. Ainda não tem? <a id="criar">Crie no site</a>.</p>`;
  document.getElementById('criar').onclick = () => chrome.tabs.create({ url: C.APP_URL });
  document.getElementById('f').onsubmit = async (e) => {
    e.preventDefault();
    const b = document.getElementById('btn'); b.disabled = true; b.textContent = 'Entrando…';
    try { await enviar('entrar', { email: document.getElementById('email').value.trim(), senha: document.getElementById('senha').value }); render(); }
    catch (err) { render(err.message === 'Invalid login credentials' ? 'E-mail ou senha incorretos.' : err.message); }
  };
}
render();
