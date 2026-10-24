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

## Versión 1.2.7 (19/10/2026)

Incluye todo lo que sigue (primer arranque, Apple Vision, RAM de macOS, cancelar y lectura manual, nombre y tipo de equipo).

### Primer arranque: crear el administrador desde la pantalla

- Una instalación nueva, sin ningún usuario, ya no necesita el comando `crear-admin`: `/login` redirige a `/primer-arranque`, una pantalla para crear al administrador (nombre, correo, contraseña con ojo y el «código de primer arranque»). Después sigue el flujo de siempre: se crea una sesión parcial y se obliga a activar el doble factor (`/cuenta/activar-2fa`).
- Protecciones: solo existe mientras no haya **ningún** usuario (se comprueba otra vez dentro de la transacción con un bloqueo de la base de datos, así dos peticiones a la vez crean un único administrador); hace falta el **código de primer arranque** (XXXX-XXXX), que solo se ve en el equipo (línea «PRIMER ARRANQUE» en el registro del servidor y archivo `.primer-arranque.txt` de la carpeta de copias) para que nadie que alcance la dirección antes que el propietario se quede con la instalación; intentos fallidos limitados por IP (5 y bloqueo progresivo); al crearse el primero, el código se borra y la pantalla redirige siempre a `/login`. Rutas: `/primer-arranque`, `POST /api/auth/primer-administrador`; servicio `src/lib/servicios/primer-arranque.ts`.
- Pruebas: 7 nuevas (creación, código incorrecto y bloqueo, usuarios existentes, validaciones, concurrencia, anuncio en el registro).

### Apple Vision como motor de OCR en macOS

- Nuevo motor «Apple Vision» en Configuración › BBDD › Sistema › Lectura de pedidos, **solo cuando la aplicación corre directamente en macOS** (no aparece en Docker, Windows ni Linux, y la API rechaza elegirlo fuera de macOS). En un Mac es el recomendado (★) y el que se usa por defecto. Usa el reconocimiento de texto del propio sistema (Neural Engine en los chips M).
- Cómo funciona: `herramientas/ocr-vision.swift` es un programa de Swift (Vision) que la aplicación **compila sola la primera vez** con `swiftc` (hace falta `xcode-select --install`) y guarda en `backups/.herramientas/ocr-vision-<huella>`; se ejecuta una vez por página y devuelve las cajas de texto, que se unen en líneas con el mismo agrupador que RapidOCR (`ocr-lineas.ts`).
- Respaldo automático: Apple Vision → RapidOCR (CPU) → Tesseract. Si Vision no compila o falla, se avisa una vez en el registro del servidor y se sigue con el siguiente.
- «Probar este motor» comprueba que el programa se puede compilar y ejecutar.
- Pruebas: 10 nuevas con un programa falso en lugar de Vision (lectura de la salida, agrupación, respaldo, motor no usado en la rejilla de comisiones). **No se ha probado en un Mac real**: el código de Swift no se ha compilado todavía.
- **Medidor de memoria en macOS** (cajita de la barra superior y pestaña Rendimiento): en un Mac salía siempre casi lleno porque `os.freemem()` solo cuenta las páginas libres del todo y macOS usa la RAM como caché. Ahora se calcula como Monitor de Actividad con `vm_stat` (usada = páginas anónimas − purgables + cableadas + comprimidas; el resto es disponible; si faltan las anónimas, libres + inactivas + especulativas + purgables) y el swap con `sysctl vm.swapusage`. Linux (`MemAvailable`) y Windows (`os.freemem()`) no cambian. Código en `src/lib/memoria-macos.ts` con pruebas sobre una salida de `vm_stat` de ejemplo; **sin probar en un Mac real**.

### Cancelar la subida y la lectura de pedidos, lectura manual y motor en el dashboard

- **Cancelar sin dejar nada a medias**: el overlay de subida tiene «✖ Cancelar subida» y todos los demás botones «Cancelar» de lectura abren el mismo diálogo. Con la subida en marcha pregunta **🗑 Eliminar todo lo subido** (borra lo subido de esa tanda: lo que esperaba, lo que se estaba leyendo y lo ya leído que siga en la cola de pedidos, con sus documentos) o **📌 Dejarlo subido** (solo para la subida; lo subido espera) o seguir. Cancelar también para lo que **se está leyendo**: el lector termina su hoja pero tira el resultado y borra el documento que hubiera guardado.
- **Cancelar un pedido suelto**: «Ver lo que falta» en el estado de lecturas lista lo subido, en espera y leyéndose, con «✖ Cancelar» en cada uno.
- **Lectura manual** (por defecto): tras subir los pedidos no se lee nada hasta pulsar **▶ Iniciar lectura** (en el estado de lecturas y junto a la zona de arrastrar). Se puede volver a la lectura automática desmarcando «Lectura manual» (ajuste `lectura_manual`). En manual, el aviso automático del navegador al terminar de subir no hace nada y el servidor no pone a leer solo lo abandonado.
- **Motor de OCR en el dashboard**: junto a la zona de arrastrar, los administradores tienen el desplegable del motor (Tesseract, RapidOCR CPU o GPU, Apple Vision en Mac) y la casilla «Lectura manual», sin ir a Configuración.
- Pruebas: nuevas del servidor (lista de lo que falta, cancelar por ids y todo, cancelar durante la lectura, lectura manual) y del cliente (qué se cancela en cada opción).

### Nombre y tipo de equipo en la cajita de recursos

- A la izquierda de CPU, la cajita de la barra superior dice **qué equipo es**: 💻 AMD (un PC con procesador AMD, como el del propietario), 💻 Intel, 🍎 Apple (Mac con chip Apple «silicon»), 🍓 Raspberry (o un Linux ARM64 sin más datos, que en Docker es lo que se ve en la Raspberry) o 🖥️ otro, junto al **nombre del equipo**. El detalle (modelo, procesador, núcleos y sistema) sale al pasar el ratón y en la ventana de rendimiento, cuyo título lleva el nombre y el tipo.
- El nombre sale del equipo; dentro de Docker `os.hostname()` es el identificador del contenedor, así que se prefiere `/host/hostname` (el `/etc/hostname` de la Raspberry, montado en solo lectura en `docker-compose.yml` del instalador) o la variable `NOMBRE_EQUIPO`. Además se puede **poner un nombre a mano** en la ventana de rendimiento («Nombre de este equipo», ajuste `nombre_equipo`), que es lo que funciona en las instalaciones ya hechas, cuyo compose no se actualiza solo.
- Pruebas: 5 nuevas (tipo de equipo y nombre).

### Visor del pedido: volver a cargar el archivo

- El visor del pedido leído comprueba si el archivo sigue guardado. Si se purgó (Configuración › BBDD › Papelera), en vez de salir en blanco dice «El archivo de este pedido ya no está guardado» y ofrece **📎 Volver a cargar el archivo** (también visible siempre junto a «Abrir en otra pestaña»): se elige otra vez el PDF o la foto, se sube como documento del pedido y el pedido de la cola pasa a usarlo (así se guarda con el expediente al crearlo). Si el nombre del archivo no coincide con el del pedido leído, pregunta antes.
- El diagnóstico de rendimiento ya no se queda colgado si la base de datos está bloqueada: espera como mucho 5 s y lo dice.

### Sin escribir palabras para confirmar, registro del servidor y OCR en lotes

- **Confirmaciones sin palabra escrita**: ningún modal pide ya escribir IMPORTAR, SUSTITUIR, RESTAURAR, PURGAR, BORRAR TODO o CONVERTIR. El botón se arma con el primer clic («Pulsa otra vez para confirmar») y se ejecuta con el segundo, en 7 s; si no, se desarma. El servidor sigue recibiendo la constante, así que la API no cambia.
- **Registro del servidor**: ahora recoge también lo que sale directamente por la salida estándar y de errores (Next en desarrollo no pasa por el `console` parcheado), sin las líneas de petición ni los códigos de color.
- **OCR RapidOCR en lotes**: los recortes de texto se leen de ocho en ocho (`OCR_LOTE_REC` para cambiarlo). En una RTX 4090 con DirectML una página pasó de 6,0 s a 1,55 s (en CPU de 3,8 s a 2,2 s en dos páginas). Comparado con lectura de uno en uno sobre 12 documentos: 0 campos distintos. El resto del proceso (renderizar el PDF, recortar, agrupar) sigue en CPU, por eso la GPU no hace volar la lectura.

## Versión 1.3.0 (19/10/2026) — Cotejo avanzado: listados, pagos de RCI y revisión de anulados

### Completar datos desde listados (los Excel de la intranet, VN y VO)
- **Documentos comparados sin errores tontos**: el NIF/DNI/CIF se compara sin ceros a la izquierda, espacios ni guiones (`03217951K` = `3217951K`) y, si no hay coincidencia, se sugieren los documentos que difieren en un carácter (error típico de lectura). La matrícula se guarda como `1234ABC`: se quita la fecha entre paréntesis y una «E» inicial.
- **Pedidos repetidos del mismo cliente**: se afina por correo, marca, modelo, expediente sin bastidor y fecha más cercana; si sigue habiendo duda, la fila queda «Dudosa» con los expedientes candidatos.
- **VO**: la fecha del paréntesis y «Fecha matriculación» (la del coche, años atrás) se guarda en un campo nuevo, «Primera matriculación», que no cuenta para las comisiones. Los VN siguen rellenando la matriculación y la facturación.
- **Estado de la intranet**: «Archivado», «Anulado», «Matriculación»… se guarda en cada expediente (columna nueva «Estado intranet» en la lista de Expedientes, con filtro, y en la columna Estado del Cotejo de pagos), para revisar a mano lo anulado y lo archivado.
- **Modal de revisión**: filtros (con cambios, sin cambios, sin expediente, dudosos, anulados, archivados, todas) con contadores, buscador, columnas elegibles, y por fila un botón **Abrir** con el **PDF del pedido** a un lado y, al otro, lo del listado, el expediente asociado, los datos que se guardarán (**editables**), los candidatos para elegir a mano y un buscador de expedientes. Un anulado en el listado no se marca solo (salvo su estado) y se puede **deshabilitar** el expediente, todo deshacible desde el Log de importaciones. Las fechas mal escritas se rechazan.
- Dos listados (VN y VO) pueden traer el mismo número de fila: ahora se renumeran para que no choquen.

### Pagos de la financiera (RCI / Mobilize)
- Nueva zona **«Arrastra aquí los pagos de RCI»** junto a la de pedidos (y botón «Cargar pagos RCI» y «Cargar carpeta»): solo coge el «Detalle de la liquidación de pago»; todo lo demás se ignora y queda en una lista para revisarlo. La zona de pedidos ya descartaba estos PDF.
- La **fecha de pago es la fecha RCI** del expediente. Se busca el expediente por bastidor (VN) o bastidor/matrícula (VO), comprobando el NIF del adquiriente (no el de la persona que representa a la financiera) y, si solo hay documento, por el cliente cuando tiene un único expediente que pueda llevar el pago. Si el documento contradice, hay varios, no hay expediente o ya tiene otra fecha RCI, queda **pendiente**: modal con el PDF, datos editables, candidatos y buscador. Nunca crea expedientes.
- Lista de pagos con filtros (pendientes, aplicados, ignorados), buscador, columnas elegibles y «Deshacer»; el PDF pasa a los documentos del expediente (tipo «Pago de la financiera»).
- **Cajita «Subir el pago de RCI»** en la ficha del expediente, junto a la fecha RCI: lee el PDF y la rellena; avisa si el documento no es el del cliente.
- Tabla nueva `pagos_rci` y columnas `fecha_primera_matriculacion` y `estado_intranet` en expedientes (migraciones 0038 a 0040, solo añaden).
- Las cabeceras de la tabla de Expedientes tienen ahora ayuda al pasar el ratón.

