// ================= CONFIG =================
const WHATSAPP_NUMBER = "5592994008327";
function waLink(msg){
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(msg)}`;
}

// ================= SERVICES DATA =================
const services = [
  {
    tag: "Mais procurado",
    title: "Insulfilm Premium",
    desc: "Películas de alta transmitância óptica que bloqueiam calor e raios UV sem escurecer a visão noturna. Garantia contra bolhas e descoloração.",
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 9h18M8 9v10M14 9v10"/></svg>`,
    msg: "Olá! Vim pelo site e quero orçamento de INSULFILM (película solar) para meu carro."
  },
  {
    tag: "Proteção diária",
    title: "Lavagem Técnica",
    desc: "Processo com produtos de pH neutro e toalhas de microfibra que preservam o brilho da pintura e evitam micro-riscos.",
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M5 12l2-8h10l2 8"/><path d="M3 12h18l-2 8H5z"/><circle cx="8" cy="18" r="1"/><circle cx="16" cy="18" r="1"/></svg>`,
    msg: "Olá! Vim pelo site e quero agendar LAVAGEM TÉCNICA para meu carro."
  },
  {
    tag: "Conforto a bordo",
    title: "Higienização Interna",
    desc: "Limpeza profunda de bancos, forros e carpetes com extração e sanitização — eliminando ácaros, odores e manchas.",
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 20V10a8 8 0 0 1 16 0v10"/><path d="M4 20h16M9 20v-4a3 3 0 0 1 6 0v4"/></svg>`,
    msg: "Olá! Vim pelo site e quero orçamento de HIGIENIZAÇÃO INTERNA para meu carro."
  },
  {
    tag: "Brilho renovado",
    title: "Polimento Comercial",
    desc: "Remoção de riscos superficiais e opacidade da pintura, devolvendo brilho uniforme — ideal para preparar o carro para venda.",
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="9"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6L17 7M7 17l-1.4 1.4"/></svg>`,
    msg: "Olá! Vim pelo site e quero orçamento de POLIMENTO COMERCIAL para meu carro."
  },
  {
    tag: "Proteção máxima",
    title: "Polimento Cristalizado",
    desc: "Camada de vitrificação que protege a pintura contra riscos, chuva ácida e raios UV, com efeito espelhado por até 12 meses.",
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 2l3 6 6 1-4.5 4.4L17.5 20 12 17l-5.5 3 1-6.6L3 9l6-1z"/></svg>`,
    msg: "Olá! Vim pelo site e quero orçamento de POLIMENTO CRISTALIZADO para meu carro."
  },
  {
    tag: "Sob medida",
    title: "Outros Serviços",
    desc: "Envelopamento, remoção de amassados sem pintura (PDR), aplicação de ceras e mais. Fale com a gente e monte seu combo.",
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 2v20M2 12h20"/><circle cx="12" cy="12" r="9"/></svg>`,
    msg: "Olá! Vim pelo site e quero saber mais sobre outros serviços da Alien Pró."
  }
];

const svcGrid = document.getElementById('svcGrid');
services.forEach(s => {
  const card = document.createElement('div');
  card.className = 'svc-card reveal';
  card.innerHTML = `
    <div class="svc-icon">${s.icon}</div>
    <span class="svc-tag">${s.tag}</span>
    <h3>${s.title}</h3>
    <p>${s.desc}</p>
    <a class="svc-link" href="${waLink(s.msg)}" target="_blank" rel="noopener">Solicitar orçamento →</a>
  `;
  svcGrid.appendChild(card);
});

// ================= WHY US DATA =================
const whyItems = [
  { n: "01", t: "Equipe treinada", d: "Técnicos capacitados nos protocolos Alien Pró, do diagnóstico à entrega." },
  { n: "02", t: "Materiais premium", d: "Películas e produtos de marcas reconhecidas, sem atalhos de qualidade." },
  { n: "03", t: "Preço justo sempre", d: "Orçamento transparente, sem surpresas na hora de fechar." },
  { n: "04", t: "Sem pausa terrestre", d: "Não fechamos para o almoço — atendimento contínuo das 08h às 17h." },
];
const whyGrid = document.getElementById('whyGrid');
whyItems.forEach(w => {
  const el = document.createElement('div');
  el.className = 'why-item reveal';
  el.innerHTML = `<span class="num">${w.n}</span><h4>${w.t}</h4><p>${w.d}</p>`;
  whyGrid.appendChild(el);
});

// ================= PROCESS DATA =================
const processSteps = [
  { s: "1", t: "Contato", d: "Você fala com a gente pelo WhatsApp ou agenda direto pelo site." },
  { s: "2", t: "Diagnóstico", d: "Avaliamos o veículo e indicamos o serviço ideal para sua necessidade." },
  { s: "3", t: "Execução", d: "Nossa equipe realiza o serviço com equipamentos e produtos de ponta." },
  { s: "4", t: "Entrega", d: "Conferência final com você e garantia Alien Pró no serviço realizado." },
];
const processTrack = document.getElementById('processTrack');
processSteps.forEach(p => {
  const el = document.createElement('div');
  el.className = 'proc-step reveal';
  el.innerHTML = `<div class="proc-dot">${p.s}</div><h4>${p.t}</h4><p>${p.d}</p>`;
  processTrack.appendChild(el);
});

