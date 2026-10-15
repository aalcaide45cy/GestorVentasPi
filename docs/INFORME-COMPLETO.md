# GestorVentasPi — Informe técnico y funcional completo

**Documento de especificación para que Claude Code (o cualquier desarrollador) construya la aplicación siguiendo cada punto, sin ambigüedad.**
Versión del documento: 1.0 · Fecha: 15/10/2026 · Autor de las reglas de negocio: Alfonso (propietario)

---

## 0. Cómo leer este documento

### 0.1 Leyenda de fiabilidad (obligatoria)

Cada afirmación importante lleva una marca para que se sepa de dónde sale:

| Marca | Significado |
|---|---|
| **[V-código]** | **Verificado** leyendo el código de la app original (`aalcaide45cy/gestorVentas`, zip `gestorVentas-main`). |
| **[V-reglas]** | **Verificado** en el documento de reglas del propietario (`SISTEMA-DE-COMISIONES.md`, incluido íntegro en el Anexo A). Dentro de ese anexo, ✅ = regla confirmada por Alfonso; 🔧 = implementado en su otra app (GestorVentasV2); ❓ = inferencia pendiente de confirmar. |
| **[V-Prompts]** | **Verificado** en `Prompts.txt` de la app original (Anexo E): peticiones de interfaz que hizo el propietario. |
| **[V-web]** | **Verificado** en documentación oficial consultada en línea el 15/10/2026 (indicada en el texto). |
| **[D]** | **Decisión de diseño propuesta** para esta nueva app. No existe en la original; se propone para cumplir los requisitos. |
| **[I]** | **Inferencia** del autor de este informe (deducción razonable, no comprobada). Hay que validarla durante la construcción. |
| **[P]** | **Pendiente** de confirmar con el propietario. Mientras tanto, usar la opción indicada por defecto. |

> Regla para quien implemente: **no convertir un [I] o [P] en hecho sin comprobarlo**. Si una marca no está, se asume [D].

### 0.1 bis Modo de construcción: TODO DESDE CERO [propietario]

El propietario pide que la aplicación se **construya desde cero absoluto**:
- **Código nuevo**: no se copia, reutiliza ni adapta ningún fichero del código de la app original (`referencia/`). Se escribe todo de nuevo siguiendo este informe.
- La app original (`referencia/gestorVentas-original/`) es **solo referencia de comportamiento, textos y aspecto**: sirve para comparar y para no perder ningún detalle, **no como base de código**.
- La **interfaz debe quedar idéntica (R1)**: los **valores de diseño** (colores, tipografías, radios, sombras, espaciados, animaciones, clases) del Anexo C y de la sección 8 son **especificación**, y se reproducen **exactamente** en código nuevo. Los textos visibles también son los de la original.
- Si el propietario prefiere reutilizar componentes de la original en algún punto, lo dirá expresamente; mientras tanto, **desde cero**.

### 0.2 Orden de precedencia cuando dos partes se contradicen

1. Lo que el propietario ha decidido expresamente (secciones marcadas ✅ en el Anexo A y los requisitos de la sección 1.3).
2. Este informe (cuerpo, secciones 1–20).
3. Los anexos extraídos de la app original (Anexos B–E), que describen **cómo es hoy** la app, no necesariamente cómo debe ser.

### 0.3 Qué es cada anexo

| Anexo | Contenido | Uso |
|---|---|---|
| A | `SISTEMA-DE-COMISIONES.md` del propietario, **íntegro**. | Fuente normativa de las **reglas de comisiones y puntos**. |
| B | Esquema de base de datos **original** (extraído automáticamente de `schema.ts`). | Base de las tablas de negocio que se conservan. |
| C | `globals.css` **original íntegro**. | Diseño visual exacto (copiar tal cual). |
| D | Lista de rutas API originales y permiso que comprueban. | Paridad funcional. |
| E | `Prompts.txt` original **íntegro** (historial de peticiones de interfaz del propietario). | Criterios de aceptación de interfaz. |

---

## 1. Visión, alcance y requisitos del propietario

### 1.1 Qué es la aplicación

**GestorVentas** es una aplicación web para un concesionario (Renault/Dacia) que sirve para:

1. Registrar **expedientes de venta** de vehículos (nuevos VN y de ocasión VO) con sus fechas clave (pedido, afectación, RCI, matriculación, facturación, entrega, cobro).
2. Mantener un **directorio de clientes** (con DNI/NIE, correos y teléfonos) y relacionarlos con sus expedientes.
3. Gestionar **catálogos** (marcas, modelos, tiendas, tipos de venta/pago, estados de vehículo).
4. Calcular **comisiones y puntos de objetivo** de los vendedores mediante **planes de comisionamiento** (tarifas por modelo y tramo, usados, financiación, Preference, bonus, penalizaciones) y guardar **liquidaciones** mensuales. [V-código][V-reglas]
5. Importar datos desde Excel/CSV, exportar a CSV/JSON y hacer copias de seguridad.
6. Mostrar informes de rendimiento y un panel (dashboard) con accesos rápidos para crear expedientes con un clic.

Es una aplicación **de uso propio del propietario**, con **multiusuario y roles** por si en el futuro se vende. [Requisito del propietario]

### 1.2 Lo que se construye ahora

Una **copia funcional de la app original con la interfaz idéntica**, preparada para ejecutarse **en una Raspberry Pi 4 (8 GB RAM, tarjeta SD)** en casa del propietario, con:

- **Base de datos PostgreSQL** (como la original), **separada** de la aplicación.
- **Sin Clerk** (ni ningún servicio de identidad externo). Inicio de sesión **propio**: usuario/contraseña **+ doble factor con app autenticadora (TOTP)**.
- Acceso **por URL desde cualquier sitio**, **sin dominio propio y sin abrir puertos** del router.
- **Copias de seguridad completas** de la base de datos, **descargables desde el navegador** y con botón de **subida a Google Drive** (la app pide conectarse a Drive).
- **Fácil de reinstalar**: si algo falla, se reinstala la app y se restaura la base de datos desde una copia.
- **Rápida**: sin los “tirones” de la versión en Vercel + Neon.
- **Guía de instalación** en el repositorio (`GUIA-INSTALACION.md`, contenido en la sección 18).
- **Un archivo instalador único** (sección 14.7) que instala y conecta app y base de datos, con **doble arquitectura** (Pi ARM64 y PC AMD64).

### 1.3 Requisitos explícitos del propietario (lista cerrada)

| # | Requisito | Origen |
|---|---|---|
| R1 | La interfaz debe ser **exacta** a la de la app original. | Propietario |
| R2 | Postgres como ahora. | Propietario |
| R3 | Debe ir rápido (nada de “tarda en reaccionar”). | Propietario |
| R4 | Multiusuario con roles. | Propietario |
| R5 | Acceso por URL con **email y contraseña + doble factor con app autenticadora**. Sin Clerk. | Propietario |
| R6 | Base de datos aparte de la app; copias de seguridad completas en la nube; descargables desde el navegador o con botón a Google Drive (la app pide conectarse a Drive). | Propietario |
| R7 | Si se rompe: reinstalar la app y meter la base de datos. “Bloque” portable. | Propietario |
| R8 | Raspberry Pi 4 (8 GB), tarjeta SD. Le da igual que la SD se rompa si se restaura rápido. | Propietario |
| R9 | Acceso por URL **sin abrir puertos** en el router (Tailscale Funnel por defecto, sin dominio; Cloudflare Tunnel como alternativa si hay dominio). | Propietario |
| R10 | Guía de instalación en el repositorio. | Propietario |
| R11 | La lógica de comisiones/puntos la decide el autor mientras funcione sin problemas. Debe cumplir las **reglas del Anexo A**. | Propietario (delegado) |
| R12 | Convive con GestorVentasV2 (otra app del propietario); no la sustituye. | Propietario |
| R13 | La importación de datos (copia JSON) se hace **al final**, cuando la app ya funcione. | Propietario |
| R14 | Los datos de clientes (DNI) no son una preocupación para el propietario (su empresa ya los tiene en internet). Aun así se aplican medidas de seguridad estándar (sección 6). | Propietario |
| R15 | **Un único archivo instalador** que se instala solo (app + Postgres conectados) en **Raspberry Pi 4 (ARM64)** y **PC AMD64** (y, si es compatible, Synology). Primero se prueba que todo funcione y luego se empaqueta; debe poder **modificarse y ampliarse** (escalable). | Propietario |
| R16 | El **motor de comisiones** lo diseña el autor de este informe (sección 12) cumpliendo las reglas del Anexo A. | Propietario |
| R17 | **Sistema de pagos = el de la app original** (tipos de venta/pago y control de cobro de comisiones por concepto: VN, usado, financiación, Pref/Box, bonus). **Nada nuevo.** | Propietario |

### 1.4 Fuera de alcance (no hacer)

- Registro público de usuarios (la app es accesible desde internet: solo el administrador crea usuarios). [D]
- Pasarelas de pago, facturación electrónica, integración con DMS/CRM del concesionario.
- App móvil nativa (se usa desde el navegador, que debe funcionar en móvil con el diseño original).
- Venta a terceros / multiempresa (multi-tenant). El diseño no lo impide, pero **no se implementa ahora**. [D]

---

## 2. Entorno de ejecución y restricciones

### 2.1 Hardware y sistema

| Elemento | Valor | Notas |
|---|---|---|
| Equipo principal | Raspberry Pi 4 Model B, **8 GB RAM**, CPU ARM64 (aarch64) | Requisito del propietario |
| Equipo secundario | **PC AMD64 (x86‑64)** con Docker | Requisito del propietario (R15); la misma imagen debe funcionar en ambos |
| Almacenamiento | Tarjeta **microSD** (el propietario acepta que pueda romperse) | Una SD sufre con muchas escrituras: ver sección 14.5 |
| Sistema operativo | **Raspberry Pi OS Lite 64-bit** (Debian *Bookworm* o posterior) [D] | El informe original del repositorio también indica 64-bit |
| Red | Casa del propietario, **sin dominio**, **sin abrir puertos** | R9 |
| Acceso externo | **Tailscale Funnel** (URL pública `https://<equipo>.<tailnet>.ts.net`) [D] | Ver sección 14.6 |

### 2.2 Límites que condicionan el diseño

1. **Doble arquitectura**: todas las imágenes y dependencias nativas deben existir para **`linux/arm64` y `linux/amd64`**. Evitar dependencias nativas sin binarios precompilados. [I]
2. **Compilar Next.js 16 en la propia Pi es lento y consume mucha RAM** [I]. Por eso la imagen se compila **fuera** (GitHub Actions o el PC del propietario) y la Pi solo la descarga (sección 14.3).
3. **Una sola máquina, un solo usuario simultáneo habitual** (pocos concurrentes en el futuro). No hace falta alta disponibilidad ni colas ni Redis. [D]
4. **Tailscale Funnel**: solo escucha en los puertos públicos 443, 8443 y 10000, solo TLS, y tiene límites de ancho de banda no configurables. [V-web: documentación oficial de Tailscale consultada el 14/10/2026] → la app debe ser ligera (sin descargas masivas por petición).
5. **Sin acceso a internet no hay Google Drive**; la app debe funcionar igualmente en local (las copias locales siguen funcionando).

### 2.3 Zona horaria e idioma

- Zona horaria: `Europe/Madrid` (contenedores con `TZ=Europe/Madrid`). [D]
- Idioma de la interfaz: **español de España** únicamente.
- **Todas las fechas se muestran `DD/MM/AAAA`** en toda la aplicación y se guardan en la base de datos como tipo `date` (ISO `AAAA-MM-DD`). [V-código: `formatDate`; V-Prompts: “Día/Mes/Año en toda la aplicación”]
- Importes en euros con formato español (`1.234,56 €`). [V-reglas]


---

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

## 4. Modelo de datos (PostgreSQL)

### 4.1 Criterios generales

- Nombres de tablas y columnas **en español y snake_case**, como el original. [V-código]
- Claves primarias `serial` (`integer` autoincremental) como el original. [V-código]
- Fechas de negocio: tipo **`date`** (sin hora). Marcas de tiempo técnicas: `timestamptz`.
- Los importes/puntos de comisiones **nuevos** se guardan como **enteros**: importes en **céntimos** y puntos en **centésimas** (150 = 1,50 puntos), para evitar errores de redondeo. [V-reglas: Fase 0]. Las tablas de negocio antiguas (expedientes, etc.) se mantienen con los tipos del original salvo los cambios indicados.
- Borrados en cascada y claves foráneas **como el original** (Anexo B).

### 4.2 Tablas que se CONSERVAN igual que el original

Ver **Anexo B** (esquema extraído automáticamente). Se conservan: `tiendas`, `usuarios_tiendas`, `emails_usuarios`, `telefonos_usuarios`, `clientes`, `emails_clientes`, `telefonos_clientes`, `marcas`, `modelos`, `importaciones_bloques`, `importaciones_registros`, `ajustes`.

### 4.3 Tablas que se MODIFICAN

#### `usuarios` (cambia por quitar Clerk)

| Columna | Tipo | Cambio |
|---|---|---|
| `id_usuario` | serial PK | igual |
| ~~`clerk_id`~~ | — | **se elimina** |
| `login_email` | varchar(255) NOT NULL UNIQUE (guardado en minúsculas) | **nuevo**: identifica al usuario al iniciar sesión |
| `password_hash` | text NOT NULL | **nuevo** (Argon2id/bcrypt) |
| `debe_cambiar_password` | boolean NOT NULL DEFAULT true | **nuevo**: true al crear usuario con contraseña temporal |
| `totp_secreto_cifrado` | text NULL | **nuevo**: secreto TOTP cifrado con AES-256-GCM usando `APP_SECRET` |
| `totp_activo` | boolean NOT NULL DEFAULT false | **nuevo** |
| `intentos_fallidos` | integer NOT NULL DEFAULT 0 | **nuevo** |
| `bloqueado_hasta` | timestamptz NULL | **nuevo**: bloqueo temporal por intentos |
| `ultimo_acceso` | timestamptz NULL | **nuevo** |
| `creado_en` | timestamptz NOT NULL DEFAULT now() | **nuevo** |
| `nombre`, `rol`, `fecha_de_registro`, `bloqueado`, `tipo_vendedor`, `patron_vo`, `tienda_predeterminada_id` | — | **iguales** (Anexo B) |

Notas:
- `rol` ∈ {`administrador`, `director`, `jefe_zona`, `jefe_tienda`, `vendedor`, `invitado`}. [V-código]
- `bloqueado` = cuenta **suspendida** por un administrador (muestra la pantalla “Cuenta Suspendida”). Es distinto de `bloqueado_hasta` (bloqueo temporal por intentos fallidos). [V-código para el primero; D para el segundo]
- `tipo_vendedor` ∈ {`VN`, `VO`}; `patron_vo` = nombre del patrón de comisionamiento VO que le aplica. [V-código]

#### `estado_vehiculo` (se amplía para que la lógica no dependa del nombre)

| Columna | Tipo | Cambio |
|---|---|---|
| `id_estado_vehiculo`, `nombre_estado_vehiculo`, `predeterminado` | — | iguales |
| `clase` | varchar(2) NOT NULL DEFAULT 'VN' (`VN`/`VO`) | **nuevo** [D] |
| `subtipo_vo` | varchar(30) NULL (`USADO`,`KM0`,`DEMO`,`BUYBACK`, …) | **nuevo** [D] |

**Por qué**: el original decide VN/VO **comparando el texto del nombre** del estado (`"nuevo"`, `"demo"`, `"km0"`, `"buyback"`, `"bb"`, `"seminuevo"`, `"vo"`). [V-código] Eso es frágil. Las reglas del propietario dicen que **Usado, KM0, Demo y Buyback son VO**. [V-reglas ✅] Se configuran en *Configuración → Estados*.
Valores iniciales sugeridos: Nuevo→VN; Demo→VO/DEMO; KM0→VO/KM0; Buyback→VO/BUYBACK; Usado→VO/USADO. [D][P: confirmar si existe un estado “Seminuevo”]

#### `tipo_de_venta` (se amplía con categoría explícita)

| Columna | Tipo | Cambio |
|---|---|---|
| `id_tipo_de_venta`, `nombre_tipo_venta`, `color` (default `#3b82f6`), `orden` | — | iguales |
| `categoria` | varchar(20) NOT NULL (`CONTADO`,`CREDITO`,`PREFERENCE`,`RENTING`) | **nuevo** [D] |

**Por qué**: el original detecta la categoría buscando palabras dentro del nombre (“preference”, “crédito”, “credito”, “financiado”, “renting”, “contado”). [V-código] Las reglas del propietario hablan de “tipo de venta (con su categoría: Contado, Crédito, Preference, Renting)”. [V-reglas]

#### `expedientes` (cambios para el nuevo motor)

Se conservan **todas** las columnas del original (Anexo B), incluidas `valor_objetivo` (puntos del coche), `min_coches_multiplicador`, `cobrado_otra_fecha`, `fecha_cobrado`, `fecha_rci`, `fecha_facturacion`, los indicadores `comision_*_cobrada`, `comision_coche_real`, `comision_financiacion_real` y `conceptos_adicionales`. [V-código] Y se añade/ajusta:

| Columna | Tipo | Cambio |
|---|---|---|
| `puntos` | integer NULL (centésimas) | **nuevo**: puntos propios del coche. NULL = usar valor por defecto del plan. **0 es válido** (no se convierte en 1). Sustituye a `valor_objetivo` (que era `double precision`). [V-reglas ✅] |
| `id_promocion` | integer NULL FK → `promociones_puntos` (ON DELETE RESTRICT) | **nuevo**: sustituye al “cupo” numérico `min_coches_multiplicador`. [V-reglas ✅] |
| `comision_coche_manual` / `comision_financiacion_manual` | integer NULL (céntimos) | sustituyen a `comision_coche_real` / `comision_financiacion_real` (que eran euros `double`). NULL = autocalcular. [V-reglas ✅] |
| `conceptos_especiales` | jsonb NOT NULL DEFAULT '[]' | sustituye a `conceptos_adicionales` (texto JSON). Cada elemento: `{titulo, importe_centimos (±), descripcion, evento ('afectacion'|'matriculacion'|'cobro'), cobrado:boolean}` [V-reglas Fase 7.5] |
| `min_coches_multiplicador`, `valor_objetivo`, `comision_coche_real`, `comision_financiacion_real`, `conceptos_adicionales` | — | se **mantienen como columnas heredadas** (solo lectura, para importar copias antiguas) y se retiran cuando la importación esté validada. [D] |

### 4.4 Tablas NUEVAS: autenticación y seguridad (sin Clerk) [D]

```
sesiones            (id uuid PK, id_usuario FK→usuarios ON DELETE CASCADE, token_hash text UNIQUE NOT NULL,
                     creada_en timestamptz, ultimo_uso timestamptz, caduca_en timestamptz,
                     ip inet, user_agent text, mfa_verificado boolean NOT NULL DEFAULT false, revocada_en timestamptz NULL)
codigos_recuperacion(id serial PK, id_usuario FK ON DELETE CASCADE, codigo_hash text NOT NULL, usado_en timestamptz NULL)
login_intentos      (id bigserial PK, clave text NOT NULL /* hash de ip|email */, en timestamptz NOT NULL DEFAULT now(), exito boolean NOT NULL)
auditoria           (id bigserial PK, en timestamptz DEFAULT now(), id_usuario FK ON DELETE SET NULL, accion text NOT NULL,
                     entidad text, entidad_id text, detalle jsonb, ip inet)
```

### 4.5 Tablas NUEVAS: copias de seguridad y Google Drive [D]

```
copias_seguridad (id serial PK, nombre_archivo text UNIQUE NOT NULL, tamano_bytes bigint, sha256 text,
                  creada_en timestamptz DEFAULT now(), id_usuario FK ON DELETE SET NULL NULL,
                  tipo text NOT NULL /* 'manual' | 'automatica' | 'previa_restauracion' */,
                  subida_drive boolean NOT NULL DEFAULT false, drive_file_id text NULL, notas text NULL)
conexion_drive   (id serial PK, id_usuario FK ON DELETE CASCADE, email_google text,
                  refresh_token_cifrado text NOT NULL, carpeta_id text NULL,
                  copia_automatica_a_drive boolean NOT NULL DEFAULT false, conectada_en timestamptz DEFAULT now())
```

Las **copias en sí** son archivos en `./backups/` (no se guardan en la base de datos).

### 4.6 Tablas NUEVAS: sistema de comisiones (motor nuevo)

Sustituyen a las tablas `commission_*` originales (Anexo B) porque las reglas confirmadas por el propietario exigen: **objetivo por vendedor**, **promociones de puntos**, **tarifas con rango de tramos configurable**, **libro de puntos**, **versiones de liquidación**, **cobros pendientes**. Se mantienen los **nombres de las tablas originales** cuando el concepto es el mismo, para que el aspecto de las pantallas no cambie. [D]

> Unidades: **céntimos** (importes) y **centésimas** (puntos). Mes de cómputo: texto `AAAA-MM`.

**`commission_plans`** (plan de comisionamiento; normalmente un mes)
`id_plan` PK · `nombre` · `fecha_inicio` date · `fecha_fin` date · `estado` (`borrador`/`activo`/`cerrado`) · `tramo_min` int DEFAULT −4 · `tramo_max` int DEFAULT 3 · `puntos_por_pedido` int (centésimas) DEFAULT 0 · `penalizacion_importe` int · `penalizacion_titulo` · `penalizacion_descripcion` · `notas` text. (Se eliminan `min_matriculaciones`, `min_coches_multiplicador`, `objetivo_base`, `arrastre` del plan; el objetivo pasa a ser **por vendedor**.) [V-reglas ✅]

**`commission_plan_vendedores`** (objetivo X por vendedor y plan)
`id` PK · `id_plan` FK CASCADE · `id_usuario` FK · `objetivo_base` int (centésimas; habitual 1300) · `arrastre` int (centésimas) DEFAULT 0 · UNIQUE(`id_plan`,`id_usuario`). Objetivo X resultante = `objetivo_base + arrastre`. [V-reglas Fase 1.2]

**`promociones_puntos`** (coches de doble puntuación)
`id` PK · `id_plan` FK CASCADE · `nombre` · `puntos_especiales` int (centésimas, p.ej. 200) · `minimo_unidades` int · `puntos_si_no_cumple` int DEFAULT 100. [V-reglas Fase 1.3]

**`commission_plan_model_rates`** (tarifas VN por modelo/tramo/tasa)
`id_rate` PK · `id_plan` FK CASCADE · `id_modelo` FK CASCADE · `tasa_cumplida` boolean · `importes` jsonb (mapa `{"-4":15000,"-3":…,"0":…,"3":…}`; claves = tramos entre `tramo_min` y `tramo_max`) · `activo` boolean · `orden` int. Se pasa de 8 columnas fijas `rate_x_minus_4…rate_x_plus_3` a un **mapa** para que el rango de tramos sea configurable. [V-reglas Fase 1.4]

**`commission_used_rates`** (VO de vendedor VN, por subtipo)
`id_used_rate` PK · `id_plan` FK CASCADE · `subtipo` (`USADO`,`KM0`,`DEMO`,`BUYBACK`…) · `importe_primera` int · `importe_resto` int · `min_aplicar` int DEFAULT **0** · `activo`. [V-reglas Fase 1.5]

**`commission_vo_patterns`** (escala progresiva VO)
`id_vo_pattern` PK · `id_plan` FK CASCADE · `nombre` · `aplica_a_vn` boolean · `activo` · `tiers` jsonb (`[{unidad:1,importe:15000},…]`). [V-reglas Fase 1.5]

**`commission_finance_rates`** (incentivo de financiación por marca y tipo)
`id_finance_rate` PK · `id_plan` FK CASCADE · `id_marca` FK CASCADE · `tipo_financiacion` (`CREDITO`,`PREFERENCE`,`RENTING`,`CONTADO`) · `importe` int. [V-código + V-reglas 1.6]

**`commission_preference_rules`** (reglas Preference / BOX3)
`id_pref_rule` PK · `id_plan` FK CASCADE · `nombre` · `id_marca` NULL · `id_modelo` NULL · `tipo_financiacion` NULL · `importe` int · `activa`. [V-reglas 1.6, 7.3]

**`commission_rules`** y **`commission_bonus_rules`** (reglas y bonus; penalizaciones = bonus con `es_penalizacion`)
Mismos campos que el original (Anexo B) **más**: `evento` ∈ {`pedido`,`afectacion`,`matriculacion`,`cobro`,`credito`,`preference`} (se añade `cobro`), `tipo_vehiculo` ∈ {`nuevo`,`usado`,`cualquiera`}, `fecha_inicio`/`fecha_fin` de validez, `tasa_intervencion` ∈ {`cumplida`,`no_cumplida`,`indiferente`}, `puntos` int (centésimas) y `importe` int (céntimos), `ligar_a_credito` boolean (solo Preference). [V-reglas 1.7]

**`commission_brand_intervention_rates`** (tasa de intervención objetiva por marca y plan)
`id_intervention_rate` PK · `id_plan` · `id_marca` · `tipo_tasa` (`porcentaje`/`unidades`) · `objetivo` int (70 = 70 % o nº de unidades) DEFAULT 70 · `puntos_defecto` int (centésimas; puntos por defecto de un coche de esa marca) DEFAULT 100. Los **puntos por defecto por modelo** van en `commission_model_points(id_plan, id_modelo, puntos)`. [V-reglas 1.2, 4.1]

**`commission_liquidations`**, **`commission_liquidation_lines`**, **`commission_liquidation_line_items`**
Mismo concepto que el original (Anexo B) pero **por vendedor y mes**: `commission_liquidations(id_liquidation, id_plan, id_usuario, mes 'AAAA-MM', estado ('borrador','calculada','revisada','cerrada'), version int, objetivo_x int, puntos_mes int, tramo int, tasa_intervencion jsonb, bruto int, penalizacion int, neto int, mes_pago 'AAAA-MM', calculada_en timestamptz, origen ('motor'|'importada_antigua'))`, UNIQUE(`id_plan`,`id_usuario`,`mes`). Las líneas guardan **cada importe con su concepto de origen** (`concepto`, `importe`, `puntos`, `id_expediente`, `evento`, `mes_evento`). [V-reglas Fase 9]

**`commission_liquidation_versions`** (historial inmutable)
`id` PK · `id_liquidation` FK · `version` · `motivo` text · `creada_en` · `snapshot` jsonb (cabecera + líneas + conceptos completos) · `neto_anterior` int · `neto_nuevo` int. Sin UPDATE ni DELETE (disparador). [V-reglas 9.3, 9.4]

