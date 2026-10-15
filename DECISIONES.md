# DECISIONES.md — registro de decisiones

Anota aquí cada decisión que tomes y cada punto **[P]** (pendiente) con la opción aplicada. Formato: `fecha · fase · decisión · motivo · ¿requiere confirmar al propietario?`.

## Pendientes del informe (sección 19) — opción por defecto aplicada hasta que el propietario confirme

| # | Tema | Opción por defecto | Estado |
|---|---|---|---|
| P1 | Qué ve cada rol dentro de **Comisiones** | Admin todo; el resto solo sus liquidaciones, en lectura | Por confirmar |
| P2 | Endurecer permisos de edición/borrado de expedientes por tienda/propietario | Desactivado (idéntico al original) con ajuste `restringir_por_tienda` | Por confirmar |
| P3 | Duración de sesión | 12 h de inactividad / 30 días absolutos | Por confirmar |
| P4 | Cifrar copias antes de subirlas a Drive | No | Por confirmar |
| P5 | Contado sin incentivo de financiación; Renting como financiación | Como el original | Por confirmar |
| P6 | Arrastre del objetivo: manual o automático | Manual por vendedor y plan | Por confirmar |
| P7 | Orden de unidades VO (fecha de cobro, luego nº de expediente) | El indicado en 12.4 | Por confirmar (validar con liquidación real) |
| P8 | Expediente con puntos propios **y** promoción | Prevalece la promoción | Por confirmar |
| P9 | Estados iniciales (¿“Seminuevo”?) y su clase/subtipo | Nuevo→VN; Demo/KM0/Buyback/Usado→VO | Por confirmar |
| P10 | Expedientes migrados sin vendedor válido | Se asignan al administrador | Por confirmar |
| P11 | Textos exactos no leídos de la app original (borrado de usuario con expedientes, cliente con expedientes, “Opciones de Interfaz y Seguridad”) | Replicar leyendo `referencia/` | Resolver en F1 |
| P12 | Credenciales de Google y app de Google “En producción” | A cargo del propietario (guía) | En F5 |

## Decisiones tomadas durante el desarrollo

| Fecha | Fase | Decisión | Motivo | ¿Confirmar? |
|---|---|---|---|---|
| 15/10/2026 | F0 | Fuentes autoalojadas con `@fontsource-variable/outfit` y `@fontsource-variable/plus-jakarta-sans` (solo se copian los `.woff2` latin y latin-ext a `public/fonts`; el paquete queda como devDependency) | El Anexo C exige `@font-face` locales; evita descargar de Google | No |
| 15/10/2026 | F0 | `@types/node@24` (en lugar de 20) | Vitest 5 exige `@types/node` ≥ 22; Node local es 24 | No |
| 15/10/2026 | F0 | Portada enlaza a `/login` (no a `/dashboard`) con un `/login` provisional | Sección 9.1: sin sesión se muestra el botón de entrar a `/login`; el login real llega en F1/F2 | No |
| 15/10/2026 | F0 | `docker-compose.yml` de desarrollo solo con `db` (Postgres 16 publicado en 127.0.0.1:5432, datos en `./data/postgres`); el compose con `app` llega en F6 | Comando de desarrollo de CLAUDE.md: `docker compose up -d db && npm run dev` | No |
| 15/10/2026 | F0 | Docker Desktop instalado con winget; requirió activar WSL2 y reiniciar | Entorno de Windows del propietario | No |
| 15/10/2026 | F0 | Se versiona `referencia/` (app antigua, solo lectura) tal y como indica la sección 3.4 | Estructura de carpetas del informe | No |
| 15/10/2026 | F1 | Semilla de tipos de pago: Contado, Crédito y Preference (sin Renting); la categoría RENTING sigue disponible | El propietario no usa Renting | No |
| 15/10/2026 | F1 | La categoría del tipo de pago y la clase/subtipo del estado se deducen del nombre al crear o renombrar (como la original) | El formulario no los pide | No |
| 15/10/2026 | F1 | Comisiones e Informes son marcadores hasta F4; el resumen mensual de Expedientes solo trae recuentos | Dependen del motor (F3/F4) | No |
| 15/10/2026 | F1 | Copia JSON formato 2.0 propio; las copias 1.0 de la app antigua se rechazan y se convertirán en F8 | Sección 12.13 | No |
| 15/10/2026 | F1 | Las preferencias del navegador se leen con `useSyncExternalStore` (sin errores de hidratación) | Reglas de React 19 del linter | No |
| 15/10/2026 | F2 | CSP con `'unsafe-inline'` para scripts y estilos (sin nonces); el resto restringido al propio origen | Next.js y el script del tema usan fragmentos en línea; los nonces obligarían a renderizar todo de forma dinámica | No |
| 15/10/2026 | F2 | Bloqueo progresivo: tras 5 fallos en 24 h desde el último acceso correcto, 15 min; cada 5 fallos más duplica (tope 24 h). Claves: IP+correo e IP sola; el 2FA tiene su propia clave | Aproxima 5.6 de forma comprobable | No |
| 15/10/2026 | F2 | Un usuario sin 2FA activo no puede llamar a la API ni ver el panel (redirige a activar el 2FA) | 5.3: el 2FA es obligatorio | No |
| 15/10/2026 | F2 | La limpieza de sesiones e intentos se ejecuta de forma oportunista tras un login (cada 6 h como mucho) hasta que haya planificador | No hay cron todavía | No |
| 15/10/2026 | F2 | Los códigos de recuperación se guardan como HMAC con clave derivada de `APP_SECRET`; el secreto TOTP, cifrado con AES-256-GCM | 5.4 | No |
| 15/10/2026 | F3 | «Ligar a crédito» se cumple si existe una regla activa de evento `credito` (no ligada) que pasaría los filtros para ese expediente, aceptando cualquier venta financiada | El Anexo A no define cómo se evalúa para ventas Preference | Sí |
| 15/10/2026 | F3 | Preference: especificidad marca+modelo > solo modelo > solo marca > general; la regla de mejor especificidad con menor id | 12.3 solo ordena marca+modelo > marca > general | No |
| 15/10/2026 | F3 | Un VO con comisión a mano ocupa su posición en el orden/contador por subtipo; sin tarifa de financiación para marca y tipo → línea con 0 € y aviso | 12.1: nunca excepción, aviso + 0 € | No |
| 15/10/2026 | F3 | Avisos de «falta fecha» solo en los meses donde el expediente tiene otro evento (pedido, afectación, RCI) | Evitar ruido en todos los meses | No |
| 15/10/2026 | F3 | Las tablas `commission_rules` y `commission_bonus_rules` se fusionan en el motor (ids de bonus + 1.000.000) | Mismas columnas; la clave del libro de puntos no debe colisionar | No |
| 15/10/2026 | F3 | Versiones y libro rechazan UPDATE/DELETE siempre (12.9.5 contradice «salvo recálculo»; se aplica «siempre»); la restauración usa TRUNCATE | Coherencia con «solo inserción» | No |
| 15/10/2026 | F3 | La liquidación se actualiza en sitio (mismo id) y se versiona solo si estaba revisada/cerrada/importada y su contenido cambia | Las FK de versiones impiden borrar la liquidación | No |

