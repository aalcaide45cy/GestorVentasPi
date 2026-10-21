# Copia del servidor con la base de datos TAL COMO ESTÁ AHORA: una copia del proyecto en la carpeta temporal, con una copia (clon) de la base real
# (gestorventas_ui_real), un administrador de prueba con doble factor de secreto conocido y su propio puerto (3101). Sirve para abrir la
# aplicación en el navegador y revisarla con los datos reales sin tocarlos: todo lo que se haga se hace sobre el clon. Vive fuera del repositorio
# y no se sube nunca a GitHub; el clon guarda los mismos datos (y documentos) que la base real, así que no se comparte con nadie.
#
# Uso:  powershell -ExecutionPolicy Bypass -File scripts\prueba-interfaz-real.ps1            -> sincroniza el código, migra y arranca en http://localhost:3101
#       powershell -ExecutionPolicy Bypass -File scripts\prueba-interfaz-real.ps1 -Recrear   -> borra la copia y su clon y los monta de nuevo desde la base real
param([switch]$Recrear, [int]$Puerto = 3101)
$origen = Split-Path -Parent $PSScriptRoot
$temporal = Join-Path ([Environment]::GetFolderPath("LocalApplicationData")) "Temp"
$dest = Join-Path $temporal "gv-ui-real"
$registro = Join-Path $temporal "gv-ui-real.log"
$nombreClon = "gestorventas_ui_real"

# Datos de conexión de la base real (del .env del proyecto)
$env_ = Get-Content (Join-Path $origen ".env") | Where-Object { $_ -match '^(DATABASE_URL|APP_SECRET)=' }
$url = ($env_ | Where-Object { $_ -like 'DATABASE_URL=*' }) -replace '^DATABASE_URL=', ''
$secreto = ($env_ | Where-Object { $_ -like 'APP_SECRET=*' }) -replace '^APP_SECRET=', ''
if (-not $url) { throw "Falta DATABASE_URL en el .env" }
$urlClon = $url -replace '/[^/]+$', "/$nombreClon"
$urlAdmin = $url -replace '/[^/]+$', '/postgres'
$contenedor = "gestorventas-db"

function Parar-Servidor {
  Get-NetTCPConnection -LocalPort $Puerto -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
  Start-Sleep -Seconds 2
}
$env:MSYS_NO_PATHCONV = "1"

if ($Recrear) {
  Parar-Servidor
  & docker exec $contenedor psql $urlAdmin -c "drop database if exists $nombreClon with (force)" | Out-Null
  if (Test-Path $dest) { Remove-Item $dest -Recurse -Force }
}

$nueva = -not (Test-Path $dest)
if ($nueva) { New-Item -ItemType Directory $dest | Out-Null }

# Código actual (sin node_modules, .git, datos ni copias de seguridad del propietario)
robocopy $origen $dest /MIR /XD node_modules .next .git backups data uploads .claude /XF .env *.log /NFL /NDL /NJH /NJS /NP | Out-Null
if (-not (Test-Path "$dest\node_modules\next")) { robocopy "$origen\node_modules" "$dest\node_modules" /E /NFL /NDL /NJH /NJS /NP /MT:16 | Out-Null }

# Clon de la base real (solo se lee de ella): volcado dentro del contenedor y restauración en la base nueva
$hay = (& docker exec $contenedor psql $urlAdmin -tAc "select 1 from pg_database where datname = '$nombreClon'")
if (-not $hay) {
  & docker exec $contenedor psql $urlAdmin -c "create database $nombreClon" | Out-Null
  & docker exec $contenedor sh -c "pg_dump -Fc '$url' -f /tmp/clon-real.dump && pg_restore --no-owner --no-privileges -d '$urlClon' /tmp/clon-real.dump; rm -f /tmp/clon-real.dump"
  Write-Output "Base real clonada en $nombreClon"
}

# El clon usa el mismo APP_SECRET que la base real (los documentos y el doble factor van cifrados con él), solo dentro de esta copia
Set-Content -Path (Join-Path $dest ".env") -Value "DATABASE_URL=$urlClon`nAPP_SECRET=$secreto`nTZ=Europe/Madrid`n" -Encoding ascii

Push-Location $dest
& npx tsx --env-file=.env src/db/migrar.ts
& npx tsx --env-file=.env scripts/prueba-interfaz-sembrar.ts
Pop-Location

if (-not (Get-NetTCPConnection -LocalPort $Puerto -State Listen -ErrorAction SilentlyContinue)) {
  Start-Process -FilePath "cmd.exe" -ArgumentList "/c", "npx next dev -p $Puerto > `"$registro`" 2>&1" -WorkingDirectory $dest -WindowStyle Hidden
  Write-Output "Copia con la base real arrancando en http://localhost:${Puerto} (registro: ${registro})"
} else {
  Write-Output "Copia con la base real ya en marcha en http://localhost:${Puerto}: recarga la página"
}
Write-Output "Usuario: prueba@prueba.test  Contraseña: Contrasena-de-prueba-123  Código 2FA: npx tsx --env-file=.env scripts/prueba-interfaz-codigo.ts (dentro de ${dest})"
