# Guía de instalación de GestorVentasPi

Pensada para instalar la aplicación en una **Raspberry Pi 4 (8 GB)** o en un **PC con Linux (AMD64)**, sin abrir puertos del router. Todos los comandos se pueden copiar y pegar.

> **Idea clave:** la aplicación son dos contenedores (la app y PostgreSQL). Lo que importa conservar es: (1) el fichero `.env` y (2) las copias `.dump`. Con eso se reinstala todo en cualquier máquina.

---

## 1. Qué necesitas

- Raspberry Pi 4 de **8 GB**, tarjeta microSD de calidad **≥ 32 GB** (A1/A2), fuente de alimentación oficial y cable de red (o Wi‑Fi). Recomendable: un **SSD USB** en lugar de la SD para la base de datos.
- Un PC con lector de tarjetas para preparar la SD.
- Una cuenta de **Tailscale** (gratuita) para el acceso desde fuera. *(Opcional: un dominio en Cloudflare si prefieres una URL propia.)*
- *(Opcional)* Una cuenta de Google para las copias en Drive.

## 2. Instalación en tres pasos (Raspberry Pi) — todo en contenedores

Todo va dentro de Docker: **la aplicación, PostgreSQL y Tailscale**. No se instala nada más en el sistema.

### Paso 1 — Preparar la tarjeta

1. Con **Raspberry Pi Imager** elige **Raspberry Pi OS Lite (64 bits)**.
2. En los ajustes: nombre del equipo (`gestorventas`), **usuario y contraseña**, **activar SSH**, Wi‑Fi si no usas cable, zona horaria **Europe/Madrid**. Escribe la tarjeta.
3. **Antes de sacarla del PC**, abre la unidad de la tarjeta (`bootfs`) y copia dentro **dos archivos**:
   - `gestorventas-X.Y.Z-pi-instalador.run` — de la última versión en *Releases* del repositorio (lleva dentro la aplicación para Raspberry Pi).
   - `gestorventas.conf` — copia de `gestorventas.conf.ejemplo` (también en *Releases*) rellenado con tu correo de administrador y, si quieres, tu clave de Tailscale (ver abajo).

### Paso 2 — Arrancar

Pon la tarjeta en la Raspberry, conecta cable y alimentación y espera un minuto.

### Paso 3 — Una orden

Desde tu PC (en PowerShell o una terminal; el usuario y el nombre son los del Imager):

```bash
ssh TU_USUARIO@gestorventas.local
sudo bash /boot/firmware/gestorventas-*-pi-instalador.run
```

Lo hace todo solo y no pregunta nada: instala Docker, carga la aplicación, descarga PostgreSQL y Tailscale, crea la base de datos y el administrador, conecta Tailscale y publica la aplicación. Dura unos 5–10 minutos y al terminar muestra las direcciones:

- **En tu red de casa:** `http://IP-DE-LA-RASPBERRY:3000` o `http://gestorventas.local:3000`.
- **Desde cualquier sitio:** `https://gestorventas.TU-RED.ts.net`.

Las direcciones también quedan escritas en `ACCESO-GESTORVENTAS.txt` en la propia tarjeta (para leerlas desde el PC) y en `/opt/gestorventas`.

#### La clave de Tailscale (opcional, pero evita abrir un enlace)

1. En https://login.tailscale.com/admin/dns activa **HTTPS Certificates**, y en *Access controls* deja activado **Funnel** (una sola vez para toda tu cuenta).
2. En https://login.tailscale.com/admin/settings/keys pulsa **Generate auth key** (marca *One-off*) y copia la clave en `GV_TS_AUTHKEY=` de `gestorventas.conf`.
3. Sin clave, el instalador muestra un **enlace**: ábrelo en cualquier navegador, inicia sesión y el equipo se aprueba solo.

#### Contraseña del administrador

- Si pones una en `GV_ADMIN_PASSWORD=` (mínimo 12 caracteres), es **temporal**: la aplicación te obliga a cambiarla en el primer acceso.
- Si la dejas vacía, se genera una aleatoria que se muestra al terminar y se guarda en `/opt/gestorventas/CREDENCIAL-ADMIN.txt` (solo root).
- Al terminar, el instalador **borra de `gestorventas.conf`** la clave de Tailscale y la contraseña.

Es **idempotente**: si lo ejecutas otra vez no pierde datos ni sobrescribe el `.env`.

