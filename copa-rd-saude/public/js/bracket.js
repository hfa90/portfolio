// ============================================================================
// bracket.js — Geração de chaveamento em ELIMINAÇÃO DUPLA
// Módulo puro (sem dependências de rede/DOM) — pode ser testado com:
//   node public/js/bracket.js
// ============================================================================

/** Próxima potência de 2 >= n (mínimo 2). */
export function proximaPotenciaDeDois(n) {
  if (n <= 2) return 2;
  return Math.pow(2, Math.ceil(Math.log2(n)));
}

/**
 * Gera a ordem "justa" de seeds para um bracket de tamanho `size`
 * (algoritmo recursivo padrão: 1ºx último, evita que os melhores
 * colocados se enfrentem cedo). Ex.: size=8 -> [1,8,4,5,2,7,3,6]
 */
export function ordemDeSeeds(size) {
  let seeds = [1, 2];
  while (seeds.length < size) {
    const novoTamanho = seeds.length * 2;
    const novo = [];
    for (const s of seeds) {
      novo.push(s);
      novo.push(novoTamanho + 1 - s);
    }
    seeds = novo;
  }
  return seeds;
}

// Um "slot" representa uma posição que ainda vai receber um atleta.
// status: 'KNOWN' (atleta já definido) | 'BYE' (posição vazia, ninguém virá)
//       | 'PENDING' (depende do resultado de uma partida futura)
// origemTipo: 'V' (esse slot é o VENCEDOR da partida de origem) ou
//             'L' (esse slot é o PERDEDOR da partida de origem) — é o que
// permite ligar corretamente proxima_vencedor_ref / proxima_perdedor_ref,
// já que na loser bracket AMBOS os lados de uma partida podem ser "perdedor
// de uma partida da WB", então não dá pra inferir isso pela posição (a1/a2).
function slotConhecido(participanteId, origemRef = null, origemTipo = null) {
  return { status: "KNOWN", participanteId, origemRef, origemTipo };
}
function slotBye(origemRef = null, origemTipo = null) {
  return { status: "BYE", participanteId: null, origemRef, origemTipo };
}
function slotPendente(origemRef, origemTipo) {
  return { status: "PENDING", participanteId: null, origemRef, origemTipo };
}

let _contador = 0;
function novoRef(prefixo) {
  _contador += 1;
  return `${prefixo}-${_contador}`;
}

/**
 * Cria as partidas de uma rodada a partir de uma lista de pares de slots.
 * Retorna { partidas, slotsSaida } onde slotsSaida é a lista de slots
 * (um por partida) representando o VENCEDOR de cada partida — usada como
 * entrada da próxima rodada. Quando aplicável, também devolve os slots de
 * PERDEDOR (para alimentar a repescagem / loser bracket).
 */
function construirRodada(pares, fase, rodada, { gerarSlotPerdedor = false } = {}) {
  const partidas = [];
  const slotsVencedor = [];
  const slotsPerdedor = [];

  pares.forEach(([slotA, slotB], posicao) => {
    const ref = novoRef(`${fase}-${rodada}-${posicao}`);
    const partida = {
      ref,
      fase,
      rodada,
      posicao,
      atleta1_participante_id: slotA.participanteId,
      atleta2_participante_id: slotB.participanteId,
      origem_atleta1_ref: slotA.origemRef,
      origem_atleta1_tipo: slotA.origemTipo, // 'V' ou 'L' — só usado internamente p/ encadear
      origem_atleta2_ref: slotB.origemRef,
      origem_atleta2_tipo: slotB.origemTipo,
      // avanco automático: se, quando o slot pendente for resolvido, o outro
      // lado permanecer vazio (BYE), a partida deve ser fechada sozinha
      avanco_automatico: slotA.status === "BYE" || slotB.status === "BYE",
      status: "aguardando",
      vencedor_participante_id: null,
      perdedor_participante_id: null,
      proxima_vencedor_ref: null,
      proxima_perdedor_ref: null,
    };

    const ambosConhecidos = slotA.status === "KNOWN" && slotB.status === "KNOWN";
    const umBye = slotA.status === "BYE" || slotB.status === "BYE";
    const algumPendente = slotA.status === "PENDING" || slotB.status === "PENDING";

    if (umBye && !algumPendente) {
      // Bye definitivo já no momento da geração (round 1 tipicamente)
      const vencedor = slotA.status === "KNOWN" ? slotA.participanteId : slotB.participanteId;
      partida.vencedor_participante_id = vencedor;
      partida.status = vencedor ? "finalizada" : "aguardando"; // ambos BYE é um caso degenerado raríssimo
    } else if (ambosConhecidos) {
      partida.status = "pronta";
    } else {
      partida.status = "aguardando"; // depende de partida(s) anterior(es)
    }

    partidas.push(partida);

    slotsVencedor.push(
      partida.status === "finalizada"
        ? slotConhecido(partida.vencedor_participante_id, ref, "V")
        : slotPendente(ref, "V")
    );

    if (gerarSlotPerdedor) {
      // Só existe perdedor "de verdade" quando a partida for realmente jogada.
      // Se já nasceu finalizada por bye, não há perdedor -> vira BYE na LB.
      slotsPerdedor.push(partida.status === "finalizada" ? slotBye(ref, "L") : slotPendente(ref, "L"));
    }
  });

  return { partidas, slotsVencedor, slotsPerdedor };
}

