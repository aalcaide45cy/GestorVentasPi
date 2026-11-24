# Pasar el repositorio a privado (pasos pendientes)

Todo el código ya está preparado: **sin llave todo funciona como hasta ahora** (repositorio público) y **con llave** también (repositorio privado).

1. **Crear la llave** (GitHub > foto > Settings > Developer settings > Personal access tokens > Fine-grained tokens > Generate new token): nombre «Actualizar», caducidad 1 año, «Only select repositories» > GestorVentasPi, Permissions > Repository permissions > **Contents: Read-only**. Copiar la llave (`github_pat_...`).
2. **Mac**: en Terminal, `cd ~/GestorVentasPI && git pull`, luego
   `read -rs k; printf '%s' "$k" > ~/.gestorventas-github-token; chmod 600 ~/.gestorventas-github-token`
   (pegar la llave y Enter). `./scripts/actualizar-mac.sh` la usa sola si existe.
3. **Raspberry** (cuando haya una versión publicada con este cambio): `sudo gv llave` (opción 12 del menú) y pegar la llave. Antes de eso la Raspberry NO puede actualizarse con el repo privado.
4. **PC**: no descarga de GitHub (trabaja sobre la carpeta); no necesita nada.
5. **Poner privado**: repo GestorVentasPi > Settings > General > Danger Zone > Change visibility > Make private.
6. Comprobar: sin llave `curl -s -o /dev/null -w "%{http_code}" https://api.github.com/repos/aalcaide45cy/GestorVentasPi` debe dar 404; la imagen de Docker en ghcr.io debe seguir pudiéndose descargar sin clave (si no, ponerla pública en GitHub > Packages > Package settings).
