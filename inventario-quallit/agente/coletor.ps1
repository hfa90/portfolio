#Requires -Version 5.1
<#
  INVENTARIO QUALLIT - Agente coletor
  Coleta hardware/SO da maquina e envia para o Supabase.

  Uso manual:
    powershell -ExecutionPolicy Bypass -File coletor.ps1              # coleta e envia
    powershell -ExecutionPolicy Bypass -File coletor.ps1 -SoMostrar   # so mostra o JSON, nao envia
    powershell -ExecutionPolicy Bypass -File coletor.ps1 -Ativo PAT123
    powershell -ExecutionPolicy Bypass -File coletor.ps1 -Pausa       # mostra o resultado (botao Executar da pagina)
#>
param(
  [string]$ConfigPath = (Join-Path $PSScriptRoot 'config.json'),
  [string]$Ativo,
  [switch]$SoMostrar,
  [switch]$Pausa
)

$ErrorActionPreference = 'Stop'
$AgenteVersao = '1.1.0'
$LogPath = Join-Path $PSScriptRoot 'coletor.log'
try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 } catch {}

function Write-Log([string]$msg) {
  $linha = '{0}  {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $msg
  Write-Host $linha
  try {
    if ((Test-Path $LogPath) -and (Get-Item $LogPath).Length -gt 1MB) { Remove-Item $LogPath -Force }
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

# ------------------------------------------------------------------ config
if (-not (Test-Path $ConfigPath)) { Write-Log "ERRO: config.json nao encontrado em $ConfigPath"; Fim 2 }
$cfg = Get-Content $ConfigPath -Raw -Encoding UTF8 | ConvertFrom-Json
if ($Pausa) { Write-Host ''; Write-Host '  Inventario Quallit - coletando dados deste computador...' -ForegroundColor Cyan; Write-Host '' }

# ------------------------------------------------------------------ coleta
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
  setor                  = Clean $cfg.setor
  localizacao            = Clean $cfg.localizacao
  responsavel            = Clean $cfg.responsavel
  codigo_instalacao      = Clean $cfg.codigo_instalacao
}

if ($SoMostrar) { $dados | ConvertTo-Json -Depth 6; exit 0 }

# ------------------------------------------------------------------ envio
$body    = @{ p_token = $cfg.agente_token; p_dados = $dados } | ConvertTo-Json -Depth 6 -Compress
$bytes   = [Text.Encoding]::UTF8.GetBytes($body)
$headers = @{ apikey = $cfg.supabase_anon_key; Authorization = "Bearer $($cfg.supabase_anon_key)" }
$url     = ($cfg.supabase_url.TrimEnd('/')) + '/rest/v1/rpc/agente_reportar'

$params = @{
  Uri = $url; Method = 'Post'; Headers = $headers; Body = $bytes
  ContentType = 'application/json; charset=utf-8'; TimeoutSec = 30; UseBasicParsing = $true
}
if ($cfg.proxy) { $params.Proxy = $cfg.proxy; $params.ProxyUseDefaultCredentials = $true }

for ($t = 1; $t -le 3; $t++) {
  try {
    $r = Invoke-RestMethod @params
    Write-Log ("OK  {0}  RAM={1}GB  Disco={2}GB  {3} {4}  novo={5}" -f $dados.hostname, $dados.memoria_gb, $dados.armazenamento_total_gb, $soNome, $displayVersion, $r.novo)
    Fim 0
  } catch {
    $det = $_.ErrorDetails.Message
    Write-Log ("FALHA tentativa {0}: {1} {2}" -f $t, $_.Exception.Message, $det)
    if ($det -match 'token') { Fim 3 }
    Start-Sleep -Seconds (10 * $t)
  }
}
Fim 1