/**
 * Gera a estrutura completa de eliminação dupla.
 * @param {Array<{id: string}>} participantes - já na ordem desejada (ex.: embaralhados)
 * @returns {{ tamanho: number, partidas: Array }} partidas com refs locais (ainda sem UUID do banco)
 */
export function gerarEliminacaoDupla(participantes) {
  _contador = 0;
  const n = participantes.length;
  if (n < 2) throw new Error("É preciso de pelo menos 2 atletas confirmados para gerar a chave.");

  const size = proximaPotenciaDeDois(n);
  const seeds = ordemDeSeeds(size);

  // slot inicial por posição do bracket, seguindo a ordem de seeds "justa"
  const slotsIniciais = seeds.map((seed) => {
    const participante = participantes[seed - 1]; // seed 1 = melhor colocado / 1º inscrito
    return participante ? slotConhecido(participante.id, null) : slotBye(null);
  });

  const todasPartidas = [];
  const rodadasWB = Math.log2(size);

  // ---------------- WINNER BRACKET ----------------
  let slotsAtuais = slotsIniciais;
  const perdedoresPorRodadaWB = []; // [ [slotsPerdedor rodada1], [rodada2], ... ]

  for (let r = 1; r <= rodadasWB; r++) {
    const pares = [];
    for (let i = 0; i < slotsAtuais.length; i += 2) pares.push([slotsAtuais[i], slotsAtuais[i + 1]]);

    const { partidas, slotsVencedor, slotsPerdedor } = construirRodada(pares, "WB", r, {
      gerarSlotPerdedor: true,
    });

    todasPartidas.push(...partidas);
    perdedoresPorRodadaWB.push(slotsPerdedor);
    slotsAtuais = slotsVencedor;
  }
  const campeaoWBSlotRef = slotsAtuais[0]; // vencedor da final da WB (rodada = rodadasWB)

  // ---------------- LOSER BRACKET ----------------
  // Percorre as rodadas da WB "dropando" os perdedores na LB, alternando
  // rodada de "drop" (novo perdedor entra) com rodada de "consolidação"
  // (sobreviventes da LB se enfrentam), conforme o padrão clássico de
  // eliminação dupla.
  let sobreviventesLB = null; // slots vencedores da última rodada da LB
  let rodadaLB = 0;

  for (let j = 1; j <= rodadasWB; j++) {
    const perdedoresWBRodadaJ = perdedoresPorRodadaWB[j - 1];

    if (j === 1) {
      // Rodada 1 da LB: perdedores da WB rodada 1 se enfrentam entre si
      rodadaLB += 1;
      const pares = [];
      for (let i = 0; i < perdedoresWBRodadaJ.length; i += 2) {
        pares.push([perdedoresWBRodadaJ[i], perdedoresWBRodadaJ[i + 1]]);
      }
      const { partidas, slotsVencedor } = construirRodada(pares, "LB", rodadaLB, {
        gerarSlotPerdedor: false,
      });
      todasPartidas.push(...partidas);
      sobreviventesLB = slotsVencedor;
      continue;
    }

    // Rodada de "drop": sobreviventes da LB enfrentam os novos perdedores da WB
    rodadaLB += 1;
    const paresDrop = [];
    for (let i = 0; i < sobreviventesLB.length; i++) {
      paresDrop.push([sobreviventesLB[i], perdedoresWBRodadaJ[i]]);
    }
    const drop = construirRodada(paresDrop, "LB", rodadaLB, { gerarSlotPerdedor: false });
    todasPartidas.push(...drop.partidas);
    sobreviventesLB = drop.slotsVencedor;

    const éÚltimaRodadaWB = j === rodadasWB;
    if (!éÚltimaRodadaWB && sobreviventesLB.length > 1) {
      // Rodada de "consolidação": sobreviventes da LB se enfrentam entre si
      rodadaLB += 1;
      const paresConsolidacao = [];
      for (let i = 0; i < sobreviventesLB.length; i += 2) {
        paresConsolidacao.push([sobreviventesLB[i], sobreviventesLB[i + 1]]);
      }
      const consolidacao = construirRodada(paresConsolidacao, "LB", rodadaLB, {
        gerarSlotPerdedor: false,
      });
      todasPartidas.push(...consolidacao.partidas);
      sobreviventesLB = consolidacao.slotsVencedor;
    }
  }
  const campeaoLBSlotRef = sobreviventesLB[0]; // vencedor da final da loser bracket

  // ---------------- LIGAÇÕES: WB -> próxima partida do vencedor/perdedor ----------------
  // Preenche proxima_vencedor_ref / proxima_perdedor_ref em cada partida com
  // base nos origem_*_ref que cada slot carregou.
  const porRef = new Map(todasPartidas.map((p) => [p.ref, p]));
  function ligar(origemRef, origemTipo, destinoRef) {
    if (!origemRef || !porRef.has(origemRef)) return;
    const origemPartida = porRef.get(origemRef);
    if (origemTipo === "V") origemPartida.proxima_vencedor_ref = destinoRef;
    else if (origemTipo === "L") origemPartida.proxima_perdedor_ref = destinoRef;
  }
  for (const partida of todasPartidas) {
    ligar(partida.origem_atleta1_ref, partida.origem_atleta1_tipo, partida.ref);
    ligar(partida.origem_atleta2_ref, partida.origem_atleta2_tipo, partida.ref);
  }

  // ---------------- GRANDE FINAL ----------------
  // atleta1 = sempre o lado que veio da Winner Bracket (0 derrotas)
  // atleta2 = sempre o lado que veio da Loser Bracket (1 derrota)
  const gf1 = {
    ref: novoRef("GF-1-0"),
    fase: "GF",
    rodada: 1,
    posicao: 0,
    atleta1_participante_id: campeaoWBSlotRef.status === "KNOWN" ? campeaoWBSlotRef.participanteId : null,
    atleta2_participante_id: campeaoLBSlotRef.status === "KNOWN" ? campeaoLBSlotRef.participanteId : null,
    origem_atleta1_ref: campeaoWBSlotRef.origemRef,
    origem_atleta2_ref: campeaoLBSlotRef.origemRef,
    avanco_automatico: false,
    status: "aguardando",
    vencedor_participante_id: null,
    perdedor_participante_id: null,
    proxima_vencedor_ref: null,
    proxima_perdedor_ref: null,
  };
  const gf2Reset = {
    ref: novoRef("GF-2-0"),
    fase: "GF",
    rodada: 2, // só é jogada se o lado da LB vencer a GF1 ("reset de chave")
    posicao: 0,
    atleta1_participante_id: null,
    atleta2_participante_id: null,
    origem_atleta1_ref: gf1.ref,
    origem_atleta2_ref: gf1.ref,
    avanco_automatico: false,
    status: "aguardando",
    vencedor_participante_id: null,
    perdedor_participante_id: null,
    proxima_vencedor_ref: null,
    proxima_perdedor_ref: null,
  };
  ligar(campeaoWBSlotRef.origemRef, campeaoWBSlotRef.origemTipo, gf1.ref);
  ligar(campeaoLBSlotRef.origemRef, campeaoLBSlotRef.origemTipo, gf1.ref);
  gf1.proxima_vencedor_ref = null; // tratado dinamicamente (ver registrar_resultado_partida no SQL)
  todasPartidas.push(gf1, gf2Reset);

  return { tamanho: size, partidas: todasPartidas };
}

// Execução direta via `node public/js/bracket.js` -> roda um teste rápido
if (typeof process !== "undefined" && process.argv[1] && process.argv[1].endsWith("bracket.js")) {
  const nomes = ["Ana", "Bruno", "Carla", "Diego", "Elis"]; // 5 participantes -> testa bye
  const participantes = nomes.map((nome, i) => ({ id: `p${i + 1}`, nome }));
  const { tamanho, partidas } = gerarEliminacaoDupla(participantes);
  console.log(`Tamanho do bracket: ${tamanho}`);
  console.table(
    partidas.map((p) => ({
      ref: p.ref,
      fase: p.fase,
      rodada: p.rodada,
      pos: p.posicao,
      a1: p.atleta1_participante_id,
      a2: p.atleta2_participante_id,
      status: p.status,
      vencedor: p.vencedor_participante_id,
      proxVenc: p.proxima_vencedor_ref,
      proxPerd: p.proxima_perdedor_ref,
    }))
  );
}
