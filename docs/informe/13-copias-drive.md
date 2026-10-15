> Parte del informe completo (`docs/INFORME-COMPLETO.md`). **Leyenda de marcas** [V-código] [V-reglas] [V-Prompts] [V-web] [D] [I] [P]: ver `00-leyenda-vision-entorno.md` (sección 0.1). Regla: no conviertas una [I] o [P] en hecho sin comprobarlo; aplica el valor por defecto y anótalo en `DECISIONES.md`.

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
