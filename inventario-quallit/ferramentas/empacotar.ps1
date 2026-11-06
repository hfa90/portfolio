#Requires -Version 5.1
<#
  INVENTARIO QUALLIT - empacotamento do agente
  ---------------------------------------------------------------------------------
  Gera, a partir de agente/coletor.ps1:
    web/agente/coletor.ps1                    (copia publicada, usada pela atualizacao automatica)
    web/agente/Instalar-InventarioQuallit.ps1 (instalador fixo da pagina do colaborador)
    web/agente/InventarioQuallit.msi          (pacote para Intune / SCCM / PDQ / GPO)
    web/agente/SHA256SUMS.txt                 (hashes para liberar no antivirus/EDR)

  Uso:
    .\ferramentas\empacotar.ps1                               # sem assinatura
    .\ferramentas\empacotar.ps1 -Certificado <thumbprint>     # assina tudo com o certificado de code signing
    .\ferramentas\empacotar.ps1 -SemMsi                       # so os .ps1

  Requisitos do MSI: WiX Toolset v3 (candle.exe/light.exe no PATH) no Windows, ou wixl (msitools) no Linux.
  Para assinar o MSI: signtool.exe (Windows SDK) no PATH.
  Rode de novo sempre que mudar o coletor e publique a pasta web/agente.
#>
param(
  [string]$Certificado,
  [string]$Timestamp = 'http://timestamp.digicert.com',
  [switch]$SemMsi
)
$ErrorActionPreference = 'Stop'
$raiz = Split-Path $PSScriptRoot -Parent
$saida = Join-Path $raiz 'web/agente'
function Passo([string]$t) { Write-Host ('==> ' + $t) -ForegroundColor Cyan }
function Ler([string]$p) { [IO.File]::ReadAllText($p) }
function GravarCrlf([string]$p, [string]$t, [bool]$bom = $true) {
  $t = ($t -replace "`r?`n", "`r`n")
  [IO.File]::WriteAllText($p, $t, (New-Object Text.UTF8Encoding $bom))
}
function Sha([string]$p) { (Get-FileHash -Algorithm SHA256 -Path $p).Hash.ToLower() }

# ---------------------------------------------------------------- certificado (opcional)
$cert = $null
if ($Certificado) {
  $cert = Get-ChildItem -Path Cert:\CurrentUser\My, Cert:\LocalMachine\My -CodeSigningCert |
          Where-Object { $_.Thumbprint -eq $Certificado.Replace(' ', '').ToUpper() } | Select-Object -First 1
  if (-not $cert) { throw "certificado de code signing $Certificado nao encontrado (CurrentUser\My ou LocalMachine\My)" }
  if (-not $cert.HasPrivateKey) { throw 'o certificado nao tem chave privada neste computador' }
  Passo ('Assinando com: ' + $cert.Subject + ' (valido ate ' + $cert.NotAfter.ToString('dd/MM/yyyy') + ')')
}
function Assinar([string]$p) {
  if (-not $cert) { return }
  $r = Set-AuthenticodeSignature -FilePath $p -Certificate $cert -HashAlgorithm SHA256 -TimestampServer $Timestamp
  if ($r.Status -ne 'Valid') { throw ('falha ao assinar ' + $p + ': ' + $r.StatusMessage) }
  Write-Host ('    assinado: ' + (Split-Path $p -Leaf))
}

# ---------------------------------------------------------------- configuracao publica (web/js/config.js)
$cfgjs = Ler (Join-Path $raiz 'web/js/config.js')
$url  = [regex]::Match($cfgjs, "SUPABASE_URL\s*=\s*['""]([^'""]+)").Groups[1].Value -replace '/rest/v1/?$', '' -replace '/$', ''
$anon = [regex]::Match($cfgjs, "SUPABASE_ANON_KEY\s*=\s*['""]([^'""]+)").Groups[1].Value
if (-not $url -or -not $anon) { throw 'nao encontrei SUPABASE_URL / SUPABASE_ANON_KEY em web/js/config.js' }

# ---------------------------------------------------------------- 1. coletor
$coletor = Join-Path $raiz 'agente/coletor.ps1'
$texto = Ler $coletor
$versao = [regex]::Match($texto, "\`$AgenteVersao\s*=\s*'(\d+\.\d+\.\d+)'").Groups[1].Value
if (-not $versao) { throw 'nao encontrei $AgenteVersao no coletor.ps1' }
Passo "Coletor v$versao"
# padroniza CRLF + BOM antes de assinar (o instalador reconstroi exatamente esses bytes)
if ($texto -match "(?<!`r)`n" -or -not $texto.EndsWith("`r`n")) {
  if ($texto -match '# SIG # Begin signature block') { $texto = $texto.Substring(0, $texto.IndexOf('# SIG # Begin signature block')) }
  GravarCrlf $coletor ($texto.TrimEnd() + "`r`n")
  Write-Host '    finais de linha padronizados (CRLF)'
}
Assinar $coletor
Copy-Item $coletor (Join-Path $saida 'coletor.ps1') -Force

