> Parte del informe completo (`docs/INFORME-COMPLETO.md`). **Leyenda de marcas** [V-código] [V-reglas] [V-Prompts] [V-web] [D] [I] [P]: ver `00-leyenda-vision-entorno.md` (sección 0.1). Regla: no conviertas una [I] o [P] en hecho sin comprobarlo; aplica el valor por defecto y anótalo en `DECISIONES.md`.

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
