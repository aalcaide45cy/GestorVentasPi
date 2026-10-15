#!/usr/bin/env bash
# GestorVentasPi — instalador y gestor.
# Como archivo instalador (.run) incluye el paquete al final; ya instalado se usa con subcomandos:
#   ./gestorventas.sh --estado | --logs | --actualizar | --restaurar fichero.dump | --desinstalar [--borrar-datos]
# Variables útiles (modo no interactivo): GV_DIR, GV_SI=1, GV_ADMIN_NOMBRE, GV_ADMIN_EMAIL, GV_ADMIN_PASSWORD,
# GV_ACCESO=tailscale|cloudflare|ninguno, GV_BIND=0.0.0.0, GV_APP_IMAGE, GV_APP_VERSION.
set -euo pipefail

VERSION="@@VERSION@@"
DIR="${GV_DIR:-/opt/gestorventas}"
APP_IMAGE_POR_DEFECTO="ghcr.io/aalcaide45cy/gestorventaspi"

rojo() { printf '\033[31m%s\033[0m\n' "$*" >&2; }
verde() { printf '\033[32m%s\033[0m\n' "$*"; }
azul() { printf '\033[36m%s\033[0m\n' "$*"; }
aviso() { printf '\033[33m%s\033[0m\n' "$*"; }
fallar() { rojo "ERROR: $*"; exit 1; }

preguntar() { # preguntar "texto" "valor por defecto" -> imprime la respuesta
  local texto="$1" defecto="${2:-}" respuesta
  if [ "${GV_SI:-0}" = "1" ]; then printf '%s' "$defecto"; return; fi
  read -r -p "$texto${defecto:+ [$defecto]}: " respuesta
  printf '%s' "${respuesta:-$defecto}"
}

confirmar() { # confirmar "texto" -> 0 si sí
  [ "${GV_SI:-0}" = "1" ] && return 0
  local r
  read -r -p "$1 [s/N]: " r
  [ "$r" = "s" ] || [ "$r" = "S" ]
}

necesita_root() { [ "$(id -u)" -eq 0 ] || fallar "Ejecuta este comando con sudo."; }

# ---------------------------------------------------------------- comprobaciones
detectar_arquitectura() {
  case "$(uname -m)" in
    x86_64|amd64) ARQ="amd64" ;;
    aarch64|arm64) ARQ="arm64" ;;
    *) fallar "Arquitectura no soportada: $(uname -m) (solo amd64 y arm64)." ;;
  esac
}

ram_mb() { awk '/MemTotal/ {printf "%d", $2/1024}' /proc/meminfo; }
disco_libre_mb() { df -Pm "$(dirname "$DIR")" 2>/dev/null | awk 'NR==2 {print $4}'; }

hay_docker() { command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; }

instalar_docker() {
  azul "Docker no está instalado."
  if [ -f /etc/synoinfo.conf ]; then
    fallar "En Synology instala «Container Manager» desde el Centro de paquetes y vuelve a ejecutar el instalador."
  fi
  confirmar "¿Instalo Docker con el método oficial (get.docker.com)?" || fallar "Sin Docker no se puede continuar."
  command -v curl >/dev/null 2>&1 || { apt-get update -y && apt-get install -y curl ca-certificates; }
  curl -fsSL https://get.docker.com | sh
  systemctl enable --now docker 2>/dev/null || true
  hay_docker || fallar "No se pudo instalar Docker con Compose."
}

# ---------------------------------------------------------------- .env
aleatorio() { openssl rand -base64 "$1" | tr -d '\n=+/' | cut -c1-"$2"; }

fijar_env() { # fijar_env CLAVE VALOR -> añade o sustituye en .env
  local clave="$1" valor="$2" f="$DIR/.env"
  if grep -q "^${clave}=" "$f" 2>/dev/null; then
    local tmp; tmp="$(mktemp)"
    awk -v k="$clave" -v v="$valor" 'BEGIN{FS=OFS="="} $1==k {print k "=" v; next} {print}' "$f" > "$tmp"
    cat "$tmp" > "$f"; rm -f "$tmp"
  else
    printf '%s=%s\n' "$clave" "$valor" >> "$f"
  fi
}

