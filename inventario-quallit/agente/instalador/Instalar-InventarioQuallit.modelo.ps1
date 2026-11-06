#Requires -Version 5.1
<#
  INVENTARIO QUALLIT - Instalador do agente coletor              versao __VERSAO__
  ---------------------------------------------------------------------------------
  Arquivo FIXO e legivel, publicado pela TI (pode ser assinado pela CA da empresa).
  Nao contem token nem dados de nenhum computador: a configuracao e buscada no
  servidor pelo CODIGO DE INSTALACAO, que vem no nome do arquivo baixado
  (Instalar-InventarioQuallit-ABCD234567.ps1) ou e digitado quando pedido.

  Como usar: clique com o botao direito no arquivo > "Executar com o PowerShell".

  Opcional:  -Codigo ABCD234567   informa o codigo sem depender do nome do arquivo
             -Silencioso          nao espera Enter no final (uso por ferramenta)

  O que ele faz:
    1. busca a configuracao do codigo no servidor do inventario;
    2. grava o coletor (codigo abaixo, conferido por SHA-256) e o config.json:
         administrador  -> C:\InventarioQuallit
         usuario comum  -> %LOCALAPPDATA%\InventarioQuallit
    3. registra o botao "Executar coleta agora" da pagina (inventario-quallit://);
    4. cria a tarefa agendada "InventarioQuallit"
         (SYSTEM a cada 5 min como administrador; o proprio usuario a cada 15 min);
    5. faz a primeira coleta.
  Gerado por ferramentas/empacotar.ps1 - nao edite este arquivo; edite o modelo.
#>
param(
  [string]$Codigo,
  [switch]$Silencioso
)

$ErrorActionPreference = 'Stop'
$InstaladorVersao = '__VERSAO__'
$SupabaseUrl      = '__SUPABASE_URL__'
$AnonKey          = '__ANON_KEY__'      # chave publica (anon) do Supabase; sozinha nao grava nada
$ColetorSha256    = '__COLETOR_SHA256__'
$ColetorComBom    = $__COLETOR_BOM__
try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 } catch {}
try { $Host.UI.RawUI.WindowTitle = 'Inventario Quallit - Instalacao' } catch {}

function Linha([string]$t, [string]$c = 'Gray') { Write-Host ('  ' + $t) -ForegroundColor $c }
function Fim([int]$codigo) {
  if (-not $Silencioso) {
    if ($codigo -eq 0) { Linha 'Esta janela fecha sozinha.' DarkGray; Start-Sleep -Seconds 8 }
    else { Read-Host '  Pressione Enter para fechar' | Out-Null }
  }
  exit $codigo
}

# ---------------------------------------------------------------- coletor (texto do arquivo coletor.ps1)
$coletorTexto = @'
__COLETOR_TEXTO__
'@

