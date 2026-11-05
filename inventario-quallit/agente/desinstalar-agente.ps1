#Requires -RunAsAdministrator
Unregister-ScheduledTask -TaskName 'InventarioQuallit' -Confirm:$false -ErrorAction SilentlyContinue
Remove-Item 'C:\ProgramData\InventarioQuallit' -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item 'HKLM:\SOFTWARE\InventarioQuallit' -Recurse -Force -ErrorAction SilentlyContinue
Write-Host 'Agente removido.'