**`libro_puntos`** (registro de **solo inserción**)
`id` bigserial PK · `id_usuario` · `id_expediente` NULL · `evento` (`PEDIDO`,`MATRICULACION`,`COBRO`,`REGLA`,`AJUSTE`) · `fecha` date · `mes` 'AAAA-MM' · `puntos` int (centésimas, puede ser negativo) · `regla` text NULL · `creado_en`. **Nunca se modifica ni se borra**: las correcciones son apuntes negativos. [V-reglas Fase 10]

**`pendientes_cobro`** (lo que “me deben”)
`id` PK · `id_usuario` · `concepto` · `importe` int · `fecha` date · `mes_nomina_previsto` 'AAAA-MM' · `cobrado` boolean · `fecha_cobro` date NULL · `notas` text. [V-reglas 11.3]

**`commission_plan_pending`** (comisiones pendientes del plan, de meses anteriores)
`id` PK · `id_plan` FK · `concepto` · `importe` int · `mes_origen`. [V-reglas 11.2]

**`cobro_conceptos`** (cotejo de nómina por concepto)
Se mantienen las casillas por concepto de `expedientes` (`comision_coche_cobrada`, `comision_usado_cobrada`, `comision_financiacion_cobrada`, `comision_preference_cobrada`, `comision_bonus_cobrada`, `comision_cobrada`) tal como en el original. [V-código]

### 4.7 Índices obligatorios (rendimiento en la Pi) [D]

```
expedientes(id_usuario), expedientes(id_cliente), expedientes(id_modelo), expedientes(id_tienda),
expedientes(fecha_expediente), expedientes(fecha_matriculacion), expedientes(fecha_rci),
expedientes(fecha_cobrado), expedientes(vin), expedientes(matricula), expedientes(id_estado_vehiculo),
clientes(dni), clientes(lower(nombre)), emails_clientes(id_cliente), telefonos_clientes(id_cliente),
modelos(marca_id), usuarios_tiendas(id_usuario), sesiones(id_usuario), sesiones(caduca_en),
login_intentos(clave, en), libro_puntos(id_usuario, mes), commission_liquidations(id_plan, id_usuario, mes)
```

### 4.8 Datos iniciales (semilla) [D]

Una migración de “semilla” crea (idempotente): estados de vehículo (Nuevo, Demo, KM0, Buyback, Usado) con su `clase`/`subtipo_vo`; tipos de venta (Contado, Crédito, Preference, Renting) con `categoria` y color; ajuste `mostrar_botones_csv`. **No** se crean usuarios en la semilla: el primer administrador se crea con `scripts/crear-admin.sh` (sección 5.2).


---

## 5. Autenticación propia (sustituye a Clerk) [D]

### 5.1 Qué hace Clerk en la app original y qué debe reemplazarse [V-código]

| Función de Clerk en el original | Dónde | Sustituto en la nueva app |
|---|---|---|
| Middleware que protege todas las rutas salvo `/`, `/sign-in`, `/sign-up` | `src/middleware.ts` | Middleware que exige cookie de sesión y redirige a `/login` (rutas públicas: `/`, `/login`, `/api/auth/*`, ficheros estáticos) |
| `auth()` en cada Route Handler para obtener `userId` | 23 rutas API | Función `requireSession()` que valida la cookie contra la tabla `sesiones` y devuelve el usuario |
| `currentUser()` + `syncUser()`: crea el usuario local con rol `invitado` la primera vez; enlaza por email con un usuario “preregistrado” por el administrador | `src/lib/auth-utils.ts` | **No hay autorregistro.** El administrador crea el usuario (nombre, email, rol…) y el usuario entra con una contraseña temporal |
| Páginas `/sign-in` y `/sign-up` con componentes de Clerk | `src/app/sign-in`, `sign-up` | Página `/login` propia con el **mismo estilo** (glass-panel, degradados); se elimina `/sign-up` |
| `UserButton`/cerrar sesión en la barra lateral | `Sidebar.tsx` | Botón “Cerrar sesión” (mismo aspecto) que invalida la sesión |
| `ClerkProvider` con localización `esES` | `layout.tsx` | Se elimina. Textos en español escritos en la propia app |
| Referencias a `clerk_id` (tabla `usuarios`, creación de usuarios con ID temporal) | `usuarios`, `/api/admin/usuarios` | Columnas nuevas de la sección 4.3; el alta de usuario genera hash de contraseña temporal |

La función `syncUser()` pasa a llamarse `getCurrentUser()` y **devuelve el mismo objeto** (`id_usuario`, `nombre`, `rol`, `fecha_de_registro`, `bloqueado`, `tienda_predeterminada_id`) para que los componentes no cambien. [D]

### 5.2 Primer administrador (arranque inicial)

- Comando: `./scripts/crear-admin.sh "Nombre" email@dominio.com` → pide una contraseña por terminal, crea el usuario con rol `administrador`, `debe_cambiar_password=false`, `totp_activo=false`.
- En el **primer inicio de sesión** el sistema obliga a **activar el 2FA** antes de entrar al panel (sección 5.4).
- No existe pantalla pública de “instalación”: solo el script (evita que alguien desde internet cree un administrador). [D]

### 5.3 Flujo de inicio de sesión (paso a paso)

1. `GET /login` muestra formulario **email + contraseña**.
2. `POST /api/auth/login`:
   - Normaliza el email a minúsculas. Busca el usuario. Compara el hash con tiempo constante. **Mismo mensaje de error** (“Credenciales no válidas”) si el usuario no existe o la contraseña falla.
   - Aplica **límite de intentos** (5.6). Si `bloqueado = true` (suspendido) → no inicia sesión y se muestra la pantalla/mensaje de **Cuenta Suspendida** del original (“Tu acceso al sistema ha sido suspendido por un administrador…”). [V-código]
   - Si la contraseña es correcta y el usuario tiene `totp_activo`: crea una **sesión parcial** (`mfa_verificado=false`) y responde “se requiere código”.
   - Si la contraseña es correcta y **no** tiene 2FA: sesión parcial y redirige a `/cuenta/activar-2fa` (obligatorio).
3. `POST /api/auth/verificar-2fa` con el código de 6 dígitos (o un código de recuperación): si es válido marca `mfa_verificado=true`, renueva el identificador de sesión (rotación) y entra al panel.
4. Si `debe_cambiar_password=true`, tras el 2FA se obliga a ir a `/cuenta/cambiar-password` antes de usar la app.
5. Una sesión con `mfa_verificado=false` **solo** puede llamar a las rutas `/api/auth/*`; cualquier otra devuelve 401.

### 5.4 Doble factor (TOTP)

- Estándar **RFC 6238**: SHA‑1, 6 dígitos, periodo 30 s, ventana de tolerancia ±1 paso. Compatible con Google Authenticator, Microsoft Authenticator, Authy, etc.
- Activación: `GET/POST /api/auth/2fa/preparar` genera un secreto aleatorio (160 bits), muestra **código QR** (`otpauth://totp/GestorVentasPi:email?secret=…&issuer=GestorVentasPi`) y el secreto en texto; el usuario introduce un código para confirmar y solo entonces se guarda `totp_activo=true`.
- El secreto se guarda **cifrado** (AES‑256‑GCM, clave derivada de `APP_SECRET`). Nunca se muestra de nuevo.
- Al activar se generan **10 códigos de recuperación** de un solo uso (formato `XXXX-XXXX`), se muestran **una vez** y se guardan solo su **hash**.
- Protección anti-reutilización: guardar el último contador TOTP aceptado por usuario y rechazar el mismo código dos veces. [I]
- **Emergencia**: si el propietario pierde el móvil y los códigos, se resetea con `./scripts/reset-2fa.sh email` (acceso físico/SSH a la Pi) y el usuario debe volver a activar el 2FA. Un administrador también puede resetear el 2FA de otro usuario desde *Configuración → Usuarios* (acción registrada en `auditoria`).

### 5.5 Sesiones

- Identificador de sesión: **256 bits aleatorios** (`crypto.randomBytes(32)`), enviado en cookie **`__Host-gv_session`**: `HttpOnly; Secure; SameSite=Lax; Path=/`. En base de datos solo se guarda el **SHA‑256** del token.
- Duración: **inactividad máxima 12 horas** y **caducidad absoluta 30 días**; renovación deslizante en cada uso (como mucho cada 5 min para no escribir en la SD a cada petición). [D][P: confirmar duraciones]
- Cierre de sesión: marca `revocada_en`. Cambiar contraseña o resetear 2FA **revoca todas las demás sesiones** del usuario.
- Si el administrador **suspende** a un usuario (`bloqueado=true`) o lo elimina, sus sesiones dejan de ser válidas inmediatamente.
- Limpieza: tarea diaria que borra sesiones caducadas y `login_intentos` de más de 30 días.

### 5.6 Límite de intentos y bloqueos

- Por cada combinación (IP + email) y también por IP sola: tras **5 fallos en 15 minutos** → bloqueo de **15 minutos** (respuesta 429 con mensaje genérico). Cada nuevo grupo de 5 fallos duplica el bloqueo (máx. 24 h). [D]
- Con Tailscale Funnel, la IP real del cliente llega en cabeceras de reenvío; **leerla solo de la cabecera de confianza configurada** (`TRUST_PROXY=true`) para no permitir suplantarla. [I]
- Los fallos y bloqueos se anotan en `auditoria`.

### 5.7 Contraseñas

- Mínimo **12 caracteres**; se bloquean las contraseñas triviales (lista corta embebida). Sin reglas absurdas de mayúsculas/símbolos. [D]
- Hash **Argon2id** (parámetros moderados para la Pi, p. ej. memoria 19 MiB, 2 iteraciones, 1 hilo [I]) o **bcrypt coste 12** si Argon2 diera problemas en ARM64. Medir que el login tarda **< 500 ms** en la Pi.
- Alta de usuario por el administrador: contraseña temporal generada por la app, mostrada **una sola vez**; `debe_cambiar_password=true`.

### 5.8 Páginas y textos (estilo original)

- `/login`: panel de cristal centrado, logo con degradado `--primary`→`--secondary` (igual que la portada), título “GestorVentas”, campos con clase `form-input`, botón `btn btn-primary`. [V-código: portada `page.tsx`]
- Paso 2FA: campo de 6 dígitos (autofocus, teclado numérico en móvil), enlace “Usar un código de recuperación”.
- Mensajes de error en rojo (`--danger`), sin revelar si el usuario existe.

---

## 6. Seguridad (requisitos transversales) [D]

La app estará **expuesta a internet** a través del Funnel; por tanto:

1. **HTTPS** lo aporta Tailscale (certificado automático). La app **solo** escucha en `127.0.0.1:3000` (no en la LAN) salvo que se configure lo contrario.
2. **Cabeceras**: `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: same-origin`, y **Content-Security-Policy** razonable (el original usa estilos en línea y un `<script>` en línea para el tema; permitirlos con *nonce* o hash).
3. **CSRF**: cookie `SameSite=Lax` + comprobación de cabecera `Origin`/`Host` en toda petición que no sea GET.
4. **Autorización en servidor** en cada ruta (sección 7). Además de lo que hacía el original, **no devolver nunca hash de contraseña ni secretos TOTP** en ninguna respuesta.
5. **Inyección SQL**: solo consultas parametrizadas (Drizzle). Prohibido concatenar SQL con datos de usuario (el original usa `ilike(... `%${q}%`)` parametrizado; mantenerlo). [V-código]
6. **Subida de ficheros** (Excel/CSV/JSON/dump): límite de tamaño (p. ej. 20 MB), validar tipo y estructura; las restauraciones requieren **reautenticación** (contraseña + código 2FA) y ser administrador.
7. **Auditoría** (`auditoria`): inicios de sesión (ok/fallo), cambios de rol, suspensiones, altas/bajas de usuario, reset de 2FA, creación/restauración/descarga de copias, conexión a Drive, borrados masivos, recálculos de meses cerrados.
8. **Secretos**: `APP_SECRET` (≥ 32 bytes aleatorios, base64), credenciales de Google y contraseña de Postgres solo en `.env` con permisos `600`. El token de Google se guarda cifrado.
9. **Actualizaciones**: guía para actualizar la imagen y el sistema (`apt upgrade`) con frecuencia.
10. **Copias**: los `.dump` contienen DNI y datos personales de clientes: se guardan con permisos `600`; las de Drive se suben a una carpeta privada de la cuenta del propietario; opcionalmente cifradas con `age`/AES antes de subir [P: ¿cifrar las copias?].

### 6.1 Puntos débiles de permisos del original [V-código] y qué hacer

| Hallazgo en el original | Comportamiento por defecto en la nueva app | Endurecimiento recomendado [P] |
|---|---|---|
| Cualquier usuario no-invitado puede **editar o borrar cualquier expediente** (PUT/DELETE solo comprueban que no sea invitado). | **Igual que el original** (R1: comportamiento idéntico). | Limitar a administrador/director/jefe_zona + expedientes de las tiendas propias (jefe_tienda) o propios (vendedor). **Preguntar al propietario antes de activar.** |
| `GET /api/expedientes?id=` devuelve cualquier expediente a cualquier sesión. | Igual que el original, pero exigiendo rol no-invitado (el original solo pedía sesión). | Misma restricción de visibilidad que en edición. |
| Borrado masivo de expedientes/clientes sin validar pertenencia. | Igual que el original. | Validar que todos los IDs sean accesibles para el usuario. |
| `/api/expedientes/simular-comision` y `/api/comisiones/verificar` solo piden sesión. | Exigir rol no-invitado. | Exigir visibilidad sobre los expedientes consultados. |

El endurecimiento se implementa detrás de un **ajuste** (`ajustes.restringir_por_tienda`, por defecto `false`) para activarlo sin cambiar código. [D]

> **La visibilidad de listados y dashboard es la del original**: todos los roles activos ven todos los expedientes. [V-código: `ExpedientesPage` consulta todos sin filtrar por rol/tienda]

---

## 7. Roles y permisos

### 7.1 Roles [V-código]

`administrador` · `director` · `jefe_zona` · `jefe_tienda` · `vendedor` · `invitado`
Etiquetas visuales (badges) con las clases CSS `badge-admin`, `badge-director`, `badge-zona`, `badge-tienda`, `badge-vendedor`, `badge-invitado` del Anexo C.

### 7.2 Matriz de permisos de **interfaz** [V-código]

| Elemento | admin | director | jefe_zona | jefe_tienda | vendedor | invitado |
|---|:-:|:-:|:-:|:-:|:-:|:-:|
| Dashboard (vista completa) | ✔ | ✔ | ✔ | ✔ | ✔ | ✘ (ve “Cuenta Pendiente de Aprobación”) |
| Expedientes (lista) | ✔ | ✔ | ✔ | ✔ | ✔ | ✘ (redirige al dashboard) |
| Botón “Nuevo Expediente” | ✔ | ✘ | ✘ | ✔ | ✔ | ✘ |
| Clientes | ✔ | ✔ | ✔ | ✔ | ✔ | ✘ |
| Comisiones (enlace y página) | ✔ | ✔ | ✔ | ✔ | ✔ | ✘ (sin enlace) |
| Informes | ✔ | ✔ | ✔ | ✔ | ✔ | ✘ |
| Log Importación | ✔ | ✔ | ✔ | ✔ | ✔ | ✘ |
| Configuración (catálogos, usuarios, BBDD) | ✔ | ✘ (“Acceso Denegado”) | ✘ | ✘ | ✘ | ✘ |
| Mis datos (perfil, lápiz junto al nombre) | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| Planes y liquidaciones (crear/editar/calcular) | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ |

Notas [V-código]:
- En el original el botón “Nuevo Expediente” solo lo ven `administrador`, `jefe_tienda` y `vendedor`, pero la página `/dashboard/expedientes/nuevo` y la API aceptan a cualquier no-invitado. Se mantiene la **visibilidad del botón** y se **cierra la API** al mismo conjunto salvo decisión contraria [P].
- Lo que ve cada rol **dentro de Comisiones** (la página la abre cualquier rol activo, pero las APIs de planes/liquidar son de administrador) no está claro en el código leído [No verificado]. Por defecto: administrador ve todo; el resto ve **solo sus propias liquidaciones en modo lectura** [D][P].
- Selección de tienda al crear expediente: administradores y directores (o usuarios sin tiendas asignadas) ven todas las tiendas; el resto solo las suyas; si solo tiene una, **viene preseleccionada**. [V-código `nuevo/page.tsx` + V-Prompts]

### 7.3 Matriz de permisos de **API** (original) → Ver Anexo D

Resumen: rutas `/api/admin/*`, `/api/comisiones/planes` y `/api/comisiones/liquidar` → solo `administrador`; `/api/clientes*`, `/api/expedientes*` (escritura) e `/api/importaciones` → cualquier rol salvo `invitado`; `/api/buscar`, `/api/perfil`, `/api/usuario/tienda-predeterminada`, `/api/clientes/buscar`, `/api/clientes/verificar-existencia` → cualquier sesión.

### 7.4 Reglas de gestión de usuarios [V-código: `/api/admin/usuarios`]

- Solo el administrador crea, edita, suspende y elimina usuarios y cambia roles.
- Roles válidos: los seis de 7.1.
- **Un administrador no puede auto-bloquearse ni auto-degradarse de rol.**
- **No se puede suspender a un administrador**; el botón “Suspender” **no se muestra** para administradores. [V-Prompts]
- **Eliminar usuario**: modal de confirmación donde hay que escribir **`ELIMINAR`**. Si el usuario tiene **expedientes**, la eliminación se **verifica/rechaza** para no dejar expedientes huérfanos [V-código: “Verificar si el usuario tiene expedientes”]; el mensaje debe sugerir **suspender** en su lugar. [I: el texto exacto del original no se ha leído]
- Datos de un usuario en el formulario: Nombre completo*, Correo electrónico, Teléfono de contacto, Rol asignado*, Tipo de vendedor* (VN/VO), Patrón de comisionamiento VO*, “Suspender acceso (Bloquear cuenta)”, tiendas asociadas. [V-código]
- **Nuevo** respecto al original: contraseña temporal, resetear 2FA, cerrar todas las sesiones.


---

## 8. Diseño visual y sistema de interfaz (idéntico al original)

> **Regla de oro (R1):** escribir el CSS y los componentes **de nuevo**, pero con **exactamente los mismos valores** que el Anexo C (variables, radios, sombras, transiciones, clases) y los estilos descritos aquí. Donde este informe describe, el **comportamiento original manda**. Si algún detalle no está aquí, se **consulta** la pantalla equivalente de `referencia/` y se reproduce su aspecto y sus textos (sin copiar su código).

### 8.1 Identidad visual [V-código: `globals.css`, `layout.tsx`]

- Estilo **“glassmorphism”**: paneles translúcidos con `backdrop-filter: blur(16px)`, borde fino `--border-light`, sombra suave y esquinas redondeadas (`--radius-md: 14px`, `--radius-lg: 20px`).
- Fondo de aplicación con **resplandor** (`.glow-bg`: dos degradados radiales violeta y cian, fijo, detrás del contenido).
- **Tema oscuro por defecto** (`--bg-app: hsl(230,25%,8%)`) y **tema claro** activado con `html[data-theme='light']`. La elección se guarda en `localStorage['theme']` y un `<script>` en el `<head>` la aplica **antes de pintar** (para evitar parpadeo).
- **Paleta HSL**: `--primary-hue: 255` (violeta), `--secondary-hue: 195` (cian), `--accent-hue: 335` (rosa). Estados: éxito verde, aviso ámbar, peligro rojo, info azul.
- **Tipografías**: títulos *Outfit* (`--font-title`), cuerpo *Plus Jakarta Sans* (`--font-body`). Títulos con `letter-spacing: -0.02em`.
- **Transición global** `--transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1)`.
- Scrollbar personalizada (8 px) con el pulgar en `--bg-surface` y color `--primary` al pasar el ratón.
- **Los `<select>` y sus `<option>`** fuerzan fondo `--bg-surface` y texto `--text-primary` (para que se lean en cualquier navegador; el propietario lo pidió). [V-código + V-Prompts]

### 8.2 Clases reutilizables (definidas en el Anexo C)

| Clase | Uso |
|---|---|
| `.glass-panel` | Contenedor base de tarjetas, modales, barra lateral |
| `.glass-panel-interactive` | Tarjeta/botón con elevación al pasar el ratón (`translateY(-4px)`, brillo violeta) |
| `.form-group`, `.form-label`, `.form-input`, `.form-select` | Formularios (foco con borde `--primary` y halo) |
| `.btn`, `.btn-primary`, `.btn-secondary` | Botones (el primario con degradado y elevación al hover; `translateY(-2px)`) |
| `.badge` + `.badge-admin/-director/-zona/-tienda/-vendedor/-invitado` | Etiquetas de rol (mayúsculas, píldora) |
| `.table-container`, `.table-premium`, `.table-compact` | Tablas (cabecera en mayúsculas, hover de fila, variante compacta 8×10 px) |
| `.glow-bg` | Resplandor de fondo |

### 8.3 Estructura de página (todas las pantallas bajo `/dashboard`) [V-código: `dashboard/layout.tsx`]

```
┌──────────────┬───────────────────────────────────────────────┐
│ Sidebar      │ ┌── Cabecera superior (buscador global, a la derecha, línea inferior) ──┐
│ (glass-panel │ │                                                                       │
│ sticky,      │ └───────────────────────────────────────────────────────────────────────┘
│ 280px /      │  Contenido (padding 32px, gap 32px, scroll vertical propio, max-height 100vh)
│ 80px)        │
└──────────────┴───────────────────────────────────────────────┘
```

- **Barra lateral**: `glass-panel`, ancho **280 px** (expandida) / **80 px** (colapsada), `position: sticky; top: 16px; height: calc(100vh − 32px)`, margen `16px 0 16px 16px`, radio `--radius-lg`. Botón circular flotante de colapsar (40 px, degradado primary→secondary, flecha que rota 180°) en el borde derecho. Estado guardado en `localStorage['sidebar-collapsed']`. Transición de ancho 0,3 s.
- Cabecera de la barra: logo/nombre y **conmutador de tema** (`ThemeToggle`).
- **Enlaces** (cada uno `glass-panel-interactive` con icono SVG + texto; en modo colapsado solo icono con `title`): Dashboard · Expedientes · Clientes · Configuración (solo admin) · Comisiones · Informes · Log Importación.
- **Parte inferior**: nombre del usuario con **icono de lápiz** (“Editar mis datos” → `/dashboard/perfil`) + **badge de rol**; botón “Cerrar sesión”. [V-código + V-Prompts: “Quita el botón lateral Mis Datos… se gestionará mediante un botón tipo lápiz”]
- Cuenta **suspendida**: se sustituye todo el panel por una tarjeta centrada con borde izquierdo rojo, icono de prohibido y título **“Cuenta Suspendida”**. [V-código]

### 8.4 Patrones de interacción comunes [V-código + V-Prompts]

1. **Mensajes de confirmación/éxito**: **flotantes**, arriba y centrados, sobre el contenido (no desplazan nada), visibles unos segundos y desaparecen solos. Ejemplo: “¡Expediente rápido creado con éxito para Sandero (Contado)!”.
2. **Modales de confirmación para acciones destructivas** (borrar expediente, cliente, fecha, usuario…). La eliminación masiva y la de usuarios usan texto de confirmación (`ELIMINAR`) cuando el original lo hace.
3. **Teclado en modales** (`GlobalModalKeyboardHandler`): `Esc` pulsa el botón de cancelar/cerrar/no/volver del modal abierto; `Enter` pulsa el botón principal (aceptar/guardar/confirmar) salvo que el foco esté en un campo de varias líneas. Se detecta el modal por ser un contenedor `fixed/absolute` casi a pantalla completa con `z-index ≥ 100`. [V-código]
4. **Cambios sin guardar**: al salir de un expediente editado, aparece un modal “⚠️ Cambios sin guardar” con opción de guardar. [V-código + V-Prompts]
5. **Ordenación pinchando en el título de columna** en Expedientes y Clientes. [V-Prompts]
6. **Fechas siempre `DD/MM/AAAA`**; las columnas de fechas de la tabla de expedientes van **centradas** y con **fondos alternos** muy sutiles (`rgba(128,128,128,0.03)` / `0.09`) para distinguirlas. [V-código + V-Prompts]
7. **Rejilla/tablas**: columna de ID **oculta** al usuario; los códigos internos de expediente no se muestran. [V-Prompts]
8. **Tamaño de texto y espaciado**: los de los estilos en línea del original (p. ej. títulos de página `1.85rem`/`2rem`, subtítulo `--text-secondary`).

### 8.5 Accesibilidad y móvil

- La interfaz original es **adaptable** (rejillas `repeat(auto-fit, minmax(220px,1fr))`). Debe usarse cómodamente en móvil. [I]
- Contraste suficiente en ambos temas; foco visible en campos y botones.

---

## 9. Pantallas (especificación funcional)

Rutas y nombres **idénticos al original** [V-código]. Para cada pantalla: contenido, datos, acciones y reglas.

### 9.1 `/` — Portada
Página de presentación con tarjeta central (“GestorVentas”, texto descriptivo, tarjetas “KPIs en Tiempo Real”, “Reglas de Comisión”…). Si hay sesión válida → redirige a `/dashboard`; si no → muestra botón de entrar a `/login`. [V-código: `page.tsx` (contenido); redirección por sesión [D]]

### 9.2 `/login`, `/cuenta/*` (nuevas)
Ver sección 5. Mismo estilo glass que la portada.

### 9.3 `/dashboard` — Panel principal [V-código: `dashboard/page.tsx`]

