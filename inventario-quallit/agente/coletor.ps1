#Requires -Version 5.1
<#
  INVENTARIO QUALLIT - Agente coletor 2.0
  Roda a cada 5 minutos (tarefa agendada). Em cada execucao:
    1. envia coletas que ficaram guardadas sem internet (pasta "fila");
    2. manda um SINAL leve (online + pedidos do painel);
    3. faz a COLETA COMPLETA quando: passou 1 hora, o PC reiniciou, o IP mudou,
       alguem clicou "Coletar agora" no painel ou e a primeira vez;
    4. se o painel publicou uma versao nova, atualiza este arquivo sozinho
       (confere o hash SHA-256 e a sintaxe; se a nova versao falhar, volta a anterior).

  Uso manual:
    powershell -ExecutionPolicy Bypass -File coletor.ps1              # automatico (sinal ou coleta)
    powershell -ExecutionPolicy Bypass -File coletor.ps1 -Coletar     # forca coleta completa
    powershell -ExecutionPolicy Bypass -File coletor.ps1 -SoMostrar   # so mostra o JSON, nao envia
    powershell -ExecutionPolicy Bypass -File coletor.ps1 -Ativo PAT123
    powershell -ExecutionPolicy Bypass -File coletor.ps1 -Pausa       # coleta e mostra o resultado (botao Executar)
#>
param(
  [string]$ConfigPath = (Join-Path $PSScriptRoot 'config.json'),
  [string]$Ativo,
  [switch]$SoMostrar,
  [switch]$Pausa,
  [switch]$Coletar,
  [switch]$PosAtualizacao
)

$ErrorActionPreference = 'Stop'
$AgenteVersao = '2.0.1'
$Pasta       = $PSScriptRoot
$LogPath     = Join-Path $Pasta 'coletor.log'
$EstadoPath  = Join-Path $Pasta 'estado.json'
$FilaPasta   = Join-Path $Pasta 'fila'
$FilaMax     = 10
try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 } catch {}

function Write-Log([string]$msg) {
  $linha = '{0}  {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $msg
  Write-Host $linha
  try {
    if ((Test-Path $LogPath) -and (Get-Item $LogPath).Length -gt 512KB) {
      Move-Item $LogPath ($LogPath + '.1') -Force   # guarda o log anterior (2 arquivos no maximo)
    }
    Add-Content -Path $LogPath -Value $linha -Encoding UTF8
  } catch {}
}

function Fim([int]$codigo) {
  if ($Pausa) {
    if ($codigo -eq 0) {
      Write-Host ''
      Write-Host '  PRONTO! Os dados deste computador foram enviados ao inventario.' -ForegroundColor Green
      Write-Host '  Esta janela fecha sozinha.' -ForegroundColor DarkGray
      Start-Sleep -Seconds 6
    } elseif ($codigo -eq 5) {
      Write-Host ''
      Write-Host '  Sem conexao agora. A coleta ficou guardada e sera enviada' -ForegroundColor Yellow
      Write-Host '  automaticamente quando a internet voltar.' -ForegroundColor Yellow
      Start-Sleep -Seconds 8
    } else {
      Write-Host ''
      Write-Host "  Nao foi possivel enviar (codigo $codigo). Avise o tecnico de TI." -ForegroundColor Yellow
      Read-Host '  Pressione Enter para fechar' | Out-Null
    }
  }
  exit $codigo
}

trap { Write-Log ("ERRO inesperado: {0}" -f $_); Fim 4 }

