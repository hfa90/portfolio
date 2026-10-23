"""
Prospecta · Robô de captura do Google Maps
==========================================

O mesmo programa funciona de dois jeitos:

• NUVEM (opção 3) — rodando num servidor (Railway, Render, VPS…) com a variável
  SUPABASE_SERVICE_ROLE_KEY. Atende as buscas com fonte "nuvem" de todos os usuários.

• DESKTOP (opção 4) — o ProspectaRobo.exe no seu PC. Na primeira vez pede seu e-mail
  e senha do Prospecta e passa a atender as suas buscas com fonte "desktop",
  usando o Microsoft Edge/Chrome já instalados (nada de Python para instalar).

Em ambos os casos o robô fica olhando a fila (tabela prospecta_buscas), executa a
busca no Google Maps e grava os leads no Supabase. Você acompanha tudo pelo site.
"""
from __future__ import annotations

import asyncio
import getpass
import os
import platform
import socket
import sys
import time
import traceback
from datetime import datetime

from dados import local_corresponde
from scraper import GoogleMapsScraper
from supa import ErroSupabase, Supa, eh_exe

VERSAO = "2.0.0"
SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://uvculminojmtltdulpsa.supabase.co")
SUPABASE_ANON_KEY = os.environ.get(
    "SUPABASE_ANON_KEY",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV2Y3VsbWlub2ptdGx0ZHVscHNhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI1NTA4NjIsImV4cCI6MjEwODEyNjg2Mn0.4aAqARAGLlby7iRNMNylnOAKbiKXDs2k19MqCpDuXH0",
)
SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
MODO = "nuvem" if SERVICE_KEY else "desktop"
INTERVALO_FILA = float(os.environ.get("PROSPECTA_INTERVALO", "4"))
HOST = os.environ.get("PROSPECTA_HOST") or socket.gethostname()
ROBO_ID = f"{MODO}:{HOST}"


def agora() -> str:
    return datetime.now().strftime("%H:%M:%S")


def say(msg: str):
    print(f"[{agora()}] {msg}", flush=True)


def titulo(t: str):
    if os.name == "nt":
        os.system(f"title {t}")


# ---------------------------------------------------------------- login (desktop)
async def autenticar(sb: Supa) -> None:
    if MODO == "nuvem":
        say("Modo NUVEM (service role) — atendendo buscas com fonte 'nuvem'.")
        return
    if sb.carregar_sessao():
        try:
            await sb.renovar()
            say(f"Conectado como {sb.usuario.get('email')}.")
            return
        except ErroSupabase:
            say("Sessão expirada, faça login novamente.")
    print()
    print("  ┌───────────────────────────────────────────────┐")
    print("  │  PROSPECTA · Robô do PC — login               │")
    print("  │  Use o mesmo e-mail e senha do site.          │")
    print("  └───────────────────────────────────────────────┘")
    while True:
        email = input("  E-mail: ").strip()
        senha = getpass.getpass("  Senha (não aparece ao digitar): ")
        try:
            await sb.entrar(email, senha)
            say(f"Conectado como {email}. Login salvo para as próximas vezes.")
            return
        except ErroSupabase as e:
            print(f"  ✖ Não foi possível entrar: {e}\n")


# ---------------------------------------------------------------- sinal de vida
async def sinal_de_vida(sb: Supa, estado: dict):
    while True:
        try:
            await sb.rpc("prospecta_sinal_robo", {
                "p_id": ROBO_ID, "p_tipo": MODO, "p_host": HOST, "p_versao": VERSAO,
                "p_info": {"so": platform.platform(), "ocupado": estado.get("ocupado", False),
                           "busca": estado.get("busca")},
            })
        except Exception as e:  # não derruba o robô por falha de rede
            say(f"Aviso: sinal de vida falhou ({e})")
        await asyncio.sleep(20)


