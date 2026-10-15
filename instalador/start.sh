#!/usr/bin/env bash
# GestorVentasPi — asistente para la Raspberry Pi (menú).
#
#   Primera vez:   sudo bash /boot/firmware/start.sh
#   Después basta: sudo gv        (el asistente se copia a /usr/local/bin/gv)
#
# También se puede usar sin menú:  sudo gv instalar | actualizar | estado | logs | copia | reiniciar | apagar
set -u

REPO="aalcaide45cy/GestorVentasPi"
API="https://api.github.com/repos/$REPO"
DIR="${GV_DIR:-/opt/gestorventas}"
ORIGEN="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ---------------------------------------------------------------- utilidades
azul() { printf '\033[36m%s\033[0m\n' "$*"; }
verde() { printf '\033[32m%s\033[0m\n' "$*"; }
aviso() { printf '\033[33m%s\033[0m\n' "$*"; }
rojo() { printf '\033[31m%s\033[0m\n' "$*" >&2; }
pausa() { echo; read -rp "Pulsa Enter para volver al menú... " _; }
si() { local r; read -rp "$1 [s/N] " r; [[ "$r" =~ ^[sSyY] ]]; }

# Este asistente necesita permisos de administrador
if [ "$(id -u)" -ne 0 ]; then exec sudo bash "${BASH_SOURCE[0]}" "$@"; fi

# Se deja instalado como comando «gv» (y una copia junto a la aplicación)
if [ "${BASH_SOURCE[0]}" != "/usr/local/bin/gv" ]; then
  install -m 755 "${BASH_SOURCE[0]}" /usr/local/bin/gv 2>/dev/null || true
fi

hay_instalacion() { [ -f "$DIR/.env" ] && [ -f "$DIR/docker-compose.yml" ]; }
version_instalada() {
  if [ -f "$DIR/.env" ]; then grep '^APP_VERSION=' "$DIR/.env" | cut -d= -f2; elif [ -f "$DIR/VERSION" ]; then cat "$DIR/VERSION"; else echo "—"; fi
}
dc() { (cd "$DIR" && docker compose "$@"); }

necesita_internet() {
  curl -fsS --max-time 10 -o /dev/null "$API" 2>/dev/null || { rojo "No hay conexión con GitHub. Comprueba que la Raspberry tiene internet."; return 1; }
}

instalar_jq() {
  command -v jq >/dev/null 2>&1 && return 0
  azul "Instalando una herramienta pequeña (jq) para leer GitHub..."
  apt-get update -qq >/dev/null 2>&1 && apt-get install -y -qq jq >/dev/null 2>&1 || { rojo "No se pudo instalar jq."; return 1; }
}

# Reinicio pendiente (por ejemplo tras instalar Docker o el sistema)
avisar_reinicio() {
  if [ -f /var/run/reboot-required ]; then
    aviso "El sistema indica que hace falta reiniciar la Raspberry."
    if [ "${GV_AUTO:-0}" = "1" ]; then echo "(Actualización automática: no se reinicia sola; hazlo desde el menú cuando te venga bien.)"; return 0; fi
    si "¿Reiniciarla ahora?" && reiniciar_raspberry
  fi
}

reiniciar_raspberry() {
  azul "Reiniciando... La aplicación arrancará sola en uno o dos minutos. Vuelve a conectarte por SSH entonces."
  sleep 2; systemctl reboot
}

apagar_raspberry() {
  azul "Apagando de forma ordenada. Cuando se apague la luz verde puedes desenchufarla."
  sleep 2; systemctl poweroff
}

# ---------------------------------------------------------------- GitHub: versiones y progreso
# Última etiqueta vX.Y.Z publicada en el repositorio (aunque su instalador aún se esté construyendo).
ultima_etiqueta() {
  curl -fsS --max-time 25 "$API/git/matching-refs/tags/v" 2>/dev/null | jq -r '.[].ref' 2>/dev/null | sed 's#refs/tags/v##' | grep -E '^[0-9]+\.[0-9]+\.[0-9]+$' | sort -V | tail -1
}