function Get-Safe([scriptblock]$sb) { try { & $sb } catch { $null } }
function Clean([object]$v) { if ($null -eq $v) { return $null }; $s = "$v".Trim(); if ($s -eq '') { $null } else { $s } }
function To-Iso($d) { if ($d) { ([datetime]$d).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ') } else { $null } }

# ------------------------------------------------------------------ estado local
function Ler-Estado {
  $e = Get-Safe { Get-Content $EstadoPath -Raw -Encoding UTF8 | ConvertFrom-Json }
  if (-not $e) { $e = [pscustomobject]@{} }
  foreach ($k in 'maquina_id','ultima_coleta','ultimo_boot','versao','ip','intervalo_min','offline','tarefa_5min','versao_recusada') {
    if (-not ($e.PSObject.Properties.Name -contains $k)) { $e | Add-Member -NotePropertyName $k -NotePropertyValue $null }
  }
  # o PowerShell 7 transforma datas do JSON em DateTime; o 5.1 deixa como texto. Padroniza em texto ISO (UTC).
  foreach ($k in 'ultima_coleta','ultimo_boot') { if ($e.$k -is [datetime]) { $e.$k = To-Iso $e.$k } }
  $e
}
function Salvar-Estado($e) {
  try {
    $tmp = $EstadoPath + '.tmp'
    [IO.File]::WriteAllText($tmp, ($e | ConvertTo-Json -Depth 4), (New-Object Text.UTF8Encoding $false))
    Move-Item $tmp $EstadoPath -Force
  } catch {}   # pasta somente-leitura (ex.: usuario comum rodando a instalacao do administrador)
}

# ------------------------------------------------------------------ comunicacao
function Invoke-Rpc([string]$nome, [hashtable]$corpo, [int]$timeout = 30) {
  $json = $corpo | ConvertTo-Json -Depth 8 -Compress
  $p = @{
    Uri = ($cfg.supabase_url.TrimEnd('/')) + '/rest/v1/rpc/' + $nome; Method = 'Post'
    Headers = @{ apikey = $cfg.supabase_anon_key; Authorization = "Bearer $($cfg.supabase_anon_key)" }
    Body = [Text.Encoding]::UTF8.GetBytes($json); ContentType = 'application/json; charset=utf-8'
    TimeoutSec = $timeout; UseBasicParsing = $true
  }
  if ($cfg.proxy) { $p.Proxy = $cfg.proxy; $p.ProxyUseDefaultCredentials = $true }
  Invoke-RestMethod @p
}
# sem resposta do servidor (sem internet, DNS, proxy, timeout) ou erro 5xx: vale guardar e tentar depois
function Erro-DeRede($err) {
  $resp = $err.Exception.Response
  if (-not $resp) { return $true }
  try { return ([int]$resp.StatusCode -ge 500) } catch { return $true }
}
function Erro-Texto($err) { ('{0} {1}' -f $err.Exception.Message, $err.ErrorDetails.Message).Trim() }

# ------------------------------------------------------------------ fila sem internet
function Guardar-NaFila($dados) {
  try {
    New-Item -ItemType Directory -Path $FilaPasta -Force | Out-Null
    $arq = Join-Path $FilaPasta ('{0}.json' -f (Get-Date -Format 'yyyyMMdd-HHmmss'))
    [IO.File]::WriteAllText($arq, ($dados | ConvertTo-Json -Depth 8 -Compress), (New-Object Text.UTF8Encoding $false))
    $todos = @(Get-ChildItem $FilaPasta -Filter '*.json' | Sort-Object Name)
    if ($todos.Count -gt $FilaMax) { $todos | Select-Object -First ($todos.Count - $FilaMax) | Remove-Item -Force }
    Write-Log ("SEM CONEXAO - coleta guardada na fila ({0} pendente(s))" -f [math]::Min($todos.Count, $FilaMax))
    return $true
  } catch { Write-Log ("Nao foi possivel guardar na fila: {0}" -f $_.Exception.Message); return $false }
}
# envia o que ficou guardado, do mais antigo para o mais novo. Retorna $false se continua sem conexao.
function Enviar-Fila {
  if (-not (Test-Path $FilaPasta)) { return $true }
  $arqs = @(Get-ChildItem $FilaPasta -Filter '*.json' | Sort-Object Name)
  foreach ($a in $arqs) {
    try {
      $d = Get-Content $a.FullName -Raw -Encoding UTF8 | ConvertFrom-Json
      $r = Invoke-Rpc 'agente_reportar' @{ p_token = $cfg.agente_token; p_dados = $d }
      Remove-Item $a.FullName -Force
      Write-Log ("FILA enviada: coleta de {0}" -f $d.coletado_em)
      if ($r.id) { $script:estado.maquina_id = $r.id }
    } catch {
      if (Erro-DeRede $_) { return $false }
      Write-Log ("FILA descartada ({0}): {1}" -f $a.Name, (Erro-Texto $_))
      Remove-Item $a.FullName -Force -ErrorAction SilentlyContinue
    }
  }
  $true
}

# ------------------------------------------------------------------ tarefa agendada a cada 5 min
function Ajustar-Tarefa {
  try {
    $t = Get-ScheduledTask -TaskName 'InventarioQuallit' -ErrorAction Stop
    # como SYSTEM nao aparece janela: 5 min. Como usuario comum a janela pode piscar: 15 min.
    $alvo = 'PT15M'
    if ($t.Principal.UserId -match '^(SYSTEM|NT AUTHORITY\\SYSTEM|S-1-5-18)$') { $alvo = 'PT5M' }
    $mudou = $false
    foreach ($tr in $t.Triggers) {
      if ($tr.Repetition -and $tr.Repetition.Interval -and $tr.Repetition.Interval -ne $alvo) {
        $tr.Repetition.Interval = $alvo; $mudou = $true
      }
    }
    if ($mudou) { Set-ScheduledTask -TaskName 'InventarioQuallit' -Trigger $t.Triggers | Out-Null; Write-Log ("Tarefa agendada ajustada para repetir a cada {0}" -f $alvo) }
    return $true
  } catch { return $false }
}

# ------------------------------------------------------------------ atualizacao automatica
function Atualizar-Agente($info) {
  if ($PosAtualizacao -or -not $info -or -not $info.versao) { return }
  if ($script:estado.versao_recusada -eq $info.versao) { return }   # ja falhou antes: espera a proxima versao
  $recusar = { param($m) Write-Log $m; $script:estado.versao_recusada = [string]$info.versao; Salvar-Estado $script:estado }
  try {
    $alvo = $PSCommandPath
    $bak  = $alvo + '.bak'
    $novo = $alvo + '.novo'
    $pac = Invoke-Rpc 'agente_baixar' @{ p_token = $cfg.agente_token } 60
    if (-not $pac -or -not $pac.script) { return }
    $bytes = [Text.Encoding]::UTF8.GetBytes([string]$pac.script)
    $sha = [Security.Cryptography.SHA256]::Create()
    $hash = -join ($sha.ComputeHash($bytes) | ForEach-Object { $_.ToString('x2') })
    if ($hash -ne $pac.sha256 -or $hash -ne $info.sha256) { & $recusar ("ATUALIZACAO recusada: hash nao confere ({0})" -f $pac.versao); return }
    $erros = $null
    [void][System.Management.Automation.Language.Parser]::ParseInput([string]$pac.script, [ref]$null, [ref]$erros)
    if ($erros -and $erros.Count) { & $recusar ("ATUALIZACAO recusada: script {0} com erro de sintaxe: {1}" -f $pac.versao, $erros[0].Message); return }
    if ([string]$pac.script -notmatch ("\`$AgenteVersao\s*=\s*'" + [regex]::Escape([string]$pac.versao) + "'")) { & $recusar 'ATUALIZACAO recusada: versao do script nao confere'; return }

    [IO.File]::WriteAllText($novo, [string]$pac.script, (New-Object Text.UTF8Encoding $true))
    # agente assinado so aceita versao nova assinada pelo MESMO certificado
    $assAtual = Get-Safe { Get-AuthenticodeSignature -FilePath $alvo }
    if ($assAtual -and $assAtual.Status -eq 'Valid') {
      $assNova = Get-Safe { Get-AuthenticodeSignature -FilePath $novo }
      if (-not $assNova -or $assNova.Status -ne 'Valid' -or $assNova.SignerCertificate.Thumbprint -ne $assAtual.SignerCertificate.Thumbprint) {
        Remove-Item $novo -Force -ErrorAction SilentlyContinue
        & $recusar ("ATUALIZACAO recusada: a versao {0} nao esta assinada pelo mesmo certificado do agente instalado" -f $pac.versao); return
      }
    }
    Copy-Item $alvo $bak -Force
    Move-Item $novo $alvo -Force
    Write-Log ("ATUALIZADO {0} -> {1}. Testando a nova versao..." -f $AgenteVersao, $pac.versao)

    # testa a nova versao; qualquer falha (nao abre, erro, codigo ruim) volta para a anterior
    $rc = 99
    try {
      $exe = 'powershell.exe'
      if ($env:WINDIR) { $w = Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe'; if (Test-Path $w) { $exe = $w } }
      & $exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $alvo -Coletar -PosAtualizacao | Out-Null
      $rc = $LASTEXITCODE
    } catch { Write-Log ("Nao consegui iniciar a nova versao: {0}" -f $_.Exception.Message) }
    if ($rc -eq 0 -or $rc -eq 5) { Write-Log ("Nova versao {0} funcionando" -f $pac.versao) }
    else {
      Copy-Item $bak $alvo -Force
      & $recusar ("Nova versao {0} falhou (codigo {1}); voltei para a {2}" -f $pac.versao, $rc, $AgenteVersao)
    }
  } catch {
    Write-Log ("ATUALIZACAO falhou: {0}" -f (Erro-Texto $_))
  }
}

# ------------------------------------------------------------------ config
if (-not (Test-Path $ConfigPath)) { Write-Log "ERRO: config.json nao encontrado em $ConfigPath"; Fim 2 }
$cfg = Get-Content $ConfigPath -Raw -Encoding UTF8 | ConvertFrom-Json
if ($Pausa) { Write-Host ''; Write-Host '  Inventario Quallit - coletando dados deste computador...' -ForegroundColor Cyan; Write-Host '' }

# uma execucao por vez (tarefa agendada x botao Executar)
$mutex = $null
if (-not $SoMostrar -and -not $PosAtualizacao) {
  try {
    $mutex = New-Object Threading.Mutex($false, 'Global\InventarioQuallitColetor')
    if (-not $mutex.WaitOne([TimeSpan]::FromSeconds($(if ($Pausa) { 90 } else { 0 })))) { exit 0 }
  } catch [Threading.AbandonedMutexException] { } catch { $mutex = $null }
}

# ------------------------------------------------------------------ coleta completa
function Coletar-Dados {
  $cs   = Get-CimInstance Win32_ComputerSystem
  $os   = Get-CimInstance Win32_OperatingSystem
  $bios = Get-CimInstance Win32_BIOS
  $csp  = Get-Safe { Get-CimInstance Win32_ComputerSystemProduct }
  $enc  = Get-Safe { Get-CimInstance Win32_SystemEnclosure | Select-Object -First 1 }
  $cpus = @(Get-CimInstance Win32_Processor)

  # --- tipo (notebook / desktop / servidor)
  $chassis  = @($enc.ChassisTypes)
  $notebook = @(8,9,10,11,12,14,18,21,30,31,32)
  $servidor = @(17,23,28)
  $tipo = 'desktop'
  if ($os.ProductType -ne 1 -or ($chassis | Where-Object { $servidor -contains $_ })) { $tipo = 'servidor' }
  elseif (($chassis | Where-Object { $notebook -contains $_ }) -or $cs.PCSystemType -eq 2 -or
          (Get-Safe { Get-CimInstance Win32_Battery })) { $tipo = 'notebook' }

  # --- fabricante / modelo (Lenovo guarda o nome comercial em Win32_ComputerSystemProduct.Version)
  $fabricante = Clean $cs.Manufacturer
  $modelo     = Clean $cs.Model
  if ($fabricante -match 'LENOVO' -and (Clean $csp.Version) -and $csp.Version -notmatch '^(none|default)') {
    $modelo = '{0} ({1})' -f (Clean $csp.Version), $modelo
  }

  # --- numero de serie
  $serie = Clean $bios.SerialNumber
  if (-not $serie -or $serie -match '(?i)o\.?e\.?m|default|system serial|^0+$') { $serie = Clean $csp.IdentifyingNumber }

  # --- patrimonio (ativo): parametro > config (link do tecnico) > registro > etiqueta da BIOS
  if (-not $Ativo -and $cfg.ativo) { $Ativo = $cfg.ativo }
  if (-not $Ativo) { $Ativo = Get-Safe { (Get-ItemProperty 'HKLM:\SOFTWARE\InventarioQuallit' -Name Ativo).Ativo } }
  if (-not $Ativo) { $Ativo = Clean $enc.SMBIOSAssetTag }

  # --- CPU
  $cpuNome    = (Clean $cpus[0].Name) -replace '\s{2,}', ' '
  $cpuNucleos = ($cpus | Measure-Object -Property NumberOfCores -Sum).Sum

  # --- memoria
  $tiposRam = @{ 20='DDR'; 21='DDR2'; 24='DDR3'; 26='DDR4'; 30='LPDDR4'; 34='DDR5'; 35='LPDDR5' }
  $modulos = @(Get-Safe { Get-CimInstance Win32_PhysicalMemory } | Where-Object { $_ } | ForEach-Object {
    [ordered]@{
      slot        = Clean $_.DeviceLocator
      tamanho_gb  = [math]::Round($_.Capacity / 1GB, 1)
      tipo        = $tiposRam[[int]$_.SMBIOSMemoryType]
      velocidade  = if ($_.ConfiguredClockSpeed) { [int]$_.ConfiguredClockSpeed } else { [int]$_.Speed }
      fabricante  = Clean $_.Manufacturer
      part_number = Clean $_.PartNumber
    }
  })
  $memGb = ($modulos | ForEach-Object { $_.tamanho_gb } | Measure-Object -Sum).Sum
  if (-not $memGb) { $memGb = [math]::Round($cs.TotalPhysicalMemory / 1GB, 1) }
  $slots = (Get-Safe { Get-CimInstance Win32_PhysicalMemoryArray } | Measure-Object -Property MemoryDevices -Sum).Sum

  # --- discos fisicos (ignora USB e virtuais)
  $discos = @()
  $pd = Get-Safe { Get-PhysicalDisk }
  if ($pd) {
    $discos = @($pd | Where-Object { "$($_.BusType)" -notin @('USB','File Backed Virtual','Virtual','SD','MMC') } | ForEach-Object {
      $mt = "$($_.MediaType)"
      if ($mt -notin @('SSD','HDD')) { $mt = if ("$($_.BusType)" -eq 'NVMe' -or $_.FriendlyName -match '(?i)ssd|nvme') { 'SSD' } else { 'Desconhecido' } }
      [ordered]@{
        modelo     = Clean $_.FriendlyName
        tipo       = $mt
        barramento = "$($_.BusType)"
        tamanho_gb = [math]::Round($_.Size / 1e9, 0)
        saude      = "$($_.HealthStatus)"
        serie      = Clean $_.SerialNumber
      }
    })
  } else {
    $discos = @(Get-CimInstance Win32_DiskDrive | Where-Object { $_.InterfaceType -ne 'USB' -and $_.MediaType -match 'Fixed' } | ForEach-Object {
      [ordered]@{
        modelo     = Clean $_.Model
        tipo       = if ($_.Model -match '(?i)ssd|nvme') { 'SSD' } else { 'Desconhecido' }
        barramento = "$($_.InterfaceType)"
        tamanho_gb = [math]::Round($_.Size / 1e9, 0)
        saude      = "$($_.Status)"
        serie      = Clean $_.SerialNumber
      }
    })
  }
  $armTotal = ($discos | ForEach-Object { $_.tamanho_gb } | Measure-Object -Sum).Sum

  # --- volumes (C:, D: ...)
  $volumes = @(Get-CimInstance Win32_LogicalDisk -Filter 'DriveType=3' | ForEach-Object {
    [ordered]@{
      letra    = $_.DeviceID
      rotulo   = Clean $_.VolumeName
      sistema  = Clean $_.FileSystem
      total_gb = [math]::Round($_.Size / 1e9, 1)
      livre_gb = [math]::Round($_.FreeSpace / 1e9, 1)
    }
  })
  $armLivre = ($volumes | ForEach-Object { $_.livre_gb } | Measure-Object -Sum).Sum

  # --- sistema operacional
  $cv = Get-Safe { Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion' }
  $displayVersion = Clean $cv.DisplayVersion
  if (-not $displayVersion) { $displayVersion = Clean $cv.ReleaseId }
  $build = "$($os.BuildNumber)"
  if ($cv.UBR) { $build = "$build.$($cv.UBR)" }
  $soNome = Clean $os.Caption
  # Windows 11 ainda aparece como "10" em algumas chaves; o Caption e confiavel, mas garantimos pelo build
  if ([int]$os.BuildNumber -ge 22000 -and $soNome -match 'Windows 10') { $soNome = $soNome -replace 'Windows 10', 'Windows 11' }
  $arq = if ([Environment]::Is64BitOperatingSystem) { 'x64' } else { 'x86' }
  if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64' -or $env:PROCESSOR_ARCHITEW6432 -eq 'ARM64') { $arq = 'ARM64' }

  # --- rede (adaptador com gateway primeiro)
  $nics = @(Get-CimInstance Win32_NetworkAdapterConfiguration -Filter 'IPEnabled=True')
  $nic  = ($nics | Where-Object { $_.DefaultIPGateway } | Select-Object -First 1)
  if (-not $nic) { $nic = $nics | Select-Object -First 1 }
  $ip  = if ($nic) { @($nic.IPAddress | Where-Object { $_ -match '^\d+\.\d+\.\d+\.\d+$' })[0] } else { $null }
  $mac = if ($nic) { $nic.MACAddress } else { $null }

  # --- usuario logado (como SYSTEM o UserName pode vir vazio)
  $usuario = Clean $cs.UserName
  if (-not $usuario) {
    $usuario = Get-Safe {
      $p = Get-CimInstance Win32_Process -Filter "Name='explorer.exe'" | Select-Object -First 1
      if ($p) { $o = Invoke-CimMethod -InputObject $p -MethodName GetOwner; if ($o.User) { "$($o.Domain)\$($o.User)" } }
    }
  }

  $dados = [ordered]@{
    hostname               = $env:COMPUTERNAME
    tipo                   = $tipo
    ativo                  = Clean $Ativo
    fabricante             = $fabricante
    modelo                 = $modelo
    numero_serie           = $serie
    cpu                    = $cpuNome
    cpu_nucleos            = [int]$cpuNucleos
    memoria_gb             = [math]::Round([double]$memGb, 1)
    memoria_slots_total    = if ($slots) { [int]$slots } else { $null }
    memoria_modulos        = $modulos
    armazenamento_total_gb = [double]$armTotal
    armazenamento_livre_gb = [math]::Round([double]$armLivre, 1)
    discos                 = $discos
    volumes                = $volumes
    so_nome                = $soNome
    so_versao              = Clean $os.Version
    so_build               = $build
    so_display_version     = $displayVersion
    so_arquitetura         = $arq
    so_instalado_em        = To-Iso $os.InstallDate
    ultimo_boot            = To-Iso $os.LastBootUpTime
    ip                     = $ip
    mac                    = $mac
    dominio                = Clean $cs.Domain
    usuario_logado         = $usuario
    agente_versao          = $AgenteVersao
    coletado_em            = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
    setor                  = Clean $cfg.setor
    localizacao            = Clean $cfg.localizacao
    responsavel            = Clean $cfg.responsavel
    codigo_instalacao      = Clean $cfg.codigo_instalacao
  }
  $dados
}

if ($SoMostrar) { Coletar-Dados | ConvertTo-Json -Depth 6; exit 0 }

$estado = Ler-Estado
if ($estado.tarefa_5min -ne 'v2' -and -not $Pausa) { if (Ajustar-Tarefa) { $estado.tarefa_5min = 'v2' } }   # v2: 5 min como SYSTEM, 15 min como usuario

# 1) coletas guardadas sem internet
$online = Enviar-Fila

# 2) sinal leve ou coleta completa?
$motivo = $null
$agora = (Get-Date).ToUniversalTime()
if ($Coletar -or $Pausa)               { $motivo = 'manual' }
elseif (-not $estado.maquina_id)       { $motivo = 'primeira coleta' }
elseif ($estado.versao -ne $AgenteVersao) { $motivo = 'versao nova do agente' }
else {
  $intervalo = 60; if ($estado.intervalo_min) { $intervalo = [int]$estado.intervalo_min }
  $ult = Get-Safe { [datetime]::Parse($estado.ultima_coleta, $null, [Globalization.DateTimeStyles]::RoundtripKind).ToUniversalTime() }
  if (-not $ult -or ($agora - $ult).TotalMinutes -ge $intervalo) { $motivo = 'intervalo' }
  else {
    $boot = Get-Safe { To-Iso (Get-CimInstance Win32_OperatingSystem).LastBootUpTime }
    if ($boot -and $boot -ne $estado.ultimo_boot) { $motivo = 'reinicio' }
  }
}

$instr = $null
if (-not $motivo) {
  if (-not $online) { Salvar-Estado $estado; exit 0 }   # sem internet: tenta de novo em 5 min
  $ipAtual = Get-Safe {
    $n = Get-CimInstance Win32_NetworkAdapterConfiguration -Filter 'IPEnabled=True' | Where-Object { $_.DefaultIPGateway } | Select-Object -First 1
    @($n.IPAddress | Where-Object { $_ -match '^\d+\.\d+\.\d+\.\d+$' })[0]
  }
  try {
    $instr = Invoke-Rpc 'agente_sinal' @{ p_token = $cfg.agente_token; p_maquina = $estado.maquina_id; p_versao = $AgenteVersao; p_ip = $ipAtual } 20
    if ($estado.offline) { Write-Log 'Conexao restabelecida'; $estado.offline = $false }
    if ($instr.intervalo_min) { $estado.intervalo_min = [int]$instr.intervalo_min }
    if (-not $instr.ok)  { $motivo = 'maquina nao encontrada no inventario' }
    elseif ($instr.coletar) { $motivo = if ($ipAtual -and $ipAtual -ne $estado.ip) { 'IP mudou' } else { 'pedido do painel' } }
  } catch {
    if ($_.ErrorDetails.Message -match 'token') { Write-Log ("ERRO token: {0}" -f (Erro-Texto $_)); Fim 3 }
    if (-not $estado.offline) { Write-Log ("Sem conexao com o servidor: {0}" -f (Erro-Texto $_)); $estado.offline = $true }
    Salvar-Estado $estado; exit 0
  }
  if (-not $motivo) {
    Salvar-Estado $estado
    if ($instr.atualizar) { Atualizar-Agente $instr.atualizar }
    exit 0
  }
}

# 3) coleta completa
$dados = Coletar-Dados
$codigo = 1
for ($t = 1; $t -le 2; $t++) {
  try {
    $r = Invoke-Rpc 'agente_reportar' @{ p_token = $cfg.agente_token; p_dados = $dados }
    Write-Log ("OK  {0}  RAM={1}GB  Disco={2}GB  {3} {4}  novo={5}  ({6})" -f $dados.hostname, $dados.memoria_gb, $dados.armazenamento_total_gb, $dados.so_nome, $dados.so_display_version, $r.novo, $motivo)
    $estado.maquina_id = $r.id; $estado.ultima_coleta = $dados.coletado_em; $estado.ultimo_boot = $dados.ultimo_boot
    $estado.versao = $AgenteVersao; $estado.ip = $dados.ip; $estado.offline = $false
    if ($r.intervalo_min) { $estado.intervalo_min = [int]$r.intervalo_min }
    $instr = $r; $codigo = 0
    break
  } catch {
    $txt = Erro-Texto $_
    if ($_.ErrorDetails.Message -match 'token') { Write-Log "ERRO token: $txt"; Fim 3 }
    if (-not (Erro-DeRede $_)) { Write-Log "ERRO do servidor: $txt"; $codigo = 1; break }
    Write-Log ("FALHA tentativa {0}: {1}" -f $t, $txt)
    if ($t -lt 2) { Start-Sleep -Seconds 8 }
    elseif (Guardar-NaFila $dados) { $estado.offline = $true; $codigo = 5 }
  }
}
Salvar-Estado $estado
if ($codigo -eq 0 -and $instr.atualizar) { Atualizar-Agente $instr.atualizar }
Fim $codigo
