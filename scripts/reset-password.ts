import "dotenv/config";
import { eq } from "drizzle-orm";
import { db, pool } from "../src/db";
import { usuarios } from "../src/db/schema";
import { generarPasswordTemporal, hashPassword } from "../src/lib/auth/password";
import { revocarSesiones } from "../src/lib/servicios/autenticacion";

/**
 * Emergencia: pone una contraseña temporal nueva a un usuario (se muestra una sola vez), le obliga a
 * cambiarla en el siguiente acceso y cierra todas sus sesiones. Uso:
 *   npm run reset-password -- correo@dominio.com
 */
async function main(): Promise<void> {
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email) throw new Error("Uso: npm run reset-password -- correo@dominio.com");
  try {
    const [u] = await db.select({ id: usuarios.idUsuario, nombre: usuarios.nombre }).from(usuarios).where(eq(usuarios.loginEmail, email));
    if (!u) throw new Error("No existe ningún usuario con ese correo.");
    const temporal = generarPasswordTemporal();
    await db
      .update(usuarios)
      .set({ passwordHash: await hashPassword(temporal), debeCambiarPassword: true, intentosFallidos: 0, bloqueadoHasta: null })
      .where(eq(usuarios.idUsuario, u.id));
    await revocarSesiones(db, u.id);
    console.log(`Contraseña temporal para ${u.nombre ?? email}: ${temporal}`);
    console.log("Se mostrará solo ahora. El usuario deberá cambiarla en su próximo acceso.");
  } finally {
    await pool.end();
  }
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
