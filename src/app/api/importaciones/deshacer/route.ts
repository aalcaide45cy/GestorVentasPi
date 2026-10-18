import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { auditar } from "@/lib/auditoria";
import { requireSession } from "@/lib/auth/sesion";
import { leerJson, manejar } from "@/lib/http";
import { deshacerBloque } from "@/lib/servicios/completar-datos";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Deshace una importación: elimina lo que creó y devuelve lo que cambió a su valor anterior. */
export const POST = manejar(async (req: Request) => {
  const usuario = await requireSession("administrador");
  const { id } = await leerJson(req, z.object({ id: z.number().int().positive() }));
  const r = await deshacerBloque(db, usuario, id);
  await auditar({ idUsuario: usuario.idUsuario, accion: "importacion_deshecha", entidad: "importaciones_bloques", entidadId: id, detalle: { eliminados: r.eliminados, revertidos: r.revertidos } });
  return NextResponse.json({ success: true, data: r });
});
