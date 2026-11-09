"""RH+ Match — versão web.

Servidor FastAPI que reaproveita toda a lógica do sistema desktop (banco SQLite,
conectores de vagas, motor de compatibilidade e exportações) e serve uma interface
web (pasta web/static).

Execute:  python -m web.server            (http://127.0.0.1:8000)
          RHMAIS_HOST=0.0.0.0 RHMAIS_PORT=8000 python -m web.server   (rede local)
Proteção opcional por senha: defina RHMAIS_SENHA (usuário: qualquer, ou RHMAIS_USUARIO).
"""
from __future__ import annotations

import base64
import os
import secrets
import tempfile
import threading
import time
import uuid
from collections import Counter
from dataclasses import asdict
from pathlib import Path

from fastapi import FastAPI, File, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from app import exporter, resume_parser, search_engine
from app.config import APP_NAME, APP_VERSION, SETTINGS, save_settings
from app.database import Database
from app.matcher import classificar
from app.models import MODALIDADES, SENIORIDADES, STATUS_PIPELINE, UFS, Candidato, Vaga
from app.sources import FONTES, Filtros
from app.sources.links import links_busca
from app.textutils import extrair_skills

STATIC = Path(__file__).resolve().parent / "static"
CHAVES_SECRETAS = ("adzuna_app_id", "adzuna_app_key", "jooble_key", "github_token")
MASCARA = "••••••••"

app = FastAPI(title=f"{APP_NAME} Web", version=APP_VERSION)
db = Database()

# ---------------------------------------------------------------- autenticação
SENHA = os.environ.get("RHMAIS_SENHA", "")
USUARIO = os.environ.get("RHMAIS_USUARIO", "")


@app.middleware("http")
async def autenticar(request: Request, call_next):
    if SENHA:
        ok = False
        auth = request.headers.get("authorization", "")
        if auth.lower().startswith("basic "):
            try:
                user, _, pwd = base64.b64decode(auth[6:]).decode("utf-8").partition(":")
                ok = secrets.compare_digest(pwd, SENHA) and (not USUARIO or secrets.compare_digest(user, USUARIO))
            except Exception:  # noqa: BLE001
                ok = False
        if not ok:
            return Response("Autenticação necessária", status_code=401,
                            headers={"WWW-Authenticate": f'Basic realm="{APP_NAME}"'})
    return await call_next(request)


# ---------------------------------------------------------------- utilidades
def vaga_json(v: Vaga, idx: int | None = None) -> dict:
    d = asdict(v)
    d["local"] = v.local
    d["faixa"] = classificar(v.score)
    d["descricao"] = (v.descricao or "")[:2500]
    if idx is not None:
        d["idx"] = idx
    return d


def candidato_ou_404(cid: int) -> Candidato:
    c = db.candidato(cid)
    if not c:
        raise HTTPException(404, "Candidato não encontrado")
    return c


def arquivo(caminho: Path, tipo: str) -> FileResponse:
    return FileResponse(caminho, media_type=tipo, filename=caminho.name)


# ---------------------------------------------------------------- meta
@app.get("/api/meta")
def meta():
    return {
        "app": APP_NAME, "versao": APP_VERSION, "empresa": SETTINGS.get("empresa_nome", ""),
        "modalidades": MODALIDADES, "senioridades": SENIORIDADES, "status": STATUS_PIPELINE, "ufs": UFS,
        "score_minimo_padrao": SETTINGS.get("score_minimo_padrao", 40),
        "fontes": [{"id": fid, "nome": cls.nome, "descricao": cls.descricao, "cobertura": cls.cobertura,
                    "requer_chave": cls.requer_chave, "disponivel": cls().disponivel(),
                    "ativa": fid in SETTINGS.get("fontes_ativas", [])} for fid, cls in FONTES.items()],
    }


