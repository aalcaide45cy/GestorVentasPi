# Guía de instalación de GestorVentasPi

Pensada para instalar la aplicación en una **Raspberry Pi 4 (8 GB)** o en un **PC con Linux (AMD64)**, sin abrir puertos del router. Todos los comandos se pueden copiar y pegar.

> **Idea clave:** la aplicación son dos contenedores (la app y PostgreSQL). Lo que importa conservar es: (1) el fichero `.env` y (2) las copias `.dump`. Con eso se reinstala todo en cualquier máquina.

---

## 1. Qué necesitas

- Raspberry Pi 4 de **8 GB**, tarjeta microSD de calidad **≥ 32 GB** (A1/A2), fuente de alimentación oficial y cable de red (o Wi‑Fi). Recomendable, pero no obligatorio: un **SSD USB** (más vida útil y velocidad).
- Un PC con lector de tarjetas para preparar la SD.
- Una cuenta de **Tailscale** (gratuita) para el acceso desde fuera. *(Opcional: un dominio en Cloudflare si prefieres una URL propia.)*
- *(Opcional)* Una cuenta de Google para las copias en Drive.

## 2. Preparar la tarjeta

1. Instala **Raspberry Pi Imager** en el PC.
2. Elige **Raspberry Pi OS Lite (64 bits)**.
3. En «Ajustes» (rueda dentada): nombre del equipo (p. ej. `gestorventas`), **usuario y contraseña**, **activar SSH**, zona horaria **Europe/Madrid**.
4. Escribe la tarjeta, ponla en la Pi y enciéndela.

## 3. Primer arranque y conexión por SSH

Desde tu PC (el nombre es el que elegiste):

```bash
ssh TU_USUARIO@gestorventas.local
```

Actualiza el sistema:

```bash
sudo apt update && sudo apt full-upgrade -y
```

*(Opcional)* Reserva una IP fija para la Pi en el router.

## 4. Instalar la aplicación

Descarga el instalador de la última versión (en la página de *Releases* del repositorio): `gestorventas-X.Y.Z-instalador.run` (**online**, pesa unos KB y descarga las imágenes) o `…-offline-instalador.run` (incluye las imágenes, para instalar sin internet).

Cópialo a la Pi y ejecútalo:

```bash
scp gestorventas-X.Y.Z-instalador.run TU_USUARIO@gestorventas.local:~
ssh TU_USUARIO@gestorventas.local
chmod +x gestorventas-*-instalador.run
sudo ./gestorventas-*-instalador.run
```

Qué hace y qué te pregunta:

1. Detecta si es amd64 o arm64, la RAM y el espacio libre.
2. Si falta Docker, **pregunta** si lo instala con el método oficial.
3. Crea `/opt/gestorventas`, genera el `.env` (contraseñas aleatorias y límites de memoria según tu RAM) y arranca todo.
4. Te pide **nombre, correo y contraseña del primer administrador** (mínimo 12 caracteres).
5. Te pregunta cómo acceder desde fuera: **[1] Tailscale Funnel** (recomendado), **[2] Cloudflare Tunnel** o **[3] ninguno**.
6. Al terminar muestra las direcciones y recuerda guardar el `.env`.

Es **idempotente**: si lo ejecutas otra vez no pierde nada ni sobrescribe el `.env`.

> Si quieres entrar también desde otros equipos de tu red local, pon `BIND_ADDRESS=0.0.0.0` en `/opt/gestorventas/.env` y ejecuta `cd /opt/gestorventas && docker compose up -d`.

## 5. Primer acceso y doble factor (2FA)

1. Abre la dirección que te mostró el instalador (`http://IP-DE-LA-PI:3000` en red local o la URL pública).
2. Entra con el correo y la contraseña del administrador.
3. La aplicación te pedirá **activar el doble factor**: escanea el código QR con una app de autenticación (Google Authenticator, Aegis, Authy…) y escribe el código de 6 dígitos.
4. Aparecerán **códigos de recuperación**: **guárdalos en un lugar seguro** (se muestran una sola vez).

## 6. Acceso desde fuera de casa (sin abrir puertos)

