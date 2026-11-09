"""Persistência em SQLite (arquivo local, sem servidor)."""
from __future__ import annotations

import json
import sqlite3
import threading
from datetime import datetime

from .config import DB_PATH
from .models import Candidato, Vaga

_lock = threading.Lock()

SCHEMA = """
CREATE TABLE IF NOT EXISTS candidatos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL, email TEXT, telefone TEXT,
    cargo_desejado TEXT, cargos_alternativos TEXT, skills TEXT,
    senioridade TEXT, cidade TEXT, uf TEXT, modalidades TEXT,
    pretensao_salarial REAL DEFAULT 0, aceita_mudanca INTEGER DEFAULT 0,
    resumo TEXT, criado_em TEXT
);
CREATE TABLE IF NOT EXISTS vagas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    url TEXT UNIQUE, titulo TEXT, empresa TEXT, fonte TEXT, cidade TEXT, uf TEXT,
    modalidade TEXT, senioridade TEXT, salario TEXT, contrato TEXT, descricao TEXT,
    tags TEXT, publicada_em TEXT, coletada_em TEXT
);
CREATE TABLE IF NOT EXISTS pipeline (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    candidato_id INTEGER REFERENCES candidatos(id) ON DELETE CASCADE,
    vaga_id INTEGER REFERENCES vagas(id) ON DELETE CASCADE,
    score REAL, detalhes TEXT, status TEXT DEFAULT 'Sugerida', notas TEXT DEFAULT '',
    criado_em TEXT, atualizado_em TEXT,
    UNIQUE(candidato_id, vaga_id)
);
CREATE TABLE IF NOT EXISTS buscas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    candidato_id INTEGER, termos TEXT, total INTEGER, compativeis INTEGER,
    fontes TEXT, criada_em TEXT
);
"""

CAMPOS_CANDIDATO = [
    "nome", "email", "telefone", "cargo_desejado", "cargos_alternativos", "skills",
    "senioridade", "cidade", "uf", "modalidades", "pretensao_salarial", "aceita_mudanca", "resumo",
]


def agora() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M")


