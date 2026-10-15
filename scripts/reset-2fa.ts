import "dotenv/config";
import { eq } from "drizzle-orm";
import { db, pool } from "../src/db";
import { usuarios } from "../src/db/schema";
import { resetear2fa } from "../src/lib/servicios/autenticacion";

/**
 * Emergencia: quita el doble factor de un usuario (pérdida del móvil y de los códigos de recuperación)
 * y cierra todas sus sesiones. Uso:
 *   npm run reset-2fa -- correo@dominio.com
 * El usuario deberá volver a activar el 2FA en su próximo acceso.
 */
async function main(): Promise<void> {
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email) throw new Error("Uso: npm run reset-2fa -- correo@dominio.com");
  try {
    const [u] = await db.select({ id: usuarios.idUsuario, nombre: usuarios.nombre }).from(usuarios).where(eq(usuarios.loginEmail, email));
    if (!u) throw new Error("No existe ningún usuario con ese correo.");
    await resetear2fa(db, u.id);
    console.log(`2FA restablecido para ${u.nombre ?? email}. Sus sesiones se han cerrado; deberá activarlo de nuevo al entrar.`);
  } finally {
    await pool.end();
  }
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
