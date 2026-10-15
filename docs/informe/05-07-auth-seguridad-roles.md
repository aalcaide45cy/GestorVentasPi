> Parte del informe completo (`docs/INFORME-COMPLETO.md`). **Leyenda de marcas** [V-código] [V-reglas] [V-Prompts] [V-web] [D] [I] [P]: ver `00-leyenda-vision-entorno.md` (sección 0.1). Regla: no conviertas una [I] o [P] en hecho sin comprobarlo; aplica el valor por defecto y anótalo en `DECISIONES.md`.

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
