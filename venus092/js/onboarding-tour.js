(function () {
  const tours = {
    profissional: [
      {
        title: 'Acesso seguro pronto',
        text: 'Seu Telegram fica como atalho de seguranca. Quando quiser, use o botao do painel ou do login para entrar sem digitar senha.',
        nav: () => window.goPage?.('dashboard')
      },
      {
        title: 'Complete o perfil',
        text: 'Revise nome, categoria, WhatsApp e bio. Esses campos definem como voce aparece no catalogo.',
        nav: () => window.goPage?.('perfil')
      },
      {
        title: 'Adicione fotos',
        text: 'Envie fotos nitidas e escolha a capa. As imagens passam por aprovacao antes de aparecerem.',
        nav: () => window.goPage?.('fotos')
      },
      {
        title: 'Finalize atendimento',
        text: 'Cadastre servicos, locais e disponibilidade para clientes entenderem rapidamente como falar com voce.',
        nav: () => window.goPage?.('servicos')
      }
    ],
    cliente: [
      {
        title: 'Conta pronta',
        text: 'Seu painel guarda favoritos, historico e conversas. O Telegram fica como entrada rapida e verificacao da conta.',
        nav: () => window.openPanel?.('inicio')
      },
      {
        title: 'Explore o catalogo',
        text: 'Use filtros, abra perfis e salve quem quiser acompanhar depois.',
        nav: () => window.openPanel?.('favoritos')
      },
      {
        title: 'Personalize seu perfil',
        text: 'Adicione nome, avatar e capa para deixar sua conta mais facil de reconhecer nas conversas.',
        nav: () => window.openPanel?.('perfil')
      },
      {
        title: 'Converse com seguranca',
        text: 'As mensagens ficam no painel e cada conversa mostra o tempo disponivel.',
        nav: () => window.openPanel?.('mensagens')
      }
    ]
  };

  let step = 0;
  let activeRole = null;
  let overlay = null;

  function injectStyles() {
    if (document.getElementById('venusTourStyles')) return;
    const style = document.createElement('style');
    style.id = 'venusTourStyles';
    style.textContent = `
      .venus-tour-overlay{position:fixed;inset:0;z-index:10000;display:flex;align-items:flex-end;justify-content:center;padding:24px;background:rgba(5,5,10,.64);backdrop-filter:blur(5px)}
      .venus-tour-card{width:min(100%,460px);border:1px solid rgba(201,168,76,.32);border-radius:16px;background:#1c1c28;color:#f0ece4;box-shadow:0 24px 70px rgba(0,0,0,.55);overflow:hidden}
      .venus-tour-top{display:flex;align-items:center;gap:12px;padding:18px 20px 12px}
      .venus-tour-icon{width:40px;height:40px;border-radius:12px;display:grid;place-items:center;background:rgba(201,168,76,.14);color:#c9a84c;font-size:1.25rem;flex:0 0 auto}
      .venus-tour-title{font-size:1rem;font-weight:700;margin:0}
      .venus-tour-step{margin-left:auto;color:#888899;font-size:.78rem}
      .venus-tour-body{padding:0 20px 18px;color:#aaaab8;font-size:.9rem;line-height:1.55}
      .venus-tour-dots{display:flex;gap:6px;padding:0 20px 16px}
      .venus-tour-dot{height:6px;flex:1;border-radius:10px;background:rgba(255,255,255,.1)}
      .venus-tour-dot.active{background:#c9a84c}
      .venus-tour-actions{display:flex;gap:10px;justify-content:flex-end;padding:16px 20px;background:rgba(255,255,255,.035);border-top:1px solid rgba(255,255,255,.07)}
      .venus-tour-actions button{border:0;border-radius:10px;padding:10px 14px;font:inherit;font-weight:700;cursor:pointer}
      .venus-tour-skip{background:transparent;color:#888899}
      .venus-tour-next{background:#c9a84c;color:#0a0a0f}
      @media (min-width:720px){.venus-tour-overlay{align-items:center}.venus-tour-card{margin-left:240px}}
    `;
    document.head.appendChild(style);
  }

  function finish() {
    if (!activeRole) return;
    try {
      localStorage.removeItem(`venus:onboarding:${activeRole}`);
      localStorage.setItem(`venus:onboarding:${activeRole}:done`, '1');
    } catch {}
    overlay?.remove();
    overlay = null;
    activeRole = null;
    step = 0;
  }

  function render() {
    const items = tours[activeRole] || [];
    const item = items[step];
    if (!item) {
      finish();
      return;
    }

    item.nav?.();

    if (!overlay) {
      injectStyles();
      overlay = document.createElement('div');
      overlay.className = 'venus-tour-overlay';
      document.body.appendChild(overlay);
    }

    overlay.innerHTML = `
      <div class="venus-tour-card" role="dialog" aria-modal="true" aria-label="Tutorial rapido">
        <div class="venus-tour-top">
          <div class="venus-tour-icon"><i class="ti ti-sparkles"></i></div>
          <h2 class="venus-tour-title">${item.title}</h2>
          <span class="venus-tour-step">${step + 1}/${items.length}</span>
        </div>
        <div class="venus-tour-body">${item.text}</div>
        <div class="venus-tour-dots">${items.map((_, index) => `<span class="venus-tour-dot ${index === step ? 'active' : ''}"></span>`).join('')}</div>
        <div class="venus-tour-actions">
          <button type="button" class="venus-tour-skip">Pular</button>
          <button type="button" class="venus-tour-next">${step === items.length - 1 ? 'Concluir' : 'Proximo'}</button>
        </div>
      </div>
    `;

    overlay.querySelector('.venus-tour-skip')?.addEventListener('click', finish);
    overlay.querySelector('.venus-tour-next')?.addEventListener('click', () => {
      step += 1;
      render();
    });
  }

  function start(role, force = false) {
    if (!tours[role]) return;
    if (!force) {
      try {
        if (localStorage.getItem(`venus:onboarding:${role}`) !== '1') return;
      } catch {
        return;
      }
    }
    activeRole = role;
    step = 0;
    render();
  }

  window.VenusOnboarding = { start };

  window.addEventListener('load', () => {
    const role = document.body?.dataset?.onboardingRole;
    if (!role) return;
    setTimeout(() => start(role), 700);
  });
})();
