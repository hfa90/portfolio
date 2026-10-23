/* Prospecta · regras de limpeza dos dados do Google Maps (sem IA).
   Porta em JavaScript do robo/dados.py — mantenha os dois em sincronia. */
(function (g) {
  'use strict';
  const UFS = new Set('AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' '));
  const ABREV = [
    [/^R\.\s*/i, 'Rua '], [/^Av\.\s*/i, 'Avenida '], [/^Al\.\s*/i, 'Alameda '], [/^Tv\.\s*/i, 'Travessa '],
    [/^Trav\.\s*/i, 'Travessa '], [/^Pç\.\s*/i, 'Praça '], [/^Pça\.\s*/i, 'Praça '], [/^Pr\.\s*/i, 'Praça '],
    [/^Rod\.\s*/i, 'Rodovia '], [/^Estr\.\s*/i, 'Estrada '], [/^Lgo\.\s*/i, 'Largo '], [/^Lg\.\s*/i, 'Largo '],
    [/^Vl\.\s*/i, 'Viela '], [/^Jd\.\s*/i, 'Jardim '],
  ];
  const PREFIXO = /^(rua|r\.|avenida|av\.|alameda|al\.|travessa|tv\.|trav\.|pra[cç]a|p[cç]a?\.|rodovia|rod\.|estrada|estr\.|largo|lgo?\.|viela|vl\.|via|viaduto|vd\.|ladeira|passagem|servid[aã]o|beco|quadra|qd\.|setor|sqs|shs|scs|cln|cls|shn|br-|sp-|rj-|mg-|pr-|sc-|rs-|go-|ba-)(?=[\s\d-]|$)/i;
  const RE_CEP = /\b(\d{5})-?(\d{3})\b/;
  const RE_CIDADE_UF = /(?:^|,|\s-\s)\s*((?:(?!\s-\s)[^,])+?)\s*-\s*([A-Z]{2})\s*,?\s*$/;

  const normalizar = (t) => (t || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();

  function expandir(rua) {
    rua = rua.trim();
    for (const [re, troca] of ABREV) if (re.test(rua)) return rua.replace(re, troca);
    return rua;
  }

  function parseEndereco(endereco) {
    const out = { rua: '', numero: '', complemento: '', bairro: '', cidade: '', uf: '', cep: '' };
    if (!endereco) return out;
    let resto = endereco.trim().replace(/^\s*Endere[cç]o:\s*/i, '').replace(/[\u2013\u2014]/g, '-').replace(/,?\s*Brasil\s*$/i, '');
    const cep = resto.match(RE_CEP);
    if (cep) {
      out.cep = `${cep[1]}-${cep[2]}`;
      resto = (resto.slice(0, cep.index) + resto.slice(cep.index + cep[0].length)).replace(/^[\s,]+|[\s,]+$/g, '');
    }
    const m = resto.match(RE_CIDADE_UF);
    if (m && UFS.has(m[2])) {
      out.cidade = m[1].trim(); out.uf = m[2];
      resto = resto.slice(0, m.index).replace(/^[\s,]+|[\s,]+$/g, '');
    }
    if (!resto) return out;
    const partes = resto.split(/\s+-\s+/).map((p) => p.trim()).filter(Boolean);
    const separa = (t) => {
      if (t.includes(',')) {
        const i = t.lastIndexOf(',');
        const rua = t.slice(0, i), num = t.slice(i + 1).trim();
        if (/^(\d+[A-Za-z]?|s\/?n|km\s*[\d,.]+.*|\d+\s*-\s*\d+)$/i.test(num)) return [expandir(rua), num];
        return [expandir(t), ''];
      }
      const m2 = t.match(/^(.*?\D)\s+(\d+[A-Za-z]?)$/);
      if (m2 && PREFIXO.test(t)) return [expandir(m2[1]), m2[2]];
      return [expandir(t), ''];
    };
    const pareceRua = (t) => PREFIXO.test(t) || /,\s*(\d+|s\/?n)/i.test(t);
    if (partes.length === 1) {
      if (pareceRua(partes[0])) [out.rua, out.numero] = separa(partes[0]);
      else out.bairro = partes[0];
    } else {
      const primeiro = partes[0], ultimo = partes[partes.length - 1];
      if (pareceRua(primeiro)) {
        [out.rua, out.numero] = separa(primeiro);
        out.bairro = ultimo;
        out.complemento = partes.slice(1, -1).join(' - ');
      } else {
        out.complemento = partes.slice(0, -1).join(' - ');
        out.bairro = ultimo;
      }
    }
    if (out.bairro && /^(sala|loja|conj|cj|andar|bloco|apto|box|lj|sl)\b/i.test(out.bairro)) {
      out.complemento = [out.complemento, out.bairro].filter(Boolean).join(' - ');
      out.bairro = '';
    }
    return out;
  }

  function limparTelefone(tel) {
    const out = { telefone: '', telefone_e164: '', celular: false };
    if (!tel) return out;
    tel = tel.trim();
    const dig = tel.replace(/\D/g, '');
    if (!dig) return out;
    let nac = null;
    if (dig.startsWith('55') && (dig.length === 12 || dig.length === 13)) nac = dig.slice(2);
    else if (dig.startsWith('0') && (dig.length === 11 || dig.length === 12)) nac = dig.slice(1);
    else if (dig.length === 10 || dig.length === 11) nac = dig;
    if (nac && !/^0(800|300|500|900)/.test(dig)) {
      const ddd = nac.slice(0, 2), num = nac.slice(2);
      if (num.length === 9) { out.telefone = `(${ddd}) ${num.slice(0, 5)}-${num.slice(5)}`; out.celular = num.startsWith('9'); }
      else out.telefone = `(${ddd}) ${num.slice(0, 4)}-${num.slice(4)}`;
      out.telefone_e164 = '+55' + nac;
      return out;
    }
    out.telefone = tel;
    out.telefone_e164 = tel.startsWith('+') ? '+' + dig : dig;
    return out;
  }

  function numeroBr(v) {
    if (v == null) return null;
    let s = String(v).replace(/[^\d,.]/g, '');
    if (!s) return null;
    if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
    else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
    const n = parseFloat(s);
    return isNaN(n) ? null : n;
  }

  function avaliacoes(v) {
    if (!v) return null;
    const t = normalizar(v);
    const mil = t.match(/([\d.,]+)\s*mil/);
    if (mil) { const n = numeroBr(mil[1]); return n == null ? null : Math.round(n * 1000); }
    const m = t.match(/[\d.,]+/);
    if (!m) return null;
    const s = m[0].replace(/[.,]/g, '');
    return /^\d+$/.test(s) ? parseInt(s, 10) : null;
  }

  function coordsDaUrl(url) {
    if (!url) return [null, null];
    const m = url.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/) || url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
    return m ? [parseFloat(m[1]), parseFloat(m[2])] : [null, null];
  }

  function hash(s) { // FNV-1a 32 bits — só para chave de fallback
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return (h >>> 0).toString(16);
  }

  function chaveDoLugar(url, nome = '', endereco = '') {
    if (url) {
      let m = url.match(/!19s(ChIJ[\w-]+)/);
      if (m) return m[1];
      m = url.match(/!1s(0x[0-9a-f]+:0x[0-9a-f]+)/i);
      if (m) return m[1].toLowerCase();
    }
    return 'h:' + hash(normalizar(nome) + '|' + normalizar(endereco));
  }

  function localCorresponde(local, lead) {
    if (!local) return true;
    const alvo = normalizar(local.split(',')[0]).replace(/^(bairro|rua|r\.|avenida|av\.)\s+/, '');
    if (!alvo) return true;
    return ['endereco', 'bairro', 'rua', 'cidade'].map((k) => normalizar(lead[k])).join(' | ').includes(alvo);
  }

  function siteReal(url) {
    if (!url) return '';
    try {
      const u = new URL(url);
      if (u.hostname.includes('google.') && u.pathname.startsWith('/url')) return u.searchParams.get('q') || u.searchParams.get('url') || '';
    } catch { /* */ }
    return url;
  }

  g.ProspectaParser = { normalizar, parseEndereco, limparTelefone, numeroBr, avaliacoes, coordsDaUrl, chaveDoLugar, localCorresponde, siteReal };
  if (typeof module !== 'undefined') module.exports = g.ProspectaParser;
})(typeof globalThis !== 'undefined' ? globalThis : this);