## Versión 1.3.1 (20/10/2026)
- Corregido: subir desde la cajita de un expediente un pago de RCI que ya estaba aplicado a otro expediente le ponía su fecha por error; ahora avisa y no lo toca (un pago pendiente sí se aplica al expediente elegido, sin duplicarse).
- En el modal de listados, «Quitar asociación manual» solo sale cuando la asociación se eligió a mano.
- Corregido un bucle de recargas en el servidor de desarrollo: el registro del servidor anotaba las líneas «✓ Compiled in…» de Next en un archivo que está dentro del proyecto, Next lo veía cambiar, volvía a compilar y recargaba la página sin parar. Ahora esas líneas no se anotan (no afecta a la aplicación instalada, que no compila).
- **Pedido a nombre de una persona y pago e intranet a nombre de otra** (por ejemplo, el coche se pide a nombre del hijo y lo financia y figura la madre): en el modal de listados, una fila que no encuentra ningún expediente sugiere los expedientes **sin bastidor ni matrícula** que encajan por pistas: mismo modelo, fecha de pedido cercana, apellido en común, mismo código postal, teléfono o correo y un pago de RCI pendiente de ese bastidor (el aviso lo dice). Se marca un «probable» solo si destaca, con botón «Elegir este». Al asociarlo a mano se propone **cambiar el titular** (nombre y NIF) y queda una **nota en los comentarios del cliente y del expediente** con los datos anteriores; todo se deshace desde el Log de importaciones.
- **El pago también sugiere el expediente por pistas**: abrir un pago pendiente a nombre de otra persona enseña, en «A qué expediente va», los expedientes sin bastidor que encajan (mismo modelo, pedido poco antes del pago, apellido en común, venta a plazos) con el motivo; nunca se aplica solo. Al aplicar un pago a un expediente sin bastidor se anota el bastidor del pago en el expediente (al deshacer se quita), para que el listado lo encuentre luego por bastidor aunque el titular sea otro (migración 0041).
- **Cambiar el titular desde el pago**: al aplicar un pago pendiente a un expediente de otra persona, hay una casilla (marcada) para poner el expediente a nombre del adquiriente del pago: nombre, documento, domicilio y código postal; queda una nota en los comentarios del cliente y del expediente con los datos anteriores y «Deshacer» los devuelve (migración 0042). No cambia nada si el documento es el mismo, con o sin ceros.
- Al aplicar un listado, los **pagos de RCI pendientes se reintentan solos** (el expediente ya tiene bastidor o documento nuevos) y se enlazan los que ya no dejan duda; en la lista de pagos hay además un botón «Reintentar pendientes».
- Panel de «Acceso rápido»: las zonas de pedidos y de pagos de RCI van en dos tarjetas iguales con su título, y el **motor de lectura (OCR)** pasa a una barra común debajo que dice que vale para pedidos y pagos (antes parecía que solo era de los pedidos). «Lectura manual» y «Ventana solo si falta marca o modelo» siguen en la tarjeta de pedidos.
- Probado en el navegador con una copia de prueba aparte: login con doble factor, modal de listados con los Excel de VN y VO (350 filas, 26 anulados, 307 archivados), zona y lista de pagos de RCI con los dos PDF reales (aplicados por documento y por matrícula, con y sin ceros en el NIF) y cajita del expediente.

## Versión 1.4.0 (20/10/2026) — Tareas en segundo plano, avisos en ventana y revisión visual

Incluye todo lo de la 1.3.0 y la 1.3.1 (aún sin publicar aparte).

- **Importar planes con los coches que faltan**: si el archivo usa marcas o modelos que no existen (Dacia Striker, Renault 5…), la vista previa los lista y una casilla (marcada) permite **crearlos antes de importar**; los vendedores que faltan se avisan aparte. La vista previa no deja nada creado. Además, todo modal de importación tiene **«Ver o editar el archivo a mano»** y «Volver a analizar».
- **Cola de tareas en segundo plano** (`/api/tareas`): purgar la papelera (por categoría y «a fondo»), compactar la base, limpiar huérfanos y crear una copia de seguridad (con subida a Drive) se ponen en cola y se ejecutan de una en una; se puede seguir usando la aplicación. Un **indicador discreto** en la barra superior (junto a los recursos) enseña el avance con barra fina; al pulsarlo, ventana con todas las tareas, su detalle, **Cancelar** y quitar. Al terminar sale una ventana con el resumen.
- **Purgas más rápidas de digerir**: los documentos y expedientes se purgan **por lotes pequeños** (20 y 50) con progreso, cancelables entre lotes, y después se hace **VACUUM** de las tablas afectadas (sin bloquear). La limpieza de huérfanos también cuenta su avance. Compactar muestra la tabla en curso.
- **Notificaciones en ventana** en vez de la tira de arriba: título, frase principal y detalles en lista, «Aceptar» (y «Cancelar» cuando hay que confirmar); los avisos de éxito se cierran solos con una barra, los errores y avisos esperan. Todas las confirmaciones que usaban el cuadro del navegador (borrar copias, deshacer importaciones, descartar pedidos, quitar rejillas…) usan ahora esta ventana.
- **Menos recargas de página**: las pestañas de catálogos y la restauración de datos básicos se actualizan con refresco suave. Siguen recargando solo lo imprescindible (instalar una actualización, reiniciar el servidor, volver de Google).
- **PostgreSQL de desarrollo**: el compose del PC sube memoria compartida a 1 GB y otros ajustes (se aplican al recrear el contenedor; el de la Raspberry no cambia).
- **Revisión visual** en una copia de prueba aparte: los buscadores de los paneles nuevos usaban una clase de estilo inexistente (salían blancos), los modales de dos columnas se apilan en móvil y la cabecera de «Últimos expedientes» se ajusta.
- Skill del proyecto **«Revisala con tus ojos»** y script `scripts/prueba-interfaz.ps1` para montar la copia de prueba.

## Versión 1.4.1 (20/10/2026)
- Corregido: al crear una copia de seguridad en segundo plano, si se miraba la lista de copias mientras se escribía el fichero, la lista lo apuntaba a medias y el registro definitivo fallaba («Failed query: insert into copias_seguridad…»). Ahora la lista se salta las copias que se están creando o subiendo, el registro definitivo se corrige si ya existía y las copias que quedaron apuntadas a medias se arreglan solas cuando el fichero está completo y es válido.
- **Copias portables** (ajuste «Copias portables» en Copias de seguridad, activado por defecto): la copia lleva dentro la clave que abre los documentos y el doble factor, así que descargas el `.dump` de un PC y lo restauras en otro **sin escribir ninguna clave**; al restaurar, los datos se vuelven a cifrar solos con la clave del PC de destino y la siguiente copia también es portable. Se puede desmarcar (entonces hace falta la clave de recuperación o el `.env`, como antes). Aviso: quien tenga el archivo de una copia portable puede abrir esos datos. Las copias hechas antes de esta versión no llevan la clave.
- Corregido: al duplicar un plan de comisionamiento y elegir el mes, las fechas podían salir distintas porque el editor recuperaba un borrador olvidado de otro plan nuevo (el borrador de «sin guardar» de la página); ahora un plan que se abre a propósito (la copia) no recupera borradores viejos y el borrador se borra al salir del editor (se conserva solo al recargar con F5).

## Versión 1.4.2 (20/10/2026)
- **Cualquier copia se puede restaurar en cualquier equipo**: en el cuadro de restaurar hay una casilla «No tengo la clave: restaurar igualmente sin los documentos ni el doble factor». Sirve para copias de otra instalación que no son portables (hechas antes de la 1.4.1) y de las que no se tiene la clave de recuperación ni el `.env`: se conserva todo lo demás (clientes, expedientes, comisiones, planes…), los documentos quedan sin archivo (se pueden volver a cargar desde el visor) y cada usuario vuelve a activar su doble factor al entrar. Las copias portables y las de la misma instalación no la necesitan.
- Si una restauración falla y se vuelve al estado anterior, ahora se **conservan las sesiones**: antes se cerraban, el administrador salía a la pantalla de entrada y el mensaje con el motivo real quedaba oculto («La restauración ha fallado» a secas).
- Nota: para llevar una copia a otro equipo y que no pida nada, la copia debe hacerse con la 1.4.1 o posterior **y** el equipo de destino debe tener también la 1.4.1 o posterior.

## Versión 1.4.3 (20/10/2026)
- **Notificaciones flotantes**: los avisos ya no salen como ventana con «Aceptar». Aparecen como tarjeta flotante arriba (éxito 6 s, atención 10 s, error 15 s; se detienen con el ratón encima y se cierran con la ✕). Solo las confirmaciones («¿Seguro?») siguen siendo ventana, porque hay que decidir.
- **Registro de notificaciones** (campana 🔔 de la barra superior, con el número de las no repasadas): guarda en el navegador hasta 300 avisos de los últimos 60 días, agrupados por día, con filtro por tipo, buscador, quitar una y vaciar.
- Restaurar una copia: reponer las plantillas de tarifas y planes ya no puede tumbar la restauración (Mac: «Failed query: insert into plantillas_tarifas_vn…»); si algo falla ahí se anota en el registro del servidor y la restauración sigue. Además, los errores de base de datos de una restauración ahora muestran la causa real y no solo «Failed query».

## Versión 1.4.4 (20/10/2026)
- **Cotejo de pagos reestructurado**: la pestaña «Mi mes» reúne en una sola vista lo que antes estaba en «Mi mes» y «¿Me han pagado cada coche?». Arriba se elige el mes (con un carril de meses que enseña de un vistazo si tienen rejilla y cuántos coches están sin pagar o dudosos); a la izquierda la rejilla de la empresa de ese mes (subirla o arrastrarla, revisar lo leído y guardarla); a la derecha el resultado (contadores que filtran) y debajo la tabla de coches del mes. Mientras la rejilla leída no se guarda, el cotejo ya la usa como vista previa y cada matrícula lleva ✔ (es un coche tuyo) o ? (no coincide con ninguno). El marcar a mano y los importes por coche quedan en un desplegable de la misma vista; el Excel del fabricante, en otro. El administrador puede elegir vendedor.
- **Lectura de la rejilla escaneada**: el OCR dejaba una matrícula inventada (p. ej. «TZZZZM») al leer la franja entre la cabecera y la primera fila; ahora solo se leen celdas con tinta en el centro. La lectura también usa el **motor de OCR elegido** (el mismo selector que en pedidos y pagos, ahora dentro de la rejilla): su lectura de cada celda cuenta como un voto más junto a las de Tesseract. Con la hoja de ejemplo (7 matrículas) las lee todas bien y con más confianza.
- Corregido en desarrollo: el registro del servidor anotaba las líneas «✓ Compiled…» y de peticiones que Next escribe con `console`, y como el archivo está dentro del proyecto provocaba un bucle de recompilaciones y recargas de la página.

## Versión 1.4.5 (20/10/2026)
- **«i» de ayuda en cada pestaña**: un circulito con una «i» junto al nombre de cada pestaña (Configuración y sus subpestañas, Cotejo de pagos, y las del editor de planes de comisiones) que abre una ventana con la guía: para qué sirve, paso a paso y lo que conviene saber. Los textos están en `src/lib/guias.ts` y un test comprueba que cada pestaña tiene su guía.
- **Histórico en Cotejo de pagos**: pestaña nueva que compara todas las matrículas de los expedientes con todas las leídas de las rejillas guardadas, en una tabla con color por fila (coincide, no figura en la rejilla, dudoso, en la rejilla sin expediente, aún sin rejilla) y contadores que filtran. Crece sola con cada rejilla que se guarda en «Mi mes».
- Revisión visual (escritorio y móvil, todas las secciones y pestañas): en el móvil la barra superior ensanchaba toda la página y la barra de paginación de Expedientes no se partía en líneas; ahora ambas se adaptan.
- Recargas constantes en desarrollo: la caché de compilación de Next (`.next/dev/cache`) se quedó mal y el servidor mandaba un «rebuilding» a cada conexión; se limpia borrando esa carpeta (se regenera sola).

