import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { clientes, estadoVehiculo, expedientes, tipoDeVenta, usuarios } from "../src/db/schema";
import { cifrar } from "../src/lib/auth/cifrado";
import { hashPassword } from "../src/lib/auth/password";

/**
 * Datos de la copia de prueba de la interfaz (solo se ejecuta dentro de ella, con su .env): un administrador con doble factor de verdad y
 * secreto conocido (`SECRETO_TOTP`) y unos clientes y expedientes de ejemplo. Si el administrador ya existe no hace nada.
 */
export const SECRETO_TOTP = "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP";

async function main() {
  const url = process.env.DATABASE_URL ?? "";
  // La base de prueba vacía o el clon de la base real (en el clon solo se añade el administrador de prueba, sin datos de ejemplo)
  const esClonReal = url.endsWith("/gestorventas_ui_real");
  if (!url.endsWith("/gestorventas_ui_prueba") && !esClonReal) throw new Error("Este script solo se ejecuta contra la base gestorventas_ui_prueba o su clon gestorventas_ui_real");
  const pool = new Pool({ connectionString: url, max: 1 });
  try {
    const db = drizzle(pool);
    const [admin] = await db
      .insert(usuarios)
      .values({ loginEmail: "prueba@prueba.test", passwordHash: await hashPassword("Contrasena-de-prueba-123"), debeCambiarPassword: false, totpSecretoCifrado: cifrar(SECRETO_TOTP, "totp"), totpActivo: true, nombre: "Admin Prueba", rol: "administrador", fechaDeRegistro: "2026-01-01" })
      .onConflictDoNothing()
      .returning();
    if (!admin) {
      console.log("La base de prueba ya tiene datos.");
      return;
    }
    if (esClonReal) {
      console.log("Administrador de prueba añadido al clon de la base real.");
      return;
    }
    const tipos = await db.select().from(tipoDeVenta);
    const financiado = tipos.find((t) => t.requiereRciAlMatricular) ?? tipos[0];
    const estados = await db.select().from(estadoVehiculo);
    const nuevo = estados.find((e) => e.clase === "VN") ?? estados[0];
    const usado = estados.find((e) => e.clase === "VO") ?? estados[0];
    const datos: [string, string, string, number, string | null][] = [
      ["Francisco Mayor Casado", "51701814E", "c1", nuevo.idEstadoVehiculo, null],
      ["Jesus Jara Rodriguez", "2247312M", "c2", usado.idEstadoVehiculo, "3881LYM"],
      ["Delia Kosset Gonzalez Garcia", "Y8252910H", "c3", usado.idEstadoVehiculo, null],
      ["Natalia Martinez Muñoz", "50877768C", "c4", nuevo.idEstadoVehiculo, null],
      ["Isabel Bravo Moreno", "11791376N", "c5", usado.idEstadoVehiculo, null],
    ];
    for (const [nombre, dni, id, estado, matricula] of datos) {
      const [c] = await db.insert(clientes).values({ clienteId: id, nombre, dni }).returning();
      await db.insert(expedientes).values({ idUsuario: admin.idUsuario, idCliente: c.id, idTipoDeVenta: financiado.idTipoDeVenta, idEstadoVehiculo: estado, matricula, fechaExpediente: "2026-09-02" });
    }
    console.log("Datos de prueba creados.");
  } finally {
    await pool.end();
  }
}

void main().catch((e: unknown) => {
  console.error("ERR", e instanceof Error ? e.message : e);
  process.exit(1);
});
