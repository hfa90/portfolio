"""Inicia o Prospecta: python run.py  (abre http://127.0.0.1:8000 no navegador)."""
import sys
import threading
import webbrowser

import uvicorn

HOST, PORTA = "127.0.0.1", 8000

if __name__ == "__main__":
    if sys.platform == "win32":
        import asyncio
        # Playwright precisa de subprocessos -> Proactor no Windows
        asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())
    if "--sem-navegador" not in sys.argv:
        threading.Timer(1.5, lambda: webbrowser.open(f"http://{HOST}:{PORTA}")).start()
    print(f"\n  Prospecta rodando em http://{HOST}:{PORTA}  (Ctrl+C para encerrar)\n")
    uvicorn.run("app.main:app", host=HOST, port=PORTA, log_level="warning")