# ---------------------------------------------------------------- painel
@app.get("/api/painel")
def painel():
    status = db.contagem_status()
    cont = Counter()
    for t in db.textos_vagas(1500):
        cont.update(set(extrair_skills(t)))
    return {
        "candidatos": db.total_candidatos(),
        "vagas": db.total_vagas(),
        "pipeline_ativo": sum(n for s, n in status.items() if s not in ("Descartada", "Contratado")),
        "contratados": status.get("Contratado", 0),
        "entrevistas": status.get("Entrevista", 0),
        "funil": [[s, status.get(s, 0)] for s in STATUS_PIPELINE if status.get(s)],
        "por_fonte": db.vagas_por_fonte()[:7],
        "skills": cont.most_common(7),
        "buscas": db.ultimas_buscas(6),
    }


# ---------------------------------------------------------------- candidatos
class CandidatoIn(BaseModel):
    nome: str
    email: str = ""
    telefone: str = ""
    cargo_desejado: str
    cargos_alternativos: str = ""
    skills: str = ""
    senioridade: str = ""
    cidade: str = ""
    uf: str = ""
    modalidades: str = "Presencial,Híbrido,Remoto"
    pretensao_salarial: float = 0.0
    aceita_mudanca: int = 0
    resumo: str = ""


@app.get("/api/candidatos")
def listar_candidatos(q: str = ""):
    return [c.to_dict() for c in db.candidatos(q.strip())]


@app.get("/api/candidatos/{cid}")
def obter_candidato(cid: int):
    c = candidato_ou_404(cid)
    d = c.to_dict()
    d["termos_sugeridos"] = search_engine.termos_do_candidato(c)
    return d


@app.post("/api/candidatos")
def criar_candidato(dados: CandidatoIn):
    if not dados.nome.strip() or not dados.cargo_desejado.strip():
        raise HTTPException(400, "Informe pelo menos o nome e o cargo desejado.")
    cid = db.salvar_candidato(Candidato(**dados.model_dump()))
    return {"id": cid}


@app.put("/api/candidatos/{cid}")
def atualizar_candidato(cid: int, dados: CandidatoIn):
    candidato_ou_404(cid)
    if not dados.nome.strip() or not dados.cargo_desejado.strip():
        raise HTTPException(400, "Informe pelo menos o nome e o cargo desejado.")
    db.salvar_candidato(Candidato(id=cid, **dados.model_dump()))
    return {"id": cid}


@app.delete("/api/candidatos/{cid}")
def excluir_candidato(cid: int):
    db.excluir_candidato(cid)
    return {"ok": True}


@app.post("/api/curriculo")
async def importar_curriculo(arq: UploadFile = File(...)):
    ext = Path(arq.filename or "").suffix.lower()
    if ext not in (".pdf", ".docx", ".txt"):
        raise HTTPException(400, "Envie um arquivo PDF, DOCX ou TXT.")
    conteudo = await arq.read()
    if len(conteudo) > 10 * 1024 * 1024:
        raise HTTPException(400, "Arquivo maior que 10 MB.")
    fd, caminho = tempfile.mkstemp(suffix=ext)
    try:
        with os.fdopen(fd, "wb") as f:
            f.write(conteudo)
        return resume_parser.analisar(resume_parser.ler_texto(caminho))
    except Exception as e:  # noqa: BLE001
        raise HTTPException(400, f"Não foi possível ler o currículo: {e}") from e
    finally:
        try:
            os.remove(caminho)
        except OSError:
            pass


# ---------------------------------------------------------------- busca (assíncrona)
class Busca:
    def __init__(self, candidato: Candidato, fontes: list[str], termos: list[str]):
        self.id = uuid.uuid4().hex[:12]
        self.candidato = candidato
        self.fontes = fontes
        self.termos = termos
        self.progresso: dict[str, dict] = {FONTES[f].nome: {"status": "aguardando", "qtd": 0} for f in fontes}
        self.estado = "buscando"            # buscando | concluida | erro | cancelada
        self.erro = ""
        self.cancelar = False
        self.resultado: search_engine.ResultadoBusca | None = None
        self.criada = time.time()

    def rodar(self):
        try:
            r = search_engine.buscar(
                self.candidato, self.fontes, self.termos,
                progresso=lambda nome, st, q: self.progresso.__setitem__(nome, {"status": st, "qtd": q}),
                cancelado=lambda: self.cancelar)
            self.resultado = r
            minimo = SETTINGS.get("score_minimo_padrao", 40)
            compat = sum(1 for v in r.vagas if v.score >= minimo)
            db.registrar_busca(self.candidato.id, ", ".join(r.termos), len(r.vagas), compat, ", ".join(r.por_fonte))
            for v in r.vagas:
                if v.score >= 30:
                    db.salvar_vaga(v)
            self.estado = "cancelada" if self.cancelar else "concluida"
        except Exception as e:  # noqa: BLE001
            self.estado, self.erro = "erro", str(e)[:300]


