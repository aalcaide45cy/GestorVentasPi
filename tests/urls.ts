import "dotenv/config";

/** Los tests de integración usan una base de datos aparte (`<nombre>_test`), nunca la de desarrollo. */
export const urlDesarrollo =
  process.env.DATABASE_URL ?? "postgres://gestor:cambia-esta-contrasena@127.0.0.1:5432/gestorventas";

export const urlPruebas = urlDesarrollo.replace(
  /\/([^/?]+)(\?.*)?$/,
  (_m, nombre: string, q: string | undefined) => `/${nombre}_test${q ?? ""}`,
);