## Versión 1.4.6 (20/10/2026)
- Las «i» de ayuda estaban en las pestañas de dentro de las pantallas y el propietario las quería en las **pestañas laterales** (el menú de la izquierda): ahora cada entrada del menú (Dashboard, Expedientes, Clientes, Configuración, Comisiones, Cotejo de pagos, Informes, Log Importación, Log Lecturas y Laboratorio) lleva su «i» a la derecha, con la guía de esa pantalla entera. Se quitaron las de la fila de pestañas de Cotejo de pagos; las de Configuración y del editor de planes se mantienen. Con el menú plegado no salen (no hay sitio).

## Versión 1.5.0 (20/10/2026)
- **La cola de pedidos ya no tiene tope** (antes 300): caben los que haga falta. Lo leído sigue esperando en el servidor hasta que se recoge, y los PDF subidos quedan guardados y se leen en segundo plano; si el servidor se corta, lo que estaba leyéndose vuelve a pendiente.
- **Arreglado el cuelgue con cientos de pedidos** (subir 1008 PDF dejaba la pantalla congelada unos segundos): ahora lo leído entra a la cola en bloque y sin recorrerla entera por cada pedido, la cola se guarda en el navegador de una sola vez poco después del último cambio (y al cerrar la página) y la tabla pinta de 200 en 200 con «Ver más» / «Ver todas» (la búsqueda y la elección con Mayús siguen contando todos).
- **Crear expedientes con lo elegido**: en la cola de pedidos, elige varios (casillas, y con Mayús un bloque entero) y pulsa «➕ Crear expedientes con lo elegido»: se crean solo los que no tienen dudas y nunca duplicados; los demás se quedan en la cola con su motivo.
- **Releer con otro motor de OCR**: selector «Releer con» junto a «Releer lo elegido» y en la ventana del pedido (junto a «Releer»); vale solo para esa relectura y no cambia el motor de Configuración.
- **Lectura manual desactivada por defecto** (el ajuste se sigue guardando en el servidor).
- **Rejillas de comisiones en la cola de segundo plano**: las hojas subidas se ponen todas en la cola de tareas (se leen de una en una, por orden, con la barra de progreso de la barra superior) y cada una aparece en cuanto se lee. La lectura de rejillas pasa además por la misma fila de espera del OCR que el resto de lecturas escaneadas.

## Versión 1.5.1 (20/10/2026)
- **Los pedidos ignorados por repetidos ya se cuentan y se ven**: antes, si un pedido leído coincidía (número de pedido, bastidor, matrícula o cliente+fecha+modelo) con otro que ya estaba en la cola, se descartaba sin dejar rastro y el aviso «ignorados» solo contaba los que no eran pedidos (con 1015 lecturas, sobre 300 números de pedido distintos, salían «7 ignorados»). Ahora el repetido queda anotado como ignorado con su motivo («Repetido: ya hay en la cola un pedido con el mismo número (…)»), aparece en «Ver cuáles» (donde se puede rescatar a mano) y el aviso desglosa: «N ignorados: X no eran pedidos y Y estaban repetidos». El mismo archivo subido dos veces ya se anotaba así.

## Versión 1.6.0 (21/10/2026)
- **Crear expedientes con lo elegido, ahora en el servidor**: antes el navegador hacía unas siete peticiones por pedido y, con cientos, se quedaba trabajando sin parar y fallaba a medias. Ahora es una sola petición que el servidor hace como tarea en segundo plano (con su avance arriba y sin depender de que la página siga abierta): crea los que no tienen dudas, une sus documentos, anota el resultado en el registro de lecturas y devuelve lo creado y, con su motivo, lo que no. Lo creado sale de la cola; lo que se queda queda **elegido** para abrirlo o descartarlo. El aviso final dice «N creados» y agrupa por motivo lo que quedó.
- **Duplicados (caso Natalia Martínez Muñoz ×4)**: cuatro copias del mismo pedido sin número ni fecha (el OCR no los leyó) se crearon cuatro veces porque la comprobación de «ya existe» exigía fecha. Ahora un pedido sin fecha se busca con la de hoy (la que tendrá al crearse), así que la segunda copia ya encuentra a la primera; y al recoger lo leído, dos copias sin número ni fecha se detectan por cliente y modelo y quedan como ignoradas «Repetido…».
- **OCR de pedidos afinado**: la lectura de la hoja entera se saltaba a veces líneas sueltas de la cabecera (el «Número Pedido», la fecha de «Emitido» o el «Modelo»). Si faltan (o la marca del modelo salió rota, como «Rullt Ci»), se vuelve a leer solo esa franja de la primera hoja y se completa el texto. Probado con 45 pedidos reales que antes salían incompletos: número 12 de 12 recuperados, fecha 5 de 5, modelo 23 de 38 (el resto no se ve en la hoja o no está en el catálogo). El nombre del cliente ya no conserva «Sra. Doña.» ni «Sr. Don» (se quitan todos los tratamientos seguidos) y «ARKANAesprit» se separa en «ARKANA esprit».
- **Ventana del pedido**: los botones del pie se ordenan en dos filas: «El documento» (Ver el PDF y Releer con su selector de motor, juntos) y las decisiones (Descartar a la izquierda; Cerrar, Crear todos los demás y Crear expediente a la derecha). El selector de motor ya distingue «RapidOCR en CPU» de «RapidOCR en GPU» (antes los dos se llamaban igual).
- **Dashboard plegable**: «Últimos expedientes», «Subir pedidos y pagos», «Pedidos leídos y estado de las lecturas» y «Crear un expediente con un clic» se pliegan y se despliegan con su botón (se recuerda).
- **Cotejo de pagos**: la lectura de rejillas es ahora una cola con estado visible por hoja (en cola, leyendo, leída, con error), que sigue aunque se cambie de pestaña o de pantalla; cada hoja y cada borrador tienen «🔄 Releer» y el selector «Leer con» (otro motor solo para esa lectura). Los borradores sobreviven a recargar la página. Los pasos (1 Sube la hoja · 2 Revisa lo leído · 3 Guarda) salen marcados y el carril de meses enseña un solo aviso por mes con su leyenda.
- Herramienta nueva: `scripts/prueba-interfaz-real.ps1` monta una copia del servidor sobre un **clon** de la base real (puerto 3101) para revisar con los datos tal como están.

## Versión 1.6.2 (21/10/2026)
- Cabecera de Expedientes: las columnas de fechas ya son opacas como las demás (1.6.1). Clientes: edición en masa de seleccionados (tienda, población, código postal, domicilio y comentarios).
- **VO**: la facturación por defecto es la RCI o, si es de contado, el último día del mes del pedido (`src/lib/facturacion-vo.ts`, aplicada al crear y al editar en `expedientes-escritura.ts`). No se ha rellenado en masa lo antiguo.
- Revisión de la interfaz con la copia del servidor sobre el clon de la base real (1500 y 390 px): Clientes con una sola ventana «Importar y exportar» (antes duplicaba botones y mostraba la copia global JSON en la barra); Configuración con pestaña «Usuarios» primero (el catálogo ya no queda bajo la tabla de usuarios) y pestañas en una sola fila; acciones de usuarios sin recortar; títulos de Cotejo, Informes y Log de lecturas con el mismo tamaño y sin emoji suelto.
- Pendiente: relleno de la facturación de los VO antiguos si el propietario lo pide.

## Versión 1.6.3 (21/10/2026)
- Planes de comisionamiento: los seis botones de plantillas (aplicar, guardar y gestionar, por pestaña y del plan completo) se sustituyen por un solo botón «📚 Plantillas…» que abre una ventana con las opciones explicadas, igual que «Importar y exportar». La pestaña VN conserva su barra de plantillas de tarifas, ahora con su etiqueta. Las pestañas del plan usan el mismo aspecto que las subpestañas de Configuración, y el texto del Resumen explica la facturación de los VO.

## Versión 1.6.4 (21/10/2026)
- Completar datos desde listados: la columna «Fra. prevista» se reconoce como fecha de facturación y, también en los usados (VO), se propone como tal. La regla automática de 1.6.2 sirve de valor inicial.

## Versión 1.6.5 (21/10/2026)
- El círculo rojo de «Comisiones» en el menú explica al pasar el ratón qué cuenta y es pulsable: abre una ventana con una tabla (vendedor, mes, qué pasa) y un botón «Ir» que abre el cotejo de pagos en ese mes y con ese vendedor.

## Versión 1.6.6 (21/10/2026)
- Log de lecturas: la tabla ocupa todo el alto que queda bajo el título y los filtros (antes se cortaba a 420 px dejando media pantalla vacía). `TablaDatos` admite el parámetro `alto` y la constante `PANTALLA_COMPLETA` para pantallas que son solo una tabla.

## Versión 1.6.7 (21/10/2026)
- Cotejo de pagos: una hoja leída cuyo mes se adivina por sus coches se **guarda sola** (nunca sustituye una rejilla ya guardada de ese mes: en ese caso queda como borrador y se avisa). Antes había que pulsar «Guardar rejilla» y «Mis rejillas» salía vacía.
- «Mi mes»: la fila larga de botones por mes se sustituye por un botón «📆 Calendario…» que abre un calendario amplio con un botón por día y una bolita de color por coche (sin pagar, dudoso, sin rejilla, pagado), los doce meses del año con su aviso, y filtros por resultado, tipo (VN/VO) y texto. Elegir un día filtra la tabla del cotejo (chip «Solo el …»).
- El vendedor elegido en el cotejo se recuerda al cambiar de pestaña.

## Versión 1.7.0 (21/10/2026)
- **Biblioteca de archivos** (menú «Biblioteca», `/dashboard/biblioteca`): se guardan una vez pedidos, pagos de RCI, rejillas, listados Excel y otros archivos (cifrados en la base de datos, con migración `0043`; no se duplican los idénticos) y se pueden renombrar, cambiar de tipo, descargar y borrar.
- En cada zona de subida hay un botón «📚 Elegir de la biblioteca» que entrega los archivos elegidos como si se hubieran subido desde el equipo: pedidos y pagos de RCI (Dashboard), rejillas y listados (Cotejo de pagos), y Excel de Expedientes (importar, contrastar y completar datos desde listados).

## Versión 1.7.1 (21/10/2026)
- Biblioteca: cada archivo se puede **asignar a un cliente o a un expediente** (ventana de búsqueda; al asignar un expediente queda también el cliente), con filtros por asignación (todos, sin asignar, asignados, a un cliente, a un expediente) y por tipo, selección múltiple y acciones sobre lo marcado: descargar (varios en un .zip), asignar, quitar asignación, cambiar tipo y borrar. Migración `0044`.

## Versión 1.8.0 (21/10/2026)
- **Plan nuevo con ajustes por defecto**: al pulsar «Nuevo plan» el plan nace con los ajustes de los planes actuales (tramos X-4…X+3, tarifas VN de los 20 modelos con sus dos líneas por tasa, opciones de usados y tasas) en lugar de vacío. No es un plan guardado ni se carga en la base de datos: está en el código (`src/lib/plantillas-plan/defecto.ts`), y marcas y modelos se buscan por nombre (los que no existan se omiten). Sin vendedores, fechas ni nombre. La financiación de abril de 2026 (5 líneas) no se ha incluido porque los planes posteriores no la tienen.
- **Colores por defecto**: la semilla de pagos deja Contado en rojo (`#ff0000`), Crédito en ámbar (`#e69d00`) y Preference en azul (`#3b82f6`), como están ahora (y el modelo Striker de Dacia en el acceso rápido). Se aplican al crear la base o tras «Borrar todos los datos».
- **Paletas de colores** (Configuración › Marcas, Pagos y Estados › «🎨 Paletas de colores»): guardar los colores de ahora, aplicar una paleta (la «Por defecto» o las guardadas), renombrar, borrar, exportar a archivo e importar. Formato `gv-paleta` con versión y lectura tolerante (ignora lo que no entiende y avisa en lugar de dar error). Migración `0045`.
- Las plantillas de planes de comisionamiento (guardar, exportar e importar) ya existían (Comisiones › Plantillas… y Configuración › BBDD › Exportar e importar › Plantillas de planes).