release_lista() { # ¿ya están publicados los archivos de esa versión?
  local j
  j="$(curl -fsS --max-time 25 "$API/releases/tags/v$1" 2>/dev/null)" || return 1
  [ -n "$j" ] || return 1
  jq -e --arg n "gestorventas-$1-pi-instalador.run" '[.assets[].name] | index($n) != null' <<<"$j" >/dev/null 2>&1
}

# Espera a que GitHub termine de construir la versión, mostrando el avance. Devuelve 0 si ya está lista.
esperar_construccion() {
  local v="$1" run id estado concl jobs hechos total paso inicio t
  inicio="$(date +%s)"
  azul "GitHub está construyendo la versión $v. Espero aquí y se instalará sola al terminar (Ctrl+C para cancelar)."
  while ! release_lista "$v"; do
    run="$(curl -fsS --max-time 25 "$API/actions/runs?event=push&per_page=20" 2>/dev/null | jq -c --arg v "v$v" '[.workflow_runs[] | select(.head_branch == $v and .name == "Publicar versión")][0] // empty' 2>/dev/null)"
    if [ -n "$run" ]; then
      id="$(jq -r '.id' <<<"$run")"; estado="$(jq -r '.status' <<<"$run")"; concl="$(jq -r '.conclusion // ""' <<<"$run")"
      if [ "$estado" = "completed" ] && [ "$concl" != "success" ]; then
        rojo "La construcción de la versión $v ha FALLADO en GitHub (resultado: $concl)."
        echo "Detalles: https://github.com/$REPO/actions/runs/$id"
        return 1
      fi
      jobs="$(curl -fsS --max-time 25 "$API/actions/runs/$id/jobs" 2>/dev/null)"
      total="$(jq '[.jobs[].steps[]] | length' <<<"$jobs" 2>/dev/null || echo 0)"
      hechos="$(jq '[.jobs[].steps[] | select(.status == "completed")] | length' <<<"$jobs" 2>/dev/null || echo 0)"
      paso="$(jq -r '[.jobs[].steps[] | select(.status == "in_progress")][0].name // "preparando"' <<<"$jobs" 2>/dev/null)"
      t=$(( $(date +%s) - inicio ))
      printf '\r\033[K  [%s/%s] %s  (%d min %02d s)' "$hechos" "$total" "$paso" $((t / 60)) $((t % 60))
    else
      t=$(( $(date +%s) - inicio ))
      printf '\r\033[K  Esperando a que GitHub empiece la construcción...  (%d min %02d s)' $((t / 60)) $((t % 60))
    fi
    sleep 45
    if [ $(( $(date +%s) - inicio )) -gt 5400 ]; then echo; rojo "Han pasado 90 minutos sin terminar. Revisa https://github.com/$REPO/actions"; return 1; fi
  done
  echo; verde "La versión $v ya está publicada."
}

# Descarga el instalador de una versión a una carpeta y comprueba su huella.
descargar_instalador() {
  local v="$1" destino="$2" nombre="gestorventas-$1-pi-instalador.run" base="https://github.com/$REPO/releases/download/v$1"
  azul "Descargando $nombre (unos 150 MB)..."
  curl -fL --connect-timeout 20 --speed-limit 2000 --speed-time 90 --retry 2 --progress-bar -o "$destino/$nombre" "$base/$nombre" || { rojo "No se pudo descargar."; return 1; }
  if curl -fsSL --max-time 30 -o "$destino/$nombre.sha256" "$base/$nombre.sha256" 2>/dev/null; then
    (cd "$destino" && sha256sum -c "$nombre.sha256" >/dev/null 2>&1) || { rojo "La descarga está dañada (la huella no coincide). Vuelve a intentarlo."; return 1; }
    verde "Descarga comprobada."
  fi
  RUN_DESCARGADO="$destino/$nombre"
}

