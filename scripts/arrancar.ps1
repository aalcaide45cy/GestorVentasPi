# Arranca GestorVentas en segundo plano (sin ventana de servidor) en el ULTIMO modo en que estuvo. Lo usa start.bat.
#   arrancar.ps1          -> el ultimo modo (si no hay ninguno anotado, desarrollo)
#   arrancar.ps1 dev      -> fuerza el modo desarrollo
#   arrancar.ps1 normal   -> fuerza el modo normal (compila antes si hace falta)
# El servidor se lanza oculto (como lo hace "Equipo y servidor" dentro de la aplicacion): se puede cerrar esta ventana y sigue funcionando.
# El modo lo anota el propio servidor en .ultimo-modo cada vez que arranca.
param([string]$Modo = "", [int]$Puerto = 3000)
$carpeta = Split-Path -Parent $PSScriptRoot
Set-Location $carpeta
if ($env:PORT) { $Puerto = [int]$env:PORT }

if (-not $Modo) {
  if (Test-Path ".ultimo-modo") { $Modo = (Get-Content ".ultimo-modo" -TotalCount 1).Trim() } else { $Modo = "dev" }
}
if ($Modo -eq "desarrollo") { $Modo = "dev" }
if ($Modo -ne "normal") { $Modo = "dev" }

function Escuchando { [bool](netstat -ano -p tcp | Select-String ":$Puerto\s.*LISTENING") }

if (Escuchando) {
  Write-Host "Ya hay un servidor escuchando en el puerto $Puerto. Abre http://localhost:$Puerto"
  Write-Host 'Si quieres cambiar de modo, hazlo desde "Equipo y servidor" en la aplicacion.'
  exit 0
}

# Modo normal: se compila si no hay compilacion o si el codigo es mas nuevo que ella
$orden = "dev"
if ($Modo -eq "normal") {
  $orden = "start"
  $recompilar = -not (Test-Path ".next\BUILD_ID")
  if (-not $recompilar) {
    $b = (Get-Item ".next\BUILD_ID").LastWriteTime
    $n = (Get-ChildItem src, package.json -Recurse -File | Sort-Object LastWriteTime -Descending | Select-Object -First 1).LastWriteTime
    if ($n -gt $b) { $recompilar = $true }
  }
  if ($recompilar) { $orden = "build"; Write-Host "Modo NORMAL: hay que compilar la aplicacion (puede tardar un par de minutos)..." }
}
Write-Host "Arrancando GestorVentas en modo $(if ($Modo -eq 'normal') { 'NORMAL' } else { 'DESARROLLO' }) (en segundo plano, sin ventana)..."
# cambiar-modo.ps1 es el mismo script que usa la aplicacion: cierra lo que haya en el puerto, compila si hace falta, migra y lanza el servidor oculto
& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "cambiar-modo.ps1") -Modo $orden -Puerto $Puerto -Carpeta $carpeta

# Esperar a que responda (la primera vez en desarrollo compila la primera pagina)
$limite = (Get-Date).AddMinutes(6)
$listo = $false
while ((Get-Date) -lt $limite) {
  try {
    $r = Invoke-WebRequest -Uri "http://localhost:$Puerto/api/salud" -UseBasicParsing -TimeoutSec 20
    if ($r.StatusCode -eq 200) { $listo = $true; break }
  } catch { }
  Start-Sleep -Seconds 3
}
if ($listo) {
  Write-Host ""
  Write-Host "Listo: http://localhost:$Puerto"
  Write-Host "El servidor sigue funcionando aunque cierres esta ventana. Para pararlo o cambiar de modo: 'Equipo y servidor' en la aplicacion."
} else {
  Write-Host ""
  Write-Host "El servidor no ha respondido en 6 minutos. Mira el registro: $env:TEMP\gestorventas-dev-$Puerto.log (o gestorventas-normal-$Puerto.log / gestorventas-build.log)"
  exit 1
}
