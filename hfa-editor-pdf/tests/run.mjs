// Testes de ponta a ponta (Playwright + Chromium).
// Uso: npm test        (CHROME=/caminho/do/chrome para usar um Chrome já instalado)
import { chromium } from 'playwright';
import { PDFDocument, StandardFonts, rgb, PDFRawStream, PDFName, PDFString } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import pako from 'pako';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { serve } from './server.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const tmp = join(here, '.tmp'); mkdirSync(tmp, { recursive: true });

// ---------- mini framework ----------
const results = [];
let current = '';
const ok = (cond, msg) => { if (!cond) throw new Error(msg); };
async function test(name, fn) {
  current = name; const t0 = Date.now();
  try { await fn(); results.push([true, name, Date.now() - t0]); console.log(`  ✔ ${name}`); }
  catch (e) { results.push([false, name, e]); console.log(`  ✘ ${name}\n     ${e.stack || e}`); }
}

// ---------- PDFs de teste ----------
async function makeFormPdf() {
  const d = await PDFDocument.create();
  const f = await d.embedFont(StandardFonts.Helvetica);
  const p1 = d.addPage([595, 842]);
  p1.drawText('Nome', { x: 72, y: 760, size: 14, font: f });
  p1.drawText('do cliente', { x: 72 + f.widthOfTextAtSize('Nome ', 14), y: 760, size: 14, font: f });
  p1.drawText('SEGREDO 12345', { x: 72, y: 700, size: 14, font: f });
  p1.drawText('Linha comum visivel', { x: 72, y: 640, size: 14, font: f });
  const p2 = d.addPage([595, 842]);
  p2.drawText('Pagina dois visivel', { x: 72, y: 760, size: 14, font: f });
  const form = d.getForm();
  const tf = form.createTextField('nome'); tf.setText('Maria'); tf.addToPage(p2, { x: 72, y: 600, width: 200, height: 24 });
  d.setTitle('Contrato de teste');
  return d.save();
}
async function makeSharedFontPdf(n = 10) {
  const d = await PDFDocument.create(); d.registerFontkit(fontkit);
  const ttf = readFileSync(join(root, 'vendor/dejavu/DejaVuSans.ttf'));
  const f = await d.embedFont(ttf, { subset: false }); // fonte grande, compartilhada por todas as páginas
  for (let i = 0; i < n; i++) d.addPage([400, 400]).drawText(`Página ${i + 1}`, { x: 40, y: 340, size: 20, font: f });
  return d.save();
}
async function makeLongPdf(n = 60) {
  const d = await PDFDocument.create(); const f = await d.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < n; i++) { const p = d.addPage([595, 842]); p.drawRectangle({ x: 40, y: 40, width: 515, height: 762, color: rgb(0.9, 0.95, 1) }); p.drawText(`Página ${i + 1}`, { x: 72, y: 760, size: 24, font: f }); }
  return d.save();
}
async function pdfText(bytes) {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes), isEvalSupported: false, standardFontDataUrl: join(root, 'node_modules/pdfjs-dist/standard_fonts/') }).promise;
  const pages = [];
  for (let i = 1; i <= doc.numPages; i++) { const tc = await (await doc.getPage(i)).getTextContent(); pages.push(tc.items.map((it) => it.str).join(' ')); }
  await doc.destroy();
  return pages;
}
/** Junta todo o conteúdo bruto do arquivo (streams descomprimidos), para procurar vazamentos. */
async function rawContent(bytes) {
  const d = await PDFDocument.load(bytes);
  let all = '';
  for (const [, obj] of d.context.enumerateIndirectObjects()) {
    if (obj instanceof PDFRawStream) {
      let b = obj.contents;
      const filter = obj.dict.get(PDFName.of('Filter'));
      if (filter && String(filter).includes('FlateDecode')) { try { b = pako.inflate(b); } catch { /* */ } }
      all += Buffer.from(b).toString('latin1');
    } else all += String(obj);
  }
  return all;
}
const hex = (s) => Buffer.from(s, 'latin1').toString('hex').toUpperCase();

const formPdf = await makeFormPdf(); writeFileSync(join(tmp, 'contrato.pdf'), formPdf);
const sharedPdf = await makeSharedFontPdf(); writeFileSync(join(tmp, 'fonte-compartilhada.pdf'), sharedPdf);
const longPdf = await makeLongPdf(); writeFileSync(join(tmp, 'longo.pdf'), longPdf);
ok((await rawContent(formPdf)).includes(hex('SEGREDO')), 'fixture deveria conter SEGREDO');

