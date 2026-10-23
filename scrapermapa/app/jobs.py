"""Execução das buscas em segundo plano (uma thread + event loop próprio por busca)."""
from __future__ import annotations

import asyncio
import sys
import threading
import time
import traceback
import uuid
from datetime import datetime

from . import database as db
from .parser import local_corresponde
from .scraper import GoogleMapsScraper

FASES = {
    "iniciando": "Iniciando navegador",
    "coletando": "Coletando empresas na lista do mapa",
    "extraindo": "Extraindo dados de cada empresa",
    "concluido": "Concluído",
    "cancelado": "Cancelado",
    "erro": "Erro",
}


class Job:
    def __init__(self, params: dict, search_id: int):
        self.id = uuid.uuid4().hex[:12]
        self.search_id = search_id
        self.params = params
        self.status = "executando"
        self.fase = "iniciando"
        self.encontrados = 0
        self.processados = 0
        self.salvos = 0
        self.novos = 0
        self.descartados = 0
        self.erros = 0
        self.logs: list[dict] = []
        self.resultados: list[dict] = []
        self.cancelar = False
        self.inicio = time.time()
        self.fim: float | None = None
        self.erro: str | None = None
        self._lock = threading.Lock()

    def log(self, msg: str, nivel: str = "info"):
        with self._lock:
            self.logs.append({"t": datetime.now().strftime("%H:%M:%S"), "msg": msg, "nivel": nivel})
            self.logs = self.logs[-300:]

    def to_dict(self, desde: int = 0) -> dict:
        with self._lock:
            return {
                "id": self.id,
                "search_id": self.search_id,
                "params": self.params,
                "status": self.status,
                "fase": self.fase,
                "fase_rotulo": FASES.get(self.fase, self.fase),
                "encontrados": self.encontrados,
                "processados": self.processados,
                "salvos": self.salvos,
                "novos": self.novos,
                "descartados": self.descartados,
                "erros": self.erros,
                "decorrido": round((self.fim or time.time()) - self.inicio, 1),
                "logs": self.logs[-60:],
                "total_resultados": len(self.resultados),
                "resultados": self.resultados[desde:],
                "erro": self.erro,
            }


class JobManager:
    def __init__(self):
        self.jobs: dict[str, Job] = {}

    def iniciar(self, params: dict) -> Job:
        search_id = db.criar_busca(params)
        job = Job(params, search_id)
        self.jobs[job.id] = job
        threading.Thread(target=self._thread, args=(job,), daemon=True).start()
        return job

    def obter(self, job_id: str) -> Job | None:
        return self.jobs.get(job_id)

    def ativos(self) -> list[dict]:
        return [j.to_dict(desde=10**9) for j in self.jobs.values() if j.status == "executando"]

    # --------------------------------------------------------------------
    def _thread(self, job: Job):
        # No Windows o Playwright precisa do ProactorEventLoop (subprocessos).
        loop = asyncio.ProactorEventLoop() if sys.platform == "win32" else asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            loop.run_until_complete(self._executar(job))
        finally:
            loop.close()

    async def _executar(self, job: Job):
        p = job.params
        scraper = GoogleMapsScraper(
            headless=p.get("headless", True),
            concorrencia=p.get("concorrencia", 3),
            log=job.log,
        )

        def ao_fase(f):
            job.fase = f
            job.log(FASES.get(f, f) + "…")

        def ao_encontrar(n):
            job.encontrados = n
            db.atualizar_busca(job.search_id, encontrados=n)

        def ao_erro_item(msg):
            job.erros += 1
            job.log(msg, "aviso")

        filtro_estrito = p.get("filtro_estrito") and p.get("modo") == "local" and p.get("local")

        def ao_lead(lead: dict):
            job.processados += 1
            if filtro_estrito and not local_corresponde(p["local"], lead):
                job.descartados += 1
                job.log(f"Ignorado (fora de '{p['local']}'): {lead['nome']}", "aviso")
                return
            lead_id, novo = db.salvar_lead(lead, job.search_id)
            lead["id"] = lead_id
            lead["novo"] = novo
            with job._lock:
                job.resultados.append(lead)
            job.salvos += 1
            job.novos += int(novo)
            if job.salvos % 5 == 0:
                db.atualizar_busca(job.search_id, salvos=job.salvos, novos=job.novos)

        job.log(f"Busca: “{p['termo']}”" + (f" em {p['local']}" if p.get("local") and p.get("modo") == "local" else " na área do mapa"))
        try:
            await scraper.executar(
                termo=p["termo"],
                local=p.get("local", ""),
                modo=p.get("modo", "local"),
                lat=p.get("lat"), lng=p.get("lng"), zoom=p.get("zoom"),
                bounds=p.get("bounds"),
                grade=int(p.get("grade") or 1),
                limite=int(p.get("max_resultados") or 60),
                enriquecer=bool(p.get("enriquecer")),
                deve_parar=lambda: job.cancelar,
                ao_fase=ao_fase,
                ao_encontrar=ao_encontrar,
                ao_lead=ao_lead,
                ao_erro_item=ao_erro_item,
            )
            job.status = "cancelado" if job.cancelar else "concluido"
            job.fase = job.status
            job.log(f"Finalizado: {job.salvos} empresas salvas ({job.novos} novas).", "sucesso")
        except Exception as e:
            job.status = "erro"
            job.fase = "erro"
            job.erro = str(e)
            job.log(f"Erro: {e}", "erro")
            traceback.print_exc()
        finally:
            job.fim = time.time()
            db.atualizar_busca(
                job.search_id,
                status={"concluido": "concluida", "cancelado": "cancelada"}.get(job.status, job.status),
                encontrados=job.encontrados, salvos=job.salvos, novos=job.novos,
                erro=job.erro, finalizado_em=db.agora(),
            )


manager = JobManager()
