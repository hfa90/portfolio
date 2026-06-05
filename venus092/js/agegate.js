/* ═══════════════════════════════════════════════════════════════
   VÊNUS — agegate.js  |  Age gate + responsive navbar helper
   ═══════════════════════════════════════════════════════════════ */

// ── AGE GATE ─────────────────────────────────────────────────
function enterSite() {
  sessionStorage.setItem('venus-age-ok', '1');
  const gate = document.getElementById('ageGate');
  if (gate) {
    gate.style.transition = 'opacity .4s ease, transform .4s ease';
    gate.style.opacity = '0';
    gate.style.transform = 'scale(1.04)';
    setTimeout(() => gate.remove(), 420);
  }
}

(function checkAgeGate() {
  const gate = document.getElementById('ageGate');
  if (!gate) return;
  if (sessionStorage.getItem('venus-age-ok')) {
    gate.remove();
  } else {
    gate.style.display = 'flex';
  }
})();

// ── RESPONSIVE NAVBAR ─────────────────────────────────────────
(function initNavbar() {
  const navbar = document.querySelector('.navbar');
  if (!navbar) return;

  // Create hamburger if not present
  let ham = navbar.querySelector('.navbar-hamburger');
  if (!ham) {
    ham = document.createElement('button');
    ham.className = 'navbar-hamburger';
    ham.setAttribute('aria-label', 'Menu');
    ham.setAttribute('aria-expanded', 'false');
    ham.innerHTML = '<span></span><span></span><span></span>';
    navbar.appendChild(ham);
  }

  // Create drawer if not present
  let drawer = document.querySelector('.navbar-drawer');
  if (!drawer) {
    drawer = document.createElement('div');
    drawer.className = 'navbar-drawer';
    drawer.setAttribute('role', 'navigation');

    // Clone nav links into drawer
    const navLinks = navbar.querySelectorAll('.nav-link, .btn');
    navLinks.forEach(link => {
      drawer.appendChild(link.cloneNode(true));
    });

    document.body.appendChild(drawer);
  }

  // Toggle
  function openMenu() {
    ham.setAttribute('aria-expanded', 'true');
    drawer.classList.add('open');
    document.body.style.overflow = 'hidden';
    ham.querySelector('span:nth-child(1)').style.transform = 'rotate(45deg) translate(5px, 5px)';
    ham.querySelector('span:nth-child(2)').style.opacity = '0';
    ham.querySelector('span:nth-child(3)').style.transform = 'rotate(-45deg) translate(5px, -5px)';
  }

  function closeMenu() {
    ham.setAttribute('aria-expanded', 'false');
    drawer.classList.remove('open');
    document.body.style.overflow = '';
    ham.querySelectorAll('span').forEach(s => { s.style.transform = ''; s.style.opacity = ''; });
  }

  ham.addEventListener('click', () => {
    drawer.classList.contains('open') ? closeMenu() : openMenu();
  });

  // Close on resize
  window.addEventListener('resize', () => {
    if (window.innerWidth > 768) closeMenu();
  });

  // Close on drawer link click
  drawer.addEventListener('click', e => {
    if (e.target.tagName === 'A' || e.target.closest('a')) closeMenu();
  });

  // Scroll effect
  window.addEventListener('scroll', () => {
    if (window.scrollY > 10) {
      navbar.style.background = 'rgba(13,13,20,.95)';
    } else {
      navbar.style.background = '';
    }
  }, { passive: true });
})();