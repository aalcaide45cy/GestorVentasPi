#!/usr/bin/env sh
# Quita el doble factor de un usuario: ./scripts/reset-2fa.sh correo@dominio.com
set -e
cd "$(dirname "$0")/.."
exec docker compose exec -T app node dist/scripts/reset-2fa.cjs "$@"
