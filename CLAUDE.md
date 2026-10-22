# CLAUDE.md — GestorVentasPi

Eres el desarrollador de **GestorVentasPi**: una app web de gestión de ventas de un concesionario (expedientes, clientes, comisiones y puntos), que debe funcionar en una **Raspberry Pi 4 (8 GB, ARM64)** y en un **PC AMD64**, con **PostgreSQL**, **sin Clerk**, con login **email + contraseña + doble factor (TOTP)**, accesible por URL **sin abrir puertos**, con **copias de seguridad** (descarga desde el navegador y botón a Google Drive) y un **único archivo instalador**.

**La especificación completa está en `docs/`.** Es la fuente de verdad. Interfaz y textos en **español de España**.

## 1. Regla principal: construir TODO DESDE CERO
- **Código nuevo**. **No copies, no reutilices y no adaptes** ningún fichero de `referencia/gestorVentas-original/` (es la app antigua; **solo lectura**; no se despliega).
- Úsala **solo para consultar** comportamiento, textos y aspecto cuando la especificación no lo detalle.
- La **interfaz debe ser idéntica** a la antigua: reproduce **exactamente los valores de diseño** de `docs/anexos/C-css-original.md` y lo descrito en `docs/informe/08-09-diseno-pantallas.md` (código nuevo, mismo resultado visual).
- Mantén los **nombres de rutas, componentes y textos** de la antigua (ver `docs/anexos/D-rutas-api-original.md`).

## 2. Qué leer y cuándo (no leas todo de golpe)
Empieza **siempre** por `docs/informe/00-leyenda-vision-entorno.md` (leyenda de marcas y requisitos). Después, según la fase:

| Fase | Leer |
|---|---|
| F0 Preparación | 00, 03-arquitectura, 08-09 (solo 8.1–8.4), anexos C |
| F1 Base sin Clerk y sin comisiones | 04-modelo-datos, 05-07 (solo 7), 08-09, 10-11, anexos B, D, E |
| F2 Autenticación completa | 05-07 |
| F3 Motor de comisiones | 12-motor-comisiones, anexo A (completo) |
| F4 Interfaz de comisiones | 12, 08-09 (9.9–9.11), anexo A |
| F5 Copias y Drive | 13-copias-drive |
| F6 Empaquetado | 14-15, 16-20 |
| F7 Raspberry real y rendimiento | 15, 16-20 |
| F8 Datos reales (al final) | 12 (12.13–12.14), anexo A |

El plan por fases y sus **criterios de aceptación** están en `docs/informe/16-20-pruebas-fases-guia.md` (sección 17).

## 3. Reglas de trabajo
1. **No inventes comportamiento.** Las marcas del informe: `[V-…]` verificado · `[D]` decisión de diseño · `[I]` inferencia · `[P]` pendiente de confirmar. **No conviertas una [I] o [P] en hecho**: aplica el valor por defecto indicado y **anótalo en `DECISIONES.md`**.
2. **TypeScript estricto, sin `any`.** Validación de toda entrada con **Zod**. SQL **solo parametrizado** (Drizzle). **Transacciones** en toda escritura múltiple. Autorización **en el servidor** en cada ruta (matriz de la sección 7).
3. **Motor de comisiones**: módulo puro en `src/lib/comisiones/` (enteros: céntimos y centésimas). Tests T1–T28 obligatorios (Vitest). **Un único motor** para simulador, liquidación e informes.
4. **Diseño intocable**: nada de librerías de UI nuevas ni Tailwind. CSS propio con variables, como en el Anexo C.
5. **Seguridad**: nunca secretos en el repositorio (`.env` en `.gitignore`); cabeceras y CSRF según la sección 6; no registres contraseñas ni tokens en logs.
6. **Git**: una rama por fase (`fase/F1-base`…), commits pequeños y claros en español, *pull request* a `main` al cumplir los criterios de aceptación. Nunca `push --force` sobre `main`.
7. **Pruebas antes de cerrar una fase**: ejecútalas y no marques la fase como completa si fallan.
8. **Seguridad de datos del propietario**: no borres `data/`, `backups/` ni volúmenes de Docker; no ejecutes comandos destructivos sin pedirlo.
9. **Si algo del informe es imposible o hay una forma claramente mejor**, proponlo **por escrito** (en `DECISIONES.md`) antes de desviarte.

## 4. Cómo avanzar
- Avanza **fase a fase** (F0 → F8). Al terminar cada fase: ejecuta las pruebas, actualiza `PROGRESO.md` (qué se hizo, qué falta, cómo probarlo), haz commit y continúa con la siguiente.
- **Para y pregunta al propietario SOLO si**: (a) necesitas credenciales o acciones suyas (cuenta de Google Cloud, token de Cloudflare, login de Tailscale, acceso a su Raspberry); (b) la decisión cambia algo **visible** de la interfaz o **una regla de comisiones** del Anexo A; (c) hay una contradicción entre documentos que no se resuelve con el orden de precedencia (sección 0.2 del informe).
- Todo lo demás: decide con criterio, aplica los valores por defecto y registra la decisión.

## 5. Comandos (rellenar en F0 y mantener actualizado)
- Desarrollo: `docker compose up -d db && npm run dev`
- Tests: `npm test`
- Tipos y lint: `npm run typecheck && npm run lint`
- Migraciones: `npm run db:generate` / `npm run db:migrate`
- Construir imagen: `docker build -t gestorventaspi:local .` (multi-arquitectura la hace GitHub Actions, ver `.github/workflows/`)
- Instalador: `./scripts/empaquetar.sh [versión] [--offline]` · scripts de administración: `npm run build:scripts`
- Servidor del PC (puerto 3000) en modo normal, sin recargas al editar: `powershell -ExecutionPolicy Bypass -File scripts\publicar-local.ps1` (compila aparte y cambia en segundos; el modo desarrollo es solo para pruebas en otro puerto)
- Rendimiento: `npx tsx scripts/medir-rendimiento.ts` (solo contra una BD `*_test`)

## 6. Entorno del propietario (datos útiles)
- Propietario: Alfonso (Madrid), vendedor de coches Renault/Dacia y desarrollador. Habla **español**.
- Usa Windows para desarrollar; la app final corre en Raspberry Pi 4 (8 GB, tarjeta SD) y en PC AMD64.
- Sin dominio propio; sin abrir puertos del router. Acceso exterior: **Tailscale Funnel** (por defecto) o **Cloudflare Tunnel** (si hay dominio).
- La app antigua está en `github.com/aalcaide45cy/gestorVentas` (Next.js 16 + Drizzle + Neon + Clerk). Este repo es `github.com/aalcaide45cy/GestorVentasPi`.
