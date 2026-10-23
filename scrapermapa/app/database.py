"""Camada de persistência (SQLite, sem dependências externas)."""
from __future__ import annotations

import sqlite3
import threading
from contextlib import contextmanager
from datetime import datetime
from pathlib import Path

DB_PATH = Path(__file__).resolve().parent.parent / "data" / "prospecta.db"
_lock = threading.RLock()

STATUS_VALIDOS = ["novo", "contatado", "negociacao", "cliente", "descartado"]

LEAD_CAMPOS = [
    "place_key", "nome", "categoria", "telefone", "telefone_e164", "celular", "site", "email",
    "instagram", "facebook", "linkedin", "whatsapp_link", "endereco", "rua", "numero", "complemento",
    "bairro", "cidade", "uf", "cep", "latitude", "longitude", "avaliacao", "num_avaliacoes",
    "horario", "plus_code", "situacao", "faixa_preco", "maps_url", "score",
]

SCHEMA = """
CREATE TABLE IF NOT EXISTS searches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    termo TEXT NOT NULL,
    local TEXT,
    modo TEXT,
    latitude REAL, longitude REAL, zoom REAL,
    grade INTEGER DEFAULT 1,
    max_resultados INTEGER,
    status TEXT DEFAULT 'executando',
    encontrados INTEGER DEFAULT 0,
    salvos INTEGER DEFAULT 0,
    novos INTEGER DEFAULT 0,
    erro TEXT,
    criado_em TEXT,
    finalizado_em TEXT
);

CREATE TABLE IF NOT EXISTS leads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    place_key TEXT UNIQUE,
    nome TEXT, categoria TEXT,
    telefone TEXT, telefone_e164 TEXT, celular INTEGER DEFAULT 0,
    site TEXT, email TEXT, instagram TEXT, facebook TEXT, linkedin TEXT, whatsapp_link TEXT,
    endereco TEXT, rua TEXT, numero TEXT, complemento TEXT, bairro TEXT, cidade TEXT, uf TEXT, cep TEXT,
    latitude REAL, longitude REAL,
    avaliacao REAL, num_avaliacoes INTEGER,
    horario TEXT, plus_code TEXT, situacao TEXT, faixa_preco TEXT,
    maps_url TEXT,
    score INTEGER DEFAULT 0,
    status TEXT DEFAULT 'novo',
    notas TEXT DEFAULT '',
    tags TEXT DEFAULT '',
    ultimo_contato TEXT,
    search_id INTEGER,
    criado_em TEXT, atualizado_em TEXT
);

CREATE TABLE IF NOT EXISTS lead_searches (
    lead_id INTEGER, search_id INTEGER,
    PRIMARY KEY (lead_id, search_id)
);

CREATE TABLE IF NOT EXISTS atividades (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lead_id INTEGER,
    tipo TEXT,
    descricao TEXT,
    criado_em TEXT
);

CREATE INDEX IF NOT EXISTS ix_leads_status ON leads(status);
CREATE INDEX IF NOT EXISTS ix_leads_bairro ON leads(bairro);
CREATE INDEX IF NOT EXISTS ix_leads_cidade ON leads(cidade);
CREATE INDEX IF NOT EXISTS ix_atividades_lead ON atividades(lead_id);
"""


def agora() -> str:
    return datetime.now().isoformat(timespec="seconds")


def _connect() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH, check_same_thread=False, timeout=30)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


@contextmanager
def conexao():
    with _lock:
        conn = _connect()
        try:
            yield conn
            conn.commit()
        finally:
            conn.close()


def init_db() -> None:
    with conexao() as c:
        c.executescript(SCHEMA)


def rows(cur) -> list[dict]:
    return [dict(r) for r in cur.fetchall()]


# ---------------------------------------------------------------- buscas
def criar_busca(d: dict) -> int:
    with conexao() as c:
        cur = c.execute(
            """INSERT INTO searches (termo, local, modo, latitude, longitude, zoom, grade, max_resultados,
               status, criado_em) VALUES (?,?,?,?,?,?,?,?, 'executando', ?)""",
            (d["termo"], d.get("local"), d.get("modo"), d.get("lat"), d.get("lng"), d.get("zoom"),
             d.get("grade", 1), d.get("max_resultados"), agora()),
        )
        return cur.lastrowid


