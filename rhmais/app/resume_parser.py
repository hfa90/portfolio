"""Leitura de currículos (PDF, DOCX, TXT) e pré-preenchimento do cadastro."""
from __future__ import annotations

import re
from pathlib import Path

from .textutils import detectar_senioridade, extrair_skills, separar_cidade_uf


def ler_texto(caminho: str) -> str:
    p = Path(caminho)
    ext = p.suffix.lower()
    if ext == ".pdf":
        from pypdf import PdfReader
        return "\n".join((pg.extract_text() or "") for pg in PdfReader(str(p)).pages)
    if ext == ".docx":
        import docx
        d = docx.Document(str(p))
        partes = [par.text for par in d.paragraphs]
        for tabela in d.tables:
            for linha in tabela.rows:
                partes.append(" ".join(cel.text for cel in linha.cells))
        return "\n".join(partes)
    return p.read_text(encoding="utf-8", errors="ignore")


def analisar(texto: str) -> dict:
    linhas = [l.strip() for l in texto.splitlines() if l.strip()]
    dados: dict = {}

    m = re.search(r"[\w.+-]+@[\w-]+\.[\w.-]+", texto)
    if m:
        dados["email"] = m.group(0)
    m = re.search(r"(\(?\d{2}\)?\s?9?\d{4}[-\s]?\d{4})", texto)
    if m:
        dados["telefone"] = m.group(1)

    # Nome: primeira linha "curta" só com letras
    for l in linhas[:6]:
        if 2 <= len(l.split()) <= 6 and re.fullmatch(r"[A-Za-zÀ-ÿ' .]+", l) and "@" not in l:
            dados["nome"] = l.title()
            break

    # Cargo: linha logo após o nome, ou campo "Objetivo"
    m = re.search(r"(?:objetivo|cargo pretendido|cargo desejado)\s*[:\-]?\s*(.+)", texto, re.I)
    if m:
        dados["cargo_desejado"] = m.group(1).strip()[:80]
    elif len(linhas) > 1 and len(linhas[1]) < 60 and "@" not in linhas[1]:
        dados["cargo_desejado"] = linhas[1]

    m = re.search(r"([A-Za-zÀ-ÿ ]{3,40})\s*[-/,]\s*([A-Z]{2})\b", texto)
    if m:
        cidade, uf = separar_cidade_uf(f"{m.group(1).strip()} - {m.group(2)}")
        if uf:
            dados["cidade"], dados["uf"] = cidade, uf

    dados["skills"] = ", ".join(extrair_skills(texto))
    dados["senioridade"] = detectar_senioridade(dados.get("cargo_desejado", ""), texto)
    dados["resumo"] = texto[:1500]
    return dados
