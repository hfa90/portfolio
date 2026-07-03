import { gerarEliminacaoDupla } from "./bracket.js";
import { gerarPixCopa } from "./pix.js";
import {
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  VALOR_INSCRICAO,
} from "./config.js";

const STORAGE_KEY = "copa-rd-saude-state-v2";
const ADMIN_KEY = "copa-rd-saude-admin";

export const modalidadesBase = [
  { id: "tenis-de-mesa", slug: "tenis-de-mesa", nome: "Tênis de Mesa", icone: "TM", valor_inscricao: VALOR_INSCRICAO, ativa: true },
  { id: "damas", slug: "damas", nome: "Damas", icone: "DM", valor_inscricao: VALOR_INSCRICAO, ativa: true },
  { id: "domino", slug: "domino", nome: "Dominó", icone: "DO", valor_inscricao: VALOR_INSCRICAO, ativa: true },
];

export function supabaseConfigurado() {
  return Boolean(
    SUPABASE_URL &&
      SUPABASE_ANON_KEY &&
      !SUPABASE_URL.includes("COLE_AQUI") &&
      !SUPABASE_ANON_KEY.includes("COLE_AQUI")
  );
}

export function modoDados() {
  return supabaseConfigurado() ? "supabase" : "local";
}

async function carregarSupabase() {
  if (!supabaseConfigurado()) return null;
  const modulo = await import("./supabaseClient.js");
  return modulo.supabase;
}

function uid(prefix = "id") {
  if (crypto?.randomUUID) return crypto.randomUUID();
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function agora() {
  return new Date().toISOString();
}

function estadoInicial() {
  return {
    modalidades: modalidadesBase,
    atletas: [],
    inscricoes: [],
    pagamentos: [],
    chaves: [],
    partidas: [],
    eventos: [],
  };
}

function lerEstado() {
  try {
    const bruto = localStorage.getItem(STORAGE_KEY);
    if (!bruto) return estadoInicial();
    const estado = JSON.parse(bruto);
    return { ...estadoInicial(), ...estado, modalidades: estado.modalidades?.length ? estado.modalidades : modalidadesBase };
  } catch {
    return estadoInicial();
  }
}

function salvarEstado(estado) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(estado));
}

function logarEvento(estado, tipo, texto) {
  estado.eventos.unshift({ id: uid("evt"), tipo, texto, criado_em: agora() });
  estado.eventos = estado.eventos.slice(0, 40);
}

function normalizarPagamento(pagamentos) {
  if (Array.isArray(pagamentos)) return pagamentos[0] || null;
  return pagamentos || null;
}

function enriquecerInscricaoLocal(estado, inscricao) {
  const atleta = estado.atletas.find((a) => a.id === inscricao.atleta_id);
  const modalidade = estado.modalidades.find((m) => m.id === inscricao.modalidade_id);
  const pagamento = estado.pagamentos.find((p) => p.inscricao_id === inscricao.id);
  return {
    ...inscricao,
    atletas: atleta,
    modalidades: modalidade,
    pagamentos: pagamento,
  };
}

function nomeAtletaLocal(estado, atletaId) {
  return estado.atletas.find((a) => a.id === atletaId)?.nome_completo || null;
}

function enriquecerPartidaLocal(estado, partida) {
  return {
    ...partida,
    atleta1_nome: nomeAtletaLocal(estado, partida.atleta1_id),
    atleta2_nome: nomeAtletaLocal(estado, partida.atleta2_id),
    vencedor_nome: nomeAtletaLocal(estado, partida.vencedor_id),
  };
}

export async function listarModalidades() {
  if (supabaseConfigurado()) {
    try {
      const supabase = await carregarSupabase();
      const { data, error } = await supabase.from("modalidades").select("*").eq("ativa", true).order("nome");
      if (!error && data?.length) return data;
    } catch (erro) {
      console.warn("Supabase indisponível, usando dados locais.", erro);
    }
  }
  return lerEstado().modalidades.filter((m) => m.ativa);
}

