# Reinicia el servidor de desarrollo (solo para el PC de desarrollo): cierra el que escucha en el puerto y lo vuelve a lanzar.
param([int]$Puerto = 3000, [string]$Carpeta = (Split-Path -Parent $PSScriptRoot))
Start-Sleep -Seconds 2
$conexion = Get-NetTCPConnection -LocalPort $Puerto -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($conexion) {
  $id = $conexion.OwningProcess
  # Se sube por los procesos padre mientras sean node/npm/cmd de este servidor, para no dejar un «npm run dev» huérfano
  $cadena = @($id)
  $actual = $id
  for ($i = 0; $i -lt 4; $i++) {
    $p = Get-CimInstance Win32_Process -Filter "ProcessId=$actual" -ErrorAction SilentlyContinue
    if (-not $p) { break }
    $padre = Get-CimInstance Win32_Process -Filter "ProcessId=$($p.ParentProcessId)" -ErrorAction SilentlyContinue
    if ($padre -and $padre.Name -match '^(node|npm|cmd)(\.exe)?$' -and $padre.CommandLine -match 'next|npm') { $cadena += $padre.ProcessId; $actual = $padre.ProcessId } else { break }
  }
  foreach ($x in $cadena) { & taskkill /PID $x /T /F | Out-Null }
  Start-Sleep -Seconds 2
}
Start-Process -FilePath "cmd.exe" -ArgumentList "/c", "npm run dev" -WorkingDirectory $Carpeta -WindowStyle Hidden
