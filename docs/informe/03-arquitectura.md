> Parte del informe completo (`docs/INFORME-COMPLETO.md`). **Leyenda de marcas** [V-código] [V-reglas] [V-Prompts] [V-web] [D] [I] [P]: ver `00-leyenda-vision-entorno.md` (sección 0.1). Regla: no conviertas una [I] o [P] en hecho sin comprobarlo; aplica el valor por defecto y anótalo en `DECISIONES.md`.

## 3. Arquitectura y stack tecnológico

### 3.1 Principio general

**Una aplicación Next.js (frontend + API en el mismo proceso) + una base de datos PostgreSQL en otro contenedor.** Todo se orquesta con **Docker Compose** dentro de **una única carpeta** que el propietario puede copiar, versionar y reinstalar. [D]

```
Navegador ──HTTPS──> Tailscale Funnel (URL *.ts.net) ──> Pi: 127.0.0.1:3000 (contenedor "app")
                                                              │ TCP 5432 (red interna Docker)
                                                              ▼
                                                      contenedor "db" (PostgreSQL 16)
                                                              │
                                  volumen ./data/postgres (datos)   ./backups (copias .dump)
```

### 3.2 Stack (mantener lo de la app original salvo lo indicado)

| Capa | Tecnología | Marca |
|---|---|---|
| Framework | **Next.js 16.x** (App Router) y **React 19.x**, **TypeScript 5** | [V-código: `next 16.2.6`, `react 19.2.4`] |
| Estilos | **CSS global propio** con variables y estilos en línea. **No hay Tailwind.** Escribir un `globals.css` **nuevo que reproduzca exactamente** los valores del Anexo C | [V-código: no existe `tailwind.config` ni `postcss.config`] |
| Fuentes | **Outfit** (títulos) y **Plus Jakarta Sans** (cuerpo), **autoalojadas** (ficheros `.woff2` en `public/fonts`) en lugar de Google Fonts | Original las carga de Google Fonts [V-código]; autoalojar es [D] para que funcione sin internet |
| ORM | **Drizzle ORM 0.45.x** + `drizzle-kit` para migraciones | [V-código] |
| Driver BD | **`pg` (node-postgres)** con `drizzle-orm/node-postgres` y `Pool`. **Se elimina `@neondatabase/serverless` y `neon-http`.** | Original usa `neon-http`, que **no soporta transacciones** [V-código: Prompts.txt, error “No transactions support in neon-http driver”]. El propio informe del repositorio propone este cambio |
| Base de datos | **PostgreSQL 16** en contenedor (`postgres:16-bookworm`, multi-arquitectura) | [D] (el original no fija versión) |
| Autenticación | **Propia** (sección 5): contraseña con hash **Argon2id** (o bcrypt como alternativa), **TOTP** RFC 6238, sesiones en base de datos | [D] |
| Excel | Lectura de `.xlsx` en el navegador como en el original (`xlsx`) | [V-código: dependencia `xlsx ^0.18.5`]. [No verificado] Esa versión del paquete npm tiene avisos de seguridad conocidos; usar la versión oficial de SheetJS (`cdn.sheetjs.com`) o `exceljs` y procesar solo ficheros del propio usuario |
| Programación de tareas | `node-cron` dentro del proceso de la app (copias automáticas) | [D] |
| Contenedores | Docker Engine + Docker Compose v2 (plugin) | [D] |
| Exposición | Tailscale en el sistema operativo de la Pi (no en contenedor) | [D] |
| Pruebas | Vitest (motor y API) | [D] |

### 3.3 Reglas de código obligatorias