// ---------- navegador ----------
const { srv, url } = await serve(root);
const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME, args: ['--no-sandbox'] } : {});
const problems = [];
async function newPage(ctx, q = '') {
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (e) => console.error('CSP: ' + e.violatedDirective + ' ' + e.blockedURI));
  });
  page.on('console', (m) => { if (m.type() === 'error') problems.push(`[${current}] ${m.text()}`); });
  page.on('pageerror', (e) => problems.push(`[${current}] pageerror: ${e.message}`));
  page.on('request', (r) => { if (!r.url().startsWith(url) && !/^(data|blob):/.test(r.url())) problems.push(`[${current}] requisição externa: ${r.url()}`); });
  await page.goto(url + q);
  await page.waitForFunction(() => window.HFA);
  return page;
}
async function open(page, file) {
  await page.setInputFiles('#fileIn', join(tmp, file));
  await page.waitForSelector('#editor:not([hidden]) .slot');
  await page.waitForFunction(() => document.querySelector('.cv canvas'));
}
/** Converte um ponto da página (pt, origem no topo) para coordenadas da tela. */
async function screenPt(page, pageIdx, x, y) {
  return page.evaluate(([i, x, y]) => {
    const p = HFA.S.pages[i]; const r = document.querySelector(`.slot[data-page="${p.id}"]`).getBoundingClientRect();
    return { x: r.left + x * HFA.S.zoom, y: r.top + y * HFA.S.zoom };
  }, [pageIdx, x, y]);
}
const els = (page, i = 0) => page.evaluate((i) => HFA.S.pages[i].els.map((e) => ({ ...e })), i);
async function build(page) {
  const r = await page.evaluate(async () => { const o = await HFA.buildPdf(); return { b64: btoa(Array.from(o.bytes, (c) => String.fromCharCode(c)).join('')), mode: o.mode, replaced: o.replaced, burned: o.burned }; });
  return { ...r, bytes: Buffer.from(r.b64, 'base64') };
}

console.log('\nHFA Editor PDF — testes\n');
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 }, acceptDownloads: true });
const page = await newPage(ctx);

await test('abre o PDF e mantém o modo de edição no próprio arquivo', async () => {
  await open(page, 'contrato.pdf');
  ok(await page.evaluate(() => HFA.exportMode()) === 'inplace', 'modo deveria ser inplace');
  ok(await page.locator('.thumb').count() === 2, 'deveria ter 2 miniaturas');
});

await test('Editar texto junta pedaços da mesma linha e some depois de editado', async () => {
  await page.keyboard.press('e');
  await page.waitForSelector('.slot .hint');
  const n0 = await page.locator('.slot >> nth=0').locator('.hint').count();
  ok(n0 === 3, `esperava 3 linhas na página 1, veio ${n0}`);
  await page.locator('.slot >> nth=0').locator('.hint >> nth=0').click();
  await page.waitForSelector('.el-text.editing');
  ok((await page.locator('.el-text.editing').innerText()).trim() === 'Nome do cliente', 'texto da linha deveria vir junto');
  await page.keyboard.type(' ATUALIZADO');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  const n1 = await page.locator('.slot >> nth=0').locator('.hint').count();
  ok(n1 === 2, `o realce editado deveria sumir (restaram ${n1})`);
  const again = await screenPt(page, 0, 90, 842 - 760 - 5); // clicar de novo no mesmo trecho não empilha outra edição
  await page.mouse.click(again.x, again.y);
  await page.keyboard.press('Escape');
  const list = await els(page);
  ok(list.filter((e) => e.type === 'whiteout').length === 1 && list.filter((e) => e.type === 'text').length === 1, 'o trecho deveria ter só 1 corretivo + 1 texto');
  await page.keyboard.press('v');
});

await test('texto novo com Unicode, alinhamento e rotação', async () => {
  await page.keyboard.press('t');
  const p = await screenPt(page, 0, 72, 520);
  await page.mouse.click(p.x, p.y);
  await page.keyboard.type('Olá → ✓ Привет 漢');
  await page.keyboard.press('Escape');
  const t = (await els(page)).find((e) => e.type === 'text' && e.text.includes('Привет'));
  ok(t, 'texto não foi criado');
  await page.evaluate((id) => HFA.select(HFA.S.pages[0].id, id), t.id);
  await page.click('#pAlign [data-align="center"]');
  await page.fill('#pRot', '30'); await page.locator('#pRot').dispatchEvent('change');
  const t2 = (await els(page)).find((e) => e.id === t.id);
  ok(t2.align === 'center' && Math.round(t2.rot) === 30, `alinhamento/rotação não aplicados (${t2.align}, ${t2.rot})`);
  await page.fill('#pRot', '0'); await page.locator('#pRot').dispatchEvent('change');
});