def atualizar_busca(search_id: int, **campos) -> None:
    if not campos:
        return
    sets = ", ".join(f"{k}=?" for k in campos)
    with conexao() as c:
        c.execute(f"UPDATE searches SET {sets} WHERE id=?", (*campos.values(), search_id))


def listar_buscas() -> list[dict]:
    with conexao() as c:
        return rows(c.execute(
            """SELECT s.*, (SELECT COUNT(*) FROM lead_searches ls WHERE ls.search_id = s.id) AS total_leads
               FROM searches s ORDER BY s.id DESC"""
        ))


def excluir_busca(search_id: int, apagar_leads: bool = False) -> None:
    with conexao() as c:
        if apagar_leads:
            # apaga somente leads que não aparecem em nenhuma outra busca
            c.execute(
                """DELETE FROM leads WHERE id IN (
                     SELECT lead_id FROM lead_searches WHERE search_id=?
                   ) AND id NOT IN (SELECT lead_id FROM lead_searches WHERE search_id<>?)""",
                (search_id, search_id),
            )
        c.execute("DELETE FROM lead_searches WHERE search_id=?", (search_id,))
        c.execute("DELETE FROM searches WHERE id=?", (search_id,))


# ---------------------------------------------------------------- leads
def salvar_lead(lead: dict, search_id: int | None) -> tuple[int, bool]:
    """Insere ou atualiza (por place_key). Preserva status/notas do CRM. Retorna (id, novo?)."""
    dados = {k: lead.get(k) for k in LEAD_CAMPOS}
    with conexao() as c:
        existente = c.execute("SELECT id FROM leads WHERE place_key=?", (dados["place_key"],)).fetchone()
        if existente:
            lead_id = existente["id"]
            # atualiza só campos com valor (não apaga informação boa com vazio)
            atualizar = {k: v for k, v in dados.items() if v not in (None, "") and k != "place_key"}
            atualizar["atualizado_em"] = agora()
            sets = ", ".join(f"{k}=?" for k in atualizar)
            c.execute(f"UPDATE leads SET {sets} WHERE id=?", (*atualizar.values(), lead_id))
            novo = False
        else:
            dados["search_id"] = search_id
            dados["criado_em"] = dados["atualizado_em"] = agora()
            cols = ", ".join(dados)
            qs = ", ".join("?" for _ in dados)
            lead_id = c.execute(f"INSERT INTO leads ({cols}) VALUES ({qs})", tuple(dados.values())).lastrowid
            c.execute(
                "INSERT INTO atividades (lead_id, tipo, descricao, criado_em) VALUES (?,?,?,?)",
                (lead_id, "sistema", "Lead capturado pela prospecção no mapa", agora()),
            )
            novo = True
        if search_id:
            c.execute("INSERT OR IGNORE INTO lead_searches (lead_id, search_id) VALUES (?,?)", (lead_id, search_id))
        return lead_id, novo


ORDENS = {
    "nome": "nome COLLATE NOCASE", "bairro": "bairro COLLATE NOCASE", "cidade": "cidade COLLATE NOCASE",
    "avaliacao": "avaliacao", "num_avaliacoes": "num_avaliacoes", "score": "score",
    "criado_em": "criado_em", "status": "status", "categoria": "categoria COLLATE NOCASE",
}


