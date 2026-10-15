# Guía de Migración y Despliegue en Raspberry Pi 4 (8GB RAM)

Este documento contiene toda la información técnica, dependencias y pasos necesarios para desplegar de forma local esta aplicación de **Gestor de Ventas** en una **Raspberry Pi 4 con 8 GB de RAM**.

Puedes compartir este informe con cualquier IA (como Gemini) para que te guíe paso a paso en la ejecución de los comandos y configuración del sistema.

---

## 1. Ficha Técnica de la Aplicación

Para que Gemini comprenda el entorno actual, aquí tienes el stack tecnológico del proyecto:

*   **Frontend y Backend:** Next.js 16 (React 19) corriendo sobre Node.js.
*   **Base de Datos (ORM):** Drizzle ORM.
*   **Driver de Base de Datos:** PostgreSQL (`pg` y `@neondatabase/serverless`).
*   **Autenticación:** Clerk (`@clerk/nextjs`).
*   **Lector de Archivos:** `xlsx` para importación de hojas de cálculo de expedientes/ventas.

---

## 2. Requisitos de la Raspberry Pi 4

*   **Hardware:** Raspberry Pi 4 (Modelo de 8 GB de RAM recomendado).
*   **Sistema Operativo:** Raspberry Pi OS de 64 bits (Debian Bookworm o superior) instalado en una tarjeta MicroSD rápida (Clase 10 / U3) o preferiblemente un disco SSD por USB 3.0 para un mejor rendimiento de la base de datos.
*   **Conectividad:** Conexión a Internet (necesaria para validar tokens de Clerk, instalar paquetes de Node y actualizar el sistema).

---

## 3. Hoja de Ruta para el Despliegue (Paso a Paso)

Dile a tu asistente Gemini que te guíe para ejecutar los siguientes bloques de configuración en la terminal de tu Raspberry Pi:

### Paso A: Preparación del Sistema y Node.js
1. Actualizar repositorios del sistema:
   ```bash
   sudo apt update && sudo apt upgrade -y
   ```
2. Instalar Node.js (versión 20 LTS o superior compatible con Next.js 16):
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
   sudo apt-get install -y nodejs
   ```
3. Verificar versiones instaladas:
   ```bash
   node -v
   npm -v
   ```

### Paso B: Instalación y Configuración de PostgreSQL
Dado que la aplicación usa PostgreSQL a través de Drizzle ORM, instalaremos un servidor local:

1. Instalar PostgreSQL en el sistema:
   ```bash
   sudo apt install postgresql postgresql-contrib -y
   ```
2. Crear un usuario y base de datos para la aplicación:
   ```bash
   sudo -i -u postgres psql
   # Dentro de la consola de postgres:
   CREATE DATABASE gestor_ventas;
   CREATE USER usuario_gestor WITH PASSWORD 'tu_contrasenia_segura';
   GRANT ALL PRIVILEGES ON DATABASE gestor_ventas TO usuario_gestor;
   ALTER DATABASE gestor_ventas OWNER TO usuario_gestor;
   \q
   ```
3. En entornos Debian/Ubuntu, a veces es necesario ajustar permisos para permitir conexiones locales mediante contraseña en `/etc/postgresql/.../main/pg_hba.conf`.

### Paso C: Clonar y Configurar la Aplicación
1. Clonar el repositorio del código en la Raspberry Pi.
2. Instalar dependencias del proyecto:
   ```bash
   npm install
   ```
3. Configurar el archivo de entorno local `.env` (o `.env.local`). Debe incluir:
   *   La cadena de conexión a la base de datos PostgreSQL local:
       ```env
       DATABASE_URL="postgresql://usuario_gestor:tu_contrasenia_segura@localhost:5432/gestor_ventas"
       ```
   *   Las variables de configuración de Clerk (API Keys que obtienes del panel de desarrollo de Clerk):
       ```env
       NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
       CLERK_SECRET_KEY=sk_test_...
       ```

### Paso D: Migrar la Estructura de la Base de Datos
Drizzle ORM requiere empujar las tablas a la base de datos local recién creada.
1. Ejecutar las migraciones pendientes o hacer push directo del esquema:
   ```bash
   npx drizzle-kit push
   ```

### Paso E: Compilación y Ejecución en Producción
Para asegurar un rendimiento óptimo en la Raspberry Pi, **no** debes usar `npm run dev` en producción. Debes compilar la aplicación:

1. Compilar Next.js:
   ```bash
   npm run build
   ```
2. Iniciar la aplicación para verificar que todo funciona:
   ```bash
   npm run start
   ```
   *(Por defecto correrá en el puerto 3000 de la Raspberry Pi: `http://localhost:3000`)*

### Paso F: Mantener el Servicio Activo (PM2)
Para evitar que la aplicación se cierre al desconectarte de la terminal, se recomienda usar un gestor de procesos como **PM2**:

1. Instalar PM2 de manera global:
   ```bash
   sudo npm install -y pm2 -g
   ```
2. Arrancar la aplicación Next.js con PM2:
   ```bash
   pm2 start npm --name "gestor-ventas" -- start
   ```
3. Configurar PM2 para que se ejecute al encender la Raspberry Pi:
   ```bash
   pm2 startup
   # Sigue las instrucciones en pantalla que te da este comando
   pm2 save
   ```

### Paso G: Acceso desde otros dispositivos (Opcional - Nginx)
Si deseas acceder a la aplicación desde tu ordenador o móvil conectados a la misma red local (ej. escribiendo `http://192.168.1.150` en el navegador):
1. Instalar Nginx:
   ```bash
   sudo apt install nginx -y
   ```
2. Configurar Nginx como proxy inverso para redirigir el puerto 80 al puerto 3000 donde corre tu app Next.js.

---

## 4. Consideraciones Clave para Compartir con Gemini

*   **Autenticación (Clerk):** Recuerda a Gemini que la autenticación depende de la nube de Clerk. Por lo tanto, la Raspberry Pi necesita acceso a internet constante para validar los inicios de sesión. Si en el futuro requieres un entorno 100% desconectado, deberás pedirle a Gemini que te ayude a sustituir Clerk por **Auth.js** (NextAuth) con credenciales de base de datos locales.
*   **Rendimiento en MicroSD:** PostgreSQL realiza constantes escrituras. Si usas una MicroSD barata, el rendimiento podría degradarse con el tiempo y la tarjeta podría dañarse. Si el volumen de ventas es alto, es muy recomendable conectar un SSD por USB 3.0 a la Raspberry Pi.
