@echo off
chcp 65001 >nul
cd /d "%~dp0"
if not exist ".venv\Scripts\python.exe" call iniciar.bat
".venv\Scripts\python.exe" -m pip install pyinstaller
".venv\Scripts\pyinstaller.exe" --noconfirm --windowed --name "RHMatch" --collect-all customtkinter main.py
echo.
echo Executavel gerado em dist\RHMatch\RHMatch.exe
pause
