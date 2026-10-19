# PROGRESO.md

Actualízalo al terminar cada fase. Para cada una: estado, qué se hizo, qué falta, cómo probarlo, resultado de los tests.

| Fase | Estado | Notas |
|---|---|---|
| F0 Preparación | ✅ hecha (rama `fase/F0-preparacion`, pendiente de aprobación del propietario) | Ver detalle abajo |
| F1 Base sin Clerk y sin comisiones | ⬜ pendiente | |
| F2 Autenticación completa | ⬜ pendiente | |
| F3 Motor de comisiones (sin interfaz) | ✅ hecha (rama `fase/F3-motor`) | Ver detalle abajo |
| F4 Interfaz de comisiones | ✅ hecha (rama `fase/F4-interfaz-comisiones`) | Ver detalle abajo |
| F5 Copias y Google Drive | 🟨 hecha salvo la prueba real con Drive (rama `fase/F5-copias-drive`) | Ver detalle abajo |
| F6 Empaquetado (imágenes, instalador, guía, túnel) | ⬜ pendiente | |
| F7 Raspberry real y rendimiento | 🟨 preparada; faltan las pruebas en la Pi (rama `fase/F7-rendimiento`) | Ver detalle abajo |
| F8 Datos reales (JSON antiguo y comparación) | ⬜ pendiente | |

## v1.0.17 — copias de seguridad robustas, datos por secciones y mejoras de uso (17/10/2026)

**Copias de seguridad y datos**
- Corregido: las copias salían vacías (1 KB) cuando no se encontraba `pg_dump` y se daban por buenas. Ahora la app localiza `pg_dump`/`pg_restore` sola (variable `PG_DUMP_CMD`, PATH, carpetas habituales de PostgreSQL en Windows y Linux y, en desarrollo, el contenedor Docker de la base de datos) y, si no existen, lo avisa con un mensaje rojo claro.
- Toda copia se valida al crearla (tamaño, `pg_restore --list` y que contenga los expedientes); si no es válida se borra y se muestra el error. Las copias vacías antiguas quedan marcadas como inválidas y hay un botón para borrarlas. El aviso de «copia antigua» solo cuenta copias válidas.
- El instalador de la Raspberry también valida la copia previa de cada actualización (tamaño y lectura con `pg_restore`) y no actualiza si no es válida.
- Duplicar en masa (más de 10 expedientes nuevos) exige una copia válida de los últimos 15 minutos y, si no la hay, la hace antes; si no se puede, no duplica (salvo «Duplicar sin copia previa», confirmado a mano).
- Nuevo centro «Exportar e importar datos por secciones» (Configuración › BBDD): clientes, expedientes, marcas y modelos, tipos de venta, estados de vehículo, tiendas, planes de comisionamiento (uno, varios o todos), rejillas del Cotejo de pagos, ajustes y usuarios (solo exportar, sin contraseñas). Importar: modos «añadir», «añadir y actualizar» y «sustituir», vista previa exacta de lo que cambiará, confirmación escrita y copia de seguridad automática antes de aplicar. Cada botón explica con un texto de ayuda qué hace, por qué y cuándo usarlo.
- Importar todo en JSON hace ahora una copia previa automática y avisa de que el JSON completo incluye contraseñas cifradas y secretos del doble factor.

**Expedientes y pedidos**
- Compactación de Expedientes y del panel superior; ajuste del botón Laboratorio en Mis Datos.
- Tabla de Expedientes con anchos de columna y altura de fila fijos (no cambia al ocultar entregados), textos largos con puntos suspensivos, valor completo al pasar el ratón y doble clic para copiar con aviso verde.
- Nueva columna «Marca y modelo» (unificada), activable desde «Columnas»; columna «Comisionado» (según el Cotejo de pagos) en lugar de «Cobro».
- Cartera con columnas nuevas: matrícula, tipo de venta y «cobro en otra fecha». Botones Plegar/Desplegar alineados a la derecha.
- Editar expediente rediseñado (rejilla alineada, bloques Cliente / Venta / Fechas / Documentos) y guardado único: cliente y expediente se guardan juntos y, si algo falla, no se guarda nada. Enter guarda.
- Regla de fecha de facturación: en crédito y preference exige antes la fecha RCI (en pantalla y en el servidor).
- Controles rápidos de fecha (Hoy y ← Actual → de día, mes y año) en los modales de fecha del listado.
- Duplicar expedientes (por fila y en masa, hasta 50 copias de cada uno) con marca interna de copia y etiqueta «COPIA» opcional; casillas «Permitir expedientes duplicados» y «Marcar los duplicados con la etiqueta COPIA» en Mis Datos.
- Pedido leído: botón rojo Cancelar (descarta el pedido), Esc cierra y Enter crea el expediente; ventana de marca y modelo nuevos para crearlos tras revisarlos; reconocimiento de solo marca y modelo («DACIA JOGGER extreme…» es Dacia / Jogger); opción «Mostrar la ventana de confirmación solo cuando la marca o el modelo no existan» (en Mis Datos y junto a la zona de arrastre); un pedido de Renault/Dacia sin financiación se propone como contado.
- Planes de comisionamiento: candado de fechas, flechas ← Actual → por mes y nombre automático por mes («Julio 2026»).

**Base de datos:** migraciones 0012 (`expedientes.copia_de`) y 0013 (`expedientes.copia_etiqueta`); se aplican solas al actualizar y no tocan datos existentes.

## v1.0.16 — Cotejo de pagos (16/10/2026)
- Nueva pantalla **Cotejo de pagos** (cruza las rejillas de comisiones con los coches por matrícula) y botón **Contrastar listado** en Expedientes.

## v1.0.15 — pantallas más compactas (16/10/2026)
- Expedientes y la parte superior del dashboard ocupan menos: el listado se ve sin bajar. Los filtros se pueden plegar.
- Nuevo ajuste en «Mis Datos» para ocultar o mostrar el botón «Laboratorio» (se recuerda en cada navegador).


## v1.0.14 — corrección de BBDD (16/10/2026)
- Configuración → BBDD ya no da «Error interno del servidor» cuando hay copias previas ilegibles; las copias previas del instalador se crean con el propietario de la app.

