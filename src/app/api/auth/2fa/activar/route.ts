import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { auditar } from "@/lib/auditoria";
import { requireSesionParcial, rotarSesion } from "@/lib/auth/sesion";
import { leerJson, manejar } from "@/lib/http";
import { activarTotp } from "@/lib/servicios/autenticacion";

export const dynamic = "force-dynamic";

const esquema = z.object({ codigo: z.string().trim().regex(/^\d{6}$/, "El código tiene 6 dígitos") });

/** Confirma el 2FA con un código, completa la sesión y devuelve los 10 códigos de recuperación (una sola vez). */
export const POST = manejar(async (req: Request) => {
  const sesion = await requireSesionParcial();
  const { codigo } = await leerJson(req, esquema);
  const codigos = await activarTotp(db, sesion.usuario.idUsuario, codigo);
  await rotarSesion(sesion.sesionId, true);
  await auditar({ idUsuario: sesion.usuario.idUsuario, accion: "2fa_activado" });
  return NextResponse.json({ ok: true, codigos, debeCambiarPassword: sesion.usuario.debeCambiarPassword });
});
