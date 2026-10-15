#!/bin/sh
# Arranque de la app: espera a la base de datos, aplica migraciones y semilla (con cerrojo) y lanza el servidor.
set -e

if [ -z "$DATABASE_URL" ]; then
  echo "Falta DATABASE_URL" >&2
  exit 1
fi

echo "Esperando a la base de datos..."
intentos=0
until pg_isready -d "$DATABASE_URL" -q; do
  intentos=$((intentos + 1))
  if [ "$intentos" -ge 60 ]; then
    echo "La base de datos no responde tras 2 minutos." >&2
    exit 1
  fi
  sleep 2
done

echo "Aplicando migraciones y semilla..."
node dist/src/db/migrar.cjs

exec "$@"
