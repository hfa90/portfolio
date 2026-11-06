#__INSTALADOR__
# Inventario Quallit - instalador gerado pela pagina instalar.html
# (este bloco e executado pelo .cmd baixado; o coletor e a configuracao foram embutidos pela pagina)
$ErrorActionPreference = 'Stop'
try { $Host.UI.RawUI.WindowTitle = 'Inventario Quallit - Instalacao' } catch {}
function Linha([string]$t, [string]$c = 'Gray') { Write-Host ('  ' + $t) -ForegroundColor $c }

$coletorB64 = @'
__COLETOR_B64__
'@
$configB64 = '__CONFIG_B64__'

try {
  Write-Host ''
  Linha 'INVENTARIO QUALLIT' Cyan
  Linha 'Registrando este computador no inventario de TI...'
  Write-Host ''

  $admin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
             [Security.Principal.WindowsBuiltInRole]::Administrator)

  # Administrador: C:\InventarioQuallit (protegida). Usuario comum: pasta do proprio usuario no C:
  $destino = if ($admin) { 'C:\InventarioQuallit' } else { Join-Path $env:LOCALAPPDATA 'InventarioQuallit' }
  New-Item -ItemType Directory -Path $destino -Force | Out-Null
  if ($admin) {
    & icacls.exe $destino /inheritance:r /grant:r '*S-1-5-18:(OI)(CI)F' '*S-1-5-32-544:(OI)(CI)F' '*S-1-5-32-545:(OI)(CI)RX' | Out-Null
  }
  $ps  = Join-Path $destino 'coletor.ps1'
  $vbs = Join-Path $destino 'executar-oculto.vbs'
  [IO.File]::WriteAllBytes($ps, [Convert]::FromBase64String(($coletorB64 -replace '\s', '')))
  [IO.File]::WriteAllBytes((Join-Path $destino 'config.json'), [Convert]::FromBase64String($configB64))
  $cmdOculto = 'powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $ps + '"'
  Set-Content -Path $vbs -Encoding ASCII -Value ('CreateObject("WScript.Shell").Run "' + $cmdOculto.Replace('"', '""') + '", 0, False')
  Linha ('[1/4] Arquivos copiados para ' + $destino) Green

  # Botao "Executar coleta agora" da pagina (link inventario-quallit://)
  $raiz = if ($admin) { 'HKLM:\SOFTWARE\Classes\inventario-quallit' } else { 'HKCU:\Software\Classes\inventario-quallit' }
  New-Item -Path ($raiz + '\shell\open\command') -Force | Out-Null
  Set-ItemProperty -Path $raiz -Name '(default)' -Value 'URL:Inventario Quallit'
  Set-ItemProperty -Path $raiz -Name 'URL Protocol' -Value ''
  Set-ItemProperty -Path ($raiz + '\shell\open\command') -Name '(default)' `
    -Value ('powershell.exe -NoProfile -ExecutionPolicy Bypass -File "' + $ps + '" -Pausa')
  Linha '[2/4] Botao "Executar" da pagina ativado' Green

  # Coleta automatica
  $tarefa = 'InventarioQuallit'
  $wscript = Join-Path $env:WINDIR 'System32\wscript.exe'
  try {
    if ($admin) {
      $acao = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument ('-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "' + $ps + '"')
      $t1 = New-ScheduledTaskTrigger -AtStartup; $t1.Delay = 'PT2M'
      $t2 = New-ScheduledTaskTrigger -AtLogOn;   $t2.Delay = 'PT1M'
      $t3 = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(5) -RepetitionInterval (New-TimeSpan -Hours 1)
      $pr = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
    } else {
      if (Test-Path $wscript) {
        $acao = New-ScheduledTaskAction -Execute $wscript -Argument ('"' + $vbs + '"')
        $run  = '"' + $wscript + '" "' + $vbs + '"'
      } else {
        $acao = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument ('-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "' + $ps + '"')
        $run  = $cmdOculto
      }
      # ao entrar no Windows (nao precisa de administrador)
      Set-ItemProperty -Path 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run' -Name 'InventarioQuallit' -Value $run
      $t1 = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(5) -RepetitionInterval (New-TimeSpan -Hours 1)
      $t2 = $null; $t3 = $null
      $pr = New-ScheduledTaskPrincipal -UserId ([Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive -RunLevel Limited
    }
    $cfgT = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
              -ExecutionTimeLimit (New-TimeSpan -Minutes 10) -MultipleInstances IgnoreNew
    $gatilhos = @($t1, $t2, $t3) | Where-Object { $_ }
    Register-ScheduledTask -TaskName $tarefa -Action $acao -Trigger $gatilhos -Principal $pr -Settings $cfgT `
      -Description 'Inventario Quallit - coleta de hardware' -Force | Out-Null
    if ($admin) { Linha '[3/4] Coleta automatica: ao ligar, ao entrar e a cada 1 hora' Green }
    else        { Linha '[3/4] Coleta automatica: ao entrar no Windows e a cada 1 hora' Green }
  } catch {
    Linha ('[3/4] Aviso: agendamento de hora em hora nao foi criado (' + $_.Exception.Message + ')') Yellow
    if (-not $admin) { Linha '      A coleta continua acontecendo sempre que entrar no Windows.' Yellow }
  }

  Linha '[4/4] Enviando os dados deste computador...' Cyan
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $ps | Out-Null
  if ($LASTEXITCODE -ne 0) { throw ('a coleta falhou (codigo ' + $LASTEXITCODE + '). Detalhes em ' + $destino + '\coletor.log') }

  Write-Host ''
  Linha 'PRONTO! Computador registrado no inventario.' Green
  Linha 'Volte para a pagina no navegador: ela ja mostra os dados deste computador.' White
  Linha 'Esta janela fecha sozinha.' DarkGray
  Start-Sleep -Seconds 8
  exit 0
} catch {
  Write-Host ''
  Linha ('ERRO: ' + $_.Exception.Message) Red
  Linha 'Tire um print desta tela e envie para o tecnico de TI.' Yellow
  Read-Host '  Pressione Enter para fechar' | Out-Null
  exit 1
}
