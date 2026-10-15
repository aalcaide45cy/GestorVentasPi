> Parte del informe completo (`docs/INFORME-COMPLETO.md`). **Leyenda de marcas** [V-código] [V-reglas] [V-Prompts] [V-web] [D] [I] [P]: ver `00-leyenda-vision-entorno.md` (sección 0.1). Regla: no conviertas una [I] o [P] en hecho sin comprobarlo; aplica el valor por defecto y anótalo en `DECISIONES.md`.

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
