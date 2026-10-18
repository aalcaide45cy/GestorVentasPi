// Borra la base de datos de pruebas (siempre `*_test`) para que la próxima ejecución de los tests la cree de cero con las migraciones.
import "dotenv/config";
import pg from "pg";

const base = process.env.DATABASE_URL ?? "postgres://gestor:cambia-esta-contrasena@127.0.0.1:5432/gestorventas";
const nombre = new URL(base).pathname.slice(1) + "_test";
if (!nombre.endsWith("_test")) throw new Error("Solo se borra la base de datos de pruebas");
const cliente = new pg.Client({ connectionString: base });
await cliente.connect();
await cliente.query(`drop database if exists "${nombre}" with (force)`);
await cliente.end();
console.log(`Base de datos ${nombre} borrada.`);