await test('tarja definitiva desenhada sobre o texto sigiloso', async () => {
  await page.evaluate(() => document.activeElement && document.activeElement.blur());
  await page.keyboard.press('x');
  const a = await screenPt(page, 0, 66, 128), b = await screenPt(page, 0, 190, 150);
  await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move(b.x, b.y, { steps: 5 }); await page.mouse.up();
  const r = (await els(page)).find((e) => e.type === 'whiteout' && e.burn);
  ok(r && r.fill === '#000000', 'tarja não criada');
});

await test('foto com EXIF girado entra na orientação certa', async () => {
  await page.setInputFiles('#imgIn', join(here, 'fixtures/exif-rot6.jpg'));
  await page.waitForFunction(() => HFA.S.pages.some((p) => p.els.some((e) => e.type === 'image')));
  const a = await page.evaluate(() => { const el = HFA.S.pages.flatMap((p) => p.els).find((e) => e.type === 'image'); return HFA.S.assets[el.asset]; });
  ok(a.w === 60 && a.h === 120, `deveria virar 60x120, veio ${a.w}x${a.h}`);
  ok(a.type === 'jpg' && a.data.startsWith('data:image/jpeg'), 'deveria continuar JPEG');
});

await test('miniatura mostra os elementos adicionados', async () => {
  const n = await page.locator('.thumb >> nth=0').locator('.tels > *').count();
  const want = (await els(page)).length;
  ok(n === want && n >= 5, `miniatura deveria ter ${want} elementos (tem ${n})`);
});

let out1;
await test('exporta: formulário preservado, Unicode, tarja remove o conteúdo', async () => {
  out1 = await build(page);
  writeFileSync(join(tmp, 'saida-contrato.pdf'), out1.bytes);
  ok(out1.mode === 'inplace', 'modo inplace');
  ok(out1.replaced === 1, `só o ideograma deveria ser trocado (trocados: ${out1.replaced})`);
  ok(out1.burned === 1, 'uma página com tarja');
  const d = await PDFDocument.load(out1.bytes);
  ok(d.getPageCount() === 2, 'deveria manter 2 páginas');
  ok(d.getForm().getTextField('nome').getText() === 'Maria', 'campo de formulário perdido');
  ok(d.getTitle() === 'Contrato de teste', 'metadados perdidos');
  const txt = await pdfText(out1.bytes);
  ok(!txt[0].includes('SEGREDO'), 'texto tarjado ainda extraível');
  ok(txt[0].includes('ATUALIZADO') && txt[0].includes('Привет') && txt[0].includes('→') && txt[0].includes('✓'), 'texto novo ausente: ' + txt[0]);
  ok(txt[1].includes('Pagina dois visivel'), 'página 2 deveria manter o texto');
  const raw = await rawContent(out1.bytes);
  ok(!raw.includes(hex('SEGREDO')) && !raw.includes('SEGREDO'), 'o conteúdo tarjado continua dentro do arquivo');
  writeFileSync(join(tmp, 'saida-contrato.pdf'), out1.bytes);
});

await test('seleção múltipla, alinhamento, copiar e colar entre páginas', async () => {
  await page.keyboard.press('v');
  await page.evaluate(() => { const p = HFA.S.pages[0]; HFA.select(p.id, p.els.filter((e) => e.type === 'text').map((e) => e.id)); });
  const nt = (await els(page)).filter((e) => e.type === 'text').length;
  ok(nt === 2 && await page.locator('.selbox.sub').count() === nt, 'deveria mostrar uma caixa por elemento da seleção múltipla');
  await page.click('[data-sa="al-l"]');
  const xs = await page.evaluate(() => HFA.selection().els.map((e) => Math.round(e.x)));
  ok(new Set(xs).size === 1, 'textos deveriam ficar alinhados à esquerda: ' + xs);
  await page.evaluate(() => document.dispatchEvent(new ClipboardEvent('copy', { clipboardData: new DataTransfer(), bubbles: true })));
  await page.evaluate(() => { const p = HFA.S.pages[1]; document.querySelector(`#thumbs .thumb[data-page="${p.id}"]`).click(); });
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    const dt = new DataTransfer(); dt.setData('text/plain', window.__clip || '');
    document.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true }));
  });
  ok((await els(page, 1)).filter((e) => e.type === 'text').length === nt, 'deveria colar os textos na página 2');
});

