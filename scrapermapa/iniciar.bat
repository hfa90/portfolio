@echo off
chcp 65001 >nul
cd /d "%~dp0"
if not exist .venv\Scripts\python.exe ( echo  Execute instalar.bat primeiro. & pause & exit /b 1 )
.venv\Scripts\python.exe run.py
pause