def _filtros_sql(f: dict) -> tuple[str, list]:
    where, params = [], []
    if f.get("q"):
        termo = f"%{f['q']}%"
        where.append("(nome LIKE ? OR categoria LIKE ? OR endereco LIKE ? OR telefone LIKE ? OR email LIKE ? OR notas LIKE ? OR tags LIKE ?)")
        params += [termo] * 7
    for campo in ("status", "bairro", "cidade", "categoria", "uf"):
        if f.get(campo):
            where.append(f"{campo} = ?")
            params.append(f[campo])
    if f.get("search_id"):
        where.append("id IN (SELECT lead_id FROM lead_searches WHERE search_id=?)")
        params.append(int(f["search_id"]))
    if f.get("com_telefone"):
        where.append("COALESCE(telefone,'') <> ''")
    if f.get("whatsapp"):
        where.append("celular = 1")
    if f.get("com_email"):
        where.append("COALESCE(email,'') <> ''")
    if f.get("sem_site"):
        where.append("COALESCE(site,'') = ''")
    if f.get("com_site"):
        where.append("COALESCE(site,'') <> ''")
    if f.get("ids"):
        ids = [int(x) for x in str(f["ids"]).split(",") if x.strip().isdigit()]
        if ids:
            where.append(f"id IN ({','.join('?' * len(ids))})")
            params += ids
    return (" WHERE " + " AND ".join(where)) if where else "", params


def listar_leads(f: dict, page: int = 1, per_page: int = 25, order: str = "criado_em", direcao: str = "desc"):
    where, params = _filtros_sql(f)
    ordem = ORDENS.get(order, "criado_em")
    direcao = "ASC" if str(direcao).lower() == "asc" else "DESC"
    with conexao() as c:
        total = c.execute(f"SELECT COUNT(*) FROM leads{where}", params).fetchone()[0]
        sql = f"SELECT * FROM leads{where} ORDER BY {ordem} {direcao}, id DESC"
        if per_page and per_page > 0:
            sql += f" LIMIT {int(per_page)} OFFSET {int((max(page, 1) - 1) * per_page)}"
        itens = rows(c.execute(sql, params))
    return itens, total


def obter_lead(lead_id: int) -> dict | None:
    with conexao() as c:
        r = c.execute("SELECT * FROM leads WHERE id=?", (lead_id,)).fetchone()
        if not r:
            return None
        lead = dict(r)
        lead["atividades"] = rows(c.execute(
            "SELECT * FROM atividades WHERE lead_id=? ORDER BY id DESC LIMIT 100", (lead_id,)))
        lead["buscas"] = rows(c.execute(
            """SELECT s.id, s.termo, s.local, s.criado_em FROM searches s
               JOIN lead_searches ls ON ls.search_id = s.id WHERE ls.lead_id=? ORDER BY s.id DESC""", (lead_id,)))
        return lead


ROTULO_STATUS = {
    "novo": "Novo", "contatado": "Contatado", "negociacao": "Em negociação",
    "cliente": "Cliente", "descartado": "Descartado",
}


def atualizar_lead(lead_id: int, campos: dict) -> dict | None:
    permitidos = {"status", "notas", "tags", "ultimo_contato", "email", "site", "telefone",
                  "instagram", "facebook", "linkedin", "nome", "categoria"}
    campos = {k: v for k, v in campos.items() if k in permitidos}
    if "status" in campos and campos["status"] not in STATUS_VALIDOS:
        raise ValueError("status inválido")
    if not campos:
        return obter_lead(lead_id)
    with conexao() as c:
        anterior = c.execute("SELECT status FROM leads WHERE id=?", (lead_id,)).fetchone()
        if not anterior:
            return None
        campos["atualizado_em"] = agora()
        sets = ", ".join(f"{k}=?" for k in campos)
        c.execute(f"UPDATE leads SET {sets} WHERE id=?", (*campos.values(), lead_id))
        if "status" in campos and campos["status"] != anterior["status"]:
            c.execute(
                "INSERT INTO atividades (lead_id, tipo, descricao, criado_em) VALUES (?,?,?,?)",
                (lead_id, "status", f"Status alterado: {ROTULO_STATUS.get(anterior['status'], anterior['status'])} → "
                                    f"{ROTULO_STATUS[campos['status']]}", agora()),
            )
    return obter_lead(lead_id)


def registrar_atividade(lead_id: int, tipo: str, descricao: str) -> None:
    with conexao() as c:
        c.execute("INSERT INTO atividades (lead_id, tipo, descricao, criado_em) VALUES (?,?,?,?)",
                  (lead_id, tipo, descricao, agora()))
        if tipo in ("whatsapp", "ligacao", "email", "contato"):
            c.execute("UPDATE leads SET ultimo_contato=? WHERE id=?", (agora(), lead_id))


