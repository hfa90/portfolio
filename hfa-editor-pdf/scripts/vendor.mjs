// Copia as bibliotecas de node_modules para vendor/, para o site funcionar
// sem CDN (privacidade, CSP 'self' e uso offline). Rode: npm install && npm run vendor
import { cpSync, mkdirSync, rmSync, readdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const nm = (p) => join(root, 'node_modules', p);
const out = (p) => join(root, 'vendor', p);
const copy = (from, to) => { mkdirSync(dirname(out(to)), { recursive: true }); cpSync(nm(from), out(to), { recursive: true }); };

rmSync(join(root, 'vendor'), { recursive: true, force: true });

// pdf.js 4
copy('pdfjs-dist/build/pdf.min.mjs', 'pdfjs/pdf.min.mjs');
copy('pdfjs-dist/build/pdf.worker.min.mjs', 'pdfjs/pdf.worker.min.mjs');
copy('pdfjs-dist/standard_fonts', 'pdfjs/standard_fonts');
copy('pdfjs-dist/cmaps', 'pdfjs/cmaps');
copy('pdfjs-dist/LICENSE', 'pdfjs/LICENSE');

// pdf-lib + fontkit
copy('pdf-lib/dist/pdf-lib.esm.min.js', 'pdf-lib/pdf-lib.esm.min.js');
copy('pdf-lib/LICENSE.md', 'pdf-lib/LICENSE.md');
copy('@pdf-lib/fontkit/dist/fontkit.umd.min.js', 'fontkit/fontkit.umd.min.js');

// fontes DejaVu (TrueType) para textos fora do WinAnsi no PDF exportado
const dj = ['DejaVuSans', 'DejaVuSans-Bold', 'DejaVuSans-Oblique', 'DejaVuSans-BoldOblique',
  'DejaVuSerif', 'DejaVuSerif-Bold', 'DejaVuSerif-Italic', 'DejaVuSerif-BoldItalic',
  'DejaVuSansMono', 'DejaVuSansMono-Bold', 'DejaVuSansMono-Oblique', 'DejaVuSansMono-BoldOblique'];
dj.forEach((f) => copy(`dejavu-fonts-ttf/ttf/${f}.ttf`, `dejavu/${f}.ttf`));
copy('dejavu-fonts-ttf/LICENSE', 'dejavu/LICENSE');

// conversão Word <-> PDF: leitura/escrita de .docx e renderização do Word
copy('jszip/dist/jszip.min.js', 'jszip/jszip.min.js');
copy('jszip/LICENSE.markdown', 'jszip/LICENSE.markdown');
copy('docx-preview/dist/docx-preview.min.js', 'docx-preview/docx-preview.min.js');
copy('docx-preview/LICENSE', 'docx-preview/LICENSE');

// fontes com as mesmas medidas das fontes do Office (Calibri, Cambria, Arial,
// Times New Roman, Courier New): o texto quebra nos mesmos pontos que no Word
const METRIC = { carlito: 'Carlito', caladea: 'Caladea', arimo: 'Arimo', tinos: 'Tinos', cousine: 'Cousine' };
const FACES = ['400Regular', '700Bold', '400Regular_Italic', '700Bold_Italic'];
const raw = join(tmpdir(), 'hfa-docfonts-raw');
rmSync(raw, { recursive: true, force: true }); mkdirSync(raw, { recursive: true });
for (const [pkg, fam] of Object.entries(METRIC)) {
  for (const f of FACES) cpSync(nm(`@expo-google-fonts/${pkg}/${f}/${fam}_${f}.ttf`), join(raw, `${fam}_${f}.ttf`));
  copy(`@expo-google-fonts/${pkg}/LICENSE_FONT`, `docfonts/LICENSE-${fam}.txt`);
}
// o fontkit do pdf-lib só embute estas fontes depois de regravadas pelo fontTools
try {
  execFileSync(process.env.PYTHON || 'python', [join(root, 'scripts', 'docfonts.py'), raw, out('docfonts')], { stdio: 'inherit' });
} catch (e) {
  console.error('Falhou ao preparar vendor/docfonts: instale Python 3 e "pip install fonttools" e rode de novo.');
  process.exit(1);
}

// fontes da interface (Inter) e das assinaturas, servidas localmente
const RANGES = {
  latin: 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD',
  'latin-ext': 'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF',
};
const FONTS = [
  { pkg: '@fontsource-variable/inter', file: (s) => `inter-${s}-wght-normal.woff2`, family: 'Inter', weight: '100 900' },
  { pkg: '@fontsource/caveat', file: (s) => `caveat-${s}-600-normal.woff2`, family: 'Caveat', weight: '600' },
  { pkg: '@fontsource/dancing-script', file: (s) => `dancing-script-${s}-600-normal.woff2`, family: 'Dancing Script', weight: '600' },
  { pkg: '@fontsource/great-vibes', file: (s) => `great-vibes-${s}-400-normal.woff2`, family: 'Great Vibes', weight: '400' },
  { pkg: '@fontsource/satisfy', file: (s) => `satisfy-${s}-400-normal.woff2`, family: 'Satisfy', weight: '400' },
];
let css = '/* gerado por scripts/vendor.mjs — fontes locais (OFL) */\n';
for (const f of FONTS) {
  for (const s of Object.keys(RANGES)) {
    const name = f.file(s);
    if (!readdirSync(nm(`${f.pkg}/files`)).includes(name)) continue;
    copy(`${f.pkg}/files/${name}`, `fonts/${name}`);
    css += `@font-face{font-family:'${f.family}';font-style:normal;font-display:swap;font-weight:${f.weight};src:url(./${name}) format('woff2');unicode-range:${RANGES[s]}}\n`;
  }
}
writeFileSync(out('fonts/fonts.css'), css);
console.log('vendor/ atualizado.');
