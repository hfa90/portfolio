@echo off
chcp 65001 >nul
title RH+ Match Web
cd /d "%~dp0"

where python >nul 2>nul
if errorlevel 1 (
    echo Python nao encontrado. Instale em https://www.python.org/downloads/ marcando "Add Python to PATH".
    pause
    exit /b 1
)

if not exist ".venv\Scripts\python.exe" (
    echo Criando ambiente virtual na primeira execucao...
    python -m venv .venv
    ".venv\Scripts\python.exe" -m pip install --upgrade pip >nul
)
".venv\Scripts\python.exe" -m pip install -q -r requirements.txt

rem Para acessar de outros computadores da rede, descomente:
rem set RHMAIS_HOST=0.0.0.0
rem set RHMAIS_SENHA=troque-esta-senha

start "" http://localhost:8000
".venv\Scripts\python.exe" -m web.server
