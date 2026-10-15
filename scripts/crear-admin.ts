import "dotenv/config";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { usuarios } from "../src/db/schema";
import { hashPassword, validarPassword } from "../src/lib/auth/password";

/**
 * Crea un administrador. Uso:
 *   npm run crear-admin -- "Nombre Apellidos" correo@dominio.com
 * La contraseña se toma de la variable ADMIN_PASSWORD o se pide por terminal.
 */
async function pedirPassword(): Promise<string> {
  const desdeEntorno = process.env.ADMIN_PASSWORD;
  if (desdeEntorno) return desdeEntorno;
  if (!process.stdin.isTTY) throw new Error("Define ADMIN_PASSWORD o ejecuta el script en una terminal interactiva.");
  process.stdout.write("Contraseña (mínimo 12 caracteres): ");
  return new Promise((resolve) => {
    let texto = "";
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", function alDato(c: string) {
      for (const ch of c) {
        if (ch === "\r" || ch === "\n") {
          process.stdin.setRawMode(false);
          process.stdin.pause();
          process.stdin.removeListener("data", alDato);
          process.stdout.write("\n");
          resolve(texto);
          return;
        }
        if (ch === "\u0003") process.exit(130);
        if (ch === "\u007f" || ch === "\b") texto = texto.slice(0, -1);
        else texto += ch;
      }
    });
  });
}

async function main(): Promise<void> {
  const [nombre, email] = process.argv.slice(2);
  if (!nombre || !email) throw new Error('Uso: npm run crear-admin -- "Nombre Apellidos" correo@dominio.com');
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Falta DATABASE_URL");

  const password = await pedirPassword();
  const error = validarPassword(password);
  if (error) throw new Error(error);

  const pool = new Pool({ connectionString: url, max: 1 });
  try {
    const db = drizzle(pool);
    const login = email.trim().toLowerCase();
    const [existente] = await db.select().from(usuarios).where(eq(usuarios.loginEmail, login));
    if (existente) throw new Error("Ya existe un usuario con ese correo.");
    await db.insert(usuarios).values({
      loginEmail: login,
      passwordHash: await hashPassword(password),
      debeCambiarPassword: false,
      nombre: nombre.trim(),
      rol: "administrador",
      fechaDeRegistro: new Date().toISOString().slice(0, 10),
    });
    console.log(`Administrador creado: ${login}`);
  } finally {
    await pool.end();
  }
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
