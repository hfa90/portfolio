"""Funções puras de limpeza/parse dos dados extraídos do Google Maps.

Nada aqui depende de rede ou de IA: apenas regras e expressões regulares
pensadas para o formato de endereço brasileiro que o Google Maps exibe, ex.:

    "Av. Paulista, 1578 - Bela Vista, São Paulo - SP, 01310-200"
    "R. dos Pinheiros, 500 - Loja 2 - Pinheiros, São Paulo - SP, 05422-000"
"""
from __future__ import annotations

import hashlib
import re
import unicodedata

UFS = {
    "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG",
    "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
}

ABREVIACOES = [
    (r"^R\.\s*", "Rua "),
    (r"^Av\.\s*", "Avenida "),
    (r"^Al\.\s*", "Alameda "),
    (r"^Tv\.\s*", "Travessa "),
    (r"^Trav\.\s*", "Travessa "),
    (r"^Pç\.\s*", "Praça "),
    (r"^Pça\.\s*", "Praça "),
    (r"^Pr\.\s*", "Praça "),
    (r"^Rod\.\s*", "Rodovia "),
    (r"^Estr\.\s*", "Estrada "),
    (r"^Lgo\.\s*", "Largo "),
    (r"^Lg\.\s*", "Largo "),
    (r"^Vl\.\s*", "Viela "),
    (r"^Jd\.\s*", "Jardim "),
]

PREFIXOS_LOGRADOURO = re.compile(
    r"^(rua|r\.|avenida|av\.|alameda|al\.|travessa|tv\.|trav\.|pra[cç]a|p[cç]a?\.|rodovia|rod\.|"
    r"estrada|estr\.|largo|lgo?\.|viela|vl\.|via|viaduto|vd\.|ladeira|passagem|servid[aã]o|beco|"
    r"quadra|qd\.|setor|sqs|shs|scs|cln|cls|shn|br-|sp-|rj-|mg-|pr-|sc-|rs-|go-|ba-)(?=[\s\d-]|$)",
    re.IGNORECASE,
)

RE_CEP = re.compile(r"\b(\d{5})-?(\d{3})\b")
RE_CIDADE_UF = re.compile(r"(?:^|,|\s-\s)\s*((?:(?!\s-\s)[^,])+?)\s*-\s*([A-Z]{2})\s*,?\s*$")


def normalizar(texto: str | None) -> str:
    """minúsculas, sem acento, espaços simples — para comparações."""
    if not texto:
        return ""
    texto = unicodedata.normalize("NFKD", texto)
    texto = "".join(c for c in texto if not unicodedata.combining(c))
    return re.sub(r"\s+", " ", texto).strip().lower()


def expandir_logradouro(rua: str) -> str:
    rua = rua.strip()
    for padrao, troca in ABREVIACOES:
        if re.match(padrao, rua, flags=re.IGNORECASE):
            return re.sub(padrao, troca, rua, count=1, flags=re.IGNORECASE)
    return rua


def parse_endereco(endereco: str | None) -> dict:
    """Quebra o endereço do Google Maps em rua/número/complemento/bairro/cidade/UF/CEP."""
    out = {"rua": "", "numero": "", "complemento": "", "bairro": "", "cidade": "", "uf": "", "cep": ""}
    if not endereco:
        return out

    resto = re.sub(r"^\s*Endere[cç]o:\s*", "", endereco.strip(), flags=re.IGNORECASE)
    resto = resto.replace("\u2013", "-").replace("\u2014", "-")
    resto = re.sub(r",?\s*Brasil\s*$", "", resto, flags=re.IGNORECASE)

    cep = RE_CEP.search(resto)
    if cep:
        out["cep"] = f"{cep.group(1)}-{cep.group(2)}"
        resto = (resto[: cep.start()] + resto[cep.end():]).strip(" ,")

    m = RE_CIDADE_UF.search(resto)
    if m and m.group(2) in UFS:
        cidade = m.group(1).strip()
        # "Rua X, 10 - Centro, Cidade - UF": o grupo pode ter capturado "Centro, Cidade"? não, [^,]
        # mas pode ter capturado "Bairro" quando não há cidade separada por vírgula.
        out["cidade"] = cidade
        out["uf"] = m.group(2)
        resto = resto[: m.start()].strip(" ,")

    if not resto:
        return out

    partes = [p.strip() for p in re.split(r"\s+-\s+", resto) if p.strip()]

    def separa_rua_numero(trecho: str):
        # "Av. Paulista, 1578"  |  "Rua X, s/n"  |  "Rod. SP-280, km 20"
        if "," in trecho:
            rua, num = trecho.rsplit(",", 1)
            num = num.strip()
            if re.match(r"^(\d+[A-Za-z]?|s/?n|S/N|km\s*[\d,.]+.*|\d+\s*-\s*\d+)$", num, re.IGNORECASE):
                return expandir_logradouro(rua), num
            return expandir_logradouro(trecho), ""
        m2 = re.match(r"^(.*?\D)\s+(\d+[A-Za-z]?)$", trecho)
        if m2 and PREFIXOS_LOGRADOURO.match(trecho):
            return expandir_logradouro(m2.group(1)), m2.group(2)
        return expandir_logradouro(trecho), ""

    parece_rua = lambda t: bool(PREFIXOS_LOGRADOURO.match(t)) or bool(re.search(r",\s*(\d+|s/?n)", t, re.I))

    if len(partes) == 1:
        unico = partes[0]
        if parece_rua(unico):
            out["rua"], out["numero"] = separa_rua_numero(unico)
        else:
            out["bairro"] = unico
    else:
        primeiro, ultimo = partes[0], partes[-1]
        if parece_rua(primeiro):
            out["rua"], out["numero"] = separa_rua_numero(primeiro)
            out["bairro"] = ultimo
            out["complemento"] = " - ".join(partes[1:-1])
        else:
            # ex.: "Shopping X - Loja 10 - Centro"
            out["complemento"] = " - ".join(partes[:-1])
            out["bairro"] = ultimo

    # se o "bairro" ficou com cara de número/complemento (ex. "Sala 3"), move
    if out["bairro"] and re.match(r"^(sala|loja|conj|cj|andar|bloco|apto|box|lj|sl)\b", out["bairro"], re.I):
        out["complemento"] = " - ".join(x for x in [out["complemento"], out["bairro"]] if x)
        out["bairro"] = ""
    return out


