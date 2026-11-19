#Requires -Version 5.1
<#
  COLETORES (Android) - INVENTÁRIO QUALLIT - coleta pelo cabo USB

  Executado pelo COLETAR-COLETORES.bat. Mesma ideia do Invent_local dos computadores, mas para
  os coletores de dados Android (Zebra, Honeywell, Datalogic...): o PC lê, pelo ADB (cabo USB),
  cada coletor conectado e grava a planilha do Excel coletores-quallit.xlsx na MESMA PASTA.

  - Pode conectar vários coletores ao mesmo tempo (hub USB) ou um de cada vez: a janela fica
    esperando o próximo até você digitar F.
  - Cada coletor fica numa linha (identificado pelo nº de série). Ler de novo ATUALIZA a linha.
  - Os dados de cada coletor também ficam na pasta "dados" (um arquivo por coletor); a planilha
    é montada a partir dela (se estiver aberta no Excel, nada se perde).
  - Depois: no painel, Máquinas -> Importar coleta -> escolha o coletores-quallit.xlsx.

  Precisa, em cada coletor: Configurações -> Sobre o telefone -> tocar 7x em "Número da versão"
  -> Opções do desenvolvedor -> ativar "Depuração USB" -> ao conectar, aceitar "Permitir".

  Uso direto (sem o .bat):
    powershell -NoProfile -ExecutionPolicy Bypass -File coletar-coletores.ps1
    powershell -NoProfile -ExecutionPolicy Bypass -File coletar-coletores.ps1 -Silencioso -Setor "Expedição"   # sem perguntas
    powershell -NoProfile -ExecutionPolicy Bypass -File coletar-coletores.ps1 -SoMostrar                      # só mostra, não grava
#>
param(
  [string]$Arquivo,
  [string]$Setor,
  [string]$Localizacao,
  [string]$Responsavel,
  [string]$Adb,
  [switch]$Silencioso,
  [switch]$SoMostrar
)

$ErrorActionPreference = 'Stop'
$KitVersao = '1.0.0'
$Utf8 = New-Object Text.UTF8Encoding $false
$PtBR = [Globalization.CultureInfo]'pt-BR'
$Inv = [Globalization.CultureInfo]::InvariantCulture

function Get-Safe([scriptblock]$sb) { try { & $sb } catch { $null } }
function Clean([object]$v) { if ($null -eq $v) { return $null }; $s = "$v".Trim(); if ($s -eq '' -or $s -eq 'null') { $null } else { $s } }
function Num-BR($n) { if ($null -eq $n -or "$n" -eq '') { '' } else { ([double]$n).ToString('0.#', $PtBR) } }
function Serie-Valida([string]$s) {
  $s = Clean $s
  if (-not $s -or $s.Length -lt 3) { return $null }
  if ($s -match '(?i)^unknown$|o\.?e\.?m|default|to be filled|not specified|^none$|^0+$|^1234567|^emulator|:\d+$') { return $null }
  $s
}