try {
  Write-Host ''
  Linha 'INVENTARIO QUALLIT' Cyan
  Linha 'Registrando este computador no inventario de TI...'
  Write-Host ''

  # ------------------------------------------------------------ 1. codigo de instalacao
  if (-not $Codigo -and $PSCommandPath) {
    $nome = [IO.Path]::GetFileNameWithoutExtension($PSCommandPath)
    if ($nome -match '([A-HJ-NP-Za-hj-np-z2-9]{10})\s*(\(\d+\))?$') { $Codigo = $Matches[1] }
  }
  $Codigo = ("$Codigo" -replace '[\s-]', '').ToUpper()
  while ($Codigo -notmatch '^[A-HJ-NP-Z2-9]{10}$') {
    if ($Silencioso) { throw 'codigo de instalacao nao informado (use -Codigo)' }
    if ($Codigo) { Linha 'Codigo invalido. Sao 10 letras/numeros, como ABCD234567.' Yellow }
    $Codigo = ((Read-Host '  Digite o codigo de instalacao mostrado na pagina') -replace '[\s-]', '').ToUpper()
  }
  Linha ('Codigo de instalacao: ' + $Codigo) DarkGray

  # ------------------------------------------------------------ 2. configuracao
  try {
    $remota = Invoke-RestMethod -Uri ($SupabaseUrl.TrimEnd('/') + '/rest/v1/rpc/obter_instalacao') -Method Post `
      -Headers @{ apikey = $AnonKey; Authorization = "Bearer $AnonKey" } -ContentType 'application/json' `
      -Body (@{ p_codigo = $Codigo } | ConvertTo-Json -Compress) -TimeoutSec 30 -UseBasicParsing
  } catch {
    if ($_.ErrorDetails.Message -match 'expirado|nao encontrado') { throw 'codigo nao encontrado ou expirado. Abra o link de instalacao de novo e baixe o arquivo outra vez.' }
    throw ('nao foi possivel falar com o servidor do inventario: ' + $_.Exception.Message)
  }
  if (-not $remota.agente_token) { throw 'o servidor nao devolveu a configuracao deste codigo.' }
  $config = [ordered]@{
    supabase_url      = $SupabaseUrl
    supabase_anon_key = $AnonKey
    agente_token      = [string]$remota.agente_token
    proxy             = [string]$remota.proxy
    ativo             = [string]$remota.ativo
    setor             = [string]$remota.setor
    localizacao       = [string]$remota.localizacao
    responsavel       = [string]$remota.responsavel
    codigo_instalacao = [string]$remota.codigo_instalacao
  }
  Linha '[1/5] Configuracao recebida do servidor' Green

  # ------------------------------------------------------------ 3. arquivos
  $admin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
             [Security.Principal.WindowsBuiltInRole]::Administrator)
  $destino = if ($admin) { 'C:\InventarioQuallit' } else { Join-Path $env:LOCALAPPDATA 'InventarioQuallit' }
  New-Item -ItemType Directory -Path $destino -Force | Out-Null
  if ($admin) {
    & icacls.exe $destino /inheritance:r /grant:r '*S-1-5-18:(OI)(CI)F' '*S-1-5-32-544:(OI)(CI)F' '*S-1-5-32-545:(OI)(CI)RX' | Out-Null
  }
  $txt = ($coletorTexto -replace "`r?`n", "`r`n") + "`r`n"
  $bytes = [Text.Encoding]::UTF8.GetBytes($txt)
  $hash = -join ([Security.Cryptography.SHA256]::Create().ComputeHash($bytes) | ForEach-Object { $_.ToString('x2') })
  if ($hash -ne $ColetorSha256) { throw 'o coletor dentro do instalador esta corrompido (hash nao confere). Baixe o instalador de novo.' }
  if ($ColetorComBom) { $bytes = [byte[]](0xEF, 0xBB, 0xBF) + $bytes }
  $ps = Join-Path $destino 'coletor.ps1'
  [IO.File]::WriteAllBytes($ps, $bytes)
  [IO.File]::WriteAllText((Join-Path $destino 'config.json'), ($config | ConvertTo-Json), (New-Object Text.UTF8Encoding $false))
  # restos de instalacoes antigas (.cmd): lancador .vbs e entrada de inicializacao
  Remove-Item (Join-Path $destino 'executar-oculto.vbs') -Force -ErrorAction SilentlyContinue
  Remove-ItemProperty -Path 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run' -Name 'InventarioQuallit' -ErrorAction SilentlyContinue
  Linha ('[2/5] Agente gravado em ' + $destino) Green

  # ------------------------------------------------------------ 4. botao "Executar coleta agora" da pagina
  $psExe = Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe'
  $raiz = if ($admin) { 'HKLM:\SOFTWARE\Classes\inventario-quallit' } else { 'HKCU:\Software\Classes\inventario-quallit' }
  New-Item -Path ($raiz + '\shell\open\command') -Force | Out-Null
  Set-ItemProperty -Path $raiz -Name '(default)' -Value 'URL:Inventario Quallit'
  Set-ItemProperty -Path $raiz -Name 'URL Protocol' -Value ''
  Set-ItemProperty -Path ($raiz + '\shell\open\command') -Name '(default)' `
    -Value ('"' + $psExe + '" -NoProfile -ExecutionPolicy Bypass -File "' + $ps + '" -Pausa')
  Linha '[3/5] Botao "Executar coleta agora" da pagina ativado' Green

  # ------------------------------------------------------------ 5. tarefa agendada
  $argumentos = '-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "' + $ps + '"'
  $acao = New-ScheduledTaskAction -Execute $psExe -Argument $argumentos
  $cfgT = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
            -ExecutionTimeLimit (New-TimeSpan -Minutes 10) -MultipleInstances IgnoreNew
  try {
    if ($admin) {
      $gat = @(
        $(New-ScheduledTaskTrigger -AtStartup),
        $(New-ScheduledTaskTrigger -AtLogOn),
        $(New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(5) -RepetitionInterval (New-TimeSpan -Minutes 5))
      )
      $gat[0].Delay = 'PT2M'; $gat[1].Delay = 'PT1M'
      $pr = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
      Register-ScheduledTask -TaskName 'InventarioQuallit' -Action $acao -Trigger $gat -Principal $pr -Settings $cfgT `
        -Description 'Inventario Quallit - agente coletor de hardware (TI)' -Force | Out-Null
      Linha '[4/5] Tarefa agendada: sinal a cada 5 min e coleta completa a cada 1 hora' Green
    } else {
      $eu = [Security.Principal.WindowsIdentity]::GetCurrent().Name
      $pr = New-ScheduledTaskPrincipal -UserId $eu -LogonType Interactive -RunLevel Limited
      $rep = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(5) -RepetitionInterval (New-TimeSpan -Minutes 15)
      try {
        $logon = New-ScheduledTaskTrigger -AtLogOn -User $eu; $logon.Delay = 'PT1M'
        Register-ScheduledTask -TaskName 'InventarioQuallit' -Action $acao -Trigger @($logon, $rep) -Principal $pr -Settings $cfgT `
          -Description 'Inventario Quallit - agente coletor de hardware (TI)' -Force | Out-Null
      } catch {
        Register-ScheduledTask -TaskName 'InventarioQuallit' -Action $acao -Trigger $rep -Principal $pr -Settings $cfgT `
          -Description 'Inventario Quallit - agente coletor de hardware (TI)' -Force | Out-Null
      }
      Linha '[4/5] Tarefa agendada: sinal a cada 15 min e coleta completa a cada 1 hora' Green
    }
  } catch {
    Linha ('[4/5] Aviso: a tarefa agendada nao foi criada (' + $_.Exception.Message + ')') Yellow
    Linha '      Peca para a TI instalar como administrador (ou pelo pacote MSI).' Yellow
  }

  Linha '[5/5] Enviando os dados deste computador...' Cyan
  & $psExe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $ps -Coletar | Out-Null
  if ($LASTEXITCODE -eq 5) { Linha 'Sem internet agora: a coleta ficou guardada e sera enviada quando a conexao voltar.' Yellow }
  elseif ($LASTEXITCODE -ne 0) { throw ('a coleta falhou (codigo ' + $LASTEXITCODE + '). Detalhes em ' + $destino + '\coletor.log') }

  Write-Host ''
  Linha 'PRONTO! Computador registrado no inventario.' Green
  Linha 'Volte para a pagina no navegador: ela ja mostra os dados deste computador.' White
  Fim 0
} catch {
  Write-Host ''
  Linha ('ERRO: ' + $_.Exception.Message) Red
  Linha 'Tire um print desta tela e envie para o tecnico de TI.' Yellow
  Fim 1
}