## v1.0.9 — adaptación a móvil (16/10/2026)
- Interfaz adaptable a móvil y tableta (menú en cajón, rejillas y tablas flexibles); escritorio sin cambios.

## v1.0.7 — cambios tras la primera entrega (16/10/2026)
- Lectura de pedidos: tiempo máximo por lectura y OCR limitado a 3 hojas (evita que un PDF largo bloquee la cola).
- Botones Reiniciar equipo y Forzar actualización (el reinicio necesita que la Raspberry ejecute `sudo gv actualizar` una vez para instalar el servicio).

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

## F8 — Datos reales

**Hecho**
- `migracion-v1.ts`: análisis (clasificación de estados y formas de pago, usuarios, avisos) y conversión repetible de la copia JSON 1.0 de la app antigua según 12.13: euros→céntimos, `valor_objetivo`→puntos (el 0 se conserva), cupo→promoción «Importada: N puntos, mínimo M», demo/KM0/usado/buyback→VO con subtipo, VO sin casilla → fecha de cobro = facturación, objetivo único del plan → cada vendedor, tarifas `rate_x_*`→mapa de tramos, `conceptos_adicionales`→conceptos especiales, expedientes sin vendedor → administrador, liquidaciones antiguas → cerradas, `origen='importada_antigua'`, solo lectura.
- API `/api/admin/migracion` y panel «Convertir copia de la aplicación antigua» en Configuración → BBDD.
- «Comparar con liquidación antigua» (`/api/comisiones/comparar` + botón en Liquidación): total, puntos, tramo y diferencia por expediente, con la lista de diferencias que se pueden explicar (12.14); si la liquidación ya se recalculó, compara con su primera versión guardada.
- Tests con una copia sintética en formato 1.0 (conversión, repetibilidad, comparación).

**Pendiente del propietario (aceptación 16.4)**: subir su copia JSON real, convertirla, y comparar sus **4 liquidaciones antiguas**; cualquier diferencia que no se explique por la lista es un fallo a investigar. La conversión de las notas del plan a «comisiones pendientes» queda como texto en las notas del plan (no es interpretable de forma fiable).

## F7 — Raspberry real y rendimiento

**Hecho (sin la Pi)**
- `scripts/medir-rendimiento.ts` (también empaquetado como `dist/scripts/medir-rendimiento.cjs`): genera 5.000 expedientes y 3.000 clientes en una BD `_test` y mide dashboard, listado, guardar con recálculo, liquidación, login e informe.
- Resultados en un PC de desarrollo (muy por debajo de los objetivos 15.1): dashboard 13 ms, listado de 5.000 expedientes 106 ms, guardar con recálculo 32 ms, liquidación mensual 29 ms, hash de login 4 ms, informe de 12 meses 700 ms.
- Endurecimiento del contenedor de la app: sistema de ficheros de solo lectura (escribe solo en `/backups`, `/tmp` y `.next/cache`), `cap_drop: ALL`, `no-new-privileges`, `init`; comprobado que arranca sano.
- `docs/PRUEBAS-RASPBERRY.md`: lista de comprobación (instalación, mediciones, corte de corriente, reinstalación con cronómetro).

**Pendiente del propietario**: ejecutar la lista de `docs/PRUEBAS-RASPBERRY.md` en la Raspberry real y pasar los resultados; si algo no cumple 15.1 se optimiza.

## F6 — Empaquetado

**Hecho**
- `Dockerfile` multi-etapa (Node 22 + `postgresql-client-16`), usuario no-root, `docker/entrypoint.sh` (espera a la BD, migraciones y semilla con cerrojo `pg_advisory_lock`, arranque). Scripts de administración empaquetados con esbuild (`dist/…cjs`: migrar, crear-admin, reset-2fa, reset-password).
- `instalador/docker-compose.yml` de producción (BD sin puertos, límites de memoria, rotación de logs, `tmpfs`, perfil `cloudflare`).
- `instalador/gestorventas.sh` + `scripts/empaquetar.sh` → `gestorventas-X.Y.Z[-offline]-instalador.run`; subcomandos `--estado --logs --actualizar --restaurar --desinstalar`; idempotente.
- GitHub Actions: `ci.yml` (typecheck, lint, tests con Postgres, build, imagen amd64 con `/api/salud`, humo arm64 bajo QEMU, instalador) y `release.yml` (imagen multi-arquitectura en GHCR + instaladores).
- `GUIA-INSTALACION.md` completa (sección 18), scripts `reset-password`, `backup.sh`, `restaurar.sh`.
- Verificado en local (amd64): imagen construida, arranca sana, `pg_dump` desde la app; el instalador en un contenedor Linux limpio instala, crea el administrador, es idempotente, y `restaurar.sh` restaura una copia.

**Pendiente**: ejecutar los workflows en GitHub (imagen arm64 real, GHCR), probar el instalador **online** descargando desde GHCR, Tailscale Funnel y Cloudflare (requieren cuentas del propietario) y la prueba en la Raspberry (F7). La imagen amd64 pesa ~494 MB (objetivo orientativo < 400 MB: se revisará en F7).

## F5 — Copias y Google Drive

**Hecho**
- Copias completas `.dump` (`pg_dump -Fc`) con SHA-256, permisos 600, listado, descarga en streaming, subida de `.dump` (máx. 2 GB) y borrado; retención 14 diarias + 8 semanales + 12 mensuales (solo automáticas).
- Copia automática diaria (03:30 por defecto) con planificador en `instrumentation.ts`; aviso si la última automática tiene más de 48 h o falló.
- Restauración (`pg_restore --clean --single-transaction`) con contraseña + 2FA + «RESTAURAR», modo mantenimiento (503), copia previa, migraciones, vaciado de sesiones y vuelta atrás si falla. `scripts/restaurar.sh` para hacerlo sin la app.
- Google Drive: OAuth 2.0 (`drive.file`, `access_type=offline`), `state` firmado, solo refresh token cifrado, carpeta «GestorVentasPi-Copias», subida reanudable por trozos con reintentos, borrado solo en la carpeta propia, «Reconectar» si se revoca.
- UI en Configuración → BBDD (panel «Copias de seguridad»), revisada en el navegador.
- Tests: copias (con PostgreSQL real vía el cliente del contenedor), retención, planificador, restauración (credenciales, datos recuperados, copia previa, sesiones vaciadas) y Drive con Google simulado.

