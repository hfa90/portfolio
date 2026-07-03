// ============================================================================
// pix.js — Gera o payload "Pix Copia e Cola" (padrão BR Code / EMV do Bacen)
// Sem dependências externas. Testável com: node public/js/pix.js
// ============================================================================

/** Formata um campo EMV: ID (2 dígitos) + tamanho (2 dígitos) + valor */
function campo(id, valor) {
  const tamanho = String(valor.length).padStart(2, "0");
  return `${id}${tamanho}${valor}`;
}

/** Remove acentos e caracteres fora do padrão aceito pelo Pix (ASCII) */
function normalizar(texto) {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9 ]/g, "")
    .trim();
}

/** CRC16/CCITT-FFFF — checksum final exigido no payload Pix */
function crc16(payload) {
  let crc = 0xffff;
  const polinomio = 0x1021;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = (crc & 0x8000) !== 0 ? ((crc << 1) ^ polinomio) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

/**
 * Monta o payload Pix "copia e cola" (estático, com valor fixo).
 * @param {Object} opts
 * @param {string} opts.chave        - chave Pix (e-mail, telefone, CPF/CNPJ ou aleatória)
 * @param {string} opts.nomeRecebedor - até 25 caracteres, sem acento
 * @param {string} opts.cidade        - até 15 caracteres, sem acento
 * @param {number} opts.valor         - valor em reais, ex: 10.00
 * @param {string} opts.txid          - identificador da cobrança (até 25 caracteres alfanuméricos)
 * @param {string} [opts.descricao]   - mensagem curta opcional
 */
export function gerarPayloadPix({ chave, nomeRecebedor, cidade, valor, txid, descricao }) {
  const nome = normalizar(nomeRecebedor).slice(0, 25) || "COPA RD SAUDE";
  const cid = normalizar(cidade).slice(0, 15) || "MANAUS";
  const tid = (txid || "***").replace(/[^A-Za-z0-9]/g, "").slice(0, 25) || "***";

  const merchantAccountInfo = [
    campo("00", "br.gov.bcb.pix"),
    campo("01", chave),
    ...(descricao ? [campo("02", normalizar(descricao).slice(0, 40))] : []),
  ].join("");

  const additionalData = campo("05", tid);

  const partes = [
    campo("00", "01"), // Payload Format Indicator
    campo("01", "12"), // Point of Initiation Method: 12 = estático reutilizável com valor
    campo("26", merchantAccountInfo), // Merchant Account Information - Pix
    campo("52", "0000"), // Merchant Category Code
    campo("53", "986"), // Transaction Currency: BRL
    campo("54", valor.toFixed(2)), // Transaction Amount
    campo("58", "BR"), // Country Code
    campo("59", nome), // Merchant Name
    campo("60", cid), // Merchant City
    campo("62", additionalData), // Additional Data Field (txid)
  ];

  const payloadSemCrc = partes.join("") + "6304"; // 63 = CRC16, "04" = tamanho fixo do valor do CRC
  const crc = crc16(payloadSemCrc);
  return payloadSemCrc + crc;
}

/** Gera o payload já com os dados fixos da Copa RD Saúde CD-AM */
export function gerarPixCopa({ txid, valor = 10.0 }) {
  return gerarPayloadPix({
    chave: "haydenfernandes.ti@gmail.com",
    nomeRecebedor: "Hayden Fernandes",
    cidade: "Manaus",
    valor,
    txid,
    descricao: "Copa RD Saude CD-AM",
  });
}

if (typeof process !== "undefined" && process.argv[1] && process.argv[1].endsWith("pix.js")) {
  const payload = gerarPixCopa({ txid: "RDCDAM12345TESTE" });
  console.log(payload);
  console.log("Tamanho:", payload.length);
}
