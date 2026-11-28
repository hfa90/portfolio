// "Esvaziamento" de fontes TrueType: mantém a fonte inteira (mesma quantidade de
// glifos, mesmo cmap e métricas), mas apaga o desenho dos glifos que o
// documento não usa. Substitui o subset do fontkit do pdf-lib, que corrompe
// várias fontes. O PDF fica pequeno e os índices de glifo continuam válidos.

function tables(dv) {
  const n = dv.getUint16(4), out = {};
  for (let i = 0; i < n; i++) {
    const o = 12 + i * 16;
    const tag = String.fromCharCode(dv.getUint8(o), dv.getUint8(o + 1), dv.getUint8(o + 2), dv.getUint8(o + 3));
    out[tag] = { off: dv.getUint32(o + 8), len: dv.getUint32(o + 12) };
  }
  return out;
}
function checksum(bytes) {
  const p = new Uint8Array((bytes.length + 3) & ~3); p.set(bytes);
  const dv = new DataView(p.buffer); let s = 0;
  for (let i = 0; i < p.length; i += 4) s = (s + dv.getUint32(i)) >>> 0;
  return s;
}

/** bytes: TTF; used: Set de índices de glifo. Devolve um novo Uint8Array (ou o original se não der). */
export function hollow(bytes, used) {
  try {
    const src = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    const dv = new DataView(src.buffer, src.byteOffset, src.byteLength);
    if (dv.getUint32(0) !== 0x00010000 && dv.getUint32(0) !== 0x74727565) return src; // só TrueType
    const T = tables(dv);
    if (!T.glyf || !T.loca || !T.head || !T.maxp) return src;
    const n = dv.getUint16(T.maxp.off + 4);
    const longLoca = dv.getInt16(T.head.off + 50) === 1;
    const loc = (i) => (longLoca ? dv.getUint32(T.loca.off + i * 4) : dv.getUint16(T.loca.off + i * 2) * 2);
    const keep = new Set([0]);
    const stack = [...used].filter((g) => g >= 0 && g < n);
    while (stack.length) { // componentes dos glifos compostos também ficam
      const g = stack.pop(); if (keep.has(g)) continue; keep.add(g);
      const a = loc(g), b = loc(g + 1); if (b - a < 10) continue;
      const o = T.glyf.off + a;
      if (dv.getInt16(o) >= 0) continue;
      let p = o + 10, more = true;
      while (more) {
        const flags = dv.getUint16(p), comp = dv.getUint16(p + 2); p += 4;
        p += flags & 1 ? 4 : 2;
        if (flags & 8) p += 2; else if (flags & 0x40) p += 4; else if (flags & 0x80) p += 8;
        if (!keep.has(comp)) stack.push(comp);
        more = !!(flags & 0x20);
      }
    }
    // novo glyf + loca (formato longo)
    const parts = []; const offs = new Uint32Array(n + 1); let size = 0;
    for (let g = 0; g < n; g++) {
      offs[g] = size;
      if (!keep.has(g)) continue;
      const a = loc(g), b = loc(g + 1); const len = b - a; if (len <= 0) continue;
      parts.push(src.subarray(T.glyf.off + a, T.glyf.off + b)); size += len;
      const pad = (4 - (len % 4)) % 4; if (pad) { parts.push(new Uint8Array(pad)); size += pad; }
    }
    offs[n] = size;
    const glyf = new Uint8Array(size); let q = 0; for (const p of parts) { glyf.set(p, q); q += p.length; }
    const loca = new Uint8Array((n + 1) * 4); const ldv = new DataView(loca.buffer); offs.forEach((v, i) => ldv.setUint32(i * 4, v));
    const head = src.slice(T.head.off, T.head.off + T.head.len); new DataView(head.buffer).setInt16(50, 1); new DataView(head.buffer).setUint32(8, 0);
    // remonta o arquivo
    const tags = Object.keys(T).sort();
    const data = tags.map((t) => (t === 'glyf' ? glyf : t === 'loca' ? loca : t === 'head' ? head : src.subarray(T[t].off, T[t].off + T[t].len)));
    let total = 12 + tags.length * 16; const at = [];
    for (const d of data) { at.push(total); total += (d.length + 3) & ~3; }
    const out = new Uint8Array(total); const o = new DataView(out.buffer);
    out.set(src.subarray(0, 12)); o.setUint16(4, tags.length);
    tags.forEach((t, i) => {
      const r = 12 + i * 16;
      for (let k = 0; k < 4; k++) o.setUint8(r + k, t.charCodeAt(k));
      o.setUint32(r + 4, checksum(data[i])); o.setUint32(r + 8, at[i]); o.setUint32(r + 12, data[i].length);
      out.set(data[i], at[i]);
    });
    const hi = tags.indexOf('head');
    o.setUint32(at[hi] + 8, (0xB1B0AFBA - checksum(out)) >>> 0); // checkSumAdjustment
    return out;
  } catch (e) { console.warn('hollow', e); return bytes; }
}