export async function criarInscricao({ modalidadeSlug, nome, email, whatsapp, loja, matricula }) {
  const modalidades = await listarModalidades();
  const modalidade = modalidades.find((m) => m.slug === modalidadeSlug || m.id === modalidadeSlug);
  if (!modalidade) throw new Error("Escolha uma modalidade válida.");

  if (supabaseConfigurado()) {
    const supabase = await carregarSupabase();
    let atletaId;
    const { data: atletaExistente } = await supabase.from("atletas").select("id").ilike("email", email).maybeSingle();
    if (atletaExistente) {
      atletaId = atletaExistente.id;
    } else {
      const { data: novoAtleta, error: errAtleta } = await supabase
        .from("atletas")
        .insert({ nome_completo: nome, email, whatsapp, loja_filial: loja || null, matricula: matricula || null })
        .select()
        .single();
      if (errAtleta) throw errAtleta;
      atletaId = novoAtleta.id;
    }

    const { data: inscricao, error: errInscricao } = await supabase
      .from("inscricoes")
      .insert({ atleta_id: atletaId, modalidade_id: modalidade.id })
      .select()
      .single();
    if (errInscricao) throw errInscricao;

    const txid = `RDCDAM${inscricao.id.replace(/-/g, "").slice(0, 19).toUpperCase()}`;
    const valor = Number(modalidade.valor_inscricao || VALOR_INSCRICAO);
    const { error: errPagamento } = await supabase.from("pagamentos").insert({
      inscricao_id: inscricao.id,
      valor,
      txid,
      pix_copia_e_cola: gerarPixCopa({ txid, valor }),
    });
    if (errPagamento) throw errPagamento;
    return inscricao.id;
  }

  const estado = lerEstado();
  const emailNormalizado = email.toLowerCase();
  let atleta = estado.atletas.find((a) => a.email.toLowerCase() === emailNormalizado);
  if (!atleta) {
    atleta = {
      id: uid("atl"),
      nome_completo: nome,
      email: emailNormalizado,
      whatsapp,
      loja_filial: loja || "",
      matricula: matricula || "",
      criado_em: agora(),
    };
    estado.atletas.push(atleta);
  }

  const existente = estado.inscricoes.find((i) => i.atleta_id === atleta.id && i.modalidade_id === modalidade.id);
  if (existente) return existente.id;

  const inscricao = {
    id: uid("ins"),
    atleta_id: atleta.id,
    modalidade_id: modalidade.id,
    status: "aguardando_pagamento",
    criado_em: agora(),
    atualizado_em: agora(),
  };
  const txid = `RDCDAM${inscricao.id.replace(/[^a-zA-Z0-9]/g, "").slice(0, 19).toUpperCase()}`;
  const valor = Number(modalidade.valor_inscricao || VALOR_INSCRICAO);
  const pagamento = {
    id: uid("pag"),
    inscricao_id: inscricao.id,
    valor,
    txid,
    pix_copia_e_cola: gerarPixCopa({ txid, valor }),
    comprovante_url: "",
    comprovante_nome: "",
    comprovante_preview: "",
    enviado_whatsapp: false,
    status: "pendente",
    criado_em: agora(),
  };
  estado.inscricoes.push(inscricao);
  estado.pagamentos.push(pagamento);
  logarEvento(estado, "inscricao", `${nome} se inscreveu em ${modalidade.nome}.`);
  salvarEstado(estado);
  return inscricao.id;
}

export async function buscarInscricao(inscricaoId) {
  if (!inscricaoId) return null;
  if (supabaseConfigurado()) {
    const supabase = await carregarSupabase();
    const { data, error } = await supabase
      .from("inscricoes")
      .select("*, atletas(*), modalidades(*), pagamentos(*)")
      .eq("id", inscricaoId)
      .maybeSingle();
    if (error || !data) return null;
    return { ...data, pagamentos: normalizarPagamento(data.pagamentos) };
  }
  const estado = lerEstado();
  const inscricao = estado.inscricoes.find((i) => i.id === inscricaoId);
  return inscricao ? enriquecerInscricaoLocal(estado, inscricao) : null;
}

