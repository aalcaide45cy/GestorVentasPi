# PROGRESO.md

Actualízalo al terminar cada fase. Para cada una: estado, qué se hizo, qué falta, cómo probarlo, resultado de los tests.

| Fase | Estado | Notas |
|---|---|---|
| F0 Preparación | ✅ hecha (rama `fase/F0-preparacion`, pendiente de aprobación del propietario) | Ver detalle abajo |
| F1 Base sin Clerk y sin comisiones | ⬜ pendiente | |
| F2 Autenticación completa | ⬜ pendiente | |
| F3 Motor de comisiones (sin interfaz) | ⬜ pendiente | |
| F4 Interfaz de comisiones | ⬜ pendiente | |
| F5 Copias y Google Drive | ⬜ pendiente | |
| F6 Empaquetado (imágenes, instalador, guía, túnel) | ⬜ pendiente | |
| F7 Raspberry real y rendimiento | ⬜ pendiente | |
| F8 Datos reales (JSON antiguo y comparación) | ⬜ pendiente | |

## F0 — Preparación

**Hecho**
- Repositorio git inicializado con `origin` = `GestorVentasPi`; rama `fase/F0-preparacion`.
- Proyecto Next.js 16.2.6 + React 19.2.4 + TypeScript estricto, sin Tailwind (`output: "standalone"`).
- `globals.css` nuevo con los valores del Anexo C y `@font-face` locales (Outfit y Plus Jakarta Sans en `public/fonts`).
- Portada `/` con los textos y estilos de la original; `/login` provisional; `GlobalModalKeyboardHandler` en el layout; script de tema antes de pintar.
- `src/db/index.ts` (Pool `pg` + Drizzle), `drizzle.config.ts`, `src/lib/date-utils.ts` (`formatDate`), Vitest.
- `docker-compose.yml` de desarrollo con Postgres 16; `.env.example`.
- `.gitignore` con `Notas.txt`, `*.zip`, `INFORME-GESTOR-VENTAS-PI.md`.

**Cómo probarlo**
```
copy .env.example .env
docker compose up -d db
npm install
npm run dev     # http://localhost:3000
npm test ; npm run typecheck ; npm run lint ; npm run build
```

**Resultado**: tests 2/2, typecheck, lint y build en verde; Postgres 16 `healthy`; portada servida con fuentes locales.

**Pendiente del propietario**: nada para F1.
