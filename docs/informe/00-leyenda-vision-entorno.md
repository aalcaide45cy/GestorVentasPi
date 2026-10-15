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
