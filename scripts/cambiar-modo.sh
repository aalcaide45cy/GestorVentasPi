#!/bin/bash
# Cambia el servidor entre modo desarrollo (npm run dev: se actualiza solo al tocar el codigo) y modo normal (compilado, npm start: estable, es como
# corre en la Raspberry). Es el equivalente en macOS y Linux de scripts/cambiar-modo.ps1 (Windows) y lo usa el boton «Modo del servidor» de la aplicacion.
#   cambiar-modo.sh dev                 -> modo desarrollo
#   cambiar-modo.sh build               -> compila en una carpeta aparte (.next-nueva) con el servidor todavia en marcha y, solo si sale bien, lo
#                                          para unos segundos, cambia la carpeta y lo arranca en modo normal
#   cambiar-modo.sh start               -> reinicia el modo normal SIN recompilar
# Opciones por variables de entorno: PORT (3000 por defecto). La carpeta es la del proyecto (la de este script).
set -u
MODO="${1:-}"
PUERTO="${PORT:-3000}"
CARPETA="$(cd "$(dirname "$0")/.." && pwd)"
REGISTRO="${TMPDIR:-/tmp}/gestorventas-modo.log"
anotar() { echo "$(date '+%Y-%m-%d %H:%M:%S') $*" >> "$REGISTRO"; }

case "$MODO" in dev | build | start) ;; *) echo "Uso: $0 dev|build|start" >&2; exit 2 ;; esac
: > "$REGISTRO"
anotar "Cambio a modo $MODO (puerto $PUERTO, carpeta $CARPETA)"
cd "$CARPETA" || exit 1
# El servidor que lanza este script hereda variables suyas (NODE_ENV=development, NEXT_*...) que romperian la compilacion o el arranque del otro modo
for v in $(env | grep -E '^(NODE_ENV|__NEXT_|NEXT_|TURBOPACK)' | cut -d= -f1); do unset "$v"; done
sleep 2

parar_servidor() {
  local pids
  pids="$(lsof -ti "tcp:$PUERTO" -sTCP:LISTEN 2>/dev/null || true)"
  if [ -z "$pids" ]; then return 0; fi
  anotar "Cerrando el servidor del puerto $PUERTO (procesos: $(echo $pids | tr '\n' ' '))"
  # Se sube por los padres mientras sean node/npm de este servidor, para no dejar un «npm run dev» huerfano
  local todos="$pids" p padre nombre
  for p in $pids; do
    padre="$(ps -o ppid= -p "$p" 2>/dev/null | tr -d ' ')"
    for _ in 1 2 3 4; do
      [ -z "$padre" ] || [ "$padre" = "1" ] && break
      nombre="$(ps -o comm= -p "$padre" 2>/dev/null)"
      case "$nombre" in *node* | *npm*) todos="$todos $padre"; padre="$(ps -o ppid= -p "$padre" 2>/dev/null | tr -d ' ')" ;; *) break ;; esac
    done
  done
  # Primero el de mas arriba (arrastra a sus hijos); despues, lo que quede
  kill $(echo "$todos" | tr ' ' '\n' | tac 2>/dev/null || echo "$todos") 2>/dev/null || true
  sleep 3
  kill -9 $(lsof -ti "tcp:$PUERTO" -sTCP:LISTEN 2>/dev/null || true) 2>/dev/null || true
  sleep 1
  anotar "Servidor cerrado"
}

lanzar() { # $1 = orden (npm run dev | npm start), $2 = fichero de registro
  PORT="$PUERTO" nohup bash -c "$1" > "$2" 2>&1 < /dev/null &
  disown 2>/dev/null || true
}

if [ "$MODO" = "build" ]; then
  anotar "Compilando en .next-nueva (npm run build) con el servidor todavia en marcha..."
  rm -rf "$CARPETA/.next-nueva"
  if ! NEXT_DIST_DIR=".next-nueva" npm run build > "${TMPDIR:-/tmp}/gestorventas-build.log" 2>&1; then
    anotar "La compilacion ha fallado; detalle en ${TMPDIR:-/tmp}/gestorventas-build.log. El servidor actual sigue como estaba."
    exit 1
  fi
fi

parar_servidor

if [ "$MODO" = "dev" ]; then
  anotar "Lanzando npm run dev"
  echo dev > "$CARPETA/.ultimo-modo"
  lanzar "npm run dev" "${TMPDIR:-/tmp}/gestorventas-dev-$PUERTO.log"
  exit 0
fi

if [ "$MODO" = "build" ]; then
  # La compilada pasa a ser .next (la anterior se guarda como .next-vieja hasta la siguiente vez)
  rm -rf "$CARPETA/.next-vieja"
  [ -d "$CARPETA/.next" ] && mv "$CARPETA/.next" "$CARPETA/.next-vieja"
  mv "$CARPETA/.next-nueva" "$CARPETA/.next"
  anotar "Carpeta cambiada: .next es la compilacion nueva"
else
  anotar "Reinicio en modo normal sin recompilar"
fi
anotar "Aplicando migraciones y arrancando npm start"
if ! npm run db:migrate > "${TMPDIR:-/tmp}/gestorventas-migrar.log" 2>&1; then
  anotar "Las migraciones han fallado; se vuelve al modo desarrollo."
  lanzar "npm run dev" "${TMPDIR:-/tmp}/gestorventas-dev-$PUERTO.log"
  exit 1
fi
echo normal > "$CARPETA/.ultimo-modo"
lanzar "npm start" "${TMPDIR:-/tmp}/gestorventas-normal-$PUERTO.log"
exit 0
