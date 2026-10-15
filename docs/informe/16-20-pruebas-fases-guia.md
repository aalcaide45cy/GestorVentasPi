> Parte del informe completo (`docs/INFORME-COMPLETO.md`). **Leyenda de marcas** [V-código] [V-reglas] [V-Prompts] [V-web] [D] [I] [P]: ver `00-leyenda-vision-entorno.md` (sección 0.1). Regla: no conviertas una [I] o [P] en hecho sin comprobarlo; aplica el valor por defecto y anótalo en `DECISIONES.md`.

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