BUSCAS: dict[str, Busca] = {}
_buscas_lock = threading.Lock()


def _limpar_buscas():
    limite = time.time() - 6 * 3600
    with _buscas_lock:
        for k in [k for k, b in BUSCAS.items() if b.criada < limite]:
            BUSCAS.pop(k, None)


def busca_ou_404(bid: str) -> Busca:
    b = BUSCAS.get(bid)
    if not b:
        raise HTTPException(404, "Busca expirada. Faça a busca novamente.")
    return b


class BuscaIn(BaseModel):
    candidato_id: int
    fontes: list[str]
    termos: list[str]


@app.post("/api/buscas")
def iniciar_busca(dados: BuscaIn):
    c = candidato_ou_404(dados.candidato_id)
    fontes = [f for f in dados.fontes if f in FONTES and FONTES[f]().disponivel()]
    termos = [t.strip() for t in dados.termos if t.strip()][:5]
    if not fontes or not termos:
        raise HTTPException(400, "Selecione ao menos um canal e informe um termo de busca.")
    _limpar_buscas()
    b = Busca(c, fontes, termos)
    with _buscas_lock:
        BUSCAS[b.id] = b
    threading.Thread(target=b.rodar, daemon=True).start()
    return {"id": b.id}


@app.get("/api/buscas/{bid}")
def status_busca(bid: str):
    b = busca_ou_404(bid)
    out = {"id": b.id, "estado": b.estado, "erro": b.erro, "progresso": b.progresso, "termos": b.termos,
           "candidato_id": b.candidato.id}
    if b.resultado and b.estado in ("concluida", "cancelada"):
        r = b.resultado
        out.update(vagas=[vaga_json(v, i) for i, v in enumerate(r.vagas)], total_bruto=r.total_bruto,
                   por_fonte=r.por_fonte, erros=r.erros)
    return out


@app.post("/api/buscas/{bid}/cancelar")
def cancelar_busca(bid: str):
    busca_ou_404(bid).cancelar = True
    return {"ok": True}


class SelecaoIn(BaseModel):
    indices: list[int]


def _selecionadas(b: Busca, indices: list[int]) -> list[Vaga]:
    if not b.resultado:
        raise HTTPException(400, "A busca ainda não terminou.")
    vagas = b.resultado.vagas
    return [vagas[i] for i in indices if 0 <= i < len(vagas)]


@app.post("/api/buscas/{bid}/excel")
def exportar_busca_excel(bid: str, sel: SelecaoIn):
    b = busca_ou_404(bid)
    vagas = _selecionadas(b, sel.indices)
    if not vagas:
        raise HTTPException(400, "Nenhuma vaga para exportar.")
    return arquivo(exporter.exportar_excel(vagas, b.candidato),
                   "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")


@app.post("/api/buscas/{bid}/relatorio")
def relatorio_busca(bid: str, sel: SelecaoIn):
    b = busca_ou_404(bid)
    vagas = _selecionadas(b, sel.indices)
    if not vagas:
        raise HTTPException(400, "Nenhuma vaga para o relatório.")
    caminho = exporter.relatorio_html(vagas, b.candidato)
    return HTMLResponse(caminho.read_text(encoding="utf-8"))


class PipelineAddIn(BaseModel):
    busca_id: str
    idx: int


@app.post("/api/pipeline")
def adicionar_pipeline(dados: PipelineAddIn):
    b = busca_ou_404(dados.busca_id)
    vagas = _selecionadas(b, [dados.idx])
    if not vagas:
        raise HTTPException(404, "Vaga não encontrada.")
    novo = db.adicionar_pipeline(b.candidato.id, vagas[0])
    return {"novo": novo}