# ---------------------------------------------------------------- acciones
accion_instalar() {
  if hay_instalacion; then
    aviso "Ya hay una instalación (versión $(version_instalada))."
    si "¿Quieres reinstalar/reparar igualmente? (no borra los datos)" || return 0
  fi
  local run
  run="$(ls -1 "$ORIGEN"/gestorventas-*-pi-instalador.run /boot/firmware/gestorventas-*-pi-instalador.run /boot/gestorventas-*-pi-instalador.run 2>/dev/null | sort -V | tail -1)"
  if [ -z "$run" ]; then
    aviso "No hay ningún archivo gestorventas-*-pi-instalador.run junto a este asistente."
    si "¿Lo descargo de GitHub (última versión)?" || return 0
    necesita_internet || return 1
    instalar_jq || return 1
    local v; v="$(ultima_etiqueta)"; [ -n "$v" ] || { rojo "No encuentro ninguna versión publicada."; return 1; }
    release_lista "$v" || esperar_construccion "$v" || return 1
    mkdir -p /root/gv-descargas
    descargar_instalador "$v" /root/gv-descargas || return 1
    run="$RUN_DESCARGADO"
  fi
  if [ ! -f "$ORIGEN/gestorventas.conf" ] && [ ! -f /boot/firmware/gestorventas.conf ] && [ ! -f /boot/gestorventas.conf ]; then
    aviso "No hay archivo gestorventas.conf: el instalador te hará preguntas (correo del administrador, acceso exterior...)."
  fi
  azul "Instalando $(basename "$run")... (de 5 a 10 minutos; no cierres esta ventana)"
  bash "$run" || { rojo "La instalación ha terminado con errores."; return 1; }
  avisar_reinicio
}

# Una sola actualización a la vez (menú, botón de la aplicación y actualización automática).
bloquear_actualizacion() {
  exec {GV_CERROJO}>/var/lock/gv-actualizar.lock 2>/dev/null || return 0
  flock -n "$GV_CERROJO" || { aviso "Ya hay otra actualización en curso."; return 1; }
}
liberar_actualizacion() { [ -n "${GV_CERROJO:-}" ] && exec {GV_CERROJO}>&-; GV_CERROJO=""; }

accion_actualizar() {
  bloquear_actualizacion || return 1
  accion_actualizar_interna
  local codigo=$?
  liberar_actualizacion
  return $codigo
}

accion_actualizar_interna() {
  hay_instalacion || { rojo "Todavía no hay nada instalado. Usa antes «Instalar»."; return 1; }
  necesita_internet || return 1
  instalar_jq || return 1
  local actual nueva
  actual="$(version_instalada)"
  nueva="$(ultima_etiqueta)"
  [ -n "$nueva" ] || { rojo "No encuentro versiones publicadas en GitHub."; return 1; }
  echo "Versión instalada: $actual    Última en GitHub: $nueva"
  if [ "$(printf '%s\n%s\n' "$actual" "$nueva" | sort -V | tail -1)" = "$actual" ]; then
    verde "Ya tienes la última versión."
    return 0
  fi
  esperar_construccion "$nueva" || return 1
  mkdir -p /root/gv-descargas
  descargar_instalador "$nueva" /root/gv-descargas || return 1
  local run="$RUN_DESCARGADO"
  azul "Actualizando a la versión $nueva (se hace una copia de seguridad antes; tus datos no se tocan)..."
  GV_MODO=actualizar timeout 2400 bash "$run" || { rojo "La actualización ha fallado. Tus datos siguen intactos; la copia previa está en $DIR/backups."; return 1; }
  rm -f /root/gv-descargas/gestorventas-*-pi-instalador.run*
  verde "Listo. En el navegador pulsa Ctrl+F5 para cargar la versión nueva."
  avisar_reinicio
}

accion_estado() {
  hay_instalacion || { rojo "Todavía no hay nada instalado."; return 1; }
  echo "Versión instalada: $(version_instalada)"
  "$DIR/gestorventas.sh" --estado
  echo; echo "Espacio en disco:"; df -h / | tail -1
  echo "Temperatura: $(vcgencmd measure_temp 2>/dev/null || echo 'no disponible')"
}

accion_logs() { hay_instalacion || { rojo "No hay instalación."; return 1; }; azul "Registro de la aplicación (Ctrl+C para salir)"; dc logs -f --tail=100 app; }

accion_copia() {
  hay_instalacion || { rojo "No hay instalación."; return 1; }
  local f="$DIR/backups/gv_$(date +%Y%m%d_%H%M%S)_manual.dump" u d
  u="$(grep '^POSTGRES_USER=' "$DIR/.env" | cut -d= -f2)"; d="$(grep '^POSTGRES_DB=' "$DIR/.env" | cut -d= -f2)"
  mkdir -p "$DIR/backups"
  if dc exec -T db pg_dump -Fc -Z 6 --no-owner --no-privileges -U "$u" -d "$d" > "$f"; then chmod 600 "$f"; verde "Copia guardada: $f"; else rm -f "$f"; rojo "No se pudo hacer la copia."; return 1; fi
}

