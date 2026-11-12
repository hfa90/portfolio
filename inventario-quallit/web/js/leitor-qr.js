// Leitura de etiquetas pela câmera (app do celular e painel).
// Android (Chrome): leitor nativo do aparelho (BarcodeDetector), lê QR code e código de barras.
// iPhone e computador (sem leitor nativo): jsQR, só QR code. O QR da etiqueta guarda o endereço da
// ficha (~75 caracteres), um QR denso: com a imagem inteira encolhida, numa etiqueta a 20–30 cm
// ele ficava com 2–3 pixels por quadradinho e a leitura nunca completava. Agora o centro da
// imagem (onde fica a mira) é analisado em resolução total, alternando com a imagem inteira.
const JSQR = 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js';
const JSQR_SRI = 'sha384-b5Ya4Bq3qCyz39m2ISh+4DxjAIljdeFwK/BsXLuj9gugaNwAcj/ia15fxNZL9Nlx';
const FORMATOS = ['qr_code', 'code_128', 'code_39', 'ean_13', 'data_matrix', 'itf'];

// câmera traseira, a maior resolução que o aparelho oferecer até Full HD
export const VIDEO = { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } };

export function carregarJsQR() {
  return new Promise((ok, falha) => {
    if (window.jsQR) return ok();
    const s = document.createElement('script');
    s.src = JSQR; s.integrity = JSQR_SRI; s.crossOrigin = 'anonymous';
    s.onload = ok; s.onerror = () => falha(new Error('falha ao carregar o leitor de QR code'));
    document.head.append(s);
  });
}

// foco contínuo (Android); no iPhone o foco já é automático
export async function ajustarFoco(trilha) {
  try {
    const c = trilha.getCapabilities?.() || {};
    if (c.focusMode?.includes('continuous')) await trilha.applyConstraints({ advanced: [{ focusMode: 'continuous' }] });
  } catch { /* sem ajuste de foco */ }
}

// devolve { nativo, ler() }: ler() analisa o quadro atual do vídeo e devolve o texto lido ou null
export async function criarDetector(video) {
  if ('BarcodeDetector' in window) {
    try {
      const fmts = await window.BarcodeDetector.getSupportedFormats();
      const quero = FORMATOS.filter((f) => fmts.includes(f));
      if (quero.includes('qr_code')) {
        const bd = new window.BarcodeDetector({ formats: quero });
        return { nativo: true, ler: async () => (video.videoWidth ? (await bd.detect(video))[0]?.rawValue || null : null) };
      }
    } catch { /* usa o jsQR */ }
  }
  await carregarJsQR();
  const cv = document.createElement('canvas');
  const cx = cv.getContext('2d', { willReadFrequently: true });
  const tentar = (sx, sy, sw, sh, max) => {
    const e = Math.min(1, max / Math.max(sw, sh));
    const w = Math.round(sw * e), h = Math.round(sh * e);
    cv.width = w; cv.height = h;
    cx.drawImage(video, sx, sy, sw, sh, 0, 0, w, h);
    return window.jsQR(cx.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: 'dontInvert' })?.data || null;
  };
  let vez = 0;
  return {
    nativo: false,
    ler: async () => {
      const vw = video.videoWidth, vh = video.videoHeight;
      if (!vw) return null;
      vez = (vez + 1) % 3;
      // 2 de cada 3 quadros: o centro em resolução total (QR pequeno ou distante), em dois tamanhos de recorte;
      // o terceiro: a imagem inteira (QR grande, perto ou fora do centro)
      if (vez) {
        const lado = Math.round(Math.min(vw, vh) * (vez === 1 ? 0.6 : 0.9));
        return tentar((vw - lado) / 2, (vh - lado) / 2, lado, lado, 900);
      }
      return tentar(0, 0, vw, vh, 1100);
    },
  };
}
