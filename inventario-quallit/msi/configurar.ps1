#Requires -Version 5.1
<#
  INVENTARIO QUALLIT - configuracao feita pelo pacote MSI (roda como SYSTEM durante a instalacao)
  Recebe as propriedades do msiexec, grava o config.json, registra o botao da pagina e a tarefa agendada.

  msiexec /i InventarioQuallit.msi /qn TOKEN=<token do agente> [ATIVO=PAT123] [SETOR=Expedicao]
          [LOCALIZACAO=...] [RESPONSAVEL=...] [PROXY=http://proxy:8080]

  Sem TOKEN numa atualizacao/reparo, mantem o config.json que ja existe.
#>
param(
  [string]$Token, [string]$Ativo, [string]$Setor, [string]$Localizacao, [string]$Responsavel, [string]$Proxy,
  [string]$Url = '__SUPABASE_URL__', [string]$AnonKey = '__ANON_KEY__'
)
$ErrorActionPreference = 'Stop'
$pasta = $PSScriptRoot
$log = Join-Path $pasta 'instalacao.log'
function Log([string]$m) { try { Add-Content -Path $log -Value ('{0}  {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $m) -Encoding UTF8 } catch {} }

try {
  $cfgPath = Join-Path $pasta 'config.json'
  $atual = $null
  if (Test-Path $cfgPath) { try { $atual = Get-Content $cfgPath -Raw -Encoding UTF8 | ConvertFrom-Json } catch {} }
  $Token = "$Token".Trim()
  if (-not $Token -and -not ($atual -and $atual.agente_token)) {
    Log 'ERRO: informe TOKEN=<token do agente> no msiexec'
    exit 1603
  }
  if ($Token -and $Token -notmatch '^[A-Za-z0-9]{16,128}$') { Log 'ERRO: TOKEN com formato invalido'; exit 1603 }

  function Valor($novo, $campo) { $n = "$novo".Trim(); if ($n) { $n } elseif ($atual -and $atual.$campo) { [string]$atual.$campo } else { '' } }
  $config = [ordered]@{
    supabase_url      = $Url
    supabase_anon_key = $AnonKey
    agente_token      = (Valor $Token 'agente_token')
    proxy             = (Valor $Proxy 'proxy')
    ativo             = (Valor $Ativo 'ativo')
    setor             = (Valor $Setor 'setor')
    localizacao       = (Valor $Localizacao 'localizacao')
    responsavel       = (Valor $Responsavel 'responsavel')
  }
  [IO.File]::WriteAllText($cfgPath, ($config | ConvertTo-Json), (New-Object Text.UTF8Encoding $false))
  # o token so precisa ser lido pelo SYSTEM e pelos administradores
  & icacls.exe $cfgPath /inheritance:r /grant:r '*S-1-5-18:F' '*S-1-5-32-544:F' | Out-Null
  Log 'config.json gravado'

  $ps = Join-Path $pasta 'coletor.ps1'
  $psExe = Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe'

  # botao "Executar coleta agora" da pagina: dispara a tarefa InventarioQuallit-Coletar (roda como SYSTEM)
  $raiz = 'HKLM:\SOFTWARE\Classes\inventario-quallit'
  New-Item -Path ($raiz + '\shell\open\command') -Force | Out-Null
  Set-ItemProperty -Path $raiz -Name '(default)' -Value 'URL:Inventario Quallit'
  Set-ItemProperty -Path $raiz -Name 'URL Protocol' -Value ''
  Set-ItemProperty -Path ($raiz + '\shell\open\command') -Name '(default)' -Value ('"' + $env:WINDIR + '\System32\schtasks.exe" /Run /TN InventarioQuallit-Coletar')

  $acao = New-ScheduledTaskAction -Execute $psExe -Argument ('-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "' + $ps + '"')
  $gat = @(
    $(New-ScheduledTaskTrigger -AtStartup),
    $(New-ScheduledTaskTrigger -AtLogOn),
    $(New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(2) -RepetitionInterval (New-TimeSpan -Minutes 5))
  )
  $gat[0].Delay = 'PT2M'; $gat[1].Delay = 'PT1M'
  $pr = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
  $cfgT = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
            -ExecutionTimeLimit (New-TimeSpan -Minutes 10) -MultipleInstances IgnoreNew
  Register-ScheduledTask -TaskName 'InventarioQuallit' -Action $acao -Trigger $gat -Principal $pr -Settings $cfgT `
    -Description 'Inventario Quallit - agente coletor de hardware (TI)' -Force | Out-Null
  Log 'tarefa agendada registrada (SYSTEM, 5 min)'

  # tarefa sem horario, so para a coleta completa pedida pelo botao da pagina
  $acaoJa = New-ScheduledTaskAction -Execute $psExe -Argument ('-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "' + $ps + '" -Coletar')
  Register-ScheduledTask -TaskName 'InventarioQuallit-Coletar' -Action $acaoJa -Principal $pr -Settings $cfgT `
    -Description 'Inventario Quallit - coleta pedida pelo botao da pagina' -Force | Out-Null
  # usuarios autenticados podem apenas EXECUTAR essa tarefa (nao alterar)
  try {
    $svc = New-Object -ComObject 'Schedule.Service'; $svc.Connect()
    $t = $svc.GetFolder('\').GetTask('InventarioQuallit-Coletar')
    $sd = $t.GetSecurityDescriptor(4)
    if ($sd -notmatch '\(A;;GRGX;;;AU\)') { $t.SetSecurityDescriptor($sd + '(A;;GRGX;;;AU)', 0) }
  } catch { Log ('aviso: permissao de execucao para usuarios nao aplicada: ' + $_.Exception.Message) }

  # primeira coleta em segundo plano (nao segura a instalacao)
  try { Start-ScheduledTask -TaskName 'InventarioQuallit' } catch {}
  Log 'instalacao concluida'
  exit 0
} catch {
  Log ('ERRO: ' + $_.Exception.Message)
  exit 1603
}
