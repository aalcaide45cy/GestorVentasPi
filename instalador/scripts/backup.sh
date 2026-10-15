#!/usr/bin/env sh
# Copia de seguridad manual (.dump) en ./backups: ./scripts/backup.sh
set -e
cd "$(dirname "$0")/.."
. ./.env
mkdir -p backups
F="backups/gv_$(date +%Y%m%d_%H%M%S)_manual.dump"
docker compose exec -T db pg_dump -Fc -Z 6 --no-owner --no-privileges -U "$POSTGRES_USER" -d "$POSTGRES_DB" > "$F"
chmod 600 "$F"
echo "Copia creada: $F ($(du -h "$F" | cut -f1))"
