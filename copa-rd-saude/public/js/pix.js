import { PIX_CHAVE, PIX_CIDADE, PIX_NOME_RECEBEDOR } from "./config.js";

function campo(id, valor) {
  const tamanho = String(valor.length).padStart(2, "0");
  return `${id}${tamanho}${valor}`;
}

function normalizar(texto) {
  return String(texto || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9 ]/g, "")
    .trim();
}

function crc16(payload) {
  let crc = 0xffff;
  const polinomio = 0x1021;
  for (let i = 0; i < payload.length; i += 1) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j += 1) {
      crc = (crc & 0x8000) !== 0 ? ((crc << 1) ^ polinomio) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

export function gerarPayloadPix({ chave, nomeRecebedor, cidade, valor, txid, descricao }) {
  const nome = normalizar(nomeRecebedor).slice(0, 25) || "COPA RD SAUDE";
  const cid = normalizar(cidade).slice(0, 15) || "MANAUS";
  const tid = (txid || "***").replace(/[^A-Za-z0-9]/g, "").slice(0, 25) || "***";

  const merchantAccountInfo = [
    campo("00", "br.gov.bcb.pix"),
    campo("01", chave),
    ...(descricao ? [campo("02", normalizar(descricao).slice(0, 40))] : []),
  ].join("");

  const partes = [
    campo("00", "01"),
    campo("01", "12"),
    campo("26", merchantAccountInfo),
    campo("52", "0000"),
    campo("53", "986"),
    campo("54", Number(valor).toFixed(2)),
    campo("58", "BR"),
    campo("59", nome),
    campo("60", cid),
    campo("62", campo("05", tid)),
  ];

  const payloadSemCrc = `${partes.join("")}6304`;
  return payloadSemCrc + crc16(payloadSemCrc);
}

export function gerarPixCopa({ txid, valor = 10.0 }) {
  return gerarPayloadPix({
    chave: PIX_CHAVE,
    nomeRecebedor: PIX_NOME_RECEBEDOR,
    cidade: PIX_CIDADE,
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