crear_env() {
  if [ -f "$DIR/.env" ]; then
    azul "Ya existe $DIR/.env: se conserva (no se sobrescribe)."
    return
  fi
  local ram; ram="$(ram_mb)"
  local db_mem app_mem sb cache
  if [ "$ram" -ge 12000 ]; then db_mem="4g"; app_mem="2g"; sb="1GB"; cache="6GB"
  elif [ "$ram" -ge 6000 ]; then db_mem="1500m"; app_mem="1024m"; sb="384MB"; cache="2GB"
  elif [ "$ram" -ge 3000 ]; then db_mem="900m"; app_mem="700m"; sb="192MB"; cache="1GB"
  else db_mem="500m"; app_mem="450m"; sb="96MB"; cache="512MB"; aviso "Poca RAM (${ram} MB): la aplicación funcionará justa."
  fi
  local pg_pass; pg_pass="$(aleatorio 36 40)"
  umask 077
  cat > "$DIR/.env" <<EOF
# Generado por el instalador de GestorVentasPi $VERSION. NO lo compartas y guarda una copia aparte.
TZ=Europe/Madrid
POSTGRES_USER=gestor
POSTGRES_DB=gestorventas
POSTGRES_PASSWORD=$pg_pass
DATABASE_URL=postgres://gestor:$pg_pass@db:5432/gestorventas
APP_SECRET=$(openssl rand -base64 48 | tr -d '\n')
APP_IMAGE=${GV_APP_IMAGE:-$APP_IMAGE_POR_DEFECTO}
APP_VERSION=${GV_APP_VERSION:-$VERSION}
APP_PORT=${GV_PORT:-3000}
BIND_ADDRESS=${GV_BIND:-127.0.0.1}
TUNNEL_MODE=ninguno
TRUST_PROXY=false
PUBLIC_URL=
CLOUDFLARE_TUNNEL_TOKEN=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
DB_MEM_LIMIT=$db_mem
APP_MEM_LIMIT=$app_mem
PG_SHARED_BUFFERS=$sb
PG_CACHE=$cache
COOKIE_SECURE=${GV_COOKIE_SECURE:-true}
EOF
  chmod 600 "$DIR/.env"
  verde "Creado $DIR/.env (RAM detectada: ${ram} MB → BD $db_mem, app $app_mem)."
}

# ---------------------------------------------------------------- compose
dc() { (cd "$DIR" && docker compose "$@"); }

esperar_sano() {
  azul "Esperando a que la aplicación esté sana (puede tardar un par de minutos la primera vez)..."
  local i estado
  for i in $(seq 1 90); do
    estado="$(dc ps --format '{{.Service}} {{.Health}}' 2>/dev/null | awk '$1=="app" {print $2}')"
    if [ "$estado" = "healthy" ]; then verde "La aplicación está en marcha."; return 0; fi
    sleep 4
  done
  rojo "La aplicación no ha llegado a estar sana. Últimas líneas del registro:"
  dc logs --tail=40 app || true
  return 1
}