**Pendiente del propietario**: crear las credenciales de Google Cloud (GOOGLE_CLIENT_ID/SECRET, URI de redirección `{PUBLIC_URL}/api/admin/drive/callback`, app «En producción») y probar «Conectar con Google Drive» con su cuenta. Hasta entonces la subida a Drive está probada solo con un Google simulado.

## F4 — Interfaz de comisiones

**Hecho**
- Recálculo automático al crear/editar/borrar expedientes (`conRecalculo`): meses afectados antes y después, también cerrados, con versión e impacto en la respuesta (`impactos`).
- Servicios: planes (guardar/leer plan completo), liquidaciones (calcular, revisar, cerrar, versiones), libro de puntos, previsión de nómina, cotejo, pendientes de cobro, simulador, informes. API en `/api/comisiones/*`, `/api/expedientes/simular-comision`, `/api/informes`.
- Pantallas: Comisiones (lista de planes + cotejo; editor de 9 pestañas; los no administradores ven solo lo suyo), bloque «Comisionamiento» y «Desglose Estimado» en Editar Expediente, tarjetas de puntos/tramo/comisión en «Detalle y Resumen Estadístico», tarjeta «Objetivo del mes» en el Dashboard, Informes con el motor.
- Revisado en el navegador contra una BD de pruebas: las 9 pestañas, calcular liquidación, desglose y guardado con puntos/importes a mano.

**Cómo probarlo**: `npm test ; npm run typecheck ; npm run lint ; npm run build`

**Pendiente**: «Comparar con liquidación antigua» (F8); aviso previo al guardar un cambio en mes cerrado (hoy se avisa justo después, con la diferencia); las copias JSON aún no incluyen tablas de comisiones (F5).

## F3 — Motor de comisiones (sin interfaz)

**Hecho**
- `src/lib/comisiones/`: motor puro (`calcularMes`, `seleccionarPlan`, `simularExpediente`, `mesesAfectados`, `apuntesDeSincronizacion`), aritmética entera, un único motor para simulador, liquidación e informes.
- Esquema 4.6 (migración `0002_comisiones`) y FK `expedientes.id_promocion`; disparadores de protección (`0003_proteccion_comisiones`): liquidaciones/líneas/conceptos solo con `app.recalculo`/`app.restauracion`; versiones y libro de puntos de solo inserción.
- `src/lib/servicios/liquidaciones.ts`: carga plan y expedientes, `recalcularMes` (transaccional, idempotente, versiona meses revisados/cerrados), `sincronizarLibro`, `recalcularAfectados`.
- Tests: T1–T28 en `motor.test.ts` y `liquidaciones.test.ts` (BD real). Cobertura del motor: 99 % líneas.

**Cómo probarlo**: `npm test ; npm run typecheck ; npm run lint ; npm run build`

**Pendiente / notas**: la copia JSON aún no incluye las tablas de comisiones (se aborda con las copias de F5). Llamar a `recalcularAfectados` desde crear/editar/borrar expediente se conecta en F4 junto a la interfaz.

## F2 — Autenticación completa (COMPLETA, fusionada a main)

**Resultado**: 100 tests, lint, typecheck y build en verde; flujo probado en el navegador (QR, código, recuperación, sesión parcial 401, cabeceras).

**Siguiente: F3 — Motor de comisiones.** Leer `docs/informe/12-motor-comisiones.md` y `docs/anexos/A-*.md` (completo); módulo puro en `src/lib/comisiones/` (enteros: céntimos y centésimas), tests T1–T28; rama `fase/F3-motor`.

**Cómo probar F2**: `npm run db:migrate`, `npm run dev`, entrar con `admin@admin.com` (pedirá activar el 2FA con una app de autenticación). Emergencia: `npm run reset-2fa -- correo`.

**Hecho (con tests)**: TOTP RFC 6238 (`src/lib/auth/totp.ts`), cifrado AES-256-GCM con `APP_SECRET` (`cifrado.ts`), códigos de recuperación (`recuperacion.ts`), servicio `src/lib/servicios/autenticacion.ts` (login con límite de intentos y bloqueo progresivo, activar/verificar 2FA, cambiar contraseña, resetear 2FA, limpieza), sesiones parciales y rotación (`sesion.ts`), rutas `/api/auth/{login,verificar-2fa,2fa/preparar,2fa/activar,cambiar-password}` y `/api/admin/usuarios/seguridad`. Migración `0001` (columna `totp_ultimo_contador`, tabla `codigos_recuperacion`).

**También hecho**: `/login` con paso 2FA y código de recuperación, `/cuenta/activar-2fa` (QR + 10 códigos), `/cuenta/cambiar-password`; el panel exige 2FA y cambio de contraseña; botones «Reset 2FA» y «Cerrar sesiones» en Configuración; cabeceras de seguridad (HSTS, nosniff, X-Frame-Options, Referrer-Policy, CSP); scripts `reset-2fa` y envoltorios `.sh`.

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

## Auditoría y prueba de carga (15/10/2026)

- Corregido: informe en meses de 28/30 días, borrado de usuarios con historial (409), cerrojo por vendedor y mes al recalcular.
- Borrado lógico (`eliminado_en`, migración 0005) en expedientes, clientes y catálogos; estadística de eliminados en Informes.
- Tamaños de página 500 y 1000 en la lista y en Configuración → Expedientes.
- La lista carga como máximo 5.000 expedientes (aviso si hay más). El informe de 12 meses ahora lee los expedientes una vez por vendedor.
- Prueba de carga: `N_EXP=100000 N_CLI=20000 npx tsx scripts/medir-rendimiento.ts` (solo en una BD `*_test`).
- CI: los scripts `.sh` pasan a ser ejecutables en git (el trabajo «instalador» fallaba con «Permission denied»).

## Rejilla, OCR y adjuntos (15/10/2026)

