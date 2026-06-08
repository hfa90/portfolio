(function () {
  function initMobileNav() {
    document.querySelectorAll('.navbar').forEach((navbar, index) => {
      const nav = navbar.querySelector('.navbar-nav');
      if (navbar.dataset.noMobileNav === 'true' || !nav || navbar.querySelector('.navbar-menu-btn')) return;

      const id = nav.id || `navbarNavMobile${index}`;
      nav.id = id;

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'navbar-menu-btn';
      btn.setAttribute('aria-controls', id);
      btn.setAttribute('aria-expanded', 'false');
      btn.setAttribute('aria-label', 'Entrar');
      btn.innerHTML = '<i class="ti ti-login-2"></i>';

      const scrim = document.createElement('button');
      scrim.type = 'button';
      scrim.className = 'navbar-scrim';
      scrim.setAttribute('aria-label', 'Fechar menu');

      function hasAccountMenu() {
        return Boolean(nav.querySelector('.nav-account'));
      }

      function hasLoginAction() {
        return Boolean(nav.querySelector('a[href*="login.html"]'));
      }

      function syncButton() {
        const hasAccount = hasAccountMenu();
        const loginAction = hasLoginAction();
        btn.classList.toggle('navbar-login-mobile', !hasAccount && loginAction);
        btn.classList.toggle('navbar-account-mobile', hasAccount);
        btn.setAttribute('aria-label', hasAccount ? 'Abrir conta' : loginAction ? 'Entrar' : 'Abrir menu');
        if (!nav.classList.contains('open')) {
          btn.innerHTML = hasAccount
            ? '<i class="ti ti-user-circle"></i>'
            : loginAction ? '<i class="ti ti-login-2"></i>' : '<i class="ti ti-menu-2"></i>';
        }
      }

      function setOpen(open) {
        if (!hasAccountMenu() && hasLoginAction()) {
          window.location.href = 'login.html';
          return;
        }
        nav.classList.toggle('open', open);
        scrim.classList.toggle('open', open);
        document.body.classList.toggle('nav-menu-open', open);
        btn.setAttribute('aria-expanded', String(open));
        btn.innerHTML = open ? '<i class="ti ti-x"></i>' : hasAccountMenu() ? '<i class="ti ti-user-circle"></i>' : '<i class="ti ti-menu-2"></i>';
      }

      btn.addEventListener('click', () => setOpen(!nav.classList.contains('open')));
      scrim.addEventListener('click', () => setOpen(false));
      nav.addEventListener('click', event => {
        if (event.target.closest('a,button')) setOpen(false);
      });

      navbar.appendChild(btn);
      document.body.appendChild(scrim);
      syncButton();
      window.addEventListener('venus:auth-menu-ready', syncButton);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMobileNav);
  } else {
    initMobileNav();
  }
})();
