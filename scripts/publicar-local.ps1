# Actualiza el servidor del PC (puerto 3000) con el codigo actual, en modo normal: compila en una carpeta aparte con el servidor todavia en marcha
# y solo cuando ha salido bien lo para unos segundos, cambia la carpeta y lo arranca. Si la compilacion falla, el servidor actual sigue como estaba.
# Uso:  powershell -ExecutionPolicy Bypass -File scripts\publicar-local.ps1 [-Puerto 3000]
param([int]$Puerto = 3000)
$carpeta = Split-Path -Parent $PSScriptRoot
& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "cambiar-modo.ps1") -Modo build -Puerto $Puerto -Carpeta $carpeta
if ($LASTEXITCODE -ne 0) { Write-Host "La compilacion ha fallado: el servidor sigue como estaba. Detalle: $env:TEMP\gestorventas-build.log"; exit 1 }
$limite = (Get-Date).AddMinutes(3)
while ((Get-Date) -lt $limite) {
  try { if ((Invoke-WebRequest -Uri "http://localhost:$Puerto/api/salud" -UseBasicParsing -TimeoutSec 10).StatusCode -eq 200) { Write-Host "Listo: http://localhost:$Puerto (modo normal)"; exit 0 } } catch { }
  Start-Sleep -Seconds 2
}
Write-Host "El servidor no ha respondido en 3 minutos. Mira $env:TEMP\gestorventas-normal-$Puerto.log"
exit 1
