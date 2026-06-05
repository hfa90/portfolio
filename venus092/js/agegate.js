// ── AGE GATE ──
(function () {
  const gate = document.getElementById('ageGate');
  if (!gate) return;

  // Check if already confirmed
  if (localStorage.getItem('venus_age_confirmed') === '1') {
    gate.style.display = 'none';
    return;
  }

  gate.classList.add('visible');
  document.body.style.overflow = 'hidden';
})();

function enterSite() {
  localStorage.setItem('venus_age_confirmed', '1');
  const gate = document.getElementById('ageGate');
  if (gate) {
    gate.style.opacity = '0';
    gate.style.transition = 'opacity 0.4s';
    setTimeout(() => { gate.style.display = 'none'; }, 400);
    document.body.style.overflow = '';
  }
}
