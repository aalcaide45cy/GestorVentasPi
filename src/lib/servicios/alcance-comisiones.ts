import { esAdministrador } from "@/lib/auth/permisos";
import { HttpError, type UsuarioActual } from "@/lib/auth/sesion";

/**
 * Vendedor sobre el que se consulta: el administrador puede elegir (`?usuario=`),
 * el resto solo ve lo suyo (7.2: «solo sus propias liquidaciones en modo lectura»).
 */
export function usuarioObjetivo(usuario: UsuarioActual, req: Request): number {
  const q = new URL(req.url).searchParams.get("usuario");
  if (q === null || q === "") return usuario.idUsuario;
  const n = Number(q);
  if (!Number.isInteger(n) || n <= 0) throw new HttpError(400, "Vendedor no válido");
  if (n !== usuario.idUsuario && !esAdministrador(usuario.rol)) throw new HttpError(403, "No tienes permiso para ver las comisiones de otro usuario");
  return n;
}

export function mesDeQuery(req: Request): string {
  const m = new URL(req.url).searchParams.get("mes") ?? "";
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(m)) throw new HttpError(400, "Mes no válido (AAAA-MM)");
  return m;
}
