#Requires -Version 5.1
<#
  INVENT_LOCAL (nova versão) - INVENTÁRIO QUALLIT - coleta sem instalação

  Executado pelo COLETAR.bat. Não instala nada, não cria tarefa agendada, não precisa de
  internet nem de administrador: lê os dados do computador (WMI) e grava a planilha do Excel
  inventario-quallit.xlsx na MESMA PASTA (pode ser uma pasta de rede \\servidor\...).

  - Cada computador fica numa linha. Executar de novo ATUALIZA a linha (não duplica).
  - Os dados de cada computador também ficam na pasta "dados" (um arquivo por máquina);
    a planilha é montada a partir dela. Assim vários computadores podem executar ao mesmo
    tempo e, se a planilha estiver aberta no Excel, nada se perde: ela é refeita na próxima vez.
  - Depois: página "Registrar computador" (passo 3, importar) ou no painel:
    Máquinas -> Importar coleta -> escolha o inventario-quallit.xlsx.

  Uso direto (sem o .bat):
    powershell -NoProfile -ExecutionPolicy Bypass -File coletar.ps1
    powershell -NoProfile -ExecutionPolicy Bypass -File coletar.ps1 -Silencioso          # sem perguntas (script de logon/GPO)
    powershell -NoProfile -ExecutionPolicy Bypass -File coletar.ps1 -Ativo PAT123 -Setor "Expedição" -Silencioso
    powershell -NoProfile -ExecutionPolicy Bypass -File coletar.ps1 -SoMostrar           # só mostra, não grava
#>
param(
  [string]$Arquivo,
  [string]$Ativo,
  [string]$Setor,
  [string]$Localizacao,
  [string]$Responsavel,
  [switch]$Silencioso,
  [switch]$SoMostrar
)

$ErrorActionPreference = 'Stop'
$KitVersao = '2.0.0'
$Utf8 = New-Object Text.UTF8Encoding $false