# ------------------------------------------------------------------ onde gravar (igual ao Invent_local)
function Pasta-Gravavel([string]$p) {
  try {
    if (-not $p -or -not (Test-Path -LiteralPath $p)) { return $false }
    $t = Join-Path $p ('.iq-teste-{0}.tmp' -f [guid]::NewGuid().ToString('N'))
    [IO.File]::WriteAllText($t, 'ok'); Remove-Item -LiteralPath $t -Force
    $true
  } catch { $false }
}
$PastaKit = $PSScriptRoot
$temp = [IO.Path]::GetFullPath($env:TEMP).TrimEnd('\')
$dentroDoZip = $PastaKit -and ($PastaKit.StartsWith($temp, [StringComparison]::OrdinalIgnoreCase)) -and ($PastaKit -match '(?i)\.zip|Temp\d*_|Rar\$')
$PastaLocal = if ($dentroDoZip -or -not (Pasta-Gravavel $PastaKit)) {
  $d = Join-Path $env:USERPROFILE 'Downloads'
  if (Pasta-Gravavel $d) { $d } else { [Environment]::GetFolderPath('Desktop') }
} else { $PastaKit }
if ([string]::IsNullOrWhiteSpace($Arquivo)) { $Arquivo = Join-Path $PastaLocal 'coletores-quallit.xlsx' }
if ($Arquivo -notmatch '(?i)\.xlsx$') { $Arquivo += '.xlsx' }
$PastaPlanilha = Split-Path $Arquivo -Parent
$DadosPasta = Join-Path $PastaPlanilha 'dados'

# ------------------------------------------------------------------ ADB (Android Platform Tools, do Google)
function Achar-Adb {
  $cands = @(
    $Adb,
    (Join-Path $PastaKit 'platform-tools\adb.exe'), (Join-Path $PastaKit 'adb.exe'),
    (Join-Path $PastaLocal 'platform-tools\adb.exe'),
    (Get-Safe { (Get-Command adb.exe -ErrorAction Stop).Source }),
    (Join-Path $env:LOCALAPPDATA 'Android\Sdk\platform-tools\adb.exe'),
    'C:\platform-tools\adb.exe', 'C:\adb\adb.exe'
  )
  foreach ($c in $cands) { if ($c -and (Test-Path -LiteralPath $c)) { return (Resolve-Path -LiteralPath $c).Path } }
  $null
}
function Baixar-Adb {
  # pacote oficial do Google (Android SDK Platform-Tools)
  $url = 'https://dl.google.com/android/repository/platform-tools-latest-windows.zip'
  $zip = Join-Path $env:TEMP ('platform-tools-{0}.zip' -f [guid]::NewGuid().ToString('N'))
  Write-Host '  Baixando o ADB oficial do Google (cerca de 7 MB)...' -ForegroundColor Cyan
  [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
  $ProgressPreference = 'SilentlyContinue'
  Invoke-WebRequest -Uri $url -OutFile $zip -UseBasicParsing
  try { Expand-Archive -LiteralPath $zip -DestinationPath $PastaLocal -Force } finally { Remove-Item -LiteralPath $zip -Force -ErrorAction SilentlyContinue }
  Join-Path $PastaLocal 'platform-tools\adb.exe'
}

$script:AdbExe = $null
function A([string[]]$argumentos) {
  # roda o adb e devolve as linhas de saída (sem erro na tela).
  # 'Continue': no PowerShell 5.1, o aviso do adb no stderr ("daemon not running...") viraria erro fatal.
  $ErrorActionPreference = 'Continue'
  $saida = & $script:AdbExe @argumentos 2>$null
  @($saida | ForEach-Object { [string]$_ })
}
function Sh([string]$serial, [string]$cmd) { (A @('-s', $serial, 'shell', $cmd)) -join "`n" }

# ------------------------------------------------------------------ leitura de um coletor
$NomesSaude = @{ '1' = 'desconhecida'; '2' = 'boa'; '3' = 'superaquecida'; '4' = 'defeito'; '5' = 'sobretensao'; '6' = 'falha'; '7' = 'fria' }
function Nominal([double]$v, [double[]]$tamanhos) {
  foreach ($t in $tamanhos) { if ($v -le $t * 1.02) { return $t } }
  [math]::Round($v, 1)
}
function Ler-Coletor([string]$serial) {
  $p = @{}
  foreach ($l in (A @('-s', $serial, 'shell', 'getprop'))) {
    if ($l -match '^\[([^\]]+)\]:\s*\[(.*)\]\s*$') { $p[$matches[1]] = $matches[2] }
  }
  $prop = { param($nomes) foreach ($n in $nomes) { $v = Clean $p[$n]; if ($v) { return $v } }; $null }

  $serie = $null
  foreach ($n in 'ro.serialno', 'ro.boot.serialno', 'ril.serialnumber', 'persist.sys.serialno', 'ro.vendor.serialno') {
    $serie = Serie-Valida $p[$n]; if ($serie) { break }
  }
  if (-not $serie) { $serie = Serie-Valida $serial }   # o nº que o ADB mostra costuma ser o mesmo da etiqueta

  $fab    = & $prop @('ro.product.manufacturer', 'ro.product.vendor.manufacturer', 'ro.product.brand')
  $modelo = & $prop @('ro.product.model', 'ro.product.vendor.model')
  $nome   = Clean (Sh $serial 'settings get global device_name')
  if (-not $nome) { $nome = & $prop @('net.hostname', 'persist.sys.device_name') }
  if (-not $nome -or $nome -eq $modelo) {
    $suf = if ($serie) { $serie.Substring([math]::Max(0, $serie.Length - 6)) } else { $serial }
    $nome = ('{0}-{1}' -f ($(if ($modelo) { $modelo } else { 'COLETOR' }) -replace '\s+', ''), $suf)
  }

  $rel  = & $prop @('ro.build.version.release')
  $sdk  = & $prop @('ro.build.version.sdk')
  $patch = & $prop @('ro.build.version.security_patch')
  $cpu  = (@((& $prop @('ro.soc.manufacturer')), (& $prop @('ro.soc.model', 'ro.board.platform', 'ro.hardware'))) | Where-Object { $_ }) -join ' '
  $nuc  = $null
  $poss = Clean (Sh $serial 'cat /sys/devices/system/cpu/possible')
  if ($poss -match '^(\d+)-(\d+)$') { $nuc = [int]$matches[2] - [int]$matches[1] + 1 } elseif ($poss -match '^\d+$') { $nuc = 1 }

  # memória: MemTotal (kB) -> tamanho comercial (3,6 GB reais = 4 GB)
  $ram = $null
  if ((Sh $serial 'cat /proc/meminfo') -match 'MemTotal:\s+(\d+)\s*kB') {
    $ram = Nominal ([double]$matches[1] / 1MB) @(0.5, 1, 1.5, 2, 3, 4, 6, 8, 12, 16)
  }

  # armazenamento: /data (memória interna) e cartão SD, se houver
  $volumes = @(); $total = $null; $livre = $null; $disco = @()
  foreach ($l in ((Sh $serial 'df -k /data /storage/* 2>/dev/null') -split "`n")) {
    $c = $l.Trim() -split '\s+'
    if ($c.Count -lt 6 -or $c[1] -notmatch '^\d+$') { continue }
    $ponto = $c[$c.Count - 1]
    $tGb = [math]::Round([double]$c[1] / 1MB, 1); $lGb = [math]::Round([double]$c[3] / 1MB, 1)
    if ($ponto -eq '/data') {
      $total = Nominal ([double]$c[1] / 1MB) @(4, 8, 16, 32, 64, 128, 256, 512)
      $livre = $lGb
      $volumes += [ordered]@{ letra = 'Interna'; rotulo = '/data'; sistema = $c[0]; total_gb = $tGb; livre_gb = $lGb }
    } elseif ($ponto -match '^/storage/[0-9A-F]{4}-[0-9A-F]{4}$' -and $tGb -gt 0) {
      $volumes += [ordered]@{ letra = 'Cartão SD'; rotulo = $ponto; sistema = $c[0]; total_gb = $tGb; livre_gb = $lGb }
      $disco += [ordered]@{ modelo = 'Cartão SD'; tipo = 'SD'; tamanho_gb = (Nominal $tGb @(2, 4, 8, 16, 32, 64, 128, 256, 512)) }
    }
  }
  if ($total) { $disco = @([ordered]@{ modelo = 'Memória interna'; tipo = 'Flash'; tamanho_gb = $total }) + $disco }

  # bateria: dumpsys battery + arquivos do sistema (quando o aparelho permite ler)
  $bat = [ordered]@{}
  $db = Sh $serial 'dumpsys battery'
  if ($db -match '(?m)^\s*level:\s*(\d+)') { $bat.nivel = [int]$matches[1] }
  if ($db -match '(?m)^\s*health:\s*(\d+)') { $bat.saude = $NomesSaude[$matches[1]] }
  if ($db -match '(?m)^\s*temperature:\s*(\d+)') { $bat.temperatura = [math]::Round([double]$matches[1] / 10, 1) }
  if ($db -match '(?m)^\s*voltage:\s*(\d+)') { $bat.tensao = [math]::Round([double]$matches[1] / 1000, 2) }
  if ($db -match '(?mi)cycle[ _]?count:\s*(\d+)') { $bat.ciclos = [int]$matches[1] }
  if ($db -match '(?mi)health[ _]?percentage:\s*(\d+)') { $bat.capacidade_pct = [int]$matches[1] }   # Zebra e outros
  if (-not $bat.Contains('ciclos')) {
    $cc = Clean (Sh $serial 'cat /sys/class/power_supply/battery/cycle_count 2>/dev/null')
    if ($cc -match '^\d+$') { $bat.ciclos = [int]$cc }
  }
  if (-not $bat.Contains('capacidade_pct')) {
    $cf = Clean (Sh $serial 'cat /sys/class/power_supply/battery/charge_full 2>/dev/null')
    $cd = Clean (Sh $serial 'cat /sys/class/power_supply/battery/charge_full_design 2>/dev/null')
    if ($cf -match '^\d+$' -and $cd -match '^\d+$' -and [double]$cd -gt 0) { $bat.capacidade_pct = [math]::Min(100, [math]::Round(100 * [double]$cf / [double]$cd)) }
  }

  # rede Wi-Fi
  $ip = $null; $mac = $null
  if ((Sh $serial 'ip -f inet addr show wlan0') -match 'inet\s+(\d+\.\d+\.\d+\.\d+)') { $ip = $matches[1] }
  $m = Clean (Sh $serial 'cat /sys/class/net/wlan0/address 2>/dev/null')
  if (-not $m -or $m -eq '02:00:00:00:00:00') { if ((Sh $serial 'ip link show wlan0') -match 'link/ether\s+([0-9a-f:]{17})') { $m = $matches[1] } }
  if ($m -and $m -ne '02:00:00:00:00:00') { $mac = $m.ToUpperInvariant() }

  $boot = $null
  if ((Sh $serial 'cat /proc/uptime') -match '^(\d+)') { $boot = [datetime]::UtcNow.AddSeconds(-[double]$matches[1]).ToString('yyyy-MM-ddTHH:mm:ssZ') }

  [ordered]@{
    hostname               = $nome
    tipo                   = 'coletor'
    ativo                  = $null
    fabricante             = $fab
    modelo                 = $modelo
    numero_serie           = $serie
    cpu                    = Clean $cpu
    cpu_nucleos            = $nuc
    memoria_gb             = $ram
    armazenamento_total_gb = $total
    armazenamento_livre_gb = $livre
    discos                 = @($disco)
    volumes                = @($volumes)
    so_nome                = $(if ($rel) { "Android $rel" } else { 'Android' })
    so_versao              = ((@($(if ($sdk) { "API $sdk" }), $(if ($patch) { "patch $patch" })) | Where-Object { $_ }) -join ' · ')
    so_build               = & $prop @('ro.build.display.id', 'ro.build.id')
    so_display_version     = $rel
    so_arquitetura         = & $prop @('ro.product.cpu.abi')
    patch_seguranca        = $patch
    ultimo_boot            = $boot
    ip                     = $ip
    mac                    = $mac
    bateria                = $bat
    coleta                 = "coletores $KitVersao"
    coletado_em            = [datetime]::UtcNow.ToString('yyyy-MM-ddTHH:mm:ssZ')
    setor                  = $null
    localizacao            = $null
    responsavel            = $null
  }
}

# ------------------------------------------------------------------ dados por coletor (pasta "dados")
function Arquivo-Do-Coletor($d) {
  $s = Serie-Valida $d.numero_serie
  $nome = if ($s) { 'C_' + $s } else { 'CH_' + $d.hostname }
  Join-Path $DadosPasta (($nome.ToUpperInvariant() -replace '[^\w-]', '_') + '.json')
}
function Ler-Json([string]$p) { Get-Safe { [IO.File]::ReadAllText($p, $Utf8) | ConvertFrom-Json } }
function Salvar-Json([string]$p, $obj) {
  $tmp = $p + '.' + [guid]::NewGuid().ToString('N') + '.tmp'
  [IO.File]::WriteAllText($tmp, ($obj | ConvertTo-Json -Depth 6 -Compress), $Utf8)
  Move-Item -LiteralPath $tmp -Destination $p -Force
}

# ------------------------------------------------------------------ planilha do Excel (.xlsx)
# Mesmos nomes de coluna do Invent_local: o painel importa com a mesma função.
$Colunas = @(
  @{ t = 'HOSTNAME'; w = 20 }, @{ t = 'PATRIMONIO'; w = 13 }, @{ t = 'SETOR'; w = 16 }, @{ t = 'LOCALIZACAO'; w = 14 },
  @{ t = 'RESPONSAVEL'; w = 16 }, @{ t = 'TIPO'; w = 10 }, @{ t = 'FABRICANTE'; w = 16 }, @{ t = 'MODELO'; w = 14 },
  @{ t = 'NUMERO DE SERIE'; w = 18 }, @{ t = 'SISTEMA OPERACIONAL'; w = 14 }, @{ t = 'VERSAO'; w = 8 }, @{ t = 'BUILD'; w = 26 },
  @{ t = 'PATCH DE SEGURANCA'; w = 12 }, @{ t = 'PROCESSADOR'; w = 22 }, @{ t = 'NUCLEOS'; w = 9; n = 1 }, @{ t = 'RAM (GB)'; w = 9; n = 1 },
  @{ t = 'ARMAZENAMENTO (GB)'; w = 12; n = 1 }, @{ t = 'LIVRE (GB)'; w = 10; n = 1 },
  @{ t = 'BATERIA (%)'; w = 10; n = 1 }, @{ t = 'SAUDE DA BATERIA'; w = 14 }, @{ t = 'CAPACIDADE DA BATERIA (%)'; w = 12; n = 1 }, @{ t = 'CICLOS DA BATERIA'; w = 10; n = 1 },
  @{ t = 'IP'; w = 14 }, @{ t = 'MAC'; w = 18 }, @{ t = 'DATA DA COLETA'; w = 16 }, @{ t = 'DADOS (nao editar)'; w = 10; oculta = 1 }
)
function Valores-De($d) {
  $col = if ($d.coletado_em) { ([datetime]$d.coletado_em).ToLocalTime().ToString('dd/MM/yyyy HH:mm') } else { '' }
  $b = $d.bateria
  @(
    $d.hostname, $d.ativo, $d.setor, $d.localizacao, $d.responsavel, $d.tipo, $d.fabricante, $d.modelo, $d.numero_serie,
    $d.so_nome, $d.so_display_version, $d.so_build, $d.patch_seguranca, $d.cpu, $d.cpu_nucleos, $d.memoria_gb,
    $d.armazenamento_total_gb, $d.armazenamento_livre_gb,
    $(if ($b) { $b.nivel }), $(if ($b) { $b.saude }), $(if ($b) { $b.capacidade_pct }), $(if ($b) { $b.ciclos }),
    $d.ip, $d.mac, $col, ($d | ConvertTo-Json -Depth 6 -Compress)
  )
}
function Letra([int]$i) { $s = ''; $i++; while ($i -gt 0) { $m = ($i - 1) % 26; $s = [char](65 + $m) + $s; $i = [int](($i - $m - 1) / 26) }; $s }
function Xml([object]$v) {
  $s = [string]$v -replace '[\x00-\x08\x0B\x0C\x0E-\x1F]', ''
  if ($s.Length -gt 32000) { $s = $s.Substring(0, 32000) }
  [Security.SecurityElement]::Escape($s)
}
function Celula([int]$col, [int]$lin, $v, [bool]$numero, [int]$estilo = 0) {
  $ref = (Letra $col) + $lin
  $s = if ($estilo) { " s=`"$estilo`"" } else { '' }
  if ($null -eq $v -or "$v" -eq '') { return '' }
  if ($numero) {
    $n = 0.0
    if ([double]::TryParse(([string]$v).Replace(',', '.'), [Globalization.NumberStyles]::Float, $Inv, [ref]$n)) {
      return "<c r=`"$ref`"$s><v>$($n.ToString($Inv))</v></c>"
    }
  }
  "<c r=`"$ref`"$s t=`"inlineStr`"><is><t xml:space=`"preserve`">$(Xml $v)</t></is></c>"
}
function Escrever-Xlsx([string]$destino, [object[]]$coletores) {
  Add-Type -AssemblyName System.IO.Compression
  $sb = New-Object Text.StringBuilder
  [void]$sb.Append('<row r="1">')
  for ($i = 0; $i -lt $Colunas.Count; $i++) { [void]$sb.Append((Celula $i 1 $Colunas[$i].t $false 1)) }
  [void]$sb.Append('</row>')
  $lin = 1
  foreach ($d in $coletores) {
    $lin++
    $vals = Valores-De $d
    [void]$sb.Append("<row r=`"$lin`">")
    for ($i = 0; $i -lt $Colunas.Count; $i++) { [void]$sb.Append((Celula $i $lin $vals[$i] ([bool]$Colunas[$i].n))) }
    [void]$sb.Append('</row>')
  }
  $ultima = Letra ($Colunas.Count - 1)
  $cols = ($Colunas | ForEach-Object -Begin { $k = 0 } -Process {
    $k++; $o = if ($_.oculta) { ' hidden="1"' } else { '' }
    "<col min=`"$k`" max=`"$k`" width=`"$($_.w)`" customWidth=`"1`"$o/>"
  }) -join ''
  $ns = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
  $partes = [ordered]@{
    '[Content_Types].xml' = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>'
    '_rels/.rels' = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'
    'xl/workbook.xml' = "<?xml version=`"1.0`" encoding=`"UTF-8`" standalone=`"yes`"?><workbook xmlns=`"$ns`" xmlns:r=`"http://schemas.openxmlformats.org/officeDocument/2006/relationships`"><sheets><sheet name=`"Coletores`" sheetId=`"1`" r:id=`"rId1`"/></sheets><definedNames><definedName name=`"_xlnm._FilterDatabase`" localSheetId=`"0`" hidden=`"1`">Coletores!`$A`$1:`$$ultima`$$lin</definedName></definedNames></workbook>"
    'xl/_rels/workbook.xml.rels' = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'
    'xl/styles.xml' = "<?xml version=`"1.0`" encoding=`"UTF-8`" standalone=`"yes`"?><styleSheet xmlns=`"$ns`"><fonts count=`"2`"><font><sz val=`"11`"/><name val=`"Calibri`"/></font><font><b/><sz val=`"11`"/><color rgb=`"FFFFFFFF`"/><name val=`"Calibri`"/></font></fonts><fills count=`"3`"><fill><patternFill patternType=`"none`"/></fill><fill><patternFill patternType=`"gray125`"/></fill><fill><patternFill patternType=`"solid`"><fgColor rgb=`"FF1F4E79`"/><bgColor indexed=`"64`"/></patternFill></fill></fills><borders count=`"1`"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count=`"1`"><xf numFmtId=`"0`" fontId=`"0`" fillId=`"0`" borderId=`"0`"/></cellStyleXfs><cellXfs count=`"2`"><xf numFmtId=`"0`" fontId=`"0`" fillId=`"0`" borderId=`"0`" xfId=`"0`"/><xf numFmtId=`"0`" fontId=`"1`" fillId=`"2`" borderId=`"0`" xfId=`"0`" applyFont=`"1`" applyFill=`"1`"/></cellXfs><cellStyles count=`"1`"><cellStyle name=`"Normal`" xfId=`"0`" builtinId=`"0`"/></cellStyles></styleSheet>"
    'xl/worksheets/sheet1.xml' = "<?xml version=`"1.0`" encoding=`"UTF-8`" standalone=`"yes`"?><worksheet xmlns=`"$ns`"><sheetViews><sheetView workbookViewId=`"0`"><pane ySplit=`"1`" topLeftCell=`"A2`" activePane=`"bottomLeft`" state=`"frozen`"/></sheetView></sheetViews><cols>$cols</cols><sheetData>$($sb.ToString())</sheetData><autoFilter ref=`"A1:$ultima$lin`"/></worksheet>"
  }
  $fs = [IO.File]::Open($destino, 'Create', 'ReadWrite', 'None')
  try {
    $zip = New-Object IO.Compression.ZipArchive($fs, [IO.Compression.ZipArchiveMode]::Create, $true)
    try {
      foreach ($nome in $partes.Keys) {
        $s = $zip.CreateEntry($nome).Open()
        try { $b = $Utf8.GetBytes([string]$partes[$nome]); $s.Write($b, 0, $b.Length) } finally { $s.Dispose() }
      }
    } finally { $zip.Dispose() }
  } finally { $fs.Dispose() }
}
# refaz a planilha com todos os coletores da pasta "dados". Retorna $false se a planilha estiver aberta no Excel.
function Atualizar-Planilha {
  $lock = $null
  for ($i = 0; $i -lt 40 -and -not $lock; $i++) {
    try { $lock = [IO.File]::Open((Join-Path $DadosPasta '.trava'), 'OpenOrCreate', 'ReadWrite', 'None') }
    catch [IO.IOException] { Start-Sleep -Milliseconds 500 }
  }
  try {
    $lista = @(Get-ChildItem -LiteralPath $DadosPasta -Filter 'C*.json' | ForEach-Object { Ler-Json $_.FullName } | Where-Object { $_ -and $_.hostname -and $_.tipo -eq 'coletor' } |
      Sort-Object @{ e = { [string]$_.setor } }, @{ e = { [string]$_.hostname } })
    $tmp = Join-Path $PastaPlanilha ('.coletores-{0}.tmp' -f [guid]::NewGuid().ToString('N'))
    Escrever-Xlsx $tmp $lista
    try { Move-Item -LiteralPath $tmp -Destination $Arquivo -Force; return $lista.Count }
    catch { Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue; return $false }
  } finally { if ($lock) { $lock.Dispose() } }
}

function Perguntar([string]$rotulo, [string]$atual, [bool]$obrigatorio) {
  for ($n = 0; $n -lt 5; $n++) {
    $dica = if ($atual) { " [$atual]" } else { '' }
    if ([Console]::IsInputRedirected) {
      Write-Host -NoNewline ("  {0}{1}: " -f $rotulo, $dica)
      $v = [Console]::In.ReadLine()
      if ($null -eq $v) { if ($atual -or -not $obrigatorio) { return Clean $atual }; throw "sem resposta para '$($rotulo.Trim())'. Use -Silencioso para executar sem perguntas." }
      Write-Host $v
    } else {
      $v = Read-Host ("  {0}{1}" -f $rotulo, $dica)
    }
    if ([string]::IsNullOrWhiteSpace($v)) { $v = $atual }
    $v = Clean $v
    if ($v -or -not $obrigatorio) { return $v }
    Write-Host '  Campo obrigatório.' -ForegroundColor Yellow
  }
  throw "sem resposta para '$($rotulo.Trim())'"
}

# ------------------------------------------------------------------ execução
try {
  $script:AdbExe = Achar-Adb
  if (-not $script:AdbExe) {
    Write-Host ''
    Write-Host '  O ADB (ferramenta do Google que conversa com o Android pelo cabo USB) não foi encontrado.' -ForegroundColor Yellow
    $ok = if ($Silencioso) { $false } else { (Read-Host '  Baixar agora do site oficial do Google para esta pasta? (S/N)') -match '^(s|sim|y)' }
    if (-not $ok) { throw 'sem o ADB não dá para ler os coletores. Baixe o "Android SDK Platform-Tools" e extraia a pasta platform-tools ao lado deste arquivo.' }
    $script:AdbExe = Baixar-Adb
    if (-not (Test-Path -LiteralPath $script:AdbExe)) { throw 'o download do ADB não funcionou.' }
  }
  A @('start-server') | Out-Null

  if (-not $Silencioso -and -not $SoMostrar) {
    Write-Host ''
    Write-Host '  Setor, localização e responsável valem para os próximos coletores (Enter mantém).' -ForegroundColor Gray
    $Setor       = Perguntar 'Setor (ex.: Expedição)       ' $Setor $false
    $Localizacao = Perguntar 'Localização (opcional)       ' $Localizacao $false
    $Responsavel = Perguntar 'Responsável (opcional)       ' $Responsavel $false
  }

  $feitos = @{}; $total = 0; $avisados = @{}
  while ($true) {
    $linhas = A @('devices')
    $aparelhos = @($linhas | Where-Object { $_ -match '^(\S+)\s+(device|unauthorized|offline|no permissions)' } | ForEach-Object {
      $c = $_ -split '\s+'; [pscustomobject]@{ serial = $c[0]; estado = $c[1] }
    })
    foreach ($ap in $aparelhos | Where-Object { $_.estado -ne 'device' }) {
      if ($avisados[$ap.serial]) { continue }; $avisados[$ap.serial] = 1
      Write-Host ''
      if ($ap.estado -eq 'unauthorized') { Write-Host ("  Coletor {0}: toque em PERMITIR na tela do coletor (Permitir depuração USB) e tecle Enter aqui." -f $ap.serial) -ForegroundColor Yellow }
      else { Write-Host ("  Coletor {0}: conexão {1}. Desconecte e conecte o cabo de novo." -f $ap.serial, $ap.estado) -ForegroundColor Yellow }
    }
    $novos = @($aparelhos | Where-Object { $_.estado -eq 'device' -and -not $feitos[$_.serial] })

    foreach ($ap in $novos) {
      Write-Host ''
      Write-Host ("  Lendo o coletor {0}..." -f $ap.serial) -ForegroundColor Cyan
      $d = Ler-Coletor $ap.serial
      $feitos[$ap.serial] = 1
      if ($SoMostrar) { $d | ConvertTo-Json -Depth 6; continue }

      New-Item -ItemType Directory -Path $DadosPasta -Force | Out-Null
      $arq = Arquivo-Do-Coletor $d
      $atual = if (Test-Path -LiteralPath $arq) { Ler-Json $arq } else { $null }
      $b = $d.bateria
      Write-Host ("  Coletor   : {0}  ({1} {2})" -f $d.hostname, $d.fabricante, $d.modelo)
      Write-Host ("  Nº série  : {0}" -f $(if ($d.numero_serie) { $d.numero_serie } else { 'não informado pelo aparelho' }))
      Write-Host ("  Sistema   : {0}  ·  RAM {1} GB  ·  Memória {2} GB ({3} GB livres)" -f $d.so_nome, (Num-BR $d.memoria_gb), $d.armazenamento_total_gb, (Num-BR $d.armazenamento_livre_gb))
      Write-Host ("  Bateria   : {0}%  ·  saúde {1}{2}{3}" -f $b.nivel, $(if ($b.saude) { $b.saude } else { '?' }),
        $(if ($b.Contains('capacidade_pct')) { "  ·  capacidade $($b.capacidade_pct)%" } else { '' }), $(if ($b.Contains('ciclos')) { "  ·  $($b.ciclos) ciclos" } else { '' }))
      if ($atual) { Write-Host '  Este coletor já está na planilha: a linha será atualizada.' -ForegroundColor DarkGray }

      $padrao = @{
        ativo       = if ($atual) { Clean $atual.ativo } else { $null }
        setor       = if (Clean $Setor) { Clean $Setor } elseif ($atual) { Clean $atual.setor } else { $null }
        localizacao = if (Clean $Localizacao) { Clean $Localizacao } elseif ($atual) { Clean $atual.localizacao } else { $null }
        responsavel = if (Clean $Responsavel) { Clean $Responsavel } elseif ($atual) { Clean $atual.responsavel } else { $null }
      }
      if ($Silencioso) { foreach ($f in $padrao.Keys) { $d[$f] = $padrao[$f] } }
      else {
        $d.ativo       = Perguntar 'Patrimônio (bipe a etiqueta)' $padrao.ativo $false
        $d.setor       = $padrao.setor
        $d.localizacao = $padrao.localizacao
        $d.responsavel = $padrao.responsavel
      }
      if ($d.ativo) { $d.ativo = ([string]$d.ativo).ToUpperInvariant() }
      Salvar-Json $arq $d
      $total++
      Write-Host '  Gravado.' -ForegroundColor Green
    }

    if ($Silencioso -or $SoMostrar) { break }
    Write-Host ''
    if ($novos.Count -eq 0 -and $aparelhos.Count -eq 0) { Write-Host '  Nenhum coletor conectado. Conecte pelo cabo USB (com a Depuração USB ativada).' -ForegroundColor Gray }
    $r = Read-Host '  Conecte o próximo coletor e tecle Enter (ou digite F para finalizar)'
    if ($r -match '^\s*[fF]') { break }
    $avisados = @{}
    # o mesmo coletor desconectado e conectado de novo pode ser lido outra vez
    $presentes = @((A @('devices')) | ForEach-Object { ($_ -split '\s+')[0] })
    foreach ($k in @($feitos.Keys)) { if ($presentes -notcontains $k) { $feitos.Remove($k) } }
  }

  if ($SoMostrar) { exit 0 }
  if ($total -eq 0 -and -not (Test-Path -LiteralPath $DadosPasta)) { Write-Host ''; Write-Host '  Nenhum coletor foi lido.' -ForegroundColor Yellow; exit 0 }
  New-Item -ItemType Directory -Path $DadosPasta -Force | Out-Null
  $n = Atualizar-Planilha
  Write-Host ''
  if ($n -is [int]) {
    Write-Host ("  PRONTO! {0} coletor(es) lido(s) agora. Planilha do Excel gravada em:" -f $total) -ForegroundColor Green
    Write-Host "  $Arquivo" -ForegroundColor Green
    Write-Host ("  ({0} coletor(es) na planilha)" -f $n) -ForegroundColor DarkGray
    Write-Host '  Próximo passo: no painel, Máquinas -> Importar coleta -> escolha este arquivo.' -ForegroundColor Cyan
    if ($Arquivo -notmatch '^\\\\' -and -not $Silencioso) { Get-Safe { Start-Process explorer.exe -ArgumentList ('/select,"{0}"' -f $Arquivo) } | Out-Null }
  } else {
    Write-Host '  Os dados foram SALVOS, mas a planilha está aberta no Excel e não pôde ser refeita agora.' -ForegroundColor Yellow
    Write-Host '  Feche o Excel e execute de novo para atualizar a planilha.' -ForegroundColor Yellow
  }
  exit 0
} catch {
  Write-Host ''
  Write-Host ('  ERRO: ' + $_.Exception.Message) -ForegroundColor Red
  exit 1
}
