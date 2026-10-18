import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { requireSession } from "@/lib/auth/sesion";
import { leerJson, manejar } from "@/lib/http";
import { aplicarHistorial } from "@/lib/servicios/historial";

export const dynamic = "force-dynamic";

const esquema = z.object({ grupo: z.string().uuid().optional(), forzar: z.boolean().optional() });

/** Sin `grupo`, el último paso; con `grupo`, todos los pasos hasta ese (incluido). */
export const POST = manejar(async (req: Request) => {
  const u = await requireSession("no_invitado");
  const entrada = await leerJson(req, esquema);
  const r = await aplicarHistorial(db, u.idUsuario, "deshacer", entrada);
  return NextResponse.json({ success: true, data: r });
});
