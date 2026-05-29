// ============================================================
// TOAST NOTIFICATIONS
// ============================================================
export function toast(message, type = 'info', duration = 3500) {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
  }
  const icons = { success: 'ti-circle-check', error: 'ti-circle-x', info: 'ti-info-circle', warning: 'ti-alert-triangle' };
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.innerHTML = `<i class="ti ${icons[type]}"></i><span>${message}</span>`;
  container.appendChild(el);
  setTimeout(() => {
    el.classList.add('hide');
    setTimeout(() => el.remove(), 300);
  }, duration);
}

// ============================================================
// LOADING STATE
// ============================================================
export function setLoading(btn, loading, text = '') {
  if (loading) {
    btn.disabled = true;
    btn._original = btn.innerHTML;
    btn.innerHTML = `<span class="spinner"></span>${text ? ` ${text}` : ''}`;
  } else {
    btn.disabled = false;
    btn.innerHTML = btn._original || btn.innerHTML;
  }
}

// ============================================================
// FORMATTERS
// ============================================================
export function formatCurrency(value) {
  if (!value) return '—';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

export function formatDate(dateStr) {
  if (!dateStr) return '—';
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(dateStr));
}

export function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr);
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'agora';
  if (m < 60) return `${m}min atrás`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h atrás`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d atrás`;
  return formatDate(dateStr);
}

export function getInitials(name) {
  if (!name) return '?';
  return name.trim().split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
}

export function maskCPF(v) {
  return v.replace(/\D/g,'').replace(/(\d{3})(\d)/,'$1.$2').replace(/(\d{3})(\d)/,'$1.$2').replace(/(\d{3})(\d{1,2})$/,'$1-$2');
}
export function maskCNPJ(v) {
  return v.replace(/\D/g,'').replace(/^(\d{2})(\d)/,'$1.$2').replace(/^(\d{2})\.(\d{3})(\d)/,'$1.$2.$3').replace(/\.(\d{3})(\d)/,'.$1/$2').replace(/(\d{4})(\d)/,'$1-$2');
}
export function maskPhone(v) {
  const d = v.replace(/\D/g,'');
  if (d.length <= 10) return d.replace(/(\d{2})(\d{4})(\d{0,4})/,'($1) $2-$3');
  return d.replace(/(\d{2})(\d{5})(\d{0,4})/,'($1) $2-$3');
}
export function maskCEP(v) {
  return v.replace(/\D/g,'').replace(/(\d{5})(\d)/,'$1-$2');
}

// ============================================================
// MODAL HELPERS
// ============================================================
export function openModal(id) {
  const el = document.getElementById(id);
  if (el) { el.classList.add('open'); document.body.style.overflow = 'hidden'; }
}
export function closeModal(id) {
  const el = document.getElementById(id);
  if (el) { el.classList.remove('open'); document.body.style.overflow = ''; }
}

// Fecha modal ao clicar no overlay
document.addEventListener('click', (e) => {
  if (e.target.classList.contains('overlay')) {
    e.target.classList.remove('open');
    document.body.style.overflow = '';
  }
});

// ============================================================
// AVATAR INICIAL
// ============================================================
export function renderAvatar(name, size = 'md', imgUrl = null) {
  if (imgUrl) return `<img src="${imgUrl}" class="avatar avatar-${size}" alt="${name}">`;
  const initials = getInitials(name);
  const colors = ['#5b7cfa','#a78bfa','#34d399','#f87171','#fbbf24','#60a5fa','#fb923c'];
  const color = colors[(name || '').charCodeAt(0) % colors.length];
  return `<div class="avatar avatar-${size}" style="background:${color}">${initials}</div>`;
}

// ============================================================
// FORM VALIDATION
// ============================================================
export function showError(fieldId, message) {
  const field = document.getElementById(fieldId);
  const errEl = document.getElementById(`${fieldId}-error`);
  if (field) field.style.borderColor = 'var(--danger)';
  if (errEl) { errEl.textContent = message; errEl.classList.add('show'); }
}
export function clearError(fieldId) {
  const field = document.getElementById(fieldId);
  const errEl = document.getElementById(`${fieldId}-error`);
  if (field) field.style.borderColor = '';
  if (errEl) errEl.classList.remove('show');
}
export function clearAllErrors(formEl) {
  formEl.querySelectorAll('.form-error').forEach(e => e.classList.remove('show'));
  formEl.querySelectorAll('.form-input').forEach(e => e.style.borderColor = '');
}
