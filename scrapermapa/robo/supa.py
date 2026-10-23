"""Cliente mínimo do Supabase (Auth + RPC) usando httpx — sem dependências extras."""
from __future__ import annotations

import json
import os
import sys
import time
from pathlib import Path

import httpx


def pasta_dados() -> Path:
    base = os.environ.get("APPDATA") or str(Path.home())
    p = Path(base) / "Prospecta"
    p.mkdir(parents=True, exist_ok=True)
    return p


class ErroSupabase(Exception):
    pass


class Supa:
    def __init__(self, url: str, anon_key: str, service_key: str | None = None):
        self.url = url.rstrip("/")
        self.anon = anon_key
        self.service = service_key
        self.sessao: dict | None = None
        self.http = httpx.AsyncClient(timeout=30)
        self.arquivo_sessao = pasta_dados() / "sessao.json"

    # ------------------------------------------------------------- auth
    @property
    def usuario(self) -> dict | None:
        return (self.sessao or {}).get("user")

    def _salvar_sessao(self):
        try:
            self.arquivo_sessao.write_text(json.dumps(self.sessao), encoding="utf-8")
        except OSError:
            pass

    def carregar_sessao(self) -> bool:
        try:
            self.sessao = json.loads(self.arquivo_sessao.read_text(encoding="utf-8"))
            return bool(self.sessao.get("refresh_token"))
        except (OSError, ValueError):
            return False

    def sair(self):
        self.sessao = None
        try:
            self.arquivo_sessao.unlink()
        except OSError:
            pass

    async def _token(self, corpo: dict, tipo: str):
        r = await self.http.post(f"{self.url}/auth/v1/token?grant_type={tipo}",
                                 headers={"apikey": self.anon, "Content-Type": "application/json"}, json=corpo)
        if r.status_code >= 400:
            try:
                msg = r.json().get("error_description") or r.json().get("msg") or r.text
            except ValueError:
                msg = r.text
            raise ErroSupabase(msg)
        d = r.json()
        d["expires_at"] = int(time.time()) + int(d.get("expires_in", 3600))
        self.sessao = d
        self._salvar_sessao()

    async def entrar(self, email: str, senha: str):
        await self._token({"email": email, "password": senha}, "password")

    async def renovar(self):
        await self._token({"refresh_token": self.sessao["refresh_token"]}, "refresh_token")

    async def _headers(self) -> dict:
        if self.service:
            return {"apikey": self.service, "Authorization": f"Bearer {self.service}"}
        if not self.sessao:
            raise ErroSupabase("Não autenticado")
        if self.sessao.get("expires_at", 0) - 120 < time.time():
            await self.renovar()
        return {"apikey": self.anon, "Authorization": f"Bearer {self.sessao['access_token']}"}

    # ------------------------------------------------------------- rpc
    async def rpc(self, nome: str, params: dict | None = None, tentativas: int = 3):
        ultimo = None
        for i in range(tentativas):
            try:
                h = await self._headers()
                r = await self.http.post(f"{self.url}/rest/v1/rpc/{nome}", headers={**h, "Content-Type": "application/json"},
                                         json=params or {})
                if r.status_code == 401 and not self.service and i == 0:
                    await self.renovar()
                    continue
                if r.status_code >= 400:
                    try:
                        msg = r.json().get("message") or r.text
                    except ValueError:
                        msg = r.text
                    raise ErroSupabase(f"{nome}: {msg}")
                return r.json() if r.content else None
            except httpx.HTTPError as e:  # rede instável: tenta de novo
                ultimo = e
                await _dormir(2 * (i + 1))
        raise ErroSupabase(f"{nome}: falha de rede ({ultimo})")

    async def fechar(self):
        await self.http.aclose()


async def _dormir(s: float):
    import asyncio
    await asyncio.sleep(s)


def eh_exe() -> bool:
    return bool(getattr(sys, "frozen", False))