> Si no quieres abrir la aplicación en la red local (solo por la dirección HTTPS de Tailscale), pon `GV_ACCESO_LAN=no` en `gestorventas.conf`.

## 3. Instalación manual (alternativa o en un PC)

Si prefieres hacerlo a mano o instalar en un **PC con Linux (AMD64)**: descarga el instalador de la última versión (`gestorventas-X.Y.Z-instalador.run`, **online**; o `…-offline-instalador.run`, con todas las imágenes) y ejecútalo con `sudo`. Sin `gestorventas.conf` te pregunta lo necesario: Docker, nombre, correo y contraseña del administrador (mínimo 12 caracteres) y cómo acceder desde fuera (**[1] Tailscale** en contenedor, **[2] Cloudflare**, **[3] ninguno**).

```bash
scp gestorventas-X.Y.Z-instalador.run TU_USUARIO@gestorventas.local:~
ssh TU_USUARIO@gestorventas.local
sudo bash gestorventas-X.Y.Z-instalador.run
```

Comandos útiles después: `/opt/gestorventas/gestorventas.sh --estado | --logs [app|db|tailscale] | --actualizar | --tailscale [clave]`.

## 4. Primer acceso y doble factor (2FA)

1. Abre la dirección que te mostró el instalador (`http://IP-DE-LA-PI:3000` en red local o la URL pública).
2. Entra con el correo y la contraseña del administrador.
3. La aplicación te pedirá **activar el doble factor**: escanea el código QR con una app de autenticación (Google Authenticator, Aegis, Authy…) y escribe el código de 6 dígitos.
4. Aparecerán **códigos de recuperación**: **guárdalos en un lugar seguro** (se muestran una sola vez).

## 5. Acceso desde fuera de casa (sin abrir puertos)

### Opción A — Tailscale Funnel (sin dominio) · por defecto

Ya lo hace el instalador (Tailscale va en su propio contenedor, `tailscale` en el `docker-compose.yml`, y publica la aplicación con **Funnel**). Para conectarlo o reconectarlo después:

```bash
sudo /opt/gestorventas/gestorventas.sh --tailscale            # muestra un enlace para aprobar el equipo
sudo /opt/gestorventas/gestorventas.sh --tailscale tskey-...  # o con una clave de autenticación
```

La URL pública será `https://gestorventas.TU-RED.ts.net`: pruébala **desde el móvil con datos** (sin wifi). Si no conecta, revisa el registro con `/opt/gestorventas/gestorventas.sh --logs tailscale`: si dice que Funnel no está activado, actívalo en el panel de Tailscale (HTTPS Certificates en *DNS* y Funnel en *Access controls*).

Limitaciones de Funnel: solo dominios `*.ts.net`, puertos públicos 443/8443/10000 y límites de ancho de banda no configurables.

### Opción B — Cloudflare Tunnel (con dominio propio)

Necesitas un dominio gestionado en Cloudflare.

1. En Cloudflare → *Zero Trust → Tunnels*, crea un túnel y copia su **token**.
2. Añade un *Public hostname* (p. ej. `ventas.midominio.com`) que apunte a `http://app:3000`.
3. En `.env`: `TUNNEL_MODE=cloudflare`, `CLOUDFLARE_TUNNEL_TOKEN=…`, `PUBLIC_URL=https://ventas.midominio.com`, `TRUST_PROXY=true`.
4. Arranca el perfil: `cd /opt/gestorventas && docker compose --profile cloudflare up -d`.

> Un túnel «rápido» sin dominio no sirve: su URL cambia y rompería Google Drive y los marcadores.

En ambos casos **no se toca el router** y el acceso está protegido por contraseña + 2FA.

## 6. Copias en Google Drive (opcional)

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

## 7. Copias de seguridad

- **Automática** cada día a las 03:30 (configurable). Retención por defecto: **14 diarias + 8 semanales + 12 mensuales**.
- **Manual**: botón «Crear copia ahora». También puedes **descargar** cualquier copia desde el navegador.
- **Prueba una restauración** (una copia que no se ha probado no es una copia): en otra máquina o en la misma, con «Restaurar» (pide contraseña, 2FA y escribir `RESTAURAR`; hace antes una copia previa y cierra todas las sesiones).
- Sin la aplicación: `cd /opt/gestorventas && ./scripts/restaurar.sh backups/gv_FECHA_auto.dump`.

