(function () {
  function initMobileNav() {
    document.querySelectorAll('.navbar').forEach((navbar, index) => {
      const nav = navbar.querySelector('.navbar-nav');
      if (!nav || navbar.querySelector('.navbar-menu-btn')) return;

      const id = nav.id || `navbarNavMobile${index}`;
      nav.id = id;

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'navbar-menu-btn';
      btn.setAttribute('aria-controls', id);
      btn.setAttribute('aria-expanded', 'false');
      btn.setAttribute('aria-label', 'Abrir menu');
      btn.innerHTML = '<i class="ti ti-menu-2"></i>';

      const scrim = document.createElement('button');
      scrim.type = 'button';
      scrim.className = 'navbar-scrim';
      scrim.setAttribute('aria-label', 'Fechar menu');

      function setOpen(open) {
        nav.classList.toggle('open', open);
        scrim.classList.toggle('open', open);
        document.body.classList.toggle('nav-menu-open', open);
        btn.setAttribute('aria-expanded', String(open));
        btn.innerHTML = open ? '<i class="ti ti-x"></i>' : '<i class="ti ti-menu-2"></i>';
      }

      btn.addEventListener('click', () => setOpen(!nav.classList.contains('open')));
      scrim.addEventListener('click', () => setOpen(false));
      nav.addEventListener('click', event => {
        if (event.target.closest('a,button')) setOpen(false);
      });

      navbar.appendChild(btn);
      document.body.appendChild(scrim);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMobileNav);
  } else {
    initMobileNav();
  }
})();
