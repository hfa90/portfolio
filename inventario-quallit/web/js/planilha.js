// Leitura de planilhas (Excel .xlsx e CSV) e montagem do .zip do kit Invent_local.
// Usado pelo painel (Máquinas → Importar coleta) e pela página pública "Registrar computador".
// Sem bibliotecas externas: o .xlsx é um zip de XMLs; descompacta com DecompressionStream.

/* ------------------------------------------------------------------ CSV */
export function lerCSV(texto) {
  texto = texto.replace(/^﻿/, '');
  const primeira = texto.split(/\r?\n/)[0] || '';
  const sep = [';', '\t', ','].sort((a, b) => primeira.split(b).length - primeira.split(a).length)[0];
  const linhas = []; let campo = '', linha = [], aspas = false;
  for (let i = 0; i < texto.length; i++) {
    const ch = texto[i];
    if (aspas) {
      if (ch === '"' && texto[i + 1] === '"') { campo += '"'; i++; } else if (ch === '"') aspas = false; else campo += ch;
    } else if (ch === '"') aspas = true;
    else if (ch === sep) { linha.push(campo); campo = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && texto[i + 1] === '\n') i++; linha.push(campo); linhas.push(linha); linha = []; campo = ''; }
    else campo += ch;
  }
  if (campo || linha.length) { linha.push(campo); linhas.push(linha); }
  return linhas.filter((l) => l.some((c) => c.trim()));
}
export const normCab = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
export function lerValor(v) {
  v = String(v || '').replace(/[R$\s]/g, '');
  if (!v) return null;
  if (v.includes(',')) v = v.replace(/\./g, '').replace(',', '.');
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/* ------------------------------------------------------------------ ZIP (leitura) */
async function inflar(bytes) {
  const ds = new DecompressionStream('deflate-raw');
  const buf = await new Response(new Blob([bytes]).stream().pipeThrough(ds)).arrayBuffer();
  return new Uint8Array(buf);
}
async function lerZip(buf) {
  const u8 = new Uint8Array(buf), dv = new DataView(buf);
  let fim = -1;
  for (let i = u8.length - 22; i >= Math.max(0, u8.length - 66000); i--) { if (dv.getUint32(i, true) === 0x06054b50) { fim = i; break; } }
  if (fim < 0) throw new Error('arquivo não é uma planilha do Excel (.xlsx) válida');
  const total = dv.getUint16(fim + 10, true);
  let p = dv.getUint32(fim + 16, true);
  const dec = new TextDecoder();
  const arquivos = {};
  for (let n = 0; n < total; n++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const metodo = dv.getUint16(p + 10, true), tam = dv.getUint32(p + 20, true);
    const lnome = dv.getUint16(p + 28, true), lextra = dv.getUint16(p + 30, true), lcom = dv.getUint16(p + 32, true);
    const local = dv.getUint32(p + 42, true);
    const nome = dec.decode(u8.subarray(p + 46, p + 46 + lnome));
    const ini = local + 30 + dv.getUint16(local + 26, true) + dv.getUint16(local + 28, true);
    arquivos[nome] = { metodo, dados: u8.subarray(ini, ini + tam) };
    p += 46 + lnome + lextra + lcom;
  }
  return {
    nomes: Object.keys(arquivos),
    async texto(nome) {
      const a = arquivos[nome]; if (!a) return null;
      if (a.metodo === 0) return dec.decode(a.dados);
      if (a.metodo === 8) return dec.decode(await inflar(a.dados));
      throw new Error('compactação não suportada na planilha');
    },
  };
}

/* ------------------------------------------------------------------ XLSX → linhas (1ª aba) */
const colNum = (ref) => { let n = 0; for (const c of ref.replace(/\d+$/, '')) n = n * 26 + (c.charCodeAt(0) - 64); return n - 1; };
export async function lerXlsx(buf) {
  if (!('DecompressionStream' in window)) throw new Error('navegador antigo: atualize o Chrome/Edge ou salve a planilha como CSV');
  const zip = await lerZip(buf);
  const xml = (t) => new DOMParser().parseFromString(t, 'application/xml');
  const tags = (el, nome) => [...el.getElementsByTagNameNS('*', nome)];
  // primeira aba, pela ordem do workbook
  let caminho = 'xl/worksheets/sheet1.xml';
  try {
    const wb = xml(await zip.texto('xl/workbook.xml'));
    const rid = tags(wb, 'sheet')[0]?.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
    const rels = xml(await zip.texto('xl/_rels/workbook.xml.rels'));
    const alvo = tags(rels, 'Relationship').find((r) => r.getAttribute('Id') === rid)?.getAttribute('Target');
    if (alvo) caminho = alvo.startsWith('/') ? alvo.slice(1) : 'xl/' + alvo.replace(/^\.\//, '');
  } catch { /* usa a sheet1 */ }
  if (!zip.nomes.includes(caminho)) caminho = zip.nomes.find((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n));
  if (!caminho) throw new Error('a planilha não tem nenhuma aba');
  const comp = [];
  const ss = await zip.texto('xl/sharedStrings.xml');
  if (ss) tags(xml(ss), 'si').forEach((si) => comp.push(tags(si, 't').map((t) => t.textContent).join('')));
  const doc = xml(await zip.texto(caminho));
  const linhas = [];
  for (const row of tags(doc, 'row')) {
    const l = [];
    for (const c of tags(row, 'c')) {
      const t = c.getAttribute('t');
      const v = tags(c, 'v')[0]?.textContent ?? '';
      let val;
      if (t === 's') val = comp[Number(v)] ?? '';
      else if (t === 'inlineStr') val = tags(c, 't').map((x) => x.textContent).join('');
      else if (t === 'b') val = v === '1' ? 'VERDADEIRO' : 'FALSO';
      else val = v;
      const ref = c.getAttribute('r');
      l[ref ? colNum(ref) : l.length] = val;
    }
    for (let i = 0; i < l.length; i++) if (l[i] === undefined) l[i] = '';
    linhas.push(l);
  }
  return linhas.filter((l) => l.some((c) => String(c).trim()));
}

// arquivo escolhido (.xlsx ou .csv) → linhas
export async function lerArquivoPlanilha(file) {
  const buf = await file.arrayBuffer();
  const u8 = new Uint8Array(buf);
  if (u8[0] === 0x50 && u8[1] === 0x4b) return lerXlsx(buf);   // "PK": zip (.xlsx)
  if (/\.xls$/i.test(file.name)) throw new Error('formato .xls antigo: no Excel use Salvar como → Pasta de Trabalho do Excel (.xlsx)');
  let txt = new TextDecoder('utf-8').decode(buf);
  if (txt.includes('�')) txt = new TextDecoder('windows-1252').decode(buf); // CSV salvo pelo Excel em ANSI
  return lerCSV(txt);
}

/* ------------------------------------------------------------------ linhas → coletas */
const up = (v) => String(v ?? '').trim().toUpperCase();
const CAB_COLETA = {
  hostname: ['hostname', 'nome_do_computador', 'computador'],
  ativo: ['patrimonio', 'ativo', 'n_patrimonio', 'numero_do_ativo'],
  setor: ['setor', 'departamento', 'setor_departamento'],
  localizacao: ['localizacao', 'local'],
  responsavel: ['responsavel', 'colaborador'],
  tipo: ['tipo'],
  fabricante: ['fabricante', 'marca'],
  modelo: ['modelo'],
  numero_serie: ['numero_de_serie', 'serial', 'serie', 'numero_serie', 'n_serie', 'n_de_serie', 'service_tag'],
  so_nome: ['sistema_operacional', 'sistema', 'so'],
  so_display_version: ['versao'],
  so_build: ['build'],
  cpu: ['processador', 'cpu'],
  cpu_nucleos: ['nucleos'],
  memoria_gb: ['ram_gb', 'ram', 'memoria', 'memoria_gb'],
  armazenamento_total_gb: ['armazenamento_gb', 'armazenamento', 'disco_gb'],
  armazenamento_livre_gb: ['livre_gb', 'livre'],
  disco_txt: ['disco', 'discos'],
  ip: ['ip', 'endereco_ip'],
  mac: ['mac'],
  dominio: ['dominio'],
  usuario_logado: ['usuario', 'usuario_logado'],
  dados: ['dados_nao_editar', 'dados'],
};
const lerNum = (v) => { const s = String(v ?? '').replace(/[^\d.,-]/g, ''); return s ? lerValor(s) : null; };

// Aceita a planilha do Invent_local novo (inventario-quallit.xlsx/.csv) e a antiga (list_info.csv).
export function coletasDaPlanilha(linhas) {
  if (linhas.length < 2) return { erro: 'A planilha está vazia.' };
  const cab = linhas[0].map(normCab);
  const idx = Object.fromEntries(Object.entries(CAB_COLETA).map(([k, nomes]) => [k, cab.findIndex((c) => nomes.includes(c))]));
  if (idx.hostname < 0) return { erro: 'Não encontrei a coluna HOSTNAME. Use a planilha gerada pelo Invent_local (inventario-quallit.xlsx).' };
  const porChave = new Map(); let repetidas = 0;
  linhas.slice(1).forEach((l, i) => {
    const pegar = (k) => (idx[k] >= 0 ? String(l[idx[k]] ?? '').trim() : '');
    if (!pegar('hostname')) return;
    let base = {};
    if (pegar('dados')) { try { base = JSON.parse(pegar('dados')) || {}; } catch { base = {}; } }
    const r = { ...base, _linha: i + 2 };
    // colunas visíveis valem mais que o JSON (podem ter sido corrigidas no Excel)
    for (const k of ['hostname', 'ativo', 'setor', 'localizacao', 'responsavel', 'fabricante', 'modelo', 'numero_serie', 'so_nome', 'so_display_version', 'so_build', 'cpu', 'ip', 'mac', 'dominio', 'usuario_logado']) {
      if (idx[k] >= 0) r[k] = pegar(k) || null;
    }
    const tipo = pegar('tipo').toLowerCase();
    if (['desktop', 'notebook', 'servidor', 'outro'].includes(tipo)) r.tipo = tipo;
    for (const k of ['memoria_gb', 'armazenamento_total_gb', 'armazenamento_livre_gb', 'cpu_nucleos']) {
      if (idx[k] >= 0 && pegar(k) && !(k in base)) r[k] = lerNum(pegar(k));
    }
    if (!base.discos && pegar('disco_txt')) {
      r.discos = pegar('disco_txt').split(/\s*\/\s*/).filter(Boolean).map((mod) => ({ modelo: mod, tipo: /ssd|nvme/i.test(mod) ? 'SSD' : 'Desconhecido', tamanho_gb: null }));
    }
    const serie = (r.numero_serie || '').toUpperCase();
    const chave = serie.length >= 3 && !/O\.?E\.?M|DEFAULT|SYSTEM SERIAL|^0+$/.test(serie) ? 'S:' + serie : 'H:' + up(r.hostname);
    if (porChave.has(chave)) repetidas++;
    porChave.set(chave, r);   // a última linha de cada computador vale
  });
  const lista = [...porChave.values()];
  if (!lista.length) return { erro: 'Nenhum computador encontrado na planilha.' };
  return { lista, repetidas, completa: idx.dados >= 0 };
}

/* ------------------------------------------------------------------ ZIP (escrita, sem compressão) */
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (u8) => { let c = 0xffffffff; for (const b of u8) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
// arquivos: [{ nome: 'pasta/arquivo.txt', dados: Uint8Array }] → Blob .zip
export function criarZip(arquivos) {
  const enc = new TextEncoder();
  const agora = new Date();
  const hora = (agora.getHours() << 11) | (agora.getMinutes() << 5) | (agora.getSeconds() >> 1);
  const dia = ((agora.getFullYear() - 1980) << 9) | ((agora.getMonth() + 1) << 5) | agora.getDate();
  const partes = [], central = []; let pos = 0;
  for (const a of arquivos) {
    const nome = enc.encode(a.nome), crc = crc32(a.dados), tam = a.dados.length;
    const h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true);
    h.setUint16(10, hora, true); h.setUint16(12, dia, true); h.setUint32(14, crc, true); h.setUint32(18, tam, true); h.setUint32(22, tam, true);
    h.setUint16(26, nome.length, true); h.setUint16(28, 0, true);
    partes.push(h, nome, a.dados);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, 0, true);
    c.setUint16(12, hora, true); c.setUint16(14, dia, true); c.setUint32(16, crc, true); c.setUint32(20, tam, true); c.setUint32(24, tam, true);
    c.setUint16(28, nome.length, true); c.setUint32(42, pos, true);
    central.push(c, nome);
    pos += 30 + nome.length + tam;
  }
  const tamCentral = central.reduce((s, x) => s + x.byteLength, 0);
  const f = new DataView(new ArrayBuffer(22));
  f.setUint32(0, 0x06054b50, true); f.setUint16(8, arquivos.length, true); f.setUint16(10, arquivos.length, true);
  f.setUint32(12, tamCentral, true); f.setUint32(16, pos, true);
  return new Blob([...partes, ...central, f], { type: 'application/zip' });
}

// baixa os arquivos do kit do site e devolve o Invent_local.zip.
// config (opcional): { supabase_url, supabase_anon_key, convite } → vira Invent_local/config.json e liga o envio automático.
export async function montarKitInventLocal(base = 'agente/planilha/', config = null) {
  const nomes = ['COLETAR.bat', 'coletar.ps1', 'LEIA-ME.txt'];
  const arquivos = await Promise.all(nomes.map(async (n) => {
    const r = await fetch(base + n + '?v=' + Date.now(), { cache: 'no-store' });
    if (!r.ok) throw new Error(`arquivo ${n} não encontrado no site`);
    return { nome: 'Invent_local/' + n, dados: new Uint8Array(await r.arrayBuffer()) };
  }));
  if (config) arquivos.push({ nome: 'Invent_local/config.json', dados: new TextEncoder().encode(JSON.stringify(config, null, 2)) });
  return criarZip(arquivos);
}
