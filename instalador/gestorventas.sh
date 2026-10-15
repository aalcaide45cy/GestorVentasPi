#!/usr/bin/env bash
# GestorVentasPi — instalador y gestor.
# Como archivo instalador (.run) incluye el paquete al final; ya instalado se usa con subcomandos:
#   ./gestorventas.sh --estado | --logs | --actualizar | --restaurar fichero.dump | --tailscale [clave] | --desinstalar [--borrar-datos]
#
# INSTALACIÓN DESATENDIDA (Raspberry Pi): copia a la tarjeta SD, junto a este archivo, un «gestorventas.conf»
# (plantilla: gestorventas.conf.ejemplo) y ejecuta una sola orden:  sudo bash gestorventas-…-instalador.run
# El archivo de configuración se busca en: $GV_CONF, junto a este archivo, /boot/firmware, /boot y el directorio actual.
#
# Variables (también valen como variables de entorno): GV_DIR, GV_SI=1 (no preguntar), GV_ADMIN_NOMBRE, GV_ADMIN_EMAIL,
# GV_ADMIN_PASSWORD (temporal: se obliga a cambiarla), GV_ACCESO=tailscale|cloudflare|ninguno, GV_TS_AUTHKEY,
# GV_TS_HOSTNAME, GV_ACCESO_LAN=si|no, GV_BIND, GV_PORT, GV_COOKIE_SECURE, GV_APP_IMAGE, GV_APP_VERSION.
set -euo pipefail

VERSION="@@VERSION@@"
DIR="${GV_DIR:-/opt/gestorventas}"
APP_IMAGE_POR_DEFECTO="ghcr.io/aalcaide45cy/gestorventaspi"
CONF_USADO=""

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

# ---------------------------------------------------------------- configuración desatendida
# Lee gestorventas.conf (CLAVE=VALOR, sin ejecutar nada). Las variables de entorno ya definidas tienen prioridad.
cargar_conf() {
  local candidato linea clave valor
  local -a candidatos=()
  [ -n "${GV_CONF:-}" ] && candidatos+=("$GV_CONF")
  candidatos+=("$(dirname "$0")/gestorventas.conf" "/boot/firmware/gestorventas.conf" "/boot/gestorventas.conf" "./gestorventas.conf")
  for candidato in "${candidatos[@]}"; do
    [ -f "$candidato" ] || continue
    CONF_USADO="$candidato"
    azul "Usando la configuración de $candidato"
    while IFS= read -r linea || [ -n "$linea" ]; do
      linea="${linea%$'\r'}"                                    # archivos guardados desde Windows
      case "$linea" in ''|'#'*) continue ;; esac
      clave="${linea%%=*}"; valor="${linea#*=}"
      valor="${valor#\"}"; valor="${valor%\"}"; valor="${valor#\'}"; valor="${valor%\'}"
      case "$clave" in
        GV_ADMIN_NOMBRE|GV_ADMIN_EMAIL|GV_ADMIN_PASSWORD|GV_ACCESO|GV_TS_AUTHKEY|GV_TS_HOSTNAME|GV_ACCESO_LAN|GV_BIND|GV_PORT|GV_COOKIE_SECURE|GV_DIR)
          [ -z "${!clave:-}" ] && [ -n "$valor" ] && export "$clave=$valor" ;;
      esac
    done < "$candidato"
    # Con archivo de configuración no se pregunta nada
    : "${GV_SI:=1}"; export GV_SI
    [ -z "${GV_DIR:-}" ] || DIR="$GV_DIR"
    break
  done
  # Acceso desde la red local: por defecto sí (http://IP:3000). La cookie de sesión solo puede ser «Secure» si todo va por HTTPS.
  if [ "${GV_ACCESO_LAN:-si}" = "si" ] && [ -n "$CONF_USADO" ]; then
    : "${GV_BIND:=0.0.0.0}"; export GV_BIND
    : "${GV_COOKIE_SECURE:=false}"; export GV_COOKIE_SECURE
  fi
  # Con una clave de Tailscale y sin otra indicación, el acceso exterior es Tailscale
  if [ -z "${GV_ACCESO:-}" ] && [ -n "${GV_TS_AUTHKEY:-}" ]; then GV_ACCESO="tailscale"; export GV_ACCESO; fi
  return 0
}

