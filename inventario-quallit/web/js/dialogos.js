// Janelas de confirmação do próprio sistema (no lugar do confirm()/prompt() do navegador).
// Usadas pelo painel e pelo app do celular. Abrem por cima de qualquer outra janela aberta.
//   await confirmar('Excluir X?', { titulo, ok: 'Excluir', perigo: true })      → true/false
//   await confirmar('…', { digitar: 'EXCLUIR' })   → só libera o botão depois de digitar a palavra

const escHtml = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function estilo() {
  if (document.getElementById('dlg-sis-css')) return;
  const s = document.createElement('style');
  s.id = 'dlg-sis-css';
  s.textContent = `
    dialog.dlg-sis { border: 0; border-radius: 14px; padding: 0; width: min(440px, calc(100vw - 32px)); background: var(--surface, var(--card, #fff)); color: var(--ink, #0e1d20); box-shadow: 0 20px 60px rgba(0,0,0,.35); }
    dialog.dlg-sis::backdrop { background: rgba(8, 20, 24, .55); }
    .dlg-sis .ds-corpo { padding: 20px 20px 8px; }
    .dlg-sis h2 { margin: 0 0 8px; font-size: 18px; }
    .dlg-sis p { margin: 0; white-space: pre-wrap; line-height: 1.45; color: var(--ink-2, inherit); }
    .dlg-sis input { width: 100%; margin-top: 12px; box-sizing: border-box; font: inherit; padding: 9px 11px; border-radius: 8px; border: 1px solid var(--line, #c9d6d9); background: transparent; color: inherit; }
    .dlg-sis .ds-pe { display: flex; justify-content: flex-end; gap: 8px; padding: 14px 20px 18px; flex-wrap: wrap; }
    .dlg-sis .ds-pe button { min-height: 40px; }`;
  document.head.append(s);
}

export function confirmar(mensagem, { titulo = 'Confirmar', ok = 'Confirmar', cancelar = 'Cancelar', perigo = false, digitar = null } = {}) {
  estilo();
  return new Promise((resolve) => {
    const d = document.createElement('dialog');
    d.className = 'dlg-sis';
    d.innerHTML = `<form method="dialog">
      <div class="ds-corpo"><h2>${escHtml(titulo)}</h2><p>${escHtml(mensagem)}</p>
        ${digitar ? `<input name="txt" autocomplete="off" placeholder="Digite ${escHtml(digitar)} para confirmar" aria-label="Digite ${escHtml(digitar)} para confirmar">` : ''}</div>
      <div class="ds-pe"><button type="button" class="btn" value="nao">${escHtml(cancelar)}</button>
        <button type="submit" class="btn ${perigo ? 'btn--danger' : 'btn--primary btn--pri'}" value="sim" ${digitar ? 'disabled' : ''}>${escHtml(ok)}</button></div></form>`;
    document.body.append(d);
    const [bNao, bSim] = d.querySelectorAll('.ds-pe button');
    const inp = d.querySelector('input');
    let res = false;
    if (inp) inp.oninput = () => { bSim.disabled = inp.value.trim().toUpperCase() !== String(digitar).toUpperCase(); };
    bNao.onclick = () => d.close();
    d.querySelector('form').onsubmit = (e) => { e.preventDefault(); if (!bSim.disabled) { res = true; d.close(); } };
    d.addEventListener('close', () => { d.remove(); resolve(res); });
    d.showModal();
    (inp || bSim).focus();
  });
}
