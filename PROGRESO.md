# PROGRESO.md

Actualízalo al terminar cada fase. Para cada una: estado, qué se hizo, qué falta, cómo probarlo, resultado de los tests.

| Fase | Estado | Notas |
|---|---|---|
| F0 Preparación | ✅ hecha (rama `fase/F0-preparacion`, pendiente de aprobación del propietario) | Ver detalle abajo |
| F1 Base sin Clerk y sin comisiones | ⬜ pendiente | |
| F2 Autenticación completa | ⬜ pendiente | |
| F3 Motor de comisiones (sin interfaz) | ⬜ pendiente | |
| F4 Interfaz de comisiones | ⬜ pendiente | |
| F5 Copias y Google Drive | ⬜ pendiente | |
| F6 Empaquetado (imágenes, instalador, guía, túnel) | ⬜ pendiente | |
| F7 Raspberry real y rendimiento | ⬜ pendiente | |
| F8 Datos reales (JSON antiguo y comparación) | ⬜ pendiente | |

## F1 — Base sin Clerk y sin comisiones (EN CURSO, rama `fase/F1-base`)

**Hecho (commit `56d9a08` + cambios sin commitear)**
- Esquema Drizzle (`src/db/schema.ts`, `relations.ts`), migración `0000`, semilla idempotente (`semilla.ts`), `npm run db:migrate`, `npm run crear-admin`.
- Sesiones en BD + cookie, `proxy.ts` (CSRF por Origin, redirección a /login), permisos (`lib/auth/permisos.ts`), login/logout por API, página `/login`.
- Servicios (`lib/servicios/`): clientes, expedientes (lectura/escritura), búsqueda, usuarios/perfil, catálogos/tiendas/ajustes, panel.
- API: expedientes, clientes (+buscar, verificar-existencia), buscar, perfil, tienda-predeterminada, admin (usuarios, usuarios/rol, catalogos, tiendas, ajustes), salud.
- UI: layout del dashboard (Sidebar, ThemeToggle, GlobalSearch, Toast, Modal), Dashboard, RecentExpedientesTable, QuickExpedienteCreator, componentes compartidos en `components/expedientes/`.
- Tests (Vitest contra BD `gestorventas_test`): permisos, expedientes/clientes, fechas de importación.

**Falta en F1**
1. `ExpedientesList` (lista completa con filtros, columnas, paginación, bloqueos de selección/eliminación, edición masiva, CSV, Excel con SheetJS, JSON) y página `/dashboard/expedientes`.
2. Páginas Nuevo/Editar expediente (sin bloque de comisionamiento), Clientes, Buscar, Perfil, Configuración (usuarios, catálogos, ajustes, BBDD), Log de importación; Comisiones e Informes quedan como marcador hasta F4.
3. Servicios y rutas de importación (`/api/expedientes/import`, `importar-excel/verificar|procesar`, `/api/clientes/import`, `/api/importaciones`, `/api/admin/backup`, `/api/admin/db-cleanup`).
4. Más tests (usuarios, catálogos, importaciones), lint, build, prueba manual en navegador, DECISIONES.md y parada con informe.

**Notas de diseño**: la lista de expedientes filtra por defecto por el vendedor actual (como la original); el diseño de referencia está en `referencia/gestorVentas-original/src/components/ExpedientesList.tsx`; no usar heredocs en Bash para escribir archivos con comillas (usar la herramienta Write).

## F2 — Autenticación completa (EN CURSO, rama `fase/F2-autenticacion`)

**Hecho (con tests)**: TOTP RFC 6238 (`src/lib/auth/totp.ts`), cifrado AES-256-GCM con `APP_SECRET` (`cifrado.ts`), códigos de recuperación (`recuperacion.ts`), servicio `src/lib/servicios/autenticacion.ts` (login con límite de intentos y bloqueo progresivo, activar/verificar 2FA, cambiar contraseña, resetear 2FA, limpieza), sesiones parciales y rotación (`sesion.ts`), rutas `/api/auth/{login,verificar-2fa,2fa/preparar,2fa/activar,cambiar-password}` y `/api/admin/usuarios/seguridad`. Migración `0001` (columna `totp_ultimo_contador`, tabla `codigos_recuperacion`).

