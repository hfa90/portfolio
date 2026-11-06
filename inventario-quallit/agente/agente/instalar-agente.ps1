#Requires -Version 5.1
#Requires -RunAsAdministrator
<#
  Instala o agente na maquina:
   - copia para C:\ProgramData\InventarioQuallit
   - grava o patrimonio (opcional) no registro
   - cria a tarefa agendada "InventarioQuallit" (SYSTEM): ao ligar, no logon e a cada 1 hora
   - executa a primeira coleta

  Uso:  powershell -ExecutionPolicy Bypass -File instalar-agente.ps1 [-Ativo PAT123]
#>
param([string]$Ativo)

$ErrorActionPreference = 'Stop'
$Destino = 'C:\ProgramData\InventarioQuallit'
$Tarefa  = 'InventarioQuallit'

New-Item -ItemType Directory -Path $Destino -Force | Out-Null
Copy-Item (Join-Path $PSScriptRoot 'coletor.ps1') $Destino -Force
Copy-Item (Join-Path $PSScriptRoot 'config.json') $Destino -Force

# so administradores e SYSTEM leem a pasta (o token fica protegido)
& icacls $Destino /inheritance:r /grant:r '*S-1-5-18:(OI)(CI)F' '*S-1-5-32-544:(OI)(CI)F' | Out-Null

if ($Ativo) {
  New-Item -Path 'HKLM:\SOFTWARE\InventarioQuallit' -Force | Out-Null
  Set-ItemProperty -Path 'HKLM:\SOFTWARE\InventarioQuallit' -Name Ativo -Value $Ativo.Trim()
  Write-Host "Patrimonio gravado: $Ativo"
}

$acao = New-ScheduledTaskAction -Execute 'powershell.exe' `
  -Argument "-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$Destino\coletor.ps1`""

$tBoot = New-ScheduledTaskTrigger -AtStartup
$tBoot.Delay = 'PT2M'
$tLogon = New-ScheduledTaskTrigger -AtLogOn
$tLogon.Delay = 'PT1M'
$tHora = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(5) -RepetitionInterval (New-TimeSpan -Hours 1)

$principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
$config = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
  -ExecutionTimeLimit (New-TimeSpan -Minutes 10) -MultipleInstances IgnoreNew

Register-ScheduledTask -TaskName $Tarefa -Action $acao -Trigger @($tBoot, $tLogon, $tHora) `
  -Principal $principal -Settings $config -Description 'Inventario Quallit - coleta de hardware' -Force | Out-Null

Write-Host 'Tarefa agendada criada. Executando primeira coleta...'
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$Destino\coletor.ps1"
if ($LASTEXITCODE -eq 0) { Write-Host 'Pronto! A maquina ja aparece no painel.' -ForegroundColor Green }
else { Write-Host "A coleta falhou (codigo $LASTEXITCODE). Veja $Destino\coletor.log" -ForegroundColor Yellow }