# ---------------------------------------------------------------- 2. instalador fixo da pagina
Passo 'Instalador .ps1 da pagina do colaborador'
$bytes = [IO.File]::ReadAllBytes($coletor)
$bom = $bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF
if ($bom) { $bytes = $bytes[3..($bytes.Length - 1)] }
$txtColetor = [Text.Encoding]::UTF8.GetString($bytes)
if ($txtColetor -match "(?m)^'@") { throw "o coletor tem uma linha comecando com '@ (fecharia o here-string do instalador)" }
$hashTxt = -join ([Security.Cryptography.SHA256]::Create().ComputeHash($bytes) | ForEach-Object { $_.ToString('x2') })
$embutido = $txtColetor.Substring(0, $txtColetor.Length - 2)   # sem o ultimo CRLF (o instalador recoloca)
$modelo = Ler (Join-Path $raiz 'agente/instalador/Instalar-InventarioQuallit.modelo.ps1')
$inst = $modelo.Replace('__VERSAO__', $versao).Replace('__SUPABASE_URL__', $url).Replace('__ANON_KEY__', $anon).
               Replace('__COLETOR_SHA256__', $hashTxt).Replace('$__COLETOR_BOM__', $(if ($bom) { '$true' } else { '$false' }))
$i = $inst.IndexOf('__COLETOR_TEXTO__')
$inst = ($inst.Substring(0, $i) -replace "`r?`n", "`r`n") + $embutido + ($inst.Substring($i + 17) -replace "`r?`n", "`r`n")
$instPath = Join-Path $saida 'Instalar-InventarioQuallit.ps1'
[IO.File]::WriteAllText($instPath, $inst, (New-Object Text.UTF8Encoding $true))
$erros = $null
[void][System.Management.Automation.Language.Parser]::ParseFile($instPath, [ref]$null, [ref]$erros)
if ($erros.Count) { throw ('instalador gerado com erro de sintaxe: ' + $erros[0].Message) }
Assinar $instPath

# ---------------------------------------------------------------- 3. MSI
$msiPath = Join-Path $saida 'InventarioQuallit.msi'
if (-not $SemMsi) {
  Passo 'Pacote MSI'
  $msiDir = Join-Path $raiz 'msi'
  $arq = Join-Path $msiDir 'arquivos'
  New-Item -ItemType Directory -Path $arq -Force | Out-Null
  Copy-Item $coletor (Join-Path $arq 'coletor.ps1') -Force
  GravarCrlf (Join-Path $arq 'configurar.ps1') ((Ler (Join-Path $msiDir 'configurar.ps1')).Replace('__SUPABASE_URL__', $url).Replace('__ANON_KEY__', $anon))
  GravarCrlf (Join-Path $arq 'remover.ps1') (Ler (Join-Path $msiDir 'remover.ps1'))
  Assinar (Join-Path $arq 'configurar.ps1'); Assinar (Join-Path $arq 'remover.ps1')
  Push-Location $msiDir
  try {
    if (Get-Command wixl -ErrorAction SilentlyContinue) {
      & wixl -a x64 -D "Versao=$versao" -o $msiPath InventarioQuallit.wxs
    } elseif (Get-Command candle.exe -ErrorAction SilentlyContinue) {
      & candle.exe -nologo -arch x64 "-dVersao=$versao" -out InventarioQuallit.wixobj InventarioQuallit.wxs
      if ($LASTEXITCODE) { throw 'candle falhou' }
      & light.exe -nologo -cultures:pt-BR -out $msiPath InventarioQuallit.wixobj
    } else {
      Write-Host '    WiX nao encontrado: instale o WiX Toolset v3 (candle/light) ou o msitools (wixl). MSI nao gerado.' -ForegroundColor Yellow
      $msiPath = $null
    }
    if ($msiPath -and $LASTEXITCODE) { throw 'falha ao gerar o MSI' }
  } finally { Pop-Location }
  if ($msiPath -and $cert) {
    $st = Get-Command signtool.exe -ErrorAction SilentlyContinue
    if ($st) {
      & $st.Source sign /fd SHA256 /sha1 $cert.Thumbprint /tr $Timestamp /td SHA256 /d 'Inventario Quallit - Agente' $msiPath
      if ($LASTEXITCODE) { throw 'signtool falhou ao assinar o MSI' }
    } else { Write-Host '    signtool.exe nao encontrado: o MSI ficou sem assinatura.' -ForegroundColor Yellow }
  }
}

# ---------------------------------------------------------------- 4. hashes
Passo 'SHA-256 (para liberacao por hash no antivirus/EDR)'
$lista = @('coletor.ps1', 'Instalar-InventarioQuallit.ps1', 'InventarioQuallit.msi') | ForEach-Object {
  $p = Join-Path $saida $_
  if (Test-Path $p) { '{0}  {1}' -f (Sha $p), $_ }
}
$cab = "# Inventario Quallit - agente v$versao - gerado em $(Get-Date -Format 'yyyy-MM-dd HH:mm')" + $(if ($cert) { " - assinado por $($cert.Subject)" } else { ' - SEM assinatura' })
Set-Content -Path (Join-Path $saida 'SHA256SUMS.txt') -Value (@($cab) + $lista) -Encoding ASCII
$lista | ForEach-Object { Write-Host ('    ' + $_) }
Write-Host ''
Write-Host 'Pronto. Publique a pasta web/agente (GitHub Pages) e, se o agente mudou, use Agente coletor > Atualizacoes > Publicar.' -ForegroundColor Green