# ---------------------------------------------------------------- acceso exterior
acceso_tailscale() {
  if ! command -v tailscale >/dev/null 2>&1; then
    azul "Instalando Tailscale (instalador oficial)..."
    curl -fsSL https://tailscale.com/install.sh | sh
  fi
  azul "Inicia sesión en Tailscale con tu cuenta (se mostrará un enlace):"
  tailscale up
  azul "Publicando la aplicación con Tailscale Funnel (necesitas haber activado HTTPS y Funnel en el panel de Tailscale)..."
  tailscale funnel --bg "$(grep '^APP_PORT=' "$DIR/.env" | cut -d= -f2)" || aviso "No se pudo activar Funnel: revisa que HTTPS y Funnel estén habilitados para este equipo en el panel de Tailscale."
  local dns
  dns="$(tailscale status --json 2>/dev/null | grep -o '"DNSName": *"[^"]*"' | head -1 | sed 's/.*: *"//; s/\.\?"$//')"
  if [ -n "$dns" ]; then
    fijar_env PUBLIC_URL "https://$dns"
    fijar_env TUNNEL_MODE tailscale
    fijar_env TRUST_PROXY true
    verde "URL pública: https://$dns"
  else
    aviso "No pude leer el nombre público. Pon PUBLIC_URL a mano en $DIR/.env."
  fi
}

acceso_cloudflare() {
  local token host
  token="$(preguntar "Token del túnel de Cloudflare" "")"
  host="$(preguntar "Nombre público (p. ej. ventas.midominio.com)" "")"
  [ -n "$token" ] && [ -n "$host" ] || { aviso "Faltan datos: se omite Cloudflare."; return; }
  fijar_env CLOUDFLARE_TUNNEL_TOKEN "$token"
  fijar_env PUBLIC_URL "https://$host"
  fijar_env TUNNEL_MODE cloudflare
  fijar_env TRUST_PROXY true
  (cd "$DIR" && docker compose --profile cloudflare up -d)
}

# ---------------------------------------------------------------- subcomandos
cmd_instalar() {
  necesita_root
  detectar_arquitectura
  azul "GestorVentasPi $VERSION — arquitectura $ARQ, RAM $(ram_mb) MB, disco libre $(disco_libre_mb) MB"
  [ "$(disco_libre_mb)" -ge 2048 ] || aviso "Hay menos de 2 GB libres en disco."
  hay_docker || instalar_docker

  mkdir -p "$DIR"
  extraer_paquete "$DIR"
  mkdir -p "$DIR/data" "$DIR/backups"
  chown 1000:1000 "$DIR/backups" 2>/dev/null || true
  crear_env

  if [ -d "$DIR/imagenes" ]; then
    azul "Cargando imágenes incluidas en el instalador..."
    for f in "$DIR"/imagenes/*"$ARQ"*.tar; do [ -f "$f" ] && docker load -i "$f"; done
  else
    azul "Descargando imágenes..."
    dc pull db
    # Si la imagen de la app ya está en este equipo (p. ej. construida en local) no se vuelve a descargar
    # shellcheck disable=SC1091
    . "$DIR/.env"
    docker image inspect "$APP_IMAGE:$APP_VERSION" >/dev/null 2>&1 || dc pull app
  fi

  dc up -d
  esperar_sano || exit 1

  local nombre email pass
  nombre="${GV_ADMIN_NOMBRE:-$(preguntar "Nombre del administrador" "Administrador")}"
  email="${GV_ADMIN_EMAIL:-$(preguntar "Correo del administrador" "")}"
  [ -n "$email" ] || fallar "Hace falta un correo para el administrador."
  if [ -n "${GV_ADMIN_PASSWORD:-}" ]; then
    pass="$GV_ADMIN_PASSWORD"
    dc exec -T -e ADMIN_PASSWORD="$pass" app node dist/scripts/crear-admin.cjs "$nombre" "$email" || aviso "No se creó el administrador (¿ya existe?). Puedes crearlo después con ./scripts/crear-admin.sh"
  else
    dc exec app node dist/scripts/crear-admin.cjs "$nombre" "$email" || aviso "No se creó el administrador (¿ya existe?). Puedes crearlo después con ./scripts/crear-admin.sh"
  fi

  local acceso="${GV_ACCESO:-}"
  if [ -z "$acceso" ]; then
    echo; azul "¿Cómo quieres acceder desde fuera de casa?"
    echo "  [1] Tailscale Funnel (recomendado, sin dominio ni abrir puertos)"
    echo "  [2] Cloudflare Tunnel (si tienes un dominio en Cloudflare)"
    echo "  [3] Ninguno (solo red local)"
    case "$(preguntar "Elige" "1")" in 1) acceso="tailscale" ;; 2) acceso="cloudflare" ;; *) acceso="ninguno" ;; esac
  fi
  case "$acceso" in
    tailscale) acceso_tailscale ;;
    cloudflare) acceso_cloudflare ;;
    *) azul "Sin acceso exterior (puedes configurarlo después con la guía)." ;;
  esac
  dc up -d --force-recreate app
  esperar_sano || exit 1

  # Copia del gestor sin el paquete incrustado
  awk '/^__PAYLOAD_BELOW__$/ {exit} {print}' "$0" > "$DIR/gestorventas.sh" 2>/dev/null || true
  chmod +x "$DIR/gestorventas.sh" "$DIR"/scripts/*.sh 2>/dev/null || true

  echo
  verde "✔ Instalación terminada."
  local bind port ip; bind="$(grep '^BIND_ADDRESS=' "$DIR/.env" | cut -d= -f2)"; port="$(grep '^APP_PORT=' "$DIR/.env" | cut -d= -f2)"
  ip="$(hostname -I 2>/dev/null | awk '{print $1}' || true)"
  [ "$bind" = "0.0.0.0" ] && echo "  Red local:     http://${ip:-IP}:$port" || echo "  En este equipo: http://127.0.0.1:$port"
  local pub; pub="$(grep '^PUBLIC_URL=' "$DIR/.env" | cut -d= -f2)"
  [ -n "$pub" ] && echo "  URL pública:   $pub"
  echo "  Copias:        $DIR/backups"
  echo "  Gestión:       $DIR/gestorventas.sh --estado | --logs | --actualizar | --restaurar fichero.dump"
  aviso "  IMPORTANTE: guarda una copia de $DIR/.env (al menos APP_SECRET) en un lugar seguro; sin él no se puede restaurar el 2FA."
}

cmd_estado() {
  [ -f "$DIR/.env" ] || fallar "No hay instalación en $DIR."
  dc ps
  local puerto; puerto="$(grep '^APP_PORT=' "$DIR/.env" | cut -d= -f2)"
  curl -fsS "http://127.0.0.1:${puerto}/api/salud" && echo || rojo "La aplicación no responde."
}

cmd_logs() { dc logs -f --tail=200 "${@:-app}"; }

copia_antes_de_actualizar() {
  mkdir -p "$DIR/backups"
  local f="$DIR/backups/gv_$(date +%Y%m%d_%H%M%S)_previa.dump"
  # shellcheck disable=SC1091
  . "$DIR/.env"
  if dc exec -T db pg_dump -Fc -Z 6 --no-owner --no-privileges -U "$POSTGRES_USER" -d "$POSTGRES_DB" > "$f"; then
    chmod 600 "$f"; verde "Copia previa: $f"
  else
    rm -f "$f"; fallar "No se pudo hacer la copia previa. No se actualiza."
  fi
}

cmd_actualizar() {
  necesita_root
  [ -f "$DIR/.env" ] || fallar "No hay instalación en $DIR."
  copia_antes_de_actualizar
  local nueva="${1:-latest}"
  [ "$nueva" = "latest" ] || fijar_env APP_VERSION "$nueva"
  dc pull app
  dc up -d app
  esperar_sano
}

cmd_restaurar() {
  necesita_root
  [ -n "${1:-}" ] || fallar "Uso: gestorventas.sh --restaurar fichero.dump"
  (cd "$DIR" && ./scripts/restaurar.sh "$1")
}

cmd_desinstalar() {
  necesita_root
  dc down || true
  if [ "${1:-}" = "--borrar-datos" ]; then
    confirmar "Se BORRARÁN la base de datos y las copias de $DIR. ¿Seguro?" || { echo "Cancelado."; exit 1; }
    rm -rf "$DIR"
    verde "Desinstalado y datos borrados."
  else
    verde "Contenedores parados. Los datos se conservan en $DIR (data/ y backups/)."
  fi
}

# ---------------------------------------------------------------- paquete incluido
extraer_paquete() {
  local destino="$1" linea
  linea="$(awk '/^__PAYLOAD_BELOW__$/ {print NR + 1; exit 0}' "$0")"
  [ -n "$linea" ] || fallar "Este archivo no incluye el paquete (usa el .run completo)."
  tail -n +"$linea" "$0" | tar xzf - -C "$destino"
}

uso() {
  cat <<EOF
GestorVentasPi $VERSION
  sudo $0                      Instala (o repara) la aplicación en $DIR
  $0 --estado                  Muestra el estado
  $0 --logs [servicio]         Sigue el registro
  sudo $0 --actualizar [ver]   Copia previa + nueva versión de la app (sin tocar los datos)
  sudo $0 --restaurar FICHERO  Restaura una copia .dump
  sudo $0 --desinstalar [--borrar-datos]
EOF
}

case "${1:---instalar}" in
  --instalar|instalar) cmd_instalar ;;
  --estado) cmd_estado ;;
  --logs) shift; cmd_logs "$@" ;;
  --actualizar) shift; cmd_actualizar "${1:-latest}" ;;
  --restaurar) shift; cmd_restaurar "${1:-}" ;;
  --desinstalar) shift; cmd_desinstalar "${1:-}" ;;
  -h|--ayuda|--help) uso ;;
  *) uso; exit 1 ;;
esac
exit 0
