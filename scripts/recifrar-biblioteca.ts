import "dotenv/config";
import { db, pool } from "../src/db";
import { recifrarBiblioteca, secretoDeOrigen } from "../src/lib/servicios/clave-recuperacion";

/**
 * Repara los archivos de la biblioteca que una copia de seguridad restaurada dejó cifrados con la clave de OTRA instalación
 * (error «Unsupported state or unable to authenticate data» al abrirlos). Se repite sin riesgo: lo que ya se lee no se toca. Uso:
 *   npm run recifrar-biblioteca -- "<clave de recuperación o APP_SECRET de la instalación de origen>"
 */
async function main(): Promise<void> {
  const introducido = process.argv[2]?.trim();
  if (!introducido) throw new Error('Uso: npm run recifrar-biblioteca -- "<clave de recuperación o APP_SECRET de origen>"');
  try {
    const origen = await secretoDeOrigen(db, introducido);
    // Si la base no guarda la clave de recuperación envuelta, vale el secreto tal cual
    const secreto = origen?.secreto ?? introducido;
    const r = await recifrarBiblioteca(db, secreto);
    console.log(`Biblioteca: ${r.recifrados} archivo(s) vueltos a cifrar, ${r.yaLegibles} ya se leían, ${r.ilegibles} no se pueden abrir con esa clave.`);
    if (r.ilegibles > 0) process.exitCode = 2;
  } finally {
    await pool.end();
  }
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
