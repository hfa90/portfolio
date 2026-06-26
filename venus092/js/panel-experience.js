(function () {
  const configs = {
    profissional: {
      root: 'main',
      navFn: 'goPage',
      label: 'Painel profissional',
      searchPlaceholder: 'Buscar ferramentas: fotos, servicos, mensagens...',
      items: [
        { id: 'dashboard', icon: 'ti-layout-dashboard', label: 'Dashboard', hint: 'Resumo do perfil' },
        { id: 'perfil', icon: 'ti-user-edit', label: 'Meu perfil', hint: 'Nome, bio e dados principais', save: 'savePerfil' },
        { id: 'fotos', icon: 'ti-camera-plus', label: 'Fotos', hint: 'Enviar e organizar imagens' },
        { id: 'servicos', icon: 'ti-list-details', label: 'Servicos', hint: 'Precos e atendimentos', save: 'addServico' },
        { id: 'localizacao', icon: 'ti-map-pin', label: 'Localizacao', hint: 'Cidade e locais de atendimento', save: 'saveLocalizacao' },
        { id: 'disponibilidade', icon: 'ti-calendar-time', label: 'Agenda', hint: 'Dias e horarios', save: 'saveDisponibilidade' },
        { id: 'mensagens', icon: 'ti-message-circle', label: 'Mensagens', hint: 'Conversas com clientes' }
      ],
      external: [
        { icon: 'ti-eye', label: 'Ver perfil', href: 'perfil.html' },
        { icon: 'ti-world-search', label: 'Catalogo', href: 'catalogo.html' }
      ]
    },
    cliente: {
      root: '.main',
      navFn: 'openPanel',
      label: 'Painel do cliente',
      searchPlaceholder: 'Buscar: favoritos, historico, mensagens...',
      items: [
        { id: 'inicio', icon: 'ti-home', label: 'Inicio', hint: 'Resumo da conta' },
        { id: 'favoritos', icon: 'ti-heart', label: 'Favoritos', hint: 'Perfis salvos' },
        { id: 'historico', icon: 'ti-history', label: 'Historico', hint: 'Perfis visitados' },
        { id: 'mensagens', icon: 'ti-message-circle', label: 'Mensagens', hint: 'Conversas abertas' },
        { id: 'packs', icon: 'ti-gift', label: 'Packs', hint: 'Acessos e comprovantes' },
        { id: 'perfil', icon: 'ti-user-edit', label: 'Editar perfil', hint: 'Nome, avatar e capa', save: 'saveProfile' }
      ],
      external: [
        { icon: 'ti-sparkles', label: 'Explorar catalogo', href: 'catalogo.html' }
      ]
    }
  };

  let activeConfig = null;
  let dirty = false;

  function init() {
    const role = document.body?.dataset?.onboardingRole;
    if (role === 'cliente') return;
    activeConfig = configs[role];
    if (!activeConfig) return;

    ensureIconFont();
    ensureStyles();
    injectToolbar();
    bindSearch();
    bindFormWatchers();
    wrapActions();
    updateActiveAction();
    window.addEventListener('hashchange', updateActiveAction);
  }

  function ensureIconFont() {
    if (document.querySelector('link[href*="tabler-icons"]')) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@3.31.0/dist/tabler-icons.min.css';
    document.head.appendChild(link);
  }

  function ensureStyles() {
    if (document.getElementById('venusPanelExperienceStyles')) return;
    const style = document.createElement('style');
    style.id = 'venusPanelExperienceStyles';
    style.textContent = `
      .ve-toolbar{display:grid;gap:.95rem;margin-bottom:1.25rem;padding:1rem;border:1px solid rgba(255,255,255,.08);border-radius:14px;background:linear-gradient(135deg,rgba(28,28,40,.96),rgba(18,18,26,.96));box-shadow:0 16px 40px rgba(0,0,0,.22)}
      .ve-toolbar-head,.ve-action-row,.ve-save-hint,.ve-search-results button{display:flex;align-items:center}
      .ve-toolbar-head{justify-content:space-between;gap:1rem}
      .ve-toolbar-head strong{display:block;font-size:1rem;line-height:1.2}
      .ve-kicker{display:block;margin-bottom:.15rem;color:var(--gold);font-size:.72rem;font-weight:800;letter-spacing:.08em;text-transform:uppercase}
      .ve-mini,.ve-action,.ve-save-hint button{min-height:38px;border:1px solid rgba(255,255,255,.1);border-radius:10px;background:rgba(255,255,255,.045);color:var(--text-muted);transition:transform .18s ease,border-color .18s ease,background .18s ease,color .18s ease}
      .ve-mini{display:inline-flex;align-items:center;gap:.45rem;padding:0 .8rem;font-size:.82rem;font-weight:800}
      .ve-search-wrap{position:relative}
      .ve-search-wrap>i{position:absolute;left:.85rem;top:50%;transform:translateY(-50%);color:var(--text-muted);pointer-events:none}
      .ve-search-wrap input{width:100%;min-height:44px;padding:.7rem .9rem .7rem 2.45rem;border:1px solid rgba(255,255,255,.1);border-radius:12px;background:rgba(10,10,15,.55);color:var(--text);outline:none;transition:border-color .2s,box-shadow .2s}
      .ve-search-wrap input:focus{border-color:rgba(201,168,76,.72);box-shadow:0 0 0 4px rgba(201,168,76,.1)}
      .ve-search-results{position:absolute;left:0;right:0;top:calc(100% + .45rem);z-index:80;padding:.35rem;border:1px solid rgba(255,255,255,.12);border-radius:12px;background:rgba(17,17,26,.98);box-shadow:0 18px 44px rgba(0,0,0,.4)}
      .ve-search-results button{width:100%;gap:.7rem;padding:.7rem;border-radius:10px;color:var(--text-muted);text-align:left}
      .ve-search-results button:hover{background:rgba(255,255,255,.06);color:var(--text)}
      .ve-search-results i{color:var(--gold);font-size:1.05rem}
      .ve-search-results strong,.ve-search-results small{display:block}
      .ve-search-results small,.ve-no-results{color:var(--text-muted);font-size:.76rem}
      .ve-no-results{padding:.75rem}
      .ve-action-row{flex-wrap:wrap;gap:.55rem}
      .ve-action{display:inline-flex;justify-content:center;gap:.45rem;padding:0 .85rem;font-size:.82rem;font-weight:800;white-space:nowrap;text-decoration:none}
      .ve-action:hover,.ve-mini:hover,.ve-action.active{transform:translateY(-1px);border-color:rgba(201,168,76,.45);background:rgba(201,168,76,.12);color:var(--gold-light)}
      .ve-save-hint{justify-content:space-between;gap:.8rem;padding:.75rem .85rem;border:1px solid rgba(251,191,36,.28);border-radius:12px;background:rgba(251,191,36,.08);color:#f7d98a;font-size:.84rem;font-weight:800}
      .ve-save-hint span{display:inline-flex;align-items:center;gap:.45rem}
      .ve-save-hint button{padding:0 .8rem;color:#111;background:var(--gold);border-color:var(--gold);font-weight:900}
      .btn.is-busy,button.is-busy{position:relative;opacity:.78;pointer-events:none}
      .btn.is-busy::after,button.is-busy::after{content:"";width:14px;height:14px;margin-left:.35rem;border:2px solid currentColor;border-right-color:transparent;border-radius:50%;animation:veSpin .75s linear infinite}
      @keyframes veSpin{to{transform:rotate(360deg)}}
      @media(max-width:768px){.ve-toolbar{padding:.85rem;border-radius:12px}.ve-toolbar-head,.ve-save-hint{align-items:stretch;flex-direction:column}.ve-action-row{display:grid;grid-template-columns:repeat(2,minmax(0,1fr))}.ve-action{min-width:0;white-space:normal}.ve-save-hint button{width:100%}}
    `;
    document.head.appendChild(style);
  }

  function injectToolbar() {
    const root = document.querySelector(activeConfig.root);
    if (!root || document.querySelector('.ve-toolbar')) return;

    const toolbar = document.createElement('section');
    toolbar.className = 've-toolbar';
    toolbar.innerHTML = `
      <div class="ve-toolbar-head">
        <div>
          <span class="ve-kicker">${esc(activeConfig.label)}</span>
          <strong>Acoes rapidas</strong>
        </div>
        <button class="ve-mini" type="button" data-tour>
          <i class="ti ti-sparkles"></i>
          Tour
        </button>
      </div>
      <div class="ve-search-wrap">
        <i class="ti ti-search"></i>
        <input id="vePanelSearch" type="search" autocomplete="off" placeholder="${esc(activeConfig.searchPlaceholder)}">
        <div class="ve-search-results" id="veSearchResults" hidden></div>
      </div>
      <div class="ve-action-row">
        ${activeConfig.items.slice(0, 6).map(item => actionButton(item)).join('')}
        ${activeConfig.external.map(link => `
          <a class="ve-action" href="${esc(link.href)}">
            <i class="ti ${esc(link.icon)}"></i>
            <span>${esc(link.label)}</span>
          </a>
        `).join('')}
      </div>
      <div class="ve-save-hint" id="veSaveHint" hidden>
        <span><i class="ti ti-alert-circle"></i> Alteracoes ainda nao salvas</span>
        <button type="button" data-save-current>Salvar agora</button>
      </div>
    `;

    root.insertBefore(toolbar, root.firstElementChild);
    toolbar.querySelector('[data-tour]')?.addEventListener('click', () => {
      const role = document.body?.dataset?.onboardingRole;
      window.VenusOnboarding?.start(role, true);
    });
    toolbar.querySelector('[data-save-current]')?.addEventListener('click', saveCurrentSection);
    toolbar.querySelectorAll('[data-ve-target]').forEach(button => {
      button.addEventListener('click', () => navigate(button.dataset.veTarget));
    });
  }

  function actionButton(item) {
    return `
      <button class="ve-action" type="button" data-ve-target="${esc(item.id)}">
        <i class="ti ${esc(item.icon)}"></i>
        <span>${esc(item.label)}</span>
      </button>
    `;
  }

  function bindSearch() {
    const input = document.getElementById('vePanelSearch');
    const results = document.getElementById('veSearchResults');
    if (!input || !results) return;

    input.addEventListener('input', () => {
      const query = normalize(input.value);
      if (!query) {
        results.hidden = true;
        results.innerHTML = '';
        return;
      }

      const matches = activeConfig.items.filter(item => {
        return normalize(`${item.label} ${item.hint}`).includes(query);
      });

      results.innerHTML = matches.length
        ? matches.map(item => `
            <button type="button" data-result="${esc(item.id)}">
              <i class="ti ${esc(item.icon)}"></i>
              <span><strong>${esc(item.label)}</strong><small>${esc(item.hint)}</small></span>
            </button>
          `).join('')
        : '<div class="ve-no-results">Nenhuma ferramenta encontrada</div>';

      results.hidden = false;
      results.querySelectorAll('[data-result]').forEach(button => {
        button.addEventListener('click', () => {
          navigate(button.dataset.result);
          input.value = '';
          results.hidden = true;
        });
      });
    });

    document.addEventListener('click', event => {
      if (!event.target.closest('.ve-search-wrap')) results.hidden = true;
    });
  }

  function bindFormWatchers() {
    document.addEventListener('input', event => {
      if (!event.target.matches('input, textarea, select')) return;
      if (event.target.closest('.ve-toolbar')) return;
      const active = getActiveItem();
      if (!active?.save) return;
      dirty = true;
      showSaveHint(true);
    });
  }

  function wrapActions() {
    const names = [...new Set(activeConfig.items.map(item => item.save).filter(Boolean))];
    names.forEach(name => {
      const original = window[name];
      if (typeof original !== 'function' || original.__veWrapped) return;

      const wrapped = async function (...args) {
        setBusy(true);
        try {
          const result = await original.apply(this, args);
          dirty = false;
          showSaveHint(false);
          return result;
        } finally {
          setBusy(false);
        }
      };
      wrapped.__veWrapped = true;
      window[name] = wrapped;
    });
  }

  function navigate(id) {
    const fn = window[activeConfig.navFn];
    if (typeof fn === 'function') fn(id);
    updateActiveAction(id);
  }

  function getActiveItem() {
    const selector = document.body.dataset.onboardingRole === 'cliente' ? '.panel.active' : '.page.active';
    const activeId = document.querySelector(selector)?.id?.replace(/^(panel|page)-/, '');
    return activeConfig.items.find(item => item.id === activeId);
  }

  function updateActiveAction(forcedId) {
    const id = forcedId || getActiveItem()?.id;
    document.querySelectorAll('.ve-action[data-ve-target]').forEach(button => {
      button.classList.toggle('active', button.dataset.veTarget === id);
    });
    showSaveHint(dirty && Boolean(getActiveItem()?.save));
  }

  async function saveCurrentSection() {
    const active = getActiveItem();
    if (!active?.save || typeof window[active.save] !== 'function') return;
    await window[active.save]();
  }

  function showSaveHint(show) {
    const hint = document.getElementById('veSaveHint');
    if (hint) hint.hidden = !show;
  }

  function setBusy(isBusy) {
    const active = getActiveItem();
    if (!active?.save) return;
    document.querySelectorAll(`[onclick*="${active.save}"]`).forEach(button => {
      button.classList.toggle('is-busy', isBusy);
      button.disabled = isBusy;
    });
  }

  function normalize(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  }

  function esc(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