await test('arrastar com guias encaixa no centro da página', async () => {
  const t = (await els(page, 1))[0];
  await page.evaluate((id) => { HFA.select(HFA.S.pages[1].id, id); document.querySelectorAll('.slot')[1].scrollIntoView({ block: 'start' }); }, t.id);
  await page.waitForTimeout(250);
  const b = await page.evaluate(() => { const e = HFA.selection().els[0]; return { x: e.x, y: e.y, w: e.w, h: e.h }; });
  const s = await screenPt(page, 1, b.x + 3, b.y + b.h / 2);
  const target = 595 / 2 - b.w / 2 + 2; // perto do centro
  const d = await screenPt(page, 1, target + 3, b.y + b.h / 2 + 40);
  await page.mouse.move(s.x, s.y); await page.mouse.down(); await page.mouse.move(d.x, d.y, { steps: 8 });
  ok(await page.locator('.guide.v').count() >= 1, 'guia vertical deveria aparecer');
  await page.mouse.up();
  const e2 = await page.evaluate(() => HFA.selection().els[0]);
  ok(Math.abs(e2.x + e2.w / 2 - 595 / 2) < 0.6, `deveria encaixar no centro (centro em ${e2.x + e2.w / 2})`);
});

await test('desfazer e refazer', async () => {
  const n = (await els(page, 1)).length;
  await page.keyboard.press('Control+z'); await page.keyboard.press('Control+z');
  ok((await els(page, 1)).length === 0, 'desfazer deveria remover a colagem');
  await page.keyboard.press('Control+y'); await page.keyboard.press('Control+y');
  ok((await els(page, 1)).length === n, 'refazer deveria restaurar');
});

await test('rascunho automático é recuperado depois de recarregar', async () => {
  const before = await page.evaluate(() => HFA.S.pages.map((p) => p.els.length));
  await page.evaluate(() => HFA.flushSave());
  await page.waitForTimeout(300);
  page.once('dialog', (d) => d.accept());
  await page.reload(); await page.waitForFunction(() => window.HFA);
  await page.waitForSelector('#restore:not([hidden])');
  await page.click('#restoreBtn');
  await page.waitForSelector('#editor:not([hidden]) .slot');
  const after = await page.evaluate(() => HFA.S.pages.map((p) => p.els.length));
  ok(JSON.stringify(before) === JSON.stringify(after), `rascunho diferente: ${before} vs ${after}`);
  const out2 = await build(page);
  ok(out2.bytes.length > 1000 && out2.mode === 'inplace', 'exportação após recuperar');
});

await test('páginas reorganizadas: cópia em lote não duplica fontes', async () => {
  page.once('dialog', (d) => d.accept());
  await page.click('#backBtn');
  await page.waitForSelector('#landing:not([hidden])');
  await open(page, 'fonte-compartilhada.pdf');
  await page.evaluate(() => { const p = HFA.S.pages.pop(); HFA.S.pages.unshift(p); });
  ok(await page.evaluate(() => HFA.exportMode()) === 'copy', 'modo deveria ser copy');
  const o = await build(page);
  const d = await PDFDocument.load(o.bytes);
  ok(d.getPageCount() === 10, 'páginas');
  const ratio = o.bytes.length / sharedPdf.length;
  ok(ratio < 1.3, `arquivo inchou ${ratio.toFixed(2)}x (fonte duplicada?)`);
  const txt = await pdfText(o.bytes);
  ok(txt[0].includes('Página 10') && txt[1].includes('Página 1'), 'ordem das páginas');
});

await test('documento longo: canvases fora da tela são liberados', async () => {
  page.once('dialog', (d) => d.accept());
  await page.click('#backBtn');
  await open(page, 'longo.pdf');
  for (let i = 0; i < 30; i++) { await page.evaluate(() => { const v = document.getElementById('viewer'); v.scrollTop += v.clientHeight; }); await page.waitForTimeout(60); }
  await page.waitForTimeout(500);
  const st = await page.evaluate(() => HFA.cacheStats());
  ok(st.domCanvases <= 8, `canvases na página: ${st.domCanvases}`);
  ok(st.mb <= 170, `cache acima do limite: ${st.mb} MB`);
});