// ================= TESTIMONIALS DATA =================
const testimonials = [
  { name: "Ricardo A.", loc: "Cidade Nova, Manaus", text: "Insulfilm perfeito, sem bolhas e o atendimento foi rápido. Parece que o carro ganhou ar-condicionado extra!", init: "R" },
  { name: "Fernanda M.", loc: "Adrianópolis, Manaus", text: "Fiz a higienização interna e o carro ficou parecendo novo. Cheiro de carro zero, recomendo demais.", init: "F" },
  { name: "Lucas T.", loc: "Flores, Manaus", text: "Polimento cristalizado surreal, parece que a tinta foi trocada. Equipe muito profissional e pontual.", init: "L" },
];
const testiGrid = document.getElementById('testiGrid');
testimonials.forEach(t => {
  const el = document.createElement('div');
  el.className = 'testi-card reveal';
  el.innerHTML = `
    <div class="stars">★★★★★</div>
    <p>"${t.text}"</p>
    <div class="testi-who">
      <div class="testi-avatar">${t.init}</div>
      <div>
        <div class="testi-name">${t.name}</div>
        <div class="testi-loc">${t.loc}</div>
      </div>
    </div>`;
  testiGrid.appendChild(el);
});

// ================= WHATSAPP LINKS (static) =================
document.querySelectorAll('a[href="WA_LINK_GENERIC"]').forEach(a => {
  a.href = waLink("Olá! Vim pelo site da Alien Pró e gostaria de mais informações.");
});

// ================= NAV MOBILE =================
const burger = document.getElementById('burgerBtn');
const navList = document.getElementById('navList');
burger.addEventListener('click', () => navList.classList.toggle('open'));
navList.querySelectorAll('a').forEach(a => a.addEventListener('click', () => navList.classList.remove('open')));

// ================= SCHEDULE MODAL =================
const scheduleModal = document.getElementById('scheduleModal');
const openBtns = [document.getElementById('openSchedule'), document.getElementById('openScheduleBand')];
const closeModalBtn = document.getElementById('closeModal');

openBtns.forEach(btn => {
  if(!btn) return;
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    scheduleModal.classList.add('active');
  });
});
closeModalBtn.addEventListener('click', () => scheduleModal.classList.remove('active'));
scheduleModal.addEventListener('click', (e) => {
  if(e.target === scheduleModal) scheduleModal.classList.remove('active');
});

document.getElementById('scheduleForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const name = document.getElementById('fName').value.trim();
  const service = document.getElementById('fService').value;
  const date = document.getElementById('fDate').value;
  const car = document.getElementById('fCar').value.trim();

  let msg = `Olá! Quero agendar uma visita na Alien Pró.\n\nNome: ${name}\nServiço: ${service}`;
  if(date) msg += `\nData preferida: ${date}`;
  if(car) msg += `\nVeículo: ${car}`;

  window.open(waLink(msg), '_blank');
  scheduleModal.classList.remove('active');
  document.getElementById('scheduleForm').reset();
});

// ================= BEAM PARTICLES =================
const beamParticles = document.getElementById('beamParticles');
for(let i=0; i<18; i++){
  const mote = document.createElement('div');
  mote.className = 'mote';
  mote.style.left = (20 + Math.random()*190) + 'px';
  mote.style.animationDelay = (Math.random()*2.6) + 's';
  mote.style.animationDuration = (2 + Math.random()*1.2) + 's';
  beamParticles.appendChild(mote);
}

// ================= STARFIELD CANVAS =================
const canvas = document.getElementById('stars');
const ctx = canvas.getContext('2d');
let stars = [];
let w, h;

function resizeCanvas(){
  w = canvas.width = window.innerWidth;
  h = canvas.height = document.documentElement.scrollHeight;
  generateStars();
}

function generateStars(){
  const count = Math.floor((w*h)/9000);
  stars = [];
  for(let i=0;i<count;i++){
    stars.push({
      x: Math.random()*w,
      y: Math.random()*h,
      r: Math.random()*1.3 + 0.2,
      baseAlpha: Math.random()*0.6 + 0.2,
      speed: Math.random()*0.015 + 0.003,
      phase: Math.random()*Math.PI*2,
      color: Math.random() > 0.85 ? '61,220,132' : '238,247,240'
    });
  }
}

let t = 0;
function drawStars(){
  ctx.clearRect(0,0,w,h);
  t += 1;
  for(const s of stars){
    const alpha = s.baseAlpha + Math.sin(t*s.speed + s.phase) * 0.3;
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, Math.PI*2);
    ctx.fillStyle = `rgba(${s.color},${Math.max(0,alpha)})`;
    ctx.fill();
  }
  requestAnimationFrame(drawStars);
}

const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
resizeCanvas();
if(!prefersReduced){
  drawStars();
} else {
  ctx.clearRect(0,0,w,h);
  for(const s of stars){
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, Math.PI*2);
    ctx.fillStyle = `rgba(${s.color},${s.baseAlpha})`;
    ctx.fill();
  }
}

let resizeTimeout;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimeout);
  resizeTimeout = setTimeout(resizeCanvas, 200);
});

// ================= SCROLL REVEAL =================
const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if(entry.isIntersecting){
      entry.target.classList.add('in');
      revealObserver.unobserve(entry.target);
    }
  });
}, { threshold: 0.15 });

function observeReveals(){
  document.querySelectorAll('.reveal:not(.in)').forEach(el => revealObserver.observe(el));
}
// initial pass + after dynamic content injected
observeReveals();

// ================= HEADER SHADOW ON SCROLL =================
const header = document.querySelector('header');
window.addEventListener('scroll', () => {
  if(window.scrollY > 40){
    header.style.boxShadow = '0 4px 30px rgba(0,0,0,0.4)';
  } else {
    header.style.boxShadow = 'none';
  }
});
