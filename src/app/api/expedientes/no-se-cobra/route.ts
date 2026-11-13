import { NextResponse } from "next/server";
import { db } from "@/db";
import { auditar } from "@/lib/auditoria";
import { requireSession } from "@/lib/auth/sesion";
import { leerJson, manejar } from "@/lib/http";
import { esquemaNoSeCobra, fijarNoSeCobra } from "@/lib/servicios/no-se-cobra";

export const dynamic = "force-dynamic";

/** Marca un expediente como «no se cobra» (o lo vuelve a contar como pendiente de cobro). */
export const POST = manejar(async (req: Request) => {
  const u = await requireSession("no_invitado");
  const entrada = await leerJson(req, esquemaNoSeCobra);
  await fijarNoSeCobra(db, u, entrada);
  await auditar({ idUsuario: u.idUsuario, accion: "no_se_cobra_cambiado", entidad: "expedientes", entidadId: String(entrada.idExpediente), detalle: { noSeCobra: entrada.noSeCobra, motivo: entrada.motivo ?? null } });
  return NextResponse.json({ success: true });
});