await test('zoom por pinça (toque)', async () => {
  const cdp = await ctx.newCDPSession(page);
  const z0 = await page.evaluate(() => HFA.S.zoom);
  const box = await page.locator('#viewer').boundingBox();
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  const tp = (d) => [{ x: cx - d, y: cy, id: 1 }, { x: cx + d, y: cy, id: 2 }];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: tp(50) });
  for (const d of [70, 90, 110]) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: tp(d) });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(300);
  const z1 = await page.evaluate(() => HFA.S.zoom);
  ok(z1 > z0 * 1.8, `zoom deveria ~dobrar (${z0} → ${z1})`);
});

await test('página em branco, assinatura digitada e corretivo virando tarja', async () => {
  page.once('dialog', (d) => d.accept());
  await page.click('#backBtn');
  await page.click('#blankBtn');
  await page.waitForSelector('#editor:not([hidden]) .slot');
  await page.keyboard.press('s');
  await page.click('#sigDlg [data-tab="type"]');
  await page.fill('#sigName', 'Maria Souza');
  await page.click('#sigOk');
  await page.waitForFunction(() => HFA.S.pages[0].els.some((e) => e.sig));
  await page.keyboard.press('w');
  const a = await screenPt(page, 0, 100, 100), b = await screenPt(page, 0, 200, 140);
  await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move(b.x, b.y, { steps: 4 }); await page.mouse.up();
  ok(await page.locator('#props [data-prop="burn"]').isVisible(), 'opção Definitivo deveria aparecer para o corretivo');
  await page.check('#pBurn');
  const w = (await els(page)).find((e) => e.type === 'whiteout');
  ok(w.burn === true, 'corretivo deveria virar tarja');
  ok((await page.locator('.layer').allInnerTexts()).some((t) => t.includes('Tarja')), 'lista deveria mostrar Tarja');
  const o = await build(page);
  ok(o.mode === 'copy' && o.burned === 0, 'página em branco não precisa ser rasterizada');
  const d = await PDFDocument.load(o.bytes);
  ok(d.getPageCount() === 1, 'uma página');
});

// ---------- conversão PDF <-> Word ----------
async function makeConvPdf() {
  const d = await PDFDocument.create();
  const f = await d.embedFont(StandardFonts.Helvetica), fb = await d.embedFont(StandardFonts.HelveticaBold);
  const p = d.addPage([595, 842]);
  p.drawText('Relatório de Conversão', { x: 72, y: 770, size: 20, font: fb });
  const words = ('A conversão precisa manter a aparência original com fidelidade, quebrando as linhas nos mesmos pontos e mantendo o espaçamento entre parágrafos. ').repeat(4).trim().split(' ');
  let line = '', y = 735;
  const lines = [];
  for (const w of words) { const t = line ? line + ' ' + w : w; if (f.widthOfTextAtSize(t, 11) > 451) { lines.push(line); line = w; } else line = t; }
  lines.push(line);
  for (const l of lines) { p.drawText(l, { x: 72, y, size: 11, font: f }); y -= 14; }
  y -= 10;
  p.drawText('Texto com', { x: 72, y, size: 11, font: f });
  const ux = 72 + f.widthOfTextAtSize('Texto com ', 11);
  p.drawText('sublinhado', { x: ux, y, size: 11, font: f });
  p.drawLine({ start: { x: ux, y: y - 1.5 }, end: { x: ux + f.widthOfTextAtSize('sublinhado', 11), y: y - 1.5 }, thickness: 0.6 });
  const rx = ux + f.widthOfTextAtSize('sublinhado ', 11);
  p.drawText('vermelho', { x: rx, y, size: 11, font: f, color: rgb(0.86, 0.1, 0.1) });
  const lx = rx + f.widthOfTextAtSize('vermelho ', 11);
  p.drawText('example.com', { x: lx, y, size: 11, font: f, color: rgb(0, 0.3, 0.8) });
  const link = d.context.obj({ Type: 'Annot', Subtype: 'Link', Rect: [lx, y - 2, lx + f.widthOfTextAtSize('example.com', 11), y + 9], Border: [0, 0, 0], A: { Type: 'Action', S: 'URI', URI: PDFString.of('https://example.com/') } });
  p.node.set(PDFName.of('Annots'), d.context.obj([d.context.register(link)]));
  // tabela 3x3 com réguas
  const top = y - 30, rows = 3, cols = [72, 222, 372, 522], rh = 22;
  for (let r = 0; r <= rows; r++) p.drawLine({ start: { x: cols[0], y: top - r * rh }, end: { x: cols[3], y: top - r * rh }, thickness: 0.75 });
  for (const x of cols) p.drawLine({ start: { x, y: top }, end: { x, y: top - rows * rh }, thickness: 0.75 });
  const cells = [['Produto', 'Qtd', 'Valor'], ['Parafuso', '1200', '360,00'], ['Porca', '850', '212,50']];
  cells.forEach((row, r) => row.forEach((t, c) => p.drawText(t, { x: cols[c] + 4, y: top - r * rh - 15, size: 11, font: r ? f : fb })));
  const p2 = d.addPage([595, 842]);
  p2.drawText('Segunda página do documento', { x: 72, y: 770, size: 14, font: f });
  return d.save();
}