## Versión 1.9.0 (21/10/2026)
- **Centro de incidencias** (Configuración › 🩺 Incidencias): reúne en una sola tabla (`incidencias`, migración `0046`) todo lo que falla o va mal, agrupando las repeticiones por huella (cuentan veces; una resuelta que vuelve se reabre sola; las cerradas se borran a los 45 días).
  - **Qué recoge:** errores 5xx de la API con su ruta y traza (`manejar` en `http.ts`), `console.error` del servidor (tareas y lecturas fallidas con su origen propio), errores sin tratar del proceso, peticiones lentas y consultas lentas, avisos del equipo (temperatura, memoria, disco…), errores del navegador (errores sin tratar, promesas rechazadas, peticiones con 5xx o sin respuesta), los avisos de error rojos que ve la persona y las pantallas rotas.
  - **Contexto:** cada fallo del navegador lleva los últimos pasos (pantallas, botones pulsados, peticiones) sin valores de formularios; todo texto pasa por `limpiarSensible` (correos, documentos, números largos, claves).
  - **«🐞 Avisar de un fallo»** (barra superior): texto, captura de pantalla (capturar la pestaña, adjuntar o pegar), con los pasos previos; la captura se guarda cifrada.
  - **Revisión:** filtros por estado, origen y nivel; detalle con captura, pasos y traza; marcar resuelta, ignorar, reabrir, borrar y nota; «📋 Copiar informe» (texto con todo el contexto) o descargarlo. El círculo rojo de Configuración cuenta los errores nuevos. `npx tsx --env-file=.env scripts/incidencias.ts` imprime lo pendiente.
  - Pantallas de error explicadas (`error.tsx`, `global-error.tsx`) que avisan solas y dejan reintentar o contar qué se hacía.
  - Lo que había (registro del servidor, rendimiento, campana de notificaciones, logs de lecturas e importación) se mantiene como detalle técnico y ahora alimenta o enlaza al centro.
- **Revisión de repetidos**: «Importar y exportar» de Planes, Rejillas y las pestañas de Configuración pasa a ser un solo botón con ventana (como Expedientes y Clientes) en lugar de tres botones; la copia global «datos básicos (JSON)» ya solo está en Configuración › BBDD (se quitó de las ventanas de Expedientes y Clientes); en Nuevo y Editar expediente solo queda un lector de «DNI o pedido» (el segundo hacía lo mismo); en Editar expediente cada barra tiene su salida (arriba «Volver», abajo «Cancelar»), sin dos botones iguales juntos.

## Versión 1.10.0 (21/10/2026)
- **Nueva pestaña «Herramientas»** (`/dashboard/herramientas`, sustituye a «Biblioteca» en el menú y absorbe «Log Lecturas»): reúne con pestañas lo que lee o guarda documentos. «Subir pedidos y pagos» (zonas de pedidos y de pagos de RCI y motor de lectura), «Cola de pedidos» (con contador y, para el administrador, a nombre de qué vendedor se crean), «Biblioteca» e «Historial de lecturas». La pestaña elegida se recuerda y `?p=docs|cola|biblioteca|historial` abre una concreta. `/dashboard/biblioteca` y `/dashboard/log-lecturas` redirigen aquí.
- **Dashboard más limpio**: ya no lleva las zonas de subida; solo el acceso rápido para crear expedientes y, si hay pedidos leídos esperando, el desplegable de la cola con un enlace a Herramientas.
- **«Borrar todos los datos» no toca la biblioteca de archivos**: sin claves foráneas (migración `0047`) para que el TRUNCATE … CASCADE no llegue a ella; solo se quita la asignación a clientes y expedientes. Sus archivos solo se borran desde la propia biblioteca. El análisis de BBDD los lista (solo para ver).

## Versión 1.10.1 (21/10/2026)
- **Biblioteca: «Añadir archivos» con confirmación y barra de progreso**: al elegir o soltar archivos se abre la ventana «Guardar en la biblioteca» con cada archivo y su tipo propuesto por el nombre (cambiable uno a uno, «Poner a todos» o «Detectar por el nombre»); al aceptar se guardan con una barra de progreso real (XMLHttpRequest), estado por archivo (guardado, ya estaba, error) y un resumen. La misma ventana se usa en «📚 Elegir de la biblioteca › Añadir». `adivinarCategoria` pasa a `lib/biblioteca-categorias.ts` (se usa en el navegador y el servidor).
- «Borrar todos los datos» también vacía las incidencias (el círculo rojo de Configuración no se queda con avisos viejos; la copia previa los conserva).

## Versión 1.10.2 (21/10/2026)
- **Biblioteca: pausar y cancelar la subida.** «⏸️ Pausar» detiene la subida (el archivo en curso se vuelve a enviar desde el principio al «▶️ Reanudar», porque una subida sencilla no se puede continuar a medias) y «✖ Cancelar…» pregunta si se deja lo ya guardado, se elimina lo guardado en esa tanda (nunca lo que ya estaba antes) o se sigue subiendo.
- **Biblioteca: botón 👁️ Ver en cada fila** (sin descargar): PDF con el visor del navegador, imágenes, texto y CSV, y hojas de cálculo (xlsx, xls, ods) como tabla completa con una pestaña por hoja y sin límite de filas; lo demás se ofrece para descargar. `GET /api/biblioteca?id=&ver=1` solo sirve en línea PDF, imágenes (no SVG) y texto; todo lo demás es descarga. `next.config.ts` permite el iframe del mismo origen para `/api/biblioteca`, igual que para los adjuntos.

## Versión 1.10.3 (21/10/2026)
- **Biblioteca: avisos en toda acción de peso y borrado en segundo plano.** Borrar varios archivos ya no es una sola orden: pasa a la cola de tareas del servidor (`POST /api/biblioteca/borrar?asincrono=1`), borra por lotes de 25, enseña el avance en la barra superior y en la propia pantalla («Borrando… 3 de 5») y se puede cancelar. Antes no se veía nada mientras tardaba (el borrado de archivos grandes lo hacía una sola orden y la pantalla no avisaba). Además: aviso al empezar y al acabar, botones parados mientras tanto, aviso al preparar el .zip (que ahora se baja con aviso y sin el tope silencioso de 200 archivos) y al aplicar cambios a varios (tipo, asignación).

## Versión 1.11.0 (21/10/2026)
- **Los datos se ponen al día sin recargar la página**: tras cualquier escritura correcta en la API hecha con `llamar` (guardar, borrar, importar…) y al terminar una tarea en segundo plano, se emite el aviso de cambio de datos (`avisarCambioDeDatosTrasPausa`, con 0,6 s de calma para que una operación con muchas peticiones solo recargue al final). Todo lo cargado con `useCarga` se vuelve a pedir y `RefrescoDeDatos` (en el Dashboard) hace `router.refresh()` para listas, contadores y avisos del servidor, conservando el sitio y lo que se estaba haciendo. Antes solo lo hacían a mano algunas pantallas.
- **«Modo desarrollo ↔ normal» en «Equipo y servidor»** (solo el PC con Windows; en la Raspberry y en Docker no sale porque ya corre en modo normal): `POST /api/admin/modo-servidor` lanza `scripts/cambiar-modo.ps1`, que cierra el servidor, compila (`npm run build`, unos 30 s a 5 min según el equipo), aplica migraciones y arranca `npm start`, o vuelve a `npm run dev`. Si compilar o migrar falla, vuelve solo al modo desarrollo. Una ventana enseña la fase y el tiempo y la página se recarga sola cuando el servidor vuelve en el modo pedido; avisa si tarda más de lo razonable y dice dónde están los registros (`gestorventas-modo.log`, `gestorventas-build.log`, `gestorventas-dev-<puerto>.log`). `/api/salud` informa del modo.
- **Operaciones con muchos elementos, por lotes o en segundo plano** (revisión de 1.11.0): quitar varios documentos adjuntos y borrar varias copias de seguridad pasan a **una sola petición** (antes una por elemento; las copias hacen además una sola llamada a Google Drive); la **importación de Excel** de Expedientes pasa a la cola de tareas (misma transacción, con avance en la barra superior y cancelable sin dejar cambios). Ya estaban así: borrar varios de la biblioteca (por lotes de 25, en 1.10.3), expedientes y clientes (una petición con todos los ids), pedidos leídos, rejillas, copias y papelera (tareas). Quedan como estaban a propósito: subir archivos (uno a uno, con barra) y el .zip de la biblioteca (una petición que arma el zip en memoria).

## Versión 1.11.1 (21/10/2026)
- **«Reiniciar servidor» conserva el modo**: en el PC con Windows, si el servidor está en modo normal, reiniciar lo relanza en modo normal sin recompilar (`scripts/cambiar-modo.ps1 -Modo start`); en desarrollo, en desarrollo. Antes, en modo normal el proceso se cerraba y nadie lo volvía a levantar (solo Docker lo hace). Probado en una copia: vuelve en unos 50 s en el mismo modo. El modo no se «guarda» en ningún sitio: el reinicio repite el modo en que está. Si el equipo se apaga y vuelve a encenderse, no arranca nada solo (como antes).

## Versión 1.11.2 (21/10/2026)
- **`start.bat`** (raíz del proyecto, solo Windows): arranca el servidor en el **último modo** en que estuvo. El servidor anota su modo al arrancar (`.ultimo-modo`, ignorado por git) y `start.bat` lo lee: modo normal → compila antes solo si no hay compilación o el código es más nuevo que ella, aplica migraciones y hace `npm start`; modo desarrollo → `npm run dev`. `start.bat dev` o `start.bat normal` fuerzan uno. Si no había ninguno anotado, desarrollo; si compilar o migrar falla, cae a desarrollo; si ya hay algo escuchando en el puerto, no arranca otro. Probado en una copia (sin archivo, normal forzado y último modo).

## Versión 1.11.3 (21/10/2026)
- **Ojo 👁️ en la ventana «Guardar en la biblioteca»**: cada archivo elegido se puede ver (PDF, imagen, texto/CSV y Excel por hojas) antes de guardarlo. Imágenes, texto y Excel se leen en el propio navegador; un PDF se deja unos minutos solo en memoria del servidor (`POST /api/biblioteca/previa`, máximo 12 a la vez, solo para quien lo pidió, nunca en base de datos ni disco) porque el navegador no puede enseñar un PDF propio dentro de la aplicación sin una dirección del servidor. Las demás rutas de `/api/biblioteca/*` (zip, borrar) recuperan las cabeceras de seguridad normales en `next.config.ts`.

## Versión 1.11.4 (21/10/2026)
- **«Elegir de la biblioteca» con filtro por tipo**: la ventana ya no se limita a los tipos de la zona. Por defecto sigue saliendo lo de esa zona, pero hay botones con contador para «Todos» y para cada tipo (pedidos, pagos de RCI, rejillas, listados Excel, otros), la columna «Tipo» siempre se ve, y la casilla de la cabecera marca todos los que se ven con el filtro y la búsqueda. Así se pueden elegir de golpe, por ejemplo, todos los pedidos de la biblioteca y pasarlos en lote por el OCR de la zona de pedidos.