def acao_em_massa(ids: list[int], acao: str, valor: str | None = None) -> int:
    ids = [int(i) for i in ids]
    if not ids:
        return 0
    qs = ",".join("?" * len(ids))
    with conexao() as c:
        if acao == "excluir":
            c.execute(f"DELETE FROM atividades WHERE lead_id IN ({qs})", ids)
            c.execute(f"DELETE FROM lead_searches WHERE lead_id IN ({qs})", ids)
            return c.execute(f"DELETE FROM leads WHERE id IN ({qs})", ids).rowcount
        if acao == "status":
            if valor not in STATUS_VALIDOS:
                raise ValueError("status inválido")
            for i in ids:
                c.execute("INSERT INTO atividades (lead_id, tipo, descricao, criado_em) VALUES (?,?,?,?)",
                          (i, "status", f"Status alterado em massa para {ROTULO_STATUS[valor]}", agora()))
            return c.execute(f"UPDATE leads SET status=?, atualizado_em=? WHERE id IN ({qs})",
                             (valor, agora(), *ids)).rowcount
        if acao == "tag":
            n = 0
            for i in ids:
                r = c.execute("SELECT tags FROM leads WHERE id=?", (i,)).fetchone()
                if not r:
                    continue
                tags = [t for t in (r["tags"] or "").split(",") if t.strip()]
                if valor and valor not in tags:
                    tags.append(valor.strip())
                c.execute("UPDATE leads SET tags=? WHERE id=?", (",".join(tags), i))
                n += 1
            return n
    raise ValueError("ação inválida")


def opcoes_filtro() -> dict:
    with conexao() as c:
        def distintos(col):
            return [r[0] for r in c.execute(
                f"SELECT {col}, COUNT(*) n FROM leads WHERE COALESCE({col},'')<>'' GROUP BY {col} ORDER BY n DESC, {col} LIMIT 300")]
        return {
            "bairros": distintos("bairro"),
            "cidades": distintos("cidade"),
            "categorias": distintos("categoria"),
            "buscas": rows(c.execute("SELECT id, termo, local, criado_em FROM searches ORDER BY id DESC LIMIT 100")),
        }


def estatisticas() -> dict:
    with conexao() as c:
        um = lambda sql, p=(): c.execute(sql, p).fetchone()[0]
        total = um("SELECT COUNT(*) FROM leads")
        por_status = {s: 0 for s in STATUS_VALIDOS}
        for r in c.execute("SELECT status, COUNT(*) FROM leads GROUP BY status"):
            por_status[r[0]] = r[1]
        por_dia = rows(c.execute(
            """SELECT substr(criado_em,1,10) dia, COUNT(*) n FROM leads
               WHERE criado_em >= date('now','-13 days','localtime') GROUP BY dia ORDER BY dia"""))
        return {
            "total": total,
            "com_telefone": um("SELECT COUNT(*) FROM leads WHERE COALESCE(telefone,'')<>''"),
            "celular": um("SELECT COUNT(*) FROM leads WHERE celular=1"),
            "com_email": um("SELECT COUNT(*) FROM leads WHERE COALESCE(email,'')<>''"),
            "sem_site": um("SELECT COUNT(*) FROM leads WHERE COALESCE(site,'')=''"),
            "buscas": um("SELECT COUNT(*) FROM searches"),
            "por_status": por_status,
            "por_dia": por_dia,
            "top_bairros": rows(c.execute(
                "SELECT bairro nome, COUNT(*) n FROM leads WHERE COALESCE(bairro,'')<>'' GROUP BY bairro ORDER BY n DESC LIMIT 8")),
            "top_categorias": rows(c.execute(
                "SELECT categoria nome, COUNT(*) n FROM leads WHERE COALESCE(categoria,'')<>'' GROUP BY categoria ORDER BY n DESC LIMIT 8")),
            "buscas_recentes": rows(c.execute(
                """SELECT s.*, (SELECT COUNT(*) FROM lead_searches ls WHERE ls.search_id=s.id) total_leads
                   FROM searches s ORDER BY id DESC LIMIT 6""")),
        }
