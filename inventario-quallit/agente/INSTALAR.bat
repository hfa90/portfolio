@echo off
:: Clique com o botao direito > Executar como administrador
net session >nul 2>&1
if %errorlevel% neq 0 (
  echo Execute este arquivo como ADMINISTRADOR.
  pause
  exit /b 1
)
set /p ATIVO=Numero de patrimonio desta maquina (Enter para pular):
if "%ATIVO%"=="" (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0instalar-agente.ps1"
) else (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0instalar-agente.ps1" -Ativo "%ATIVO%"
)
pause