1. **Toda la lógica de acceso a datos y permisos en el servidor.** Cada Route Handler y cada página servidor comprueba sesión **y** rol antes de actuar (sección 7). Nunca confiar en que el navegador oculte botones.
2. **Transacciones** (`db.transaction`) en toda operación que escriba en varias tablas (crear expediente + cliente + teléfonos/correos, recalcular liquidación, importaciones, restauración). El original no las tenía. [V-código: no hay ninguna transacción] 
3. **Validación de entrada** con un esquema (p. ej. Zod) en cada endpoint. El original no valida de forma sistemática (341 usos de `any`). [V-código] El nuevo código debe evitar `any`.
4. **Variables de entorno** solo en `.env` (nunca en el repositorio). Lista en 14.4.
5. **Consultas acotadas**: el original carga *todos* los expedientes con sus relaciones en cada petición (listado, dashboard, liquidar, simular). [V-código] En la Pi esto debe optimizarse sin cambiar la interfaz: seleccionar solo columnas necesarias, índices (sección 4.6) y, cuando sea posible, filtrar por rango de fechas en el servidor.
6. **Cálculo de comisiones en un módulo puro** (`src/lib/comisiones/`) sin acceso a BD ni a `fetch`, usado por servidor y navegador. Así se puede probar de forma aislada (sección 16).

### 3.4 Estructura de carpetas del repositorio

```
GestorVentasPi/
├─ README.md                      # qué es y cómo arrancar en 5 líneas
├─ GUIA-INSTALACION.md            # guía paso a paso (esquema en sección 18)
├─ docker-compose.yml             # servicios db + app (sección 14.5)
├─ Dockerfile                     # multi-etapa, amd64 + arm64 (sección 14.6)
├─ .env.example                   # plantilla de variables (sin secretos)
├─ .github/workflows/docker.yml   # compila y publica la imagen arm64 en GHCR
├─ referencia/gestorVentas-original/  # código original, SOLO LECTURA (no se despliega)
├─ CLAUDE.md  ·  DECISIONES.md   # instrucciones de trabajo (17.1) y registro de decisiones
├─ scripts/
│  ├─ empaquetar.sh               # genera el archivo instalador (14.7)
│  ├─ instalar.sh                 # lógica del instalador (Docker, carpetas, .env, arranque)
│  ├─ backup.sh                   # copia manual por línea de comandos
│  ├─ restaurar.sh                # restaura un .dump
│  ├─ crear-admin.sh              # crea el primer administrador
│  ├─ reset-2fa.sh                # quita el 2FA de un usuario (emergencia)
│  ├─ reset-password.sh
│  └─ actualizar.sh               # docker compose pull && up -d
├─ drizzle.config.ts
├─ next.config.ts                 # output: "standalone"
├─ public/fonts/                  # Outfit y Plus Jakarta Sans (.woff2)
└─ src/
   ├─ middleware.ts               # redirige a /login si no hay cookie de sesión (sin lógica de BD)
   ├─ app/
   │  ├─ layout.tsx               # sin ClerkProvider; script de tema (data-theme) como el original
   │  ├─ globals.css              # escrito de nuevo; valores EXACTOS del Anexo C + @font-face locales
   │  ├─ page.tsx                 # portada (como el original) o redirección según sesión
   │  ├─ login/                   # inicio de sesión + paso de código 2FA
   │  ├─ cuenta/                  # activar 2FA, cambiar contraseña
   │  ├─ dashboard/               # mismas rutas que el original (sección 9)
   │  └─ api/                     # mismas rutas que el original + /auth y /backups (sección 11)
   ├─ components/                  # mismos componentes que el original (nombres idénticos)
   ├─ db/
   │  ├─ index.ts                 # Pool de pg + drizzle
   │  ├─ schema.ts                # tablas (sección 4)
   │  └─ migrations/              # migraciones de drizzle-kit (SQL versionado)
   └─ lib/
      ├─ auth/                    # sesiones, hash, TOTP, límite de intentos, permisos
      ├─ comisiones/              # motor de puntos y comisiones (sección 12)
      ├─ backup/                  # pg_dump / pg_restore / Google Drive
      └─ date-utils.ts            # formatDate etc. (como el original)
```

**Nombres de rutas y componentes**: se mantienen **idénticos** a los de la app original para facilitar la comparación (Anexo D y sección 9), aunque el código se escriba de nuevo. [V-código]

---
