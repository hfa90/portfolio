/* RH+ Match — detecta a plataforma e convida a instalar o aplicativo.
   · Android  → recomenda baixar o app para Android (APK). Se o app já está no aparelho, oferece "Abrir no app".
   · iPhone/iPad e computador → instala o app web (PWA). No Chrome/Edge é um clique; no Safari a Apple não permite
     instalar por script, então mostramos o caminho (Compartilhar → Adicionar à Tela de Início / Adicionar ao Dock).
   · Dentro do app (Android ou PWA instalado) nada aparece.
   Usado pela página inicial (index.html) e pelo sistema (sistema/index.html). Expõe window.RHInstalar. */
(function () {
  "use strict";
  var PACOTE = "br.com.haydenfernandes.rhmais";
  var BASE = new URL(".", (document.currentScript && document.currentScript.src) || location.href);
  var APK = new URL("download/rhmais.apk", BASE).href;
  var ICONE = new URL("icons/icon-192.png", BASE).href;
  var SISTEMA = new URL("sistema/", BASE);
  var ua = navigator.userAgent || "";
  var android = /Android/i.test(ua);
  var ios = /iPhone|iPad|iPod/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  var safari = /Safari/i.test(ua) && !/Chrome|Chromium|CriOS|FxiOS|EdgiOS|Edg\/|OPR|SamsungBrowser|Firefox/i.test(ua);
  var macSafari = !ios && /Macintosh/i.test(ua) && safari;
  var firefoxDesk = !android && !ios && /Firefox/i.test(ua);
  var ls = function (k, v) { try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { return null; } };
  var ss = function (k, v) { try { if (v === undefined) return sessionStorage.getItem(k); sessionStorage.setItem(k, v); } catch (e) { return null; } };

  // Aberto pelo app Android (Trusted Web Activity): o app abre ?origem=android e o Chrome informa a origem android-app://
  if (/[?&]origem=android\b/.test(location.search) || document.referrer.indexOf("android-app://" + PACOTE) === 0) {
    ss("rh_no_app", "1");
    ls("rh_app_android", String(Date.now()));   // o app usa o mesmo armazenamento do Chrome: o navegador passa a saber que o app existe
    try { var u = new URL(location.href); u.searchParams.delete("origem"); history.replaceState(history.state, "", u.href); } catch (e) { /* ok */ }
  }
  var noApp = function () { return ss("rh_no_app") === "1"; };
  var standalone = function () { return noApp() || matchMedia("(display-mode: standalone)").matches || matchMedia("(display-mode: fullscreen)").matches || navigator.standalone === true; };
  var appAndroid = !!(ls("rh_app_android") && Date.now() - Number(ls("rh_app_android")) < 45 * 864e5);
  var pedido = null;   // evento beforeinstallprompt (Chrome/Edge/Samsung)

  var plataforma = android ? "android" : ios ? "ios" : "desktop";
  function rotulo() {
    if (standalone()) return "";
    if (android) return appAndroid ? "Abrir no app Android" : "Baixar app para Android";
    if (ios) return "Instalar no iPhone / iPad";
    if (pedido) return "Instalar o app no computador";
    if (macSafari) return "Adicionar ao Dock";
    return "";
  }
  var avisar = function () { try { dispatchEvent(new Event("rhinstalar")); } catch (e) { /* ok */ } };

  /* ------------------------------------------------------------- estilos próprios (funcionam na página inicial e no sistema) */
  var css = document.createElement("style");
  css.textContent = [
    ".rhi-card{position:fixed;z-index:9000;right:20px;bottom:20px;width:min(390px,calc(100vw - 24px));display:flex;gap:12px;align-items:center;padding:14px 14px 14px 16px;",
    "border-radius:26px;color:#0B0B0F;background:rgba(255,255,255,.78);-webkit-backdrop-filter:blur(30px) saturate(1.8);backdrop-filter:blur(30px) saturate(1.8);",
    "border:.5px solid rgba(255,255,255,.7);box-shadow:0 10px 40px rgba(0,0,0,.16),0 1px 3px rgba(0,0,0,.08);font:14px/1.35 -apple-system,BlinkMacSystemFont,'SF Pro Text','Inter RH',Inter,'Segoe UI',Roboto,sans-serif;",
    "animation:rhiSobe .5s cubic-bezier(.2,.9,.3,1.1)}",
    "[data-theme=dark] .rhi-card{color:#F5F5F7;background:rgba(36,36,38,.8);border-color:rgba(255,255,255,.1)}",
    ".rhi-card img{width:50px;height:50px;border-radius:12px;flex:none;box-shadow:0 2px 8px rgba(0,0,0,.18)}",
    ".rhi-txt{flex:1;min-width:0;font-size:13px;color:#6C6C72}[data-theme=dark] .rhi-txt{color:#98989F}",
    ".rhi-txt b{display:block;font-size:15.5px;color:inherit;margin-bottom:2px}.rhi-card .rhi-txt b{color:#0B0B0F}[data-theme=dark] .rhi-card .rhi-txt b{color:#F5F5F7}",
    ".rhi-bts{display:flex;flex-direction:column;gap:4px;align-items:stretch;flex:none}",
    ".rhi-bt{border:0;border-radius:999px;min-height:36px;padding:0 18px;font-family:inherit;font-weight:600;font-size:15px;line-height:1;cursor:pointer;background:#5856D6;color:#fff;text-decoration:none;display:inline-flex;align-items:center;justify-content:center}",
    ".rhi-bt:active{transform:scale(.96)}.rhi-x{border:0;background:none;color:#8E8E93;font-family:inherit;font-weight:500;font-size:12.5px;cursor:pointer;padding:4px}",
    "body.sheet-on .rhi-card,body.filtros-on .rhi-card{display:none}",
    "@media(max-width:767px){.rhi-card{left:12px;right:12px;width:auto;bottom:calc(86px + env(safe-area-inset-bottom));padding:8px 8px 8px 10px;gap:10px;border-radius:22px;transition:transform .3s,opacity .3s}",
    ".rhi-card img{width:38px;height:38px;border-radius:10px}.rhi-txt{font-size:0}.rhi-txt b{font-size:14.5px;margin:0}.rhi-bts{flex-direction:row;align-items:center}.rhi-x{font-size:0;width:30px;height:30px;border-radius:50%;background:rgba(118,118,128,.14)}.rhi-x::before{content:'✕';font-size:13px;color:#8E8E93}",
    "body.sem-sessao .rhi-card,.rhi-pagina .rhi-card{bottom:calc(12px + env(safe-area-inset-bottom))}.rhi-card.rhi-some{transform:translateY(140%);opacity:0;pointer-events:none}}",
    ".rhi-dlg{border:0;padding:0;border-radius:30px;width:min(420px,92vw);color:#0B0B0F;background:#fff;box-shadow:0 30px 80px rgba(0,0,0,.3);font:16px/1.45 -apple-system,BlinkMacSystemFont,'SF Pro Text','Inter RH',Inter,'Segoe UI',Roboto,sans-serif}",
    "[data-theme=dark] .rhi-dlg{background:#1C1C1E;color:#F5F5F7}.rhi-dlg::backdrop{background:rgba(0,0,0,.35)}",
    ".rhi-dlg>div{padding:24px 22px 20px}.rhi-dlg h3{margin:0 0 4px;font-size:21px;letter-spacing:-.01em}.rhi-dlg p{margin:0 0 12px;color:#6C6C72;font-size:14.5px}",
    "[data-theme=dark] .rhi-dlg p{color:#98989F}.rhi-cab{display:flex;gap:14px;align-items:center;margin-bottom:14px}.rhi-cab img{width:60px;height:60px;border-radius:14px}",
    ".rhi-dlg ol{list-style:none;margin:0 0 16px;padding:0;counter-reset:p}.rhi-dlg li{counter-increment:p;display:flex;gap:12px;align-items:center;padding:11px 0;border-top:.5px solid rgba(60,60,67,.18);font-size:15px}",
    ".rhi-dlg li:first-child{border-top:0}.rhi-dlg li::before{content:counter(p);width:26px;height:26px;border-radius:50%;background:rgba(88,86,214,.13);color:#5856D6;display:grid;place-items:center;font-weight:700;font-size:13px;flex:none}",
    ".rhi-dlg svg{width:22px;height:22px;vertical-align:-5px;fill:none;stroke:#5856D6;stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round}",
    ".rhi-dlg .rhi-bt{width:100%;min-height:50px;font-size:17px}.rhi-dlg .rhi-bt.sec{background:rgba(118,118,128,.14);color:inherit;margin-top:8px}",
    ".rhi-seta{position:fixed;z-index:9001;left:50%;bottom:calc(6px + env(safe-area-inset-bottom));font-size:40px;line-height:1;color:#5856D6;filter:drop-shadow(0 2px 6px rgba(0,0,0,.35));animation:rhiQuica 1s ease-in-out infinite;pointer-events:none}",
    "@media(min-width:768px){.rhi-seta{left:auto;right:86px;top:6px;bottom:auto;transform:rotate(180deg)}}",
    "@keyframes rhiQuica{0%,100%{translate:-50% 0}50%{translate:-50% 9px}}@keyframes rhiSobe{from{opacity:0;transform:translateY(30px)}to{opacity:1;transform:none}}",
  ].join("");
  document.head.appendChild(css);

  var ICO_COMPARTILHAR = '<svg viewBox="0 0 24 24"><path d="M12 3v12M8 7l4-4 4 4"/><path d="M7 10H5.5A1.5 1.5 0 0 0 4 11.5v8A1.5 1.5 0 0 0 5.5 21h13a1.5 1.5 0 0 0 1.5-1.5v-8a1.5 1.5 0 0 0-1.5-1.5H17"/></svg>';
  var ICO_MAIS = '<svg viewBox="0 0 24 24"><rect x="3.5" y="3.5" width="17" height="17" rx="4"/><path d="M12 8v8M8 12h8"/></svg>';

  function dialogo(html) {
    var d = document.createElement("dialog"); d.className = "rhi-dlg";
    d.innerHTML = "<div>" + html.replace(/<li>/g, "<li><span>").replace(/<\/li>/g, "</span></li>") + "</div>";
    document.body.appendChild(d);
    d.addEventListener("click", function (e) { if (e.target === d || e.target.closest("[data-rhi-fechar]")) d.close(); });
    d.addEventListener("close", function () { d.remove(); var s = document.querySelector(".rhi-seta"); if (s) s.remove(); });
    if (d.showModal) d.showModal(); else d.setAttribute("open", "");
    return d;
  }
  var cabecalho = function (t, s) { return '<div class="rhi-cab"><img src="' + ICONE + '" alt=""><div><h3>' + t + "</h3><p style=\"margin:0\">" + s + "</p></div></div>"; };

  /* ------------------------------------------------------------- ações */
  function instalarAndroid() {
    if (appAndroid) { abrirNoApp(); return; }
    var d = dialogo(cabecalho("RH+ Match para Android", "App oficial · gratuito · cerca de 1 MB") +
      "<p>O download começa ao tocar no botão. Depois:</p><ol>" +
      "<li>Abra o arquivo <b>rhmais.apk</b> (na notificação ou em Downloads).</li>" +
      "<li>Se o Android pedir, permita <b>instalar apps desta fonte</b> e volte.</li>" +
      "<li>Toque em <b>Instalar</b>. O app abre já conectado à sua conta.</li></ol>" +
      '<a class="rhi-bt" id="rhiBaixar" href="' + APK + '" download="rhmais.apk">Baixar o app</a>' +
      '<button class="rhi-bt sec" data-rhi-fechar>Continuar no navegador</button>');
    d.querySelector("#rhiBaixar").addEventListener("click", function () { ls("rh_convite_ate", String(Date.now() + 3 * 864e5)); fecharCartao(); });
  }
  function abrirNoApp() {
    var destino = SISTEMA.host + SISTEMA.pathname + "?origem=android";
    location.href = "intent://" + destino + "#Intent;scheme=https;package=" + PACOTE + ";S.browser_fallback_url=" + encodeURIComponent(APK) + ";end";
  }
  function instalarIOS() {
    var outroNav = !safari;
    dialogo(cabecalho("Instale o RH+ Match", "Fica na Tela de Início e abre em tela cheia, como um app.") +
      "<ol><li>Toque em <b>Compartilhar</b> " + ICO_COMPARTILHAR + (outroNav ? " (no menu do navegador)" : " na barra do Safari") + ".</li>" +
      "<li>Role e escolha <b>Adicionar à Tela de Início</b> " + ICO_MAIS + ".</li>" +
      "<li>Toque em <b>Adicionar</b>. Pronto!</li></ol>" +
      '<button class="rhi-bt" data-rhi-fechar>Entendi</button>');
    var s = document.createElement("div"); s.className = "rhi-seta"; s.textContent = "↓"; document.body.appendChild(s);
  }
  function instalarDesktop() {
    if (pedido) {
      var p = pedido; p.prompt();
      p.userChoice.then(function (r) { if (r && r.outcome === "accepted") { fecharCartao(); } pedido = null; avisar(); }).catch(function () {});
      return;
    }
    if (macSafari) {
      dialogo(cabecalho("Adicionar ao Dock", "O RH+ Match abre em janela própria, como um app do Mac.") +
        "<ol><li>No menu <b>Arquivo</b> do Safari, escolha <b>Adicionar ao Dock…</b></li><li>Clique em <b>Adicionar</b>.</li></ol>" +
        '<button class="rhi-bt" data-rhi-fechar>Entendi</button>');
      return;
    }
    dialogo(cabecalho("Instalar o RH+ Match", "Use o Chrome ou o Edge para instalar o app no computador.") +
      "<ol><li>Abra este endereço no <b>Chrome</b> ou no <b>Edge</b>.</li><li>Clique em <b>Instalar</b> no aviso que aparece (ou no ícone ⊕ da barra de endereço).</li></ol>" +
      '<button class="rhi-bt" data-rhi-fechar>Entendi</button>');
  }
  function acao() { if (android) instalarAndroid(); else if (ios) instalarIOS(); else instalarDesktop(); }

  /* ------------------------------------------------------------- cartão flutuante (aparece uma vez; se fechado, volta em 7 dias) */
  var cartao = null;
  function fecharCartao(adiar) {
    if (adiar) ls("rh_convite_ate", String(Date.now() + 7 * 864e5));
    if (cartao) { cartao.remove(); cartao = null; }
  }
  function mostrarCartao() {
    if (cartao || standalone() || !rotulo() || firefoxDesk) return;
    if (Number(ls("rh_convite_ate") || 0) > Date.now()) return;
    if (document.querySelector("dialog[open]")) { setTimeout(mostrarCartao, 4000); return; }
    var titulo, texto, botao;
    if (android && appAndroid) { titulo = "Abrir no app"; texto = "Você tem o RH+ Match instalado neste aparelho."; botao = "Abrir"; }
    else if (android) { titulo = "App RH+ Match para Android"; texto = "Mais rápido, em tela cheia e com acesso direto pelo ícone."; botao = "Baixar"; }
    else if (ios) { titulo = "Instale no seu " + (/iPad/.test(ua) || navigator.maxTouchPoints > 1 && !/iPhone/.test(ua) ? "iPad" : "iPhone"); texto = "Abra em tela cheia, direto da Tela de Início."; botao = "Instalar"; }
    else { titulo = "Instale o RH+ Match"; texto = macSafari ? "Use como app, com janela própria no Dock." : "Um clique e ele fica na sua área de trabalho, como um app."; botao = "Instalar"; }
    cartao = document.createElement("div"); cartao.className = "rhi-card"; cartao.setAttribute("role", "dialog"); cartao.setAttribute("aria-label", titulo); cartao.title = texto;
    cartao.innerHTML = '<img src="' + ICONE + '" alt=""><div class="rhi-txt"><b>' + titulo + "</b>" + texto + '</div><div class="rhi-bts"><button class="rhi-bt" type="button">' + botao + '</button><button class="rhi-x" type="button">Agora não</button></div>';
    cartao.querySelector(".rhi-bt").onclick = function () { acao(); if (!android) fecharCartao(false); };
    cartao.querySelector(".rhi-x").onclick = function () { fecharCartao(true); };
    if (!document.querySelector(".sidebar")) document.body.classList.add("rhi-pagina");
    document.body.appendChild(cartao);
    // no celular o convite sai do caminho enquanto a pessoa rola a tela
    var yAnt = scrollY;
    addEventListener("scroll", function () {
      if (!cartao) return;
      cartao.classList.toggle("rhi-some", scrollY > yAnt + 4 && scrollY > 80);
      if (scrollY < yAnt - 4) cartao.classList.remove("rhi-some");
      yAnt = scrollY;
    }, { passive: true });
  }

  addEventListener("beforeinstallprompt", function (e) {
    if (android) { e.preventDefault(); return; }   // no Android recomendamos o app nativo
    e.preventDefault(); pedido = e; avisar(); setTimeout(mostrarCartao, 1500);
  });
  addEventListener("appinstalled", function () { pedido = null; fecharCartao(true); avisar(); });

  // Android: confere se o app já está instalado (Chrome; depende do vínculo do app com o site)
  if (android && navigator.getInstalledRelatedApps) {
    navigator.getInstalledRelatedApps().then(function (apps) {
      var tem = (apps || []).some(function (a) { return a.id === PACOTE; });
      if (tem) { appAndroid = true; ls("rh_app_android", String(Date.now())); }   // lista vazia não prova ausência (exige o vínculo assetlinks): mantém a marca do último uso do app
      avisar();
    }).catch(function () {});
  }

  window.RHInstalar = { plataforma: plataforma, noApp: noApp, instalado: standalone, rotulo: rotulo, acao: acao, apk: APK, mostrar: mostrarCartao };
  var iniciar = function () { setTimeout(mostrarCartao, android || ios ? 2500 : 4000); };
  if (document.readyState === "complete") iniciar(); else addEventListener("load", iniciar);
})();
