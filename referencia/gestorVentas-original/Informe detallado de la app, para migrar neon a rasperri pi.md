# Informe Técnico: Migración de Base de Datos de Neon (Cloud) a PostgreSQL Local en Raspberry Pi 4

Este informe detalla los cambios técnicos y de configuración necesarios para migrar la base de datos de **Neon (PostgreSQL Serverless en la nube)** a un servidor **PostgreSQL local** corriendo directamente dentro de una **Raspberry Pi 4**. 

Comparte este informe con ChatGPT para que te proporcione el paso a paso exacto, los comandos y las modificaciones de código requeridas.

---

## 1. El Desafío Técnico: Neon HTTP vs. PostgreSQL TCP

Actualmente, la aplicación está acoplada al ecosistema de Neon en la nube a través de su driver HTTP.
*   **Estado Actual:** En [src/db/index.ts](file:///m:/apps/GestorVentas/src/db/index.ts) se utiliza `drizzle-orm/neon-http` y `@neondatabase/serverless` para realizar consultas mediante peticiones HTTP.
*   **Problema:** Un PostgreSQL local estándar (como el que se instala en la Raspberry Pi) no tiene un endpoint de API HTTP nativo; se comunica a través de sockets TCP normales (generalmente en el puerto `5432`).
*   **Solución:** Debemos cambiar el adaptador de base de datos de Drizzle en la aplicación para que use el cliente clásico de Node PostgreSQL (`pg`), el cual es compatible tanto con base de datos locales como remotas.

---

## 2. Cambios de Código Necesarios en la Aplicación

Para poder correr la base de datos localmente, se deben hacer las siguientes modificaciones (pídele a ChatGPT que te guíe en estos cambios):

### A. Dependencias (`package.json`)
El paquete `pg` (node-postgres) debe estar en `dependencies` (producción) y no en `devDependencies`.
*   **Comando para moverlo:**
    ```bash
    npm uninstall pg
    npm install pg
    npm install --save-dev @types/pg
    ```

### B. Adaptador de Base de Datos (`src/db/index.ts`)
Se debe reescribir este archivo para alternar o reemplazar el cliente de Neon por el de `pg`.

**Código recomendado para soportar PostgreSQL local:**
```typescript
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

let _db: any = null;

function getDb() {
  if (!_db) {
    const databaseUrl = process.env.DATABASE_URL || "postgresql://placeholder:placeholder@localhost:5432/placeholder";
    
    if (!process.env.DATABASE_URL && process.env.NODE_ENV === "production") {
      console.warn("⚠️ DATABASE_URL no está definida. Usando marcador de posición.");
    }

    // Usamos un pool de conexiones TCP estándar para PostgreSQL
    const pool = new Pool({
      connectionString: databaseUrl,
      // Desactivar SSL para local (en Neon se requiere, en local no)
      ssl: databaseUrl.includes('neon.tech') ? { rejectUnauthorized: false } : false
    });

    _db = drizzle(pool, { schema });
  }
  return _db;
}

// Exportación del proxy para mantener compatibilidad con el resto del código
export const db = new Proxy({} as any, {
  get(target, prop, receiver) {
    const instance = getDb();
    return Reflect.get(instance, prop, receiver);
  }
});
```
*   **Ventaja añadida:** El adaptador de `pg` nativo **soporta transacciones de base de datos** (`db.transaction()`), lo cual soluciona la limitación indicada en tu archivo de notas `Prompts.txt` sobre `neon-http`.

---

## 3. Preparación de PostgreSQL en la Raspberry Pi 4

Pide a ChatGPT los comandos detallados para tu distribución (usualmente Raspberry Pi OS Lite / Debian Bookworm de 64 bits):

1.  **Instalación del Servidor:**
    ```bash
    sudo apt update
    sudo apt install postgresql postgresql-contrib -y
    ```
2.  **Configuración de Seguridad y Acceso:**
    *   De forma predeterminada, PostgreSQL solo escucha conexiones locales. Si la app corre en el mismo sistema, la URL `localhost` funcionará.
    *   Si necesitas que la base de datos sea accesible desde otros ordenadores de la red, edita `/etc/postgresql/.../main/postgresql.conf` para cambiar `listen_addresses = 'localhost'` a `listen_addresses = '*'`.
    *   Edita `/etc/postgresql/.../main/pg_hba.conf` para permitir conexiones de red mediante contraseña (`md5` o `scram-sha-256`).
3.  **Creación de la base de datos y usuario:**
    ```bash
    sudo -i -u postgres psql
    ```
    Ejecutar dentro del prompt de PostgreSQL:
    ```sql
    CREATE DATABASE gestor_ventas;
    CREATE USER usuario_pi WITH PASSWORD 'contrasenia_segura_aqui';
    GRANT ALL PRIVILEGES ON DATABASE gestor_ventas TO usuario_pi;
    \q
    ```
4.  **Reinicio del servicio:**
    ```bash
    sudo systemctl restart postgresql
    ```

---

## 4. Migración de Estructuras (Esquema) con Drizzle

El proyecto cuenta con las migraciones ya generadas en el directorio `src/db/migrations/` (desde la versión `0000` a la `0011`).

Para aplicarlas sobre la nueva base de datos local en la Raspberry Pi:
1.  **Actualizar el archivo `.env.local` en la Raspberry Pi:**
    ```env
    DATABASE_URL="postgresql://usuario_pi:contrasenia_segura_aqui@localhost:5432/gestor_ventas"
    ```
2.  **Ejecutar las migraciones existentes:**
    ```bash
    npx drizzle-kit migrate
    ```
    o alternativamente empujar el esquema actual directamente:
    ```bash
    npx drizzle-kit push
    ```

---

## 5. Migración de Datos (Opcional - Si deseas conservar datos de Neon)

Si tienes datos en producción en Neon que quieres llevarte a la Raspberry Pi, pide a ChatGPT que te guíe en el uso de las herramientas de volcado de PostgreSQL:

1.  **Exportar datos desde Neon (hacer desde tu PC local con conexión a internet):**
    ```bash
    pg_dump -h [servidor-neon-aqui] -U [usuario-neon] -d [base-datos-neon] --clean --no-owner --no-privileges -f backup_neon.sql
    ```
2.  **Importar datos en la Raspberry Pi:**
    Sube el archivo `backup_neon.sql` a la Raspberry Pi y ejecútalo:
    ```bash
    psql -h localhost -U usuario_pi -d gestor_ventas -f backup_neon.sql
    ```

---

## 6. Rendimiento y Buenas Prácticas en Raspberry Pi 4

Pide a ChatGPT recomendaciones específicas de optimización para bases de datos en Raspberry Pi:
*   **Uso de SSD:** Evita a toda costa usar tarjetas SD genéricas para PostgreSQL. Las bases de datos realizan lecturas y escrituras constantes de bloques pequeños de memoria, lo cual destruye las tarjetas SD en pocos meses y es muy lento. Conecta un SSD por USB 3.0.
*   **Memoria Compartida (Shared Buffers):** Dado que tienes 8 GB de RAM en la Raspberry Pi (lo cual es enorme para este dispositivo), puedes configurar `shared_buffers = 2GB` en `postgresql.conf` para mejorar significativamente la velocidad de las consultas al mantener gran parte de la base de datos en memoria RAM.