@app.get("/api/links")
def links(termo: str, cidade: str = "", uf: str = "", remoto: bool = False):
    return [{"nome": n, "url": u} for n, u in links_busca(termo or "vagas", cidade, uf, remoto)]


# ---------------------------------------------------------------- pipeline
@app.get("/api/pipeline")
def listar_pipeline(candidato_id: int | None = None):
    itens = db.pipeline(candidato_id)
    for it in itens:
        it["faixa"] = classificar(it["score"] or 0)
        it["descricao"] = (it.get("descricao") or "")[:2500]
    return itens


class PipelineUpd(BaseModel):
    status: str | None = None
    notas: str | None = None


@app.patch("/api/pipeline/{pid}")
def atualizar_pipeline(pid: int, dados: PipelineUpd):
    if dados.status is not None and dados.status not in STATUS_PIPELINE:
        raise HTTPException(400, "Etapa inválida.")
    db.atualizar_pipeline(pid, dados.status, dados.notas)
    return {"ok": True}


@app.delete("/api/pipeline/{pid}")
def remover_pipeline(pid: int):
    db.remover_pipeline(pid)
    return {"ok": True}


@app.get("/api/pipeline-excel")
def exportar_pipeline(candidato_id: int | None = None):
    return arquivo(exporter.exportar_pipeline_excel(db.pipeline(candidato_id)),
                   "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")


# ---------------------------------------------------------------- configurações
@app.get("/api/config")
def obter_config():
    d = {k: SETTINGS.get(k) for k in ("empresa_nome", "paginas_por_fonte", "score_minimo_padrao", "fontes_ativas")}
    for k in CHAVES_SECRETAS:
        d[k] = MASCARA if SETTINGS.get(k) else ""
    return d


class ConfigIn(BaseModel):
    empresa_nome: str = ""
    paginas_por_fonte: int = 2
    score_minimo_padrao: int = 40
    fontes_ativas: list[str] = []
    adzuna_app_id: str = ""
    adzuna_app_key: str = ""
    jooble_key: str = ""
    github_token: str = ""


@app.put("/api/config")
def salvar_config(dados: ConfigIn):
    d = dados.model_dump()
    for k in CHAVES_SECRETAS:
        if d[k] != MASCARA:
            SETTINGS[k] = d[k].strip()
    SETTINGS["empresa_nome"] = d["empresa_nome"].strip()
    SETTINGS["paginas_por_fonte"] = max(1, min(5, d["paginas_por_fonte"]))
    SETTINGS["score_minimo_padrao"] = max(0, min(90, d["score_minimo_padrao"]))
    SETTINGS["fontes_ativas"] = [f for f in d["fontes_ativas"] if f in FONTES]
    save_settings(SETTINGS)
    return {"ok": True}


@app.get("/api/fontes/{fid}/testar")
def testar_fonte(fid: str):
    if fid not in FONTES:
        raise HTTPException(404, "Canal desconhecido")
    f = FONTES[fid]()
    if not f.disponivel():
        return {"status": "sem_chave"}
    try:
        n = len(f.buscar(Filtros(termo="analista", paginas=1, skills=["Python"])))
        return {"status": "online", "qtd": n}
    except Exception as e:  # noqa: BLE001
        return {"status": "erro", "erro": str(e)[:200]}


@app.exception_handler(HTTPException)
async def erro_http(_: Request, exc: HTTPException):
    return JSONResponse({"erro": exc.detail}, status_code=exc.status_code, headers=getattr(exc, "headers", None))


# ---------------------------------------------------------------- frontend
app.mount("/static", StaticFiles(directory=STATIC), name="static")


@app.get("/", include_in_schema=False)
def index():
    return FileResponse(STATIC / "index.html")


def main():
    import uvicorn
    host = os.environ.get("RHMAIS_HOST", "127.0.0.1")
    port = int(os.environ.get("RHMAIS_PORT", "8000"))
    print(f"{APP_NAME} Web rodando em http://{'localhost' if host in ('127.0.0.1', '0.0.0.0') else host}:{port}")
    uvicorn.run(app, host=host, port=port, log_level="warning")


if __name__ == "__main__":
    main()
