// Testes de ponta a ponta (Playwright + Chromium).
// Uso: npm test        (CHROME=/caminho/do/chrome para usar um Chrome já instalado)
import { chromium } from 'playwright';
import { PDFDocument, StandardFonts, rgb, PDFRawStream, PDFName } from 'pdf-lib';
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