## Versión 1.11.5 (21/10/2026)
- **Ventana «Guardar en la biblioteca» más grande y con tabla de las del proyecto** (`TablaDatos`): ordenar por cualquier columna, búsqueda, «Columnas y vistas», más datos (formato, tamaño, fecha de modificación, carpeta oculta por defecto, estado al guardar), filtro por tipo con contadores y «Poner a los que se ven» para cambiar el tipo de golpe a lo que el filtro o la búsqueda dejan a la vista. Pensada para cientos de archivos (se pintan de 150 en 150 y el progreso no repinta la tabla en cada avance). El título de la ventana muestra el número de archivos, igual que «Elegir de la biblioteca» (archivos que se ven y elegidos).

## Versión 1.11.6 (21/10/2026)
- **«Elegir de la biblioteca» con la tabla del proyecto**: ventana más grande, buscador, orden por cualquier columna, «Columnas y vistas», más datos (formato, tamaño, fecha, asignación), vista previa con el ojo, «Marcar los N que se ven» (suma a lo ya marcado) y «Quitar marcas». El título lleva el número de archivos y de elegidos.
- **Incidencias: los avisos de Node ya no salen como error.** «(node:1234) DeprecationWarning…» entra como aviso y sin el número de proceso (así se agrupa con sus repetidas), y una versión como «pg@9.0» ya no se oculta como si fuera un correo. La causa real del aviso (consultas lanzadas a la vez sobre la misma transacción al crear expedientes desde pedidos) está corregida: `leerCatalogos(tx, true)` las hace una detrás de otra.

## Versión 1.11.7 (21/10/2026)
- **Lo que se arrastra al OCR también se guarda en la biblioteca**: los pedidos y los pagos de RCI que se arrastran (o eligen en el equipo) a las zonas de lectura se guardan además, en segundo plano y de uno en uno, en la biblioteca (tipo «pedido» o «pago_rci»), sin repetir lo que ya está (mismo nombre y tamaño) y sin avisos si falla (leer el documento es lo importante). Casilla «📚 Guardar también en la biblioteca…» en Herramientas › Subir pedidos y pagos (activada por defecto; se recuerda en el navegador). Antes solo entraban en la biblioteca los archivos añadidos a mano.

## Versión 1.11.8 (21/10/2026)
- **Arreglo: «Maximum update depth exceeded» en la biblioteca** (`TablaDatos` ↔ `BibliotecaClient`): `TablaDatos` avisaba de las filas que se ven (`alVerFilas`) en cada pintado, y quien las guardaba en un estado propio (como la Biblioteca) podía entrar en un bucle de repintados. Ahora solo avisa cuando cambian de verdad (otras filas u otro orden); mismas filas = no avisa. No pude reproducir el bucle en mi copia (con pocos archivos), así que el arreglo es de causa y no solo del síntoma, pero no está comprobado con tus datos.

## Versión 1.11.9 (21/10/2026)
- **Expedientes: se elige solo con la casilla.** Pulsar en cualquier otra parte de la fila ya no marca el expediente. Con **Mayús** pulsada, la casilla marca (o desmarca) de golpe todos los que hay entre el último que se tocó y este, en el orden en que se ven en la tabla (también entre páginas).

## Versión 1.11.10 (21/10/2026)
- **Modelos: el número de «Orden Dashboard» se puede poner en cualquier modelo.** Antes solo se podía editar en los modelos con acceso rápido «Sí»; uno creado al leer un pedido (acceso rápido «No») enseñaba «—» y no dejaba ponerle número. Ahora todos tienen su casilla de número (apagada si no están en el acceso rápido) y, al poner un número mayor que 0 y pulsar «Guardar Orden», el modelo pasa a acceso rápido «Sí» con ese orden.

## Versión 1.11.11 (21/10/2026)
- **«Pedido leído»: botones del pie ordenados.** Dos filas alineadas: arriba, salir de este pedido («Descartar este pedido» a la izquierda y «Cerrar (queda en la cola)» a la derecha); abajo, crear («Crear todos los demás» y «Crear expediente», a la derecha). Antes se partían sin orden en varias líneas.
- **Los modelos creados al revisar un pedido salen en el siguiente.** La cola de pedidos solo conocía las marcas y modelos con acceso rápido (los que crea un pedido no lo tienen), así que el segundo pedido no podía elegir el modelo que acababas de crear en el primero. Ahora conoce todo el catálogo (`marcasCatalogo` en `cargarDatosPanel`); los botones de creación rápida siguen usando solo el acceso rápido.
- **Eliminar marcas, modelos, formas de pago, estados y tiendas ya no usa el aviso feo del navegador** (`confirm`): usa la ventana de la aplicación, con el nombre de lo que se elimina. Lo mismo al salir de «Nuevo expediente» con cambios sin guardar.
- **Una marca con expedientes no se elimina de golpe.** El servidor lo rechaza (409) y la pantalla avisa de cuántos expedientes hay y de qué modelos (`usosDeMarca`, `PATCH /api/admin/catalogos?usos_marca=`); hay que eliminar antes esos modelos, que ya preguntan a cuál pasan sus expedientes. Los modelos ya comprobaban sus expedientes.

## Versión 1.11.12 (21/10/2026)
- **Pedidos «Renault Renault 5» (R5)**: si la línea del modelo repite la marca, se queda una sola vez (`pedido.ts`), `proponerMarcaModelo` ya no toma «Renault» como modelo y reconoce «Renault 5» como el modelo de catálogo «R5» (y `aliasDeModelo` añade «RENAULT 5» como forma de escribir «R5»). Antes proponía crear el modelo «Renault» y el pedido se atascaba. Con pruebas.
- **Aviso de posible duplicado dentro de «Pedido leído»**: un recuadro rojo con el expediente que se parece (motivo, cliente y enlace para abrirlo en otra pestaña), que se calcula al abrir el pedido y cada vez que cambian sus datos (antes solo se veía el motivo en un aviso suelto al pulsar «Crear», o no se veía).
- **«🔎 Detectar duplicados» en Expedientes**: busca en todos los expedientes los que comparten bastidor, matrícula, o cliente y modelo (misma fecha de pedido, o distinta fecha como «a revisar») y los enseña agrupados en una tabla ordenable, con buscador y columnas a elegir, con enlace a cada #EXP. Solo lee. No cuenta las copias hechas con «Duplicar» ni los eliminados (`servicios/duplicados.ts`, `GET /api/expedientes/duplicados`).
- **Expedientes de un cliente**: la ventana es mucho más ancha y la tabla trae más datos (bastidor, fechas de afectación, RCI, matriculación, facturación y entrega, vendedor; intranet y comentarios ocultos), con el número de expedientes en el título y marca en rojo los que parecen repetidos entre los suyos.

## Versión 1.22.10 (24/10/2026)

- **El color de los pedidos recientes se elige** (Configuración › Expedientes › Lista › «Pedidos recientes resaltados»): 11 colores de paleta (azul, celeste, turquesa, verde, lima, amarillo, naranja, rojo, rosa, morado, gris), «Otro color» libre, e intensidad suave, media o fuerte, con una vista previa. Se guarda en el navegador (`exp-color-pedido-destacado`, `exp-fuerza-pedido-destacado`).

## Versión 1.22.9 (24/10/2026)

- **Los días del fondo azulado de Expedientes se configuran** en Configuración › Expedientes › Lista («Pedidos recientes con fondo azulado»). Se marcan los pedidos de hoy y de los N días anteriores (por defecto 3; 0 = no marcar ninguno). Sustituye al «justo hace tres días» de 1.22.8. Se guarda en el navegador, como el resto de ajustes de esa pestaña (`exp-dias-pedido-destacado`).

## Versión 1.22.8 (24/10/2026)

- **Expedientes: los pedidos hechos hace tres días tienen fondo azulado claro** (fecha de pedido = hoy menos 3 días, hora local; al pasar el ratón por la fila sale «Pedido hecho hace tres días»). No cambia nada más de la lista.

## Versión 1.22.7 (24/10/2026)

- **Cajitas del Resumen Estadístico: ya no se salen las letras.** Las tarjetas son algo más anchas (mínimo 230 px), recortan lo que no cabe en vez de desbordar y, si la cifra y su desglose no caben en una fila, el desglose baja debajo de la cifra (antes «5/6 ✓» y «8/6 (133,3 %) ✓» cruzaban el borde de la tasa).

## Versión 1.22.6 (24/10/2026)

- **Visor del PDF en «Pedido leído» más ligero y claro** (no se toca la lectura OCR): la comprobación de que el archivo sigue guardado ya no descifra ni lee el PDF entero (antes se cargaba dos veces: una para comprobar y otra para enseñarlo; con un escaneado grande eso era lo que más tardaba). Mientras tanto sale «Preparando el documento…» y «Cargando el PDF…» en vez de un recuadro desvaído, y el PDF se abre ajustado al ancho del visor (`#view=FitH`).

## Versión 1.22.5 (24/10/2026)

- **Cajitas del «Detalle y Resumen Estadístico» más ordenadas**: en «Matriculados», «Pedidos» y las dos tasas, la cifra grande va a la izquierda y a su derecha el desglose en líneas (Contado / Crédito / Preference, o Global y cada marca), con el valor alineado a la derecha.

## Versión 1.22.4 (24/10/2026)

- **En «Comisiones», pulsar una cajita (Puntos, Tramo, Objetivo X, Coches, Bruto, Penalización, Neto o una tasa) ya no abre una ventana**: el detalle sale dentro de la propia tarjeta, en el sitio del desglose, con «Cerrar el detalle» (volver a pulsar la misma cajita también lo cierra).
- **Las tablas de coches de Comisiones, del Resumen y de Cartera tienen las mismas 19 columnas que la lista de Expedientes** (Cliente, Teléfono, Email, VN/VO, punto de marca, Marca, Modelo, Marca y modelo, T. Venta, Estado, Vendedor, F. Exp., F. Afect, F. RCI, F. Mat, F. FAC., F. Entrega, Estado intranet y Comisionado), más las propias de cada una (matrícula, lo que aporta cada coche a la comisión, situación en la cartera…). Todas se ocultan, ordenan y guardan en vistas desde «Columnas y vistas». El código común está en `columnas-expediente.tsx`.
- El gestor de columnas ya no dice que «Comisionado» necesita un interruptor aparte (ahora manda solo la casilla del gestor).

## Versión 1.22.3 (24/10/2026)

- **«Ocultar entregados» ya no esconde un expediente por ponerle la fecha de entrega.** Solo se oculta cuando el estado de la intranet es Post-venta o superior (Archivado cuenta como superior). Los demás estados, incluidos los desconocidos, se siguen viendo.
- **Las listas que se abren al pulsar las tarjetas del «Detalle y Resumen Estadístico»** (afectados, matriculados, tasa financiera, pedidos del mes) pasan a ser una tabla como la de Expedientes: filas alternas, buscador, orden por columna, selector «Columnas y vistas», colores de marca, estado y tipo de pago, y enlace al expediente.

## Versión 1.22.2 (22/10/2026)

- **El Mac también tiene el botón «Modo: desarrollo / normal»** (menú «Equipo y servidor»), como el PC. Usa el nuevo `scripts/cambiar-modo.sh` (equivalente al de Windows): para pasar a modo normal compila en una carpeta aparte con el servidor todavía en marcha y solo cambia si sale bien; para pasar a desarrollo, lo relanza con `npm run dev`. Anota el modo en `.ultimo-modo`. La Raspberry (Docker) sigue siempre en modo normal. No probado en un Mac real desde este PC (la sintaxis del script sí está comprobada).

## Versión 1.22.1 (22/10/2026)

- **«Borrar absolutamente todo» conserva la configuración del equipo**: los motores de OCR, la configuración de las copias de seguridad, la de Google Drive (credenciales y conexión), el interruptor del cifrado, el reenvío de reportes, la clave de recuperación y la visibilidad de los botones CSV. El resto de ajustes vuelve a su valor de fábrica.