function Get-Safe([scriptblock]$sb) { try { & $sb } catch { $null } }
function Clean([object]$v) { if ($null -eq $v) { return $null }; $s = "$v".Trim(); if ($s -eq '') { $null } else { $s } }
function To-Iso($d) { if ($d) { ([datetime]$d).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ') } else { $null } }
function Num-BR($n) { if ($null -eq $n -or "$n" -eq '') { '' } else { ([double]$n).ToString('0.#', [Globalization.CultureInfo]'pt-BR') } }
function Serie-Valida([string]$s) {
  $s = Clean $s
  if (-not $s -or $s.Length -lt 3) { return $null }
  if ($s -match '(?i)o\.?e\.?m|default|to be filled|system serial|not specified|^none$|^0+$|^1234567') { return $null }
  $s
}

# ------------------------------------------------------------------ onde gravar
# Pasta do kit, se der para gravar nela. Se o .bat foi aberto DE DENTRO do .zip (o Windows roda
# numa pasta temporária que some) ou a pasta é somente leitura, grava em Downloads.
function Pasta-Gravavel([string]$p) {
  try {
    if (-not $p -or -not (Test-Path -LiteralPath $p)) { return $false }
    $t = Join-Path $p ('.iq-teste-{0}.tmp' -f [guid]::NewGuid().ToString('N'))
    [IO.File]::WriteAllText($t, 'ok'); Remove-Item -LiteralPath $t -Force
    $true
  } catch { $false }
}
if ([string]::IsNullOrWhiteSpace($Arquivo)) {
  $pasta = $PSScriptRoot
  $temp = [IO.Path]::GetFullPath($env:TEMP).TrimEnd('\')
  $dentroDoZip = $pasta -and ($pasta.StartsWith($temp, [StringComparison]::OrdinalIgnoreCase)) -and ($pasta -match '(?i)\.zip|Temp\d*_|Rar\$')
  if ($dentroDoZip -or -not (Pasta-Gravavel $pasta)) {
    $pasta = Join-Path $env:USERPROFILE 'Downloads'
    if (-not (Pasta-Gravavel $pasta)) { $pasta = [Environment]::GetFolderPath('Desktop') }
  }
  $Arquivo = Join-Path $pasta 'inventario-quallit.xlsx'
}
if ($Arquivo -notmatch '(?i)\.xlsx$') { $Arquivo += '.xlsx' }
$PastaPlanilha = Split-Path $Arquivo -Parent
$DadosPasta = Join-Path $PastaPlanilha 'dados'

# ------------------------------------------------------------------ coleta (mesma lógica do agente)
function Coletar-Dados {
  $cs   = Get-CimInstance Win32_ComputerSystem
  $os   = Get-CimInstance Win32_OperatingSystem
  $bios = Get-CimInstance Win32_BIOS
  $csp  = Get-Safe { Get-CimInstance Win32_ComputerSystemProduct }
  $enc  = Get-Safe { Get-CimInstance Win32_SystemEnclosure | Select-Object -First 1 }
  $cpus = @(Get-CimInstance Win32_Processor)

  $chassis  = @($enc.ChassisTypes)
  $notebook = @(8,9,10,11,12,14,18,21,30,31,32)
  $servidor = @(17,23,28)
  $tipo = 'desktop'
  if ($os.ProductType -ne 1 -or ($chassis | Where-Object { $servidor -contains $_ })) { $tipo = 'servidor' }
  elseif (($chassis | Where-Object { $notebook -contains $_ }) -or $cs.PCSystemType -eq 2 -or
          (Get-Safe { Get-CimInstance Win32_Battery })) { $tipo = 'notebook' }

  $fabricante = Clean $cs.Manufacturer
  $modelo     = Clean $cs.Model
  if ($fabricante -match 'LENOVO' -and (Clean $csp.Version) -and $csp.Version -notmatch '^(none|default)') {
    $modelo = '{0} ({1})' -f (Clean $csp.Version), $modelo
  }

  $serie = Clean $bios.SerialNumber
  if (-not (Serie-Valida $serie)) { $s2 = Clean $csp.IdentifyingNumber; if (Serie-Valida $s2) { $serie = $s2 } }

  $etiquetaBios = Clean $enc.SMBIOSAssetTag
  if ($etiquetaBios -and -not (Serie-Valida $etiquetaBios)) { $etiquetaBios = $null }

  $cpuNome    = (Clean $cpus[0].Name) -replace '\s{2,}', ' '
  $cpuNucleos = ($cpus | Measure-Object -Property NumberOfCores -Sum).Sum

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
  }
  if (-not $discos.Count) {
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

  $cv = Get-Safe { Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion' }
  $displayVersion = Clean $cv.DisplayVersion
  if (-not $displayVersion) { $displayVersion = Clean $cv.ReleaseId }
  $build = "$($os.BuildNumber)"
  if ($cv.UBR) { $build = "$build.$($cv.UBR)" }
  $soNome = Clean $os.Caption
  if ([int]$os.BuildNumber -ge 22000 -and $soNome -match 'Windows 10') { $soNome = $soNome -replace 'Windows 10', 'Windows 11' }
  $arq = if ([Environment]::Is64BitOperatingSystem) { 'x64' } else { 'x86' }
  if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64' -or $env:PROCESSOR_ARCHITEW6432 -eq 'ARM64') { $arq = 'ARM64' }

  $nics = @(Get-CimInstance Win32_NetworkAdapterConfiguration -Filter 'IPEnabled=True')
  $nic  = ($nics | Where-Object { $_.DefaultIPGateway } | Select-Object -First 1)
  if (-not $nic) { $nic = $nics | Select-Object -First 1 }
  $ip  = if ($nic) { @($nic.IPAddress | Where-Object { $_ -match '^\d+\.\d+\.\d+\.\d+$' })[0] } else { $null }
  $mac = if ($nic) { $nic.MACAddress } else { $null }

  $usuario = Clean $cs.UserName
  if (-not $usuario) { $usuario = Clean ("{0}\{1}" -f $env:USERDOMAIN, $env:USERNAME) }

  [pscustomobject][ordered]@{
    hostname               = $env:COMPUTERNAME
    tipo                   = $tipo
    ativo                  = $etiquetaBios
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
    coleta                 = "invent_local $KitVersao"
    coletado_em            = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
    setor                  = $null
    localizacao            = $null
    responsavel            = $null
  }
}

# ------------------------------------------------------------------ dados por máquina (pasta "dados")
function Arquivo-Da-Maquina($d) {
  $s = Serie-Valida $d.numero_serie
  $nome = if ($s) { 'S_' + $s } else { 'H_' + $d.hostname }
  Join-Path $DadosPasta (($nome.ToUpperInvariant() -replace '[^\w-]', '_') + '.json')
}
function Ler-Json([string]$p) { Get-Safe { [IO.File]::ReadAllText($p, $Utf8) | ConvertFrom-Json } }
function Salvar-Json([string]$p, $obj) {
  $tmp = $p + '.' + [guid]::NewGuid().ToString('N') + '.tmp'
  [IO.File]::WriteAllText($tmp, ($obj | ConvertTo-Json -Depth 6 -Compress), $Utf8)
  Move-Item -LiteralPath $tmp -Destination $p -Force
}

# ------------------------------------------------------------------ planilha do Excel (.xlsx)
$Colunas = @(
  @{ t = 'HOSTNAME'; w = 18 }, @{ t = 'PATRIMONIO'; w = 13 }, @{ t = 'SETOR'; w = 16 }, @{ t = 'LOCALIZACAO'; w = 14 },
  @{ t = 'RESPONSAVEL'; w = 16 }, @{ t = 'TIPO'; w = 10 }, @{ t = 'FABRICANTE'; w = 13 }, @{ t = 'MODELO'; w = 22 },
  @{ t = 'NUMERO DE SERIE'; w = 22 }, @{ t = 'SISTEMA OPERACIONAL'; w = 34 }, @{ t = 'VERSAO'; w = 8 }, @{ t = 'BUILD'; w = 12 },
  @{ t = 'PROCESSADOR'; w = 34 }, @{ t = 'NUCLEOS'; w = 9; n = 1 }, @{ t = 'RAM (GB)'; w = 9; n = 1 }, @{ t = 'MODULOS DE RAM'; w = 30 },
  @{ t = 'ARMAZENAMENTO (GB)'; w = 12; n = 1 }, @{ t = 'LIVRE (GB)'; w = 10; n = 1 }, @{ t = 'DISCOS'; w = 32 }, @{ t = 'IP'; w = 14 },
  @{ t = 'MAC'; w = 18 }, @{ t = 'DOMINIO'; w = 14 }, @{ t = 'USUARIO'; w = 22 }, @{ t = 'WINDOWS INSTALADO EM'; w = 12 },
  @{ t = 'DATA DA COLETA'; w = 16 }, @{ t = 'DADOS (nao editar)'; w = 10; oculta = 1 }
)
function Valores-De($d) {
  $mods = (@($d.memoria_modulos) | Where-Object { $_ } | ForEach-Object { ('{0} GB {1} {2}' -f (Num-BR $_.tamanho_gb), $_.tipo, $(if ($_.velocidade) { "$($_.velocidade) MHz" } else { '' })).Trim() }) -join ' + '
  $dsk  = (@($d.discos) | Where-Object { $_ } | ForEach-Object { '{0} {1} GB ({2})' -f $_.tipo, $_.tamanho_gb, $_.modelo }) -join ' / '
  $inst = if ($d.so_instalado_em) { ([datetime]$d.so_instalado_em).ToLocalTime().ToString('dd/MM/yyyy') } else { '' }
  $col  = if ($d.coletado_em) { ([datetime]$d.coletado_em).ToLocalTime().ToString('dd/MM/yyyy HH:mm') } else { '' }
  @(
    $d.hostname, $d.ativo, $d.setor, $d.localizacao, $d.responsavel, $d.tipo, $d.fabricante, $d.modelo, $d.numero_serie,
    $d.so_nome, $d.so_display_version, $d.so_build, $d.cpu, $d.cpu_nucleos, $d.memoria_gb, $mods,
    $d.armazenamento_total_gb, $d.armazenamento_livre_gb, $dsk, $d.ip, $d.mac, $d.dominio, $d.usuario_logado, $inst,
    $col, ($d | ConvertTo-Json -Depth 6 -Compress)
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
    if ([double]::TryParse(([string]$v).Replace(',', '.'), [Globalization.NumberStyles]::Float, [Globalization.CultureInfo]::InvariantCulture, [ref]$n)) {
      return "<c r=`"$ref`"$s><v>$($n.ToString([Globalization.CultureInfo]::InvariantCulture))</v></c>"
    }
  }
  "<c r=`"$ref`"$s t=`"inlineStr`"><is><t xml:space=`"preserve`">$(Xml $v)</t></is></c>"
}
function Escrever-Xlsx([string]$destino, [object[]]$maquinas) {
  Add-Type -AssemblyName System.IO.Compression
  $sb = New-Object Text.StringBuilder
  [void]$sb.Append('<row r="1">')
  for ($i = 0; $i -lt $Colunas.Count; $i++) { [void]$sb.Append((Celula $i 1 $Colunas[$i].t $false 1)) }
  [void]$sb.Append('</row>')
  $lin = 1
  foreach ($d in $maquinas) {
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
    'xl/workbook.xml' = "<?xml version=`"1.0`" encoding=`"UTF-8`" standalone=`"yes`"?><workbook xmlns=`"$ns`" xmlns:r=`"http://schemas.openxmlformats.org/officeDocument/2006/relationships`"><sheets><sheet name=`"Inventario`" sheetId=`"1`" r:id=`"rId1`"/></sheets><definedNames><definedName name=`"_xlnm._FilterDatabase`" localSheetId=`"0`" hidden=`"1`">Inventario!`$A`$1:`$$ultima`$$lin</definedName></definedNames></workbook>"
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
# refaz a planilha com todas as máquinas da pasta "dados". Retorna $false se a planilha estiver aberta no Excel.
function Atualizar-Planilha {
  $lock = $null
  for ($i = 0; $i -lt 40 -and -not $lock; $i++) {
    try { $lock = [IO.File]::Open((Join-Path $DadosPasta '.trava'), 'OpenOrCreate', 'ReadWrite', 'None') }
    catch [IO.IOException] { Start-Sleep -Milliseconds 500 }
  }
  try {
    $maquinas = @(Get-ChildItem -LiteralPath $DadosPasta -Filter '*.json' | ForEach-Object { Ler-Json $_.FullName } | Where-Object { $_ -and $_.hostname } |
      Sort-Object @{ e = { [string]$_.setor } }, @{ e = { [string]$_.hostname } })
    $tmp = Join-Path $PastaPlanilha ('.inventario-{0}.tmp' -f [guid]::NewGuid().ToString('N'))
    Escrever-Xlsx $tmp $maquinas
    try { Move-Item -LiteralPath $tmp -Destination $Arquivo -Force; return $maquinas.Count }
    catch { Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue; return $false }
  } finally { if ($lock) { $lock.Dispose() } }
}

# ------------------------------------------------------------------ envio automático (kit baixado pela página "Registrar computador")
# O .zip baixado pela página traz um config.json com o CÓDIGO DO CONVITE (o mesmo do instalador do agente),
# nunca a senha/token. Com ele, ao terminar, os dados já vão para o inventário e a página mostra o computador.
# Sem config.json (kit da pasta de rede) ou sem internet, nada muda: a planilha fica pronta para importar.
$Cfg = $null
$CfgPath = Join-Path $PSScriptRoot 'config.json'
if (Test-Path -LiteralPath $CfgPath) { $Cfg = Get-Safe { [IO.File]::ReadAllText($CfgPath, $Utf8) | ConvertFrom-Json } }
function Rpc([string]$nome, $corpo, [int]$timeout = 20) {
  try { [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12 } catch {}
  try { [Net.WebRequest]::DefaultWebProxy.Credentials = [Net.CredentialCache]::DefaultNetworkCredentials } catch {}   # proxy da empresa
  $json = ConvertTo-Json -InputObject $corpo -Depth 8 -Compress
  Invoke-RestMethod -Uri (([string]$Cfg.supabase_url).TrimEnd('/') + '/rest/v1/rpc/' + $nome) -Method Post -UseBasicParsing -TimeoutSec $timeout `
    -Headers @{ apikey = [string]$Cfg.supabase_anon_key; Authorization = 'Bearer ' + [string]$Cfg.supabase_anon_key } `
    -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes($json))
}
function Erro-Rpc($err) {
  $m = ''
  try { $m = ([string]$err.ErrorDetails.Message | ConvertFrom-Json).message } catch {}
  if (-not $m) { $m = $err.Exception.Message }
  if ($m -match '(?i)expirado|nao encontrado|invalido') { return 'o código deste download expirou (vale 7 dias). Importe a planilha na página.' }
  if ($m -match '(?i)registrar_por_planilha') { return 'o inventário ainda não foi atualizado para receber o envio automático. Importe a planilha na página.' }
  if (-not $err.ErrorDetails.Message) { return "sem conexão com o inventário ($m)." }
  $m
}

function Perguntar([string]$rotulo, [string]$atual, [bool]$obrigatorio) {
  for ($n = 0; $n -lt 5; $n++) {
    $dica = if ($atual) { " [$atual]" } else { '' }
    if ([Console]::IsInputRedirected) {
      # entrada por arquivo/pipe (ex.: script): fim da entrada = sem resposta
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
  throw "o campo '$($rotulo.Trim())' é obrigatório."
}

# ------------------------------------------------------------------ execução
try {
  Write-Host ''
  Write-Host '  Lendo os dados deste computador...' -ForegroundColor Cyan
  $dados = Coletar-Dados
  if ($SoMostrar) { $dados | ConvertTo-Json -Depth 6; exit 0 }

  New-Item -ItemType Directory -Path $DadosPasta -Force | Out-Null
  $meuArquivo = Arquivo-Da-Maquina $dados
  $atual = if (Test-Path -LiteralPath $meuArquivo) { Ler-Json $meuArquivo } else { $null }

  # convite do link: patrimônio/setor que o técnico já definiu + credencial do envio automático
  $convite = $null; $semEnvio = $null
  if ($Cfg -and $Cfg.convite -and $Cfg.supabase_url) {
    try { $convite = Rpc 'obter_instalacao' @{ p_codigo = [string]$Cfg.convite } 15 }
    catch { $semEnvio = Erro-Rpc $_ }
  }

  $padrao = @{}
  foreach ($f in 'ativo', 'setor', 'localizacao', 'responsavel') {
    $param = @{ ativo = $Ativo; setor = $Setor; localizacao = $Localizacao; responsavel = $Responsavel }[$f]
    $doLink = if ($convite) { Clean $convite.$f } else { $null }
    $padrao[$f] = if (Clean $param) { Clean $param } elseif ($doLink) { $doLink } elseif ($atual -and (Clean $atual.$f)) { Clean $atual.$f } elseif ($f -eq 'ativo') { $dados.ativo } else { $null }
  }

  Write-Host ''
  Write-Host ("  Computador : {0}  ({1} {2})" -f $dados.hostname, $dados.fabricante, $dados.modelo)
  Write-Host ("  Nº de série: {0}" -f $(if ($dados.numero_serie) { $dados.numero_serie } else { 'não informado pela BIOS' }))
  Write-Host ("  Sistema    : {0} {1}  ·  RAM {2} GB  ·  Disco {3} GB" -f $dados.so_nome, $dados.so_display_version, (Num-BR $dados.memoria_gb), $dados.armazenamento_total_gb)
  if ($atual) { Write-Host '  Este computador já está na planilha: a linha será atualizada.' -ForegroundColor DarkGray }
  Write-Host ''

  if ($Silencioso) {
    foreach ($f in $padrao.Keys) { $dados.$f = $padrao[$f] }
  } else {
    Write-Host '  Responda e tecle Enter (Enter sozinho mantém o valor entre colchetes):' -ForegroundColor Gray
    $dados.ativo       = Perguntar 'Número do patrimônio (ativo)' $padrao.ativo $true
    $dados.setor       = Perguntar 'Setor / departamento        ' $padrao.setor $true
    $dados.localizacao = Perguntar 'Localização (opcional)      ' $padrao.localizacao $false
    $dados.responsavel = Perguntar 'Responsável (opcional)      ' $padrao.responsavel $false
  }
  if ($dados.ativo) { $dados.ativo = ([string]$dados.ativo).ToUpperInvariant() }

  Write-Host ''
  Write-Host '  Gravando...' -ForegroundColor Cyan
  Salvar-Json $meuArquivo $dados
  $total = Atualizar-Planilha

  # envio automático: os mesmos dados da linha da planilha vão direto para o inventário
  $enviado = $false
  if ($convite -and $convite.agente_token) {
    Write-Host '  Enviando para o inventário...' -ForegroundColor Cyan
    try {
      $r = Rpc 'registrar_por_planilha' @{ p_token = [string]$convite.agente_token; p_codigo_instalacao = [string]$convite.codigo_instalacao; p_linhas = @($dados) } 30
      if (([int]$r.criadas + [int]$r.atualizadas) -gt 0) { $enviado = $true }
      else { $semEnvio = (@($r.avisos) | ForEach-Object { $_.msg } | Select-Object -First 1); if (-not $semEnvio) { $semEnvio = 'o inventário não aceitou os dados.' } }
    } catch { $semEnvio = Erro-Rpc $_ }
  }

  Write-Host ''
  if ($total -is [int]) {
    Write-Host '  PRONTO! Planilha do Excel gravada em:' -ForegroundColor Green
    Write-Host "  $Arquivo" -ForegroundColor Green
    Write-Host ("  ({0} computador(es) na planilha)" -f $total) -ForegroundColor DarkGray
  } else {
    Write-Host '  Os dados foram SALVOS, mas a planilha está aberta no Excel e não pôde ser refeita agora.' -ForegroundColor Yellow
    Write-Host '  Feche o Excel e execute de novo (em qualquer computador) para atualizar a planilha.' -ForegroundColor Yellow
  }
  Write-Host ''
  if ($enviado) {
    Write-Host '  ENVIADO! Este computador já está no inventário.' -ForegroundColor Green
    Write-Host '  A página "Registrar computador" mostra o resultado sozinha. Pode fechar esta janela.' -ForegroundColor Green
  } else {
    if ($semEnvio) { Write-Host ('  Envio automático não foi possível: ' + $semEnvio) -ForegroundColor Yellow }
    Write-Host '  Próximo passo: na página "Registrar computador", importe este arquivo.' -ForegroundColor Cyan
    # pasta local (não de rede): abre o Explorer com o arquivo selecionado para facilitar a importação
    if (-not $Silencioso -and $Cfg -and $Arquivo -notmatch '^\\\\' -and ($total -is [int])) { Get-Safe { Start-Process explorer.exe -ArgumentList ('/select,"{0}"' -f $Arquivo) } | Out-Null }
  }
  exit 0
} catch {
  Write-Host ''
  Write-Host ('  ERRO ao coletar/gravar: ' + $_.Exception.Message) -ForegroundColor Red
  Write-Host '  Verifique se a pasta existe e se você tem permissão de gravação nela.' -ForegroundColor Yellow
  exit 1
}
