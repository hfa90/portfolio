// ============================================================================
// chaveamentoService.js — liga bracket.js (algoritmo puro) ao Supabase
// ============================================================================
import { supabase } from "./supabaseClient.js";
import { gerarEliminacaoDupla } from "./bracket.js";

/** Embaralha um array (Fisher-Yates) — usado para o sorteio das posições */
export function embaralhar(array) {
  const copia = [...array];
  for (let i = copia.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }
  return copia;
}

/**
 * Gera (sorteia) e grava no Supabase a chave de eliminação dupla de uma
 * modalidade, a partir das inscrições já confirmadas (pagamento aprovado).
 */
export async function gerarChaveParaModalidade(modalidadeId) {
  const { data: inscritos, error: errInscritos } = await supabase
    .from("inscricoes")
    .select("id, atleta_id, atletas(id, nome_completo)")
    .eq("modalidade_id", modalidadeId)
    .eq("status", "confirmada");

  if (errInscritos) throw errInscritos;
  if (!inscritos || inscritos.length < 2) {
    throw new Error("É preciso de pelo menos 2 inscrições confirmadas para gerar a chave.");
  }

  const { data: chaveExistente } = await supabase
    .from("chaves")
    .select("id")
    .eq("modalidade_id", modalidadeId)
    .maybeSingle();
  if (chaveExistente) {
    throw new Error("Já existe uma chave gerada para esta modalidade. Apague-a antes de gerar outra.");
  }

  const participantes = embaralhar(inscritos.map((i) => ({ id: i.atleta_id })));
  const { tamanho, partidas } = gerarEliminacaoDupla(participantes);

  const { data: chave, error: errChave } = await supabase
    .from("chaves")
    .insert({ modalidade_id: modalidadeId, tamanho, status: "em_andamento", gerada_em: new Date().toISOString() })
    .select()
    .single();
  if (errChave) throw errChave;

  // 1ª passada: insere todas as partidas sem os links entre elas (ainda não
  // existem UUIDs reais) e guarda o mapeamento ref-local -> uuid-do-banco.
  const linhas = partidas.map((p) => ({
    chave_id: chave.id,
    fase: p.fase,
    rodada: p.rodada,
    posicao: p.posicao,
    atleta1_id: p.atleta1_participante_id,
    atleta2_id: p.atleta2_participante_id,
    vencedor_id: p.vencedor_participante_id,
    status: p.status,
    avanco_automatico: p.avanco_automatico,
  }));

  const { data: inseridas, error: errInsert } = await supabase.from("partidas").insert(linhas).select();
  if (errInsert) throw errInsert;

  // mapeia ref local (ex: "WB-1-0-1") -> uuid real, na MESMA ORDEM em que foi inserido
  const refParaId = new Map();
  partidas.forEach((p, i) => refParaId.set(p.ref, inseridas[i].id));

  // 2ª passada: atualiza os links (origem e próxima partida) usando os uuids reais
  const atualizacoes = partidas.map((p, i) => ({
    id: inseridas[i].id,
    origem_atleta1_partida_id: p.origem_atleta1_ref ? refParaId.get(p.origem_atleta1_ref) : null,
    origem_atleta2_partida_id: p.origem_atleta2_ref ? refParaId.get(p.origem_atleta2_ref) : null,
    proxima_partida_vencedor_id: p.proxima_vencedor_ref ? refParaId.get(p.proxima_vencedor_ref) : null,
    proxima_partida_perdedor_id: p.proxima_perdedor_ref ? refParaId.get(p.proxima_perdedor_ref) : null,
  }));

  for (const upd of atualizacoes) {
    const { id, ...campos } = upd;
    const { error } = await supabase.from("partidas").update(campos).eq("id", id);
    if (error) throw error;
  }

  return chave;
}

/** Busca a chave completa (com nomes dos atletas) de uma modalidade para renderizar. */
export async function buscarChaveCompleta(modalidadeId) {
  const { data: chave, error: errChave } = await supabase
    .from("chaves")
    .select("*")
    .eq("modalidade_id", modalidadeId)
    .maybeSingle();
  if (errChave) throw errChave;
  if (!chave) return null;

  const { data: partidas, error: errPartidas } = await supabase
    .from("vw_partidas_completas")
    .select("*")
    .eq("chave_id", chave.id)
    .order("fase", { ascending: true })
    .order("rodada", { ascending: true })
    .order("posicao", { ascending: true });
  if (errPartidas) throw errPartidas;

  return { chave, partidas };
}

/** Registra o placar de uma partida via RPC (propaga vencedor/perdedor no banco). */
export async function registrarResultado(partidaId, placar1, placar2, wo = false) {
  const { error } = await supabase.rpc("registrar_resultado_partida", {
    p_partida_id: partidaId,
    p_placar1: placar1,
    p_placar2: placar2,
    p_wo: wo,
  });
  if (error) throw error;
}

/** Apaga a chave (e as partidas, via ON DELETE CASCADE) para permitir gerar de novo. */
export async function apagarChave(chaveId) {
  const { error } = await supabase.from("chaves").delete().eq("id", chaveId);
  if (error) throw error;
}
