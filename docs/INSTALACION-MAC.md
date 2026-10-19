# Instalar GestorVentasPi en un Mac «del tirón» (sin Docker)

**Para Claude Code en el Mac.** El propietario te dirá: *«sigue docs/INSTALACION-MAC.md»*. Ejecuta **todos los pasos seguidos**
sin pedir confirmación en cada uno. **Para y pregunta solo si**: falta alguno de los ficheros del apartado 0, un paso falla
y no sabes arreglarlo sin borrar datos, o hay que hacer algo destructivo. Habla en **español sencillo**: el propietario no es técnico.

**Cómo funciona el conjunto**
- El código vive en GitHub (`aalcaide45cy/GestorVentasPi`). **GitHub no construye nada para el Mac ni el PC.**
- Cada equipo (Mac, PC) descarga con `git pull`, **construye en local** (`npm run build`, pocos minutos) y ejecuta con Node.
- Base de datos: PostgreSQL 16 instalado en el propio equipo. Los datos (clientes, expedientes…) **no van por GitHub**:
  se mueven con copias **`.dump`** (exportar/importar).
- Flujo de cambios: se programa y se sube a GitHub → en cada equipo se ejecuta `scripts/actualizar-mac.sh` (apartado 8).

> Estado: **no probado todavía en un Mac**. Si un paso falla, anotar el mensaje exacto en `DECISIONES.md` y avisar.

## 0. Lo que el propietario debe darte antes de empezar
Estos elementos **no están en GitHub**. Pídelos (carpeta, AirDrop o memoria USB) y comprueba que existen:
1. Una copia **`.dump`** reciente de la base de datos.
2. Su fichero **`.env`** original (tiene `APP_SECRET`, que descifra el doble factor; sin él se pierde el 2FA).
3. (Recomendado) sus **códigos de recuperación** del doble factor.

Si es una instalación nueva sin datos, salta el `.dump` y el `.env`: se creará un `.env` nuevo y un administrador.
**Nunca** subas estos ficheros a GitHub.

## 1. Ajustes del Mac como servidor
- Ajustes del Sistema → Energía: evitar la suspensión y «Arrancar automáticamente tras un fallo de corriente».
- Inicio de sesión automático (para que el servicio arranque tras reiniciar).

## 2. Herramientas
```
xcode-select --install
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
brew install git node@22 postgresql@16
brew link --overwrite --force node@22
brew services start postgresql@16
```
(`brew` pedirá la contraseña del Mac y puede indicar añadir una línea al `~/.zprofile`; hazlo.) Opcional:
**Tailscale** desde la App Store para acceder desde fuera.

## 3. Base de datos
Usa los mismos nombres que el `.env` original (por defecto usuario `gestor`, base `gestorventas`):
```
createuser gestor
createdb -O gestor gestorventas
psql -d gestorventas -c "ALTER USER gestor WITH PASSWORD '<POSTGRES_PASSWORD del .env>'"
```

## 4. Código
```
cd ~
git clone https://github.com/aalcaide45cy/GestorVentasPi.git
cd GestorVentasPi
```
- Con datos: copia el `.env` original a esta carpeta. Comprueba que `DATABASE_URL` apunta a `127.0.0.1:5432` con el usuario y
  clave del paso 3 y que `APP_SECRET` es el original. **No** definas `PG_DUMP_CMD`/`PG_RESTORE_CMD` con `docker exec`
  (usa el `pg_dump`/`pg_restore` del sistema; si no están en el PATH: `export PATH="/opt/homebrew/opt/postgresql@16/bin:$PATH"` y
  guárdalo en `~/.zprofile`).
- Instalación nueva: `cp .env.example .env` y rellénalo con claves aleatorias (`openssl rand -hex 32` para `APP_SECRET`).
- Si se entra por `http://` y no por `https://`, añade `COOKIE_SECURE=false`.

## 5. Construir
```
npm ci --onnxruntime-node-install=skip
npm run db:migrate
npm run build
```
Los modelos del OCR (RapidOCR, motor por defecto) vienen en `ocr-modelos/`; no hay que descargar nada.

## 6. Datos
- **Con copia `.dump`** (con la app parada):
  ```
  pg_restore --clean --if-exists --no-owner --single-transaction -d gestorventas /ruta/copia.dump
  npm run db:migrate
  ```
  (`scripts/restaurar.sh` **no sirve aquí**: exige Docker.) Si falla algo que no sean avisos de roles, **no sigas**.
- **Sin copia:** `npm run crear-admin -- "Nombre Apellidos" correo@dominio.com` (mínimo 12 caracteres de clave).

## 7. Arranque automático
Crea `~/Library/LaunchAgents/es.gestorventas.app.plist` con: etiqueta `es.gestorventas.app`; carpeta de trabajo = la del proyecto;
programa `/bin/zsh` con argumentos `-lc "npm run start"`; `RunAtLoad` y `KeepAlive` en `true`; salida y errores a
`~/Library/Logs/gestorventas.log`. Cárgalo:
```
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/es.gestorventas.app.plist
```
Comprueba: `curl http://localhost:3000/api/salud` debe devolver `{"ok":true}`.

## 8. Script de actualización (créalo ahora)
Crea `scripts/actualizar-mac.sh` (y `chmod +x`), con este contenido, y súbelo a GitHub para que esté también en el PC:
```
#!/usr/bin/env sh
# Descarga la última versión de GitHub, la construye aquí y reinicia el servicio.
set -e
cd "$(dirname "$0")/.."
git pull --ff-only
npm ci --onnxruntime-node-install=skip
npm run db:migrate
npm run build
launchctl kickstart -k "gui/$(id -u)/es.gestorventas.app"
sleep 8
curl -fsS http://localhost:3000/api/salud && echo " <- actualizado y funcionando"
```
Antes de actualizar, haz siempre una copia con la propia app (Administración → Copias de seguridad) o con
`pg_dump -Fc gestorventas > backups/antes_$(date +%Y%m%d_%H%M).dump`.
**Uso diario:** tras subir cambios a GitHub, en cada equipo: `./scripts/actualizar-mac.sh`. Solo descarga y construye local.

## 9. Exportar e importar datos con `.dump`
- **Exportar:** en la app, Administración → Copias de seguridad → descargar `.dump`; o `pg_dump -Fc -d gestorventas -f copia.dump`.
- **Importar en otro equipo:** apartado 6 (o la opción «Restaurar» de la app con un administrador).
- Para **mover la app a otro Mac**: repite 1–5 en el nuevo, trae `.env` + `.dump` y haz 6 y 7.

## 10. Acceso desde fuera (opcional)
`tailscale funnel --bg 3000` muestra la URL pública. Si usa Google Drive, ponla en `PUBLIC_URL` del `.env`.

## Comprobación final (díselo al propietario en palabras sencillas)
- [ ] `http://localhost:3000/api/salud` responde.
- [ ] Entra con su administrador y el doble factor; ve sus clientes y expedientes.
- [ ] Reinicia el Mac y la app arranca sola.
- [ ] `./scripts/actualizar-mac.sh` funciona tras un cambio de prueba.
- [ ] Hecha una copia `.dump` desde la app.
