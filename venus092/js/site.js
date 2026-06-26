(function () {
  const SUPABASE_URL = 'https://wykmukfohehtpoezojwg.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5a211a2ZvaGVodHBvZXpvandnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAxNTc0NjcsImV4cCI6MjA5NTczMzQ2N30.mlfxsXSirX-0MXOreyShuS2kn5JDh_nMEp1onsBL9-0';
  const LOCATION_KEY = 'venus_visitor_location';
  const LOCATION_TTL = 1000 * 60 * 60 * 12;
  let sbClient = null;

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      if (document.querySelector(`script[src="${src}"]`)) {
        resolve();
        return;
      }
      const script = document.createElement('script');
      script.src = src;
      script.async = true;
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  async function getSupabaseClient() {
    if (sbClient) return sbClient;
    if (!window.supabase?.createClient) {
      try {
        await loadScript('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js');
      } catch {
        return null;
      }
    }
    if (!window.supabase?.createClient) return null;
    sbClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { storageKey: location.pathname.endsWith('/admin.html') ? 'venus-admin-session' : 'venus-user-session' }
    });
    return sbClient;
  }

  function getStoredLocation() {
    try {
      const data = JSON.parse(localStorage.getItem(LOCATION_KEY) || 'null');
      if (!data?.capturedAt || Date.now() - data.capturedAt > LOCATION_TTL) return null;
      return data;
    } catch {
      return null;
    }
  }

  function saveLocation(data) {
    const location = { ...data, capturedAt: Date.now() };
    localStorage.setItem(LOCATION_KEY, JSON.stringify(location));
    window.dispatchEvent(new CustomEvent('venus:location', { detail: location }));
    updateLocationBadges(location);
    return location;
  }

  async function reverseGeocode(latitude, longitude) {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json&addressdetails=1`,
      { headers: { 'Accept-Language': 'pt-BR' } }
    );
    const geo = await res.json();
    const addr = geo.address || {};
    return {
      latitude,
      longitude,
      bairro: addr.suburb || addr.neighbourhood || addr.quarter || '',
      cidade: addr.city || addr.town || addr.village || addr.municipality || '',
      uf: String(addr.state_code || '').toUpperCase().slice(0, 2),
      cep: String(addr.postcode || '').replace(/\D/g, ''),
      label: geo.display_name || ''
    };
  }

  function captureLocation(options = {}) {
    const cached = getStoredLocation();
    if (cached && !options.force) {
      window.dispatchEvent(new CustomEvent('venus:location', { detail: cached }));
      updateLocationBadges(cached);
      return Promise.resolve(cached);
    }

    if (!navigator.geolocation) {
      return Promise.reject(new Error('Geolocalizacao indisponivel neste navegador.'));
    }

    return new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        async pos => {
          try {
            const location = await reverseGeocode(pos.coords.latitude, pos.coords.longitude);
            resolve(saveLocation(location));
          } catch (err) {
            reject(err);
          }
        },
        reject,
        { enableHighAccuracy: true, timeout: 12000, maximumAge: 1000 * 60 * 10 }
      );
    });
  }

  function locationText(location) {
    return [location.bairro, location.cidade, location.uf].filter(Boolean).join(', ');
  }

  function updateLocationBadges(location) {
    document.querySelectorAll('[data-location-label]').forEach(el => {
      el.textContent = locationText(location) || 'Localizacao detectada';
    });
  }

  function waitForAgeGateThenCapture() {
    const gate = document.getElementById('ageGate');
    const canAsk = () => !gate || gate.style.display === 'none' || localStorage.getItem('venus_age_confirmed') === '1';

    if (canAsk()) {
      captureLocation().catch(() => {});
      return;
    }

    const timer = setInterval(() => {
      if (!canAsk()) return;
      clearInterval(timer);
      captureLocation().catch(() => {});
    }, 500);
  }

  function initials(name, email) {
    const source = (name || email || 'U').trim();
    const parts = source.split(/\s+/).filter(Boolean);
    return (parts[0]?.[0] || 'U').toUpperCase() + (parts[1]?.[0] || '').toUpperCase();
  }

  async function initAuthMenu() {
    const navbar = document.querySelector('.navbar');
    const nav = navbar?.querySelector('.navbar-nav');
    if (!navbar || !nav) return;

    nav.querySelectorAll('a[href*="login.html"]').forEach(link => {
      link.classList.add('nav-login-round');
      link.setAttribute('aria-label', 'Entrar');
      link.setAttribute('title', 'Entrar');
      link.innerHTML = '<i class="ti ti-login-2"></i>';
    });

    const client = await getSupabaseClient();
    if (!client) return;

    const { data: { user } } = await client.auth.getUser();
    if (!user) return;

    const [{ data: customer }, { data: professional }] = await Promise.all([
      client.from('customers').select('nome, avatar_url').eq('id', user.id).maybeSingle(),
      client.from('profiles').select('nome_artistico').eq('id', user.id).maybeSingle()
    ]);

    const isCustomer = Boolean(customer);
    const displayName = customer?.nome || professional?.nome_artistico || user.email || 'Meu perfil';
    const panelUrl = isCustomer ? 'painel-cliente.html' : 'painel.html';
    const avatarUrl = customer?.avatar_url || '';

    ['navLinkCadastro', 'navBtnEntrar', 'navBtnAnuncie'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    });
    nav.querySelectorAll('a[href*="login.html"], a[href*="cadastro.html"]').forEach(el => {
      if (!el.classList.contains('navbar-brand')) el.style.display = 'none';
    });

    const legacy = document.getElementById('navCliente');
    if (legacy) legacy.style.display = 'none';
    if (nav.querySelector('.nav-account')) return;

    const account = document.createElement('div');
    account.className = 'nav-account';
    account.innerHTML = `
      <button class="nav-account-btn" type="button" aria-expanded="false" aria-label="Abrir perfil">
        <span class="nav-account-avatar">
          ${avatarUrl ? `<img src="${avatarUrl}" alt="Avatar" referrerpolicy="no-referrer">` : `<span>${initials(displayName, user.email)}</span>`}
        </span>
      </button>
      <div class="nav-account-menu" role="menu">
        <div class="nav-account-head">
          <strong>${displayName.split(' ')[0]}</strong>
          <span>${isCustomer ? 'Cliente' : 'Profissional'}</span>
        </div>
        <a href="${panelUrl}" role="menuitem"><i class="ti ti-user-circle"></i> Meu perfil</a>
        <a href="catalogo.html" role="menuitem"><i class="ti ti-search"></i> Catalogo</a>
        <button type="button" role="menuitem" data-nav-logout><i class="ti ti-logout"></i> Sair</button>
      </div>
    `;
    nav.appendChild(account);

    const button = account.querySelector('.nav-account-btn');
    const setOpen = open => {
      account.classList.toggle('open', open);
      button.setAttribute('aria-expanded', String(open));
    };
    button.addEventListener('click', event => {
      event.stopPropagation();
      setOpen(!account.classList.contains('open'));
    });
    account.querySelector('[data-nav-logout]').addEventListener('click', async () => {
      await client.auth.signOut();
      window.location.href = 'login.html';
    });
    document.addEventListener('click', event => {
      if (!account.contains(event.target)) setOpen(false);
    });
  }

  function initNavbarSearch() {
    document.querySelectorAll('.navbar-search input').forEach(input => {
      input.setAttribute('type', 'search');
      input.addEventListener('keydown', event => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        const q = input.value.trim();
        window.location.href = q ? `catalogo.html?q=${encodeURIComponent(q)}` : 'catalogo.html';
      });
    });
  }

  function initHomeFilter() {
    const form = document.getElementById('homeSmartFilter');
    if (!form) return;

    const useLocation = document.getElementById('homeUseLocation');
    const locationInput = document.getElementById('homeLocation');
    const cepInput = document.getElementById('heroCep');

    const fillLocation = location => {
      const text = locationText(location);
      if (locationInput && text) locationInput.value = text;
      if (cepInput && location.cep?.length === 8) cepInput.value = location.cep.slice(0, 5) + '-' + location.cep.slice(5);
    };

    const cached = getStoredLocation();
    if (cached) fillLocation(cached);
    window.addEventListener('venus:location', event => fillLocation(event.detail));

    useLocation?.addEventListener('click', async () => {
      useLocation.disabled = true;
      useLocation.innerHTML = '<i class="ti ti-loader-2"></i>';
      try {
        fillLocation(await captureLocation({ force: true }));
      } finally {
        useLocation.disabled = false;
        useLocation.innerHTML = '<i class="ti ti-current-location"></i>';
      }
    });

    form.addEventListener('submit', event => {
      event.preventDefault();
      const params = new URLSearchParams();
      const q = document.getElementById('homeQuery')?.value.trim();
      const loc = locationInput?.value.trim();
      const cat = document.getElementById('homeCategory')?.value;
      const preco = document.getElementById('homePrecoMax')?.value;
      const atendimento = document.getElementById('homeAtendimento')?.value;
      const online = document.getElementById('homeOnline')?.checked;
      const verificado = document.getElementById('homeVerificado')?.checked;
      const cachedLocation = getStoredLocation();

      if (q) params.set('q', q);
      if (cat) params.set('cat', cat);
      if (preco) params.set('precoMax', preco);
      if (atendimento) params.set('atendimento', atendimento);
      if (online) params.set('online', '1');
      if (verificado) params.set('verificado', '1');
      if (cachedLocation && loc === locationText(cachedLocation)) {
        if (cachedLocation.cidade) params.set('cidade', cachedLocation.cidade);
        if (cachedLocation.bairro) params.set('bairro', cachedLocation.bairro);
        if (cachedLocation.uf) params.set('uf', cachedLocation.uf);
        if (cachedLocation.cep) params.set('cep', cachedLocation.cep);
      } else if (loc) {
        params.set('q', [q, loc].filter(Boolean).join(' '));
      }

      window.location.href = `catalogo.html${params.toString() ? '?' + params.toString() : ''}`;
    });
  }

  function getPresenceKey() {
    let key = localStorage.getItem('venus_presence_key');
    if (!key) {
      const bytes = new Uint8Array(16);
      crypto.getRandomValues(bytes);
      key = [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
      localStorage.setItem('venus_presence_key', key);
    }
    return key;
  }

  async function heartbeatPresence() {
    const client = await getSupabaseClient();
    if (!client) return;
    const { data: { user } } = await client.auth.getUser();
    let role = 'anon';
    if (user) {
      const [{ data: customer }, { data: professional }] = await Promise.all([
        client.from('customers').select('id').eq('id', user.id).maybeSingle(),
        client.from('profiles').select('id').eq('id', user.id).maybeSingle()
      ]);
      role = customer ? 'customer' : professional ? 'professional' : location.pathname.endsWith('/admin.html') ? 'admin' : 'anon';
    }

    client.rpc('track_site_presence', {
      p_visitor_key: getPresenceKey(),
      p_role: role,
      p_page: location.pathname.split('/').pop() || 'index.html'
    }).then(({ error }) => {
      if (error && !window.__venusPresenceWarned) {
        window.__venusPresenceWarned = true;
        console.warn('Presenca online indisponivel:', error.message);
      }
    });
  }

  function injectAnnouncementStyles() {
    if (document.getElementById('venus-announcement-style')) return;
    const style = document.createElement('style');
    style.id = 'venus-announcement-style';
    style.textContent = `
      .venus-announcement-backdrop{position:fixed;inset:0;z-index:16000;display:flex;align-items:center;justify-content:center;padding:18px;background:rgba(3,3,8,.72);backdrop-filter:blur(10px)}
      .venus-announcement-card{width:min(460px,100%);border:1px solid rgba(201,168,76,.34);border-radius:18px;background:#17151d;color:#f8f4ee;box-shadow:0 28px 80px rgba(0,0,0,.58);overflow:hidden}
      .venus-announcement-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;padding:20px 20px 10px}
      .venus-announcement-kicker{display:inline-flex;align-items:center;gap:6px;margin-bottom:8px;padding:4px 9px;border-radius:999px;background:rgba(201,168,76,.16);color:#d9b95d;font-size:.72rem;font-weight:800;text-transform:uppercase}
      .venus-announcement-title{margin:0;font-size:1.35rem;line-height:1.15}
      .venus-announcement-close{width:34px;height:34px;border:1px solid rgba(255,255,255,.14);border-radius:10px;background:rgba(255,255,255,.06);color:#fff;cursor:pointer}
      .venus-announcement-body{padding:0 20px 20px;color:#d7d0dc;line-height:1.55;white-space:pre-line}
      .venus-announcement-actions{display:flex;justify-content:flex-end;gap:10px;padding:0 20px 20px}
      .venus-announcement-cta{display:inline-flex;align-items:center;justify-content:center;min-height:42px;padding:0 16px;border-radius:12px;background:#c9a84c;color:#111;font-weight:900;text-decoration:none}
      .venus-announcement-kind-promo .venus-announcement-kicker{background:rgba(45,212,191,.14);color:#2dd4bf}
      .venus-announcement-kind-warning .venus-announcement-kicker{background:rgba(248,113,113,.15);color:#f87171}
    `;
    document.head.appendChild(style);
  }

  function announcementKindText(kind) {
    if (kind === 'promo') return 'Promocao';
    if (kind === 'warning') return 'Atencao';
    return 'Aviso';
  }

  function dismissAnnouncement(id) {
    try {
      localStorage.setItem(`venus:announcement:dismissed:${id}`, '1');
    } catch {}
    document.querySelector('.venus-announcement-backdrop')?.remove();
  }

  function showAnnouncementPopup(item) {
    if (!item?.id || document.querySelector('.venus-announcement-backdrop')) return;
    injectAnnouncementStyles();
    const backdrop = document.createElement('div');
    backdrop.className = 'venus-announcement-backdrop';
    backdrop.setAttribute('role', 'presentation');

    const card = document.createElement('section');
    card.className = `venus-announcement-card venus-announcement-kind-${item.kind || 'info'}`;
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-modal', 'true');
    card.setAttribute('aria-labelledby', 'venusAnnouncementTitle');

    const head = document.createElement('div');
    head.className = 'venus-announcement-head';
    const titleWrap = document.createElement('div');
    const kicker = document.createElement('span');
    kicker.className = 'venus-announcement-kicker';
    kicker.textContent = announcementKindText(item.kind);
    const title = document.createElement('h2');
    title.id = 'venusAnnouncementTitle';
    title.className = 'venus-announcement-title';
    title.textContent = item.title || 'Comunicado';
    titleWrap.append(kicker, title);

    const close = document.createElement('button');
    close.className = 'venus-announcement-close';
    close.type = 'button';
    close.setAttribute('aria-label', 'Fechar comunicado');
    close.textContent = 'x';
    close.addEventListener('click', () => dismissAnnouncement(item.id));
    head.append(titleWrap, close);

    const body = document.createElement('div');
    body.className = 'venus-announcement-body';
    body.textContent = item.body || '';
    card.append(head, body);

    if (item.cta_label && item.cta_url && /^https?:\/\//i.test(item.cta_url)) {
      const actions = document.createElement('div');
      actions.className = 'venus-announcement-actions';
      const link = document.createElement('a');
      link.className = 'venus-announcement-cta';
      link.href = item.cta_url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = item.cta_label;
      link.addEventListener('click', () => dismissAnnouncement(item.id));
      actions.appendChild(link);
      card.appendChild(actions);
    }

    backdrop.addEventListener('click', event => {
      if (event.target === backdrop) dismissAnnouncement(item.id);
    });
    document.addEventListener('keydown', function onKey(event) {
      if (event.key !== 'Escape' || !document.body.contains(backdrop)) return;
      dismissAnnouncement(item.id);
      document.removeEventListener('keydown', onKey);
    });
    backdrop.appendChild(card);
    document.body.appendChild(backdrop);
    close.focus();
  }

  async function loadAdminAnnouncements() {
    if (location.pathname.endsWith('/admin.html')) return;
    const client = await getSupabaseClient();
    if (!client) return;
    const { data: { user } } = await client.auth.getUser();
    if (!user) return;

    const { data, error } = await client.rpc('get_my_admin_announcements');
    if (error) {
      if (!window.__venusAnnouncementsWarned) {
        window.__venusAnnouncementsWarned = true;
        console.warn('Comunicados indisponiveis:', error.message);
      }
      return;
    }
    const unseen = (data || []).find(item => {
      try {
        return !localStorage.getItem(`venus:announcement:dismissed:${item.id}`);
      } catch {
        return true;
      }
    });
    if (unseen) showAnnouncementPopup(unseen);
  }

  function init() {
    initNavbarSearch();
    initHomeFilter();
    initAuthMenu();
    heartbeatPresence();
    loadAdminAnnouncements();
    setInterval(heartbeatPresence, 60000);
    waitForAgeGateThenCapture();
    updateLocationBadges(getStoredLocation() || {});
  }

  window.VenusSite = {
    captureLocation,
    getStoredLocation,
    locationText
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
