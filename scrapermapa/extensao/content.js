/* =====================================================================
   Prospecta · painel de captura dentro do Google Maps
   Roda no SEU navegador: lê a lista de resultados e o painel de cada
   empresa e envia para o Supabase. Sem IA, sem servidor.
   ===================================================================== */
(() => {
  'use strict';
  if (window.__prospecta) return;
  window.__prospecta = true;
  const P = window.ProspectaParser;

  const msg = (tipo, dados = {}) => new Promise((ok, falha) => {
    try {
      chrome.runtime.sendMessage({ tipo, ...dados }, (r) => {
        if (chrome.runtime.lastError) return falha(new Error('Extensão recarregada — atualize a página (F5).'));
        r?.ok ? ok(r.dados) : falha(new Error(r?.erro || 'Falha de comunicação'));
      });
    } catch { falha(new Error('Extensão recarregada — atualize a página (F5).')); }
  });
  const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
  const humano = () => dormir(350 + Math.random() * 500);
  const txt = (el) => ((el && el.textContent) || '').replace(/\s+/g, ' ').trim();
  const attr = (el, a) => (el && el.getAttribute(a)) || '';

  async function esperar(fn, ms = 8000, passo = 150) {
    const fim = Date.now() + ms;
    while (Date.now() < fim) {
      const v = fn();
      if (v) return v;
      await dormir(passo);
    }
    return null;
  }

  // ------------------------------------------------------------------ leitura do Maps
  const feed = () => document.querySelector('div[role="feed"]');
  const linksDoFeed = () => {
    const vistos = new Set(), out = [];
    document.querySelectorAll('div[role="feed"] a[href*="/maps/place/"]').forEach((a) => {
      if (vistos.has(a.href)) return;
      vistos.add(a.href);
      const card = a.closest('div.Nv2PK') || a.parentElement;
      out.push({ href: a.href, nome: attr(a, 'aria-label'), card: card ? card.innerText || '' : '' });
    });
    return out;
  };
  const fimDaLista = () => {
    const f = feed();
    if (!f) return true;
    return /final da lista|end of the list|chegou ao fim/i.test((f.innerText || '').slice(-800)) || !!f.querySelector('span.HlvSq');
  };

  function termoAtual() {
    const v = document.querySelector('input#searchboxinput, input[name="q"]')?.value?.trim();
    if (v) return v;
    const m = location.pathname.match(/\/maps\/search\/([^/]+)/);
    return m ? decodeURIComponent(m[1].replace(/\+/g, ' ')) : '';
  }
  function posicaoAtual() {
    const m = location.href.match(/@(-?\d+\.\d+),(-?\d+\.\d+),(\d+(?:\.\d+)?)z/);
    return m ? { latitude: +m[1], longitude: +m[2], zoom: +m[3] } : {};
  }

  /** Lê o painel de detalhes aberto (mesma lógica do robô). */
  function lerPainel(nomeEsperado) {
    const hs = [...document.querySelectorAll('h1.DUwDvf')].filter((h) => txt(h));
    let h1 = nomeEsperado ? hs.find((h) => P.normalizar(txt(h)) === P.normalizar(nomeEsperado)) : null;
    h1 = h1 || hs[hs.length - 1];
    if (!h1) return null;
    const main = h1.closest('div[role="main"]') || document;
    const r = { nome: txt(h1) };
    r.categoria = txt(main.querySelector('button.DkEaL')) || txt(main.querySelector('button[jsaction*="category"]'));
    const f7 = main.querySelector('div.F7nice');
    if (f7) {
      r.avaliacao = txt(f7.querySelector('span[aria-hidden="true"]'));
      const rv = f7.querySelector('span[aria-label*="avalia"], span[aria-label*="review"], span[aria-label*="coment"]');
      r.num_avaliacoes = rv ? attr(rv, 'aria-label') : ((txt(f7).match(/\(([\d.,]+)\)/) || [])[1] || '');
    }
    const end = main.querySelector('[data-item-id="address"]');
    r.endereco = end ? (attr(end, 'aria-label').replace(/^\s*(Endereço|Address)\s*:\s*/i, '') || txt(end)) : '';
    const tel = main.querySelector('[data-item-id^="phone:tel:"]');
    r.telefone = tel ? (attr(tel, 'aria-label').replace(/^\s*(Telefone|Phone)\s*:\s*/i, '') || attr(tel, 'data-item-id').replace('phone:tel:', '')) : '';
    const site = main.querySelector('a[data-item-id="authority"]');
    r.site = site ? site.href : '';
    const oloc = main.querySelector('[data-item-id="oloc"]');
    r.plus_code = oloc ? attr(oloc, 'aria-label').replace(/^\s*Plus Code\s*:\s*/i, '') : '';
    let horario = '';
    const tabela = main.querySelector('table.eK4R0e') || main.querySelector('div.t39EBf table');
    if (tabela) {
      horario = [...tabela.querySelectorAll('tr')].map((tr) => {
        const td = tr.querySelectorAll('td');
        return td.length >= 2 ? `${txt(td[0])}: ${(attr(td[1], 'aria-label') || txt(td[1])).replace(/\s*Copiar horário.*$/i, '')}` : '';
      }).filter(Boolean).join(' | ');
    }
    if (!horario) {
      const oh = main.querySelector('div.t39EBf[aria-label], [aria-label*="horário de funcionamento"], [aria-label*="Ocultar horário"]');
      horario = oh ? attr(oh, 'aria-label').replace(/\.\s*Ocultar.*$/i, '') : '';
    }
    r.horario = horario;
    const preco = main.querySelector('span[aria-label^="Preço"], span[aria-label^="Price"]');
    r.faixa_preco = preco ? attr(preco, 'aria-label') : '';
    const corpo = main.innerText || '';
    r.situacao = /Fechado permanentemente|Permanently closed/i.test(corpo) ? 'Fechado permanentemente'
      : /Fechado temporariamente|Temporarily closed/i.test(corpo) ? 'Fechado temporariamente' : 'Ativo';
    return r;
  }

  /** Dados mínimos só a partir do cartão da lista (modo rápido). */
  function lerCartao(link) {
    const linhas = (link.card || '').split('\n').map((s) => s.trim()).filter(Boolean);
    const r = { nome: link.nome || linhas[0] || '' };
    const nota = (link.card.match(/(\d[,.]\d)\s*\(([\d.,]+)\)/) || []);
    r.avaliacao = nota[1] || ''; r.num_avaliacoes = nota[2] || '';
    const tel = link.card.match(/(\(?\d{2}\)?\s?\d{4,5}-?\d{4}|0800\s?\d{3}\s?\d{4})/);
    r.telefone = tel ? tel[1] : '';
    const info = linhas.find((l) => l.includes('·') && !/\d[,.]\d\s*\(/.test(l)) || '';
    const pedacos = info.split('·').map((s) => s.trim()).filter(Boolean);
    r.categoria = pedacos[0] || '';
    r.endereco = pedacos.slice(1).find((p) => /\d|R\.|Av\.|Rua|Avenida/.test(p)) || '';
    return r;
  }

  function montarLead(bruto, link, urlFinal = '') {
    const nome = (bruto.nome || link.nome || '').trim();
    const t = P.limparTelefone(bruto.telefone || '');
    const endereco = (bruto.endereco || '').trim();
    let [lat, lng] = P.coordsDaUrl(urlFinal);
    if (lat == null) [lat, lng] = P.coordsDaUrl(link.href);
    return {
      place_key: P.chaveDoLugar(link.href || urlFinal, nome, endereco),
      nome, categoria: (bruto.categoria || '').trim(), ...t,
      site: P.siteReal(bruto.site || ''), endereco, ...P.parseEndereco(endereco),
      latitude: lat, longitude: lng,
      avaliacao: P.numeroBr(bruto.avaliacao), num_avaliacoes: P.avaliacoes(bruto.num_avaliacoes),
      horario: bruto.horario || '', plus_code: bruto.plus_code || '', situacao: bruto.situacao || '',
      faixa_preco: bruto.faixa_preco || '', maps_url: link.href || urlFinal,
    };
  }

  async function abrirEmpresa(link) {
    const a = [...document.querySelectorAll('div[role="feed"] a[href*="/maps/place/"]')].find((x) => x.href === link.href);
    if (!a) return null;
    a.scrollIntoView({ block: 'center' });
    await dormir(120);
    a.click();
    const ok = await esperar(() => [...document.querySelectorAll('h1.DUwDvf')]
      .some((h) => P.normalizar(txt(h)) === P.normalizar(link.nome)), 9000);
    if (!ok) return null;
    await esperar(() => {
      const h = [...document.querySelectorAll('h1.DUwDvf')].find((x) => P.normalizar(txt(x)) === P.normalizar(link.nome));
      const main = h?.closest('div[role="main"]');
      return main?.querySelector('[data-item-id="address"], [data-item-id^="phone:tel:"], a[data-item-id="authority"]');
    }, 2500);
    await dormir(200);
    return lerPainel(link.nome);
  }

  // ------------------------------------------------------------------ painel (UI)
  const host = document.createElement('div');
  host.id = 'prospecta-host';
  host.style.cssText = 'position:fixed;top:74px;right:14px;z-index:2147483000;';
  document.documentElement.appendChild(host);
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `
  <style>
    :host{all:initial}
    [hidden]{display:none!important}
    *{box-sizing:border-box;font-family:"Plus Jakarta Sans","Segoe UI",system-ui,sans-serif}
    .fab{display:flex;align-items:center;gap:8px;background:#0C1730;color:#fff;border:0;border-radius:999px;padding:9px 14px 9px 10px;font-weight:700;font-size:13px;cursor:pointer;box-shadow:0 8px 24px -6px rgba(12,23,48,.5)}
    .fab .mk{width:24px;height:24px;border-radius:7px;background:linear-gradient(140deg,#3B6CF6,#1C4ED8);display:grid;place-items:center}
    .fab svg{width:14px;height:14px;stroke:#fff;fill:none;stroke-width:2.2}
    .card{width:310px;background:#fff;border:1px solid #E4E8EE;border-radius:14px;box-shadow:0 18px 40px -12px rgba(16,24,40,.3);overflow:hidden;color:#0E1726;font-size:13px}
    .hd{display:flex;align-items:center;gap:9px;padding:12px 14px;background:#0C1730;color:#fff}
    .hd b{flex:1;font-size:14px}
    .hd button{background:none;border:0;color:#A9B5CC;font-size:18px;cursor:pointer;line-height:1}
    .bd{padding:14px}
    label{display:block;font-size:11.5px;font-weight:700;color:#475569;margin:0 0 5px}
    input[type=text],input[type=number]{width:100%;height:36px;border:1px solid #CFD6E0;border-radius:8px;padding:0 10px;font-size:13px;outline:none}
    input:focus{border-color:#1C4ED8;box-shadow:0 0 0 3px #DCE6FE}
    .row{display:flex;gap:8px}.row>*{flex:1}
    .f{margin-bottom:11px}
    .chk{display:flex;gap:8px;align-items:flex-start;font-size:12.5px;margin:6px 0;cursor:pointer;color:#0E1726;font-weight:500}
    .chk input{margin-top:2px;accent-color:#1C4ED8}
    .chk small{display:block;color:#8A96A8;font-weight:400}
    .btn{width:100%;height:40px;border:0;border-radius:9px;background:#1C4ED8;color:#fff;font-weight:700;font-size:13.5px;cursor:pointer;margin-top:6px}
    .btn:hover{background:#173FB0}.btn.stop{background:#fff;color:#D1312A;border:1px solid #F3C4C0}
    .btn.sec{background:#fff;color:#0E1726;border:1px solid #CFD6E0}
    .muted{color:#8A96A8;font-size:12px}
    .warn{background:#FFF5E8;color:#8A4A0B;border-radius:9px;padding:9px 10px;font-size:12px;line-height:1.45;margin-bottom:10px}
    .stats{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin:10px 0}
    .st{background:#F8FAFC;border:1px solid #E4E8EE;border-radius:8px;padding:7px 8px}
    .st b{display:block;font-size:16px}.st span{font-size:10.5px;color:#8A96A8;font-weight:700}
    .bar{height:6px;background:#F1F4F8;border-radius:9px;overflow:hidden}.bar i{display:block;height:100%;width:0;background:#1C4ED8;transition:width .3s}
    .log{margin-top:9px;max-height:110px;overflow:auto;background:#0E1726;color:#C9D3E3;border-radius:8px;padding:7px 9px;font:11px/1.55 Consolas,monospace}
    .log .aviso{color:#F8C77A}.log .erro{color:#FF9C94}.log .sucesso{color:#7EE2AE}
    a{color:#1C4ED8;cursor:pointer;text-decoration:none;font-weight:600}
  </style>
  <button class="fab" id="fab"><span class="mk"><svg viewBox="0 0 24 24"><path d="M12 21s-6.5-6.2-6.5-11A6.5 6.5 0 0 1 18.5 10c0 4.8-6.5 11-6.5 11Z"/><circle cx="12" cy="10" r="2.2"/></svg></span>Prospecta</button>
  <div class="card" id="card" hidden>
    <div class="hd"><span class="fab" style="padding:0;box-shadow:none;background:none"><span class="mk"><svg viewBox="0 0 24 24"><path d="M12 21s-6.5-6.2-6.5-11A6.5 6.5 0 0 1 18.5 10c0 4.8-6.5 11-6.5 11Z"/><circle cx="12" cy="10" r="2.2"/></svg></span></span><b>Prospecta</b><button id="min" title="Minimizar">–</button></div>
    <div class="bd" id="bd"></div>
  </div>`;
  const $ = (s) => root.querySelector(s);

  const estado = { rodando: false, parar: false, email: null, logs: [] };

  function log(m, nivel = 'info') {
    const t = new Date().toLocaleTimeString('pt-BR');
    estado.logs.push({ t, msg: m, nivel });
    const el = $('#log');
    if (el) { el.insertAdjacentHTML('beforeend', `<div class="${nivel}">${t} ${m.replace(/</g, '&lt;')}</div>`); el.scrollTop = el.scrollHeight; }
  }

  async function render() {
    const bd = $('#bd');
    if (estado.rodando) return;
    try { estado.email = (await msg('sessao')).email; } catch (e) { estado.email = null; }
    if (!estado.email) {
      bd.innerHTML = `<div class="warn">Entre na extensão para capturar: clique no ícone do <b>Prospecta</b> na barra do Chrome (🧩) e faça login com seu e-mail e senha.</div>
        <button class="btn sec" id="recheck">Já entrei — atualizar</button>`;
      $('#recheck').onclick = render;
      return;
    }
    const lugar = location.pathname.includes('/maps/place/') && !feed();
    bd.innerHTML = `
      <div class="muted" style="margin-bottom:10px">Conectado como <b>${estado.email}</b> · <a id="app">abrir painel</a></div>
      <div class="f"><label>Busca atual</label><input type="text" id="termo" value="${termoAtual().replace(/"/g, '&quot;')}" placeholder="Pesquise no Maps, ex.: padarias em Moema"></div>
      ${lugar ? '' : `<div class="row f"><div><label>Máx. empresas</label><input type="number" id="max" value="60" min="1" max="500"></div>
        <div><label>Só neste local</label><input type="text" id="local" placeholder="(opcional) bairro/rua"></div></div>
      <label class="chk"><input type="checkbox" id="det" checked><span>Abrir cada empresa<small>Dados completos (telefone, site, horário). Mais lento.</small></span></label>`}
      <label class="chk"><input type="checkbox" id="enr"><span>Enriquecer depois<small>E-mail, redes, CNPJ e Receita via Supabase.</small></span></label>
      <button class="btn" id="go">${lugar ? 'Capturar esta empresa' : 'Capturar resultados'}</button>
      <div id="prog" hidden>
        <div class="stats"><div class="st"><b id="sEnc">0</b><span>ENCONTRADAS</span></div><div class="st"><b id="sProc">0</b><span>LIDAS</span></div><div class="st"><b id="sSalv">0</b><span>SALVAS</span></div></div>
        <div class="bar"><i id="pbar"></i></div><div class="log" id="log"></div>
      </div>`;
    $('#app').onclick = () => msg('abrirApp');
    $('#go').onclick = () => (estado.rodando ? (estado.parar = true) : capturar(lugar));
  }

  // ------------------------------------------------------------------ captura
  async function capturar(lugar) {
    const termo = $('#termo').value.trim() || termoAtual() || 'Captura Google Maps';
    const max = lugar ? 1 : Math.max(1, Math.min(500, +$('#max').value || 60));
    const localFiltro = lugar ? '' : $('#local').value.trim();
    const detalhado = lugar ? true : $('#det').checked;
    const enriquecer = $('#enr').checked;
    if (!lugar && !feed()) { alertar('Faça uma pesquisa no Google Maps primeiro (ex.: "padarias em Moema") para aparecer a lista de resultados.'); return; }

    estado.rodando = true; estado.parar = false;
    const btn = $('#go'); btn.textContent = 'Parar'; btn.classList.add('stop');
    $('#prog').hidden = false; $('#log').innerHTML = '';
    const cont = { encontrados: 0, processados: 0, descartados: 0, salvos: 0 };
    const pinta = (fracao) => {
      $('#sEnc').textContent = cont.encontrados; $('#sProc').textContent = cont.processados; $('#sSalv').textContent = cont.salvos;
      if (fracao != null) $('#pbar').style.width = `${Math.round(fracao * 100)}%`;
    };
    let busca, buffer = [], pendentesLog = [];
    const leadsPorChave = new Map(); const novos = [];
    const logR = (m, n) => { log(m, n); pendentesLog.push({ t: new Date().toLocaleTimeString('pt-BR'), msg: m, nivel: n || 'info' }); };
    const progresso = async (campos = {}) => {
      const lg = pendentesLog.splice(0);
      try { const r = await msg('progresso', { busca_id: busca.id, campos: { ...cont, ...campos }, logs: lg }); if (r?.cancelar) estado.parar = true; } catch (e) { log(e.message, 'erro'); }
    };
    const enviar = async () => {
      if (!buffer.length) return;
      const lote = buffer.splice(0);
      const r = await msg('salvarLeads', { busca_id: busca.id, leads: lote });
      cont.salvos += r.salvos;
      for (const x of r.ids || []) if (x.novo) novos.push({ id: x.id, site: leadsPorChave.get(x.place_key)?.site });
      pinta(); await progresso();
    };

    try {
      busca = await msg('criarBusca', {
        busca: {
          termo: termo.slice(0, 120), local: localFiltro || null, modo: localFiltro ? 'local' : 'area', ...posicaoAtual(),
          max_resultados: max, fase: 'coletando', opcoes: { detalhado, enriquecer, filtro_estrito: !!localFiltro },
        },
      });
      logR(`Busca criada: “${termo}”`);

      let links;
      if (lugar) {
        links = [{ href: location.href, nome: txt(document.querySelector('h1.DUwDvf')), card: '' }];
      } else {
        logR('Rolando a lista de resultados…');
        let ultimo = 0, parado = 0;
        while (!estado.parar) {
          const qtd = linksDoFeed().length;
          cont.encontrados = Math.min(qtd, max); pinta(Math.min(qtd / max, 1) * 0.3);
          if (qtd >= max) break;
          feed().scrollTo(0, feed().scrollHeight);
          await dormir(1100);
          if (fimDaLista()) { logR('Fim da lista alcançado.'); break; }
          const novo = linksDoFeed().length;
          parado = novo === ultimo ? parado + 1 : 0; ultimo = novo;
          if (parado && parado % 3 === 0) { feed().scrollBy(0, -500); await dormir(600); }
          if (parado >= 9) { logR('A lista parou de crescer.', 'aviso'); break; }
        }
        links = linksDoFeed().slice(0, max);
      }
      cont.encontrados = links.length;
      logR(`${links.length} empresas na lista.`);
      await progresso({ fase: 'extraindo' });

      for (let i = 0; i < links.length && !estado.parar; i++) {
        const link = links[i];
        let bruto = null;
        try {
          bruto = lugar ? lerPainel() : detalhado ? await abrirEmpresa(link) : lerCartao(link);
          if (!bruto && detalhado) { logR(`Não abriu: ${link.nome} — usando dados do cartão`, 'aviso'); bruto = lerCartao(link); }
        } catch (e) { logR(`Falha em ${link.nome}: ${e.message}`, 'aviso'); }
        cont.processados++;
        if (bruto && (bruto.nome || link.nome)) {
          const lead = montarLead(bruto, link, lugar ? location.href : '');
          if (localFiltro && !P.localCorresponde(localFiltro, lead)) { cont.descartados++; logR(`Fora de “${localFiltro}”: ${lead.nome}`, 'aviso'); }
          else { buffer.push(lead); leadsPorChave.set(lead.place_key, lead); }
        }
        pinta(0.3 + ((i + 1) / links.length) * 0.65);
        if (buffer.length >= 5) await enviar();
        if (detalhado && !lugar) await humano();
      }
      await enviar();

      if (enriquecer && novos.length) {
        const alvo = novos.filter((n) => n.site);
        logR(`Enriquecendo ${alvo.length} empresas com site…`);
        for (let i = 0; i < alvo.length && !estado.parar; i++) {
          try { const r = await msg('enriquecer', { lead_id: alvo[i].id }); if (r?.encontrados?.length) log(`+ ${r.encontrados.join(', ')}`); } catch (e) { log(`Enriquecimento: ${e.message}`, 'aviso'); }
          pinta(0.95 + ((i + 1) / alvo.length) * 0.05);
        }
      }
      const status = estado.parar ? 'cancelada' : 'concluida';
      logR(estado.parar ? `Interrompido: ${cont.salvos} salvas.` : `Concluído: ${cont.salvos} empresas salvas (${novos.length} novas).`, estado.parar ? 'aviso' : 'sucesso');
      pinta(1);
      await progresso({ status, fase: estado.parar ? 'cancelado' : 'concluido' });
    } catch (e) {
      log(`Erro: ${e.message}`, 'erro');
      if (busca) { pendentesLog.push({ t: '', msg: e.message, nivel: 'erro' }); await progresso({ status: 'erro', fase: 'erro', erro: e.message }).catch(() => {}); }
    } finally {
      estado.rodando = false;
      btn.textContent = lugar ? 'Capturar esta empresa' : 'Capturar novamente'; btn.classList.remove('stop');
    }
  }

  function alertar(t) {
    const bd = $('#bd');
    bd.insertAdjacentHTML('afterbegin', `<div class="warn">${t}</div>`);
    setTimeout(() => bd.querySelector('.warn')?.remove(), 7000);
  }

  // ------------------------------------------------------------------ abrir/fechar
  $('#fab').onclick = () => { $('#fab').hidden = true; $('#card').hidden = false; render(); };
  $('#min').onclick = () => { $('#card').hidden = true; $('#fab').hidden = false; };

  // o Maps é uma SPA: atualiza o termo quando a busca muda
  let ultimaUrl = location.href;
  setInterval(() => {
    if (location.href !== ultimaUrl) {
      ultimaUrl = location.href;
      if (!estado.rodando && !$('#card').hidden) render();
    }
  }, 1500);
})();
