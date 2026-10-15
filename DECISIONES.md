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