- Cabecera: **“¡Hola, {nombre}!”**, subtítulo “Bienvenido al panel del Gestor de Ventas. Aquí tienes el resumen de hoy.” y, a la derecha, “Fecha de registro: DD/MM/AAAA”.
- **Rol `invitado`**: tarjeta con borde ámbar y título **“Cuenta Pendiente de Aprobación”** que explica que debe pedir a un administrador que le asigne su rol definitivo.
- **Roles activos**:
  1. Cuatro **tarjetas de métricas** (`glass-panel-interactive`, rejilla auto-fit 220 px):
     - **MES ACTUAL** — “Expedientes creados este mes” (cuenta expedientes cuya `fecha_expediente` cae en el mes y año actuales).
     - **EXPEDIENTES TOTALES** — “Registrados en base de datos”.
     - **CLIENTES REGISTRADOS** — “Directorio activo”.
     - **TIPO DE PAGO** — lista “Expedientes {nombre de tipo de venta}: N” para **cada tipo de venta existente** (aunque sea 0); “Sin tipos de venta creados” si no hay ninguno. Lista con scroll (máx. 80 px).
  2. Panel **“Últimos Expedientes Activos”** con enlace “Ver todos” → `/dashboard/expedientes`. Tabla `RecentExpedientesTable`: **los 5 últimos** (por `id_expediente` descendente). Columnas: Cliente, Marca, Modelo, T. Venta, Estado, Vendedor, F. Exp., F. Afect, F. RCI, F. Mat, F. Entrega, Acciones (lápiz para **editar** → lleva al expediente; “Asignar Cliente”). El color de la columna T. Venta es el **color configurado del tipo de venta**. [V-código + V-Prompts]
  3. **“Acceso Rápido a Modelos”** (`QuickExpedienteCreator`):
     - Un **bloque vertical por cada marca con “Acceso rápido” activo**, colocados **uno al lado del otro** (p. ej. Renault, Dacia).
     - Dentro, **en vertical, los modelos con “Acceso rápido” activo**, ordenados por `orden_acceso_rapido` y nombre.
     - Debajo de cada modelo, **una fila de botones, uno por tipo de venta** (uno junto a otro). El **fondo de cada botón es el color del tipo de venta**. Al pulsar: crea un expediente **al instante** con ese modelo y tipo de venta, **fecha de expediente = hoy**, **estado = el estado marcado “predeterminado”**, vendedor = usuario actual (o el elegido si se ofrece selector) y tienda = la tienda predeterminada del usuario. Muestra el mensaje flotante de éxito.
     - Un **bloque adicional “VO”** a la derecha de los activos, con **un botón por cada tipo de venta**: crea un expediente de **estado “Usado”** (busca el estado cuyo nombre sea “usado”). 
     - Todo **centrado**. [V-código + V-Prompts]
- Datos del dashboard calculados en servidor **sin cargar toda la tabla** cuando sea posible (conteos con `COUNT`). [D: optimización invisible]

### 9.4 `/dashboard/expedientes` — Control de Expedientes [V-código: `ExpedientesList.tsx` 5.339 líneas]

Cabecera: título **“Control de Expedientes”**, subtítulo “Listado completo de ventas realizadas y seguimiento de expedientes.”, botón **“Nuevo Expediente”** (solo admin/jefe_tienda/vendedor).

**Barra de herramientas y filtros**
- Buscador: “Busca por cliente, matrícula, DNI, vendedor, VIN...”.
- Filtros por campo (placeholders verificados: nombre “Ej. Juan Pérez”, DNI “Ej. 12345678Z”, matrícula “Ej. 1234ABC”, teléfono “Ej. 600123456”, email “Ej. juan@correo.com”) [V-código]. **[I]** Filtros adicionales por marca, modelo, tipo de venta, estado y vendedor: no se han comprobado uno a uno; replicar los que tenga la pantalla original.
- **Navegación por mes** con botones de título “Mes Anterior (-1)”, “Mes Actual Real”, “Mes Siguiente (+1)” [V-código]. **[I]** Selector del tipo de fecha por el que se filtra (expediente, afectación, RCI, matriculación, entrega): el código de edición en lote admite esos tipos, pero el selector de la pantalla no se ha leído línea a línea.
- **Ocultar o mostrar columnas** de la tabla (selector persistente).
- **Paginación** (Primera, Anterior, Siguiente, Última página).
- Botones: **📊 Detalle y Resumen Estadístico** (puntos, tramo y comisión estimada del mes del vendedor), **📥 Importar CSV**, **Importar Datos Excel**, **📤 Exportar Seleccionados (CSV)**, **📤 Exportar Todo (CSV)**, **💾 Exportar Backup (JSON)**, **🔄 Restaurar Backup (JSON)**, **🗑️ Eliminar Seleccionados**, **Edición Masiva (Lote)** y **Aplicar Cupo a Expedientes en Lote** (en el nuevo motor: *asignar promoción a expedientes en lote*). La visibilidad de los botones CSV depende del ajuste `mostrar_botones_csv`. [V-código]

**Tabla** (cabeceras exactas, **ordenables** pinchando salvo Cobro/Acciones):
`[casilla selección]` · Cliente · Teléfono · Email · Marca · Modelo · T. Venta · Estado · Vendedor · **F. Exp.** · **F. Afect** · **F. RCI** · **F. Mat** · **F. FAC.** · **F. Entrega** · **Cobro** · **Acciones**.
- Cliente muestra **solo el nombre** (sin DNI). [V-Prompts]
- Las columnas de fechas **F. Afect, F. Mat, F. Entrega** (y las demás editables) tienen, en cada fila, **botón lápiz** (abre modal para introducir la fecha, **precargado con la fecha de hoy**, con Aceptar/Cancelar) y **botón papelera** (borra la fecha tras **confirmación en modal**). [V-Prompts]
- **Cobro**: columna que refleja los indicadores `comision_*_cobrada` (VN base, Usado, Financiación, Pref/Box, Bonus) [V-código para los indicadores]; **[I]** el aspecto exacto del control de la columna no se ha leído.
- **Acciones**: ✏️ Editar (abre `/dashboard/expedientes/editar/{id}`), 🗑️ Eliminar (con confirmación), Asignar Cliente.
- El color del texto/chip de **T. Venta** es el del tipo de venta configurado. [V-Prompts]
- Modal secundario para **crear cliente** (“➕ Crear Nuevo Cliente”) y para **asignar un cliente** existente.

**Importación Excel** (flujo de 3 pasos, **actualiza expedientes existentes**, no crea nuevos) [V-código]:
1. El navegador lee la **primera hoja** con SheetJS y localiza columnas **por nombre aproximado** (insensible a mayúsculas, coincide si contiene el texto): `cliente` (obligatoria), `nif|dni|n.i.f`, `bastidor|vin|chasis`, `matrícula|matricula|patente`, `f. afect|fecha afectacion|afectación`, `fecha matriculacion|f. mat`, `email cliente|correo`, `f. creado|creado|f. exp|fecha expediente`, `teléfono|móvil|tfno|phone`, `entrega fijada|f. entrega|fecha de entrega`.
2. Convierte fechas (número serie Excel, `DD/MM/AAAA`, `DD-MM-AAAA`, `AAAA-MM-DD`, ISO) y limpia teléfonos (quita `.0` final y caracteres no numéricos salvo `+`).
3. Llama a `POST /api/expedientes/importar-excel/verificar`: por cada fila busca clientes por **nombre (ilike exacto)** y sus expedientes → estado **`ok`** (1 expediente: se actualizará automáticamente), **`multiple`** (varios: el usuario elige cuál en pantalla) o **`no_match`** (sin coincidencia). Las filas `ok` se aplican con `POST …/procesar`; las `multiple` pasan por **resolución de conflictos** en un modal.
4. Todo queda registrado en el **Log de Importaciones** (bloque + registros).

**Importación CSV** (`/api/expedientes/import`): crea expedientes completos con campos `cliente_nombre`, `cliente_dni`, `cliente_fecha_nacimiento`, `cliente_emails`, `cliente_telefonos`, `marca_nombre`, `modelo_nombre`, `tipo_venta_nombre`, `tipo_venta_color`, `estado_vehiculo_nombre`, `estado_vehiculo_predeterminado`, `fecha_expediente`, `fecha_afectacion`, `fecha_matriculacion`, `fecha_entrega`, `fecha_rci`, `matricula`, `vin`, y de catálogo `marca_activo`, `marca_acceso_rapido`, `marca_sistema_comisiones`, `modelo_acceso_rapido`, `modelo_orden_acceso_rapido`. Reglas: **omite duplicados por VIN o matrícula**; resuelve cliente por **DNI** y, si no, por **nombre** (completa DNI/fecha de nacimiento si faltan); crea marca/modelo/tipo/estado si no existen; registra un bloque en el log. [V-código]

### 9.5 `/dashboard/expedientes/nuevo` — Nuevo expediente [V-código: `NuevoExpedienteForm`]

Secciones y campos (en este orden):
- **Datos del Cliente**: 🔍 *Buscar Cliente Existente (DNI o Nombre)* (autocompletado; si se elige uno, se rellenan y bloquean los datos), DNI / NIE, **Nombre Completo \***, Fecha de Nacimiento, Tienda, correos y teléfonos múltiples (con tipo, por defecto “Principal”). Si el DNI ya existe → modal **“⚠️ Cliente Ya Registrado”** (usar el existente o continuar).
- **Detalles de la Venta y Vehículo**: Marca, Modelo (filtrado por marca), Tipo de Venta, Estado de Vehículo (preseleccionado el predeterminado), Matrícula, Número de Bastidor (VIN), Fecha Expediente (hoy por defecto), Fecha Afectación, Fecha RCI (Financiación), Fecha Matriculación, Fecha Facturación (VO), Fecha Entrega.
- **Tienda**: lista de tiendas del usuario (todas para admin/director/sin tiendas); si solo tiene una, preseleccionada; se puede fijar una **tienda predeterminada** (`/api/usuario/tienda-predeterminada`).
- **Regla de campos**: **ningún campo del expediente es obligatorio**; en clientes **solo el nombre** lo es. [V-Prompts]
- Al guardar: transacción (cliente → correos/teléfonos → expediente). Pantalla de éxito **“¡Expediente Creado!”**. En el nuevo motor, el expediente nace con los puntos por defecto del plan (se calculan al guardar, no se piden al usuario). [D]

### 9.6 `/dashboard/expedientes/editar/[id]` — Editar expediente [V-código: `EditarExpedienteForm`]

Misma estructura que “Nuevo” más:
- 🔍 **Asignar Otro Cliente Existente (DNI o Nombre)**; los datos del cliente son **editables** con su **propio guardado** (“Guardar cliente”) que actualiza el cliente en la base de datos de clientes. [V-Prompts]
- **Vendedor Asignado** (selector de usuarios no invitados).
- **Fechas**: Expediente, Afectación, RCI, Matriculación, Facturación (VO), **Expediente cobrado en otra fecha** (casilla) + **Fecha de Cobrado**, Entrega.
- Sección **“Comisionamiento del Expediente”**:
  - **Puntos del coche** (en el original “VAL. Obj. / Multiplicador”) y **Promoción de puntos** (en el original “Cupo Ventas Multiplicadas Req. (Vendedor)”).
  - **Comisión Coche Manual (€)** y **Comisión Financiación Manual (€)** (vacío = autocalcular).
  - **Bonificaciones / Penalizaciones Extra** (lista de conceptos con título, importe ±, descripción, evento) con “Total Extra: € …”.
  - **“Desglose Estimado de Comisión”**: llamada al simulador del motor; muestra cada concepto y su importe, el tramo, los puntos del mes, y **avisos** (“Sin tarifa para el modelo X en el tramo Y”).
  - **“✅ Estado de Cobro por Concepto”**: casillas y cantidades cobradas: VN Base, Usado, Financiación, Pref/Box, Bonus.
- **Botón Eliminar** con modal de confirmación; al abandonar con cambios, modal **“⚠️ Cambios sin guardar”**.
- En meses **cerrados**, el guardado avisa del importe que cambiará (sección 12.9).

### 9.7 `/dashboard/clientes` — Clientes [V-código: `ClientesList.tsx`]

- Tabla ordenable: **Nombre · DNI / NIE · F. Nacimiento · Correos · Teléfonos · Tienda · Ventas · Acciones**. La columna **Ventas** muestra el **número de expedientes** del cliente como **botón**; al pulsarlo se abre un modal **“Expedientes de {cliente}”** con las columnas Código, Vehículo, Método de Venta, Estado Vehículo, Matrícula, Fecha y Acciones (editar → va al expediente). [V-Prompts]
- Botones: ➕ Crear cliente, **📥 Importar CSV**, **🔄 Restaurar Backup (JSON)**, exportar, eliminar seleccionados (**“⚠️ Confirmar Eliminación Masiva”**) y eliminar uno (**“⚠️ Confirmar Eliminación”**).
- Formulario de cliente: DNI / NIE, **Nombre Completo \***, Fecha de Nacimiento, Tienda de Registro, Correos Electrónicos (varios), Teléfonos de Contacto (varios). **Solo el nombre es obligatorio.**
- Al crear con un DNI existente: modal **“⚠️ Cliente Ya Registrado”** (`/api/clientes/verificar-existencia`).
- No se puede borrar un cliente con expedientes asociados sin avisar [I: el texto exacto del original no se ha leído].

### 9.8 `/dashboard/buscar` y buscador global [V-código + V-Prompts]

- **Buscador global** en la cabecera de todas las pantallas: placeholder “Buscar expediente, matrícula, DNI...”. Desde **2 caracteres** muestra una **lista desplegable de sugerencias mientras se escribe**, clicables. (`/api/buscar`: busca clientes por nombre y DNI con `ilike %q%` y devuelve **máximo 5** sugerencias.)
- **Página de resultados** (`/dashboard/buscar?q=`): “Resultados de búsqueda” con tabla de clientes (Nombre, DNI / NIE, Contacto, Historial) **y los expedientes encontrados con las mismas columnas que la pestaña Expedientes, con acceso a editar** (petición del propietario: “no me deja acceder a ellos, ni ver detalles”). 

### 9.9 `/dashboard/comisiones` — Planes de comisionamiento [V-código: `ComisionesManager.tsx` 6.142 líneas]

Pantalla **“Planes de Comisionamiento”** (lista de planes ordenada por fecha de inicio descendente) y debajo el panel **“🔍 Control y Verificación de Cobros de Comisiones”** (cotejo: lista “📋 Expedientes a Verificar (N)” con casillas “cobrado” por concepto, totales validado/pendiente y ratio, filtro todos/pendientes/cobrados). Un plan se abre en un editor con **9 pestañas**:

| Pestaña (clave interna) | Título en pantalla | Contenido |
|---|---|---|
| `resumen` | **Resumen del Plan** | Nombre, fechas inicio/fin, estado, penalización global (importe/título/descripción), rango de tramos, puntos por pedido. Aviso **“⚠️ Plan ya existente”** si el rango de fechas se solapa |
| `objetivo` | **Cálculo del Objetivo X** | Objetivo por vendedor + arrastre; puntos por defecto por modelo/marca; **tasa de intervención objetiva por marca**; **promociones de puntos** |
| `modelos` | **Tarifas de Modelos VN por Tramo** | Tabla por marca (p. ej. “MODELOS DE RENAULT”) con **dos filas por modelo** (Tasa ≥ objetivo / Tasa < objetivo) y una columna por tramo X−4…X+3; orden, copiar/pegar y “aplicar a los de abajo” |
| `usados` | **Tarifas de Vehículos Usados (BB / KM0 / etc.)** y **Patrones de Comisionamiento Progresivos VO** | Tarifa por subtipo (primera unidad, resto, mínimo) y escalas progresivas por unidad |
| `reglas` | **Financiación / Reglas del Plan** | Incentivos por marca y tipo de financiación; reglas Preference/BOX3; reglas especiales |
| `bonus` | **Bonus de Campaña Dinámicos** | Bonus con evento, filtros y efecto |
| `penalizaciones` | **⚠️ Penalización Única Global** y **Reglas de Penalización Dinámicas** | Penalización fija del plan y reglas que restan |
| `liquidacion` | **Liquidación Consolidada** | Botón **Calcular/Recalcular Liquidación**, estado, desglose por expediente (modal “Desglose de Conceptos: Expediente #…”), versiones, previsión de nómina, libro de puntos y **comparar con liquidación antigua** |
| `notas` | **📝 Notas y Comisiones Pendientes** | Notas del plan, comisiones pendientes y “pendiente de cobro” |

Otras ventanas: **“Aplicar Cupo a Expedientes en Lote”** (nuevo motor: asignar promoción por mes/tipo de fecha), **“✏️ Editar Expediente de Comisión: …”**, **“Editar Expediente #…”** (edición rápida de un expediente desde la liquidación) y **“⚠️ Cambios sin guardar”**.

### 9.10 `/dashboard/informes` — Informes [V-código: `InformesDashboard.tsx` 2.185 líneas]

Título **“📊 Detalle y Análisis Estadístico”** con panel **“🔍 Filtros de Consulta”** (periodo, vendedor, marca…). Secciones: **Informe de Rendimiento de Ventas y Comisiones**, **Distribución por Marca**, **Distribución por Forma de Pago**, **📈 Rendimiento Económico por Comercial**, **📋 Vehículos Matriculados en el Periodo**, **💼 Pedidos en Cartera (Pendientes de Matriculación)** y modal **“🔍 Detalle: …”**. Las cifras económicas salen del **mismo motor** que las liquidaciones (no duplicar lógica). [V-código + D]

### 9.11 `/dashboard/log-importacion` — Log de Importaciones [V-código]

Lista de **bloques de importación** (fecha, nombre de archivo, tipo CSV/Excel, usuario, creados / modificados / omitidos) y, al abrir uno, sus **registros** (acción creado/modificado/omitido, cliente, matrícula, bastidor, cambios en JSON). Acciones: **“✏️ Corregir Datos de Expediente”** (modal con *Datos del Cliente* y *Datos del Vehículo y Expediente*) y borrar un bloque (`DELETE /api/importaciones`).

### 9.12 `/dashboard/perfil` — Mis datos [V-código: `PerfilForm`]

Secciones **Datos Personales** (Nombre completo, Rol en el Sistema (solo lectura), Fecha de Registro (solo lectura)), **Información de Contacto** (correos y teléfonos) y **Tiendas Asociadas** (selección de las tiendas en las que trabaja). Nuevo [D]: bloque **Seguridad** con *Cambiar contraseña*, *Regenerar códigos de recuperación*, *Sesiones activas (cerrar todas)*.

### 9.13 `/dashboard/admin` — Configuración (solo administrador) [V-código]

Si no es admin: tarjeta **“Acceso Denegado”** (“Esta área es exclusiva para usuarios con rol de Administrador. Tu rol actual es …”). Si lo es:

1. **Gestión de usuarios** (`AdminUsuariosList`): tabla ordenable **Usuario · Contacto · Fecha Ingreso · Estado · Rol · Acciones**; alta/edición; suspender (oculto para administradores); eliminar con modal **“⚠️ Confirmar Eliminación de Usuario”** (escribir `ELIMINAR`). Nuevo [D]: contraseña temporal, resetear 2FA, cerrar sesiones.
2. **Catálogos** (`AdminCatalogosForm`, 2.376 líneas) con pestañas internas: `marcas`, `modelos`, `tiendas`, `pagos`, `estados`, `expedientes`, `bbdd`:
   - **Gestión de Marcas**: nombre, activo, **Acceso rápido**, **sistema de comisiones**. **No se puede eliminar una marca o modelo que tenga expedientes**. Crear/editar/eliminar.
   - **Gestión de Modelos**: asociados a una marca; **Acceso rápido** y **orden de acceso rápido**. Sección “Marcas y Modelos” (no hay una sección aparte de “Administración de Catálogos Maestros”: se eliminó). [V-Prompts]
   - **Gestión de Tiendas Físicas**: nombre y ciudad.
   - **Tipos de Venta (Pagos)**: nombre, **color** (el que se usa en tablas y en los botones de acceso rápido), **orden**. Nuevo [D]: **categoría** (Contado/Crédito/Preference/Renting).
   - **Estados del Vehículo**: nombre y **predeterminado** (booleano; el que usan los accesos rápidos). Nuevo [D]: **clase** VN/VO y **subtipo VO**.
   - **⚙️ Configuración de Expedientes**: ajustes como `mostrar_botones_csv` [V-código: único ajuste localizado].
   - **🗄️ Herramientas de Mantenimiento y Limpieza de BBDD** (`bbdd`): analizar y limpiar **registros huérfanos** (líneas de liquidación sin expediente, correos y teléfonos de clientes huérfanos, relaciones tienda-usuario huérfanas, registros de importación huérfanos) [V-código: `/api/admin/db-cleanup`]; **exportar base de datos a JSON (copia de seguridad)** e **importar desde JSON (restauración)** [V-código: `/api/admin/backup`]. Nuevo [D]: **Copias de seguridad** completas (sección 13).
   - **⚙️ Opciones de Interfaz y Seguridad**: título localizado en el código; **[I]** contenido no leído. Reutilizarlo para los ajustes de seguridad nuevos (sección 6).
3. Todos los botones de la página **centrados en pantalla** (petición del propietario). [V-Prompts]


---

## 10. Reglas de negocio de datos (expedientes, clientes, catálogos)

### 10.1 Expedientes [V-código: `/api/expedientes`]

1. **Crear** (`POST`): acepta `{cliente, expediente}`.
   - Si viene `cliente.nombre`: si trae `id` → actualiza sus datos básicos; si no, busca por **DNI** (si lo hay) y reutiliza el existente; si no existe, **crea** cliente con `cliente_id = UUID`, y sus correos/teléfonos (tipo por defecto “Principal”).
   - **Tienda**: la indicada; si no, y el usuario tiene **exactamente una** tienda en `usuarios_tiendas`, esa.
   - **Fecha de expediente**: la indicada o **hoy**.
   - **Estado del vehículo**: el indicado; si no, y `estado_nombre = "usado"`, el estado llamado “usado”; si no, el estado marcado **predeterminado**.
   - **Vendedor**: `id_usuario` indicado o el usuario actual.
   - **Puntos y cupo por defecto**: tomados del **plan activo** de la fecha del expediente (en el motor nuevo: puntos por defecto del modelo/marca del plan; ver 12.7).
   - Todo en **una transacción**.
2. **Editar** (`PUT`): actualiza solo los campos recibidos. Un `""` en una fecha equivale a **borrarla (NULL)**.
3. **Edición masiva** (`PUT` con `isBulkEdit` e `ids`): modelo, tipo de venta, vendedor y fechas (expediente, afectación, RCI, matriculación, entrega, facturación); campos vacíos no se tocan; si no hay ningún campo → error 400 “No se seleccionaron datos para modificar”.
4. **Cupo/promoción en lote** (`PUT` con `isBulk`, `mes`, `año`, `tipoFecha`): asigna el valor a **todos los expedientes** cuya fecha del tipo elegido cae en ese mes. **Debe limitarse a los expedientes del vendedor seleccionado/visibles** (el original no filtra y afecta a todos). [D]
5. **Eliminar** (`DELETE`): uno por `?id=` o varios por `ids` en el cuerpo. Siempre con confirmación en la interfaz.
6. **Duplicados** (importación CSV): se omiten expedientes cuyo **VIN o matrícula** ya existen. La matrícula se limpia quitando lo que siga a un “(”.

### 10.2 Clientes [V-código + V-Prompts]

- `cliente_id` es un UUID interno único; la clave que ve el negocio es el **DNI/NIE** (no obligatorio) y el **nombre** (obligatorio).
- Un cliente puede tener **varios expedientes**; la lista muestra su recuento y un modal con ellos.
- Editar los datos del cliente **desde el expediente** los guarda en la base de datos de clientes (guardado propio).
- Importar CSV de clientes: `/api/clientes/import`; verificación de existencia por DNI: `/api/clientes/verificar-existencia`.
- Correos/teléfonos: tablas hijas con `tipo` libre (por defecto “Principal”).

### 10.3 Catálogos [V-código + V-Prompts]

- **Marcas**: `activo`, `acceso_rapido`, `sistema_comisiones`. **No se puede eliminar** una marca (ni un modelo) que tenga expedientes asociados, para no perder la relación. Un modelo pertenece a **una marca**.
- **Modelos**: `acceso_rapido`, `orden_acceso_rapido`.
- **Tipos de venta**: `nombre_tipo_venta`, `color` (hex), `orden`. El color se usa en **tabla de expedientes**, **últimos expedientes** y **botones de acceso rápido**.
- **Estados de vehículo**: `predeterminado` (boolean). [I] Solo puede haber **uno** predeterminado a la vez.
- **Tiendas**: `nombre`, `ciudad`. Relación N‑N con usuarios (`usuarios_tiendas`). Cada usuario puede tener una **tienda predeterminada**.

### 10.4 Formatos y validaciones comunes

- Fechas: `DD/MM/AAAA` en pantalla; ISO en BD y API. La importación acepta `DD/MM/AAAA`, `DD-MM-AAAA`, `AAAA-MM-DD`, número de serie de Excel (base 25569 días) y fecha ISO completa. [V-código: `parseExcelDate`]
- Teléfonos: solo dígitos y `+` al importar; sin `.0` final.
- Nombres de marcas/modelos/estados se comparan **sin distinguir mayúsculas** (`ilike`).
- **Ningún campo de expediente es obligatorio; en clientes solo el nombre.** [V-Prompts]

---

## 11. API (Route Handlers)

Todas las rutas devuelven JSON; los errores usan `{ "message": "…" }` con el código HTTP adecuado (400 datos, 401 sin sesión, 403 sin permiso, 404, 409 conflicto, 429 límite, 500). [V-código: el original ya usa este formato]

### 11.1 Rutas originales (se conservan con el **mismo path y contrato**)
Ver **Anexo D** con el permiso comprobado en el original. Cambios: `auth()` de Clerk → `requireSession()`; permisos según la sección 7; consultas con `pg`.

### 11.2 Rutas NUEVAS [D]

| Método y ruta | Permiso | Función |
|---|---|---|
| `POST /api/auth/login` | pública (con límite de intentos) | Valida email+contraseña; crea sesión parcial |
| `POST /api/auth/verificar-2fa` | sesión parcial | Valida código TOTP o de recuperación |
| `POST /api/auth/logout` | sesión | Revoca la sesión |
| `GET/POST /api/auth/2fa/preparar` y `POST /api/auth/2fa/confirmar` | sesión parcial/completa | Alta del 2FA: QR + confirmación + códigos de recuperación |
| `POST /api/auth/cambiar-password` | sesión | Cambia contraseña (pide la actual) y revoca otras sesiones |
| `GET /api/auth/sesiones`, `DELETE /api/auth/sesiones/{id}` | sesión | Listar/cerrar sesiones propias |
| `POST /api/admin/usuarios/{id}/reset-2fa`, `…/reset-password`, `…/cerrar-sesiones` | administrador | Acciones de emergencia |
| `GET /api/admin/copias` | administrador | Lista de copias (BD + archivos) |
| `POST /api/admin/copias` | administrador | **Crear copia ahora** (`pg_dump -Fc`) |
| `GET /api/admin/copias/{id}/descargar` | administrador (+ reautenticación reciente) | Descarga el `.dump` |
| `DELETE /api/admin/copias/{id}` | administrador | Borra una copia |
| `POST /api/admin/copias/restaurar` | administrador + contraseña + código 2FA | Restaura desde copia local o fichero subido |
| `GET /api/admin/drive/estado`, `GET /api/admin/drive/conectar`, `GET /api/admin/drive/callback`, `POST /api/admin/drive/desconectar`, `POST /api/admin/copias/{id}/subir-drive` | administrador | Integración con Google Drive (sección 13.4) |
| `GET /api/salud` | pública | Comprobación de vida (`{ok:true}`) para Docker y monitorización; no revela datos |
| `GET/POST/PUT /api/comisiones/promociones`, `/api/comisiones/libro-puntos`, `/api/comisiones/pendientes`, `/api/comisiones/prevision-nomina`, `/api/comisiones/versiones`, `/api/comisiones/comparar-antigua` | según 7.2 | Soporte del motor nuevo (sección 12) |

### 11.3 Reglas de rendimiento de la API [D]

- Los endpoints de listado no devuelven más de lo que la pantalla muestra; las páginas con muchas filas usan **paginación en servidor** si el volumen supera ~5.000 expedientes **sin cambiar la interfaz** (el original pagina en cliente). 
- Cálculos de comisiones: **por vendedor y mes**, no “todos los expedientes de la base de datos”.


---

## 12. Sistema de comisiones, puntos y cobros (motor nuevo)

> **Fuente normativa:** `SISTEMA-DE-COMISIONES.md` (Anexo A, íntegro). Esta sección lo convierte en un **diseño ejecutable**: tipos, algoritmo paso a paso, casos límite, persistencia y pruebas. Si hay contradicción, **manda el Anexo A** (reglas ✅ confirmadas por el propietario). El propietario delegó el diseño del motor en el autor de este informe (R11) siempre que cumpla esas reglas y “funcione sin problemas”.

### 12.1 Decisiones de diseño del motor [D]

| Decisión | Razón |
|---|---|
| **Un único módulo puro y determinista** `src/lib/comisiones/` (sin BD, sin red, sin fecha del sistema, sin aleatoriedad). Entrada = datos; salida = resultado. | El original tenía **dos copias** de la lógica (simulador 850 líneas y liquidación 1.029) que se desviaban entre sí [V-código]. Un solo motor da el mismo resultado en el simulador, la liquidación, los informes y el desglose del expediente. |
| **Aritmética entera**: puntos en **centésimas**, dinero en **céntimos**. Prohibido `number` con decimales en el cálculo. | Evita errores de redondeo (el original usaba `double` y fallaba con decimales) [V-código][V-reglas Fase 0]. |
| El cálculo se ejecuta **en el servidor (Node)** para guardar y **también en el navegador** para el simulador en vivo (mismo código importado por ambos). | En la Pi no existe el límite de 10 ms de CPU que obligaba a calcular en el navegador en la V2 [V-reglas]. |
| El motor trabaja **por vendedor y mes** (`calcularMes`). | El original recalculaba con todos los expedientes de la base de datos en cada llamada [V-código]. |
| **Idempotente**: calcular dos veces con los mismos datos da exactamente el mismo resultado y no duplica nada. | Necesario para recalcular tras cada cambio y para la migración repetible. |
| **Nunca lanza excepción por un dato malo**: un importe no numérico o una tarifa ausente produce **línea de aviso + 0 €**. | [V-reglas 7.6] |
| Cada importe de salida lleva su **concepto de origen** (trazabilidad). | [V-reglas 7.6] |

### 12.2 Tipos de datos (contrato del módulo) [D]

```ts
type Centesimas = number;   // entero: 150 = 1,50 puntos
type Centimos   = number;   // entero: 15000 = 150,00 €
type Mes        = string;   // 'AAAA-MM'
type Fecha      = string;   // 'AAAA-MM-DD'

type Clase = 'VN' | 'VO';
type EventoRegla = 'pedido'|'afectacion'|'matriculacion'|'cobro'|'credito'|'preference';
type CategoriaVenta = 'CONTADO'|'CREDITO'|'PREFERENCE'|'RENTING';

interface ExpedienteMotor {
  id: number; idVendedor: number;
  clase: Clase; subtipoVO: string | null;            // de estado_vehiculo.clase / subtipo_vo
  idMarca: number | null; idModelo: number | null;
  categoriaVenta: CategoriaVenta | null;             // de tipo_de_venta.categoria
  fechaExpediente: Fecha | null; fechaAfectacion: Fecha | null; fechaRci: Fecha | null;
  fechaMatriculacion: Fecha | null; fechaCobro: Fecha | null;   // fechaCobro = fecha_cobrado
  cobradoOtraFecha: boolean;
  puntos: Centesimas | null;                         // null = usar por defecto; 0 es válido
  idPromocion: number | null;
  comisionCocheManual: Centimos | null; comisionFinanciacionManual: Centimos | null;
  conceptosEspeciales: { titulo:string; importe:Centimos; descripcion?:string;
                         evento?: 'afectacion'|'matriculacion'|'cobro'; cobrado?:boolean }[];
}

interface PlanMotor { /* cabecera, tramoMin, tramoMax, puntosPorPedido, penalizacion,
   objetivoVendedor{base,arrastre}, puntosPorDefectoModelo/Marca, promociones[],
   tarifasVN[], tarifasUsadosPorSubtipo[], patronesVO[], financiacionPorMarcaTipo[],
   reglasPreference[], reglasYBonus[], tasaIntervencionPorMarca[] */ }

interface ResultadoMes {
  mes: Mes; idVendedor: number; idPlan: number;
  objetivoX: Centesimas; puntosMes: Centesimas; tramo: number;      // tramo final ya limitado
  tasaIntervencion: { idMarca:number; porcentaje:number|null; unidades:number; cumplida:boolean }[];
  lineas: LineaExpediente[];      // por expediente, con 'conceptos[]' (concepto, importe, puntos, evento, aviso?)
  bruto: Centimos; penalizacion: Centimos; neto: Centimos; mesPago: Mes;
  apuntesPuntos: ApuntePuntos[];  // lo que debería haber en el libro de puntos para este vendedor y mes
  avisos: string[];
}
```

### 12.3 Pipeline de cálculo de un mes (algoritmo exacto)

`calcularMes(plan, vendedor, mes, expedientes) → ResultadoMes`

**Paso 0 — Plan aplicable.** Plan cuyo rango `[fecha_inicio, fecha_fin]` contiene algún día del mes. Si hay varios, el de estado `activo` y mayor `fecha_inicio`; si ninguno → resultado vacío con aviso “No hay plan para {mes}”. Si el vendedor no tiene fila en `commission_plan_vendedores` → objetivo X = 0 y aviso. [D]

**Paso 1 — Clasificar cada expediente** del vendedor:
- `clase` y `subtipoVO` salen del **estado del vehículo** (`estado_vehiculo.clase/subtipo_vo`); `categoriaVenta` del **tipo de venta**. ✅ Usado, KM0, Demo y Buyback son **VO**. [V-reglas Fase 2]
- **Evento principal (mes de cómputo del coche)** [V-reglas 3.1]:
  - VN: `fechaCobro` si `cobradoOtraFecha = true` (si falta la fecha → **no cuenta**), si no `fechaMatriculacion`.
  - VO: `fechaCobro`.
  - Si falta la fecha necesaria → el coche **no cuenta en ningún mes** (se registra aviso “falta fecha …”).
- `mesComputo = mes(eventoPrincipal)`.

**Paso 2 — Conjunto de expedientes que cuentan en el mes M:** `cuentan = { e : mesComputo(e) = M }`.

**Paso 3 — Puntos de cada coche** [V-reglas 4.1]:
1. `p = e.puntos` si no es `null` (**0 es válido**).
2. Si `null`: puntos por defecto del **modelo** en el plan; si no hay, de la **marca**; si no, **100** (1,00).
3. Si `e.idPromocion ≠ null`: `n` = nº de coches de **cualquier modelo** de esa promoción que **cuentan en M** (contados por su evento principal). Si `n ≥ minimo_unidades` → `p = puntos_especiales`; si no → `p = puntos_si_no_cumple` (por defecto 100). Los puntos propios del expediente **no** se aplican si pertenece a una promoción [I: el Anexo A solo dice “o puntos propios, o por defecto, o promoción”; si un expediente tiene `puntos` propios **y** promoción, prevalece la **promoción**; confirmar][P].
4. Cada coche que cuenta aporta **1 unidad comisionable** (aunque valga 2 puntos). [V-reglas 4.2]

**Paso 4 — Puntos de pedidos** [V-reglas 4.3, 3.4]: por cada expediente con `mes(fechaExpediente) = M` **cuyo mes de cómputo ≠ M** (o que no cuenta aún) → suma `plan.puntosPorPedido`. Si pedido y cómputo caen en el mismo mes → **no** se suma el de pedido (cuenta solo el del coche).

**Paso 5 — Puntos de reglas y bonus** [V-reglas 4.4]: los que tengan efecto “afecta al objetivo” y pasen sus filtros (paso 9) suman **sus puntos en el mes de su evento**.

**Paso 6 — Puntos del mes y objetivo.**
```
puntosMes = Σ puntos(coches que cuentan) + Σ puntos de pedido + Σ puntos de reglas + ajustes manuales
objetivoX = objetivo_base + arrastre          // centésimas, puede ser no entero en puntos
diferencia = puntosMes − objetivoX             // centésimas
tramo = floorDiv(diferencia, 100)              // división entera hacia −∞ (¡también para negativos!)
tramo = clamp(tramo, plan.tramoMin, plan.tramoMax)
```
`floorDiv(-50,100) = -1` (no `0`). Casos de prueba en 12.16. ✅ **Siempre redondeo hacia abajo.** [V-reglas 5.1]

**Paso 7 — Tasa de intervención por marca** [V-reglas Fase 6; V-código: se calcula con los expedientes **del vendedor**]:
```
Para cada marca B con algún VN en M o con fecha RCI en M:
  denominador = nº de VN de la marca B cuyo mesComputo = M            (los VO NO cuentan)
  numerador   = nº de VN de la marca B con mes(fechaRci) = M y categoriaVenta ∈ {CREDITO, PREFERENCE, RENTING}
  si denominador = 0           → cumplida = true      ✅ (sin VN de esa marca, se considera cumplida)
  si tipo_tasa = 'porcentaje'  → cumplida = (numerador*100 / denominador) >= objetivo   (comparar en enteros: numerador*100 >= objetivo*denominador)
  si tipo_tasa = 'unidades'    → cumplida = (numerador >= objetivo)
  si el expediente no tiene marca → cumplida = false (como el original)
```
Numerador y denominador usan **fechas distintas** (RCI y cómputo): puede ser **no coincidente**; es el comportamiento antiguo conservado. [V-reglas Fase 6 ❓ Anexo E-6]

**Paso 8 — Importes: seis conceptos** (se evalúan **en el mes de su propio evento**; ningún concepto se genera dos veces):

| # | Concepto | Mes en que se genera | Algoritmo |
|---|---|---|---|
| 1 | **Comisión del coche VN** | `mesComputo` | Si `clase=VN` y cuenta en M: **(a)** vendedor `tipo_vendedor='VO'` → 0 (aviso “omitida: vendedor de VO”); **(b)** `comisionCocheManual ≠ null` → ese importe; **(c)** tarifa del plan para (modelo, `tramo`, `tasaCumplida(marca)`) → `importes[tramo]`; **(d)** sin tarifa → 0 + aviso “Sin tarifa para el modelo X en el tramo Y” |
| 2 | **Comisión VO** | mes de `fechaCobro` | Ver 12.4 |
| 3 | **Incentivo de financiación** | mes de `fechaRci` | Si `comisionFinanciacionManual ≠ null` → ese importe y se **ignoran** 3, 4 y las reglas de financiación; si no y `categoriaVenta ∈ {CREDITO, PREFERENCE, RENTING}` → importe de `commission_finance_rates(marca, tipo)`; **CONTADO no genera** (✅ confirmar con la empresa [P: Anexo E-2]) |
| 4 | **Preference / BOX3** | mes de `fechaRci` | Si `categoriaVenta = PREFERENCE` (y no hay importe manual): **regla más específica**: (marca+modelo) > (solo marca) > (general); se suma **solo esa** |
| 5 | **Reglas y bonus** | según su evento | Ver 12.5 |
| 6 | **Conceptos especiales del expediente** | mes de su `evento` (por defecto el evento principal del coche) | Cada concepto con su importe (±). Si el expediente aún no tiene esa fecha → **pendiente** (no se genera) |

**Paso 9 — Totales** [V-reglas Fase 8]:
```
bruto        = Σ(1 a 6)
penalizacion = plan.penalizacion_importe  (+ las reglas de penalización dinámicas, ya incluidas en 5 con signo negativo)
neto         = max(0, bruto − penalizacion_global)
mesPago      = mes(M) + 1
```
✅ Lo generado en el mes M se cobra en la **nómina de fin del mes M+1**. La suma de neto **nunca es negativa**.

### 12.4 Comisión VO (detalle) [V-reglas 7.2]

Entrada: expedientes **VO** con `mes(fechaCobro) = M`, ordenados por **`fechaCobro` ascendente y después `id` ascendente** (orden estable y determinista) [P: confirmar el criterio con una liquidación real, Anexo E-7].

**A) Vendedor de tipo VN que vende VO** (y patrón sin “aplica a VN”): **contador independiente por subtipo**:
1. Para cada subtipo `S` agrupa sus unidades del mes. `total = nº de unidades`.
2. Si `total ≥ min_aplicar` (por defecto **0 = sin mínimo**) → se pagan **todas**; si no, **ninguna**.
3. Unidad 1 → `importe_primera`; unidades 2…n → `importe_resto`.
4. Si no hay tarifa para `S` → 0 € (sin tarifa de respaldo) + aviso.
5. `comisionCocheManual ≠ null` sustituye a todo lo anterior para esa unidad.

**B) Vendedor de tipo VO** (o patrón con `aplica_a_vn`): escala progresiva `tiers`:
1. Unidad *k* cobra `tiers[k]`; si *k* supera el último escalón, **se repite el último**.
2. **Sin escala definida → 15000 céntimos (150 €) por unidad.**

Los **puntos** de un VO son los de su expediente/promoción (no los del escalón). [V-reglas 7.2]

### 12.5 Reglas y bonus (detalle) [V-reglas 1.7, 3.3, 7.4]

Para **cada** regla/bonus activo y **cada** expediente del vendedor, en este orden (si un paso falla, no se aplica):
1. **Evento y fecha del evento** (cada evento mira **solo su fecha**):

| Evento | Entra en M si… | Fecha usada para la validez |
|---|---|---|
| `pedido` | `mes(fechaExpediente) = M` | `fechaExpediente` |
| `afectacion` | `mes(fechaAfectacion) = M` | `fechaAfectacion` |
| `matriculacion` | `mesComputo = M` (en VO equivale a **cobro**; con casilla “cobrado en otra fecha”, a cobro) | evento principal |
| `cobro` | `mes(fechaCobro) = M` | `fechaCobro` |
| `credito` | `mes(fechaRci) = M` y categoría CREDITO o RENTING | `fechaRci` |
| `preference` | `mes(fechaRci) = M` y categoría PREFERENCE | `fechaRci` |

2. **Tipo de vehículo**: `nuevo` = solo VN · `usado` = solo VO · `cualquiera`.
3. **Fechas de validez** de la regla (`fecha_inicio`..`fecha_fin`) comparadas con la fecha del evento.
4. **Marca y modelo**, si la regla los indica.
5. **Tasa de intervención**: `cumplida` / `no_cumplida` / `indiferente` (con la tasa de la **marca del expediente**; si no hay marca y la regla exige tasa → no aplica).
6. **Ligar a crédito** (solo reglas Preference): se aplica solo si **también** se aplicaría una regla de crédito para ese expediente.
7. **Efecto**: suma `importe` (**resta** si es penalización) y/o suma `puntos` al objetivo (paso 5 del pipeline).

> **Diferencia con el original [V-código]:** el original aplica **todas** las reglas Preference que coinciden (suma acumulada) y deja que un bonus de `pedido` también se active por la **afectación**. En el motor nuevo: Preference = **solo la más específica** y cada evento mira **solo su fecha**. [V-reglas ✅]

### 12.6 Simulador de un expediente (“Desglose Estimado de Comisión”) [D]
Es `calcularMes` aplicado al mes de cómputo del expediente con **una copia en memoria** del expediente (tal como está en el formulario, aunque no esté guardado). Devuelve el desglose de **ese expediente** (no cambia nada en la BD). Muestra también el tramo y los puntos del mes del vendedor “con” el cambio, y los avisos. Si el mes está **cerrado**, muestra el aviso de impacto (12.9).

### 12.7 Valores por defecto al crear un expediente [D]
Al crear: `puntos = NULL` (el motor usa los por defecto del plan; no se copian al expediente), `idPromocion = NULL`. El campo del formulario muestra el valor efectivo calculado como texto de ayuda (“por defecto: 1,00”).

### 12.8 Estados de la liquidación y reglas de persistencia [V-reglas Fase 9]

`borrador` → `calculada` → `revisada` → `cerrada`

- **Calcular/Recalcular** (botón en la pestaña *Liquidación*): ejecuta `calcularMes` para el vendedor y mes, y guarda **cabecera + líneas + conceptos** dentro de **una transacción** `SET LOCAL app.recalculo = 'on'`.
- Una liquidación en `borrador`/`calculada` se **sustituye**; en `revisada`/`cerrada` se **versiona** (12.9).
- **Cerrar** (solo administrador): pasa a `cerrada`; ya no se edita directamente.
- **Importada de la app antigua**: se crea como `cerrada` con `origen='importada_antigua'`, **no se recalcula sola**. [V-reglas 9.5]

### 12.9 Corregir un mes cerrado: se actualiza todo, con historial [V-reglas 9.3, 9.4, Ejemplo 8]

1. Al **crear, editar o borrar** un expediente (o cambiar reglas del plan), el sistema calcula el **conjunto de meses afectados**: los meses de `fechaExpediente`, `fechaAfectacion`, `fechaRci` y `mesComputo` **antes y después** del cambio, de **cada vendedor implicado** (si se reasigna, **los dos**). [D: superconjunto de “hasta 4” del Anexo A, porque RCI y afectación también generan importes]
2. Se recalcula cada (vendedor, mes) afectado **incluidos los cerrados**.
3. Antes de sustituir una liquidación `revisada/cerrada`: se inserta en `commission_liquidation_versions` un `snapshot` completo con `motivo`, `neto_anterior`, `neto_nuevo`.
4. La interfaz **avisa antes de guardar** (“Este cambio modifica el mes cerrado Julio 2026: +150,00 €”) y muestra la diferencia “antes 1.600,00 € → ahora 1.750,00 €”.
5. **Protecciones de BD** (disparadores `BEFORE UPDATE/DELETE`): las tablas `commission_liquidations`, `…_lines`, `…_line_items`, `commission_liquidation_versions` y `libro_puntos` **rechazan** modificaciones salvo que la transacción tenga `app.recalculo='on'` o `app.restauracion='on'`; las **versiones** y el **libro de puntos** rechazan `UPDATE/DELETE` **siempre**. Las claves foráneas impiden borrar una promoción en uso o un plan con liquidaciones.

### 12.10 Libro de puntos y sincronización [V-reglas Fase 10]
- Tabla `libro_puntos`: **solo inserción**.
- **Sincronizar (vendedor, mes)**: calcular `apuntesPuntos` deseados con el motor; leer el **neto actual** del libro por clave `(id_expediente, evento, regla)`; insertar un apunte **por la diferencia** (positivo o negativo). Resultado: el libro suma siempre lo que dice el motor, y cada corrección es un apunte negativo visible.
- Se ejecuta automáticamente tras cada cambio que afecte (12.9.1) y al terminar una importación (en lotes, mes a mes).
- **Reasignar** un expediente: se sincronizan y recalculan los dos vendedores. [V-reglas 10.3]

### 12.11 Cotejo, pendientes y previsión de nómina [V-reglas Fase 11, V-código: casillas `comision_*_cobrada`]

- **Cotejo de cobros** (panel “Control y Verificación de Cobros de Comisiones”): por expediente, conceptos (coche, usado, financiación, Preference, bonus, especiales) con **casilla “cobrado”** y cantidades cobradas; totales **validado/cobrado**, **pendiente** y **ratio de validación**; filtro todos/pendientes/cobrados.
- **Comisiones pendientes del plan** (`commission_plan_pending`): se muestran **aparte** y se **suman a la previsión de nómina**.
- **Pendiente de cobro** (`pendientes_cobro`, lo que “me deben”): concepto, importe, fecha, mes de nómina previsto, cobrado sí/no, fecha de cobro, notas; si pasó el mes previsto sin cobrarse → **atrasado**.
- **Previsión de nómina (M+1)**: para cada **mes de pago P**: `neto(liquidación de P−1) + comisiones pendientes + pendiente de cobro previsto para P (no cobrado)`.

### 12.12 Informes y Dashboard
Cualquier cifra económica o de puntos de **Informes**, **Detalle y Resumen Estadístico** y alertas del Dashboard sale del **mismo módulo** (`calcularMes`). Prohibido recalcular por otra vía. [V-reglas: “Un único motor”]

### 12.13 Migración desde copias de la app antigua (v1) [V-reglas Fase 12]

Pantalla de clasificación y conversión **repetible** (no duplica al ejecutarla dos veces). Equivalencias:

| App antigua | App nueva |
|---|---|
| Importes en **euros enteros** | × 100 → **céntimos** |
| `valor_objetivo` (1, 1,5, 2…) | `puntos` en **centésimas** (el **0 se conserva** como 0) |
| `min_coches_multiplicador` (cupo) | **Promoción**: se crea “Importada: N puntos, mínimo M” y se asigna a esos expedientes |
| `cobrado_otra_fecha` + `fecha_cobrado` | Casilla + `fecha_cobrado`; en **VO**, `fecha_cobrado` = `fecha_facturacion` si no estaba marcada |
| Estados “demo”, “KM0”, “usado”, “buyback” | `clase = VO` con su `subtipo_vo` (`DEMO` pasa a VO) |
| Objetivo único por plan | Se copia a **cada vendedor** del plan |
| `min_matriculaciones` | **No se usa**; se conserva como dato histórico |
| Liquidaciones antiguas | **Cerradas**, solo lectura, `origen='importada_antigua'` |
| `conceptos_adicionales` (euros) | `conceptos_especiales` (céntimos) con evento por defecto |
| `notas_adicionales` | Notas del plan + `commission_plan_pending` en céntimos |
| Expedientes sin vendedor válido | Se asignan al **administrador** con aviso, reasignables en la clasificación [D: en la V2 era “Mi vendedor”] |
| Tarifas `rate_x_minus_4 … rate_x_plus_3` (euros) | `importes` jsonb `{"-4":…,"3":…}` en céntimos |

### 12.14 Validación: “Comparar con liquidación antigua” [V-reglas Fase 13]
Calcula un mes con el motor nuevo y lo pone junto a la liquidación antigua importada: total, puntos, tramo y, por expediente, puntos, tramo e importe, con la diferencia. **Las diferencias solo pueden explicarse por**: demo/KM0/usado ahora VO · el 0 ya no se convierte en 1 · VO cuenta solo por cobro · ya no hay mínimo de matriculaciones · promociones agrupadas por promoción · financiación y bonus una sola vez en el mes de su evento. Cualquier otra diferencia es un **fallo a investigar** (del motor nuevo o del antiguo). Pendiente de hacer con las **4 liquidaciones antiguas** del propietario (al final del proyecto, R13).

### 12.15 Dónde se ve cada cosa (mapa de pantallas) [V-reglas Anexo D]

| Qué | Pantalla |
|---|---|
| Puntos, tramo y comisiones estimadas del mes | *Expedientes* → “Detalle y Resumen Estadístico” |
| Objetivo del mes, alertas | *Dashboard* (tarjeta nueva: objetivo X, puntos, tramo del mes) [D] |
| Crear/editar planes | *Comisiones* → Abrir plan |
| Cotejo de cobros | *Comisiones* → panel inferior |
| Liquidación, previsión de nómina, libro de puntos, versiones, comparar con la antigua | *Comisiones* → plan → pestaña *Liquidación* |
| Notas, comisiones pendientes, pendiente de cobro | *Comisiones* → plan → pestaña *Notas* |
| Fechas, puntos, promoción, importes a mano, conceptos especiales | *Expedientes* → formulario |
| Convertir comisiones antiguas, copias | *Configuración* → pestaña *BBDD* |

### 12.16 Casos de prueba obligatorios del motor (tests unitarios) [V-reglas Anexo A + D]

El módulo debe tener **tests automáticos** (Vitest) que reproduzcan **como mínimo** estos casos:

| # | Caso | Resultado esperado |
|---|---|---|
| T1 | Tramo: puntos 13,00 / X 13,00 | tramo 0 (“X”) |
| T2 | 13,50 / 13,00 | tramo 0 |
| T3 | 12,50 / 13,00 | tramo −1 (**floorDiv(−50,100)**) |
| T4 | 13,00 / 12,50 | tramo 0 |
| T5 | 10,00 / 13,00 | tramo −3 |
| T6 | 17,40 / 13,00 | +4 → **limitado a +3** |
| T7 | 5,00 / 13,00 | −8 → **limitado a −4** |
| T8 | Ejemplo 1: 10 VN matriculados + 3 pedidos que se matriculan el mes siguiente (puntos por pedido 1,00) | junio = 13,00 → X; con pedido 0 → X−3; julio vuelve a contar +3 |
| T9 | Pedido y matriculación el mismo mes | cuenta **una vez** (puntos del coche) |
| T10 | Ejemplo 2: promoción 2,00 / mín 2 / sin cumplir 1,00: 2 coches en el mes | 4,00 puntos y **2 comisiones** (una por coche) |
| T11 | Misma promoción, 1 coche en junio y 1 en julio | 1,00 en cada mes |
| T12 | Promoción mín 3 con 3 coches | 6,00 |
| T13 | Coche con `puntos = 0` | aporta 0 (no 1) pero sigue siendo **1 unidad comisionable** |
| T14 | Ejemplo 3: VN matriculado 12/02 y cobrado 20/01 | con casilla → enero; sin casilla → febrero |
| T15 | VN con casilla y **sin** fecha de cobro | no cuenta en ningún mes (aviso) |
| T16 | Ejemplo 4: pedido 20/05, afectación 28/05, RCI 10/06, matriculación 05/07, Preference | mayo: pedido+bonus pedido/afectación; junio: financiación+Preference; julio: coche, puntos y bonus de matriculación |
| T17 | Ejemplo 5: 10 VN, 7 financiados (70 %), objetivo 65 % | cumplida → 250 €; con 6 financiados → 180 €; manual 300 € → 300 €; sin tarifa → 0 € + aviso |
| T18 | Sin VN de una marca en el mes | tasa **cumplida** |
| T19 | Ejemplo 6A: KM0 primera 120/resto 60, 3 unidades | 240 €; mín 2 y 1 unidad → 0 €; KM0 + Usado → cada uno con su “primera” |
| T20 | Ejemplo 6B: escala 150/170/190, 5 unidades | 890 €; sin escala → 750 € |
| T21 | Ejemplo 7: totales | bruto 1.795,00 € · penalización 150,00 € · neto 1.645,00 € |
| T22 | Neto negativo | se limita a 0 |
| T23 | Ejemplo 8: corregir un mes cerrado | se guarda versión (1.600 €), liquidación pasa a 1.750 €, diferencia +150 € |
| T24 | Idempotencia | calcular dos veces = mismo resultado; sincronizar libro dos veces = 0 apuntes nuevos |
| T25 | Importe no numérico | línea con aviso y 0 € (sin excepción) |
| T26 | Reasignar expediente | se recalculan los dos vendedores |
| T27 | Preference: regla (marca+modelo) vs (marca) vs (general) | se aplica **solo** la más específica |
| T28 | Bonus de `pedido` con afectación en el mes pero pedido en otro | **no** entra |

### 12.17 Comportamiento del motor ANTIGUO (referencia, **no** replicar) [V-código: `simular-comision/route.ts`]

| Tema | Comportamiento verificado en el código original |
|---|---|
| VN/VO | `isVN` = estado “nuevo” **o “demo”** (demo = VN); VO = lo demás |
| Fecha efectiva VO | `fecha_facturacion`, y si falta, matriculación |
| Mínimo | Si matriculaciones del mes < `plan.min_matriculaciones` (por defecto 6) → **todo el mes a 0** |
| Objetivo | `plan.objetivo_base + plan.arrastre` **único para todos**, entero |
| Tramo | Solo coincide con diferencias **enteras exactas** (3, 2, 1, 0, −1, −2, −3); con decimales **cae a X−4** |
| Cupo | Se cuenta por `min_coches_multiplicador` (número) con una fecha distinta a la de los puntos |
| Bonus de pedido | También entra por **afectación** |
| Preference | Se **suman todas** las reglas que coinciden |
| Estados/Tipos | Detectados por **texto del nombre** |
| Transacciones | Ninguna: la liquidación **borra y recrea** sin transacción |
| Duplicidad | Simulador y liquidación son **dos copias** del cálculo |


---

## 13. Copias de seguridad, restauración y Google Drive [D]

### 13.1 Objetivo (R6, R7)
Que el propietario pueda, si algo falla (SD rota, error de actualización, equipo nuevo), **reinstalar la app y devolver la base de datos** a su último estado con unos pocos pasos, **sin depender de la Pi**.

### 13.2 Qué es una “copia”
- Un fichero **`.dump`** de PostgreSQL en formato personalizado: `pg_dump -Fc -Z 6 --no-owner --no-privileges` (completo: **todas** las tablas, índices, disparadores y datos).
- Nombre: `gv_AAAAMMDD_HHMMSS_{manual|auto|previa}.dump` (hora local). Se calcula su **SHA‑256** y se anota en `copias_seguridad`.
- Ubicación: carpeta `./backups/` del “bloque” (volumen montado en el contenedor de la app), permisos `600`.
- Las **sesiones** (`sesiones`) y los **intentos de login** se incluyen en el volcado pero **se vacían tras restaurar** (todos deben volver a entrar). [D]

### 13.3 Pantalla (Configuración → pestaña BBDD → “Copias de seguridad”)
Se integra en la pestaña existente “🗄️ Herramientas de Mantenimiento y Limpieza de BBDD” con el **mismo estilo** (glass-panel, `btn`, `table-premium`):
1. **Estado**: fecha/hora de la última copia, tamaño, y si está en Drive. **Banner de aviso** si la última copia automática tiene más de 48 h o falló.
2. **Botones**: **Crear copia ahora** · **Subir a Google Drive** (por copia) · **Descargar** (navegador) · **Restaurar** · **Borrar**.
3. **Lista** (más recientes primero): nombre, tipo, fecha, tamaño, SHA‑256 abreviado, icono de Drive.
4. **Ajustes**: copia automática (sí/no, hora, por defecto **03:30**), retención (por defecto **14 diarias + 8 semanales + 12 mensuales**), “subir a Drive automáticamente”.
5. **Restaurar** (acción crítica): elegir copia local **o subir un `.dump`** (máx. 2 GB). Pide **contraseña + código 2FA** del administrador y escribir `RESTAURAR`. Ver 13.5.
6. Se **conservan** las herramientas existentes de **exportar/importar JSON** (para migrar desde la app antigua, 12.13) y la limpieza de huérfanos.

### 13.4 Conexión con Google Drive (“que la app me pida conectarme y ya”) [D]
- Flujo **OAuth 2.0 (servidor web)**: botón **“Conectar con Google Drive”** → redirige a Google → el propietario acepta → vuelve a `{PUBLIC_URL}/api/admin/drive/callback`.
- **Alcance mínimo**: `https://www.googleapis.com/auth/drive.file` (la app solo ve los archivos que ella misma crea). Se piden `access_type=offline` y `prompt=consent` para obtener *refresh token*.
- Las **credenciales de la aplicación** (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`) las crea el propietario **una sola vez** en Google Cloud (la guía lo explica paso a paso, sección 18) y se ponen en `.env`. **No pueden venir de serie** en la app.
- `PUBLIC_URL` = URL pública del Funnel (`https://…ts.net`); es la **URI de redirección autorizada** en Google. Si cambia la URL, hay que actualizarla en Google.
- Se guarda **solo el refresh token, cifrado** (AES‑256‑GCM con `APP_SECRET`) en `conexion_drive`.
- Se crea la carpeta **“GestorVentasPi-Copias”**; la subida usa carga reanudable. Retención en Drive: la misma que local (se borran las antiguas **solo** de la carpeta propia).
- Si el token caduca o se revoca → la pantalla muestra **“Reconectar con Google Drive”** y la copia automática se sigue haciendo en local (con aviso).
- [No verificado] Si la aplicación de Google queda en modo **“Pruebas”**, el permiso puede caducar a los 7 días; la guía indica **pasarla a “En producción”** (uso personal, con un solo usuario). 
- **Sin Drive**: todo sigue funcionando; las copias se pueden **descargar desde el navegador** (13.3).

### 13.5 Restauración (algoritmo)
1. Validar: es administrador, contraseña + 2FA correctos, confirmación `RESTAURAR`, el fichero termina en `.dump` y `pg_restore --list` lo lee sin error.
2. Activar **modo mantenimiento** (la app responde 503 con una página “Restaurando…” a todo salvo `/api/salud`).
3. Crear una **copia previa** automática (`previa`) del estado actual.
4. Ejecutar `pg_restore --clean --if-exists --no-owner --single-transaction -d $DATABASE_URL fichero.dump` con `app.restauracion='on'`.
5. Ejecutar **migraciones pendientes** (si el volcado es de una versión anterior de la app).
6. Vaciar `sesiones` y `login_intentos`; registrar en `auditoria`.
7. Salir del modo mantenimiento. Si algo falla en 4–6 → **restaurar la copia previa** y mostrar el error.
- Procedimiento **por línea de comandos** (sin app): `./scripts/restaurar.sh fichero.dump` (guía, sección 18).

### 13.6 Reinstalación completa en una máquina nueva (flujo objetivo)
1. Instalar el sistema + ejecutar el **instalador** (sección 14.7).
2. Copiar la última copia `.dump` (de Drive o de donde sea) a `./backups/`.
3. `./scripts/restaurar.sh gv_….dump` (o desde la pantalla, tras crear el administrador).
4. Comprobar con el propietario que el administrador original puede entrar (su contraseña y 2FA están en la BD restaurada; el secreto TOTP **solo descifra con el mismo `APP_SECRET`** → **guardar `.env` o `APP_SECRET` aparte** y avisarlo en la guía). [D]

---

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

## 16. Pruebas y criterios de aceptación

### 16.1 Automáticas (en CI)
1. **Motor de comisiones**: casos T1–T28 (12.16) con Vitest; cobertura del módulo ≥ 90 %.
2. **API**: pruebas de permisos por rol (matriz 7.2) con una BD de prueba (Postgres en contenedor); cada ruta rechaza sin sesión (401) y sin permiso (403).
3. **Auth**: login correcto/incorrecto, bloqueo tras 5 fallos, TOTP válido/caducado/reutilizado, código de recuperación de un solo uso, rotación de sesión, revocación al cambiar contraseña, cuenta suspendida.
4. **Copias**: crear → restaurar → comparar recuentos de todas las tablas; restaurar un volcado antiguo y aplicar migraciones.
5. **Migraciones**: aplicar todas desde cero y sobre una BD con datos de la versión anterior.
6. **Imagen**: `docker buildx` para `linux/amd64` y `linux/arm64`; arranque de la imagen amd64 en CI con `/api/salud` en verde; arranque de arm64 bajo QEMU (comprobación de humo).
7. **Instalador**: ejecutarlo en un contenedor/VM Debian limpio (amd64) y comprobar que termina con la app sana y un administrador creado.

### 16.2 Paridad visual (R1) — lista de comprobación manual
Comparar **lado a lado** con la app original (carpeta `referencia/`) en tema oscuro y claro, escritorio y móvil: portada, login, dashboard (4 tarjetas, últimos 5, accesos rápidos), expedientes (tabla, columnas, filtros, modales, paginación), nuevo/editar expediente, clientes (+ modal de expedientes), búsqueda global, comisiones (lista + 9 pestañas), informes, log de importación, perfil, configuración (7 pestañas), cuenta suspendida, acceso denegado, mensajes flotantes, teclado en modales (Esc/Enter), barra lateral colapsable (persistente), conmutador de tema (persistente). Criterio: **sin diferencias perceptibles** en colores, tipografía, espaciados, bordes, sombras y animaciones.

### 16.3 En la Raspberry Pi real (fase F7)
Instalación con el archivo instalador desde cero; acceso con Funnel desde el móvil con datos; mediciones de 15.1; prueba de **reinicio en caliente** (cortar la corriente y comprobar que arranca sola y sin pérdida de datos confirmados); prueba de **reinstalación completa desde una copia** (13.6) con cronómetro.

### 16.4 Aceptación final del propietario
1. Puedo entrar por la URL con usuario, contraseña y código del autenticador.
2. La app se ve **igual** que la antigua y va **rápida**.
3. Los números de comisiones coinciden con mis reglas (Anexo A) y, al final, con mis liquidaciones antiguas explicadas (12.14).
4. Puedo descargar una copia desde el navegador y subirla a mi Drive con un botón.
5. Puedo reinstalar todo en otra máquina con el archivo instalador y una copia, en menos de 30 minutos.

---

## 17. Plan de implementación para Claude Code (fases)

### 17.1 Instrucciones de trabajo (resumen para `CLAUDE.md` del repositorio)
1. **Lee primero este informe completo** y los anexos. No inventes comportamiento: si una marca es **[P]** o **[I]** y afecta a lo que programas, **pregunta** o aplica la opción por defecto indicada y déjalo anotado en `DECISIONES.md`.
2. **Construye TODO DESDE CERO (0.1 bis).** El código original está en `referencia/gestorVentas-original/` (**solo lectura, no se despliega, no se copia ni se adapta**): consúltalo para replicar **interfaz, textos y comportamiento exactos**.
3. **No cambies el diseño**: reproduce **exactamente** los valores del Anexo C y los estilos descritos en la sección 8. Mantén nombres de rutas, componentes y textos.
4. **TypeScript estricto**, sin `any`, validación con Zod en toda entrada, transacciones en escrituras múltiples, SQL solo parametrizado.
5. **Un commit por tarea con mensaje claro**; una **rama por fase** y *pull request* a `main` al cumplir los criterios de aceptación de la fase.
6. **Tests antes de dar por buena una fase** (16.1). No marques una fase como completa sin ejecutarlos.
7. **Nunca** escribas secretos en el repositorio. `.env` en `.gitignore`.
8. **Idioma**: interfaz y documentación en **español de España**; comentarios de código en español.
9. Si algo del informe es imposible o mejor de otra manera, **proponlo por escrito antes** de desviarte.

### 17.2 Fases y criterios de aceptación

| Fase | Contenido | Criterio de aceptación |
|---|---|---|
| **F0 — Preparación** | Repo `GestorVentasPi` con `referencia/` (solo lectura), `CLAUDE.md`, `DECISIONES.md` y `docs/`; **proyecto Next.js nuevo** con la estructura 3.4, `globals.css` nuevo (valores del Anexo C), fuentes locales y `docker-compose.yml` de desarrollo con Postgres | `docker compose up` levanta Postgres; la app nueva compila y muestra la portada idéntica |
| **F1 — Base sin Clerk y sin comisiones** | Driver `pg`; esquema y migraciones (secciones 4.2–4.5, 4.7, 4.8); semilla; autenticación **mínima** (login con contraseña, sesiones) para poder trabajar; Dashboard, Expedientes (todo el 9.4 salvo comisiones), Nuevo/Editar (sin bloque de comisiones), Clientes, Búsqueda, Configuración (usuarios y catálogos), Perfil, Importaciones/Log, CSV/Excel/JSON | Paridad visual 16.2 de esas pantallas; permisos 7.2; pruebas de API de CRUD |
| **F2 — Autenticación completa** | 2FA TOTP, códigos de recuperación, límite de intentos, auditoría, cambio de contraseña, administración de usuarios (reset 2FA), scripts `crear-admin`/`reset-2fa`/`reset-password`, cabeceras de seguridad | Pruebas 16.1.3 en verde; revisión de seguridad (sección 6) |
| **F3 — Motor de comisiones (sin interfaz)** | Módulo `lib/comisiones` + esquema 4.6 + tests T1–T28 + disparadores de protección | Todos los tests en verde; cobertura ≥ 90 % |
| **F4 — Interfaz de comisiones** | Lista de planes, editor de 9 pestañas, liquidación (calcular/versionar/cerrar), libro de puntos, cotejo, pendientes, previsión de nómina, “Detalle y Resumen Estadístico”, bloque de comisionamiento del expediente, Informes y Dashboard con el motor | Paridad visual de las pantallas; los ejemplos 1–9 del Anexo A reproducibles desde la interfaz |
| **F5 — Copias y Drive** | Sección 13 completa | Prueba 16.1.4; flujo Drive probado con credenciales reales del propietario |
| **F6 — Empaquetado** | Dockerfile multi-arquitectura, GitHub Actions, `empaquetar.sh`, instalador, `GUIA-INSTALACION.md`, Tailscale Funnel **y Cloudflare Tunnel (opcional)** | Prueba 16.1.6 y 16.1.7; instalación limpia en amd64 |
| **F7 — Raspberry Pi real y rendimiento** | Mediciones 15.1, endurecimiento, prueba de corte de corriente, reinstalación con cronómetro | Aceptación 16.3 |
| **F8 — Datos reales (al final)** | Importar copia JSON de la app antigua, conversión (12.13) y “Comparar con liquidación antigua” con las 4 liquidaciones | Diferencias explicadas según 12.14; aceptación 16.4 |

---

## 18. Contenido obligatorio de `GUIA-INSTALACION.md` (R10)

Redactar en español, con pasos numerados, comandos **copiables** y capturas/descripciones cuando proceda:

1. **Qué necesitas** (Pi 4 8 GB, tarjeta SD de calidad ≥ 32 GB (recomendable A1/A2), fuente de alimentación oficial, cable de red o Wi‑Fi, un PC con lector de SD).
2. **Preparar la tarjeta** con *Raspberry Pi Imager*: Raspberry Pi OS Lite **64 bits**, nombre del equipo, usuario, contraseña, **SSH activado**, zona horaria Europe/Madrid.
3. **Primer arranque y conexión por SSH**; actualizar el sistema (`sudo apt update && sudo apt full-upgrade -y`); reservar una IP fija en el router (opcional).
4. **Instalar la aplicación**: copiar el archivo instalador a la Pi (`scp`) y ejecutarlo; qué preguntas hace y qué responder.
5. **Primer acceso**: URL, crear el administrador, **activar el 2FA** (escanear QR, guardar los códigos de recuperación en un lugar seguro).
6. **Acceso desde fuera**: **opción A (sin dominio)**: crear cuenta de Tailscale, instalar, activar HTTPS y Funnel, copiar la URL, comprobar desde el móvil con datos, actualizar `PUBLIC_URL`. **Opción B (con dominio)**: pasar el dominio a Cloudflare, crear el túnel y el *public hostname*, copiar el token y arrancar el perfil `cloudflare`.
7. **Google Drive**: crear proyecto en Google Cloud, habilitar *Google Drive API*, pantalla de consentimiento, **pasar a “En producción”**, crear credenciales OAuth (tipo “Aplicación web”) con la **URI de redirección** `{PUBLIC_URL}/api/admin/drive/callback`, pegar `GOOGLE_CLIENT_ID/SECRET` en `.env`, reiniciar y pulsar “Conectar con Google Drive”.
8. **Copias**: programación automática, descargar una copia, **probar una restauración** (importante: una copia que no se ha probado no es una copia).
9. **Guardar aparte**: copia del `.env` (o al menos `APP_SECRET`) y de los códigos de recuperación.
10. **Actualizar** la app (`--actualizar`) y el sistema operativo.
11. **Reinstalar tras un fallo**: nueva SD → pasos 2–4 → copiar `.env` y la última copia → `--restaurar`.
12. **Instalar en un PC (AMD64) o Synology**: diferencias (Docker Desktop/Engine, rutas, `BIND_ADDRESS`).
13. **Problemas frecuentes**: la app no arranca (`--logs`), olvidé el 2FA (`reset-2fa.sh`), olvidé la contraseña, la SD no arranca, la URL pública no responde, Drive pide reconectar.
14. **Seguridad básica**: cambiar contraseña de SSH, desactivar contraseña SSH si se usa clave, `unattended-upgrades`, no abrir puertos en el router.

---

## 19. Decisiones pendientes de confirmar con el propietario ([P], consolidado)

| # | Tema | Opción por defecto mientras tanto |
|---|---|---|
| P1 | Qué ve cada rol dentro de **Comisiones** | Admin todo; resto solo sus propias liquidaciones en lectura (7.2) |
| P2 | **Endurecer permisos** de edición/borrado de expedientes por tienda/propietario | Desactivado (idéntico al original) con ajuste para activarlo (6.1) |
| P3 | Duración de sesión | 12 h de inactividad / 30 días absolutos (5.5) |
| P4 | ¿Cifrar las copias antes de subirlas a Drive? | No (se confía en la cuenta personal de Google) |
| P5 | **Contado** sin incentivo de financiación; **Renting** como financiación | Como el original (Anexo A, E‑2 y E‑3) |
| P6 | **Arrastre**: ¿manual o automático cada mes? | **Manual** por vendedor y plan (Anexo A, E‑5) |
| P7 | Orden de las unidades VO (fecha de cobro y luego nº de expediente) | El indicado (12.4) hasta validar con una liquidación real |
| P8 | Si un expediente tiene **puntos propios y promoción** a la vez | Prevalece la **promoción** (12.3, paso 3) |
| P9 | Estados iniciales (¿existe “Seminuevo”?) y su clase/subtipo | Nuevo→VN; Demo/KM0/Buyback/Usado→VO (4.3) |
| P10 | Expedientes migrados sin vendedor válido | Se asignan al administrador (12.13) |
| P11 | Textos exactos de algunos mensajes de la app original no leídos (borrado de usuarios con expedientes, clientes con expedientes, “Opciones de Interfaz y Seguridad”) | Replicar leyendo el original en `referencia/` |
| P12 | Credenciales de Google y modo “En producción” de la app de Google | A cargo del propietario siguiendo la guía |

---

## 20. Glosario

Ver el **Anexo A, Anexo F** (VN/VO, pedido, afectación, RCI, matriculación, cobro, objetivo X, arrastre, tramo, tasa de intervención, promoción, unidad comisionable, libro de puntos, liquidación, versión, cotejo, mes de pago). Términos nuevos de este informe: **Funnel** (publicación de un servicio local en una URL pública de Tailscale), **TOTP** (código de 6 dígitos temporal del autenticador), **bloque** (carpeta instalada con compose, `.env`, datos y copias), **`.dump`** (copia completa de PostgreSQL), **GHCR** (registro de imágenes de GitHub).


---

# ANEXOS
## Anexo A — `SISTEMA-DE-COMISIONES.md` del propietario (íntegro, normativo)

> **Nota de uso.** Este documento es la fuente normativa de las **reglas de comisiones y puntos**. Describe la aplicación GestorVentasV2 (otra app del propietario, en Cloudflare/SQLite). Para esta app **se aplican sus reglas de negocio** (Fases 0–11 y 13, Anexos A–F), pero **no** sus detalles de plataforma (Cloudflare Worker, límite de 10 ms, SQLite/D1, “Mi vendedor” como único vendedor): aquí la plataforma es Next.js + PostgreSQL en Raspberry Pi/PC, multiusuario (secciones 3, 4 y 12 de este informe). Dentro del anexo, ✅ = confirmado por el propietario; 🔧 = implementado en V2; ❓ = pendiente de confirmar.

### Sistema de comisiones y puntos — Documentación completa

Documento de referencia de **cómo funciona el cálculo de puntos, tramos y comisiones** en GestorVentasV2: qué se configura, qué datos se usan, en qué mes cuenta cada cosa, cómo se calcula cada importe, cómo se cierra y se corrige una liquidación y cuándo se cobra.

#### Cómo leer este documento

| Marca | Significado |
|---|---|
| ✅ **Regla confirmada** | La ha dicho o decidido Alfonso. Es la regla de negocio |
| 🔧 **Implementado** | Lo he visto en el código del motor (`src/shared/comisiones/motor-puntos.ts` y `motor-comisiones.ts`, versión del zip posterior a CORRECCIÓN 8) |
| ❓ **[Inferencia]** | Deducción mía o detalle que no he podido comprobar en el código actual. Hay que confirmarlo |

**Alcance de la verificación:** el documento describe el sistema **según las reglas acordadas y el motor tal como estaba en el último zip que he revisado**. Los cambios posteriores de Antigravity (por ejemplo, CORRECCIÓN 9, que solo toca la interfaz) no los he vuelto a comprobar. Si el código cambia, este documento hay que actualizarlo.

**Índice de fases**

0. Principios y unidades
1. Configuración: el plan de comisionamiento
2. Datos que aporta cada expediente
3. ¿En qué mes cuenta cada cosa? (calendario de eventos)
4. Puntos
5. Objetivo X y tramo
6. Tasa de intervención por marca
7. Importes: los seis conceptos de comisión
8. Total del mes: bruto, penalización y neto
9. La liquidación: estados, cierre, versiones y correcciones
10. Libro de puntos y sincronización automática
11. Cobro: cotejo, pendientes de cobro y previsión de nómina
12. Migración desde la app antigua
13. Validación: comparar con las liquidaciones antiguas
Anexos: A) Ejemplos numéricos · B) Diferencias con la app antigua · C) Reglas confirmadas por Alfonso · D) Dónde se ve cada cosa · E) Pendiente de confirmar · F) Glosario

---

#### Fase 0 — Principios y unidades

1. ✅ **El objetivo mensual va por puntos, no por unidades.** Cada vendedor tiene **su propio objetivo X** (habitual: unos 13 puntos).
2. ✅ **Una venta no da puntos por sí sola.** Los puntos llegan con los **eventos** del coche (matriculación o cobro) y, si el plan lo dice, con el **pedido**.
3. ✅ **Los puntos ayudan a llegar al objetivo; la comisión se cobra una sola vez por coche.** Un coche de 2 puntos suma 2 al objetivo, pero **nunca se cobra doble**.
4. ✅ **Todo se configura en el plan de comisionamiento**, porque la empresa cambia las reglas cuando quiere. Cada plan tiene un rango de fechas.
5. ✅ **No hay mínimo** de matriculaciones ni de cobros. (La app antigua tenía uno que ponía la comisión a 0; en la nueva no existe.)
6. ✅ **Las comisiones se cobran a mes vencido:** lo generado en el mes M se cobra en la nómina de fin del mes M+1.

##### Unidades (🔧)

| Dato | Se guarda como | Ejemplo | Cómo se muestra |
|---|---|---|---|
| Puntos | Entero en **centésimas** | 150 = 1,50 puntos | `1,50 puntos` |
| Importes | Entero en **céntimos** | 15000 = 150,00 € | `150,00 €` |
| Fechas de negocio | Texto `AAAA-MM-DD` | `2026-06-10` | `10/06/2026` |
| Mes de cómputo | Texto `AAAA-MM` | `2026-06` | Junio 2026 |

Importes y puntos siempre con **al menos 2 decimales** y formato español. Se usan enteros para que no haya errores de redondeo.

##### Dónde se calcula (🔧)

El cálculo se hace en el **navegador** con el mismo motor compartido que usa el servidor. El servidor (Worker de Cloudflare) solo valida y guarda, por el límite de 10 ms de CPU del plan gratuito.

---

#### Fase 1 — Configuración: el plan de comisionamiento

Un **plan** cubre un periodo (normalmente un mes) y contiene todo lo que hace falta para calcular. Se edita en *Comisiones → Abrir plan*, con 9 pestañas.

##### 1.1 Datos generales del plan
- Nombre, **fecha de inicio** y **fecha de fin**.
- **Rango de tramos** respecto a X (por defecto −4 a +3, configurable).
- **Puntos por pedido** (por defecto 0; puede ser 1,00 u otro valor).
- **Penalización global** del plan (importe fijo que se resta del total del mes).
- Notas y comisiones pendientes del plan.

