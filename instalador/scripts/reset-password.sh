#!/usr/bin/env sh
# Pone una contraseña temporal a un usuario: ./scripts/reset-password.sh correo@dominio.com
set -e
cd "$(dirname "$0")/.."
exec docker compose exec -T app node dist/scripts/reset-password.cjs "$@"
