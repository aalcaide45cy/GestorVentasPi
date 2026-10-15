#!/usr/bin/env sh
# Crea un administrador: ./scripts/crear-admin.sh "Nombre Apellidos" correo@dominio.com
set -e
cd "$(dirname "$0")/.."
exec npm run --silent crear-admin -- "$@"