## Versión 1.22.0 (22/10/2026)

- **Tamaño de la página**: se quita el deslizador; quedan solo los botones − y + que suben y bajan de 1 en 1 %.
- **Filas alternas en todas las tablas**: una con el color de la tarjeta (blanco en el tema claro) y la siguiente algo más gris (claro) o más clara (oscuro); se calcula a partir de los colores del tema, así vale para los 150. Una fila con color propio (seleccionada, con aviso, anulada…), una columna coloreada o el ratón por encima siguen mandando.
- **Grabado a fuego** (migración 0054): las **marcas y los modelos** (con sus colores) y las **plantillas base** (de tarifas y de planes, columna `sistema`) no se pueden borrar nunca: ni desde la interfaz (el botón de eliminar pasa a un candado 🔒; las marcas se pueden desactivar), ni con el servicio (403), ni directamente en la base (disparadores), ni con «Borrar todo» o «Borrar absolutamente todo», ni con la importación «sustituir» (que ahora conserva lo que no está en el archivo; sustituir desde la copia antigua exige usar «Añadir», que une por nombre). Única excepción: restaurar una copia completa JSON, que vuelve a cargar lo mismo.
- **☢️ Borrar absolutamente todo** (Configuración › BBDD › Migración y borrado, aparte de «Borrar todos los datos»): deja la aplicación como de fábrica sin dejar nada: también lo ya en la Papelera, el historial de deshacer, la auditoría, todos los documentos y la Biblioteca, rejillas, incidencias, copias de seguridad guardadas, la conexión con Drive y todos los usuarios menos el administrador. Conserva solo lo grabado a fuego, al administrador, el interruptor del cifrado y la configuración del reenvío de reportes; repone las formas de pago y estados de partida. **Tres confirmaciones seguidas** (sin escribir) con el último botón de doble pulsación; casilla para **no hacer copia previa** (por defecto sí la hace y es lo único que queda). Va en segundo plano con avance, en una sola transacción (si falla, no se borra nada) y compacta las tablas al final. Probado solo con pruebas automáticas sobre la base de pruebas: no se ha ejecutado en ningún equipo.

## Versión 1.21.1 (22/10/2026)

- **El servidor del PC ya no se recarga ni «se reinicia» solo.** Causa real: en modo desarrollo la caché de Turbopack (`.next/dev`) se corrompía y la página entraba en un bucle de recargas (medido: 468 recompilaciones y 1.053 recargas en 30 segundos con una sola página parada abierta; tras borrar la caché, 0). Además, en desarrollo cada edición de código recompila y recarga las páginas abiertas, y si el proceso caía, el vigilante tardaba un par de minutos en relanzarlo.
- **Solución de raíz**: el servidor del puerto 3000 corre ahora en **modo normal** (compilado, sin recargas en caliente). Actualizarlo es `scripts\publicar-local.ps1`: compila en una carpeta aparte (`.next-nueva`, `NEXT_DIST_DIR`) con el servidor todavía en marcha, y solo si sale bien lo para unos segundos, cambia la carpeta y lo arranca; si la compilación falla, el servidor sigue como estaba. Las pruebas visuales con edición continua se hacen en la copia (puertos 3100/3101), en desarrollo.
- `cambiar-modo.ps1` (el que usa «Equipo y servidor» y `start.bat`) también compila así.

## Versión 1.21.0 (22/10/2026)

- **Usuarios, copias de seguridad, copias internas e incidencias a la Papelera** (completa la regla «todo lo que se elimine va a la Papelera»). Cuatro pestañas más: 👤 Usuarios, 💾 Copias de seguridad, 🗂️ Copias internas y 🩺 Incidencias.
  - **Usuarios**: al eliminar uno (también «con todo lo suyo») queda guardado con su contacto, tiendas, códigos de recuperación y, si procede, su historial de comisiones, rejillas, liquidaciones y qué expedientes tenía. Restaurarlo lo deja exactamente como estaba (misma contraseña y doble factor: no se cambia ninguno), le devuelve los expedientes que siguieran sin vendedor y no se restaura si ya hay otro con el mismo correo de acceso. Las descargas de la Papelera no incluyen contraseñas ni doble factor. Sigue sin poder eliminarse al último administrador ni a uno mismo.
  - **Copias de seguridad**: al eliminar una a mano, el `.dump` pasa a la subcarpeta `papelera` de las copias (la copia de Google Drive no se toca); restaurar lo devuelve y purgar lo borra (y su copia de Drive). La limpieza automática por retención y las copias rotas se siguen borrando del todo.
  - **Copias internas** e **incidencias** eliminadas a mano se guardan y se restauran (con sus capturas); la limpieza automática de incidencias cerradas viejas sigue borrando del todo.
  - **«Deshacer importación»** ya mandaba lo que creó la importación a la Papelera (expedientes eliminados); no cambia.
- Los vaciados en bloque («Borrar todos los datos», importar la copia de la app antigua, restaurar una copia) se quedan como estaban, con su copia previa automática.

## Versión 1.20.0 (22/10/2026)

- **Interruptor general del cifrado de los datos** (Configuración › BBDD › Sistema › «🔐 Cifrado de los datos»; estado guardado en la base, **desactivado por defecto** hasta que el propietario lo active). Con él desactivado, los documentos, los archivos de la Biblioteca, las capturas de las incidencias, el doble factor y la conexión con Drive se guardan **en claro** (con una marca: `GVP0` en los ficheros, `p0.` en los textos); lo que ya estuviera cifrado se sigue leyendo igual, esté el interruptor como esté. Así no hay problemas de claves entre equipos ni al restaurar copias.
- **Conversión de lo ya guardado**: al cambiar el interruptor (o con «Convertirlos ahora») se hace antes una copia de seguridad previa (si no se puede, no se cambia nada) y se convierte todo por lotes, en segundo plano, con avance en la barra de tareas y cancelable; al terminar, resumen. Lo cifrado con la clave de otra instalación se prueba también con la clave portable que llevan las copias; lo que aun así no se abre se deja como está y se cuenta.
- **Automático una sola vez**: al arrancar con el cifrado desactivado, si queda algo cifrado de antes, se deja en claro solo, a los 45 s, con copia previa y avance (hasta 3 intentos).
- Las copias antiguas cifradas siguen pudiéndose restaurar (con su clave de recuperación o portable): al restaurar se dejan en el formato del interruptor.
- Las contraseñas no dependen de este interruptor (siempre con hash).

## Versión 1.19.0 (22/10/2026)

- **Planes de comisionamiento a la Papelera**: al eliminar un plan, queda en la Papelera entero (tarifas, reglas, vendedores y liquidaciones) y se restaura tal cual. Pestaña «📊 Planes».
- **Reportes de fallo desde cualquier equipo** (Configuración › Incidencias › «📡 Reportes desde otros equipos», migración 0053): el servidor principal (el PC) crea una clave de recepción; en el Mac (u otro equipo) se escribe la dirección del PC y esa clave, y desde ese momento **cada reporte manual con captura se reenvía solo** al PC; si no hay conexión queda en cola y se reintenta cada minuto. En la lista de incidencias hay una columna «Equipo». Botones: probar la conexión y reenviar ahora. Solo se reenvía lo que se reporte a partir de configurarlo.
- **Completar datos desde un listado** (p. ej. la facturación de los usados con la «Fra. prevista» del Excel): si se aplican 20 o más cambios, antes se guarda automáticamente una copia de seguridad «previa» (y si no se puede, no se aplica nada); la importación sigue pudiéndose deshacer desde el log de importaciones.

## Versión 1.18.1 (22/10/2026)

- **Rejillas, plantillas, paletas, pendientes de cobro y marcas de pagado/reclamado van a la Papelera**: al eliminarlos (o al sustituir una rejilla del mismo mes, o importarla encima) se guarda una copia exacta de sus filas en `papelera_elementos` (migración 0052) y desde Herramientas › Papelera se restauran o se purgan. Seis pestañas nuevas: Rejillas leídas, Plantillas de plan, Plantillas de tarifas, Paletas de colores, Pendientes de cobro y Marcas de pagado. Si al restaurar ya hay otro igual (mismo mes, nombre…), se dice el motivo y se deja donde estaba.
- Pendiente (siguientes versiones): planes de comisionamiento con sus liquidaciones, usuarios, copias sueltas, incidencias y «Deshacer importación».

## Versión 1.18.0 (22/10/2026)

- **Lo que se quita de la Biblioteca va a la Papelera** (columna `eliminado_en`, migración 0051): ya no se borra de verdad. El botón pasa a «🗑️ A la Papelera». Nueva pestaña «📚 Biblioteca» en Herramientas › Papelera, con restaurar, vista previa, descarga y purga (la única que borra de verdad; también incluida en «Purgar a fondo»). Volver a subir un archivo que estaba en la Papelera lo saca de ella.
- Próxima versión: rejillas leídas, planes de comisionamiento, plantillas, pendientes de cobro y marcas de pagado/reclamado.

## Versión 1.17.0 (22/10/2026)

- **Ficha del cliente como página entera** (`/dashboard/clientes/[id]`, como «Editar expediente»): sus datos y documentos arriba y, debajo, la tabla de todos sus expedientes (buscador, orden, columnas y vistas a tu gusto; código y botón «Editar» abren el expediente; casillas «Mostrar anulados» y «Mostrar deshabilitados» como en el resto de la aplicación; aviso de posibles duplicados). En Clientes, «✏️ Editar» y «N venta(s)» abren esa página; el alta sigue siendo una ventana.
- **Desde «Editar expediente»**: botón «👤 Ver cliente y sus expedientes».
- **Enlaces comunes** (`components/Enlaces.tsx`: `EnlaceExpediente`, `EnlaceCliente`, `IconoCliente`): el cliente se abre con un 👤 junto a su nombre en la lista de Expedientes, y como enlace en Detectar duplicados y en «Asignado a» de la Biblioteca; el código EXP ya era enlace en cotejo, contraste, liquidación, informes, duplicados y biblioteca.
- El formulario del cliente (`CamposCliente`) es ahora un componente común del alta y la ficha.

## Versión 1.16.0 (22/10/2026)

- **Todo lo que se lee o sube queda con nombre ordenado y con fecha**: pedido → «Pedido - Cliente - Fecha», pago RCI → «Pago RCI - Cliente - Fecha», rejilla → «Rejilla - Mes Año». Si no se consigue leer el cliente se pone «Sin cliente», y si no se lee la fecha (o el mes) la de subida; un documento que no era un pago, subido en la zona de pagos, queda como «Documento - Fecha». Nunca más un nombre genérico de escáner.
- **Se conserva el nombre original** (nueva columna `nombre_original`, visible en la Biblioteca como «Nombre original»; migración 0050, los ya guardados la rellenan con su nombre de hoy).
- **Renombrado masivo de la Biblioteca** (🏷️ Renombrar toda la biblioteca): ventana con aviso y la lista de lo que se va a tocar, lectura con OCR en segundo plano y por orden (con avance y cancelable) y resumen final con antes→después; los que no se pudieron leer reciben el nombre de respaldo.
- Los pagos RCI y los pedidos leídos desde Herramientas se ven en la Biblioteca (botón «📚 Ver la biblioteca» en Subir pedidos y pagos).

## Versión 1.15.1 (22/10/2026)

- **Tamaño de la página de 1 en 1 %** (60 % a 200 %): los botones − y + suben y bajan un 1 %, y hay un deslizador con paso 1 (antes saltaba de 10 en 10).

## Versión 1.15.0 (22/10/2026)