##### 1.2 Objetivo por vendedor (pestaña *Objetivo*)
- Cada vendedor asignado al plan tiene **su objetivo X** y su **arrastre** (unidades adicionales de meses anteriores). 🔧 Objetivo resultante = base + arrastre.
- **Puntos por defecto** de un coche según modelo o marca, si el expediente no trae puntos propios.
- **Tasa de intervención objetiva por marca** (porcentaje o unidades; ver Fase 6).
- **Promociones de puntos** (ver 1.3).

##### 1.3 Promociones de puntos (los "coches de doble puntuación")
✅ La empresa elige **coches concretos** (normalmente stock atascado) y les da puntos especiales si el vendedor llega a un **mínimo de unidades** de esa promoción en el mes.

| Campo | Significado | Ejemplo |
|---|---|---|
| Nombre | Identifica la promoción | "Stock atascado junio" |
| Puntos especiales | Lo que vale cada coche si se cumple el mínimo | 2,00 |
| Mínimo de unidades | Cuántos coches de la promoción hay que contar en el mes | 2 |
| Puntos si no cumple | Lo que vale cada coche si no se llega | 1,00 (por defecto) |

- ✅ **Da igual el modelo:** todos los coches de la misma promoción cuentan juntos.
- ✅ Cada expediente indica a qué promoción pertenece (campo "Promoción de puntos").

##### 1.4 Tarifas de comisión del coche VN (pestaña *VN*)
Por **modelo** y por **tramo** (X−4 … X+3), dos importes:
- **Tasa cumplida** (la marca llega a su tasa de intervención objetiva).
- **Tasa no cumplida**.

La pantalla muestra una tabla por marca (por ejemplo, "MODELOS DE RENAULT") con dos filas por modelo (Tasa ≥ objetivo / Tasa < objetivo), orden, copiar/pegar y "aplicar a los de abajo".

##### 1.5 Comisión de usados / VO (pestaña *Usados / VO*)
Dos sistemas, según el tipo de vendedor:
1. **Vendedor VN que vende VO:** tarifa **por subtipo** (USADO, KM0, DEMO, BUYBACK…): importe de la **primera unidad**, importe del **resto** y un **mínimo de unidades** (`min_aplicar`, por defecto **0 = sin mínimo**).
2. **Vendedor VO** (o patrón con "aplica a VN"): **escala progresiva** por número de unidad (unidad 1 → X €, unidad 2 → Y €…). Si no hay escala, **150 € por unidad**.

##### 1.6 Financiación y Preference (pestaña *Financ/Reglas*)
- **Incentivo de financiación** por **marca** y **tipo** (Crédito, Preference, Renting, Contado).
- **Reglas Preference / BOX3** por marca, modelo y tipo de financiación.
- **Reglas especiales** adicionales.

##### 1.7 Bonus (pestaña *Bonus*) y Penalizaciones (pestaña *Penalizaciones*)
Cada regla o bonus tiene:
- **Evento** que lo dispara: pedido, afectación, matriculación, cobro, crédito/financiación o Preference.
- **Filtros:** tipo de vehículo (nuevo, usado, cualquiera), fechas de validez, marca, modelo, tasa de intervención (cumplida / no cumplida / indiferente).
- **Efecto:** suma **importe**, suma **puntos al objetivo**, o ambas. Si es penalización, el importe resta.
- **Ligar a crédito** (solo reglas Preference): se aplica solo si también se aplicaría una regla de crédito.

##### 1.8 Liquidación y Notas (pestañas *Liquidación* y *Notas*)
La liquidación se calcula y se consulta aquí (Fase 9). *Notas* contiene las notas del plan y las **comisiones pendientes** (Fase 11).

---

#### Fase 2 — Datos que aporta cada expediente

| Dato del expediente | Para qué se usa |
|---|---|
| **Clase del vehículo: VN o VO** | Decide cuándo cuenta y cómo se comisiona. ✅ **Usado, KM0, demo y buyback son VO** (coches que ya tienen matrícula antes de venderse) |
| **Vendedor** | A quién se le cuenta. ✅ Por defecto "Mi vendedor"; se puede reasignar |
| **Fecha de expediente (pedido)** | Mes del pedido |
| **Fecha de afectación** | Fecha en que se asigna un bastidor a un VN |
| **Fecha RCI** | Mes de la financiación y de Preference |
| **Fecha de matriculación** | Cuenta en VN. En VO es **solo un dato del coche** |
| **Casilla "Expediente cobrado en otra fecha" + fecha de cobro** | En VN, si está marcada, **manda la fecha de cobro**. En VO la fecha de cobro es la que cuenta |
| **Tipo de venta** (con su categoría: Contado, Crédito, Preference, Renting) | Financiación y Preference |
| **Marca y modelo** | Tarifas y tasa de intervención |
| **Puntos del coche** | Puntos propios (puede ser 0). Vacío = valor por defecto del plan |
| **Promoción de puntos** | Agrupa coches de doble puntuación |
| **Comisión de coche fijada a mano** | Sustituye a la tarifa |
| **Comisión de financiación fijada a mano** | Sustituye a las tarifas y reglas de financiación |
| **Conceptos especiales** | Bonificaciones o penalizaciones sueltas (título, importe ±, descripción, evento, cobrado) |
| **Estado de cobro por concepto** | Qué partes de la comisión ya se han cobrado en nómina (cotejo) |

✅ **Un VN solo necesita dos fechas para los puntos: matriculación y, si procede, cobro.** La fecha de facturación **no influye** en ningún cálculo de puntos.

---

#### Fase 3 — ¿En qué mes cuenta cada cosa? (calendario de eventos)

Este es el corazón del sistema: **cada concepto se genera en el mes de su propio evento**, y nunca dos veces el mismo concepto. Un mismo expediente puede generar cosas en meses distintos.

##### 3.1 Evento principal del coche (el que lo hace "contar")

| Clase | Regla | Mes de cómputo |
|---|---|---|
| **VN** | ✅🔧 Cuenta por **fecha de matriculación**, **salvo** si está marcada "cobrado en otra fecha": entonces manda la **fecha de cobro** (obligatoria) | Mes de esa fecha |
| **VO** | ✅🔧 Cuenta **solo por fecha de cobro** (se factura el mismo día) | Mes de cobro |

- Si falta la fecha necesaria, el coche **no cuenta en ningún mes** hasta que se rellene.
- Un VN con la casilla marcada pero sin fecha de cobro tampoco cuenta.

##### 3.2 Calendario de todos los conceptos

| Concepto | Mes en que se genera | Fecha que lo decide |
|---|---|---|
| **Puntos del coche** | Mes de cómputo del coche | Matriculación (VN) o cobro (VN con casilla, VO) |
| **Puntos del pedido** | Mes del pedido | `fecha_expediente`, si el plan da puntos por pedido |
| **Comisión del coche VN** | Mes de cómputo del coche | Igual que sus puntos |
| **Comisión VO** | Mes de cobro | `fecha_cobro` |
| **Incentivo de financiación** | Mes de la fecha RCI | `fecha_rci` |
| **Preference / BOX3** | Mes de la fecha RCI | `fecha_rci` |
| **Bonus / reglas** | Según su evento | Ver 3.3 |
| **Conceptos especiales** | Según su evento | Por defecto el evento principal del coche |
| **Penalización del plan** | Mes del plan | Se resta del total del mes |

##### 3.3 Evento de cada bonus o regla

| Evento | Entra en el mes si… | Fecha usada para las fechas de validez |
|---|---|---|
| `pedido` | `fecha_expediente` cae en el mes | `fecha_expediente` |
| `afectacion` | `fecha_afectacion` cae en el mes | `fecha_afectacion` |
| `matriculacion` | El mes de cómputo del coche es el mes | Matriculación (o cobro con la casilla). ✅ **En VO, "matriculación" equivale a cobro** |
| `cobro` | `fecha_cobro` cae en el mes | `fecha_cobro` |
| `credito` / `financiacion` | `fecha_rci` en el mes y tipo Crédito o Renting | `fecha_rci` |
| `preference` | `fecha_rci` en el mes y tipo Preference | `fecha_rci` |

✅ **Cada evento mira solo su fecha:** un bonus de *pedido* no se mueve por la afectación, y uno de *afectación* no se mueve por el pedido.

##### 3.4 El pedido: cuenta en su mes, y otra vez al matricular (✅)
- Pedido y matriculación (o cobro) en el **mismo mes** → cuenta **una sola vez** (los puntos del coche, no los del pedido).
- En **meses distintos** → cuenta en **los dos**: los puntos de pedido en el mes del pedido, y los del coche en el mes de matriculación/cobro.

---

#### Fase 4 — Puntos

##### 4.1 Puntos de un coche (🔧)
1. **Puntos propios del expediente**, si los tiene. ✅ **0 es un valor válido** (no se convierte en 1).
2. Si está vacío: puntos por defecto del **modelo**, luego de la **marca**, luego **1,00**.
3. Si el coche pertenece a una **promoción**:
   - Se cuentan **todos los coches de esa promoción que cuentan en el mes** (cualquier modelo; contados por su evento principal, no por la venta).
   - Si el total **≥ mínimo** → cada coche vale los **puntos especiales**.
   - Si no → cada coche vale **puntos si no cumple** (por defecto 1,00).

##### 4.2 Unidad comisionable (🔧)
Cada coche que cuenta aporta **1 unidad comisionable**, valga 1 o 2 puntos. Por eso un coche de 2 puntos suma 2 al objetivo pero se cobra **una sola vez**.

##### 4.3 Puntos de pedidos (🔧)
Cada expediente con **pedido en el mes** y cuyo evento principal **no** cae en ese mismo mes suma los **puntos por pedido del plan** (0 por defecto).

##### 4.4 Puntos de reglas y bonus (🔧)
Las reglas y bonus con "afecta al objetivo" suman sus puntos **en el mes de su evento**, tras aplicar todos sus filtros (Fase 1.7). Entran en el total del mes y en el libro de puntos.

##### 4.5 Puntos totales del mes
```
Puntos del mes = puntos de los coches que cuentan en el mes
               + puntos de los pedidos del mes
               + puntos de reglas y bonus
               + ajustes manuales (si los hay)
```

---

#### Fase 5 — Objetivo X y tramo

##### 5.1 Fórmula (🔧)
```
Diferencia   = puntos del mes − objetivo X
Tramo        = redondeo hacia abajo de la diferencia (en puntos enteros)
Tramo final  = el tramo, limitado al rango del plan (por defecto −4 a +3)
```
✅ **Siempre se redondea hacia abajo.** El objetivo X puede tener decimales (por el arrastre).

| Puntos | Objetivo X | Diferencia | Tramo |
|---|---|---|---|
| 13,00 | 13,00 | 0,00 | **X** |
| 13,50 | 13,00 | +0,50 | **X** |
| 12,50 | 13,00 | −0,50 | **X−1** |
| 13,00 | 12,50 | +0,50 | **X** |
| 10,00 | 13,00 | −3,00 | **X−3** |
| 17,40 | 13,00 | +4,40 → 4 | **X+3** (limitado al máximo) |
| 5,00 | 13,00 | −8,00 | **X−4** (limitado al mínimo) |

##### 5.2 Para qué sirve el tramo
El tramo del **vendedor en el mes** decide **qué columna de tarifas** se usa para la comisión del coche VN (Fase 7.1). Es **un único tramo por vendedor y mes**.

---

#### Fase 6 — Tasa de intervención por marca

Mide cuántos coches nuevos de una marca se financian. Se calcula **por marca y por mes** (🔧).

| Parte | Qué cuenta |
|---|---|
| **Denominador** | Coches de **clase VN** de esa marca cuyo **mes de cómputo** es el mes. Los **VO no cuentan**. Un VN con la casilla de cobro cuenta en el mes del cobro |
| **Numerador** | Coches de **clase VN** de esa marca con **fecha RCI en el mes** y tipo Crédito, Preference o Renting |

- **Objetivo:** un porcentaje (por defecto 70 %) o un número de unidades, según el plan.
- **Cumple** si el porcentaje alcanza el objetivo, o si el número de financiados alcanza las unidades pedidas.
- ✅🔧 **Sin VN de esa marca en el mes → se considera cumplida.**
- ❓ **[Inferencia]** Numerador y denominador se calculan con fechas distintas (RCI y cómputo); por eso pueden ser coches diferentes. Es el comportamiento de la app antigua, que se ha mantenido.

El resultado (cumplida / no cumplida) elige entre las dos filas de tarifas del coche VN y alimenta los filtros de reglas y bonus.

---

#### Fase 7 — Importes: los seis conceptos de comisión

El motor recorre **todos los expedientes del vendedor** y, para cada uno, evalúa cada concepto **en el mes de su propio evento** (Fase 3). Los importes son enteros en céntimos.

##### 7.1 Concepto 1 — Comisión del coche VN (🔧)
Solo si el coche es **VN** y **cuenta en este mes**. Por orden de prioridad:
1. **Vendedor de tipo VO** → la base VN es **0** (se muestra "omitida: vendedor de VO").
2. **Comisión de coche fijada a mano en el expediente** → se usa ese importe y se ignora la tarifa.
3. **Tarifa del plan** para ese **modelo**, el **tramo** del vendedor y la **tasa** (cumplida o no).
4. Si **no hay tarifa** → **0 €** y una **línea de aviso visible**: "Sin tarifa para el modelo X en el tramo Y".

##### 7.2 Concepto 2 — Comisión VO (🔧)
Solo si el coche es **VO** y su **fecha de cobro** es de este mes.

**Vendedor VN que vende VO** (por subtipo, contador independiente en cada subtipo):
1. Se cuentan **todas** las unidades del subtipo cobradas en el mes, ordenadas por fecha de cobro y luego por número de expediente.
2. Si el total es **≥ mínimo** (`min_aplicar`, por defecto 0), se pagan **todas**; si no, **ninguna**.
3. La **primera** unidad cobra el importe de "primera"; las demás, el de "resto".
4. Si no existe tarifa para ese subtipo → 0 € (no se usa ninguna tarifa de respaldo).
5. Una comisión fijada a mano en el expediente sustituye a lo anterior.

**Vendedor VO (o patrón con "aplica a VN")** — escala progresiva:
1. Las unidades del mes se ordenan por fecha de cobro y número de expediente.
2. Cada unidad cobra el escalón con su número; **si se pasa del último escalón, se repite el último**.
3. Sin escala definida → **150 € por unidad**.

Los **puntos** de un VO son los de su expediente o promoción, como cualquier coche; **no** los del escalón.

##### 7.3 Conceptos 3 y 4 — Financiación y Preference / BOX3 (🔧)
Solo en el **mes de la fecha RCI**:
1. Si hay **comisión de financiación fijada a mano** → se usa ese importe y **se ignoran** las tarifas y reglas de financiación y Preference.
2. Si no, y el tipo de venta es **Crédito, Preference o Renting** → **incentivo de financiación** de la tarifa de esa marca y tipo. ✅ El **Contado no genera incentivo de financiación**. ❓ [Inferencia: según el código leído]
3. Si el tipo es **Preference** → se busca la **regla Preference / BOX3** más específica (✅ marca + modelo, después solo marca, después general) y se suma su importe.

##### 7.4 Concepto 5 — Reglas y bonus (🔧)
Para cada regla o bonus activo, en este orden (si falla un paso, no se aplica):
1. **Evento** (Fase 3.3).
2. **Tipo de vehículo:** nuevo = solo VN; usado = solo VO; cualquiera.
3. **Fechas de validez** del bonus, con la fecha de su evento.
4. **Marca y modelo**, si los indica.
5. **Tasa de intervención:** cumplida / no cumplida / indiferente.
6. **Ligar a crédito** (Preference): solo si también se aplicaría una regla de crédito para ese expediente.
7. **Efecto:** suma el importe (resta si es penalización) y/o suma puntos al objetivo.

##### 7.5 Concepto 6 — Conceptos especiales del expediente (🔧)
Bonificaciones o penalizaciones sueltas de un expediente (por ejemplo, "Bonus Rappel +100 €").
- Importe positivo o negativo, con descripción.
- Tienen un **evento** a elegir (afectación, matriculación o cobro). ✅ **Por defecto:** el evento principal del coche (matriculación en VN; cobro en VN con casilla y en VO).
- Se generan en el mes de su evento. Si el expediente aún no tiene esa fecha, el concepto queda **pendiente**.

##### 7.6 Importes fijados a mano y avisos
- Comisión de coche y de financiación pueden **fijarse a mano** en el expediente (dejar en blanco = autocalcular).
- 🔧 Si algún importe no es un número válido, **nunca se propaga un error**: la línea muestra un aviso y suma 0 €.
- 🔧 Cada línea de la liquidación indica **de qué concepto sale** cada importe, para poder revisarlo.

---

#### Fase 8 — Total del mes: bruto, penalización y neto

```
Comisión bruta del mes = comisión coche VN
                       + comisión VO
                       + incentivo de financiación
                       + Preference / BOX3
                       + bonus y reglas
                       + conceptos especiales

Penalización del plan  = importe fijo del plan (si lo hay)

Comisión neta          = comisión bruta − penalización   (nunca baja de 0)

Mes de pago            = mes siguiente al de liquidación
```

✅ La comisión de un mes se cobra en la **nómina de fin del mes siguiente**. Ejemplo: lo generado en enero se cobra en la nómina de fin de febrero.

---

#### Fase 9 — La liquidación: estados, cierre, versiones y correcciones

##### 9.1 Qué es
Una **liquidación** es el resultado guardado del cálculo de un vendedor en un mes: puntos, tramo, cada línea de expediente con sus conceptos, totales y mes de pago.

##### 9.2 Estados (🔧)
`borrador` → `calculada` → `revisada` → `cerrada`

##### 9.3 Cierre y correcciones: se actualiza todo (✅)
Alfonso decidió que, si cambia algo de un expediente de un **mes ya cerrado**, **se actualice todo**: puntos, tramo, tablas y liquidación.

1. Al crear, editar o borrar un expediente, se recalculan **todos los meses afectados**, también los cerrados.
2. La **versión anterior completa** (cabecera, líneas y conceptos) se guarda en un **historial de versiones**, con fecha y motivo, y se muestra la diferencia ("antes 1.200 €, ahora 1.350 €").
3. Las **versiones guardadas** no se pueden modificar ni borrar.
4. La interfaz **avisa** cuando un cambio modifica un mes cerrado, con el importe de la diferencia.

##### 9.4 Protecciones de la base de datos (🔧)
- Disparadores que impiden modificar o borrar liquidaciones cerradas, sus líneas, sus conceptos, las versiones y el libro de puntos, **salvo** durante un recálculo autorizado o la restauración de una copia de seguridad (indicadores internos).
- Las claves foráneas impiden borrar una promoción en uso o un plan con liquidaciones.

##### 9.5 Liquidaciones importadas de la app antigua (✅)
Se importan como **cerradas** y **no se recalculan** solas. Solo se recalculan (con nueva versión y diferencia) cuando Alfonso cambia un expediente de ese mes. Son la **referencia de lo que de verdad se cobró** (Fase 13).

---

#### Fase 10 — Libro de puntos y sincronización automática

##### 10.1 El libro de puntos (🔧)
Es el registro de **solo inserción** de todos los apuntes de puntos: vendedor, expediente, evento (`PEDIDO`, `MATRICULACION`, `COBRO`, `REGLA`, `AJUSTE`), fecha, mes, puntos y regla aplicada.
- **Nunca se borra ni se modifica.** Las correcciones se hacen con **apuntes negativos**.
- Sirve para auditar de dónde sale cada punto.

##### 10.2 Cuándo se actualiza (🔧)
Automáticamente, al:
- Crear, editar o borrar un expediente (se sincronizan **todos los meses afectados antes y después** del cambio: hasta 4, según pedido y matriculación/cobro).
- Cambiar fechas, tipo de venta, marca, modelo o vendedor.
- Cambiar las reglas del plan o terminar una importación (en bloque, desde el navegador, mes a mes).

##### 10.3 Reasignar un expediente (✅)
Se puede pasar un expediente a otro vendedor. Se recalculan los puntos y las liquidaciones **de los dos vendedores** en los meses afectados.

---

#### Fase 11 — Cobro: cotejo, pendientes de cobro y previsión de nómina

##### 11.1 Cotejo de cobros (✅)
Para comprobar la nómina contra la liquidación:
- Cada expediente muestra sus conceptos (coche, usado, financiación, Preference, bonus y especiales) con una **casilla de "cobrado"**.
- Totales: **validado/cobrado**, **pendiente de cobro** y **ratio de validación**.
- Filtro: todos / solo pendientes / solo cobrados.
- Vive en la pantalla de **lista de planes** (panel "Control y Verificación de Cobros de Comisiones").

##### 11.2 Comisiones pendientes del plan (✅)
Importes de meses anteriores que la empresa debe y se suman a la liquidación. Se muestran **aparte** del total y **se suman a la previsión de nómina**. Vienen de las notas del plan antiguo cuando se migra.

##### 11.3 Pendiente de cobro: lo que me deben (✅)
Lista que Alfonso rellena a mano: **concepto, importe, fecha, mes de nómina previsto, cobrado sí/no, fecha de cobro y notas**.
- Totales de pendiente y cobrado; filtro todos/pendientes/cobrados.
- Si pasó el mes previsto sin cobrarse, se marca **atrasado**.
- Lo no cobrado entra en la **previsión de nómina**.

##### 11.4 Previsión de nómina (M+1) (✅)
Muestra, para cada **mes de pago**, cuánto se cobrará: comisión neta de la liquidación del mes anterior + comisiones pendientes + lo pendiente de cobro previsto para ese mes.

---

#### Fase 12 — Migración desde la app antigua

La copia de seguridad v1 se importa con una pantalla de clasificación y la conversión de comisiones. Equivalencias principales:

| App antigua | App nueva |
|---|---|
| Importes en **euros enteros** | Se multiplican por 100 → **céntimos** |
| `valor_objetivo` (1, 1,5, 2…) | `puntos` en **centésimas**. ✅ El 0 se conserva como 0 (antes se convertía en 1) |
| `min_coches_multiplicador` (cupo) | **Promociones de puntos**: se crea "Importada: N puntos, mínimo M" y se asigna a esos expedientes |
| `cobrado_otra_fecha` + `fecha_cobrado` | Casilla + `fecha_cobro`. En VO, `fecha_cobro` = fecha de facturación si no estaba marcada (se cobraba y facturaba el mismo día) |
| Estados "demo", "KM0", "usado", "buyback" | Clase **VO** con su subtipo |
| Un objetivo único por plan | Se copia a **cada vendedor** del plan |
| `min_matriculaciones` | **No se usa**; se guarda solo como dato histórico |
| Liquidaciones antiguas | Se importan como **cerradas** y de solo lectura |
| `conceptos_adicionales` (euros) | Conceptos especiales en céntimos, con evento por defecto |
| `notas_adicionales` (notas y comisiones pendientes) | Notas del plan y lista de pendientes en céntimos |
| Expedientes sin vendedor válido | Se asignan a "Mi vendedor" con aviso; se puede cambiar en la clasificación |

La conversión de comisiones es **repetible**: ejecutarla dos veces no duplica nada.

---

#### Fase 13 — Validación: comparar con las liquidaciones antiguas

La función **"Comparar con liquidación antigua"** calcula un mes con el motor nuevo y lo pone al lado de la liquidación importada de la app antigua: total, puntos, tramo y, por expediente, puntos, tramo e importe, con la diferencia.

**Las diferencias deben explicarse por cambios decididos a propósito:**
- Demo, KM0 y usados ahora son VO (antes la app antigua trataba "demo" como VN).
- Los coches de 0 puntos ya no se convierten en 1.
- Un VO cuenta solo por fecha de cobro.
- Ya no hay mínimo de matriculaciones (si un mes no se llegaba, la antigua daba 0).
- Las promociones se agrupan por promoción, no por número de cupo.
- Financiación y bonus se pagan una sola vez, en el mes de su evento.

Cualquier diferencia que no encaje con esa lista puede ser un fallo del motor nuevo **o** de la app antigua, y hay que revisarla.

---

### Anexo A — Ejemplos numéricos

##### Ejemplo 1 — Puntos, pedidos y tramo
Plan de junio, X = 13,00, rango −4 a +3.

| Concepto | Puntos |
|---|---|
| 10 VN matriculados en junio (1,00 cada uno) | 10,00 |
| 3 pedidos de junio que se matriculan en **julio** (puntos por pedido = 1,00) | +3,00 |
| **Total junio** | **13,00 → tramo X** |

- Con **puntos por pedido = 0**: total 10,00 → diferencia −3 → **X−3**.
- En **julio**, esos 3 coches se matriculan y **vuelven a contar** (+3,00 por su matriculación).
- Si el pedido y la matriculación fueran de junio, contarían **una sola vez**.

##### Ejemplo 2 — Promoción de doble puntuación
Promoción "Stock atascado junio": especiales 2,00, mínimo 2, si no cumple 1,00.

| Situación | Resultado |
|---|---|
| En junio se matriculan 1 Clio y 1 Captur de la promoción | 2 ≥ 2 → 2,00 + 2,00 = **4,00 puntos**. Se cobra comisión de 1 Clio y 1 Captur (una vez cada uno) |
| Se venden 2 en junio, uno se matricula en junio y otro en julio | Junio: 1/2 → **1,00**. Julio: 1/2 → **1,00** |
| Promoción con mínimo 3 y se matriculan 3 | 3 ≥ 3 → 3 × 2,00 = **6,00 puntos** |

##### Ejemplo 3 — VN "cobrado en otra fecha"
Un VN matriculado el 12/02 y cobrado el 20/01.
- **Con la casilla marcada** y fecha de cobro 20/01: puntos y comisión del coche en **enero**; se cobra en la nómina de **febrero**.
- **Sin la casilla:** cuenta en **febrero**; se cobra en la nómina de **marzo**.

##### Ejemplo 4 — Cada concepto en su mes
Expediente VN, Renault Clio, tipo **Preference**:
pedido 20/05 · afectación 28/05 · RCI 10/06 · matriculación 05/07.

| Concepto | Mes en que se genera | Se cobra en la nómina de |
|---|---|---|
| Puntos del pedido (si el plan los da) | Mayo | Junio (puntos: solo cuentan para el tramo de mayo) |
| Bonus de tipo *pedido* o *afectación* | Mayo | Junio |
| Incentivo de financiación y Preference / BOX3 | **Junio** (fecha RCI) | Julio |
| Comisión del coche, puntos del coche, bonus de *matriculación*, conceptos especiales (evento por defecto) | **Julio** | Agosto |

Ningún concepto se genera dos veces.

