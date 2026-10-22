# Instala (o quita con -Quitar) la tarea programada "GestorVentas vigilante": cada 2 minutos y al iniciar sesion comprueba que el servidor
# esta en marcha y, si no, lo arranca en el ultimo modo (scripts\vigilante.ps1). Solo para el PC con Windows; no necesita permisos de administrador.
#   powershell -ExecutionPolicy Bypass -File scripts\instalar-vigilante.ps1            -> instalar
#   powershell -ExecutionPolicy Bypass -File scripts\instalar-vigilante.ps1 -Quitar    -> quitar
param([switch]$Quitar, [int]$Puerto = 3000, [string]$Carpeta = (Split-Path -Parent $PSScriptRoot), [string]$Nombre = "GestorVentas vigilante")
if ($Quitar) {
  Unregister-ScheduledTask -TaskName $Nombre -Confirm:$false -ErrorAction SilentlyContinue
  Write-Host "Tarea '$Nombre' quitada."
  exit 0
}
$guion = Join-Path $Carpeta "scripts\vigilante.ps1"
# conhost --headless: se ejecuta sin abrir ninguna ventana
$accion = New-ScheduledTaskAction -Execute "conhost.exe" -Argument "--headless powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"$guion`" -Puerto $Puerto -Carpeta `"$Carpeta`"" -WorkingDirectory $Carpeta
$cada2 = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 2)
$alEntrar = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$ajustes = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 15) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
Register-ScheduledTask -TaskName $Nombre -Action $accion -Trigger @($cada2, $alEntrar) -Settings $ajustes -Description "Si el servidor de GestorVentas esta parado, lo arranca en el ultimo modo." -Force | Out-Null
Write-Host "Tarea '$Nombre' instalada: comprueba el puerto $Puerto cada 2 minutos y al iniciar sesion."