- **Validación de comisiones** (Comisiones → «Validación de comisiones con la rejilla de la empresa»): subir rejilla (Excel/CSV con mapeo de columnas, PDF o foto con OCR, o a mano), revisión de filas antes de guardar, cruce por matrícula, estado de cobro por coche y avisos (Dashboard y contador del menú).
- **Adjuntos** con vista previa en la ficha del cliente y en el expediente; lectura de **DNI** (rellena cliente y guarda la foto, visible al pasar el ratón) y de **pedido** (rellena el expediente).
- Migraciones 0006 (rejillas) y 0007 (adjuntos). Tests: 225.
- Probado: OCR de imagen, PDF con texto y PDF rasterizado en el servidor compilado (con datos sintéticos). **Pendiente con documentos reales**: rejilla de la empresa, DNI (anverso/reverso) y pedido; la vista previa de PDF en el navegador real.

## Documentos reales (15/10/2026)

Con 13 PDF reales del propietario (10 DNI/permisos, 1 pedido, 2 rejillas escaneadas):
- **Pedido** de Renault/Dacia: lectura exacta (cliente, NIE, teléfono, correo, domicilio, vendedor, modelo, fecha, plazo, financiación).
- **DNI**: se separan y enderezan las tarjetas; se leen por completo 2 de 10 y parcialmente 1 (nombre sin número ni fecha). El resto está lavado por el escáner (datos casi invisibles): quedan adjuntos con su foto y se rellenan a mano. Un escaneo a 300 ppp en color y sin «ahorro de tinta» lo mejoraría mucho.
- **Rejillas** escaneadas: el escáner ha perdido casi todo el texto (solo quedan las líneas de la tabla). No se pueden leer; hace falta el Excel/PDF original o un escaneo en color y con más contraste.

## Alta carga (15/10/2026)

Prueba con 1.000.000 de expedientes (`N_EXP=1000000 N_CLI=200000 NODE_OPTIONS=--max-old-space-size=8192 npx tsx scripts/medir-rendimiento.ts`, solo contra una BD `*_test`; tarda unos 6 minutos). Base de datos de ~350 MB (1 M de expedientes, sin adjuntos). Resultados en el PC de desarrollo: panel 0,5 s, lista (5.000) 0,1 s, búsqueda 5–30 ms, informe anual 2 s, guardar un expediente 0,5 s.

## Ajustes de configuración y Raspberry (15/10/2026)

- **Raspberry**: instalador `v1.0.0` publicado (Release con `gestorventas-1.0.0-pi-instalador.run`); instalación probada en una Raspberry Pi 4 real hasta la app en marcha. Falta crear el administrador si la contraseña temporal era débil: `docker compose exec -T app node dist/scripts/crear-admin.cjs "Nombre" correo`.
- **BBDD**: conversión de la copia antigua por partes elegibles; botón «Borrar todos los datos» (con copia previa); marcas y modelos de partida.
- **Tema**: 50 temas de color + 2 originales (Configuración → Tema). **Ayudas** emergentes en todas las opciones. **Apagar equipo** desde el menú (requiere volver a ejecutar el instalador para activar el servicio del sistema).
- **Clientes**: al leer un DNI con el cliente ya guardado, los documentos se vinculan al momento y la lista del modal se actualiza.
- Pendiente: la lectura de un DNI fotografiado con anverso y reverso en la misma foto falla (nombre sin sentido, sin número); hace falta la foto real para ajustarla. Tests: 253 + los nuevos.

## Facturación, RCI y asistente de la Raspberry (16/10/2026)

- **VN comisiona por facturación** (por defecto = matriculación; si se cambia a mano manda ella). **Pagos → «Requerido al matricular»**: sin fecha RCI no se matricula un crédito/preference.
- Lápices: F. Afectación (+bastidor opcional) y F. RCI (+adjuntos). Tabla de tarifas VN con orden, activo y copiar/pegar.
- **`start.sh`**: menú por SSH (instalar, actualizar esperando a GitHub, estado, copias, reinicio…). Carpeta lista en `para-sd/`.
- Pendiente de comprobar en la Raspberry real: el asistente y la actualización sin preguntas (probada solo en un Debian limpio de CI).

## Versión 1.0.3 (16/10/2026)

- Favicon, búsqueda sin autocompletado del navegador, 150 temas de color, versión real en el menú.
- Importación de la copia antigua en modo **añadir** (no borra lo que ya tienes) con copia previa automática; la lista de copias se refresca.
- Documentos: arrastrar DNI, pedido y varios (alta de cliente, alta y edición de expediente); buscador y borrado múltiple.
- Dashboard: arrastrar un pedido sobre un modelo/pago crea el expediente y resuelve el cliente (crear, asociar o elegir).
- `start.sh`: actualización automática en segundo plano (opción 11).
- No comprobado en la Raspberry real: el servicio de actualización automática y el flujo de arrastre con pedidos reales. Sigue pendiente la foto del DNI que falla.

## Después de la 1.0.3 (pendiente de publicar como 1.0.4)

- Clientes: domicilio, población y código postal (migración 0010); el pedido los rellena.
- Planes de comisionamiento: botón «Duplicar».

## Versión 1.0.5 (16/10/2026)

- Comisiones: solo marcas con «Sist. Comisiones»; editor de planes con pestañas con iconos, cabecera con nombre y fechas, y campos alineados bajo sus cabeceras.
- Comprobado en un navegador con una base de pruebas (Resumen, Objetivo, VN, Usados, Financ/Reglas, Bonus); Penalizaciones, Liquidación y Notas no se han revisado visualmente.

## Después de la 1.0.5

- Arrastrar un pedido sobre un expediente del dashboard lo rellena.
- Borrar todos los datos: atómico y con el motivo del fallo.

## Versión 1.0.7 (16/10/2026)

- Pedidos: sin matrícula en vehículos nuevos, retoma («Valoración VO») identificada y separada, pedidos de usados vendidos, fecha de pedido.
- Cola de pedidos recuperable y varios pedidos de golpe; ventana con scroll y casillas por dato.
- Pendiente: probar con pedidos reales con retoma y de usados (aún no recibidos).


## Tras la 1.0.7 (sin publicar)

