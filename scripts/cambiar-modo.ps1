# Cambia el servidor del PC entre modo desarrollo (npm run dev: se actualiza solo al tocar el codigo) y modo normal
# (npm run build + npm start: mas rapido, es como corre en la Raspberry). Solo para el PC de desarrollo.
# "start" = reiniciar el modo normal SIN volver a compilar (lo usa "Reiniciar servidor" cuando ya esta en modo normal).
# Cierra el servidor que escucha en el puerto, compila si hace falta y lo vuelve a lanzar. Si la compilacion falla, vuelve al modo desarrollo.
param([Parameter(Mandatory = $true)][ValidateSet("dev", "build", "start")][string]$Modo, [int]$Puerto = 3000, [string]$Carpeta = (Split-Path -Parent $PSScriptRoot))
$registro = Join-Path $env:TEMP "gestorventas-modo.log"
function Anotar($t) { "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $t" | Add-Content -Path $registro -Encoding utf8 }
# El servidor que lanza este script hereda variables suyas (NODE_ENV=development, NEXT_*...) que romperian la compilacion o el arranque del otro modo
Get-ChildItem Env: | Where-Object { $_.Name -match '^(NODE_ENV|__NEXT_|NEXT_|TURBOPACK)' } | ForEach-Object { Remove-Item "Env:$($_.Name)" -ErrorAction SilentlyContinue }
Set-Content -Path $registro -Value "" -Encoding utf8
Anotar "Cambio a modo $Modo (puerto $Puerto, carpeta $Carpeta)"
Start-Sleep -Seconds 2

function Parar-Servidor {
  Anotar "Buscando el servidor del puerto $Puerto"
  # netstat es instantaneo (Get-NetTCPConnection tarda decenas de segundos en algunos equipos)
  $linea = netstat -ano -p tcp | Select-String ":$Puerto\s.*LISTENING" | Select-Object -First 1
  if (-not $linea) { return }
  $id = [int]($linea.ToString().Trim() -split "\s+")[-1]
  # Una sola consulta de procesos (cada Get-CimInstance suelto tarda ~10 s): se sube por los padres mientras sean node/npm/cmd de este servidor,
  # para no dejar un "npm run dev" huerfano
  $todos = @{}
  Get-CimInstance Win32_Process | ForEach-Object { $todos[[int]$_.ProcessId] = $_ }
  $cadena = @($id)
  $actual = $id
  for ($i = 0; $i -lt 4; $i++) {
    $p = $todos[$actual]
    if (-not $p) { break }
    $padre = $todos[[int]$p.ParentProcessId]
    if ($padre -and $padre.Name -match '^(node|npm|cmd)(\.exe)?$' -and $padre.CommandLine -match 'next|npm') { $cadena += $padre.ProcessId; $actual = $padre.ProcessId } else { break }
  }
  Anotar "Cerrando procesos: $($cadena -join ', ')"
  # Se cierra desde el de arriba: arrastra a todo su arbol
  $arriba = $cadena[-1]
  & taskkill /PID $arriba /T /F | Out-Null
  foreach ($x in $cadena) { & taskkill /PID $x /T /F 2>&1 | Out-Null }
  Anotar "Procesos cerrados"
  Start-Sleep -Seconds 2
}

function Lanzar($orden, $salida) {
  $env:PORT = "$Puerto"
  Start-Process -FilePath "cmd.exe" -ArgumentList "/c", "$orden > `"$salida`" 2>&1" -WorkingDirectory $Carpeta -WindowStyle Hidden
}

Parar-Servidor
if ($Modo -eq "dev") {
  Anotar "Lanzando npm run dev"
  Lanzar "npm run dev" (Join-Path $env:TEMP "gestorventas-dev-$Puerto.log")
  exit 0
}

# Modo normal: compilar (aqui esta la espera larga; con "start" se salta), aplicar las migraciones y arrancar
$salidaBuild = Join-Path $env:TEMP "gestorventas-build.log"
if ($Modo -eq "build") {
  Anotar "Compilando (npm run build)..."
  $p = Start-Process -FilePath "cmd.exe" -ArgumentList "/c", "npm run build > `"$salidaBuild`" 2>&1" -WorkingDirectory $Carpeta -WindowStyle Hidden -PassThru -Wait
  if ($p.ExitCode -ne 0) {
    Anotar "La compilacion ha fallado (codigo $($p.ExitCode)); detalle en $salidaBuild. Se vuelve al modo desarrollo."
    Lanzar "npm run dev" (Join-Path $env:TEMP "gestorventas-dev-$Puerto.log")
    exit 1
  }
} else {
  Anotar "Reinicio en modo normal sin recompilar"
}
Anotar "Compilado. Aplicando migraciones y arrancando npm start"
$m = Start-Process -FilePath "cmd.exe" -ArgumentList "/c", "npm run db:migrate > `"$(Join-Path $env:TEMP 'gestorventas-migrar.log')`" 2>&1" -WorkingDirectory $Carpeta -WindowStyle Hidden -PassThru -Wait
if ($m.ExitCode -ne 0) { Anotar "Las migraciones han fallado (codigo $($m.ExitCode)); se vuelve al modo desarrollo."; Lanzar "npm run dev" (Join-Path $env:TEMP "gestorventas-dev-$Puerto.log"); exit 1 }
Lanzar "npm start" (Join-Path $env:TEMP "gestorventas-normal-$Puerto.log")
exit 0
