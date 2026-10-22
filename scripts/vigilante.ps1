# Vigilante del servidor (PC con Windows): si el servidor de GestorVentas no esta escuchando, lo arranca en el ultimo modo (scripts\arrancar.ps1).
# Lo lanza una tarea programada cada 2 minutos y al iniciar sesion (ver instalar-vigilante.ps1). Para no pisar nada:
#  - no actua si el servidor se esta cambiando de modo o compilando desde la aplicacion (registros recientes en %TEMP%);
#  - solo arranca si esta parado en dos comprobaciones seguidas (asi un reinicio normal, que dura unos segundos, no cuenta).
param([int]$Puerto = 3000, [string]$Carpeta = (Split-Path -Parent $PSScriptRoot))
$estado = Join-Path $env:TEMP "gestorventas-vigilante-$Puerto.json"
$registro = Join-Path $env:TEMP "gestorventas-vigilante.log"
function Anotar($t) { "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $t" | Add-Content -Path $registro -Encoding utf8 }

# Acceso desde fuera (Tailscale Funnel): si el servidor esta en marcha, se comprueba que el Funnel sigue publicandolo y, si el equipo ha cambiado de red
# (la conexion del Funnel se puede quedar colgada sin avisar), se vuelve a abrir. Desde el propio PC no se puede probar la URL publica (resuelve a la
# red privada), asi que se vigila la configuracion y el cambio de red.
function Vigilar-Funnel {
  $ts = "C:\Program Files\Tailscale\tailscale.exe"
  if (-not (Test-Path $ts)) { return }
  $estadoRed = Join-Path $env:TEMP "gestorventas-vigilante-red.txt"
  $cfg = Get-NetIPConfiguration -ErrorAction SilentlyContinue | Where-Object { $_.IPv4DefaultGateway -and $_.NetAdapter.Status -eq "Up" -and $_.InterfaceAlias -notmatch "Tailscale" } | Select-Object -First 1
  $red = if ($cfg) { "$($cfg.IPv4Address.IPAddress)|$($cfg.IPv4DefaultGateway.NextHop)" } else { "" }
  $antes = if (Test-Path $estadoRed) { (Get-Content $estadoRed -TotalCount 1) } else { "" }
  if ($red) { $red | Set-Content -Path $estadoRed -Encoding utf8 }
  $recargar = $false
  $motivo = ""
  $estadoFunnel = (& $ts funnel status 2>&1 | Out-String)
  if ($estadoFunnel -notmatch "Funnel on" -or $estadoFunnel -notmatch "127\.0\.0\.1:$Puerto") { $recargar = $true; $motivo = "el Funnel no estaba publicando el puerto $Puerto" }
  elseif ($red -and $antes -and $red -ne $antes) { $recargar = $true; $motivo = "el equipo ha cambiado de red ($antes -> $red)" }
  if (-not $recargar) { return }
  Anotar "Funnel: se vuelve a abrir porque $motivo"
  & $ts funnel reset 2>&1 | Out-Null
  Start-Sleep -Seconds 2
  & $ts funnel --bg $Puerto 2>&1 | Out-Null
  Anotar "Funnel: reabierto (codigo $LASTEXITCODE)"
}

if (netstat -ano -p tcp | Select-String ":$Puerto\s.*LISTENING") {
  if (Test-Path $estado) { Remove-Item $estado -Force -ErrorAction SilentlyContinue }
  # Solo para el servidor real (puerto 3000): la copia de prueba no tiene Funnel
  if ($Puerto -eq 3000) { try { Vigilar-Funnel } catch { Anotar "Funnel: error al comprobarlo ($($_.Exception.Message))" } }
  exit 0
}

# Cambio de modo, compilacion o migracion en curso (los escriben cambiar-modo.ps1 y la aplicacion)
foreach ($n in @("gestorventas-modo.log", "gestorventas-build.log", "gestorventas-migrar.log")) {
  $f = Join-Path $env:TEMP $n
  if ((Test-Path $f) -and ((Get-Date) - (Get-Item $f).LastWriteTime).TotalMinutes -lt 10) { exit 0 }
}

if (-not (Test-Path $estado)) {
  (Get-Date).ToString("o") | Set-Content -Path $estado -Encoding utf8
  exit 0
}
$desde = [datetime]::Parse((Get-Content $estado -TotalCount 1))
if (((Get-Date) - $desde).TotalSeconds -lt 90) { exit 0 }

Remove-Item $estado -Force -ErrorAction SilentlyContinue
Anotar "El servidor del puerto $Puerto llevaba parado desde $($desde.ToString('HH:mm:ss')): se arranca"
# El arranque se lanza con WMI para que el servidor quede FUERA de la tarea programada: si no, la tarea no terminaria nunca (el servidor seria su
# hijo) y el sistema la cortaria, con el servidor dentro, al cumplirse su limite de tiempo.
$guion = Join-Path $PSScriptRoot "arrancar.ps1"
$orden = "powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"$guion`" -Puerto $Puerto"
$inicio = New-CimInstance -ClassName Win32_ProcessStartup -ClientOnly -Property @{ ShowWindow = [uint16]0 }
$r = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{ CommandLine = $orden; CurrentDirectory = $Carpeta; ProcessStartupInformation = $inicio }
Anotar "Arranque lanzado (WMI, codigo $($r.ReturnValue), proceso $($r.ProcessId))"