- **Papelera con una pestaña por cada cosa** (Herramientas › Papelera): Resumen (espacio, purga por categoría, purga a fondo), Expedientes, Clientes, Pedidos, Pagos RCI, Otros documentos, Marcas, Modelos, Formas de pago, Estados de vehículo, Tiendas, Historial, Lecturas y Auditoría, cada una con su recuento, buscador, orden y gestor de columnas (`TablaDatos`).
- **Restaurar** lo elegido de la Papelera (expedientes con recálculo de comisiones y su cliente, clientes sin DNI repetido, documentos, catálogos), por lotes y en segundo plano, con aviso de lo que no se pudo y por qué. Es la única forma de borrar de verdad: Purgar.
- Regla acordada: todo lo que se elimine va a la Papelera. Siguientes versiones: Biblioteca y rejillas, planes y plantillas, pendientes de cobro, marcas de pagado/reclamado, usuarios.

## Versión 1.14.7 (22/10/2026)

- **Buscador de la barra superior**: «Limpiar filtros» en el resultado de una búsqueda ahora quita también esa búsqueda (vuelve a Expedientes y la caja queda vacía); la caja tiene una ✕ para borrarla.
- **Detectar duplicados**: por defecto mira también los anulados y los deshabilitados (así salen los pedidos anulados y vueltos a hacer); columna «Situación»; botón «Deshabilitar» además de «Mandar a la papelera»; «Marcar los sobrantes» conserva el vigente.
- **Ventanas**: `Modal` se pinta colgando de `body`, por encima de los filtros pegajosos (el historial de cambios del Deshacer se veía con los filtros por encima).
- **Biblioteca**: el aviso «cifrado con la clave de otra instalación» solo sale si de verdad es eso; si falta `APP_SECRET` lo dice tal cual.
- **Papelera (servicio)**: `restaurar` (expedientes con recálculo y su cliente, clientes sin DNI repetido, documentos, catálogos) y `subtipo` en las filas; la pantalla con pestañas llega en la 1.15.0. 5 pruebas nuevas (782 en total).

## Versión 1.14.6 (22/10/2026)
- **Los expedientes deshabilitados no cuentan salvo que se active «⏸ Mostrar deshabilitados»** (casilla en cada pantalla, que se recuerda por navegador, junto a la de anulados; «deshabilitado» = el botón ⏸ Deshabilitar, distinto de «anulado» = estado de la intranet; en comisiones, tasa y liquidaciones ya no contaban desde antes). Aplicado en: **Expedientes** (lista y «Detalle y Resumen Estadístico»; al deshabilitar, la fila sale de la lista y se avisa), **Dashboard** (total, mes y reparto por tipo de venta, y «Últimos expedientes»), **Clientes** (ventas del cliente y su ventana de expedientes), **Cotejo de pagos** (resultado del mes e Histórico), **Contraste** (no salen como «sin pagar» y, si una rejilla trae su matrícula, se marcan aparte como «Deshabilitados pagados»), **Detectar duplicados** y **Informes** (recuentos y listas; las cifras económicas salen del motor, que nunca los cuenta). La búsqueda rápida los sigue encontrando, con «· DESHABILITADO». Con pruebas.
- **Expedientes: «Todas las fechas» + rango no mostraba nada**: el rango «Desde / Hasta» y el mes/año se aplicaban a la vez, y si había un mes y año puestos (por ejemplo el actual, que se conservan) ninguna fecha cumplía las dos cosas. Ahora son excluyentes: al poner el rango se quitan mes y año, y al elegir mes o año (o los atajos «Se cobra en / Afectados en») se quita el rango. Además, cuando la lista sale vacía, el mensaje dice cuántos anulados y deshabilitados hay ocultos.

- **Eliminar expedientes ya iba a la Papelera, pero los avisos decían lo contrario**: «Eliminar seleccionados» (y eliminar uno, y el del Dashboard) marca el expediente como eliminado (`eliminado_en`), no lo borra; se recupera en Herramientas › Papelera y solo allí se purga de verdad. Los únicos borrados definitivos son «Borrar todos los datos» (con copia previa) y reemplazar al importar una copia de la app antigua. Las ventanas de confirmación y el aviso ahora lo dicen («va a la Papelera… se puede recuperar») en vez de «eliminar permanentemente».

- **Expedientes: pantalla reordenada por grupos** (sin quitar ninguna función). **Barra de acciones** en grupos con nombre: *Datos* (Importar y exportar, Detectar duplicados), *Vista* (Columnas y vistas, Plegar paneles) y *Edición masiva (con candado)* (Selección, Eliminación); al seleccionar aparece aparte el grupo «N seleccionados» (Editar, Deshabilitar, Habilitar, Duplicar, Exportar CSV y «A la Papelera»). **Filtros** en tres bloques: *📅 Fecha* (campo, Desde/Hasta con sus botones, mes y año, y debajo «Rangos rápidos» y «Por mes: Se cobra en / Afectados en» juntos), *🚗 Vehículo y venta* (marca, modelo, tipo de venta, estado del vehículo, estado intranet) y *👤 Comercial y tienda*; las casillas de qué se ve («Ocultar entregados», «Columna Comisionado», anulados y deshabilitados) juntas en «Mostrar:» y «Limpiar filtros» al lado del título. Antes todo estaba mezclado en una fila y la parte superior ocupaba mucho más.

## Versión 1.14.5 (22/10/2026)
- **Expedientes: «Campo de Fecha» con opción «Todas las fechas»** (la primera de la lista; por defecto sigue la del pedido). Con ella, el rango «Desde / Hasta», el mes y el año valen para **cualquiera** de las fechas del expediente (pedido, afectación, matriculación, facturación, entrega, RCI y comisionado): entra si alguna cumple, y si se ponen rango y mes a la vez, si una misma fecha cumple los dos. El aviso naranja lo dice: «📅 Cualquiera de las fechas del 01/04/2026 al 30/04/2026». Se recuerda con el resto de filtros. Comprobado: abril por pedido 8, por matriculación 5, con «Todas las fechas» 12.

## Versión 1.14.4 (22/10/2026)
- **Expedientes: la columna «Comisionado» no se veía aunque estuviera activa en «Columnas y vistas»**: tenía dos interruptores (la casilla del gestor y el botón «Mostrar Comisionados» de la barra) y, con el segundo apagado, la columna no salía. Ahora manda solo el gestor de columnas (el botón de la barra cambia esa misma casilla; por defecto sigue oculta y quien la tenía encendida la sigue viendo). Ninguna otra columna tenía esa doble condición.
- **Expedientes: los filtros se conservan** al moverse por la app y al recargar (por navegador, como antes), y ahora incluyen también el **estado de intranet, el rango de fechas «Desde / Hasta», el orden de la lista** y el campo de fecha «Facturación» (antes se perdían o se reseteaban). «Limpiar Filtros» los quita todos (también el orden) y el aviso naranja «Estás viendo una lista filtrada» sigue diciendo cuáles hay puestos. Esto **sustituye** lo de que el rango empezara vacío al entrar (1.14.2). La página de resultados de búsqueda no aplica ni guarda esos filtros (antes un filtro de Expedientes, como el comercial, podía esconder resultados de la búsqueda). Con pruebas; comprobado en pantalla: poner filtros → ir a Clientes y volver → recargar → siguen; limpiar → recargar → vacío.

## Versión 1.14.3 (22/10/2026)
- **Expedientes › Desde / Hasta: botones pequeños para mover la fecha**: bajo cada campo, «« ‹ › »» = 1 año atrás, 1 mes atrás, 1 mes adelante y 1 año adelante, con su explicación al pasar el ratón («1 mes atrás en «Desde»…»). Mantienen el día o ponen el último del mes (31 de marzo − 1 mes = 28 de febrero); con el campo vacío parten de hoy. Con pruebas (`moverMeses`).

## Versión 1.14.2 (22/10/2026)
- **Expedientes: rango de fechas «Desde / Hasta»** en «Filtrado y Búsqueda Avanzada». Se elige sobre qué fecha con el «Campo de Fecha» de siempre (por defecto la del pedido; ahora también Facturación), se escribe el rango o se usa un atajo (**Hoy, Esta semana** de lunes a domingo, **Este mes, Mes pasado, Este año**) y «✕ Quitar rango». Va combinado con el resto de filtros (mes, año, marca, comercial…) y con el buscador; las fechas son inclusivas, un expediente sin esa fecha no entra mientras haya rango y, si «Desde» es posterior a «Hasta», se cambian de sitio y lo avisa. **Los totales de «Detalle y Resumen Estadístico» se recalculan con el rango** (y con lo de anulados). Mientras haya rango, el aviso naranja «Estás viendo una lista filtrada» lo dice («📅 Fecha Expediente del 01/04/2026 al 30/04/2026»). **Siempre empieza vacío al entrar** (no se guarda con los filtros) y «Limpiar Filtros» también lo quita. Lógica en `lib/rango-fechas.ts` con pruebas; comprobado en pantalla con tu base clonada (abril por pedido 8, por matriculación 5; este año 49).
- **El vigilante del PC también cuida el Funnel de Tailscale** (`scripts/vigilante.ps1`): si el Funnel no publica el puerto 3000 o el equipo cambia de red (IP o puerta de enlace), lo vuelve a abrir (`funnel reset` + `funnel --bg 3000`, unos 3 s) y lo anota en `%TEMP%\gestorventas-vigilante.log`. Desde el propio PC la URL pública se resuelve por la red privada, así que no se puede probar «desde fuera»: por eso se vigila la configuración y el cambio de red. La causa de que hoy no cargase no se pudo determinar (la configuración era correcta; al reabrirlo cargó).

## Versión 1.14.1 (22/10/2026)
- **Los expedientes anulados salen ocultos en todos los listados** y solo se enseñan con la casilla «🚫 Mostrar anulados (N ocultos)» de cada pantalla (se recuerda en el navegador; no se enseña si no hay ninguno). «Anulado» = el estado de la intranet del fabricante que se guarda al leer el Excel en «Completar datos desde listados» (`estado_intranet`, regla común `lib/anulados.ts`). Aplicado en: **Expedientes** (lista y resumen mensual; también si se busca «anulado» o se filtra por ese estado de intranet), **Clientes** (ventana de expedientes del cliente), **Cotejo de pagos** (resultado del mes, «Mi mes» e «Histórico»: se siguen cotejando, así que su matrícula en una rejilla no sale como «sin expediente»; en «Mi mes» avisa si los anulados ocultos siguen sumando importe en la liquidación), **Contraste** (también en las tarjetas; un anulado que sale en una rejilla se marca aparte como «Anulados pagados» al activar la casilla), **Detectar duplicados** (por defecto no los mira: un pedido anulado y rehecho no es un descuido) y **Dashboard** («Últimos expedientes activos»). La búsqueda rápida los sigue encontrando, con «· ANULADO» al final. No cambia ninguna cifra de comisiones: un anulado sigue contando hasta que se deshabilita. Con pruebas.
- Flujo comprobado de principio a fin con una copia de tu base real: leer un Excel con 2 anulados en «Completar datos desde listados» (filtro «Anulados», aplicar) → los dos pasan a estar ocultos en Expedientes (266 visibles, 14 ocultos) y fuera de «Expedientes sin pagar» de Contraste; con la casilla activa vuelven.

