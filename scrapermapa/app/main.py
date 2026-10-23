"""API e servidor web do Prospecta."""
from __future__ import annotations

from datetime import datetime
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from . import database as db
from . import exporter
from .enrich import enriquecer_site
from .jobs import manager
from .parser import calcular_score

BASE = Path(__file__).resolve().parent.parent
STATIC = BASE / "static"

app = FastAPI(title="Prospecta — Prospecção de empresas no mapa", version="1.0.0")
app.mount("/static", StaticFiles(directory=STATIC), name="static")


@app.on_event("startup")
def _startup():
    db.init_db()
    with db.conexao() as c:  # buscas que ficaram "executando" quando o servidor caiu
        c.execute("UPDATE searches SET status='interrompida' WHERE status='executando'")


@app.get("/", include_in_schema=False)
def index():
    return FileResponse(STATIC / "index.html")


# ------------------------------------------------------------------ buscas
class Bounds(BaseModel):
    norte: float
    sul: float
    leste: float
    oeste: float


class NovaBusca(BaseModel):
    termo: str = Field(..., min_length=2, max_length=120)
    local: str = ""
    modo: str = "local"  # "local" (texto) ou "area" (área visível do mapa)
    lat: Optional[float] = None
    lng: Optional[float] = None
    zoom: Optional[float] = None
    bounds: Optional[Bounds] = None
    grade: int = Field(1, ge=1, le=4)
    max_resultados: int = Field(60, ge=1, le=500)
    enriquecer: bool = False
    filtro_estrito: bool = False
    headless: bool = True
    concorrencia: int = Field(3, ge=1, le=6)


@app.post("/api/buscas")
def iniciar_busca(b: NovaBusca):
    if b.modo == "local" and not b.local.strip():
        raise HTTPException(400, "Informe o bairro, rua ou cidade.")
    if b.modo == "area" and (b.lat is None or b.lng is None):
        raise HTTPException(400, "Posicione o mapa na região desejada.")
    params = b.model_dump()
    if b.modo == "local":
        params["grade"] = 1
    job = manager.iniciar(params)
    return {"job_id": job.id, "search_id": job.search_id}


@app.get("/api/jobs")
def jobs_ativos():
    return manager.ativos()


@app.get("/api/jobs/{job_id}")
def status_job(job_id: str, desde: int = 0):
    job = manager.obter(job_id)
    if not job:
        raise HTTPException(404, "Busca não encontrada (o servidor pode ter sido reiniciado).")
    return job.to_dict(desde)


@app.post("/api/jobs/{job_id}/cancelar")
def cancelar_job(job_id: str):
    job = manager.obter(job_id)
    if not job:
        raise HTTPException(404, "Busca não encontrada.")
    job.cancelar = True
    job.log("Cancelamento solicitado…", "aviso")
    return {"ok": True}


@app.get("/api/buscas")
def listar_buscas():
    return db.listar_buscas()


@app.delete("/api/buscas/{search_id}")
def excluir_busca(search_id: int, apagar_leads: bool = False):
    db.excluir_busca(search_id, apagar_leads)
    return {"ok": True}


# ------------------------------------------------------------------ leads
def _filtros(request: Request) -> dict:
    q = request.query_params
    chaves = ["q", "status", "bairro", "cidade", "categoria", "uf", "search_id", "ids",
              "com_telefone", "whatsapp", "com_email", "sem_site", "com_site"]
    f = {k: q.get(k) for k in chaves if q.get(k) not in (None, "", "0", "false")}
    return f


@app.get("/api/leads")
def listar_leads(request: Request, page: int = 1, per_page: int = Query(25, ge=0, le=5000),
                 order: str = "criado_em", dir: str = "desc"):
    itens, total = db.listar_leads(_filtros(request), page, per_page, order, dir)
    return {"items": itens, "total": total, "page": page, "per_page": per_page}


@app.get("/api/leads/filtros")
def filtros_leads():
    return db.opcoes_filtro()


@app.get("/api/leads/exportar")
def exportar(request: Request, formato: str = "xlsx", order: str = "nome", dir: str = "asc"):
    itens, _ = db.listar_leads(_filtros(request), 1, 0, order, dir)
    carimbo = datetime.now().strftime("%Y%m%d-%H%M")
    if formato == "csv":
        return Response(exporter.gerar_csv(itens), media_type="text/csv; charset=utf-8",
                        headers={"Content-Disposition": f'attachment; filename="leads-{carimbo}.csv"'})
    return Response(exporter.gerar_xlsx(itens),
                    media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    headers={"Content-Disposition": f'attachment; filename="leads-{carimbo}.xlsx"'})


@app.get("/api/leads/{lead_id}")
def obter_lead(lead_id: int):
    lead = db.obter_lead(lead_id)
    if not lead:
        raise HTTPException(404, "Lead não encontrado.")
    return lead


class AtualizaLead(BaseModel):
    status: Optional[str] = None
    notas: Optional[str] = None
    tags: Optional[str] = None
    email: Optional[str] = None
    site: Optional[str] = None
    telefone: Optional[str] = None
    instagram: Optional[str] = None
    facebook: Optional[str] = None
    linkedin: Optional[str] = None
    nome: Optional[str] = None
    categoria: Optional[str] = None


@app.patch("/api/leads/{lead_id}")
def atualizar_lead(lead_id: int, dados: AtualizaLead):
    try:
        lead = db.atualizar_lead(lead_id, dados.model_dump(exclude_none=True))
    except ValueError as e:
        raise HTTPException(400, str(e))
    if not lead:
        raise HTTPException(404, "Lead não encontrado.")
    return lead


class Atividade(BaseModel):
    tipo: str = "nota"
    descricao: str = Field(..., min_length=1, max_length=2000)


@app.post("/api/leads/{lead_id}/atividades")
def nova_atividade(lead_id: int, a: Atividade):
    if not db.obter_lead(lead_id):
        raise HTTPException(404, "Lead não encontrado.")
    db.registrar_atividade(lead_id, a.tipo, a.descricao)
    return db.obter_lead(lead_id)


@app.post("/api/leads/{lead_id}/enriquecer")
async def enriquecer_lead(lead_id: int):
    lead = db.obter_lead(lead_id)
    if not lead:
        raise HTTPException(404, "Lead não encontrado.")
    if not lead.get("site"):
        raise HTTPException(400, "Este lead não possui site para consultar.")
    extra = await enriquecer_site(lead["site"])
    novos = {k: v for k, v in extra.items() if v and not lead.get(k)}
    if novos:
        lead.update(novos)
        with db.conexao() as c:
            campos = {**novos, "score": calcular_score(lead), "atualizado_em": db.agora()}
            sets = ", ".join(f"{k}=?" for k in campos)
            c.execute(f"UPDATE leads SET {sets} WHERE id=?", (*campos.values(), lead_id))
        db.registrar_atividade(lead_id, "sistema", "Dados enriquecidos a partir do site: " + ", ".join(novos))
    return {"encontrados": list(novos), "lead": db.obter_lead(lead_id)}


class AcaoMassa(BaseModel):
    ids: list[int]
    acao: str
    valor: Optional[str] = None


@app.post("/api/leads/massa")
def acao_massa(a: AcaoMassa):
    try:
        n = db.acao_em_massa(a.ids, a.acao, a.valor)
    except ValueError as e:
        raise HTTPException(400, str(e))
    return {"afetados": n}


@app.get("/api/estatisticas")
def estatisticas():
    return db.estatisticas()
