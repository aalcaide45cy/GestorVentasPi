> Parte del informe completo (`docs/INFORME-COMPLETO.md`). **Leyenda de marcas** [V-código] [V-reglas] [V-Prompts] [V-web] [D] [I] [P]: ver `00-leyenda-vision-entorno.md` (sección 0.1). Regla: no conviertas una [I] o [P] en hecho sin comprobarlo; aplica el valor por defecto y anótalo en `DECISIONES.md`.

## 14. Empaquetado y despliegue: “un archivo que se instala solo”

### 14.1 Requisito del propietario (R7, R15)
Un **único archivo** que se pueda llevar a una Raspberry Pi 4 (8 GB, ARM64) **o a un PC AMD64** (y, en el futuro, a un Synology compatible) y que **se instale y arranque solo**, con la app **y** la base de datos conectadas, y que luego **se pueda modificar y ampliar**.

### 14.2 Recomendación: dos etapas [D]
- **Etapa A — Desarrollo y pruebas:** se trabaja con `docker compose` desde el repositorio (fácil de modificar y reconstruir). **Hasta que todo funcione no se empaqueta nada.**
- **Etapa B — Paquete:** un script (`scripts/empaquetar.sh`) genera el **archivo instalador** (14.7) a partir de una versión etiquetada. Ese mismo repositorio sigue siendo la fuente para modificar y volver a empaquetar.

Por dentro el sistema son **dos contenedores** (app y base de datos) en una red interna. Para el propietario es “un archivo”; para actualizar o ampliar **no se toca el volumen de datos**. Un solo contenedor con ambos (mezclar app y datos) se **descarta**: dificulta actualizar, copiar y escalar. [D]

### 14.3 Imágenes y arquitecturas [D]
| Imagen | Arquitecturas | Origen |
|---|---|---|
| `ghcr.io/aalcaide45cy/gestorventaspi:{versión}` (la app) | **`linux/amd64` y `linux/arm64`** (manifiesto multi-arquitectura) | Se compila con **GitHub Actions** (`docker buildx` + QEMU) y se publica en GHCR |
| `postgres:16-bookworm` | amd64 + arm64 (oficial) | Docker Hub |

- Plataformas objetivo: **Raspberry Pi 4 (arm64)** y **PC AMD64**. Synology: depende del modelo [No verificado]; si es Intel/AMD o ARM64 con Docker/Container Manager, la misma imagen sirve.
- La compilación **no se hace en la Pi** (lenta y con mucha RAM). Excepción: modo “construir en local” con swap, documentado como alternativa.

### 14.4 Variables de entorno (`.env`, generado por el instalador, permisos 600) [D]

| Variable | Descripción | Ejemplo / por defecto |
|---|---|---|
| `POSTGRES_USER` / `POSTGRES_DB` | Usuario y base | `gestor` / `gestorventas` |
| `POSTGRES_PASSWORD` | Contraseña de la BD (aleatoria, 32+ caracteres) | generada |
| `DATABASE_URL` | Cadena de conexión que usa la app | `postgres://gestor:…@db:5432/gestorventas` |
| `APP_SECRET` | 32 bytes base64: cifra TOTP y token de Drive | generada |
| `PUBLIC_URL` | URL pública | `https://pi.tu-tailnet.ts.net` |
| `TUNNEL_MODE` | Método de acceso exterior | `tailscale` (por defecto) · `cloudflare` · `ninguno` |
| `CLOUDFLARE_TUNNEL_TOKEN` | Token del túnel (solo modo cloudflare) | vacío |
| `TRUST_PROXY` | Leer IP real de cabeceras de confianza | `true` con Funnel |
| `TZ` | Zona horaria | `Europe/Madrid` |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Credenciales OAuth (opcionales) | vacío |
| `APP_PORT` | Puerto en el host | `3000` |
| `BIND_ADDRESS` | Dónde escucha en el host | `127.0.0.1` (o `0.0.0.0` para LAN) |
| `DB_MEM_LIMIT` / `APP_MEM_LIMIT` | Límites de memoria | Pi: `1500m` / `1024m` · PC: `4g` / `2g` |
| `BACKUP_RETENCION` | Política de copias | `14d,8w,12m` |

