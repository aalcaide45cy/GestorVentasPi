@echo off
rem Arranca GestorVentas en segundo plano (SIN ventana de servidor) en el ULTIMO modo en que estuvo (desarrollo o normal).
rem   start.bat           -> el ultimo modo (si no hay ninguno anotado, desarrollo)
rem   start.bat dev       -> fuerza el modo desarrollo
rem   start.bat normal    -> fuerza el modo normal (compila antes si hace falta)
rem El servidor sigue funcionando aunque cierres esta ventana. El modo se anota solo (archivo .ultimo-modo) y se cambia desde "Equipo y servidor".
setlocal
cd /d "%~dp0"
title GestorVentas - arrancando
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\arrancar.ps1" %*
echo.
pause
