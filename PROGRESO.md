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