# Quita del archivo de configuración los secretos ya usados (la clave de Tailscale y la contraseña temporal)
limpiar_conf() {
  [ -n "$CONF_USADO" ] && [ -w "$CONF_USADO" ] || return 0
  sed -i -e 's/^GV_TS_AUTHKEY=.*/GV_TS_AUTHKEY=/' -e 's/^GV_ADMIN_PASSWORD=.*/GV_ADMIN_PASSWORD=/' "$CONF_USADO" 2>/dev/null || true
  printf '\n# Instalado el %s. La clave de Tailscale y la contraseña temporal ya se han usado y se han borrado de este archivo.\n' "$(date '+%Y-%m-%d %H:%M')" >> "$CONF_USADO" 2>/dev/null || true
}

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
  if ! curl -fsSL https://get.docker.com | sh; then
    aviso "El método oficial ha fallado: pruebo con los paquetes de la distribución."
    apt-get update -y && { apt-get install -y docker.io docker-compose-v2 || apt-get install -y docker.io docker-compose-plugin || apt-get install -y docker.io docker-compose; } || true
  fi
  systemctl enable --now docker 2>/dev/null || true
  hay_docker || fallar "No se pudo instalar Docker con Compose."
}

# En una Raspberry Pi hace falta la memoria «cgroup» para limitar la RAM de los contenedores; Raspberry Pi OS ya la trae.
aviso_cgroup() {
  [ -f /sys/fs/cgroup/cgroup.controllers ] && grep -q memory /sys/fs/cgroup/cgroup.controllers 2>/dev/null && return 0
  aviso "El sistema no tiene activado el control de memoria de los contenedores: la aplicación funciona, pero sin límite de RAM."
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
TS_AUTHKEY=
TS_HOSTNAME=${GV_TS_HOSTNAME:-gestorventas}
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
# Servicio del sistema que atiende el botón «Apagar equipo» de la aplicación (la app corre en un contenedor sin permisos sobre el sistema:
# solo deja un archivo en $DIR/control y este servicio, fuera del contenedor, hace el apagado ordenado).
instalar_apagado() {
  command -v systemctl >/dev/null 2>&1 || return 0
  mkdir -p "$DIR/control"
  chown 1000:1000 "$DIR/control" 2>/dev/null || true
  chmod 777 "$DIR/control"
  rm -f "$DIR/control/apagar"
  cat > /etc/systemd/system/gestorventas-apagar.service <<UNIT
[Unit]
Description=Apagar el equipo (solicitado desde GestorVentasPi)

[Service]
Type=oneshot
ExecStart=/bin/sh -c 'rm -f $DIR/control/apagar; sleep 3; systemctl poweroff'
UNIT
  cat > /etc/systemd/system/gestorventas-apagar.path <<UNIT
[Unit]
Description=Vigila la petición de apagado de GestorVentasPi

[Path]
PathExists=$DIR/control/apagar

[Install]
WantedBy=multi-user.target
UNIT
  systemctl daemon-reload
  systemctl enable --now gestorventas-apagar.path >/dev/null 2>&1 || return 0
  fijar_env APAGADO_HABILITADO 1
}

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

# Imagen disponible: se descarga solo si no está ya en el equipo (admite instalar sin internet con las imágenes incluidas)
asegurar_imagen() {
  docker image inspect "$1" >/dev/null 2>&1 && return 0
  azul "Descargando $1..."
  docker pull "$1"
}

# ---------------------------------------------------------------- acceso exterior
# Nombre público (DNSName) del contenedor de Tailscale, vacío si todavía no está conectado
tailscale_dns() {
  dc exec -T tailscale tailscale status --json 2>/dev/null \
    | awk '/"BackendState"/ {estado=$0} /"DNSName"/ && !visto {dns=$0; visto=1} END {if (estado ~ /Running/) print dns}' \
    | sed 's/.*: *"//; s/\.\{0,1\}",\{0,1\}$//'
}

# Tailscale dentro de Docker. Con GV_TS_AUTHKEY se conecta solo; sin ella se muestra un enlace para aprobar el equipo.
acceso_tailscale() {
  local clave="${1:-${GV_TS_AUTHKEY:-}}" i dns enlace ya_aviso_funnel=0
  fijar_env TS_AUTHKEY "$clave"
  fijar_env TS_HOSTNAME "${GV_TS_HOSTNAME:-$(grep '^TS_HOSTNAME=' "$DIR/.env" | cut -d= -f2)}"
  asegurar_imagen tailscale/tailscale:stable
  azul "Arrancando Tailscale (contenedor)..."
  dc --profile tailscale up -d tailscale
  local limite=60; [ -z "$clave" ] && limite=240        # 4 s por vuelta: ~4 min con clave, ~16 min si hay que aprobar con un enlace
  for i in $(seq 1 "$limite"); do
    dns="$(tailscale_dns || true)"
    [ -n "$dns" ] && break
    enlace="$(dc logs --tail=80 tailscale 2>&1 | grep -o 'https://login.tailscale.com/a/[A-Za-z0-9]*' | tail -1 || true)"
    if [ -n "$enlace" ] && [ -z "$clave" ]; then
      [ "${enlace_mostrado:-}" = "$enlace" ] || { aviso "Para conectar Tailscale abre este enlace en cualquier navegador e inicia sesión:"; echo "  $enlace"; enlace_mostrado="$enlace"; }
    fi
    if [ "$ya_aviso_funnel" = "0" ] && dc logs --tail=80 tailscale 2>&1 | grep -qi 'funnel.*not.*enabled\|funnel.*disabled'; then
      aviso "Falta activar HTTPS y Funnel en el panel de Tailscale (https://login.tailscale.com/admin/dns y /admin/acls)."
      ya_aviso_funnel=1
    fi
    sleep 4
  done
  if [ -z "$dns" ]; then
    aviso "Tailscale no ha llegado a conectarse. Revisa: $DIR/gestorventas.sh --logs tailscale  (después: sudo $DIR/gestorventas.sh --tailscale)"
    return 0
  fi
  fijar_env TS_AUTHKEY ""                                # la clave ya no hace falta: el estado queda guardado
  fijar_env PUBLIC_URL "https://$dns"
  fijar_env TUNNEL_MODE tailscale
  fijar_env TRUST_PROXY true
  verde "URL pública: https://$dns"
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

# Resumen con las direcciones (sin secretos), también en la partición de arranque para leerlo desde otro equipo
escribir_acceso() {
  local bind port ip pub nombre f
  bind="$(grep '^BIND_ADDRESS=' "$DIR/.env" | cut -d= -f2)"; port="$(grep '^APP_PORT=' "$DIR/.env" | cut -d= -f2)"
  pub="$(grep '^PUBLIC_URL=' "$DIR/.env" | cut -d= -f2)"
  ip="$(hostname -I 2>/dev/null | awk '{print $1}' || true)"; nombre="$(hostname 2>/dev/null || true)"
  f="$DIR/ACCESO-GESTORVENTAS.txt"
  {
    echo "GestorVentasPi $VERSION — instalado el $(date '+%Y-%m-%d %H:%M')"
    echo
    if [ "$bind" = "0.0.0.0" ]; then
      echo "Desde la red de casa:   http://${ip:-IP}:$port    o    http://${nombre:-raspberrypi}.local:$port"
    else
      echo "Solo en este equipo:    http://127.0.0.1:$port"
    fi
    [ -n "$pub" ] && echo "Desde cualquier sitio:  $pub"
    echo
    echo "Primer acceso: entra con el correo del administrador y la contraseña temporal; la aplicación te pedirá"
    echo "cambiarla y activar el doble factor (QR con una app como Google Authenticator). Guarda los códigos de recuperación."
  } > "$f"
  chmod 644 "$f"
  for b in /boot/firmware /boot; do
    if [ -d "$b" ] && [ -w "$b" ] && mountpoint -q "$b" 2>/dev/null; then cp "$f" "$b/ACCESO-GESTORVENTAS.txt" 2>/dev/null || true; break; fi
  done
}

# ---------------------------------------------------------------- subcomandos
cmd_instalar() {
  necesita_root
  cargar_conf
  detectar_arquitectura
  azul "GestorVentasPi $VERSION — arquitectura $ARQ, RAM $(ram_mb) MB, disco libre $(disco_libre_mb) MB"
  [ "$(disco_libre_mb)" -ge 2048 ] || aviso "Hay menos de 2 GB libres en disco."
  hay_docker || instalar_docker
  aviso_cgroup

  mkdir -p "$DIR"
  extraer_paquete "$DIR"
  mkdir -p "$DIR/data" "$DIR/backups"
  chown 1000:1000 "$DIR/backups" 2>/dev/null || true
  crear_env
  instalar_apagado
  # Asistente de la Raspberry actualizado (comando «gv»). `install` reemplaza el archivo sin tocar el proceso que lo esté usando.
  [ -f "$DIR/start.sh" ] && install -m 755 "$DIR/start.sh" /usr/local/bin/gv 2>/dev/null || true

  # Actualización (GV_MODO=actualizar sobre una instalación existente): sin preguntas, con copia previa y conservando
  # el administrador y el acceso exterior ya configurados. La versión de la imagen sigue a la del instalador (si no, el .env
  # antiguo dejaría la aplicación en la versión anterior).
  local actualizando=0
  [ "${GV_MODO:-}" = "actualizar" ] && [ -f "$DIR/.env" ] && actualizando=1
  [ -n "${GV_APP_VERSION:-}" ] || fijar_env APP_VERSION "$VERSION"
  if [ "$actualizando" = 1 ]; then copia_antes_de_actualizar; fi

  # Imágenes incluidas en el instalador (la de la aplicación) y el resto desde internet
  if [ -d "$DIR/imagenes" ]; then
    azul "Cargando imágenes incluidas en el instalador..."
    for f in "$DIR"/imagenes/*"$ARQ"*.tar; do [ -f "$f" ] && docker load -i "$f"; done
  fi
  # shellcheck disable=SC1091
  . "$DIR/.env"
  asegurar_imagen "$APP_IMAGE:$APP_VERSION"
  asegurar_imagen postgres:16-bookworm

  dc up -d
  esperar_sano || exit 1

  if [ "$actualizando" = 1 ]; then
    if docker ps -a --format '{{.Names}}' | grep -q 'gestorventas-tailscale'; then dc --profile tailscale up -d; fi
    dc up -d --force-recreate app
    esperar_sano || exit 1
    awk '/^__PAYLOAD_BELOW__$/ {exit} {print}' "$0" > "$DIR/gestorventas.sh" 2>/dev/null || true
    chmod +x "$DIR/gestorventas.sh" "$DIR"/scripts/*.sh 2>/dev/null || true
    escribir_acceso
    echo; verde "✔ Actualizada a la versión $VERSION. Tus datos, el administrador y el acceso exterior no se han tocado."
    return 0
  fi

  local nombre email pass salida
  nombre="${GV_ADMIN_NOMBRE:-$(preguntar "Nombre del administrador" "Administrador")}"
  email="${GV_ADMIN_EMAIL:-$(preguntar "Correo del administrador" "")}"
  [ -n "$email" ] || fallar "Hace falta un correo para el administrador."
  if [ -n "${GV_ADMIN_PASSWORD:-}" ]; then
    # Contraseña indicada en el archivo de configuración: se trata como temporal (cambio obligatorio en el primer acceso)
    pass="$GV_ADMIN_PASSWORD"
    dc exec -T -e ADMIN_PASSWORD="$pass" -e ADMIN_FORZAR_CAMBIO=1 app node dist/scripts/crear-admin.cjs "$nombre" "$email" || aviso "No se creó el administrador (¿ya existe, o la contraseña tiene menos de 12 caracteres?). Puedes crearlo después con ./scripts/crear-admin.sh"
  elif [ "${GV_SI:-0}" = "1" ]; then
    # Desatendido y sin contraseña: la aplicación genera una temporal que se guarda en un archivo protegido
    if salida="$(dc exec -T app node dist/scripts/crear-admin.cjs "$nombre" "$email" 2>&1)"; then
      echo "$salida"
      pass="$(printf '%s\n' "$salida" | sed -n 's/^Contraseña temporal: //p' | head -1)"
      if [ -n "$pass" ]; then
        umask 077; printf 'Administrador: %s\nContraseña temporal: %s\n(Se obliga a cambiarla en el primer acceso. Borra este archivo cuando la hayas cambiado.)\n' "$email" "$pass" > "$DIR/CREDENCIAL-ADMIN.txt"; chmod 600 "$DIR/CREDENCIAL-ADMIN.txt"
        aviso "CONTRASEÑA TEMPORAL del administrador (también en $DIR/CREDENCIAL-ADMIN.txt): $pass"
      fi
    else
      echo "$salida"; aviso "No se creó el administrador (¿ya existe?). Puedes crearlo después con ./scripts/crear-admin.sh"
    fi
  else
    dc exec app node dist/scripts/crear-admin.cjs "$nombre" "$email" || aviso "No se creó el administrador (¿ya existe?). Puedes crearlo después con ./scripts/crear-admin.sh"
  fi

  local acceso="${GV_ACCESO:-}"
  if [ -z "$acceso" ]; then
    echo; azul "¿Cómo quieres acceder desde fuera de casa?"
    echo "  [1] Tailscale Funnel (recomendado, sin dominio ni abrir puertos; va dentro de Docker)"
    echo "  [2] Cloudflare Tunnel (si tienes un dominio en Cloudflare)"
    echo "  [3] Ninguno (solo red local)"
    case "$(preguntar "Elige" "1")" in 1) acceso="tailscale" ;; 2) acceso="cloudflare" ;; *) acceso="ninguno" ;; esac
  fi
  case "$acceso" in
    tailscale) acceso_tailscale ;;
    cloudflare) acceso_cloudflare ;;
    *) azul "Sin acceso exterior (puedes configurarlo después con: sudo $DIR/gestorventas.sh --tailscale)." ;;
  esac
  dc up -d --force-recreate app
  esperar_sano || exit 1

  # Copia del gestor sin el paquete incrustado
  awk '/^__PAYLOAD_BELOW__$/ {exit} {print}' "$0" > "$DIR/gestorventas.sh" 2>/dev/null || true
  chmod +x "$DIR/gestorventas.sh" "$DIR"/scripts/*.sh 2>/dev/null || true
  escribir_acceso
  limpiar_conf

  echo
  verde "✔ Instalación terminada."
  sed 's/^/  /' "$DIR/ACCESO-GESTORVENTAS.txt"
  echo "  Copias:        $DIR/backups"
  echo "  Gestión:       $DIR/gestorventas.sh --estado | --logs | --actualizar | --restaurar fichero.dump"
  aviso "  IMPORTANTE: guarda una copia de $DIR/.env (al menos APP_SECRET) en un lugar seguro; sin él no se puede restaurar el 2FA."
}

cmd_estado() {
  [ -f "$DIR/.env" ] || fallar "No hay instalación en $DIR."
  dc ps
  local puerto; puerto="$(grep '^APP_PORT=' "$DIR/.env" | cut -d= -f2)"
  curl -fsS "http://127.0.0.1:${puerto}/api/salud" && echo || rojo "La aplicación no responde."
  [ -f "$DIR/ACCESO-GESTORVENTAS.txt" ] && { echo; cat "$DIR/ACCESO-GESTORVENTAS.txt"; }
}

cmd_logs() { dc logs -f --tail=200 "${@:-app}"; }

cmd_tailscale() {
  necesita_root
  [ -f "$DIR/.env" ] || fallar "No hay instalación en $DIR."
  acceso_tailscale "${1:-}"
  dc up -d --force-recreate app
  esperar_sano || exit 1
  escribir_acceso
  cat "$DIR/ACCESO-GESTORVENTAS.txt"
}

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
  dc --profile tailscale --profile cloudflare down || true
  systemctl disable --now gestorventas-apagar.path >/dev/null 2>&1 || true
  rm -f /etc/systemd/system/gestorventas-apagar.path /etc/systemd/system/gestorventas-apagar.service
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
                               (con un gestorventas.conf al lado o en /boot/firmware se instala sin preguntar nada)
  $0 --estado                  Muestra el estado y las direcciones de acceso
  $0 --logs [servicio]         Sigue el registro (app, db, tailscale)
  sudo $0 --tailscale [clave]  (Re)conecta Tailscale; sin clave muestra un enlace para aprobar el equipo
  sudo $0 --actualizar [ver]   Copia previa + nueva versión de la app (sin tocar los datos)
  sudo $0 --restaurar FICHERO  Restaura una copia .dump
  sudo $0 --desinstalar [--borrar-datos]
EOF
}

case "${1:---instalar}" in
  --instalar|instalar) cmd_instalar ;;
  --estado) cmd_estado ;;
  --logs) shift; cmd_logs "$@" ;;
  --tailscale) shift; cmd_tailscale "${1:-}" ;;
  --actualizar) shift; cmd_actualizar "${1:-latest}" ;;
  --restaurar) shift; cmd_restaurar "${1:-}" ;;
  --desinstalar) shift; cmd_desinstalar "${1:-}" ;;
  -h|--ayuda|--help) uso ;;
  *) uso; exit 1 ;;
esac
exit 0