/** .docx feito à mão: lista numerada, tabulação à direita, tabela, rodapé com PAGE/NUMPAGES e 3+ páginas. */
async function makeConvDocx() {
  const JSZip = (await import('jszip')).default;
  const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
  const run = (t, rpr = '') => `<w:r>${rpr ? `<w:rPr>${rpr}</w:rPr>` : ''}<w:t xml:space="preserve">${t}</w:t></w:r>`;
  const para = (inner, ppr = '') => `<w:p>${ppr ? `<w:pPr>${ppr}</w:pPr>` : ''}${inner}</w:p>`;
  let body = para(run('Documento de Teste', '<w:b/><w:sz w:val="36"/>'));
  for (const t of ['Primeiro item', 'Segundo item', 'Terceiro item']) body += para(run(t), '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr><w:ind w:left="720" w:hanging="360"/>');
  body += para(run('Nome') + '<w:r><w:tab/></w:r>' + run('Valor'), '<w:tabs><w:tab w:val="right" w:pos="8000"/></w:tabs>');
  body += '<w:tbl><w:tblPr><w:tblW w:w="6000" w:type="dxa"/><w:tblBorders><w:top w:val="single" w:sz="4"/><w:left w:val="single" w:sz="4"/><w:bottom w:val="single" w:sz="4"/><w:right w:val="single" w:sz="4"/><w:insideH w:val="single" w:sz="4"/><w:insideV w:val="single" w:sz="4"/></w:tblBorders></w:tblPr><w:tblGrid><w:gridCol w:w="3000"/><w:gridCol w:w="3000"/></w:tblGrid>'
    + ['A1|B1', 'A2|B2'].map((r) => `<w:tr>${r.split('|').map((c) => `<w:tc><w:tcPr><w:tcW w:w="3000" w:type="dxa"/></w:tcPr>${para(run('Celula ' + c))}</w:tc>`).join('')}</w:tr>`).join('') + '</w:tbl>';
  for (let i = 1; i <= 70; i++) body += para(run(`Parágrafo ${i}: texto de preenchimento para ocupar várias páginas e testar a paginação refeita no navegador.`));
  body += '<w:sectPr><w:footerReference w:type="default" r:id="rIdF"/><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr>';
  const fld = (instr, cache) => `<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> ${instr} </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r>${run(cache)}<w:r><w:fldChar w:fldCharType="end"/></w:r>`;
  const footer = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:ftr ${W}>${para(run('Página ') + fld('PAGE', '1') + run(' de ') + fld('NUMPAGES', '1'))}</w:ftr>`;
  const z = new JSZip();
  z.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/><Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/></Types>');
  z.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  z.file('word/_rels/document.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdN" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/><Relationship Id="rIdF" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/></Relationships>');
  z.file('word/numbering.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:numbering ${W}><w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num></w:numbering>`);
  z.file('word/footer1.xml', footer);
  z.file('word/document.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${W}><w:body>${body}</w:body></w:document>`);
  return z.generateAsync({ type: 'nodebuffer' });
}
async function pdfItems(bytes) {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes), isEvalSupported: false, verbosity: 0, standardFontDataUrl: join(root, 'node_modules/pdfjs-dist/standard_fonts/') }).promise;
  const pages = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const pg = await doc.getPage(i), vp = pg.getViewport({ scale: 1 });
    pages.push({ w: vp.width, h: vp.height, items: (await pg.getTextContent()).items.filter((it) => it.str.trim()).map((it) => ({ s: it.str, x: it.transform[4], y: vp.height - it.transform[5], w: it.width })) });
  }
  await doc.destroy();
  return pages;
}
const toB64 = (b) => Buffer.from(b).toString('base64');
const p2d = (pg, b64, mode) => pg.evaluate(async ([b64, mode]) => {
  const { pdfToDocx } = await import('./src/convert/pdf2docx.js');
  const { blob, stats } = await pdfToDocx(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)), { mode });
  const z = await window.JSZip.loadAsync(blob);
  const xml = await z.file('word/document.xml').async('string');
  const rels = await z.file('word/_rels/document.xml.rels').async('string');
  const bad = ['word/document.xml', 'word/styles.xml', 'word/settings.xml', '[Content_Types].xml'].filter(() => false);
  for (const n of Object.keys(z.files)) if (/\.(xml|rels)$/.test(n)) { const t = await z.file(n).async('string'); if (new DOMParser().parseFromString(t, 'application/xml').getElementsByTagName('parsererror').length) bad.push(n); }
  const buf = new Uint8Array(await blob.arrayBuffer());
  let s = ''; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return { xml, rels, bad, stats, media: Object.keys(z.files).filter((n) => n.startsWith('word/media/') && !n.endsWith('/')).length, b64: btoa(s) };
}, [b64, mode]);
const d2p = (pg, b64) => pg.evaluate(async (b64) => {
  const { docxToPdf } = await import('./src/convert/docx2pdf.js');
  const { bytes, stats } = await docxToPdf(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)));
  let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return { b64: btoa(s), stats };
}, b64);

