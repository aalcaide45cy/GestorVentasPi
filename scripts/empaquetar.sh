#!/usr/bin/env bash
# Genera el archivo instalador:  gestorventas-<versión>-instalador.run  (script + paquete tar.gz incrustado).
#   ./scripts/empaquetar.sh [versión] [--offline]
# --offline incluye también las imágenes (amd64 y arm64) para instalar sin internet (salvo Docker).
# --pi  genera el instalador para Raspberry Pi: incluye la imagen de la aplicación para arm64 (el resto —PostgreSQL y
#       Tailscale— se descarga de Docker Hub al instalar) y se llama gestorventas-<versión>-pi-instalador.run
set -euo pipefail
cd "$(dirname "$0")/.."

VERSION=""
OFFLINE=0
PI=0
for a in "$@"; do
  case "$a" in
    --offline) OFFLINE=1 ;;
    --pi) PI=1 ;;
    *) VERSION="$a" ;;
  esac
done
[ -n "$VERSION" ] || VERSION="$(git describe --tags --always 2>/dev/null || echo "0.0.0-dev")"
VERSION="${VERSION#v}"
APP_IMAGE="${GV_APP_IMAGE:-ghcr.io/aalcaide45cy/gestorventaspi}"

SALIDA="dist-instalador"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$SALIDA" "$TMP/paquete/scripts"

cp instalador/docker-compose.yml instalador/LEEME.txt instalador/gestorventas.conf.ejemplo "$TMP/paquete/"
mkdir -p "$TMP/paquete/tailscale"
cp instalador/tailscale/serve.json "$TMP/paquete/tailscale/"
cp instalador/scripts/*.sh "$TMP/paquete/scripts/"
cp scripts/restaurar.sh "$TMP/paquete/scripts/restaurar.sh"
chmod +x "$TMP/paquete/scripts/"*.sh
echo "$VERSION" > "$TMP/paquete/VERSION"

if [ "$OFFLINE" -eq 1 ]; then
  mkdir -p "$TMP/paquete/imagenes"
  for arq in amd64 arm64; do
    echo "Descargando imágenes para $arq..."
    docker pull --platform "linux/$arq" "$APP_IMAGE:$VERSION"
    docker save -o "$TMP/paquete/imagenes/app-$arq.tar" "$APP_IMAGE:$VERSION"
    docker pull --platform "linux/$arq" postgres:16-bookworm
    docker save -o "$TMP/paquete/imagenes/db-$arq.tar" postgres:16-bookworm
  done
fi

if [ "$PI" -eq 1 ]; then
  mkdir -p "$TMP/paquete/imagenes"
  echo "Descargando la imagen de la aplicación para arm64..."
  docker pull --platform linux/arm64 "$APP_IMAGE:$VERSION"
  docker save -o "$TMP/paquete/imagenes/app-arm64.tar" "$APP_IMAGE:$VERSION"
fi

tar czf "$TMP/paquete.tar.gz" -C "$TMP/paquete" .

SUFIJO=""; [ "$OFFLINE" -eq 1 ] && SUFIJO="-offline"; [ "$PI" -eq 1 ] && SUFIJO="-pi"
RUN="$SALIDA/gestorventas-$VERSION$SUFIJO-instalador.run"
sed "s/@@VERSION@@/$VERSION/" instalador/gestorventas.sh > "$RUN"
# El marcador va solo en su línea; lo que sigue es el paquete binario
printf '\n__PAYLOAD_BELOW__\n' >> "$RUN"
cat "$TMP/paquete.tar.gz" >> "$RUN"
chmod +x "$RUN"
( cd "$SALIDA" && sha256sum "$(basename "$RUN")" > "$(basename "$RUN").sha256" )
cp instalador/gestorventas.conf.ejemplo "$SALIDA/gestorventas.conf.ejemplo"

echo "Generado: $RUN ($(du -h "$RUN" | cut -f1))"