class Database:
    def __init__(self, path=DB_PATH):
        self.conn = sqlite3.connect(str(path), check_same_thread=False)
        self.conn.row_factory = sqlite3.Row
        self.conn.execute("PRAGMA foreign_keys = ON")
        self.conn.executescript(SCHEMA)
        self.conn.commit()

    def _exec(self, sql: str, params=()):
        with _lock:
            cur = self.conn.execute(sql, params)
            self.conn.commit()
            return cur

    def _all(self, sql: str, params=()) -> list[sqlite3.Row]:
        with _lock:
            return self.conn.execute(sql, params).fetchall()

    # ---------------- candidatos ----------------
    def salvar_candidato(self, c: Candidato) -> int:
        valores = [getattr(c, f) for f in CAMPOS_CANDIDATO]
        if c.id:
            sets = ", ".join(f"{f}=?" for f in CAMPOS_CANDIDATO)
            self._exec(f"UPDATE candidatos SET {sets} WHERE id=?", (*valores, c.id))
            return c.id
        cols = ", ".join(CAMPOS_CANDIDATO + ["criado_em"])
        marks = ", ".join("?" * (len(CAMPOS_CANDIDATO) + 1))
        cur = self._exec(f"INSERT INTO candidatos ({cols}) VALUES ({marks})", (*valores, agora()))
        return cur.lastrowid

    def candidatos(self, filtro: str = "") -> list[Candidato]:
        sql = "SELECT * FROM candidatos"
        params: tuple = ()
        if filtro:
            sql += " WHERE nome LIKE ? OR cargo_desejado LIKE ? OR skills LIKE ? OR cidade LIKE ?"
            params = tuple([f"%{filtro}%"] * 4)
        rows = self._all(sql + " ORDER BY nome COLLATE NOCASE", params)
        return [Candidato(**{k: r[k] for k in r.keys()}) for r in rows]

    def candidato(self, cid: int) -> Candidato | None:
        rows = self._all("SELECT * FROM candidatos WHERE id=?", (cid,))
        return Candidato(**dict(rows[0])) if rows else None

    def excluir_candidato(self, cid: int) -> None:
        self._exec("DELETE FROM candidatos WHERE id=?", (cid,))

    # ---------------- vagas ----------------
    def salvar_vaga(self, v: Vaga) -> int:
        d = v.to_dict()
        campos = ["url", "titulo", "empresa", "fonte", "cidade", "uf", "modalidade", "senioridade",
                  "salario", "contrato", "descricao", "tags", "publicada_em"]
        with _lock:
            row = self.conn.execute("SELECT id FROM vagas WHERE url=?", (v.url,)).fetchone()
            if row:
                sets = ", ".join(f"{f}=?" for f in campos[1:])
                self.conn.execute(f"UPDATE vagas SET {sets} WHERE id=?", (*[d[f] for f in campos[1:]], row["id"]))
                self.conn.commit()
                return row["id"]
            cur = self.conn.execute(
                f"INSERT INTO vagas ({', '.join(campos)}, coletada_em) VALUES ({', '.join('?' * (len(campos) + 1))})",
                (*[d[f] for f in campos], agora()))
            self.conn.commit()
            return cur.lastrowid

    def total_vagas(self) -> int:
        return self._all("SELECT COUNT(*) n FROM vagas")[0]["n"]

    def vagas_por_fonte(self) -> list[tuple[str, int]]:
        return [(r["fonte"], r["n"]) for r in
                self._all("SELECT fonte, COUNT(*) n FROM vagas GROUP BY fonte ORDER BY n DESC")]

    def vagas_por_modalidade(self) -> list[tuple[str, int]]:
        return [(r["m"] or "Não informado", r["n"]) for r in self._all(
            "SELECT modalidade m, COUNT(*) n FROM vagas GROUP BY modalidade ORDER BY n DESC")]

    def textos_vagas(self, limite: int = 3000) -> list[str]:
        return [f"{r['titulo']} {r['tags']} {r['descricao'][:1500] if r['descricao'] else ''}" for r in
                self._all("SELECT titulo, tags, descricao FROM vagas ORDER BY id DESC LIMIT ?", (limite,))]

    # ---------------- pipeline ----------------
    def adicionar_pipeline(self, candidato_id: int, v: Vaga, status: str = "Sugerida") -> bool:
        vid = self.salvar_vaga(v)
        try:
            self._exec(
                "INSERT INTO pipeline (candidato_id, vaga_id, score, detalhes, status, criado_em, atualizado_em)"
                " VALUES (?,?,?,?,?,?,?)",
                (candidato_id, vid, v.score, json.dumps(v.detalhes_score, ensure_ascii=False), status, agora(), agora()))
            return True
        except sqlite3.IntegrityError:
            return False

    def pipeline(self, candidato_id: int | None = None, status: str | None = None) -> list[dict]:
        sql = ("SELECT p.id, p.score, p.status, p.notas, p.detalhes, p.atualizado_em, p.candidato_id,"
               " c.nome candidato, v.titulo, v.empresa, v.url, v.fonte, v.cidade, v.uf, v.modalidade,"
               " v.salario, v.contrato, v.senioridade, v.descricao"
               " FROM pipeline p JOIN candidatos c ON c.id=p.candidato_id JOIN vagas v ON v.id=p.vaga_id WHERE 1=1")
        params: list = []
        if candidato_id:
            sql += " AND p.candidato_id=?"
            params.append(candidato_id)
        if status:
            sql += " AND p.status=?"
            params.append(status)
        return [dict(r) for r in self._all(sql + " ORDER BY p.atualizado_em DESC, p.score DESC", params)]

    def atualizar_pipeline(self, pid: int, status: str | None = None, notas: str | None = None) -> None:
        if status is not None:
            self._exec("UPDATE pipeline SET status=?, atualizado_em=? WHERE id=?", (status, agora(), pid))
        if notas is not None:
            self._exec("UPDATE pipeline SET notas=?, atualizado_em=? WHERE id=?", (notas, agora(), pid))

    def remover_pipeline(self, pid: int) -> None:
        self._exec("DELETE FROM pipeline WHERE id=?", (pid,))

    def contagem_status(self) -> dict[str, int]:
        return {r["status"]: r["n"] for r in self._all("SELECT status, COUNT(*) n FROM pipeline GROUP BY status")}

    # ---------------- buscas ----------------
    def registrar_busca(self, candidato_id, termos: str, total: int, compativeis: int, fontes: str) -> None:
        self._exec("INSERT INTO buscas (candidato_id, termos, total, compativeis, fontes, criada_em) VALUES (?,?,?,?,?,?)",
                   (candidato_id, termos, total, compativeis, fontes, agora()))

    def ultimas_buscas(self, n: int = 8) -> list[dict]:
        return [dict(r) for r in self._all(
            "SELECT b.*, c.nome FROM buscas b LEFT JOIN candidatos c ON c.id=b.candidato_id"
            " ORDER BY b.id DESC LIMIT ?", (n,))]

    def total_candidatos(self) -> int:
        return self._all("SELECT COUNT(*) n FROM candidatos")[0]["n"]
