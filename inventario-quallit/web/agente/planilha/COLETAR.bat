@echo off
setlocal EnableExtensions DisableDelayedExpansion
chcp 65001 >nul
title Inventario Quallit - coleta por planilha

rem  Coleta os dados deste computador e grava em inventario-quallit.csv (mesma pasta).
rem  Nao instala nada e nao precisa de administrador nem de internet.
rem  Funciona a partir de uma pasta de rede (\\servidor\compartilhamento\...).

set "IQ_PS1=%~dp0coletar.ps1"

echo =============================================================
echo   INVENTARIO QUALLIT - COLETA POR PLANILHA
echo =============================================================
echo   Computador: %COMPUTERNAME%
echo   Planilha  : "%~dp0inventario-quallit.csv"

if not exist "%IQ_PS1%" (
  echo.
  echo ERRO: o arquivo coletar.ps1 nao foi encontrado.
  echo Mantenha o COLETAR.bat e o coletar.ps1 na mesma pasta.
  goto :erro
)

powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%IQ_PS1%" %*
if errorlevel 1 goto :erro

echo.
echo Concluido.
pause
exit /b 0

:erro
echo.
echo A operacao nao foi concluida. Confira a mensagem acima.
pause
exit /b 1