- Pedidos en PDF escaneado (JBIG2) leídos por OCR; columnas separadas.
- Alias de modelos (R5, R4…) y modelos enseñados por el usuario (`alias_modelos`).
- Aviso de expediente duplicado al leer un pedido.

## Cotejo de pagos y contraste de listados (16/10/2026)

- Pantalla **Cotejo de pagos**: subir rejillas escaneadas, revisar matrículas, guardar por mes y ver el cotejo en verde/amarillo/rojo (+ gris sin rejilla). Probado con las 9 rejillas reales: 58 de 68 matrículas exactas y el resto marcadas para revisar; el cotejo con los 2 listados señala 2 coches sin pagar en julio de 2026.
- Botón **Contrastar listado** en Expedientes (solo lectura).
- Pruebas: 342 en verde (nuevas: `cotejo-pagos`, `contraste-listado`, `servicios/cotejo`).

## Versión 1.0.18 (17/10/2026)

- **Copias internas por sección**: se guardan dentro de la aplicación (tabla `copias_seccion`), con lista, buscador y filtros (origen, fechas), descargar, restaurar con vista previa y borrar; se hacen solas antes de cada importación (se conservan las últimas 20 por sección).
- **Datos por secciones reorganizado** (Configuración › BBDD): secciones agrupadas, tarjetas iguales y botones Exportar | Importar | Copias; los mismos botones están en Clientes, Planes, Cotejo, catálogos y en la ventana «Importar y exportar» de Expedientes.
- **Plantillas de tarifas VN** (tabla `plantillas_tarifas_vn`): genérica de Renault y Dacia incluida (con Dacia Striker), aplicar con ventana por modelo (nuevo / sustituye / ya igual, crear marcas y modelos que falten), guardar las tarifas del plan como plantilla, gestionar, exportar e importar.
- **Plantillas de plan** (tabla `plantillas_plan`): por pestaña (Resumen, Objetivo, Usados, Financ/Reglas, Bonus, Penalizaciones, Notas) y del plan completo; marcas, modelos y vendedores por nombre; aplicar eligiendo partes y «reemplazar / añadir lo que falta»; exportar e importar.
- **Expedientes**: «Columnas y vistas» (ordenar arrastrando, mostrar/ocultar, restaurar predeterminado, vistas incluidas y propias); botones de importar y exportar reunidos en una ventana; atajos de mes más claros; aviso visible cuando se mira otro mes; panel Comisiones con indicadores; colores y efectos por tramo y por puntos.
- **Laboratorio**: se mueve, se redimensiona, «Cerrar» lo recoloca; los avisos dicen cliente, vehículo y matrícula.
- **Ayuda emergente** de reserva en todos los botones que no tenían.
- Pruebas: nuevas `copias-seccion`, `plantillas-tarifas` y `plantillas-plan`.
- Añadido después: comisionado desde «Editar expediente», tasa de intervención financiera en Comisiones, tablas con buscador en el desglose y la cartera, selección en lote de copias de seguridad, clave de recuperación para restaurar copias en cualquier instalación y aviso claro del JSON de datos básicos.

## Versión 1.1.0 (18/10/2026)

- **Comisiones y tasa**: tasa con usados y por marca editable, «Cuenta para la tasa» por forma de pago, financiaciones adelantadas marcadas (cápsula amarilla punteada; suman a la tasa de su marca y no a la global), reparto sustituido por líneas independientes con destino, bonus manuales, fechas de bonus con atajos (◀ ▶, Actual, Plan) y duplicar un plan ajustando sus fechas internas; cajas del mes anterior y del mes elegido con el mismo diseño y la del mes anterior ocultable.
- **Deshacer y rehacer** con historial en toda la aplicación (sin recargar la página), colores por marca y por estado de vehículo, tablas con alineación y vista de columnas.
- **Pedidos y DNI**: se reconoce solo si un archivo es pedido o DNI; cualquier casilla admite los dos, y en el panel un pedido con su DNI crea el expediente con el DNI adjunto y la foto recortada del cliente. Recorte de la foto con la cabeza entera. Guardar un expediente nunca se impide: se avisa y se señala el campo.
- **Expedientes**: deshabilitar expedientes (no cuentan en comisiones ni tasa) por selección y desde el expediente; selección y eliminación que se quedan activas con cuenta atrás configurable.
- **Base de datos** (Configuración › BBDD): subpestañas (Análisis, Papelera y purga, Exportar e importar, Copias, Sistema, Migración y borrado); **Papelera y purga** para ver con vista previa, descargar, elegir y purgar de verdad lo eliminado (con copia previa), purga a fondo y compactar la base; cajitas de datos al instante con el peso de cada archivo; detalle de cada copia de seguridad con lo que ocupa cada tabla; análisis que ya no cuenta los eliminados como huérfanos.
- **Configuración**: Modelos plegables por marca, Expedientes y Tema con subpestañas.
- Pruebas: 494 en verde (nuevas: ajuste de fechas, papelera, detalle de copias, tasa, historial).

## Versión 1.1.1 (19/10/2026)