const convPdf = await makeConvPdf(); writeFileSync(join(tmp, 'conversao.pdf'), convPdf);
const convDocx = await makeConvDocx(); writeFileSync(join(tmp, 'teste.docx'), convDocx);
const cp = await newPage(ctx);
await cp.evaluate(async () => { const { loadJSZip } = await import('./src/convert/libs.js'); await loadJSZip(); });

await test('PDF → Word editável: parágrafos, tabela, sublinhado, cor e link', async () => {
  const r = await p2d(cp, toB64(convPdf), 'flow');
  ok(!r.bad.length, 'XML inválido em: ' + r.bad.join(', '));
  ok(r.stats.pages === 2 && (r.xml.match(/<w:sectPr>/g) || []).length === 2, 'uma seção por página');
  const plain = r.xml.replace(/<w:tab\/>/g, '\t').replace(/<[^>]+>/g, '');
  for (const w of ['Relatório de Conversão', 'sublinhado', 'vermelho', 'example.com', 'Parafuso', '212,50', 'Segunda página do documento']) ok(plain.includes(w), 'faltou o texto: ' + w);
  ok(/A conversão precisa manter a aparência original com fidelidade, quebrando as linhas nos mesmos pontos/.test(plain), 'linhas de um parágrafo deveriam ser unidas');
  ok((r.xml.match(/<w:tbl>/g) || []).length === 1 && (r.xml.match(/<w:tr>/g) || []).length === 3, 'deveria haver uma tabela 3x3');
  ok(/<w:u w:val="single"\/><\/w:rPr><w:t xml:space="preserve">sublinhado/.test(r.xml), 'sublinhado deveria virar formatação');
  ok(/<w:color w:val="DB1A1A"\/>/.test(r.xml), 'cor do texto deveria ser mantida');
  ok(/<w:b\/>[\s\S]{0,200}Relatório de Conversão/.test(r.xml), 'título deveria ficar em negrito');
  ok(r.rels.includes('https://example.com/') && r.xml.includes('<w:hyperlink'), 'link deveria ser preservado');
  ok(r.stats.tables === 1, 'estatística de tabelas');
});

await test('PDF → Word idêntico → PDF: o texto volta na mesma posição (±2 pt)', async () => {
  const r = await p2d(cp, toB64(convPdf), 'exact');
  ok(!r.bad.length, 'XML inválido em: ' + r.bad.join(', '));
  ok((r.xml.match(/<wps:txbx>/g) || []).length >= 5, 'texto deveria ir para caixas de texto');
  ok(r.media >= 1, 'fundo da página com os desenhos deveria virar imagem');
  const back = await d2p(cp, r.b64);
  const A = await pdfItems(convPdf), B = await pdfItems(Buffer.from(back.b64, 'base64'));
  ok(A.length === B.length, `páginas: ${A.length} -> ${B.length}`);
  let n = 0, worst = 0;
  A.forEach((pa, i) => {
    for (const it of pa.items) {
      const m = B[i].items.find((q) => q.s.includes(it.s.trim().split(' ')[0]) && Math.abs(q.y - it.y) < 6);
      ok(m, `“${it.s}” sumiu da página ${i + 1}`);
      const dy = Math.abs(m.y - it.y); worst = Math.max(worst, dy); n++;
    }
  });
  ok(worst <= 2, `linha de base desviou ${worst.toFixed(2)} pt`);
  ok(n > 10, 'poucos textos comparados');
});

