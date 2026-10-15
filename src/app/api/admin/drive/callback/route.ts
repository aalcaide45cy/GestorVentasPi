import { NextResponse } from "next/server";
import { db } from "@/db";
import { auditar } from "@/lib/auditoria";
import { requireSession } from "@/lib/auth/sesion";
import { completarConexion, validarState } from "@/lib/servicios/drive";

export const dynamic = "force-dynamic";

/** Vuelta desde Google: valida el `state` firmado, guarda el refresh token cifrado y vuelve a Configuración. */
export async function GET(req: Request): Promise<NextResponse> {
  const base = (process.env.PUBLIC_URL ?? new URL(req.url).origin).replace(/\/+$/, "");
  const volver = (estado: string) => NextResponse.redirect(`${base}/dashboard/admin?drive=${estado}`);
  try {
    const admin = await requireSession("administrador");
    const q = new URL(req.url).searchParams;
    if (q.get("error")) return volver("cancelado");
    const codigo = q.get("code");
    const state = q.get("state") ?? "";
    if (!codigo || !validarState(state, admin.idUsuario)) return volver("error");
    await completarConexion(db, codigo);
    await auditar({ idUsuario: admin.idUsuario, accion: "drive_conectado", entidad: "conexion_drive" });
    return volver("ok");
  } catch {
    return volver("error");
  }
}