##### Ejemplo 5 — Tasa de intervención y comisión del coche
Renault, junio: **10 VN** con mes de cómputo junio; **7** de ellos con fecha RCI en junio y tipo Crédito/Preference/Renting → **70 %**. Objetivo de la marca: 65 % → **cumplida**.
- Tarifa del Clio, tramo X+1: **250 €** (tasa cumplida) / **180 €** (no cumplida) → se paga **250 €**.
- Si fueran 6 financiados → 60 % → **no cumplida** → 180 €.
- Si el expediente tiene comisión de coche fijada a mano de **300 €** → se paga **300 €**.
- Si no hay tarifa para ese modelo y tramo → **0 €** con el aviso "Sin tarifa para el modelo Clio en el tramo X+1".

##### Ejemplo 6 — Comisión VO
**Vendedor VN que vende VO.** Tarifa KM0: primera unidad 120 €, resto 60 €, mínimo 0.
- 3 KM0 cobrados en el mes → 120 + 60 + 60 = **240 €**.
- Un KM0 y un Usado → cada subtipo tiene su propia "primera": 120 € + la primera del Usado.
- Con **mínimo 2** y solo 1 KM0 → **0 €**. Con mínimo 2 y 3 KM0 → 240 €.

**Vendedor VO con escala** (unidad 1 = 150 €, 2 = 170 €, 3 = 190 €):
- 5 unidades → 150 + 170 + 190 + 190 + 190 = **890 €**.
- Sin escala definida → 5 × 150 € = **750 €**.

##### Ejemplo 7 — Total del mes (datos de la base de demostración)

| Concepto | Importe |
|---|---|
| Base VN | 890,00 € |
| Base VO | 120,00 € |
| Crédito / financiación | 360,00 € |
| Preference / BOX3 | 150,00 € |
| Bonus / reglas | 200,00 € |
| Conceptos especiales | 75,00 € |
| **Comisión bruta** | **1.795,00 €** |
| Penalización del plan | −150,00 € |
| **Comisión neta** | **1.645,00 €** |

Mes de pago: el mes siguiente al de liquidación.

##### Ejemplo 8 — Corregir un mes cerrado
La liquidación de julio está **cerrada** con un neto de **1.600 €**. Alfonso corrige la fecha de matriculación de un coche y el recálculo da **1.750 €**.
- Se guarda la **versión anterior** (1.600 €) en el historial, con fecha y motivo.
- La liquidación actual pasa a 1.750 €, y se muestra "**+150 €**" de diferencia.
- El libro de puntos añade apuntes de corrección; no borra nada.

##### Ejemplo 9 — Previsión de nómina
Nómina de **julio**: neto de la liquidación de **junio** + comisiones pendientes de meses anteriores + lo "pendiente de cobro" previsto para julio. Si un pendiente estaba previsto para junio y no se cobró, aparece **atrasado**.

---

### Anexo B — Diferencias con la app antigua

| Tema | App antigua | App nueva |
|---|---|---|
| Unidad de los objetivos | Mezcla de coches y puntos | **Puntos** |
| Tramo con decimales | Fallaba (caía a X−4) | **Redondeo hacia abajo** |
| Puntos | Enteros (podían redondearse mal) | **Centésimas exactas** |
| Coche con 0 puntos | Se convertía en 1 | **Se respeta el 0** |
| Demo | Contaba como VN | **VO** |
| VO | Fecha de facturación o matriculación | **Solo fecha de cobro** |
| Mínimo de matriculaciones | Si no llegabas, la comisión de todo el mes era 0 | **No existe** |
| Cupo de ventas multiplicadas | Por número de cupo, con fecha distinta de la de los puntos | **Promociones**, con la misma fecha que los puntos |
| Financiación y bonus | Podían contarse en el mes del pedido | **Una sola vez, en el mes de su evento** |
| VO de vendedor VN | Contador global | **Por subtipo** |
| Tasa de intervención | Incluía VO | **Solo VN** |
| Liquidación cerrada | Se podía borrar al recalcular | **Versiones con historial** |
| Recálculo | Todos los expedientes en memoria; sin transacciones | Por mes, por lotes, con protecciones |
| Duplicidad de lógica | Simulador y liquidación separados | **Un único motor** |
| Objetivo | Uno por plan | **Uno por vendedor** |
| Tramos | Columnas fijas X−4 … X+3 | **Rango configurable** |

---

### Anexo C — Reglas confirmadas por Alfonso (resumen)

1. Objetivos por puntos; cada vendedor tiene el suyo (habitual ≈ 13).
2. La venta no da puntos; los dan la **matriculación** (VN) y el **cobro** (VO, y VN con casilla).
3. VN: matriculación por defecto; con "cobrado en otra fecha", **manda el cobro**. La facturación no influye.
4. VO: solo cobro. Usado, KM0, demo y buyback son VO.
5. Pedido: según el plan, da puntos en el mes del pedido; si se matricula en otro mes, **cuenta en los dos**; en el mismo, **una vez**.
6. Coches de doble puntuación = **promociones**: mínimo de unidades de cualquier modelo; si no se llega, valen 1; **la comisión se cobra una sola vez**.
7. Tramo: **redondeo hacia abajo**. Sin mínimo de matriculaciones ni de cobros.
8. Todo configurable en el plan, que tiene rango de fechas.
9. Bonus del plan: se elige el evento (afectación, matriculación, cobro…). Cada evento usa **solo su fecha**.
10. Financiación, Preference/RCI, tasa de intervención, bonus, penalizaciones y VO: **como en la app antigua**.
11. Comisión de coche y de financiación **fijables a mano**.
12. Conceptos especiales por expediente, con evento a elegir.
13. Meses cerrados: **se actualiza todo**, con historial de versiones.
14. Vendedor por defecto: "Mi vendedor"; reasignable.
15. Cobro **a mes vencido**; control de lo que me deben, y previsión de nómina.
16. Importes en céntimos y puntos en centésimas; siempre 2 decimales en pantalla.

---

### Anexo D — Dónde se ve cada cosa

| Qué | Pantalla |
|---|---|
| Puntos, tramo y comisiones estimadas del mes | *Expedientes* → "Detalle y Resumen Estadístico" |
| Objetivo del mes, alertas | *Dashboard* |
| Crear y editar planes | *Comisiones* → lista de planes → Abrir |
| Cotejo de cobros | *Comisiones* → panel inferior de la lista de planes |
| Liquidación, previsión de nómina, libro de puntos, versiones, comparar con la antigua | *Comisiones* → plan → pestaña *Liquidación* |
| Notas, comisiones pendientes, pendiente de cobro | *Comisiones* → plan → pestaña *Notas* |
| Fechas, puntos, promoción, importes a mano, conceptos especiales | *Expedientes* → formulario de expediente |
| Convertir comisiones antiguas, copias | *Configuración* → pestaña *BBDD* |

---

### Anexo E — Pendiente de confirmar

| # | Tema | Estado |
|---|---|---|
| 1 | ❓ Si el **código actual** coincide con este documento tras CORRECCIÓN 9 (solo interfaz) | Revisar al recibir el nuevo zip |
| 2 | ❓ **Contado:** no genera incentivo de financiación. Es lo que hace el código leído y la app antigua; confirmar que es lo que quiere la empresa | Confirmar |
| 3 | ❓ **Renting** se trata como financiación (como Crédito) | Confirmar |
| 4 | ❓ Qué pasa si el **tramo del vendedor queda fuera de las tarifas** configuradas (poco probable con el rango por defecto) | Da 0 € con aviso; confirmar que es lo deseado |
| 5 | ❓ **Arrastre**: se suma al objetivo del vendedor. Confirmar cómo se calcula cada mes (a mano o automático) | Confirmar |
| 6 | ❓ **Numerador y denominador** de la tasa de intervención con fechas distintas | Es el comportamiento antiguo; confirmar |
| 7 | ❓ Que el **orden de las unidades VO** (por fecha de cobro y luego número de expediente) coincide con el criterio de la empresa | Validar con una liquidación real |
| 8 | ❓ Los **importes exactos** de una liquidación real, con la comparación de la Fase 13 | Pendiente de hacer con las 4 liquidaciones antiguas |

---

### Anexo F — Glosario

| Término | Significado |
|---|---|
| **VN / VO** | Vehículo nuevo / vehículo de ocasión (usado, KM0, demo, buyback) |
| **Pedido** | Fecha de creación del expediente |
| **Afectación** | Asignar un bastidor a un VN |
| **RCI** | Financiera de la marca; su fecha marca el mes de la financiación |
| **Matriculación** | Fecha de la matrícula; en VO es solo un dato |
| **Cobro** | Fecha en que se cobra el coche; en VN solo cuenta con la casilla "cobrado en otra fecha" |
| **Objetivo X** | Puntos que hay que hacer en el mes; cada vendedor tiene el suyo |
| **Arrastre** | Puntos o unidades que se suman al objetivo desde meses anteriores |
| **Tramo** | Posición respecto a X (X−4 … X+3), con redondeo hacia abajo |
| **Tasa de intervención** | Porcentaje (o número) de VN de una marca que se financian |
| **Promoción** | Grupo de coches con puntos especiales si se llega a un mínimo de unidades |
| **Unidad comisionable** | Cada coche que cuenta; se comisiona una sola vez |
| **Libro de puntos** | Registro de solo inserción de todos los apuntes de puntos |
| **Liquidación** | Resultado guardado de un vendedor en un mes |
| **Versión** | Copia guardada de una liquidación antes de recalcularla |
| **Cotejo** | Comprobación de lo cobrado en nómina contra lo liquidado |
| **Mes de pago** | Mes siguiente al de liquidación |
| **Mi vendedor** | El vendedor al que se asignan por defecto los expedientes |


---

## Anexo B — Esquema de base de datos ORIGINAL (extraído automáticamente de `src/db/schema.ts`)

> Referencia de **las tablas y columnas del original**. Se conservan las tablas de negocio y se modifican/añaden las indicadas en la sección 4. Las tablas `commission_*` del original se sustituyen por el diseño de 4.6 (se muestran aquí para saber qué existía). Extracción automática: las restricciones compuestas o de índice no listadas deben consultarse en `referencia/gestorVentas-original/src/db/schema.ts`.

#### `tiendas`

| Columna | Tipo | Restricciones / notas |
|---|---|---|
| `id_tienda` | serial | PK |
| `nombre` | text | NOT NULL |
| `ciudad` | varchar(255) |  |

#### `usuarios`

| Columna | Tipo | Restricciones / notas |
|---|---|---|
| `id_usuario` | serial | PK |
| `clerk_id` | varchar(255) | NOT NULL; UNIQUE |
| `nombre` | varchar(255) |  |
| `rol` | varchar(50) | administrador, director, jefe_zona, jefe_tienda, vendedor, invitado |
| `fecha_de_registro` | date |  |
| `bloqueado` | boolean | DEFAULT false |
| `tipo_vendedor` | varchar(50) | NOT NULL; DEFAULT 'VN'; VN, VO |
| `patron_vo` | varchar(100) | DEFAULT 'Estándar VO' |
| `tienda_predeterminada_id` | integer | FK → tiendas.id_tienda (ON DELETE SET NULL) |

#### `usuarios_tiendas`

| Columna | Tipo | Restricciones / notas |
|---|---|---|
| `id_usuario_tienda` | serial | PK |
| `id_usuario` | integer | NOT NULL; FK → usuarios.id_usuario (ON DELETE CASCADE) |
| `id_tienda` | integer | NOT NULL; FK → tiendas.id_tienda (ON DELETE CASCADE) |

#### `emails_usuarios`

| Columna | Tipo | Restricciones / notas |
|---|---|---|
| `id_email_usuario` | serial | PK |
| `id_usuario` | integer | FK → usuarios.id_usuario (ON DELETE CASCADE) |
| `email` | varchar(255) | NOT NULL |
| `tipo_email` | varchar(100) |  |

#### `telefonos_usuarios`

| Columna | Tipo | Restricciones / notas |
|---|---|---|
| `id_telefono_usuario` | serial | PK |
| `id_usuario` | integer | FK → usuarios.id_usuario (ON DELETE CASCADE) |
| `telefono` | varchar(50) | NOT NULL |
| `tipo_telefono` | varchar(100) |  |

#### `clientes`

| Columna | Tipo | Restricciones / notas |
|---|---|---|
| `id` | serial | PK |
| `cliente_id` | varchar(255) | NOT NULL; UNIQUE |
| `dni` | varchar(50) |  |
| `nombre` | varchar(255) |  |
| `fecha_de_nacimiento` | date |  |
| `tienda_id` | integer | FK → tiendas.id_tienda |

#### `emails_clientes`

| Columna | Tipo | Restricciones / notas |
|---|---|---|
| `id_email_cliente` | serial | PK |
| `id_cliente` | integer | FK → clientes.id (ON DELETE CASCADE) |
| `email` | varchar(255) | NOT NULL |
| `tipo_email` | varchar(100) |  |

#### `telefonos_clientes`

| Columna | Tipo | Restricciones / notas |
|---|---|---|
| `id_telefono_cliente` | serial | PK |
| `id_cliente` | integer | FK → clientes.id (ON DELETE CASCADE) |
| `telefono` | varchar(50) | NOT NULL |
| `tipo_telefono` | varchar(100) |  |

#### `marcas`

| Columna | Tipo | Restricciones / notas |
|---|---|---|
| `id_marca` | serial | PK |
| `nombre` | text | NOT NULL |
| `activo` | boolean | DEFAULT true |
| `acceso_rapido` | boolean | DEFAULT false |
| `sistema_comisiones` | boolean | NOT NULL; DEFAULT false |

#### `modelos`

| Columna | Tipo | Restricciones / notas |
|---|---|---|
| `id_modelo` | serial | PK |
| `marca_id` | integer | FK → marcas.id_marca (ON DELETE CASCADE) |
| `nombre_modelo` | text | NOT NULL |
| `acceso_rapido` | boolean | DEFAULT false |
| `orden_acceso_rapido` | integer | DEFAULT 0 |

#### `tipo_de_venta`

| Columna | Tipo | Restricciones / notas |
|---|---|---|
| `id_tipo_de_venta` | serial | PK |
| `nombre_tipo_venta` | text | NOT NULL |
| `color` | varchar(50) | DEFAULT '#3b82f6' |
| `orden` | integer | NOT NULL; DEFAULT 0 |

#### `estado_vehiculo`

| Columna | Tipo | Restricciones / notas |
|---|---|---|
| `id_estado_vehiculo` | serial | PK |
| `nombre_estado_vehiculo` | text | NOT NULL |
| `predeterminado` | boolean | DEFAULT false |

#### `expedientes`

| Columna | Tipo | Restricciones / notas |
|---|---|---|
| `id_expediente` | serial | PK |
| `id_usuario` | integer | FK → usuarios.id_usuario |
| `id_cliente` | integer | FK → clientes.id |
| `id_modelo` | integer | FK → modelos.id_modelo |
| `id_tienda` | integer | FK → tiendas.id_tienda |
| `fecha_expediente` | date |  |
| `fecha_afectacion` | date |  |
| `fecha_matriculacion` | date |  |
| `fecha_entrega` | date |  |
| `fecha_rci` | date |  |
| `fecha_facturacion` | date |  |
| `matricula` | varchar(50) |  |
| `id_tipo_de_venta` | integer | FK → tipoDeVenta.id_tipo_de_venta |
| `id_estado_vehiculo` | integer | FK → estadoVehiculo.id_estado_vehiculo |
| `vin` | varchar(100) |  |
| `valor_objetivo` | doublePrecision |  |
| `min_coches_multiplicador` | integer | NOT NULL; DEFAULT 0 |
| `cobrado_otra_fecha` | boolean | NOT NULL; DEFAULT false |
| `fecha_cobrado` | date |  |
| `comision_cobrada` | boolean | NOT NULL; DEFAULT false |
| `comision_coche_cobrada` | boolean | NOT NULL; DEFAULT false |
| `comision_usado_cobrada` | boolean | NOT NULL; DEFAULT false |
| `comision_financiacion_cobrada` | boolean | NOT NULL; DEFAULT false |
| `comision_preference_cobrada` | boolean | NOT NULL; DEFAULT false |
| `comision_bonus_cobrada` | boolean | NOT NULL; DEFAULT false |
| `comision_coche_real` | doublePrecision |  |
| `comision_financiacion_real` | doublePrecision |  |
| `conceptos_adicionales` | text |  |

#### `commission_plans`

| Columna | Tipo | Restricciones / notas |
|---|---|---|
| `id_plan` | serial | PK |
| `nombre` | text | NOT NULL |
| `fecha_inicio` | date | NOT NULL |
| `fecha_fin` | date | NOT NULL |
| `estado` | varchar(50) | NOT NULL; DEFAULT 'activo'; borrador, activo, cerrado |
| `objetivo_base` | integer | NOT NULL; DEFAULT 0 |
| `arrastre` | integer | NOT NULL; DEFAULT 0 |
| `min_matriculaciones` | integer | NOT NULL; DEFAULT 6 |
| `min_coches_multiplicador` | integer | NOT NULL; DEFAULT 0 |
| `penalizacion_importe` | integer | NOT NULL; DEFAULT 0 |
| `penalizacion_titulo` | text |  |
| `penalizacion_descripcion` | text |  |
| `notas_adicionales` | text |  |

#### `commission_plan_model_rates`

| Columna | Tipo | Restricciones / notas |
|---|---|---|
| `id_rate` | serial | PK |
| `id_plan` | integer | NOT NULL; FK → commissionPlans.id_plan (ON DELETE CASCADE) |
| `id_modelo` | integer | NOT NULL; FK → modelos.id_modelo (ON DELETE CASCADE) |
| `tasa_intervencion_cumplida` | boolean | NOT NULL; DEFAULT false; false = inferior, true = superior/igual |
| `rate_x_minus_4` | integer | NOT NULL; DEFAULT 0 |
| `rate_x_minus_3` | integer | NOT NULL; DEFAULT 0 |
| `rate_x_minus_2` | integer | NOT NULL; DEFAULT 0 |
| `rate_x_minus_1` | integer | NOT NULL; DEFAULT 0 |
| `rate_x` | integer | NOT NULL; DEFAULT 0 |
| `rate_x_plus_1` | integer | NOT NULL; DEFAULT 0 |
| `rate_x_plus_2` | integer | NOT NULL; DEFAULT 0 |
| `rate_x_plus_3` | integer | NOT NULL; DEFAULT 0 |
| `valor_objetivo` | doublePrecision | NOT NULL; DEFAULT 1; valor computable objetivo (ej. 1 o 2) - Conservado para evitar conflictos interactivos de migración |
| `activo` | boolean | NOT NULL; DEFAULT true |

#### `commission_rules`

| Columna | Tipo | Restricciones / notas |
|---|---|---|
| `id_rule` | serial | PK |
| `id_plan` | integer | NOT NULL; FK → commissionPlans.id_plan (ON DELETE CASCADE) |
| `nombre` | text | NOT NULL |
| `tipo_evento` | varchar(50) | NOT NULL; pedido, afectacion, matriculacion, financiacion, preference, manual |
| `id_marca` | integer | FK → marcas.id_marca (ON DELETE SET NULL) |
| `id_modelo` | integer | FK → modelos.id_modelo (ON DELETE SET NULL) |
| `afecta_objetivo` | boolean | NOT NULL; DEFAULT false |
| `valor_objetivo` | integer | NOT NULL; DEFAULT 0 |
| `afecta_comision` | boolean | NOT NULL; DEFAULT false |
| `importe` | integer | NOT NULL; DEFAULT 0 |
| `activa` | boolean | NOT NULL; DEFAULT true |
| `tasa_intervencion_cumplida` | boolean | null = siempre, true = >= target, false = < target |
| `ligar_a_credito` | boolean | NOT NULL; DEFAULT false |

#### `commission_bonus_rules`

| Columna | Tipo | Restricciones / notas |
|---|---|---|
| `id_bonus` | serial | PK |
| `id_plan` | integer | NOT NULL; FK → commissionPlans.id_plan (ON DELETE CASCADE) |
| `nombre` | text | NOT NULL |
| `descripcion` | text |  |
| `tipo_evento` | varchar(50) | NOT NULL; pedido, afectacion, matriculacion, financiacion, preference, manual |
| `id_marca` | integer | FK → marcas.id_marca (ON DELETE SET NULL) |
| `id_modelo` | integer | FK → modelos.id_modelo (ON DELETE SET NULL) |
| `importe` | integer | NOT NULL; DEFAULT 0 |
| `afecta_objetivo` | boolean | NOT NULL; DEFAULT false |
| `valor_objetivo` | integer | NOT NULL; DEFAULT 0 |
| `fecha_inicio` | date |  |
| `fecha_fin` | date |  |
| `activo` | boolean | NOT NULL; DEFAULT true |
| `tipo_vehiculo` | varchar(50) | NOT NULL; DEFAULT 'cualquiera'; nuevo, usado, cualquiera |
| `es_penalizacion` | boolean | NOT NULL; DEFAULT false |

#### `commission_finance_rules`

| Columna | Tipo | Restricciones / notas |
|---|---|---|
| `id_finance` | serial | PK |
| `id_plan` | integer | NOT NULL; FK → commissionPlans.id_plan (ON DELETE CASCADE) |
| `importe_normal` | integer | NOT NULL; DEFAULT 0 |
| `importe_preference` | integer | NOT NULL; DEFAULT 0 |

#### `commission_used_rates`

| Columna | Tipo | Restricciones / notas |
|---|---|---|
| `id_used_rate` | serial | PK |
| `id_plan` | integer | NOT NULL; FK → commissionPlans.id_plan (ON DELETE CASCADE) |
| `tipo_usado` | varchar(50) | NOT NULL; VO, KM0, BB, Usado |
| `importe_primera` | integer | NOT NULL; DEFAULT 0 |
| `importe_resto` | integer | NOT NULL; DEFAULT 0 |
| `valor_objetivo` | integer | NOT NULL; DEFAULT 1 |
| `min_aplicar` | integer | NOT NULL; DEFAULT 1 |
| `activo` | boolean | NOT NULL; DEFAULT true |

#### `commission_finance_rates`

| Columna | Tipo | Restricciones / notas |
|---|---|---|
| `id_finance_rate` | serial | PK |
| `id_plan` | integer | NOT NULL; FK → commissionPlans.id_plan (ON DELETE CASCADE) |
| `id_marca` | integer | NOT NULL; FK → marcas.id_marca (ON DELETE CASCADE) |
| `tipo_financiacion` | varchar(50) | NOT NULL; Crédito, Preference, Renting, Contado |
| `importe` | integer | NOT NULL; DEFAULT 0 |

#### `commission_preference_rules`

| Columna | Tipo | Restricciones / notas |
|---|---|---|
| `id_pref_rule` | serial | PK |
| `id_plan` | integer | NOT NULL; FK → commissionPlans.id_plan (ON DELETE CASCADE) |
| `nombre` | text | NOT NULL |
| `id_marca` | integer | FK → marcas.id_marca (ON DELETE SET NULL) |
| `id_modelo` | integer | FK → modelos.id_modelo (ON DELETE SET NULL) |
| `tipo_financiacion` | varchar(50) | RCI, BOX3, Preference, etc. |
| `importe` | integer | NOT NULL; DEFAULT 0 |
| `activa` | boolean | NOT NULL; DEFAULT true |

#### `commission_vo_patterns`

| Columna | Tipo | Restricciones / notas |
|---|---|---|
| `id_vo_pattern` | serial | PK |
| `id_plan` | integer | NOT NULL; FK → commissionPlans.id_plan (ON DELETE CASCADE) |
| `nombre` | text | NOT NULL |
| `aplica_a_vn` | boolean | NOT NULL; DEFAULT false |
| `activo` | boolean | NOT NULL; DEFAULT true |
| `tiers` | text | NOT NULL; DEFAULT '[]'; JSON string: [{ unidad: 1, importe: 150, valor_objetivo: 1 }] |

#### `commission_brand_intervention_rates`

| Columna | Tipo | Restricciones / notas |
|---|---|---|
| `id_intervention_rate` | serial | PK |
| `id_plan` | integer | NOT NULL; FK → commissionPlans.id_plan (ON DELETE CASCADE) |
| `id_marca` | integer | NOT NULL; FK → marcas.id_marca (ON DELETE CASCADE) |
| `tasa_intervencion` | integer | NOT NULL; DEFAULT 70; e.g. 70 para 70% |
| `valor_objetivo_defecto` | doublePrecision | NOT NULL; DEFAULT 1.0 |
| `tipo_tasa` | varchar(50) | NOT NULL; DEFAULT 'porcentaje' |

#### `commission_liquidations`

| Columna | Tipo | Restricciones / notas |
|---|---|---|
| `id_liquidation` | serial | PK |
| `id_plan` | integer | NOT NULL; FK → commissionPlans.id_plan (ON DELETE CASCADE) |
| `estado` | varchar(50) | NOT NULL; DEFAULT 'borrador'; borrador, calculada, revisada, cerrada |
| `fecha_calculo` | date | NOT NULL |
| `objetivo_base_snapshot` | integer | NOT NULL |
| `arrastre_snapshot` | integer | NOT NULL |
| `x_calculado_snapshot` | integer | NOT NULL |
| `total_computables_snapshot` | integer | NOT NULL; DEFAULT 0 |
| `tramo_alcanzado_snapshot` | varchar(20) | NOT NULL; X-3, X-2, X-1, X, X+1, X+2 |
| `matriculaciones_reales_snapshot` | integer | NOT NULL; DEFAULT 0 |
| `cumple_minimo_snapshot` | boolean | NOT NULL; DEFAULT false |
| `total_comision_economica` | integer | NOT NULL; DEFAULT 0 |
| `penalizacion_importe_snapshot` | integer | NOT NULL; DEFAULT 0 |
| `penalizacion_titulo_snapshot` | text |  |
| `penalizacion_descripcion_snapshot` | text |  |

#### `commission_liquidation_lines`

