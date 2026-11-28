// Carregamento sob demanda das bibliotecas da conversão (só quando o usuário converte).
const loaded = new Map();
function script(path, global) {
  if (window[global]) return Promise.resolve(window[global]);
  if (!loaded.has(path)) {
    loaded.set(path, new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = new URL(path, import.meta.url).href;
      s.onload = () => (window[global] ? res(window[global]) : rej(new Error(global + ' não carregou')));
      s.onerror = () => { loaded.delete(path); rej(new Error(path + ' não carregou')); };
      document.head.appendChild(s);
    }));
  }
  return loaded.get(path);
}
export const loadJSZip = () => script('../../vendor/jszip/jszip.min.js', 'JSZip');
export async function loadDocxPreview() { await loadJSZip(); return script('../../vendor/docx-preview/docx-preview.min.js', 'docx'); }

/** Gera o .docx (Blob) a partir do mapa { caminho: conteúdo }. */
export async function zipDocx(files) {
  const JSZip = await loadJSZip();
  const z = new JSZip();
  // [Content_Types].xml primeiro, como o Word espera
  const keys = Object.keys(files).sort((a, b) => (a === '[Content_Types].xml' ? -1 : b === '[Content_Types].xml' ? 1 : 0));
  for (const k of keys) z.file(k, files[k], { compression: /\.(png|jpe?g)$/.test(k) ? 'STORE' : 'DEFLATE' });
  return z.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', compression: 'DEFLATE', compressionOptions: { level: 6 } });
}

export const canvasBytes = (c, type = 'image/png', q = 0.9) => new Promise((res, rej) => c.toBlob((b) => (b ? b.arrayBuffer().then((a) => res(new Uint8Array(a)), rej) : rej(new Error('toBlob falhou'))), type, q));
