@echo off
chcp 65001 >nul
title RH+ Match
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
    ".venv\Scripts\python.exe" -m pip install -r requirements.txt
)

start "" ".venv\Scripts\pythonw.exe" main.py