### Opción A — Tailscale Funnel (sin dominio) · por defecto

1. Crea una cuenta en tailscale.com.
2. En el panel de administración de Tailscale **activa HTTPS** y **Funnel** para tu tailnet.
3. Si no lo hiciste con el instalador, en la Pi:

   ```bash
   curl -fsSL https://tailscale.com/install.sh | sh
   sudo tailscale up
   sudo tailscale funnel --bg 3000
   ```
   *(La sintaxis exacta puede variar entre versiones: comprueba `tailscale funnel --help`.)*
4. La URL pública será `https://NOMBRE.TU-TAILNET.ts.net`. Pruébala **desde el móvil con datos** (sin wifi).
5. Pon esa URL en `/opt/gestorventas/.env` como `PUBLIC_URL=…` y `TRUST_PROXY=true`, y reinicia: `cd /opt/gestorventas && docker compose up -d --force-recreate app`.

Limitaciones de Funnel: solo dominios `*.ts.net`, puertos públicos 443/8443/10000 y límites de ancho de banda no configurables.

### Opción B — Cloudflare Tunnel (con dominio propio)

Necesitas un dominio gestionado en Cloudflare.

1. En Cloudflare → *Zero Trust → Tunnels*, crea un túnel y copia su **token**.
2. Añade un *Public hostname* (p. ej. `ventas.midominio.com`) que apunte a `http://app:3000`.
3. En `.env`: `TUNNEL_MODE=cloudflare`, `CLOUDFLARE_TUNNEL_TOKEN=…`, `PUBLIC_URL=https://ventas.midominio.com`, `TRUST_PROXY=true`.
4. Arranca el perfil: `cd /opt/gestorventas && docker compose --profile cloudflare up -d`.

> Un túnel «rápido» sin dominio no sirve: su URL cambia y rompería Google Drive y los marcadores.

En ambos casos **no se toca el router** y el acceso está protegido por contraseña + 2FA.

## 7. Copias en Google Drive (opcional)

Las credenciales las creas tú una sola vez (no pueden venir de serie):

1. En **console.cloud.google.com** crea un proyecto y habilita **Google Drive API**.
2. *Pantalla de consentimiento OAuth*: tipo «Externo», nombre de la app, tu correo. **Pásala a «En producción»** (si se queda en «Pruebas», el permiso caduca a los 7 días).
3. *Credenciales → Crear credenciales → ID de cliente de OAuth → Aplicación web*. En **URI de redirección autorizados** añade exactamente:
   `{PUBLIC_URL}/api/admin/drive/callback`
4. Copia el ID y el secreto en `/opt/gestorventas/.env`:

   ```
   GOOGLE_CLIENT_ID=…
   GOOGLE_CLIENT_SECRET=…
   PUBLIC_URL=https://…
   ```
5. Reinicia: `cd /opt/gestorventas && docker compose up -d --force-recreate app`.
6. En la aplicación: **Configuración → BBDD → Copias de seguridad → «Conectar con Google Drive»**. Solo se pide el permiso mínimo (`drive.file`: la app solo ve lo que ella crea) y se guarda cifrado únicamente el *refresh token*.
7. Activa «Subir a Drive automáticamente» si quieres que cada copia diaria suba sola a la carpeta «GestorVentasPi-Copias».

Si el permiso caduca o lo revocas, verás «Reconectar con Google Drive»; mientras tanto las copias locales siguen haciéndose.

## 8. Copias de seguridad

- **Automática** cada día a las 03:30 (configurable). Retención por defecto: **14 diarias + 8 semanales + 12 mensuales**.
- **Manual**: botón «Crear copia ahora». También puedes **descargar** cualquier copia desde el navegador.
- **Prueba una restauración** (una copia que no se ha probado no es una copia): en otra máquina o en la misma, con «Restaurar» (pide contraseña, 2FA y escribir `RESTAURAR`; hace antes una copia previa y cierra todas las sesiones).
- Sin la aplicación: `cd /opt/gestorventas && ./scripts/restaurar.sh backups/gv_FECHA_auto.dump`.