# ---------------------------------------------------------------- execução de uma busca
async def processar(sb: Supa, busca: dict, estado: dict):
    bid = busca["id"]
    op = busca.get("opcoes") or {}
    estado.update(ocupado=True, busca=bid)
    titulo(f"Prospecta Robô - buscando: {busca['termo']}")
    say(f"▶ Nova busca: “{busca['termo']}”" + (f" em {busca['local']}" if busca.get("local") else " (área do mapa)"))

    logs: list[dict] = []
    cont = {"encontrados": 0, "processados": 0, "descartados": 0, "salvos": 0, "fase": "iniciando"}
    cancelado = {"v": False}
    buffer: list[dict] = []
    ultimo_envio = {"t": 0.0}
    lock = asyncio.Lock()
    tarefas: set = set()

    def em_segundo_plano(coro):
        t = asyncio.get_running_loop().create_task(coro)
        tarefas.add(t)
        t.add_done_callback(tarefas.discard)

    def log(msg: str, nivel: str = "info"):
        logs.append({"t": agora(), "msg": msg, "nivel": nivel})
        say(("  ! " if nivel in ("aviso", "erro") else "  ") + msg)

    async def progresso(campos: dict | None = None):
        envio = logs[:]
        logs.clear()
        try:
            r = await sb.rpc("prospecta_progresso", {"p_busca": bid, "p_campos": {**cont, **(campos or {})}, "p_logs": envio})
            if r and r.get("cancelar"):
                cancelado["v"] = True
        except ErroSupabase as e:
            say(f"  ! progresso: {e}")

    async def enviar():
        async with lock:
            if not buffer:
                return
            lote = buffer[:]
            buffer.clear()
            r = await sb.rpc("prospecta_salvar_leads", {"p_busca": bid, "p_leads": lote})
            cont["salvos"] += (r or {}).get("salvos", 0)
            ultimo_envio["t"] = time.time()
            await progresso()

    def ao_fase(f: str):
        nomes = {"coletando": "Coletando empresas na lista do mapa…", "extraindo": "Extraindo dados de cada empresa…"}
        log(nomes.get(f, f))
        cont["fase"] = f
        em_segundo_plano(progresso())

    ultimo_encontrar = {"t": 0.0}

    def ao_encontrar(n: int):
        cont["encontrados"] = n
        if time.time() - ultimo_encontrar["t"] > 3:
            ultimo_encontrar["t"] = time.time()
            em_segundo_plano(progresso())

    estrito = op.get("filtro_estrito") and busca.get("modo") == "local" and busca.get("local")

    async def ao_lead(lead: dict):
        cont["processados"] += 1
        if estrito and not local_corresponde(busca["local"], lead):
            cont["descartados"] += 1
            log(f"Ignorado (fora de '{busca['local']}'): {lead['nome']}", "aviso")
            return
        lead["celular"] = bool(lead.get("celular"))
        lead.pop("score", None)
        buffer.append(lead)
        if len(buffer) >= 5 or time.time() - ultimo_envio["t"] > 4:
            await enviar()

    def ao_erro_item(msg: str):
        log(msg, "aviso")

    await progresso()
    status, erro = "concluida", None
    try:
        scraper = GoogleMapsScraper(
            headless=op.get("headless", True) if MODO == "desktop" else True,
            concorrencia=int(op.get("concorrencia") or 3),
            log=log,
        )
        await scraper.executar(
            termo=busca["termo"], local=busca.get("local") or "", modo=busca.get("modo") or "local",
            lat=busca.get("latitude"), lng=busca.get("longitude"), zoom=busca.get("zoom"),
            bounds=busca.get("bounds"), grade=int(busca.get("grade") or 1),
            limite=int(busca.get("max_resultados") or 60), enriquecer=bool(op.get("enriquecer")),
            deve_parar=lambda: cancelado["v"], ao_fase=ao_fase, ao_encontrar=ao_encontrar,
            ao_lead=ao_lead, ao_erro_item=ao_erro_item,
        )
        await enviar()
        if cancelado["v"]:
            status = "cancelada"
            log(f"Busca interrompida: {cont['salvos']} empresas salvas.", "aviso")
        else:
            log(f"Concluído: {cont['salvos']} empresas salvas.", "sucesso")
    except Exception as e:
        traceback.print_exc()
        status, erro = "erro", str(e)
        log(f"Erro: {e}", "erro")
        try:
            await enviar()
        except Exception:
            pass
    if tarefas:  # garante que nenhum envio atrasado sobrescreva o status final
        await asyncio.gather(*list(tarefas), return_exceptions=True)
    fase = {"concluida": "concluido", "cancelada": "cancelado"}.get(status, "erro")
    await progresso({"status": status, "fase": fase, **({"erro": erro} if erro else {})})
    estado.update(ocupado=False, busca=None)
    titulo("Prospecta Robô - aguardando buscas")


# ---------------------------------------------------------------- laço principal
async def principal():
    print(f"\n  PROSPECTA · Robô de captura v{VERSAO}  ({'nuvem' if MODO == 'nuvem' else 'PC'})\n")
    titulo("Prospecta Robô")
    sb = Supa(SUPABASE_URL, SUPABASE_ANON_KEY, SERVICE_KEY)
    await autenticar(sb)
    estado: dict = {"ocupado": False}
    asyncio.get_running_loop().create_task(sinal_de_vida(sb, estado))
    say(f"Aguardando buscas com fonte '{MODO}'. Crie uma busca no site e escolha "
        f"“{'Robô na nuvem' if MODO == 'nuvem' else 'Robô no meu PC'}”. (Ctrl+C para sair)")
    titulo("Prospecta Robô - aguardando buscas")
    while True:
        try:
            pegas = await sb.rpc("prospecta_pegar_busca", {"p_fonte": MODO, "p_robo": ROBO_ID})
            if pegas:
                await processar(sb, pegas[0], estado)
                continue
        except ErroSupabase as e:
            say(f"Aviso: {e}")
            if "JWT" in str(e) or "autenticado" in str(e):
                await autenticar(sb)
        except Exception as e:
            traceback.print_exc()
            say(f"Erro inesperado: {e}")
        await asyncio.sleep(INTERVALO_FILA)


def main():
    if sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())
    if "--sair" in sys.argv:
        Supa(SUPABASE_URL, SUPABASE_ANON_KEY).sair()
        print("Login removido deste computador.")
        return
    try:
        asyncio.run(principal())
    except KeyboardInterrupt:
        print("\nRobô encerrado.")
    except Exception:
        traceback.print_exc()
        if eh_exe():
            input("\nOcorreu um erro. Pressione Enter para fechar…")


if __name__ == "__main__":
    main()