- **Papelera**: en el registro de auditoría, el historial de deshacer y el registro de lecturas, «Purgar lo elegido» purga las filas marcadas (antes pedía un número de días); «Purgar a fondo» puede vaciar también la auditoría.
- **Subidas de más de 10 MB**: Next recortaba en silencio los cuerpos de petición de más de 10 MB (por el «proxy»): los pedidos de entre 10 y 15 MB se guardaban cortados y las copias .dump subidas desde el navegador llegaban incompletas. Ahora el límite es de 2 GB (`proxyClientMaxBodySize`). Los pedidos ya guardados cortados no se pueden reparar.
- **Visor de la Papelera** incrustable en la propia aplicación (salía en blanco) y **la pestaña de Configuración abierta se recuerda** al recargar.
- **Análisis y limpieza**: las tablas de las tarjetas llevan más columnas con datos (cliente, DNI, matrícula, bastidor, vehículo, forma de pago, estado, vendedor, tienda, todas las fechas, documentos…) y se gestionan con «Columnas y vistas»; el modal es más ancho.
- **Límites de tamaño**: documentos (pedidos, DNI, fotos) hasta 500 MB (antes 15 MB; viven en la base de datos, donde un campo admite como mucho 1 GB, y se procesan en memoria); copias .dump subidas desde el navegador hasta 256 GB, recibidas en flujo sin pasar por memoria (la ruta queda fuera del «proxy» y comprueba ella misma el origen, el modo mantenimiento y la sesión).
- **Pedidos ignorados o con error** (Panel): lista como tabla con filtro por estado, buscador, orden, columnas a elegir, motivo exacto y «Reintentar» / «Quitar» por fila.
- **Cola de pedidos**: casillas para elegir pedidos uno a uno o todos y descartar lo elegido.
- **Pedido leído**: siempre se puede crear marca y modelo nuevos (campos para escribirlos a mano, con aviso de si ya existen) aunque el pedido no diga el modelo; los pedidos de vehículos de ocasión ya se leen la marca y el modelo del resumen («Marca / Modelo / Versión: RENAULT Mégane …»).
- **Cola de pedidos**: «Columnas y vistas» ya no repite la columna de la casilla; el progreso «leyendo N de M» tras recargar la página cuenta lo que el servidor aún tiene en marcha.
- **Cola de pedidos**: más columnas (forma de pago, DNI, teléfono, matrícula, duplicado y, ocultas por defecto, email, domicilio, bastidor, entrega, vendedor del pedido, avisos y fichero), configuración de columnas nueva (la guardada repetía la casilla) y botón «➕ Nueva marca y modelo» visible en el pedido leído.
- **Pedido leído**: se puede elegir si el vehículo es VN o VO desde el modal (también cuando no se reconoció) y los botones del pie están agrupados (descartar a la izquierda y aparte; mirar y salir; crear). Las columnas sin nombre de las tablas ya tienen nombre en «Columnas y vistas».
- **Lectura de pedidos**: reconoce el teléfono cuando viene repetido o con dos números («722203018 / 722203018»), el modelo cuando el OCR escribe «Modeto:» en vez de «Modelo:», y si es nuevo o usado con más señales (Color y Tapicería sin rótulo; número de stock y kilómetros en los de ocasión).
- **Cola de pedidos**: botón «🔄 Releer» en cada pedido y «Releer lo elegido» para varios a la vez (vuelve a leer el PDF guardado con el lector actual, de tres en tres, y actualiza los datos en la cola sin crear documentos nuevos).
- **Lectura de pedidos**: si el OCR lee mal la letra del DNI (o la pierde), se calcula con las 8 cifras y se avisa para comprobarlo.
- **Pedidos de ocasión**: la «E» del distintivo pegada a la matrícula («E5919LZG») se ignora (queda 5919LZG).
- **Pedido leído**: botón «🔄 Releer» en la propia ventana del pedido (rehace la ventana con los datos nuevos).
- **Cola de pedidos**: con Mayús pulsada se eligen de golpe todos los pedidos entre el último marcado y el que pulsas (respeta el orden y la búsqueda de la tabla); con la cola llena se pueden seguir cargando pedidos (se leen en el servidor y pasan a la cola según haya hueco); «Releer» desde la ventana del pedido ya no esconde el visor del PDF; si el OCR lee la letra del DNI como un símbolo («51266944)») se calcula con las 8 cifras.

## Versión 1.2.1 (19/10/2026)

- **Motor de lectura elegible** (Configuración › BBDD › Sistema › «Lectura de pedidos (OCR)»): Tesseract (CPU, cualquier equipo), RapidOCR (CPU, recomendado para Raspberry) o RapidOCR (GPU NVIDIA). RapidOCR son los modelos PP-OCRv5 de PaddleOCR (detección + reconocimiento latino con tildes y «ñ») ejecutados con ONNX Runtime desde `src/lib/servicios/ocr-rapido.ts`, con los modelos en `ocr-modelos/` (se incluyen en la imagen Docker). Detecta el equipo y marca el recomendado (★); «Probar este motor» comprueba si arranca (y con qué: CPU, DirectML o CUDA). Si RapidOCR falla, se lee con Tesseract. Vale solo para pedidos; la rejilla de comisiones sigue con Tesseract.
- **Pedidos que se leen a la vez**: ajuste en la misma pantalla (0 = automático, como hasta ahora; 1 a 32 = fijo). Sustituye a la variable de entorno `LECTORES_PEDIDOS`, que sigue mandando si existe.
- **Pedido leído editable**: cliente, DNI, teléfono, email, domicilio, población (con código postal), fecha del pedido y de entrega, bastidor y matrícula se pueden corregir o escribir en la propia ventana antes de crear; lo editado es lo que se guarda.
- **Lectura**: DNI con la primera cifra leída como letra o una cifra confundida (se corrige si hay una única posibilidad que cuadre con la letra, y se avisa), aviso si el DNI leído no es válido, «Sr. E.» por «Sr. D.», correo con la «@» leída como letra y con un espacio, y cabeceras con rayas o comillas delante («| CLIENTE», «“Marca / Modelo»).
- Pruebas: 499 en verde.

## Versión 1.2.2 (19/10/2026)

- **Exportar todo en un solo JSON e importar en lote** (Configuración › BBDD › Exportar e importar › «Todo en un solo archivo»): se marcan las secciones que van al archivo (`gv_todo_AAAA-MM-DD.json`, formato `gv-lote-1`, una sección tras otra) y al importarlo se elige **qué secciones entran y con qué modo** (solo lo nuevo, añadir y actualizar, o sustituir). El botón «Cotejar lo elegido» enseña, sección por sección, cuántos registros serían nuevos, se actualizarían, ya están igual, se omiten o se eliminarían, con una muestra de cambios, errores y avisos. El cotejo es exacto: aplica todo en una transacción que se deshace, así cuenta con lo que crearían las secciones anteriores (tiendas, estados, tipos de venta y marcas antes que clientes, expedientes y planes). Al aplicar (se escribe IMPORTAR o SUSTITUIR) se hace antes una copia de seguridad nueva y una copia interna de cada sección elegida, y se importa todo o nada. También acepta el archivo de una sola sección. Código: `src/lib/servicios/intercambio-lote.ts`, `/api/admin/datos/lote`, `src/components/datos/PanelLote.tsx`.
- **Lectura de pedidos escaneados**: «CLIENTE» en su propia línea (con el establecimiento al lado), nombre con una letra de más delante de «Doña» y modelo que solo trae el importe (se descarta).
- Pruebas: 506 en verde (nuevas del lote).