await test('Word → PDF: paginação, numeração, tabulação, tabela e número de página', async () => {
  const r = await d2p(cp, toB64(convDocx));
  const pages = await pdfItems(Buffer.from(r.b64, 'base64'));
  const N = pages.length;
  ok(N >= 3, `deveria ter 3+ páginas (tem ${N})`);
  pages.forEach((pg, i) => {
    const t = pg.items.map((q) => q.s).join(' ');
    ok(t.includes(`Página ${i + 1} de ${N}`), `rodapé da página ${i + 1}: ${t.slice(-60)}`);
    for (const q of pg.items) ok(q.x >= 0 && q.x + q.w <= pg.w + 1 && q.y > 0 && q.y <= pg.h, `texto fora da página ${i + 1}: ${q.s}`);
  });
  const all = pages.flatMap((pg) => pg.items.map((q) => q.s)).join(' ');
  for (const m of ['1.', '2.', '3.']) ok(all.includes(m), 'numeração da lista: ' + m);
  let last = 0;
  for (let i = 1; i <= 70; i++) { const k = all.indexOf(`Parágrafo ${i}:`); ok(k > last, `parágrafo ${i} fora de ordem ou faltando`); last = k; }
  const valor = pages[0].items.find((q) => q.s.includes('Valor'));
  ok(valor && Math.abs(valor.x + valor.w - (72 + 400)) < 2, `tabulação à direita em 472 pt (ficou em ${valor && (valor.x + valor.w).toFixed(1)})`);
  ok(all.includes('Celula A1') && all.includes('Celula B2'), 'tabela');
  ok(r.stats.lostChars === 0 && r.stats.lostImages === 0, 'nada deveria se perder');
});

await test('abrir um .docx na tela inicial converte e abre no editor', async () => {
  const p = await newPage(ctx);
  await p.setInputFiles('#fileIn', join(tmp, 'teste.docx'));
  await p.waitForSelector('#editor:not([hidden]) .slot', { timeout: 30000 });
  ok(await p.evaluate(() => HFA.S.pages.length) >= 3, 'deveria abrir as páginas convertidas');
  ok((await p.textContent('#fname')).endsWith('.pdf'), 'nome do arquivo .pdf');
  await p.close();
});

await test('diálogo de conversão: escolher arquivo, converter e baixar', async () => {
  const p = await newPage(ctx);
  await p.click('[data-open-conv="p2w"]');
  await p.setInputFiles('#convIn', join(tmp, 'conversao.pdf'));
  const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 30000 }), p.click('#convGo')]);
  ok(dl.suggestedFilename() === 'conversao.docx', 'nome do arquivo: ' + dl.suggestedFilename());
  await p.waitForSelector('#convResult .ok');
  await p.click('#convDlg [data-conv="w2p"]');
  await p.setInputFiles('#convIn', join(tmp, 'teste.docx'));
  const [dl2] = await Promise.all([p.waitForEvent('download', { timeout: 30000 }), p.click('#convGo')]);
  ok(dl2.suggestedFilename() === 'teste.pdf', 'nome do PDF: ' + dl2.suggestedFilename());
  await p.click('#convResult .btn-primary'); // Abrir no editor
  await p.waitForSelector('#editor:not([hidden]) .slot');
  await p.close();
});

await ctx.close();

await test('funciona offline com o service worker', async () => {
  const c2 = await browser.newContext();
  const p2 = await newPage(c2, '?sw=1');
  await p2.evaluate(() => navigator.serviceWorker.ready);
  await p2.reload(); await p2.waitForFunction(() => navigator.serviceWorker.controller);
  await c2.setOffline(true);
  await p2.reload(); await p2.waitForFunction(() => window.HFA, null, { timeout: 8000 });
  await p2.setInputFiles('#fileIn', join(tmp, 'contrato.pdf'));
  await p2.waitForFunction(() => document.querySelector('.cv canvas'));
  ok(true);
  await c2.close();
});

await test('sem erros no console, violações de CSP ou requisições externas', async () => {
  ok(!problems.length, problems.join('\n'));
});

await browser.close(); srv.close();
const fail = results.filter((r) => !r[0]).length;
console.log(`\n${results.length - fail} de ${results.length} testes passaram.`);
process.exit(fail ? 1 : 0);
