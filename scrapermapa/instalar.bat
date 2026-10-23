@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo.
echo  === Prospecta - instalacao ===
echo.
where python >/dev/null 2>/dev/null || (echo  Python nao encontrado. Instale em https://www.python.org/downloads/ marcando "Add python.exe to PATH". & pause & exit /b 1)
if not exist .venv ( echo  Criando ambiente virtual... & python -m venv .venv )
call .venv\Scripts\activate.bat
python -m pip install --upgrade pip
pip install -r requirements.txt || (echo  Falha ao instalar dependencias. & pause & exit /b 1)
echo  Baixando o navegador Chromium do Playwright...
python -m playwright install chromium
echo.
echo  Instalacao concluida! Agora execute iniciar.bat
pause