export async function anexarComprovante(inscricaoId, arquivo, preview = "") {
  const inscricao = await buscarInscricao(inscricaoId);
  if (!inscricao) throw new Error("Inscrição não encontrada.");

  if (supabaseConfigurado()) {
    const supabase = await carregarSupabase();
    const caminho = `${inscricaoId}/${Date.now()}-${arquivo.name.replace(/[^a-zA-Z0-9.\-_]/g, "_")}`;
    const { error: errUpload } = await supabase.storage.from("comprovantes").upload(caminho, arquivo, { upsert: true });
    if (errUpload) throw errUpload;
    const { error } = await supabase
      .from("pagamentos")
      .update({ comprovante_url: caminho, comprovante_enviado_em: agora(), status: "em_analise" })
      .eq("id", inscricao.pagamentos.id);
    if (error) throw error;
    return caminho;
  }

  const estado = lerEstado();
  const pagamento = estado.pagamentos.find((p) => p.inscricao_id === inscricaoId);
  const item = estado.inscricoes.find((i) => i.id === inscricaoId);
  pagamento.comprovante_url = `local/${inscricaoId}/${arquivo.name}`;
  pagamento.comprovante_nome = arquivo.name;
  pagamento.comprovante_preview = preview;
  pagamento.comprovante_enviado_em = agora();
  pagamento.status = "em_analise";
  item.status = "em_analise";
  item.atualizado_em = agora();
  logarEvento(estado, "pagamento", `Comprovante enviado por ${inscricao.atletas.nome_completo}.`);
  salvarEstado(estado);
  return pagamento.comprovante_url;
}

export async function marcarWhatsapp(inscricaoId) {
  if (supabaseConfigurado()) {
    const inscricao = await buscarInscricao(inscricaoId);
    const supabase = await carregarSupabase();
    await supabase.from("pagamentos").update({ enviado_whatsapp: true }).eq("id", inscricao.pagamentos.id);
    return;
  }
  const estado = lerEstado();
  const pagamento = estado.pagamentos.find((p) => p.inscricao_id === inscricaoId);
  if (pagamento) pagamento.enviado_whatsapp = true;
  salvarEstado(estado);
}

export async function listarInscricoes({ modalidadeId = "", status = "" } = {}) {
  if (supabaseConfigurado()) {
    const supabase = await carregarSupabase();
    let query = supabase
      .from("inscricoes")
      .select("*, atletas(*), modalidades(*), pagamentos(*)")
      .order("criado_em", { ascending: false });
    if (modalidadeId) query = query.eq("modalidade_id", modalidadeId);
    if (status) query = query.eq("status", status);
    const { data, error } = await query;
    if (error) throw error;
    return (data || []).map((i) => ({ ...i, pagamentos: normalizarPagamento(i.pagamentos) }));
  }
  const estado = lerEstado();
  return estado.inscricoes
    .filter((i) => (!modalidadeId || i.modalidade_id === modalidadeId) && (!status || i.status === status))
    .sort((a, b) => b.criado_em.localeCompare(a.criado_em))
    .map((i) => enriquecerInscricaoLocal(estado, i));
}

export async function revisarPagamento(pagamentoId, novoStatus, motivo = "") {
  if (supabaseConfigurado()) {
    const supabase = await carregarSupabase();
    const { data: sessao } = await supabase.auth.getSession();
    const { error } = await supabase
      .from("pagamentos")
      .update({ status: novoStatus, motivo_rejeicao: motivo || null, revisado_por: sessao.session?.user?.email || "admin", revisado_em: agora() })
      .eq("id", pagamentoId);
    if (error) throw error;
    return;
  }
  const estado = lerEstado();
  const pagamento = estado.pagamentos.find((p) => p.id === pagamentoId);
  if (!pagamento) throw new Error("Pagamento não encontrado.");
  const inscricao = estado.inscricoes.find((i) => i.id === pagamento.inscricao_id);
  pagamento.status = novoStatus;
  pagamento.motivo_rejeicao = motivo;
  pagamento.revisado_em = agora();
  if (inscricao) {
    inscricao.status = novoStatus === "aprovado" ? "confirmada" : novoStatus === "rejeitado" ? "rejeitada" : "em_analise";
    inscricao.atualizado_em = agora();
  }
  logarEvento(estado, "admin", `Pagamento ${novoStatus === "aprovado" ? "aprovado" : "rejeitado"}.`);
  salvarEstado(estado);
}

