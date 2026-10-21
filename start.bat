@echo off
rem Arranca GestorVentas en el ULTIMO modo en que estuvo (desarrollo o normal).
rem   start.bat           -> el ultimo modo (si no hay ninguno anotado, desarrollo)
rem   start.bat dev       -> fuerza el modo desarrollo
rem   start.bat normal    -> fuerza el modo normal (compila antes si hace falta)
rem El modo se anota solo cada vez que el servidor arranca (archivo .ultimo-modo) y al cambiarlo desde "Equipo y servidor".
setlocal
cd /d "%~dp0"
title GestorVentas - servidor
if "%PORT%"=="" set PORT=3000

set MODO=%~1
if "%MODO%"=="" (
  if exist ".ultimo-modo" (set /p MODO=<".ultimo-modo") else (set MODO=dev)
)
if /i "%MODO%"=="desarrollo" set MODO=dev
if /i not "%MODO%"=="normal" set MODO=dev

rem Si ya hay algo escuchando en el puerto, no se arranca otro
netstat -ano -p tcp | findstr /r /c:":%PORT% .*LISTENING" >nul
if not errorlevel 1 (
  echo Ya hay un servidor escuchando en el puerto %PORT%. Abre http://localhost:%PORT%
  echo Si quieres cambiar de modo, hazlo desde "Equipo y servidor" en la aplicacion.
  pause
  exit /b 0
)

if /i "%MODO%"=="dev" goto desarrollo

echo === Modo NORMAL ===
rem Se compila si no hay compilacion o si el codigo es mas nuevo que ella
set RECOMPILAR=0
if not exist ".next\BUILD_ID" set RECOMPILAR=1
if "%RECOMPILAR%"=="0" (
  powershell -NoProfile -Command "$b=(Get-Item '.next\BUILD_ID').LastWriteTime; $n=(Get-ChildItem src,package.json -Recurse -File | Sort-Object LastWriteTime -Descending | Select-Object -First 1).LastWriteTime; if ($n -gt $b) { exit 1 } else { exit 0 }"
  if errorlevel 1 set RECOMPILAR=1
)
if "%RECOMPILAR%"=="1" (
  echo Compilando la aplicacion ^(puede tardar un par de minutos^)...
  call npm run build
  if errorlevel 1 (
    echo.
    echo La compilacion ha fallado. Se arranca en modo desarrollo.
    goto desarrollo
  )
)
call npm run db:migrate
if errorlevel 1 (
  echo Las migraciones han fallado. Se arranca en modo desarrollo.
  goto desarrollo
)
echo Arrancando en modo normal en http://localhost:%PORT% ...
call npm start
goto fin

:desarrollo
echo === Modo DESARROLLO ===
echo Arrancando en modo desarrollo en http://localhost:%PORT% ...
call npm run dev

:fin
echo.
echo El servidor se ha detenido.
pause