## 9. Guardar aparte (muy importante)

Guarda **fuera de la Pi** (gestor de contraseñas, USB…):

- El fichero **`/opt/gestorventas/.env`** o, como mínimo, **`APP_SECRET`**. El secreto del 2FA solo se descifra con el mismo `APP_SECRET`.
- Los **códigos de recuperación** del 2FA.
- Una copia `.dump` reciente (si no usas Drive).

## 10. Actualizar

```bash
cd /opt/gestorventas
sudo ./gestorventas.sh --actualizar          # última versión
sudo ./gestorventas.sh --actualizar 1.2.0    # una versión concreta
```

Hace antes una copia previa y **no toca los datos**. El sistema operativo: `sudo apt update && sudo apt full-upgrade -y`.

## 11. Reinstalar tras un fallo (SD estropeada, equipo nuevo)

1. Prepara el equipo nuevo (pasos 2–4) **hasta ejecutar el instalador** y crea un administrador temporal.
2. Copia tu **`.env` original** a `/opt/gestorventas/.env` (sustituye el nuevo) y la **última copia `.dump`** a `/opt/gestorventas/backups/`.
3. `cd /opt/gestorventas && docker compose up -d`
4. `sudo ./gestorventas.sh --restaurar backups/gv_FECHA_auto.dump`
5. Entra con tu administrador de siempre (su contraseña y 2FA están en la copia).

## 12. Instalar en un PC (AMD64) o Synology

- **PC con Linux (Debian/Ubuntu):** igual que en la Pi. El instalador ajusta los límites de memoria a la RAM del equipo (con 16 GB o más usa 4 GB para la base de datos y 2 GB para la app).
- **Windows/Mac:** instala Docker Desktop y usa el `docker-compose.yml` de la carpeta `instalador/` con un `.env` (copia `.env.example` y rellénalo).
- **Synology:** instala «Container Manager» desde el Centro de paquetes y usa el mismo `docker-compose.yml`. [No verificado] Depende del modelo (Intel/AMD o ARM64).
- `BIND_ADDRESS=127.0.0.1` solo escucha en el propio equipo; `0.0.0.0` también en tu red local.

## 13. Problemas frecuentes

| Problema | Qué hacer |
|---|---|
| La aplicación no arranca | `cd /opt/gestorventas && ./gestorventas.sh --logs` y `./gestorventas.sh --estado` |
| Olvidé el 2FA / perdí el móvil | `cd /opt/gestorventas && ./scripts/reset-2fa.sh correo@dominio.com` (el usuario lo activará de nuevo al entrar) |
| Olvidé la contraseña | `./scripts/reset-password.sh correo@dominio.com` (muestra una contraseña temporal una sola vez) |
| Necesito otro administrador | `./scripts/crear-admin.sh "Nombre Apellidos" correo@dominio.com` |
| La SD no arranca | Cámbiala y sigue el apartado 11 |
| La URL pública no responde | `sudo tailscale funnel status`; comprueba que HTTPS y Funnel siguen activos en el panel de Tailscale; `PUBLIC_URL` correcta |
| Drive pide reconectar | Configuración → BBDD → «Reconectar con Google Drive» (comprueba que la app de Google está «En producción») |
| Aviso «la última copia automática tiene más de 48 h» | Mira el último error en la propia pantalla de copias; suele ser espacio en disco o Drive caducado |

## 14. Seguridad básica

- Cambia la contraseña de SSH y, si usas clave, **desactiva la contraseña SSH**.
- Activa las actualizaciones automáticas de seguridad: `sudo apt install -y unattended-upgrades`.
- **No abras puertos en el router.** La base de datos no publica ningún puerto.
- Mantén el fichero `.env` con permisos `600` y fuera de cualquier repositorio.

## 15. Generar el instalador (para quien mantiene el proyecto)

```bash
git tag v1.0.0 && git push origin v1.0.0     # GitHub Actions publica la imagen y los instaladores
./scripts/empaquetar.sh 1.0.0                 # instalador online, a mano
./scripts/empaquetar.sh 1.0.0 --offline       # incluye las imágenes amd64 y arm64
```