function instalarPartidas(estado, chave, partidasAlgoritmo) {
  const partidas = partidasAlgoritmo.map((p) => ({
    id: uid("par"),
    ref: p.ref,
    chave_id: chave.id,
    fase: p.fase,
    rodada: p.rodada,
    posicao: p.posicao,
    atleta1_id: p.atleta1_participante_id,
    atleta2_id: p.atleta2_participante_id,
    origem_atleta1_ref: p.origem_atleta1_ref,
    origem_atleta2_ref: p.origem_atleta2_ref,
    placar1: null,
    placar2: null,
    vencedor_id: p.vencedor_participante_id,
    perdedor_id: p.perdedor_participante_id,
    status: p.status,
    proxima_vencedor_ref: p.proxima_vencedor_ref,
    proxima_perdedor_ref: p.proxima_perdedor_ref,
    avanco_automatico: p.avanco_automatico,
    criado_em: agora(),
    atualizado_em: agora(),
  }));
  const porRef = new Map(partidas.map((p) => [p.ref, p]));
  partidas.forEach((p) => {
    p.origem_atleta1_partida_id = porRef.get(p.origem_atleta1_ref)?.id || null;
    p.origem_atleta2_partida_id = porRef.get(p.origem_atleta2_ref)?.id || null;
    p.proxima_partida_vencedor_id = porRef.get(p.proxima_vencedor_ref)?.id || null;
    p.proxima_partida_perdedor_id = porRef.get(p.proxima_perdedor_ref)?.id || null;
  });
  estado.partidas.push(...partidas);
  resolverPendencias(estado, chave.id);
}

function preencherDestino(destino, origemId, atletaId) {
  if (!destino || !atletaId) return;
  if (destino.origem_atleta1_partida_id === origemId && !destino.atleta1_id) {
    destino.atleta1_id = atletaId;
  } else if (destino.origem_atleta2_partida_id === origemId && !destino.atleta2_id) {
    destino.atleta2_id = atletaId;
  } else if (!destino.atleta1_id) {
    destino.atleta1_id = atletaId;
  } else if (!destino.atleta2_id) {
    destino.atleta2_id = atletaId;
  }
}

function resolverPendencias(estado, chaveId) {
  const partidas = estado.partidas.filter((p) => p.chave_id === chaveId);
  let mudou = true;
  let guarda = 0;
  while (mudou && guarda < 100) {
    mudou = false;
    guarda += 1;
    for (const p of partidas) {
      if (p.status === "finalizada" || p.status === "wo") {
        const proxV = partidas.find((x) => x.id === p.proxima_partida_vencedor_id);
        const antesV = proxV ? `${proxV.atleta1_id || ""}|${proxV.atleta2_id || ""}` : "";
        preencherDestino(proxV, p.id, p.vencedor_id);
        if (proxV && antesV !== `${proxV.atleta1_id || ""}|${proxV.atleta2_id || ""}`) mudou = true;

        const proxP = partidas.find((x) => x.id === p.proxima_partida_perdedor_id);
        const antesP = proxP ? `${proxP.atleta1_id || ""}|${proxP.atleta2_id || ""}` : "";
        preencherDestino(proxP, p.id, p.perdedor_id);
        if (proxP && antesP !== `${proxP.atleta1_id || ""}|${proxP.atleta2_id || ""}`) mudou = true;
      }

      if (p.status === "aguardando" && p.atleta1_id && p.atleta2_id) {
        p.status = "pronta";
        mudou = true;
      }

      if (p.status === "aguardando" && p.avanco_automatico && (p.atleta1_id || p.atleta2_id)) {
        const vencedor = p.atleta1_id || p.atleta2_id;
        p.vencedor_id = vencedor;
        p.perdedor_id = null;
        p.status = "finalizada";
        mudou = true;
      }
    }
  }
}

export async function gerarChave(modalidadeId) {
  if (supabaseConfigurado()) {
    const service = await import("./chaveamentoService.js");
    return service.gerarChaveParaModalidade(modalidadeId);
  }
  const estado = lerEstado();
  if (estado.chaves.some((c) => c.modalidade_id === modalidadeId)) throw new Error("Já existe uma chave para esta modalidade.");
  const confirmadas = estado.inscricoes.filter((i) => i.modalidade_id === modalidadeId && i.status === "confirmada");
  if (confirmadas.length < 2) throw new Error("Aprove pelo menos 2 inscrições antes de sortear.");

  const sorteados = [...confirmadas].sort(() => Math.random() - 0.5).map((i) => ({ id: i.atleta_id }));
  const estrutura = gerarEliminacaoDupla(sorteados);
  const chave = {
    id: uid("cha"),
    modalidade_id: modalidadeId,
    tamanho: estrutura.tamanho,
    status: "em_andamento",
    gerada_em: agora(),
    campeao_id: null,
    vice_id: null,
  };
  estado.chaves.push(chave);
  instalarPartidas(estado, chave, estrutura.partidas);
  logarEvento(estado, "chave", `Chave sorteada com ${confirmadas.length} atletas.`);
  salvarEstado(estado);
  return chave;
}

