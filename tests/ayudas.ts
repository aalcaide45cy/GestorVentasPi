import { sql } from "drizzle-orm";
import { db } from "@/db";
import { usuarios } from "@/db/schema";
import { sembrar } from "@/db/semilla";
import type { Rol } from "@/lib/auth/permisos";
import type { UsuarioActual } from "@/lib/auth/sesion";

/** Vacía todas las tablas de la BD de pruebas y vuelve a sembrar los datos iniciales. */
export async function reiniciarBd(): Promise<void> {
  const nombre = await db.execute<{ current_database: string }>(sql`select current_database()`);
  if (!String(nombre.rows[0]?.current_database).endsWith("_test")) {
    throw new Error("Las pruebas solo pueden vaciar bases de datos que acaben en _test");
  }
  const tablas = await db.execute<{ tablename: string }>(
    sql`select tablename from pg_tables where schemaname = 'public'`,
  );
  const lista = tablas.rows.map((t) => `"${t.tablename}"`).join(", ");
  await db.execute(sql.raw(`truncate table ${lista} restart identity cascade`));
  await sembrar(db);
}

/** Crea un usuario real en la BD y devuelve el contexto de sesión equivalente. */
export async function crearUsuarioPrueba(rol: Rol, nombre = `Usuario ${rol}`): Promise<UsuarioActual> {
  const [u] = await db
    .insert(usuarios)
    .values({
      loginEmail: `${rol}-${Math.random().toString(36).slice(2, 8)}@prueba.test`,
      passwordHash: "no-se-usa",
      nombre,
      rol,
      fechaDeRegistro: "2026-01-01",
    })
    .returning();
  return {
    idUsuario: u.idUsuario,
    loginEmail: u.loginEmail,
    nombre: u.nombre,
    rol,
    fechaDeRegistro: u.fechaDeRegistro,
    bloqueado: false,
    tipoVendedor: u.tipoVendedor,
    tiendaPredeterminadaId: null,
    debeCambiarPassword: false,
  };
}