## Versión 1.14.0 (22/10/2026)
- **Herramientas › Contraste** (pestaña nueva): lista todas las matrículas leídas de las rejillas guardadas, **agrupadas por rejilla** (la más reciente primero, con fondo alterno y un filo al cambiar de grupo) y con **su expediente en la misma línea** (enlace, cliente, vehículo, fecha de matriculación/afectación y el mes que le tocaba), para saber en qué mes se ha pagado cada coche. Resultado por línea: 🟢 coincide, 🟡 pagado en otro mes (distinto del que le tocaba), 🟣 sin expediente (con la matrícula parecida de un expediente sin pagar, si la hay: posible lectura mala), 🟠 expediente de otro vendedor; y la columna «Repetida en» avisa si la misma matrícula sale en otra rejilla o dos veces en la misma hoja. Tarjetas-filtro con los totales y la lista **«Expedientes sin pagar»** (con matrícula, ninguna rejilla la trae y ya hay rejilla de su mes) para no dejar ninguno sin cobrar, separada de «Aún sin rejilla» (falta subir la rejilla de su mes o no tiene fecha). Administrador: elige vendedor o «Todos»; el resto solo ve lo suyo. Solo lee. Módulo puro `lib/contraste-rejillas.ts` + `servicios/contraste-rejillas.ts` + `GET /api/contraste`; con pruebas (5 puras y 1 de servicio). Reutiliza las reglas de «Histórico» de Cotejo de pagos (meses esperados, matrículas parecidas) pero centrado en la rejilla.

## Versión 1.13.4 (22/10/2026)
- **Vigilante del servidor en el PC con Windows**: tarea programada «GestorVentas vigilante» (instalada con `scripts/instalar-vigilante.ps1`, se quita con `-Quitar`; sin permisos de administrador y sin ventanas) que cada 2 minutos y al iniciar sesión mira si el servidor escucha en el puerto 3000 y, si lleva parado dos comprobaciones seguidas (≥ 90 s), lo arranca en el último modo con `scripts/arrancar.ps1` (registro en `%TEMP%\gestorventas-vigilante.log`). No actúa mientras se cambia de modo o se compila desde la aplicación (registros de menos de 10 min) ni durante un reinicio normal. El arranque se lanza con WMI para que el servidor quede fuera de la tarea (si no, el sistema lo cortaría al cumplirse el límite de la tarea). Probado en la copia de prueba: servidor parado → arrancado solo, la tarea vuelve a «Lista» y el servidor sigue.

## Versión 1.13.3 (22/10/2026)
- **Biblioteca en otra instalación (Mac)**: al restaurar una copia de otro equipo, los documentos y el 2FA se volvían a cifrar con la clave de la instalación nueva, pero **los archivos de la biblioteca no** (error «Unsupported state or unable to authenticate data» en `GET /api/biblioteca` al elegir archivos y «Renombrar leyendo» sin efecto). Ahora `recifrarTodo` también los recifra y, con «sin clave», se quitan (con su ficha) porque no se pueden abrir. Un archivo ilegible da un aviso claro (409) en vez de un error interno. Para reparar una biblioteca ya restaurada: `npm run recifrar-biblioteca -- "<clave de recuperación o APP_SECRET del equipo de origen>"` (se puede repetir sin riesgo). Con pruebas.
- **Renombrar leyendo** dice al terminar cuántos ha renombrado y por qué no los demás (primer ejemplo con su motivo), en vez de no decir nada.
- **Página recargándose sin parar en el PC**: la cache del modo desarrollo (`.next/dev`) estaba estropeada y el servidor recargaba la página en bucle (cientos de cargas por minuto, con «Compiled in 0ms» en el registro). Borrarla lo arregla; nuevo `start.bat limpiar` (para el servidor, borra esa cache y arranca en el último modo). No se pierde ningún dato.

## Versión 1.13.2 (22/10/2026)
- **`start.bat` arranca el servidor oculto** (sin ventana de servidor): ahora llama a `scripts/arrancar.ps1`, que usa el mismo `cambiar-modo.ps1` que «Equipo y servidor». Cerrar la ventana del .bat ya no para el servidor. Conserva el modo: sin argumentos arranca en el último modo (`.ultimo-modo`, que anota el servidor); `start.bat dev` / `start.bat normal` lo fuerzan; en modo normal compila solo si el código es más nuevo que la compilación; si ya hay un servidor en el puerto, lo dice y no arranca otro. Espera a que responda y avisa. Probado en la copia de prueba: dev, normal (con compilación), sin argumentos tras normal (solo 15 s, sin recompilar), servidor ya en marcha y cierre de la ventana.

## Versión 1.13.1 (22/10/2026)
- **Tamaño de la página ajustable** para adaptarla a cada pantalla y resolución: control «🔍 Tamaño» en el menú lateral (− / 100 % / +, de 60 % a 200 %; pulsar el porcentaje vuelve al 100 %). Se recuerda por navegador (cookie `gv_zoom`; el servidor ya pinta la primera vista a ese tamaño, sin parpadeo) y usa la propiedad CSS `zoom` de la página. Como `zoom` no compensa las unidades de ventana, todas las medidas `vw/vh/dvh` del código pasan a `calc(N * var(--uvw|--uvh|--udvh))` (definidas en `globals.css` a partir de `--z`), así que ventanas, tablas y el menú siguen ocupando la pantalla a cualquier tamaño. Los saltos a diseño móvil siguen dependiendo del ancho real de la ventana. Comprobado en 60 %, 80 %, 125 % y 175 % con la copia de datos reales (sin franjas vacías ni desbordes).

## Versión 1.13.0 (22/10/2026)
- **Objetivo por defecto de un vendedor nuevo configurable** (Comisiones › plan › Objetivo): campo «Objetivo por defecto de un vendedor nuevo» con «Guardar como predeterminado» (ajuste `plan_objetivo_defecto`, 13 puntos hasta que se cambie). Al añadir un vendedor a un plan entra con ese valor; los que ya están no cambian.
- **Reglas que suben o bajan el objetivo del mes** (nueva sección en la pestaña Objetivo, columna `commission_plans.reglas_objetivo`, migración 0049): «si el vendedor suma [menos de | al menos] N [usados | coches nuevos | coches en total] en el mes, el objetivo [sube | baja] X puntos». El motor (`ajustesDeObjetivo`, módulo puro) las aplica antes de calcular el tramo; el desglose del objetivo en el expediente enseña cada regla. El objetivo nunca baja de 0. Con pruebas (`objetivo-reglas.test.ts`, `planes.test.ts`). Las plantillas de plan no incluyen aún estas reglas (se copian con «Duplicar» el plan).
- **La Papelera pasa a Herramientas** (pestaña «🗑️ Papelera», solo administradores) y sale de Configuración › BBDD; guías y avisos actualizados.
- **Detectar duplicados**: casilla por expediente, «Marcar los sobrantes seguros» (en los grupos de bastidor, matrícula y mismo pedido deja el más antiguo) y «Mandar a la papelera», con confirmación; lo enviado se recupera desde Herramientas › Papelera.
- Botones peligrosos que salían morados en vez de rojos (Borrar todos los datos, Limpiar huérfanos, Eliminar fecha, Descartar pedido): el degradado de `.btn-primary` pisaba el color; ahora se ven rojos/naranja. «GPU NVIDIA NVIDIA GeForce…» en Configuración › Sistema ya no repite NVIDIA.
- Revisión pantalla a pantalla (escritorio 1500 px y móvil 390 px, con la copia de la base real): sin desbordes, sin errores de consola ni recargas en bucle en Dashboard, Expedientes, Clientes, Herramientas (5 pestañas), Configuración (todas, con las 7 subpestañas de BBDD), Comisiones (las 9 pestañas de un plan), Cotejo (5 pestañas), Informes, Log de importación y Perfil.

## Versión 1.12.1 (22/10/2026)
- **Todos los desplegables de motor de OCR dicen exactamente qué son** (Configuración → Lectura de pedidos, cola de pedidos, cotejo de pagos, pedido rápido): «Tesseract · CPU», «RapidOCR · CPU», «RapidOCR · GPU <tarjeta NVIDIA>» y «Apple Vision · Neural Engine (solo Mac)», con ★ en el recomendado y la explicación al pasar el ratón. Los nombres salen de un único sitio (`lib/ocr-motores.ts`, con prueba) y el aviso de «se ha vuelto a leer con…» usa los mismos.
- **Apple Vision**: ya existía, no necesita claves ni cuenta; solo macOS y las Herramientas de línea de comandos de Xcode (`xcode-select --install`) para compilar una vez el pequeño programa en Swift. Solo se ofrece si la app detecta un Mac (el servidor también lo rechaza en otros sistemas); si falla, se lee con RapidOCR.

## Versión 1.12.0 (21/10/2026)
- **Todo lo que se lee queda en la biblioteca con un nombre ordenado.** Al leer un pedido sale «Pedido - Cliente - 07 Julio 2026.pdf»; un pago de RCI, «Pago RCI - Cliente - 07 Julio 2026.pdf» (con la fecha del pago); una rejilla, «Rejilla - Abril 2024.pdf». Lo hace el servidor (`guardarCopiaAutomatica`): si el archivo ya estaba (mismo contenido) lo renombra en vez de duplicarlo, si el nombre ya existe añade « (2)», y si no se lee el cliente (o el mes) conserva el nombre de siempre. Sustituye a la copia que hacía el navegador en 1.11.7 (que se quita junto con su casilla).
- **Rejillas: se lee la fecha de abajo a la izquierda** (`leerMesDeRejilla`/`mesDeTexto`): con la hoja ya derecha se recorta esa zona, se agranda y se lee («abril-24», «Abril 2024», «abr.24», «04/2024», con tolerancia a errores del OCR). Calibrado con la rejilla de abril de 2024 (sale 2024-04 y sus 14 matrículas). Ese mes se usa para la rejilla del Cotejo (antes se adivinaba por sus coches), que se guarda sola.
- **Lo que se sube a mano a la biblioteca también se renombra leyéndolo**: casilla «🏷️ Renombrar…» en la ventana de subida (activada) y botón «🏷️ Renombrar leyendo» para lo marcado. Va en segundo plano (`POST /api/biblioteca/renombrar`, tarea con avance y cancelable), de uno en uno, y prueba como pedido, pago y rejilla: un PDF que se había tomado por pedido y es una rejilla se renombra y se corrige de tipo. Los Excel no se leen.
- **OCR: si el nombre del cliente sale cortado se vuelve a leer con otro motor.** `nombreSospechoso` (menos de dos palabras, trozos de una o dos letras, cifras o símbolos) lanza la lectura con los motores que no se usaron (RapidOCR CPU/GPU, Tesseract y Apple Vision si hay) y se queda con la mejor, con un aviso en el pedido.
- Vista previa de la biblioteca: si no se ve el PDF, el servidor tiene que reiniciarse tras el cambio de `next.config.ts` de 1.11.x (cabeceras del iframe); se añade el aviso «¿No se ve? Pulsa «Abrir en pestaña nueva»».
- **Restaurar una copia ya no cambia los usuarios de la instalación.** Antes, restaurar el .dump del PC en el Mac sustituía también las cuentas (contraseñas y doble factor) por las del PC: en el Mac pasaba a valer el código del autenticador del PC. Ahora, por defecto, los usuarios de la instalación donde se restaura **conservan su contraseña, su doble factor, su rol y su estado** (`reponerUsuarios`, emparejados por correo de acceso, después de recifrar; contactos y códigos de recuperación también); los usuarios que solo estén en la copia se quedan como venían. La ventana de restaurar pregunta: «Dejar los usuarios de esta instalación como están (recomendado)» o «Usar los usuarios de la copia» (para volver atrás en la misma instalación). `scripts/restaurar.sh` (recuperación sin la app) avisa de que sí lo sustituye todo. Con pruebas.
- **Vista previa de PDF de la biblioteca arreglada** (en 1.11.x la regla `/api/biblioteca/:ruta*` de `next.config.ts` también alcanzaba a `/api/biblioteca` y le ponía `X-Frame-Options: DENY`, así que el navegador bloqueaba el visor: salía la carita triste). Ahora es `:ruta+`; comprobado con las cabeceras (SAMEORIGIN) y el visor en pantalla. Hay que reiniciar el servidor tras cambiar `next.config.ts`.
- Botón 🏷️ en cada fila de la biblioteca para renombrar leyendo ese documento (además del masivo).