def limpar_telefone(tel: str | None) -> dict:
    """Retorna telefone formatado, E.164 e se parece celular (provável WhatsApp)."""
    out = {"telefone": "", "telefone_e164": "", "celular": 0}
    if not tel:
        return out
    tel = tel.strip()
    digitos = re.sub(r"\D", "", tel)
    if not digitos:
        return out

    # Números brasileiros
    if digitos.startswith("55") and len(digitos) in (12, 13):
        nacional = digitos[2:]
    elif digitos.startswith("0") and len(digitos) in (11, 12):
        nacional = digitos[1:]
    elif len(digitos) in (10, 11):
        nacional = digitos
    else:
        nacional = None

    if nacional and not digitos.startswith(("0800", "0300", "0500", "0900")):
        ddd, num = nacional[:2], nacional[2:]
        if len(num) == 9:
            out["telefone"] = f"({ddd}) {num[:5]}-{num[5:]}"
            out["celular"] = 1 if num.startswith("9") else 0
        else:
            out["telefone"] = f"({ddd}) {num[:4]}-{num[4:]}"
        out["telefone_e164"] = f"+55{nacional}"
        return out

    out["telefone"] = tel
    out["telefone_e164"] = ("+" + digitos) if tel.startswith("+") else digitos
    return out


def parse_numero_br(valor: str | None) -> float | None:
    """'4,7' -> 4.7 ; '1.234' -> 1234 ; '(1.234)' -> 1234"""
    if valor is None:
        return None
    s = re.sub(r"[^\d,.]", "", str(valor))
    if not s:
        return None
    if "," in s:
        s = s.replace(".", "").replace(",", ".")
    elif re.match(r"^\d{1,3}(\.\d{3})+$", s):
        s = s.replace(".", "")
    try:
        return float(s)
    except ValueError:
        return None


def parse_avaliacoes(valor: str | None) -> int | None:
    """Converte '1.234 avaliações', '(1.234)', '1,2 mil' em inteiro."""
    if not valor:
        return None
    v = normalizar(valor)
    m = re.search(r"([\d.,]+)\s*mil", v)
    if m:
        n = parse_numero_br(m.group(1))
        return int(round(n * 1000)) if n is not None else None
    m = re.search(r"[\d.,]+", v)
    if not m:
        return None
    s = m.group(0).replace(".", "").replace(",", "")
    return int(s) if s.isdigit() else None


RE_COORD_PLACE = re.compile(r"!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)")
RE_COORD_AT = re.compile(r"@(-?\d+\.\d+),(-?\d+\.\d+)")
RE_FEATURE_ID = re.compile(r"!1s(0x[0-9a-f]+:0x[0-9a-f]+)", re.IGNORECASE)
RE_PLACE_ID = re.compile(r"!19s(ChIJ[\w-]+)")


def coords_da_url(url: str | None) -> tuple[float | None, float | None]:
    if not url:
        return None, None
    m = RE_COORD_PLACE.search(url) or RE_COORD_AT.search(url)
    if not m:
        return None, None
    return float(m.group(1)), float(m.group(2))


def chave_do_lugar(url: str | None, nome: str = "", endereco: str = "") -> str:
    """Identificador estável para evitar duplicados entre buscas."""
    if url:
        m = RE_PLACE_ID.search(url)
        if m:
            return m.group(1)
        m = RE_FEATURE_ID.search(url)
        if m:
            return m.group(1).lower()
    base = normalizar(nome) + "|" + normalizar(endereco)
    return "h:" + hashlib.sha1(base.encode()).hexdigest()[:20]


def calcular_score(lead: dict) -> int:
    """Pontuação simples (0-100) de quão "contatável" é o lead."""
    s = 0
    if lead.get("telefone"):
        s += 35
    if lead.get("celular"):
        s += 15
    if lead.get("email"):
        s += 15
    if lead.get("site"):
        s += 10
    if lead.get("instagram") or lead.get("facebook") or lead.get("linkedin"):
        s += 10
    if (lead.get("avaliacao") or 0) >= 4:
        s += 10
    if (lead.get("num_avaliacoes") or 0) >= 20:
        s += 5
    if lead.get("situacao") and "fechado" in normalizar(lead.get("situacao")):
        s = max(0, s - 60)
    return min(100, s)


def local_corresponde(local_digitado: str, lead: dict) -> bool:
    """Para o filtro estrito: o 1º trecho do local digitado precisa aparecer no endereço."""
    if not local_digitado:
        return True
    alvo = normalizar(local_digitado.split(",")[0])
    alvo = re.sub(r"^(bairro|rua|r\.|avenida|av\.)\s+", "", alvo)
    if not alvo:
        return True
    campos = " | ".join(normalizar(lead.get(k, "")) for k in ("endereco", "bairro", "rua", "cidade"))
    return alvo in campos
