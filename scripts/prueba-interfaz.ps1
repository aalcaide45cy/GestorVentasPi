# Copia de prueba de la interfaz: una copia del proyecto en la carpeta temporal, con su propia base de datos vacía (gestorventas_ui_prueba),
# su propio .env y un administrador de prueba con doble factor de secreto conocido. Sirve para abrir la aplicación en el navegador y revisarla
# sin tocar los datos reales ni crear usuarios sin 2FA. No se sube nunca a GitHub (vive fuera del repositorio).
#
# Uso:  powershell -ExecutionPolicy Bypass -File scripts\prueba-interfaz.ps1            -> sincroniza el código, migra y arranca en http://localhost:3100
#       powershell -ExecutionPolicy Bypass -File scripts\prueba-interfaz.ps1 -Recrear   -> borra la copia y su base de prueba y la monta de nuevo
param([switch]$Recrear, [int]$Puerto = 3100)
$origen = Split-Path -Parent $PSScriptRoot
$dest = Join-Path $env:TEMP "gv-ui-prueba"
$registro = Join-Path $env:TEMP "gv-ui-prueba.log"

function Parar-Servidor {
  Get-NetTCPConnection -LocalPort $Puerto -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
  Start-Sleep -Seconds 2
}

if ($Recrear -and (Test-Path $dest)) {
  Parar-Servidor
  # Solo se borra la copia de la carpeta temporal (nunca el proyecto real) y la base de datos de prueba
  Push-Location $origen
  & npx tsx --env-file=.env scripts/prueba-interfaz-bd.ts borrar
  Pop-Location
  Remove-Item $dest -Recurse -Force
}

$nueva = -not (Test-Path $dest)
if ($nueva) { New-Item -ItemType Directory $dest | Out-Null }

# Código actual (sin node_modules, .git, datos ni copias de seguridad del propietario)
robocopy $origen $dest /MIR /XD node_modules .next .git backups data uploads .claude /XF .env *.log /NFL /NDL /NJH /NJS /NP | Out-Null
# node_modules se copia de verdad una sola vez (con un enlace Turbopack no compila); cuesta ~1 GB temporal
if (-not (Test-Path "$dest\node_modules\next")) { robocopy "$origen\node_modules" "$dest\node_modules" /E /NFL /NDL /NJH /NJS /NP /MT:16 | Out-Null }

Push-Location $origen
& npx tsx --env-file=.env scripts/prueba-interfaz-bd.ts crear $dest
Pop-Location

Push-Location $dest
& npx tsx --env-file=.env src/db/migrar.ts
& npx tsx --env-file=.env scripts/prueba-interfaz-sembrar.ts
Pop-Location

if (-not (Get-NetTCPConnection -LocalPort $Puerto -State Listen -ErrorAction SilentlyContinue)) {
  Start-Process -FilePath "cmd.exe" -ArgumentList "/c", "npx next dev -p $Puerto > `"$registro`" 2>&1" -WorkingDirectory $dest -WindowStyle Hidden
  Write-Output "Copia de prueba arrancando en http://localhost:${Puerto} (registro: ${registro})"
} else {
  Write-Output "Copia de prueba ya en marcha en http://localhost:${Puerto}: recarga la página"
}
Write-Output "Usuario: prueba@prueba.test  Contraseña: Contrasena-de-prueba-123  Código 2FA: npx tsx scripts/prueba-interfaz-codigo.ts (dentro de ${dest})"
