#!/usr/bin/env sh
# Descarga la última versión de GitHub, la construye aquí y reinicia el servicio.
set -e
cd "$(dirname "$0")/.."
git pull --ff-only
npm ci --onnxruntime-node-install=skip
npm run db:migrate
npm run build
# Quita de la compilacion las copias de backups, data y referencia que Next mete dentro (unos 22 GB); las carpetas reales no se tocan
for d in backups data referencia; do [ -d ".next/standalone/$d" ] && [ ! -L ".next/standalone/$d" ] && rm -rf ".next/standalone/$d"; done
# Reinicia en modo normal (para el servidor que haya en el puerto 3000 y arranca el nuevo; el arranque automatico de launchd espera su turno)
bash scripts/cambiar-modo.sh start
sleep 30
curl -fsS http://localhost:3000/api/salud && echo " <- actualizado y funcionando"