**Falta (en este orden)**
1. Páginas: `/login` con paso 2FA y código de recuperación, `/cuenta/activar-2fa` (QR + códigos), `/cuenta/cambiar-password`; el layout de `/dashboard` debe redirigir a ellas (2FA primero, luego cambio de contraseña) y mantener la pantalla «Cuenta Suspendida».
2. Botones «Restablecer 2FA» y «Cerrar sesiones» en `AdminUsuariosList`.
3. Cabeceras de seguridad (HSTS, nosniff, X-Frame-Options, Referrer-Policy, CSP) en `next.config.ts`; `/cuenta` en el proxy.
4. Scripts `scripts/reset-2fa.ts` + envoltorios `crear-admin.sh` / `reset-2fa.sh`; `npm run reset-2fa`.
5. Tests de rutas/sesión parcial, lint, build, prueba en navegador, DECISIONES.md, commit, fusionar a main y seguir con F3 (motor de comisiones, leer `docs/informe/12-motor-comisiones.md` y anexo A).

**Pendiente del propietario**: crear su administrador real con `npm run crear-admin -- "Nombre" correo` y luego borrar `admin@admin.com` (contraseña 1234, solo desarrollo; con F2 pedirá activar el 2FA).

## F1 — Base sin Clerk y sin comisiones

**Hecho**
- Expedientes: lista (filtros, orden, paginación, selección masiva, columnas, importar/exportar CSV y Excel), alta y edición (sin bloques de comisiones, que llegan en F4), resumen mensual solo con recuentos.
- Clientes, búsqueda general, perfil («Mis Datos»), log de importaciones con corrección rápida.
- Configuración: usuarios (alta con contraseña temporal), marcas, modelos, tiendas, pagos, estados, ajustes y BBDD (limpieza de huérfanos).
- Copia JSON (formato 2.0) de exportar/restaurar; limpieza de BBDD. Comisiones e Informes son marcadores hasta F4.
- Renting retirado de la semilla (el propietario ya lo había quitado en Configuración).

**Cómo probarlo**
```
docker compose up -d db
npm run dev      # http://localhost:3000  (usuario de desarrollo admin@admin.com, se elimina en F2)
npm test ; npm run typecheck ; npm run lint ; npm run build
```

**Resultado**: 67 tests, typecheck, lint y build en verde; pantallas revisadas en el navegador.

**Pendiente del propietario**: nada.

## F0 — Preparación

**Hecho**
- Repositorio git inicializado con `origin` = `GestorVentasPi`; rama `fase/F0-preparacion`.
- Proyecto Next.js 16.2.6 + React 19.2.4 + TypeScript estricto, sin Tailwind (`output: "standalone"`).
- `globals.css` nuevo con los valores del Anexo C y `@font-face` locales (Outfit y Plus Jakarta Sans en `public/fonts`).
- Portada `/` con los textos y estilos de la original; `/login` provisional; `GlobalModalKeyboardHandler` en el layout; script de tema antes de pintar.
- `src/db/index.ts` (Pool `pg` + Drizzle), `drizzle.config.ts`, `src/lib/date-utils.ts` (`formatDate`), Vitest.
- `docker-compose.yml` de desarrollo con Postgres 16; `.env.example`.
- `.gitignore` con `Notas.txt`, `*.zip`, `INFORME-GESTOR-VENTAS-PI.md`.

**Cómo probarlo**
```
copy .env.example .env
docker compose up -d db
npm install
npm run dev     # http://localhost:3000
npm test ; npm run typecheck ; npm run lint ; npm run build
```

**Resultado**: tests 2/2, typecheck, lint y build en verde; Postgres 16 `healthy`; portada servida con fuentes locales.

**Pendiente del propietario**: nada para F1.
