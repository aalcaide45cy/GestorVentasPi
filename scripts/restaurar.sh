#!/usr/bin/env sh
# Restaura una copia .dump SIN usar la aplicación (reinstalación en una máquina nueva o app caída).
#   ./scripts/restaurar.sh backups/gv_20261015_033000_auto.dump
# Requiere Docker Compose con los servicios «db» (PostgreSQL) y «app». Pide confirmación.
set -e
cd "$(dirname "$0")/.."

FICHERO="$1"
if [ -z "$FICHERO" ] || [ ! -f "$FICHERO" ]; then
  echo "Uso: ./scripts/restaurar.sh ruta/al/fichero.dump" >&2
  exit 1
fi
case "$FICHERO" in
  *.dump) ;;
  *) echo "El fichero debe terminar en .dump" >&2; exit 1 ;;
esac

# Variables de la base de datos (de .env o valores por defecto)
[ -f .env ] && set -a && . ./.env && set +a
BD_USUARIO="${POSTGRES_USER:-gestor}"
BD_NOMBRE="${POSTGRES_DB:-gestorventas}"

echo "Se van a SUSTITUIR todos los datos de la base «$BD_NOMBRE» por los de:"
echo "  $FICHERO"
printf "Escribe RESTAURAR para continuar: "
read -r RESPUESTA
[ "$RESPUESTA" = "RESTAURAR" ] || { echo "Cancelado."; exit 1; }

echo "1/4 Comprobando que el fichero es una copia válida..."
docker compose exec -T db pg_restore --list < "$FICHERO" > /dev/null

echo "2/4 Copia de seguridad previa del estado actual..."
mkdir -p backups
PREVIA="backups/gv_$(date +%Y%m%d_%H%M%S)_previa.dump"
docker compose exec -T db pg_dump -Fc -Z 6 --no-owner --no-privileges -U "$BD_USUARIO" -d "$BD_NOMBRE" > "$PREVIA" || echo "(no se pudo hacer la copia previa: la base puede estar vacía)"
chmod 600 "$PREVIA" 2>/dev/null || true

echo "3/4 Restaurando..."
docker compose stop app 2>/dev/null || true
docker compose exec -T db pg_restore --clean --if-exists --no-owner --no-privileges --single-transaction -U "$BD_USUARIO" -d "$BD_NOMBRE" < "$FICHERO"

echo "4/4 Aplicando migraciones pendientes y cerrando sesiones..."
docker compose up -d app
docker compose exec -T app node dist/src/db/migrar.cjs
docker compose exec -T db psql -U "$BD_USUARIO" -d "$BD_NOMBRE" -c "TRUNCATE TABLE sesiones, login_intentos;"

echo "Hecho. Copia previa guardada en: $PREVIA"
echo "Recuerda: el 2FA solo se descifra con el mismo APP_SECRET que había al crear la copia."