accion_admin() {
  hay_instalacion || { rojo "No hay instalación."; return 1; }
  local nombre email
  read -rp "Nombre del administrador: " nombre
  read -rp "Correo del administrador: " email
  [ -n "$email" ] || { rojo "Hace falta un correo."; return 1; }
  dc exec -T app node dist/scripts/crear-admin.cjs "${nombre:-Administrador}" "$email"
  aviso "Copia la contraseña temporal que aparece arriba: la aplicación te obligará a cambiarla en el primer acceso."
}

accion_tailscale() {
  hay_instalacion || { rojo "No hay instalación."; return 1; }
  local clave; read -rp "Clave de Tailscale (tskey-auth-..., o Enter para recibir un enlace de aprobación): " clave
  "$DIR/gestorventas.sh" --tailscale "$clave"
}

accion_reiniciar_app() { hay_instalacion || { rojo "No hay instalación."; return 1; }; azul "Reiniciando la aplicación..."; dc restart && verde "Hecho."; }

# Lo ejecuta el servicio del sistema que atiende el botón «Actualizar» de la aplicación: deja el avance en la carpeta compartida
# (control/actualizacion.log y control/actualizacion.estado) para que la aplicación lo muestre.
actualizar_servicio() {
  export GV_AUTO=1
  local carpeta="$DIR/control" registro estado codigo
  registro="$carpeta/actualizacion.log"; estado="$carpeta/actualizacion.estado"
  mkdir -p "$carpeta"
  : > "$registro"; echo "en-curso" > "$estado"; chmod 666 "$registro" "$estado" 2>/dev/null || true
  accion_actualizar 2>&1 | tr '\r' '\n' | sed -u -e '/^[[:space:]]*$/d' -e 's/\x1b\[[0-9;]*m//g' >> "$registro"
  codigo="${PIPESTATUS[0]}"
  if [ "$codigo" -eq 0 ]; then echo "terminada" > "$estado"; else echo "fallida" > "$estado"; fi
  return "$codigo"
}

# ---------------------------------------------------------------- actualización automática
SERVICIO_AUTO="gestorventas-autoupdate"
INTERVALO_AUTO="${GV_INTERVALO:-600}"   # segundos entre comprobaciones (GitHub permite 60 consultas por hora sin clave)

auto_activa() { systemctl is-active --quiet "$SERVICIO_AUTO.service" 2>/dev/null; }
auto_estado_texto() {
  if auto_activa; then printf '\033[32mACTIVA\033[0m (vigila GitHub cada %d min)' $((INTERVALO_AUTO / 60)); else printf '\033[33mDESACTIVADA\033[0m'; fi
}

# Proceso en segundo plano: cada cierto tiempo mira si hay una versión nueva; si la hay, espera a que GitHub la construya,
# la instala y vuelve a vigilar. Al terminar una actualización se reinicia a sí mismo para cargar el asistente nuevo.
vigilar() {
  export GV_AUTO=1
  echo "[$(date '+%F %T')] Vigilancia de actualizaciones iniciada (cada $((INTERVALO_AUTO / 60)) min)."
  while true; do
    if hay_instalacion && necesita_internet 2>/dev/null && instalar_jq >/dev/null 2>&1; then
      local antes despues
      antes="$(version_instalada)"
      accion_actualizar 2>&1 | tr '\r' '\n' | sed '/^[[:space:]]*$/d' || true
      despues="$(version_instalada)"
      if [ "$antes" != "$despues" ]; then
        echo "[$(date '+%F %T')] Actualizada de $antes a $despues."
        exit 0   # systemd nos vuelve a arrancar con el asistente nuevo y seguimos a la escucha
      fi
    fi
    sleep "$INTERVALO_AUTO"
  done
}

