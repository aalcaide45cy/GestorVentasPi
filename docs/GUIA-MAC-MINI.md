# Poner GestorVentasPi a funcionar en un Mac mini M1 (desde cero)

Lo que NO está probado en un Mac: esta guía se apoya en lo que dice `GUIA-INSTALACION.md` (apartados 10 y 11) y en el
`docker-compose.yml` de la carpeta `instalador/`. Si algún paso falla, apunta el mensaje y se corrige.

## Antes de formatear el Mac (en tu PC actual)
1. En la app: **Administración → Copias de seguridad → Crear copia** y descarga el fichero `.dump` más reciente
   (también están en la carpeta `backups/` del proyecto).
2. Guarda aparte tu fichero **`.env`** (contiene la clave de la base de datos y `APP_SECRET`; sin él no se pueden
   leer las claves cifradas, como el doble factor).
3. Guarda tus **códigos de recuperación** del doble factor.
4. Sube a GitHub lo que tengas pendiente en el PC (rama y cambios), si quieres programar desde el Mac.

## En el Mac (ya formateado)
1. Instala macOS, entra con tu cuenta y actualiza el sistema.
2. Ajustes del Sistema → Batería/Energía: evita la suspensión y marca «Arrancar automáticamente tras un fallo de corriente».
3. Instala **OrbStack** (orbstack.dev) o Docker Desktop. Ábrelo y activa «Abrir al iniciar sesión».
4. Instala las herramientas de línea de comandos: en Terminal, `xcode-select --install`.
5. Instala **Git** y **Node 22** (con Homebrew: `brew install git node@22`).
6. Instala **Tailscale** desde la App Store e inicia sesión con tu cuenta (para entrar desde fuera).

## Poner la app
1. Clona el proyecto: `git clone https://github.com/aalcaide45cy/GestorVentasPi.git` y entra en la carpeta.
2. Copia tu `.env` guardado a la carpeta del proyecto (o crea uno desde `.env.example`).
3. Arranca la base de datos: `docker compose up -d db`.
4. Instala dependencias y arranca: `npm install` y `npm run dev` (para probar) — abre http://localhost:3000.
5. Para dejarla fija como servidor: `docker build -t gestorventaspi:local .` y usa el `docker-compose.yml` de `instalador/`
   con tu `.env`.
6. Restaura tu copia: sigue `GUIA-INSTALACION.md` apartado 10 (comando `restaurar.sh` / `--restaurar fichero.dump`),
   o desde la app con un administrador temporal (**Copias → Restaurar**).
7. Entra con tu administrador de siempre (su clave y doble factor vienen en la copia).

## Acceso desde fuera
Con Tailscale Funnel (apartado 5 de `GUIA-INSTALACION.md`): `tailscale funnel 3000`. Para servidor fijo en
producción no uses `npm run dev`; usa la imagen de Docker (si no, desde fuera tendrás que añadir la dirección a
`allowedDevOrigins` como hicimos en el PC).