## 8. Guardar aparte (muy importante)

Guarda **fuera de la Pi** (gestor de contraseñas, USB…):

- El fichero **`/opt/gestorventas/.env`** o, como mínimo, **`APP_SECRET`**. El secreto del 2FA solo se descifra con el mismo `APP_SECRET`.
- Los **códigos de recuperación** del 2FA.
- Una copia `.dump` reciente (si no usas Drive).

## 9. Actualizar

```bash
cd /opt/gestorventas
sudo ./gestorventas.sh --actualizar          # última versión
sudo ./gestorventas.sh --actualizar 1.2.0    # una versión concreta
```

Hace antes una copia previa y **no toca los datos**. El sistema operativo: `sudo apt update && sudo apt full-upgrade -y`.

## 10. Reinstalar tras un fallo (SD estropeada, equipo nuevo)

1. Prepara el equipo nuevo (apartados 2 y 3) **hasta ejecutar el instalador** y crea un administrador temporal.
2. Copia tu **`.env` original** a `/opt/gestorventas/.env` (sustituye el nuevo) y la **última copia `.dump`** a `/opt/gestorventas/backups/`.
3. `cd /opt/gestorventas && docker compose up -d`
4. `sudo ./gestorventas.sh --restaurar backups/gv_FECHA_auto.dump`
5. Entra con tu administrador de siempre (su contraseña y 2FA están en la copia).

## 11. Instalar en un PC (AMD64) o Synology

- **PC con Linux (Debian/Ubuntu):** igual que en la Pi. El instalador ajusta los límites de memoria a la RAM del equipo (con 16 GB o más usa 4 GB para la base de datos y 2 GB para la app).
- **Windows/Mac:** instala Docker Desktop y usa el `docker-compose.yml` de la carpeta `instalador/` con un `.env` (copia `.env.example` y rellénalo).
- **Synology:** instala «Container Manager» desde el Centro de paquetes y usa el mismo `docker-compose.yml`. [No verificado] Depende del modelo (Intel/AMD o ARM64).
- `BIND_ADDRESS=127.0.0.1` solo escucha en el propio equipo; `0.0.0.0` también en tu red local.

## 12. Problemas frecuentes

| Problema | Qué hacer |
|---|---|
| La aplicación no arranca | `cd /opt/gestorventas && ./gestorventas.sh --logs` y `./gestorventas.sh --estado` |
| Olvidé el 2FA / perdí el móvil | `cd /opt/gestorventas && ./scripts/reset-2fa.sh correo@dominio.com` (el usuario lo activará de nuevo al entrar) |
| Olvidé la contraseña | `./scripts/reset-password.sh correo@dominio.com` (muestra una contraseña temporal una sola vez) |
| Necesito otro administrador | `./scripts/crear-admin.sh "Nombre Apellidos" correo@dominio.com` |
| La SD no arranca | Cámbiala y sigue el apartado 10 |
| La URL pública no responde | `sudo tailscale funnel status`; comprueba que HTTPS y Funnel siguen activos en el panel de Tailscale; `PUBLIC_URL` correcta |
| Drive pide reconectar | Configuración → BBDD → «Reconectar con Google Drive» (comprueba que la app de Google está «En producción») |
| Aviso «la última copia automática tiene más de 48 h» | Mira el último error en la propia pantalla de copias; suele ser espacio en disco o Drive caducado |

## 13. Seguridad básica

- Cambia la contraseña de SSH y, si usas clave, **desactiva la contraseña SSH**.
- Activa las actualizaciones automáticas de seguridad: `sudo apt install -y unattended-upgrades`.
- **No abras puertos en el router.** La base de datos no publica ningún puerto.
- Mantén el fichero `.env` con permisos `600` y fuera de cualquier repositorio.

## 14. Generar el instalador (para quien mantiene el proyecto)

```bash
git tag v1.0.0 && git push origin v1.0.0     # GitHub Actions publica la imagen y los instaladores
./scripts/empaquetar.sh 1.0.0                 # instalador online, a mano
./scripts/empaquetar.sh 1.0.0 --offline       # incluye las imágenes amd64 y arm64
./scripts/empaquetar.sh 1.0.0 --pi            # para Raspberry Pi: lleva dentro la imagen de la app (arm64)
```
