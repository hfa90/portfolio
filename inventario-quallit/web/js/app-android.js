// Divulgação do app Android (tela de login do painel e do app de conferência, e a página android.html).
// - No celular Android: botão para baixar o APK direto.
// - No computador: QR code que leva à página de instalação (android.html), para apontar a câmera do Android.
// - No iPhone/iPad e dentro do próprio app Android: não aparece.
// O APK e o android.json (versão e tamanho) ficam em web/downloads/, gravados pelo GitHub (Actions → App Android).
// Se ainda não houver APK publicado, o cartão não aparece.
import { URL_PUBLICA } from './config.js';

const QR_LIB = 'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js';
const QR_SRI = 'sha384-8FWZA6BGMXhsfO+BLtrJK0We6gg5o1JyO8xQm6peWDEUs17ACA5ziE/NIAkl9z2k';

export const BASE = new URL('../', import.meta.url).href;               // .../web/
export const APK_URL = new URL('downloads/inventario-quallit.apk', BASE).href;
export const INFO_URL = new URL('downloads/android.json', BASE).href;
export const PAGINA_URL = new URL('android.html', URL_PUBLICA || BASE).href;

const ua = navigator.userAgent;
export const dentroDoApp = /InventarioQuallitAndroid/.test(ua);
export const noAndroid = /Android/i.test(ua) && !dentroDoApp;
export const noIOS = /iPhone|iPad|iPod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

let info = null;
export async function infoApk() {
  if (info) return info;
  try {
    const r = await fetch(`${INFO_URL}?t=${Date.now()}`, { cache: 'no-store' });
    info = r.ok ? await r.json() : null;
  } catch { info = null; }
  return info;
}

export const tamanhoMB = (i) => (i?.tamanho ? `${(i.tamanho / 1048576).toFixed(1).replace('.', ',')} MB` : '');

function carregarQR() {
  return new Promise((ok, falha) => {
    if (window.qrcode) return ok(window.qrcode);
    const s = document.createElement('script');
    s.src = QR_LIB; s.integrity = QR_SRI; s.crossOrigin = 'anonymous';
    s.onload = () => ok(window.qrcode); s.onerror = falha;
    document.head.append(s);
  });
}

// imagem (data URL) do QR code de um endereço
export async function qrImagem(texto, celula = 5) {
  const qrcode = await carregarQR();
  const q = qrcode(0, 'M'); q.addData(texto); q.make();
  return q.createDataURL(celula, 2);
}

const ROBO = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d="M17.6 9.48l1.84-3.18c.16-.31.04-.69-.26-.85a.64.64 0 0 0-.83.22l-1.88 3.24a11.43 11.43 0 0 0-8.94 0L5.65 5.67a.64.64 0 0 0-.87-.2c-.28.18-.37.54-.22.83L6.4 9.48A10.81 10.81 0 0 0 1 18h22a10.81 10.81 0 0 0-5.4-8.52zM7 15.25a1.25 1.25 0 1 1 0-2.5 1.25 1.25 0 0 1 0 2.5zm10 0a1.25 1.25 0 1 1 0-2.5 1.25 1.25 0 0 1 0 2.5z"/></svg>';
const BAIXAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m0 0-5-5m5 5 5-5M4 20h16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
export const ICONES = { ROBO, BAIXAR };

// Desenha o cartão dentro de `alvo` (some se não fizer sentido neste aparelho)
export async function cartaoAppAndroid(alvo) {
  if (!alvo) return;
  alvo.hidden = true;
  if (dentroDoApp || noIOS) return;
  const i = await infoApk();
  if (!i) return;
  const versao = `v${i.versao}${tamanhoMB(i) ? ' · ' + tamanhoMB(i) : ''}`;
  const lado = noAndroid
    ? `<div class="aa-acoes">
         <a class="aa-baixar" href="${APK_URL}" download="Inventario-Quallit.apk">${BAIXAR}<span>Baixar o app</span></a>
         <a class="aa-como" href="${PAGINA_URL}">Como instalar · ${versao} ›</a>
       </div>`
    : `<div class="aa-acoes">
         <a class="aa-qr" href="${PAGINA_URL}" target="_blank" rel="noopener">
           <span class="aa-qr-img"></span>
           <span class="aa-qr-txt"><b>Aponte a câmera</b><span>do celular Android para instalar</span><small>${versao}</small></span>
         </a>
         <a class="aa-baixar aa-baixar--sec" href="${APK_URL}" download="Inventario-Quallit.apk">${BAIXAR}<span>Baixar o APK</span></a>
       </div>`;
  alvo.innerHTML = `
    <section class="aa-cartao" aria-label="App do Inventário Quallit para Android">
      <span class="aa-marca">${ROBO}</span>
      <div class="aa-topo">
        <span class="aa-icone"><img src="${new URL('icons/icon-192.png', BASE).href}" alt="" width="56" height="56"><span class="aa-selo">${ROBO}</span></span>
        <div class="aa-textos">
          <span class="aa-novo">Novo · App para Android</span>
          <strong class="aa-titulo">Inventário no seu celular</strong>
          <span class="aa-desc">Conferência com o leitor de etiquetas, fotos pela câmera e uso sem internet. Entre com o mesmo e-mail e senha.</span>
        </div>
      </div>
      ${lado}
    </section>`;
  alvo.hidden = false;
  const caixa = alvo.querySelector('.aa-qr-img');
  if (caixa) {
    try { caixa.innerHTML = `<img src="${await qrImagem(PAGINA_URL, 4)}" alt="QR code para baixar o app Android">`; }
    catch { alvo.querySelector('.aa-qr').classList.add('aa-qr--sem'); }
  }
}
