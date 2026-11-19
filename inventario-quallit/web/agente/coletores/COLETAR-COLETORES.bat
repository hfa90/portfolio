@echo off
setlocal EnableExtensions DisableDelayedExpansion
chcp 65001 >nul
title Inventario Quallit - coletores Android

rem  Le pelo cabo USB (ADB) os coletores Android conectados e grava coletores-quallit.xlsx
rem  na mesma pasta. Nao instala nada no coletor. Precisa da "Depuracao USB" ativada nele.

set "IQ_PS1=%~dp0coletar-coletores.ps1"

echo =============================================================
echo   INVENTARIO QUALLIT - COLETORES DE DADOS (ANDROID)
echo =============================================================
echo   Planilha: "%~dp0coletores-quallit.xlsx"

if not exist "%IQ_PS1%" (
  echo.
  echo ERRO: o arquivo coletar-coletores.ps1 nao foi encontrado.
  echo Mantenha o COLETAR-COLETORES.bat e o coletar-coletores.ps1 na mesma pasta.
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
