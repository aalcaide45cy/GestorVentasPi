import { NextResponse } from "next/server";
import { db } from "@/db";
import { HttpError, requireSession } from "@/lib/auth/sesion";
import { leerJson, manejar } from "@/lib/http";
import { z } from "zod";
import { misAlertas, posponerAlerta, reabrirAlerta, resolverAlerta } from "@/lib/servicios/alertas";

export const dynamic = "force-dynamic";

/** Mis alertas: pendientes, pospuestas y las resueltas de los últimos 60 días. */
export const GET = manejar(async () => {
  const u = await requireSession("no_invitado");
  return NextResponse.json({ success: true, data: await misAlertas(db, u) });
});

const esquema = z.discriminatedUnion("accion", [
  z.object({ accion: z.literal("hecho"), id: z.number().int().positive() }),
  z.object({ accion: z.literal("reabrir"), id: z.number().int().positive() }),
  z.object({ accion: z.literal("posponer"), id: z.number().int().positive(), hasta: z.enum(["1h", "manana", "3dias"]) }),
]);

/** Cuándo vuelve a saltar una alerta pospuesta: dentro de una hora, mañana a las 8:00 o dentro de tres días a las 8:00. */
function fechaDeAplazamiento(hasta: "1h" | "manana" | "3dias"): Date {
  const d = new Date();
  if (hasta === "1h") return new Date(d.getTime() + 3_600_000);
  d.setDate(d.getDate() + (hasta === "manana" ? 1 : 3));
  d.setHours(8, 0, 0, 0);
  return d;
}

export const POST = manejar(async (req: Request) => {
  const u = await requireSession("no_invitado");
  const e = await leerJson(req, esquema);
  if (e.accion === "hecho") await resolverAlerta(db, u, e.id);
  else if (e.accion === "reabrir") await reabrirAlerta(db, u, e.id);
  else if (e.accion === "posponer") await posponerAlerta(db, u, e.id, fechaDeAplazamiento(e.hasta));
  else throw new HttpError(400, "Acción no válida");
  return NextResponse.json({ success: true, data: { ok: true } });
});
