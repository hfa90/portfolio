"""Configurações globais do RH+ Match."""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path

APP_NAME = "RH+ Match"
APP_VERSION = "1.0.0"

if getattr(sys, "frozen", False):          # executável gerado pelo PyInstaller
    BASE_DIR = Path(sys.executable).resolve().parent
else:
    BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "dados"
EXPORT_DIR = BASE_DIR / "exportacoes"
DB_PATH = DATA_DIR / "rhmais.db"
SETTINGS_PATH = DATA_DIR / "configuracoes.json"

DATA_DIR.mkdir(exist_ok=True)
EXPORT_DIR.mkdir(exist_ok=True)

USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/130.0 Safari/537.36"
)

DEFAULT_SETTINGS: dict = {
    "aparencia": "light",            # light | dark | system
    "timeout": 20,                    # segundos por requisição
    "paginas_por_fonte": 2,           # páginas lidas em cada portal
    "score_minimo_padrao": 40,
    "fontes_ativas": [
        "gupy", "vagas_com", "infojobs", "programathor",
        "github_br", "remotive", "himalayas", "adzuna", "jooble",
    ],
    "adzuna_app_id": "",
    "adzuna_app_key": "",
    "jooble_key": "",
    "github_token": "",
    "empresa_nome": "Minha Consultoria de RH",
}


def load_settings() -> dict:
    data = dict(DEFAULT_SETTINGS)
    if SETTINGS_PATH.exists():
        try:
            data.update(json.loads(SETTINGS_PATH.read_text(encoding="utf-8")))
        except (OSError, json.JSONDecodeError):
            pass
    # variáveis de ambiente têm prioridade (útil em servidores)
    for key in ("adzuna_app_id", "adzuna_app_key", "jooble_key", "github_token"):
        env = os.environ.get("RHMAIS_" + key.upper())
        if env:
            data[key] = env
    return data


def save_settings(data: dict) -> None:
    SETTINGS_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


SETTINGS = load_settings()
