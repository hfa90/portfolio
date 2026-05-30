// ── CEP UTILS ──
async function buscarCep(cep) {
  const clean = cep.replace(/\D/g, '');
  if (clean.length !== 8) return null;
  try {
    const res = await fetch(`https://viacep.com.br/ws/${clean}/json/`);
    const data = await res.json();
    if (data.erro) return null;
    return {
      cep: data.cep,
      logradouro: data.logradouro,
      bairro: data.bairro,
      cidade: data.localidade,
      estado: data.uf
    };
  } catch (e) {
    console.error('Erro ao buscar CEP:', e);
    return null;
  }
}

function maskCep(input) {
  input.addEventListener('input', function () {
    let v = this.value.replace(/\D/g, '');
    if (v.length > 5) v = v.slice(0, 5) + '-' + v.slice(5, 8);
    this.value = v;
  });
}

// Haversine distance in km
function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 +
            Math.cos(lat1 * Math.PI/180) * Math.cos(lat2 * Math.PI/180) *
            Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// ── SUPABASE CONFIG ──────────────────────────────────────────
// As chaves ficam centralizadas em js/supabase.js
// Este arquivo apenas exporta utilitários de CEP e distância.
// Não é necessário duplicar as chaves aqui.