export async function buscarChaveCompleta(modalidadeId) {
  if (supabaseConfigurado()) {
    const service = await import("./chaveamentoService.js");
    return service.buscarChaveCompleta(modalidadeId);
  }
  const estado = lerEstado();
  const chave = estado.chaves.find((c) => c.modalidade_id === modalidadeId);
  if (!chave) return null;
  const partidas = estado.partidas
    .filter((p) => p.chave_id === chave.id)
    .sort((a, b) => `${a.fase}${a.rodada.toString().padStart(3, "0")}${a.posicao.toString().padStart(3, "0")}`.localeCompare(`${b.fase}${b.rodada.toString().padStart(3, "0")}${b.posicao.toString().padStart(3, "0")}`))
    .map((p) => enriquecerPartidaLocal(estado, p));
  return { chave, partidas };
}

export async function registrarResultado(partidaId, placar1, placar2) {
  if (placar1 === placar2) throw new Error("O placar não pode terminar empatado.");
  if (supabaseConfigurado()) {
    const service = await import("./chaveamentoService.js");
    return service.registrarResultado(partidaId, placar1, placar2, false);
  }
  const estado = lerEstado();
  const partida = estado.partidas.find((p) => p.id === partidaId);
  if (!partida) throw new Error("Partida não encontrada.");
  if (!partida.atleta1_id || !partida.atleta2_id) throw new Error("Partida ainda não está pronta.");
  partida.placar1 = placar1;
  partida.placar2 = placar2;
  partida.vencedor_id = placar1 > placar2 ? partida.atleta1_id : partida.atleta2_id;
  partida.perdedor_id = placar1 > placar2 ? partida.atleta2_id : partida.atleta1_id;
  partida.status = "finalizada";
  partida.atualizado_em = agora();

  const chave = estado.chaves.find((c) => c.id === partida.chave_id);
  if (partida.fase === "GF" && partida.rodada === 1) {
    if (partida.vencedor_id === partida.atleta1_id) {
      chave.status = "finalizada";
      chave.finalizada_em = agora();
      chave.campeao_id = partida.vencedor_id;
      chave.vice_id = partida.perdedor_id;
    } else {
      const reset = estado.partidas.find((p) => p.chave_id === partida.chave_id && p.fase === "GF" && p.rodada === 2);
      if (reset) {
        reset.atleta1_id = partida.atleta1_id;
        reset.atleta2_id = partida.atleta2_id;
        reset.status = "pronta";
      }
    }
  } else if (partida.fase === "GF" && partida.rodada === 2) {
    chave.status = "finalizada";
    chave.finalizada_em = agora();
    chave.campeao_id = partida.vencedor_id;
    chave.vice_id = partida.perdedor_id;
  } else {
    resolverPendencias(estado, partida.chave_id);
  }
  logarEvento(estado, "resultado", "Resultado lançado no chaveamento.");
  salvarEstado(estado);
}

export async function apagarChave(chaveId) {
  if (supabaseConfigurado()) {
    const service = await import("./chaveamentoService.js");
    return service.apagarChave(chaveId);
  }
  const estado = lerEstado();
  estado.chaves = estado.chaves.filter((c) => c.id !== chaveId);
  estado.partidas = estado.partidas.filter((p) => p.chave_id !== chaveId);
  logarEvento(estado, "chave", "Chave apagada.");
  salvarEstado(estado);
}

export async function entrarAdmin(email, senha) {
  if (supabaseConfigurado()) {
    const supabase = await carregarSupabase();
    const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
    if (error) throw error;
    return;
  }
  if (!email || senha.length < 3) throw new Error("Informe e-mail e senha.");
  localStorage.setItem(ADMIN_KEY, JSON.stringify({ email, entrou_em: agora() }));
}

export async function adminLogado() {
  if (supabaseConfigurado()) {
    const supabase = await carregarSupabase();
    const { data: sessao } = await supabase.auth.getSession();
    if (!sessao.session) return false;
    const { data: admin } = await supabase.from("auth_admins").select("user_id").eq("user_id", sessao.session.user.id).maybeSingle();
    return Boolean(admin);
  }
  return Boolean(localStorage.getItem(ADMIN_KEY));
}

export async function sairAdmin() {
  if (supabaseConfigurado()) {
    const supabase = await carregarSupabase();
    await supabase.auth.signOut();
  }
  localStorage.removeItem(ADMIN_KEY);
}

export function eventosRecentes() {
  return lerEstado().eventos || [];
}

export function resetarDadosLocais() {
  salvarEstado(estadoInicial());
}