## Versión 1.2.3 (19/10/2026)

- **Menú lateral**: en pantallas bajas, o con los botones de administrador (reiniciar servidor, cerrar sesión, reiniciar equipo, forzar actualización, apagar), el pie se salía por debajo de la barra y quedaba «cortado». Ahora la parte de arriba (logo y enlaces) hace scroll si no cabe, el pie se queda siempre dentro de la barra y sus botones se compactan según la altura de la pantalla (no es cosa de la Raspberry: pasaba en cualquier pantalla baja con la sesión de administrador).
- **Subir una copia grande (.dump)**: se sube por trozos de 32 MB (`/api/admin/copias/subir/trozo`), con progreso, reintentos y reanudación; antes iba en una sola petición y con una copia de un giga se cortaba por el camino («Load failed» en Safari, «Failed to fetch» en Chrome). La subida entera (`/api/admin/copias/subir`) sigue disponible.
- **Restaurar una copia**: la restauración se hace en segundo plano. El servidor responde al momento («Restauración iniciada») y la pantalla pregunta cada 3 segundos en `/api/salud` en qué fase va (copia previa, restauración, ajustes) hasta que termina, y entonces lleva al inicio de sesión. Antes la petición duraba todo el proceso (varios minutos en la Raspberry con una copia grande) y el navegador o el túnel la cortaban. Si el servidor se reinicia a mitad, se avisa de que se interrumpió.
- Pruebas: 511 en verde (nuevas: subida por trozos y restauración en segundo plano).

## Versión 1.2.4 (19/10/2026)

- **Contraseña olvidada**: en Configuración › Usuarios hay un botón «🗝️ Contraseña temporal» para cada usuario (solo administradores): crea una contraseña nueva que se ve una sola vez, obliga a cambiarla al entrar, quita bloqueos por intentos y cierra sus sesiones (`POST /api/admin/usuarios/seguridad` con `accion: reset_password`, queda en la auditoría sin la contraseña).
- **Pantalla de login**: bajo el formulario hay una ayuda desplegable «¿Has olvidado la contraseña o el doble factor?» que explica qué hacer: otro administrador desde Configuración › Usuarios o, si es el único, `./scripts/reset-password.sh` y `./scripts/reset-2fa.sh` en la carpeta de instalación.
- Pruebas: 512 en verde.

## Versión 1.2.5 (19/10/2026)

- **«¿Has olvidado la contraseña?» en el login**: correo + código de 6 cifras del autenticador (o un código de recuperación) + contraseña nueva, sin necesitar la antigua (`POST /api/auth/recuperar-password`). Cierra todas las sesiones del usuario y quita bloqueos por intentos. No revela si un correo existe, está suspendido o no tiene doble factor (mismo error para todo), y limita los intentos por IP y correo y, además, por usuario entre todas las IP. Si no se tiene el autenticador, la propia pantalla explica la salida (otro administrador o los scripts).
- **Cambiar contraseña con la sesión abierta sin saber la actual**: en «Cambiar contraseña» hay un enlace «No recuerdo la contraseña actual: usar el código del autenticador»; vale también tras una contraseña temporal. Se conserva la sesión desde la que se pide y se cierran las demás.
- La contraseña nueva se valida antes de gastar el código del autenticador, así un error de formato no obliga a esperar al código siguiente.
- Pruebas: 518 en verde (nuevas: recuperación y cambio con código, sin revelar usuarios, límites, registro del servidor).
- **Registro del servidor dentro de la aplicación** (Configuración › BBDD › «📜 Registro del servidor»): lo que el programa escribe con `console` se guarda también en `backups/.servidor.log` (se conserva al reiniciar y se rota a los 5 MB); la pestaña lo muestra con filtro por nivel (todo, avisos y errores, solo errores), buscador, «Actualizar solo», **📋 Copiar** al portapapeles y ⬇️ Descargar. Una restauración que falla deja ahí el detalle completo (la salida de `pg_restore`) y la ventana de restauración lo indica; el detalle del fallo solo lo ve un administrador con sesión (`/api/salud` lo filtra para el resto).
- **Ojo para ver la contraseña** en el inicio de sesión, la recuperación y el cambio de contraseña (campo con 👁️ que muestra u oculta lo escrito).
- **Menú lateral en pantallas de 1080p**: «Reiniciar servidor», «Reiniciar equipo», «Forzar actualización» y «Apagar equipo» pasan a un solo botón plegable «Equipo y servidor» (cerrado por defecto) para que el pie no ocupe media pantalla.

## Versión 1.2.6 (19/10/2026)

- **Diagnóstico de rendimiento** (Configuración › BBDD › «🩺 Rendimiento»), para saber por qué va lenta la Raspberry: medidores de procesador, memoria libre y swap, temperatura y limitación por calor o tensión (`get_throttled`), uso y espera del disco (PSI), bloqueo del servidor, base de datos (latencia, acierto de caché, consultas en marcha, tablas grandes, filas muertas), lecturas de pedidos en marcha, peticiones más pesadas y consultas lentas, con gráficas de la última hora y media y una lista de «Qué parece estar pasando» con la causa probable y qué hacer. Un muestreador anota el equipo cada 30 s aunque la pantalla esté cerrada y deja avisos en el registro del servidor (temperatura, memoria, swap, disco, CPU, bloqueos). Botones «💽 Probar la velocidad del disco» (escribe y borra 64 MB y mide las escrituras sincronizadas, lo que más importa a una SD) y «🗄️ Probar la base de datos», y **📋 Copiar informe** con todo junto para pegarlo.
- **Indicador de recursos en la barra superior** (solo administrador, a la izquierda del buscador): una cajita con la CPU, la memoria y la lectura y escritura del disco (SD) en vivo (se actualiza cada 5 s mientras la pestaña está visible), con 🩺, 🟠 o 🔴 según lo cerca que esté del límite (CPU, memoria, swap, temperatura, limitación de la Raspberry y disco). Al pulsarla se abre una ventana con el diagnóstico completo de «Rendimiento». En móvil se reduce a CPU y memoria. Ruta `/api/admin/recursos`.
- **Registro del servidor más completo**: además de los errores, se anotan las peticiones que tardan más de 2 s o fallan (ruta, sin datos), las consultas a la base de datos de más de 0,5 s (texto SQL sin parámetros), cuánto tarda cada lectura de documento y con qué motor, y el arranque del servidor con su versión y plataforma.
- **Raspberry**: las lecturas de pedidos a la vez pasan a un máximo de 2 por defecto en ARM64 (se puede cambiar en Sistema) y ONNX Runtime usa 2 hilos por lectura en CPU ARM64, para que leer pedidos no sature el equipo.
- Pruebas: 524 en verde (nuevas: rendimiento, registro de lo lento y recursos rápidos).

