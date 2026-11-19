// Campo de assinatura com o dedo / caneta / mouse.
export function criarAssinatura(canvas) {
  const ctx = canvas.getContext('2d');
  let desenhando = false;
  let vazia = true;
  let ultimo = null;

  function ajustar() {
    const r = canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.max(1, Math.round(r.width * dpr));
    canvas.height = Math.max(1, Math.round(r.height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineWidth = 2.4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#111827';
    vazia = true;
  }
  const pos = (e) => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };

  canvas.style.touchAction = 'none';
  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    canvas.setPointerCapture(e.pointerId);
    desenhando = true; vazia = false;
    ultimo = pos(e);
    ctx.beginPath(); ctx.arc(ultimo.x, ultimo.y, 1.1, 0, Math.PI * 2); ctx.fillStyle = '#111827'; ctx.fill();
    canvas.dispatchEvent(new Event('assinou'));
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!desenhando) return;
    const p = pos(e);
    ctx.beginPath(); ctx.moveTo(ultimo.x, ultimo.y); ctx.lineTo(p.x, p.y); ctx.stroke();
    ultimo = p;
  });
  const parar = () => { desenhando = false; };
  canvas.addEventListener('pointerup', parar);
  canvas.addEventListener('pointercancel', parar);
  requestAnimationFrame(ajustar);

  return {
    ajustar,
    limpar() { ctx.clearRect(0, 0, canvas.width, canvas.height); vazia = true; },
    vazia: () => vazia,
    // PNG com fundo branco, largura máx. 600px (fica leve para salvar no banco)
    imagem() {
      if (vazia) return null;
      const escala = Math.min(1, 600 / canvas.width);
      const out = document.createElement('canvas');
      out.width = Math.round(canvas.width * escala);
      out.height = Math.round(canvas.height * escala);
      const o = out.getContext('2d');
      o.fillStyle = '#fff'; o.fillRect(0, 0, out.width, out.height);
      o.drawImage(canvas, 0, 0, out.width, out.height);
      return out.toDataURL('image/png');
    },
  };
}