auto_activar() {
  hay_instalacion || { rojo "Todavía no hay nada instalado."; return 1; }
  instalar_jq || return 1
  cat > "/etc/systemd/system/$SERVICIO_AUTO.service" <<UNIT
[Unit]
Description=GestorVentasPi: actualización automática desde GitHub
After=network-online.target docker.service
Wants=network-online.target

[Service]
Type=simple
ExecStart=/usr/local/bin/gv vigilar
Restart=always
RestartSec=30
Nice=10

[Install]
WantedBy=multi-user.target
UNIT
  systemctl daemon-reload
  systemctl enable --now "$SERVICIO_AUTO.service" >/dev/null 2>&1 || { rojo "No se pudo activar el servicio."; return 1; }
  verde "Actualización automática ACTIVADA. Cuando suba una versión nueva a GitHub se instalará sola (con copia previa)."
}

auto_desactivar() {
  systemctl disable --now "$SERVICIO_AUTO.service" >/dev/null 2>&1 || true
  rm -f "/etc/systemd/system/$SERVICIO_AUTO.service"
  systemctl daemon-reload
  verde "Actualización automática DESACTIVADA."
}

accion_auto() {
  echo "Actualización automática: $(auto_estado_texto)"; echo
  if auto_activa; then
    echo "  1) Desactivar"
    echo "  2) Ver el registro (últimas líneas)"
    echo "  0) Volver"
    local o; read -rp "Elige: " o
    case "$o" in 1) auto_desactivar ;; 2) journalctl -u "$SERVICIO_AUTO" -n 40 --no-pager ;; esac
  else
    echo "Al activarla, un proceso en segundo plano vigilará GitHub y, cuando se suba una versión nueva, la descargará e instalará"
    echo "sola (con copia de seguridad previa) y seguirá a la escucha de la siguiente. Sigue funcionando tras reiniciar la Raspberry."
    si "¿Activarla?" && auto_activar
  fi
}

# ---------------------------------------------------------------- menú
menu() {
  while true; do
    clear
    azul "══════════════ GestorVentasPi · Asistente de la Raspberry ══════════════"
    if hay_instalacion; then echo "  Instalada: versión $(version_instalada)"; else echo "  Todavía sin instalar"; fi
    echo "  Actualización automática: $(auto_estado_texto)"
    echo
    echo "   1) Instalar por primera vez"
    echo "   2) Actualizar a la última versión (espera a GitHub si la está construyendo)"
    echo "   3) Ver estado y direcciones de acceso"
    echo "   4) Ver el registro de la aplicación"
    echo "   5) Hacer una copia de seguridad ahora"
    echo "   6) Crear un administrador"
    echo "   7) Conectar / reconectar Tailscale"
    echo "   8) Reiniciar la aplicación"
    echo "   9) Reiniciar la Raspberry"
    echo "  10) Apagar la Raspberry"
    echo "  11) Actualización automática (activar / desactivar)"
    echo "   0) Salir"
    echo
    local op; read -rp "Elige una opción: " op
    case "$op" in
      1) accion_instalar; pausa ;;
      2) accion_actualizar; pausa ;;
      3) accion_estado; pausa ;;
      4) accion_logs ;;
      5) accion_copia; pausa ;;
      6) accion_admin; pausa ;;
      7) accion_tailscale; pausa ;;
      8) accion_reiniciar_app; pausa ;;
      9) si "¿Reiniciar la Raspberry ahora?" && reiniciar_raspberry ;;
      10) si "¿Apagar la Raspberry ahora?" && apagar_raspberry ;;
      11) accion_auto; pausa ;;
      0|q|Q) exit 0 ;;
      *) ;;
    esac
  done
}

if [ "${BASH_SOURCE[0]}" = "$0" ]; then
case "${1:-menu}" in
  instalar) accion_instalar ;;
  actualizar) accion_actualizar ;;
  estado) accion_estado ;;
  logs) accion_logs ;;
  copia) accion_copia ;;
  reiniciar) reiniciar_raspberry ;;
  apagar) apagar_raspberry ;;
  vigilar) vigilar ;;
  actualizar-servicio) actualizar_servicio ;;
  auto) accion_auto ;;
  menu|"") menu ;;
  *) echo "Uso: gv [instalar|actualizar|estado|logs|copia|reiniciar|apagar|auto]"; exit 1 ;;
esac
fi
