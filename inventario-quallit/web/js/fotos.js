// Fotos na ficha da máquina (painel e app de campo).
// A foto é reduzida no próprio aparelho (lado maior 1600 px, JPEG) antes de enviar: ~200–400 KB em vez
// dos 3–6 MB da câmera, e envia rápido mesmo no 4G. Fica no Storage do Supabase (bucket privado
// "fotos-maquinas", pasta = id da máquina) e é baixada com o login do usuário (as regras do banco
// decidem quem vê: administrador todas, field só as do próprio CD).
import { idAleatorio } from './offline.js';

const BUCKET = 'fotos-maquinas';
const LADO_MAX = 1600;

export const MIGRACAO_FOTOS = 'Falta atualizar o banco para as fotos (migração 20261114000001).';
const semBanco = (e) => /maquinas_fotos|bucket.*not.*found|Bucket not found|schema cache/i.test(e?.message || '');
export const erroFoto = (e) => (semBanco(e) ? MIGRACAO_FOTOS : e?.message || String(e));

function carregarImagem(arquivo) {
  return new Promise((ok, falha) => {
    const url = URL.createObjectURL(arquivo);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); ok(img); };
    img.onerror = () => { URL.revokeObjectURL(url); falha(new Error('Não foi possível abrir a imagem. Use uma foto JPG ou PNG.')); };
    img.src = url;
  });
}

// reduz e converte para JPEG (o navegador já aplica a rotação da câmera)
export async function comprimir(arquivo) {
  const img = await carregarImagem(arquivo);
  const escala = Math.min(1, LADO_MAX / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.round(img.naturalWidth * escala), h = Math.round(img.naturalHeight * escala);
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const cx = cv.getContext('2d');
  cx.fillStyle = '#fff'; cx.fillRect(0, 0, w, h);
  cx.drawImage(img, 0, 0, w, h);
  return new Promise((ok, falha) => cv.toBlob((b) => (b ? ok(b) : falha(new Error('Falha ao preparar a foto'))), 'image/jpeg', 0.82));
}

export async function listarFotos(sb, maquinaId) {
  const { data, error } = await sb.from('maquinas_fotos').select('*').eq('maquina_id', maquinaId).order('criado_em', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function enviarFoto(sb, maquinaId, arquivo, legenda = '') {
  const blob = await comprimir(arquivo);
  const caminho = `${maquinaId}/${idAleatorio()}.jpg`;
  const up = await sb.storage.from(BUCKET).upload(caminho, blob, { contentType: 'image/jpeg', upsert: false });
  if (up.error) throw up.error;
  const { data, error } = await sb.from('maquinas_fotos')
    .insert({ maquina_id: maquinaId, caminho, legenda: String(legenda || '').trim().slice(0, 200) || null, tamanho: blob.size })
    .select('*').single();
  if (error) { await sb.storage.from(BUCKET).remove([caminho]).catch(() => {}); throw error; }
  return data;
}

// a foto é privada: baixa com o login e mostra como blob: (a política de segurança do site permite)
const urls = new Map();
export async function urlFoto(sb, caminho) {
  if (urls.has(caminho)) return urls.get(caminho);
  const { data, error } = await sb.storage.from(BUCKET).download(caminho);
  if (error) throw error;
  const u = URL.createObjectURL(data);
  urls.set(caminho, u);
  return u;
}

// o arquivo sai primeiro (a regra do Storage confere quem enviou pela linha da foto), depois a linha
export async function apagarFoto(sb, foto) {
  const r = await sb.storage.from(BUCKET).remove([foto.caminho]);
  if (r.error) throw r.error;
  const { error } = await sb.from('maquinas_fotos').delete().eq('id', foto.id);
  if (error) throw error;
  const u = urls.get(foto.caminho);
  if (u) { URL.revokeObjectURL(u); urls.delete(foto.caminho); }
}

// preenche as <img data-foto="caminho"> de um elemento
export function carregarMiniaturas(sb, el) {
  el.querySelectorAll('img[data-foto]').forEach(async (img) => {
    try { img.src = await urlFoto(sb, img.dataset.foto); } catch { img.alt = 'Foto indisponível'; img.classList.add('foto-erro'); }
  });
}