### 14.5 `docker-compose.yml` (referencia que debe generarse) [D]

```yaml
name: gestorventas
services:
  db:
    image: postgres:16-bookworm
    restart: unless-stopped
    environment:
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: ${POSTGRES_DB}
      TZ: ${TZ:-Europe/Madrid}
    command: >
      postgres -c shared_buffers=${PG_SHARED_BUFFERS:-384MB}
               -c effective_cache_size=${PG_CACHE:-2GB}
               -c work_mem=16MB -c maintenance_work_mem=128MB
               -c max_connections=40 -c checkpoint_timeout=15min -c max_wal_size=1GB
               -c log_min_duration_statement=500
    volumes:
      - ./data/postgres:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U $${POSTGRES_USER} -d $${POSTGRES_DB}"]
      interval: 10s
      timeout: 5s
      retries: 10
    mem_limit: ${DB_MEM_LIMIT:-1500m}
    logging: { driver: json-file, options: { max-size: "10m", max-file: "3" } }
    networks: [interna]

  app:
    image: ghcr.io/aalcaide45cy/gestorventaspi:${APP_VERSION:-latest}
    restart: unless-stopped
    depends_on:
      db: { condition: service_healthy }
    env_file: .env
    environment:
      NODE_ENV: production
      NODE_OPTIONS: --max-old-space-size=768
    ports:
      - "${BIND_ADDRESS:-127.0.0.1}:${APP_PORT:-3000}:3000"
    volumes:
      - ./backups:/backups
    healthcheck:
      test: ["CMD", "node", "-e", "fetch('http://127.0.0.1:3000/api/salud').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
      interval: 30s
      timeout: 5s
      retries: 5
      start_period: 40s
    mem_limit: ${APP_MEM_LIMIT:-1024m}
    tmpfs: [ "/tmp" ]
    logging: { driver: json-file, options: { max-size: "10m", max-file: "3" } }
    networks: [interna]

  cloudflared:                      # SOLO si TUNNEL_MODE=cloudflare  ->  docker compose --profile cloudflare up -d
    image: cloudflare/cloudflared:latest
    profiles: ["cloudflare"]
    restart: unless-stopped
    command: tunnel --no-autoupdate run
    environment:
      TUNNEL_TOKEN: ${CLOUDFLARE_TUNNEL_TOKEN}
    depends_on: [app]
    networks: [interna]

networks:
  interna: {}
```
> [No verificado] El servicio `cloudflared` y su comando se escriben de memoria; **comprobar contra la documentación oficial de Cloudflare** antes de darlo por bueno (imagen multi-arquitectura incluida).
> La base de datos **no publica ningún puerto** al host: solo la ve la app por la red interna. [D]

### 14.6 `Dockerfile` (multi-etapa, multi-arquitectura) [D]
1. **deps**: `node:22-bookworm-slim`, `npm ci`.
2. **build**: `next build` con `output: "standalone"` (variable `NEXT_TELEMETRY_DISABLED=1`).
3. **runner**: `node:22-bookworm-slim` + **`postgresql-client-16`** (del repositorio PGDG; necesario para `pg_dump`/`pg_restore`, que deben ser **de versión ≥ la del servidor**) [I: validar en CI en amd64 y arm64], usuario no-root, copia de `.next/standalone`, `public`, `drizzle/` (migraciones) y `scripts/`.
4. **Entrada** (`docker-entrypoint.sh`): espera a la BD → **aplica migraciones** (con *advisory lock* de Postgres para evitar carreras) → aplica semilla idempotente → arranca `node server.js`.
5. Etiquetas OCI con versión y commit. Imagen **< 400 MB** [I].

### 14.7 El archivo instalador (“instálalo y listo”) [D]

**Nombre:** `gestorventas-{versión}-instalador.run` (script de shell con un *payload* `tar.gz` incrustado, estilo *makeself*).
**Dos variantes** generadas por `scripts/empaquetar.sh`:
- **online** (~KB): contiene compose + scripts; descarga las imágenes de GHCR al instalar.
- **offline** (~cientos de MB): incluye además las imágenes (`docker save`) **de amd64 y arm64**, para instalar sin internet (salvo Docker).

