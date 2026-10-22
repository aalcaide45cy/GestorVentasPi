# Vigilante del servidor (PC con Windows): si el servidor de GestorVentas no esta escuchando, lo arranca en el ultimo modo (scripts\arrancar.ps1).
# Lo lanza una tarea programada cada 2 minutos y al iniciar sesion (ver instalar-vigilante.ps1). Para no pisar nada:
#  - no actua si el servidor se esta cambiando de modo o compilando desde la aplicacion (registros recientes en %TEMP%);
#  - solo arranca si esta parado en dos comprobaciones seguidas (asi un reinicio normal, que dura unos segundos, no cuenta).
param([int]$Puerto = 3000, [string]$Carpeta = (Split-Path -Parent $PSScriptRoot))
$estado = Join-Path $env:TEMP "gestorventas-vigilante-$Puerto.json"
$registro = Join-Path $env:TEMP "gestorventas-vigilante.log"
function Anotar($t) { "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $t" | Add-Content -Path $registro -Encoding utf8 }

if (netstat -ano -p tcp | Select-String ":$Puerto\s.*LISTENING") {
  if (Test-Path $estado) { Remove-Item $estado -Force -ErrorAction SilentlyContinue }
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
