#Requires -Version 5.1
# INVENTARIO QUALLIT - limpeza feita pelo MSI ao desinstalar (roda como SYSTEM)
$ErrorActionPreference = 'SilentlyContinue'
Unregister-ScheduledTask -TaskName 'InventarioQuallit' -Confirm:$false
Unregister-ScheduledTask -TaskName 'InventarioQuallit-Coletar' -Confirm:$false
Remove-Item 'HKLM:\SOFTWARE\Classes\inventario-quallit' -Recurse -Force
# arquivos criados pelo agente (o MSI remove os que ele instalou)
foreach ($n in 'config.json', 'estado.json', 'estado.json.tmp', 'coletor.log', 'coletor.log.1', 'coletor.ps1.bak', 'coletor.ps1.novo', 'instalacao.log') {
  Remove-Item (Join-Path $PSScriptRoot $n) -Force
}
Remove-Item (Join-Path $PSScriptRoot 'fila') -Recurse -Force
exit 0