| Columna | Tipo | Restricciones / notas |
|---|---|---|
| `id_line` | serial | PK |
| `id_liquidation` | integer | NOT NULL; FK → commissionLiquidations.id_liquidation (ON DELETE CASCADE) |
| `id_expediente` | integer | FK → expedientes.id_expediente (ON DELETE SET NULL) |
| `vendedor_nombre` | text | NOT NULL |
| `cliente_nombre` | text | NOT NULL |
| `marca_nombre` | text | NOT NULL |
| `modelo_nombre` | text | NOT NULL |
| `fecha_pedido` | date |  |
| `fecha_afectacion` | date |  |
| `fecha_matriculacion` | date |  |
| `entra_por_pedido` | boolean | NOT NULL; DEFAULT false |
| `entra_por_afectacion` | boolean | NOT NULL; DEFAULT false |
| `entra_por_matriculacion` | boolean | NOT NULL; DEFAULT false |
| `valor_para_objetivo` | integer | NOT NULL; DEFAULT 0 |
| `comision_base` | integer | NOT NULL; DEFAULT 0 |
| `comision_base_vn` | integer | NOT NULL; DEFAULT 0 |
| `comision_usado` | integer | NOT NULL; DEFAULT 0 |
| `comision_financiacion` | integer | NOT NULL; DEFAULT 0 |
| `comision_preference` | integer | NOT NULL; DEFAULT 0 |
| `bonus_acumulado` | integer | NOT NULL; DEFAULT 0 |
| `total_generado` | integer | NOT NULL; DEFAULT 0 |
| `mes_generacion` | varchar(50) | NOT NULL |
| `mes_pago_estimado` | varchar(50) | NOT NULL |

#### `commission_liquidation_line_items`

| Columna | Tipo | Restricciones / notas |
|---|---|---|
| `id_line_item` | serial | PK |
| `id_line` | integer | NOT NULL; FK → commissionLiquidationLines.id_line (ON DELETE CASCADE) |
| `concepto` | text | NOT NULL; ej. "Comisión Base", "Preference", "Bonus HEV" |
| `importe` | integer | NOT NULL; DEFAULT 0 |
| `afecta_objetivo` | boolean | NOT NULL; DEFAULT false |
| `valor_objetivo` | integer | NOT NULL; DEFAULT 0 |

#### `importaciones_bloques`

| Columna | Tipo | Restricciones / notas |
|---|---|---|
| `id` | serial | PK |
| `fecha` | varchar(100) | NOT NULL; ISO timestamp |
| `nombre_archivo` | varchar(255) | NOT NULL |
| `tipo_archivo` | varchar(50) | NOT NULL; Excel, CSV |
| `usuario_id` | integer | FK → usuarios.id_usuario (ON DELETE SET NULL) |
| `creados` | integer | NOT NULL; DEFAULT 0 |
| `modificados` | integer | NOT NULL; DEFAULT 0 |
| `omitidos` | integer | NOT NULL; DEFAULT 0 |

#### `importaciones_registros`

| Columna | Tipo | Restricciones / notas |
|---|---|---|
| `id` | serial | PK |
| `bloque_id` | integer | NOT NULL; FK → importacionesBloques.id (ON DELETE CASCADE) |
| `id_expediente` | integer | FK → expedientes.id_expediente (ON DELETE SET NULL) |
| `tipo_accion` | varchar(50) | NOT NULL; creado, modificado, omitido |
| `cliente_nombre` | varchar(255) | NOT NULL |
| `matricula` | varchar(50) |  |
| `bastidor` | varchar(100) |  |
| `cambios` | text | JSON string of changes |

#### `ajustes`

| Columna | Tipo | Restricciones / notas |
|---|---|---|
| `clave` | varchar(255) | PK |
| `valor` | text | NOT NULL |

---

## Anexo C — `globals.css` ORIGINAL (íntegro; referencia exacta de valores)

> Es la **especificación de diseño**: el `globals.css` nuevo debe producir **el mismo resultado visual** (mismos valores de variables, clases, animaciones y comportamiento en tema claro/oscuro). Cambio permitido: sustituir la línea `@import` de Google Fonts por declaraciones `@font-face` con los `.woff2` locales de *Outfit* y *Plus Jakarta Sans* (`public/fonts`), manteniendo `--font-title` y `--font-body`.

```css
@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&display=swap');

:root {
  /* Paleta de Colores HSL Premium */
  --primary-hue: 255;
  --secondary-hue: 195;
  --accent-hue: 335;
  
  --primary: hsl(var(--primary-hue), 85%, 62%);
  --primary-hover: hsl(var(--primary-hue), 85%, 52%);
  --secondary: hsl(var(--secondary-hue), 90%, 55%);
  --accent: hsl(var(--accent-hue), 85%, 60%);
  
  /* Colores de Fondo y Superficie (Oscuro por defecto) */
  --bg-app: hsl(230, 25%, 8%);
  --bg-surface: hsl(230, 25%, 12%);
  --bg-card: hsl(230, 25%, 12%);
  --bg-overlay: rgba(0, 0, 0, 0.7);
  --bg-surface-glass: rgba(13, 16, 27, 0.65);
  --bg-surface-hover: hsl(230, 25%, 16%);
  --bg-surface-tint: rgba(255, 255, 255, 0.02);
  --bg-input: rgba(255, 255, 255, 0.04);
  --bg-input-focus: rgba(255, 255, 255, 0.08);
  --bg-btn-secondary: rgba(255, 255, 255, 0.06);
  --bg-btn-secondary-hover: rgba(255, 255, 255, 0.12);
  
  /* Colores de Estado */
  --success: hsl(145, 80%, 45%);
  --warning: hsl(40, 95%, 55%);
  --danger: hsl(0, 85%, 60%);
  --info: hsl(200, 85%, 55%);
  
  /* Colores de Texto */
  --text-primary: hsl(220, 20%, 98%);
  --text-secondary: hsl(220, 12%, 75%);
  --text-muted: hsl(220, 10%, 55%);
  
  /* Bordes y Sombras */
  --border-light: rgba(255, 255, 255, 0.08);
  --border-focus: rgba(124, 58, 237, 0.5);
  --shadow-sm: 0 2px 8px rgba(0, 0, 0, 0.15);
  --shadow-md: 0 8px 30px rgba(0, 0, 0, 0.3);
  --shadow-lg: 0 16px 40px rgba(0, 0, 0, 0.4);
  --shadow-glow: 0 0 20px rgba(124, 58, 237, 0.35);
  
  /* Fuentes */
  --font-title: 'Outfit', sans-serif;
  --font-body: 'Plus Jakarta Sans', sans-serif;
  
  /* Bordes Redondeados */
  --radius-sm: 8px;
  --radius-md: 14px;
  --radius-lg: 20px;
  --radius-xl: 30px;
  
  /* Transiciones */
  --transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

html[data-theme='light'] {
  --bg-app: hsl(220, 30%, 96%);
  --bg-surface: hsl(0, 0%, 100%);
  --bg-card: hsl(0, 0%, 100%);
  --bg-overlay: rgba(15, 23, 42, 0.35);
  --bg-surface-glass: rgba(255, 255, 255, 0.85);
  --bg-surface-hover: hsl(220, 20%, 93%);
  --bg-surface-tint: rgba(0, 0, 0, 0.02);
  --bg-input: rgba(0, 0, 0, 0.03);
  --bg-input-focus: rgba(0, 0, 0, 0.06);
  --bg-btn-secondary: rgba(0, 0, 0, 0.04);
  --bg-btn-secondary-hover: rgba(0, 0, 0, 0.08);
  
  --text-primary: hsl(224, 71.4%, 4%);
  --text-secondary: hsl(220, 10%, 35%);
  --text-muted: hsl(220, 10%, 55%);
  
  --border-light: rgba(0, 0, 0, 0.08);
  --border-focus: rgba(124, 58, 237, 0.3);
  
  --shadow-sm: 0 2px 8px rgba(0, 0, 0, 0.05);
  --shadow-md: 0 8px 30px rgba(0, 0, 0, 0.08);
  --shadow-lg: 0 16px 40px rgba(0, 0, 0, 0.12);
  --shadow-glow: 0 0 15px rgba(124, 58, 237, 0.15);
}

/* Reset y Estilos Base */
*, *::before, *::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

html, body {
  background-color: var(--bg-app);
  color: var(--text-primary);
  font-family: var(--font-body);
  -webkit-font-smoothing: antialiased;
  min-height: 100vh;
  overflow-x: hidden;
}

h1, h2, h3, h4, h5, h6 {
  font-family: var(--font-title);
  color: var(--text-primary);
  font-weight: 700;
  letter-spacing: -0.02em;
}

a {
  color: var(--primary);
  text-decoration: none;
  transition: var(--transition);
}
a:hover {
  color: var(--secondary);
}

/* Scrollbar Personalizado */
::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}
::-webkit-scrollbar-track {
  background: var(--bg-app);
}
::-webkit-scrollbar-thumb {
  background: var(--bg-surface);
  border-radius: var(--radius-sm);
  border: 2px solid var(--bg-app);
}
::-webkit-scrollbar-thumb:hover {
  background: var(--primary);
}

/* Efectos de Fondo */
.glow-bg {
  position: fixed;
  top: -10%;
  left: -10%;
  width: 120vw;
  height: 120vh;
  background: 
    radial-gradient(circle at 10% 20%, rgba(124, 58, 237, 0.15) 0%, transparent 40%),
    radial-gradient(circle at 90% 80%, rgba(6, 182, 212, 0.12) 0%, transparent 45%);
  z-index: -1;
  pointer-events: none;
}

/* Componentes de Cristal (Glassmorphism) */
.glass-panel {
  background: var(--bg-surface-glass);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-md);
}

.glass-panel-interactive {
  background: var(--bg-surface-glass);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-md);
  transition: var(--transition);
  cursor: pointer;
}
.glass-panel-interactive:hover {
  transform: translateY(-4px);
  border-color: rgba(124, 58, 237, 0.25);
  box-shadow: var(--shadow-lg), var(--shadow-glow);
}

/* Elementos del Formulario */
.form-group {
  margin-bottom: 20px;
}

.form-label {
  display: block;
  font-family: var(--font-title);
  font-weight: 500;
  font-size: 0.9rem;
  color: var(--text-secondary);
  margin-bottom: 8px;
}

.form-input, .form-select {
  width: 100%;
  padding: 12px 16px;
  background: var(--bg-input);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-sm);
  color: var(--text-primary);
  font-family: var(--font-body);
  font-size: 0.95rem;
  outline: none;
  transition: var(--transition);
}
.form-input:focus, .form-select:focus {
  border-color: var(--primary);
  background: var(--bg-input-focus);
  box-shadow: 0 0 0 3px var(--border-focus);
}

/* Forzar legibilidad de las opciones en los selectores en cualquier navegador */
select, select option {
  background-color: var(--bg-surface) !important;
  color: var(--text-primary) !important;
}

/* Botones con Micro-animación */
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 12px 24px;
  border-radius: var(--radius-sm);
  font-family: var(--font-title);
  font-weight: 600;
  font-size: 0.95rem;
  cursor: pointer;
  border: none;
  outline: none;
  transition: var(--transition);
  text-decoration: none;
  gap: 8px;
}

.btn-primary {
  background: linear-gradient(135deg, var(--primary), hsl(var(--primary-hue), 85%, 50%));
  color: #fff;
  box-shadow: 0 4px 15px rgba(124, 58, 237, 0.3);
}
.btn-primary:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(124, 58, 237, 0.5), var(--shadow-glow);
  background: linear-gradient(135deg, var(--primary-hover), var(--primary));
}
.btn-primary:active {
  transform: translateY(0);
}

.btn-secondary {
  background: var(--bg-btn-secondary);
  border: 1px solid var(--border-light);
  color: var(--text-primary);
}
.btn-secondary:hover {
  background: var(--bg-btn-secondary-hover);
  border-color: rgba(255, 255, 255, 0.2);
  transform: translateY(-2px);
}

/* Badges / Etiquetas de Roles y Estados */
.badge {
  display: inline-flex;
  align-items: center;
  padding: 4px 10px;
  border-radius: 20px;
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  gap: 4px;
}
.badge-admin { background: rgba(244, 63, 94, 0.15); color: #fb7185; border: 1px solid rgba(244, 63, 94, 0.2); }
.badge-director { background: rgba(168, 85, 247, 0.15); color: #c084fc; border: 1px solid rgba(168, 85, 247, 0.2); }
.badge-zona { background: rgba(59, 130, 246, 0.15); color: #60a5fa; border: 1px solid rgba(59, 130, 246, 0.2); }
.badge-tienda { background: rgba(20, 184, 166, 0.15); color: #2dd4bf; border: 1px solid rgba(20, 184, 166, 0.2); }
.badge-vendedor { background: rgba(234, 179, 8, 0.15); color: #facc15; border: 1px solid rgba(234, 179, 8, 0.2); }
.badge-invitado { background: rgba(156, 163, 175, 0.15); color: #9ca3af; border: 1px solid rgba(156, 163, 175, 0.2); }

/* Tablas Premium */
.table-container {
  overflow-x: auto;
  border-radius: var(--radius-md);
  border: 1px solid var(--border-light);
}

.table-premium {
  width: 100%;
  border-collapse: collapse;
  text-align: left;
}
.table-premium th {
  background: var(--bg-surface-tint);
  padding: 16px;
  font-family: var(--font-title);
  font-weight: 600;
  font-size: 0.85rem;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  border-bottom: 1px solid var(--border-light);
}
.table-premium td {
  padding: 16px;
  border-bottom: 1px solid var(--border-light);
  color: var(--text-secondary);
  font-size: 0.95rem;
  transition: var(--transition);
}
.table-premium tr:hover td {
  background: var(--bg-surface-tint);
  color: var(--text-primary);
}
.table-premium tr:last-child td {
  border-bottom: none;
}

.table-compact th,
.table-compact td {
  padding: 8px 10px;
  font-size: 0.85rem;
}
```

---

## Anexo D — Rutas API del ORIGINAL y permiso que comprueban (extraído automáticamente)

| Ruta | Métodos | Permiso comprobado en el código original | Líneas |
|---|---|---|---|
| `/api/admin/ajustes` | GET,POST | solo administrador | 71 |
| `/api/admin/backup` | GET,POST | solo administrador | 213 |
| `/api/admin/catalogos` | GET,POST,DELETE,PUT | solo administrador | 267 |
| `/api/admin/db-cleanup` | GET,POST | solo administrador | 220 |
| `/api/admin/tiendas` | POST,DELETE,PUT | solo administrador | 102 |
| `/api/admin/usuarios` | POST,PUT,DELETE | solo administrador | 192 |
| `/api/admin/usuarios/rol` | PUT | solo administrador | 47 |
| `/api/buscar` | GET | sesión iniciada (sin comprobación de rol) | 78 |
| `/api/clientes` | POST,PUT,DELETE | no invitado | 223 |
| `/api/clientes/buscar` | GET | sesión iniciada (sin comprobación de rol) | 38 |
| `/api/clientes/import` | POST | no invitado | 141 |
| `/api/clientes/verificar-existencia` | POST | sesión iniciada (sin comprobación de rol) | 58 |
| `/api/comisiones/liquidar` | GET,POST,PUT | solo administrador | 1029 |
| `/api/comisiones/planes` | GET,POST,PUT,DELETE | solo administrador | 729 |
| `/api/comisiones/verificar` | GET | sesión iniciada (sin comprobación de rol) | 152 |
| `/api/expedientes` | GET,POST,PUT,DELETE | no invitado | 447 |
| `/api/expedientes/import` | POST | no invitado | 318 |
| `/api/expedientes/importar-excel/procesar` | POST | no invitado | 260 |
| `/api/expedientes/importar-excel/verificar` | POST | no invitado | 119 |
| `/api/expedientes/simular-comision` | POST | sesión iniciada (sin comprobación de rol) | 850 |
| `/api/importaciones` | GET,DELETE | no invitado | 88 |
| `/api/perfil` | GET,POST | sesión iniciada (sin comprobación de rol) | 109 |
| `/api/usuario/tienda-predeterminada` | POST | sesión iniciada (sin comprobación de rol) | 39 |

> Nota: la comprobación se detecta **a nivel de archivo**; en `/api/comisiones/planes` el control de administrador está en un asistente usado por POST/PUT/DELETE, y el GET de lectura exige solo sesión [I]. Todas las rutas del original exigen sesión de Clerk (`auth()`), salvo que se indique lo contrario.

---

## Anexo E — `Prompts.txt` ORIGINAL (íntegro): peticiones de interfaz del propietario

> Son **criterios de aceptación** de interfaz y comportamiento ya pedidos por el propietario durante el desarrollo de la app original. Se leen como requisitos (`[V-Prompts]`).

```text
Los expedientes no se crean correctamente. Sale: Error:
No transactions support in neon-http driver

En el expediente, me sale Id Tienda. Quiero poder crear las tiendas, y luego aquí aparezca un desplegable para elegir.
El usuario, si tiene un rol de vendedor para arriba, podrá seleccionar las tiendas en las que trabaja. Si solo tiene una tienda en la que trabaja, en expedientes, en el idTienda, quiero que aparezca esa tienda seleccionada por defecto cuando añade un expediente.

Quiero que al ser administrador, poder crear, editar, eliminar:
Marcas, modelos, clientes, expedientes, tipos de pago, etc.
Si algún marca y modelo tienen un expediente creado, que no me deje eliminarlo para que no se pierda la conexión.

El fondo se ve demasiado oscuro, haz que sea posible modo claro y modo oscuro.

En los menus desplegables, se ve el fondo blanco y no se puede ver el texto del contenido que tiene el desplegable, por lo tanto, haz que las letras sean de color mas claro y el fondo del color oscuro, o aplica una coloración acorde al resto de la app.

Quiero tener una sección de Marcas. Otra de Modelos. Los modelos irán asociados a las marcas como tiene que ser.

Revisa si todo te parece bien o tienes alguna duda.



Los expedientes no se crean correctamente. Sale: Error:
No transactions support in neon-http driver

En el expediente, me sale Id Tienda. Quiero poder crear las tiendas, y luego aquí aparezca un desplegable para elegir.
El usuario, si tiene un rol de vendedor para arriba, podrá seleccionar las tiendas en las que trabaja. Si solo tiene una tienda en la que trabaja, en expedientes, en el idTienda, quiero que aparezca esa tienda seleccionada por defecto cuando añade un expediente.

Quiero que al ser administrador, poder crear, editar, eliminar:
Marcas, modelos, clientes, expedientes, tipos de pago, etc.
Si algún marca y modelo tienen un expediente creado, que no me deje eliminarlo para que no se pierda la conexión.

El fondo se ve demasiado oscuro, haz que sea posible modo claro y modo oscuro.

En los menus desplegables, se ve el fondo blanco y no se puede ver el texto del contenido que tiene el desplegable, por lo tanto, haz que las letras sean de color mas claro y el fondo del color oscuro, o aplica una coloración acorde al resto de la app.

Quiero tener una sección de Marcas. Otra de Modelos. Los modelos irán asociados a las marcas como tiene que ser.

Revisa si todo te parece bien o tienes alguna duda.


------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------



Quita el botón de Nuevo expediente de los botones laterales, pues se crearán desde la sección de expedientes. No tiene sentido tener este también.

------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

En el dashboard, no se de donde sale el indicador de volumen ventas ni tasa de efectividad. 
Sustituyelo por:
Expedientes Creados en Mes Actual.
Expedientes según tipo de pago, con el numero. Algo asi:
Expedientes Contado (Coge el nombre según esté creado) = 3
Expedientes Financiación Credito (Coge el nombre según esté creado) = 6
Expedientes Financiación Preference (Coge el nombre según esté creado) = 3

Ahora el expediente tiene asignado el cliente, desde la base de datos de cliente. En el expediente, se muestran los datos del cliente pero no deja modificarlos. Quiero que me permita editar los datos y tenga su propio guardado, es decir, si cambio los datos del cliente desde el expediente, que aparezca un botón de guardado y guarde los cambios en la base de datos de clientes.
También, un cliente puede tener varios expedientes, pues ha podido comprar varios vehículos. Quiero que en el listado de clientes, aparezca el numero de expedientes que tiene. Y al hacer click en el botón del numero de expedientes, salga un modal que muestre el numero de expedientes que tiene. Por supuesto, desde ese modal, podré ir a editar ese expediente.


------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------


Quita el botón lateral Mis Datos. Esto se gesrionará mediante un botón tipo lapiz, donde muestra el nombre de usuario.
En los usuarios, si es administrador, no se podrá suspender a un administrador. Y para eliminar, debe de salir un modal y que verifique su eliminación.
Las marcas y modelos, tendrán un nuevo dato, booleano, llamado Acceso Rapido.

En el dashboard, la sección que muestra los últimos expedientes, solo mostrará los últimos 5.
También, en el dashboard, habrá una sección debajo de los últimos expedientes, la cual mostrará por secciones, las marcas que tengan activado Acceso Rapido.
Luego, en cada sección según su marca, mostrará los modelos que tengan activado el Acceso Rapido.
Debajo de cada modelo, habrá unos botones, que serán los tipos de pagos que hay. Estos, crearán un expediente rápido, estableciendo el tipo de pago según se haya pulsado el botón. Si se pulsa el botón de preference que hay debajo de un Renault Clio, se creará un expediente con el tipo de pago Preference. Tomará la fecha de creación la actual.


------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

En la pestaña de configuración, quita Administración de Catálogos Maestros.
También quiero que los botones aparezcan centrados en la pantalla.
Los listados que se muestren, quiero que ocultes la columna de ID, no tiene sentido para el usuario.

En el dashboard, los accesos rápidos que te dije me gustan, pero quiero que los organices como bloques en vertical.
Sería por ejemplo una sección de la Marca Renault (si Renault tiene el Acceso Rapido activo)
Debajo, en vertical, nombres de los modelos, y los botones de acceso rápido según su forma de pago, debajo del modelo.

Otra sección a la derecha por ejemplo de la Marca Dacia (si Dacia tiene el Acceso Rapido activo)
Debajo, en vertical, nombres de los modelos, y los botones de acceso rápido según su forma de pago, debajo del modelo.

Los botones de acceso rápido según su forma de pago, que este uno al lado del otro en la misma linea, es decir, que si hay 3 formas de pago, que debajo del modelo, aparezcan los 3 botones correspondientes, uno al lado del otro.

En el dashboard, como aparecen los últimos 5 expedientes, quiero poder editar, es decir, dar como un botón de lapiz, y que me lleve a ese expediente.

En el menú de configuración, aparece la gestión de usuarios. Al ser un administrador, aparece el botón de suspender inhabilitado, quiero mejor que se oculte ese botón si es el administrador.


------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

En la configuración, en Estados, quiero que cada estado tenga un booleano que pueda activar, como predeterminado.
Al usar los botones de acceso rápido del dashboard, el estado del vehiculo siempre será el estado que tenga el predeterminado.
En la configuración de Pagos, quiero poder asignar un color al tipo de pago. Este color, será el que tenga en la tabla que se muestran los expedientes. Ahora sale de color azul clarito. Luego, será según el color que yo haya establecido.

En el dashboard, aparece un listado de los últimos 5 expedientes, en la lista, oculta la columna código pues no tiene sentido relevante.

En el dashboard, los accesos directos a crear rápido el expediente, quiero que lo centres. Y quiero que añadas uno nuevo, a la derecha de los que estén activos, que ponga VO. El cual tendrá un botón por cada tipo de pago que haya. Estos, crearán un expediente rápido, según el tipo de venta que haya pulsado el botón y en estado de vehiculo, será usado.

En los expedientes, no quiero que marca, modelo, tipo de venta ni estado de vehiculo, sean obligatorios. Es mas, no quiero que ningún campo sea obligatorio en los expedientes.
En los clientes, solo quiero que sea obligatorio el nombre.

Cuando se haga algún guardado, sale un mensaje verde, que lo que hace es desplazar las cosas hacia abajo a veces, y luego cuando desaparece, vuelve a desplazar las cosas de nuevo. Quiero que esos mensajes salgan en la parte superior de la pantalla y sean flotantes, ósea, que no afecten al contenido, pero siempre esté encima. Que salga unos segundos y ya.

También quiero, que si estoy en la sección de expedientes, y quiero salir de ahí, pulsando algún otro botón o algo, verifique si he cambiado algo o no, para que me salga un mensaje de si quiero guardar cambios.

También en expedientes quiero un campo para guardar el VIN (numero de bastidor del vehiculo)

------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

En expedientes, quiero tener un botón para eliminar el expediente. Quiero que al eliminar, antes, me salga un modal de confirmación.

A veces, sale este error en la consola del navegador, cuando pulso en el botón lateral de Clientes:
Uncaught (in promise) Error: A listener indicated an asynchronous response by returning true, but the message channel closed before a response was received

En el dashboard, los accesos rapidos, quiero que el fondo de los botones de creación rápida de expedientes, corresponda al color asignado en su configuración.


------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

En la pestaña de expedientes, en la tabla, oculta la columna de Expediente, pues muestra un código que no es relevante.
En la columna de cliente, solo muestra el nombre. El DNI no lo muestres.
Quiero que la columna de Fechas, sea F. Exp.
Añade a la derecha de esta, una columna de F. Afect, F.Mat, F. Entrega. (como ves son títulos reducidos correspondientes a Fecha de Afectación, fecha matriculación, fecha entrega.
Estas nuevas columnas, cada una de las filas de la tabla que se muestra, tendrán un botón de lapiz y otro de basura cada una de las columnas que te he dicho de añadir. Al dar al lapiz, se mostrará un modal para introducir la fecha. Ese modal tendrá la fecha actual escrita para que solo sea dar a aceptar o cancelar, según corresponda.
El botón de la basura, volverá a eliminar la fecha de ese campo. Lógicamente, la eliminación debe de ser confirmada mediante un modal para ello.


------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------


revisa todos los campos de fechas, pues quiero que sea, Dia/Mes/Año en toda la aplicación

------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

Centra los textos de la tabla de expediente, de las fechas.
Varia un poco el color de cada columna, asi podre diferenciarlas fácilmente, solo con que una columna sea mas clarita y la otra mas oscura me vale.


------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

En expedientes, quiero poder ordenar pinchando en el titulo de la columna.
Cuando creo un expediente usando los accesos rapidos del dashboar, aparece un mensaje ¡Expediente rápido creado con éxito para Sandero (Contado)!. Quiero que este mensaje aparezca en la parte superior y central de la web, pero que no mueva ni desplace parte del contenido de la web, es decir, que esté como flotando.
En la pestaña clientes, también quiero poder ordenar, pinchando en el titulo de la columna.




------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

Quiero que el buscador, aparezca como una lista desplegable mientras escribo y pinchar en ella, es posible?
También quiero, que cuando realice la búsqueda, me aparecen los expedientes en Resultados de búsqueda. Pero no me deja acceder a ellos, ni ver detalles. Quiero que me muestre las mismas columnas que muestra en la pestaña de expedientes.


------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
```