**Qué hace al ejecutarlo** (`sudo ./gestorventas-…-instalador.run`):
1. Detecta SO y arquitectura (`uname -m` → `aarch64`/`x86_64`); verifica RAM libre y espacio en disco (aviso si < 2 GB libres).
2. Si **no hay Docker** → pregunta y lo instala con el método oficial para Debian/Ubuntu/Raspberry Pi OS; habilita el servicio al arranque. (En Synology: muestra instrucciones, no instala nada.)
3. Crea `/opt/gestorventas` (o la ruta elegida), extrae `docker-compose.yml`, `scripts/`, `LEEME.txt`.
4. Genera `.env` (contraseñas aleatorias, `APP_SECRET`, límites de memoria **según la RAM detectada**; permisos 600). Si ya existe, **no lo sobrescribe**.
5. Carga/descarga las imágenes y ejecuta `docker compose up -d`.
6. Espera a que `app` y `db` estén *healthy* (`/api/salud`) y muestra el progreso.
7. Pregunta nombre, email y contraseña del **primer administrador** y lo crea (`crear-admin`).
8. **Acceso exterior (pregunta)**: **[1] Tailscale Funnel** (por defecto: instala Tailscale, muestra el enlace de login, activa Funnel y escribe `PUBLIC_URL`) · **[2] Cloudflare Tunnel** (pide el token y el dominio, escribe `TUNNEL_MODE=cloudflare` y arranca el perfil `cloudflare`) · **[3] Ninguno** (solo red local). Reinicia la app.
9. Imprime: URL local (`http://IP:3000` si `BIND_ADDRESS=0.0.0.0`), URL pública, dónde están las copias y cómo actualizar. **Recuerda guardar una copia de `.env`.**

**Subcomandos** del mismo archivo/instalado: `--actualizar` (descarga la versión nueva y recrea el contenedor de la app **sin tocar datos**, haciendo antes una copia), `--restaurar fichero.dump`, `--estado`, `--logs`, `--desinstalar` (conserva datos) y `--desinstalar --borrar-datos`.
**Idempotente**: ejecutarlo dos veces no rompe nada.

### 14.8 Acceso desde internet sin dominio ni puertos (Tailscale Funnel) [D]
- Instalar Tailscale en la Pi y autenticarse con la cuenta del propietario; en el panel de Tailscale **activar HTTPS y Funnel** para ese equipo.
- Comando: `sudo tailscale funnel --bg 3000` (publica `127.0.0.1:3000` en `https://{equipo}.{tailnet}.ts.net`). [No verificado: sintaxis exacta; comprobar con `tailscale funnel --help`; la documentación oficial muestra `tailscale funnel 3000`.]
- Condicionantes verificados en la documentación oficial: solo dominio `*.ts.net`, puertos públicos 443/8443/10000, solo TLS y límites de ancho de banda no configurables. [V-web]
- El router **no se toca**. El servicio vuelve a publicarse tras reiniciar (modo `--bg`). 
- **Alternativa B — Cloudflare Tunnel** (si el propietario tiene o compra un dominio gestionado en Cloudflare) [V-web: la guía comparativa consultada indica que el túnel con nombre es gratuito y no abre puertos, pero **necesita un dominio en Cloudflare DNS**; el coste del dominio y los pasos exactos de la consola **no se han verificado**]:
  1. En el panel de Cloudflare (Zero Trust → Tunnels) crear un túnel y copiar su **token**.
  2. Añadir un *Public hostname* (p. ej. `ventas.midominio.com`) apuntando a `http://app:3000` (servicio interno de Docker).
  3. Poner en `.env`: `TUNNEL_MODE=cloudflare`, `CLOUDFLARE_TUNNEL_TOKEN=…`, `PUBLIC_URL=https://ventas.midominio.com`.
  4. Arrancar con el perfil: `docker compose --profile cloudflare up -d` (servicio `cloudflared`, 14.5).
  - Ventajas: URL propia y limpia, sin límites de la URL `*.ts.net`. Inconveniente: requiere dominio (coste anual).
  - **Un túnel “rápido” sin dominio** (URL aleatoria que cambia) **no sirve** para este uso (la URL de Google Drive y los marcadores dejarían de funcionar) [I].