## Primer arranque: crear el administrador desde la pantalla (sin publicar)

- Una instalación nueva, sin ningún usuario, ya no necesita el comando `crear-admin`: `/login` redirige a `/primer-arranque`, una pantalla para crear al administrador (nombre, correo, contraseña con ojo y el «código de primer arranque»). Después sigue el flujo de siempre: se crea una sesión parcial y se obliga a activar el doble factor (`/cuenta/activar-2fa`).
- Protecciones: solo existe mientras no haya **ningún** usuario (se comprueba otra vez dentro de la transacción con un bloqueo de la base de datos, así dos peticiones a la vez crean un único administrador); hace falta el **código de primer arranque** (XXXX-XXXX), que solo se ve en el equipo (línea «PRIMER ARRANQUE» en el registro del servidor y archivo `.primer-arranque.txt` de la carpeta de copias) para que nadie que alcance la dirección antes que el propietario se quede con la instalación; intentos fallidos limitados por IP (5 y bloqueo progresivo); al crearse el primero, el código se borra y la pantalla redirige siempre a `/login`. Rutas: `/primer-arranque`, `POST /api/auth/primer-administrador`; servicio `src/lib/servicios/primer-arranque.ts`.
- Pruebas: 7 nuevas (creación, código incorrecto y bloqueo, usuarios existentes, validaciones, concurrencia, anuncio en el registro).

## Apple Vision como motor de OCR en macOS (sin publicar)

- Nuevo motor «Apple Vision» en Configuración › BBDD › Sistema › Lectura de pedidos, **solo cuando la aplicación corre directamente en macOS** (no aparece en Docker, Windows ni Linux, y la API rechaza elegirlo fuera de macOS). En un Mac es el recomendado (★) y el que se usa por defecto. Usa el reconocimiento de texto del propio sistema (Neural Engine en los chips M).
- Cómo funciona: `herramientas/ocr-vision.swift` es un programa de Swift (Vision) que la aplicación **compila sola la primera vez** con `swiftc` (hace falta `xcode-select --install`) y guarda en `backups/.herramientas/ocr-vision-<huella>`; se ejecuta una vez por página y devuelve las cajas de texto, que se unen en líneas con el mismo agrupador que RapidOCR (`ocr-lineas.ts`).
- Respaldo automático: Apple Vision → RapidOCR (CPU) → Tesseract. Si Vision no compila o falla, se avisa una vez en el registro del servidor y se sigue con el siguiente.
- «Probar este motor» comprueba que el programa se puede compilar y ejecutar.
- Pruebas: 10 nuevas con un programa falso en lugar de Vision (lectura de la salida, agrupación, respaldo, motor no usado en la rejilla de comisiones). **No se ha probado en un Mac real**: el código de Swift no se ha compilado todavía.
- **Medidor de memoria en macOS** (cajita de la barra superior y pestaña Rendimiento): en un Mac salía siempre casi lleno porque `os.freemem()` solo cuenta las páginas libres del todo y macOS usa la RAM como caché. Ahora se calcula como Monitor de Actividad con `vm_stat` (usada = páginas anónimas − purgables + cableadas + comprimidas; el resto es disponible; si faltan las anónimas, libres + inactivas + especulativas + purgables) y el swap con `sysctl vm.swapusage`. Linux (`MemAvailable`) y Windows (`os.freemem()`) no cambian. Código en `src/lib/memoria-macos.ts` con pruebas sobre una salida de `vm_stat` de ejemplo; **sin probar en un Mac real**.

## Cancelar la subida y la lectura de pedidos, lectura manual y motor en el dashboard (sin publicar)

- **Cancelar sin dejar nada a medias**: el overlay de subida tiene «✖ Cancelar subida» y todos los demás botones «Cancelar» de lectura abren el mismo diálogo. Con la subida en marcha pregunta **🗑 Eliminar todo lo subido** (borra lo subido de esa tanda: lo que esperaba, lo que se estaba leyendo y lo ya leído que siga en la cola de pedidos, con sus documentos) o **📌 Dejarlo subido** (solo para la subida; lo subido espera) o seguir. Cancelar también para lo que **se está leyendo**: el lector termina su hoja pero tira el resultado y borra el documento que hubiera guardado.
- **Cancelar un pedido suelto**: «Ver lo que falta» en el estado de lecturas lista lo subido, en espera y leyéndose, con «✖ Cancelar» en cada uno.
- **Lectura manual** (por defecto): tras subir los pedidos no se lee nada hasta pulsar **▶ Iniciar lectura** (en el estado de lecturas y junto a la zona de arrastrar). Se puede volver a la lectura automática desmarcando «Lectura manual» (ajuste `lectura_manual`). En manual, el aviso automático del navegador al terminar de subir no hace nada y el servidor no pone a leer solo lo abandonado.
- **Motor de OCR en el dashboard**: junto a la zona de arrastrar, los administradores tienen el desplegable del motor (Tesseract, RapidOCR CPU o GPU, Apple Vision en Mac) y la casilla «Lectura manual», sin ir a Configuración.
- Pruebas: nuevas del servidor (lista de lo que falta, cancelar por ids y todo, cancelar durante la lectura, lectura manual) y del cliente (qué se cancela en cada opción).