- **Regla común a ambas**: la app **solo escucha en `127.0.0.1`/red interna**; nunca se abren puertos del router. El login con doble factor (sección 5) protege la app **en cualquiera de los dos casos**.

### 14.9 Escalabilidad y capacidad de ampliar [D]
- **App sin estado** (sesiones en BD): se puede ejecutar en otra máquina cambiando `DATABASE_URL`; la BD puede moverse a otro equipo.
- **Módulos con fronteras claras**: `lib/auth`, `lib/comisiones`, `lib/backup`, `db/`. Un módulo nuevo = carpeta nueva en `src/lib/{modulo}` + rutas en `src/app/dashboard/{ruta}` + migración.
- **Migraciones versionadas** (`drizzle-kit generate` → SQL en `drizzle/`), siempre **hacia delante**, aplicadas al arrancar.
- **Configuración por `ajustes`** (tabla clave/valor) y variables de entorno para activar/desactivar funciones.
- **API estable** y tipada; el motor de comisiones aislado y probado, de modo que cambiar reglas del plan **no** requiere programar.
- Para crecer (varios usuarios simultáneos/otra empresa): subir límites de memoria, añadir réplica de lectura o pasar la BD a un servidor; el multiempresa queda **fuera de alcance** (1.4).

### 14.10 Estructura final de la carpeta instalada (“el bloque”)
```
/opt/gestorventas/
├─ docker-compose.yml
├─ .env                  # secretos (¡guardar copia aparte!)
├─ LEEME.txt
├─ scripts/              # backup.sh, restaurar.sh, crear-admin.sh, reset-2fa.sh, actualizar.sh …
├─ data/postgres/        # datos de la BD (NO copiar con la BD encendida; usar las copias .dump)
└─ backups/              # copias .dump
```

---

## 15. Rendimiento y fiabilidad en Raspberry Pi 4 (8 GB, SD)

### 15.1 Objetivos medibles (R3) [D]
| Medida | Objetivo en Pi 4 con 5.000 expedientes y 3.000 clientes |
|---|---|
| Carga del dashboard (servidor + pintado) | < 1,0 s |
| Listado de Expedientes (primera pintura útil) | < 1,5 s |
| Guardar un expediente | < 300 ms |
| Calcular una liquidación mensual de un vendedor | < 1,0 s |
| Inicio de sesión (hash + 2FA) | < 600 ms |
| RAM total en uso (app + BD) en reposo | < 1,5 GB |
Estos objetivos se **miden** en la Pi real (fase F7) y, si no se cumplen, se optimiza antes de cerrar.

### 15.2 Medidas [D / I]
- **Sin tirones de arranque en frío**: proceso Node permanente; pool de conexiones `pg` (máx. 10) reutilizado; **no** hay funciones “serverless”.
- Base de datos **en la misma máquina** (latencia mínima) con los **índices** de 4.7 y consultas acotadas (3.3.5).
- **Postgres** ajustado a poca escritura (parámetros del compose en 14.5) [I: valores a validar].
- **Next.js**: `output: standalone`, compresión activada, recursos estáticos con caché larga e inmutable, **fuentes locales**.
- **Desgaste de la SD** [I]: logs de contenedor con rotación (10 MB × 3), `/tmp` en memoria (`tmpfs`), sin consultas registradas (solo las > 500 ms), copias semanales/mensuales en lugar de diarias de larga retención en la SD, y **copias subidas fuera de la SD**. Se **recomienda** (no se exige) arrancar desde un **SSD USB** para mayor vida útil y velocidad.
- **Seguridad de datos con SD defectuosa**: `fsync` de Postgres activado (por defecto); no desactivar `synchronous_commit`.
- **Reinicio automático**: `restart: unless-stopped` + Docker habilitado al arranque; aviso en la app si la BD no responde.

---
