import { NextResponse } from "next/server";
import { db } from "@/db";
import { HttpError, requireSession } from "@/lib/auth/sesion";
import { leerJson, manejar } from "@/lib/http";
import { z } from "zod";
import { eliminarAlerta, misAlertas, posponerAlerta, reabrirAlerta, resolverAlerta, vaciarResueltas } from "@/lib/servicios/alertas";

export const dynamic = "force-dynamic";

/** Mis alertas: pendientes, pospuestas y las resueltas de los últimos 60 días. */
export const GET = manejar(async () => {
  const u = await requireSession("no_invitado");
  return NextResponse.json({ success: true, data: await misAlertas(db, u) });
});

const esquema = z.discriminatedUnion("accion", [
  z.object({ accion: z.literal("hecho"), id: z.number().int().positive() }),
  z.object({ accion: z.literal("reabrir"), id: z.number().int().positive() }),
  z.object({ accion: z.literal("eliminar"), id: z.number().int().positive() }),
  z.object({ accion: z.literal("vaciar_resueltas") }),
  z.object({ accion: z.literal("posponer"), id: z.number().int().positive(), hasta: z.enum(["15m", "30m", "1h", "2h", "4h", "manana", "3dias", "semana"]) }),
]);

/** Cuándo vuelve a saltar una alerta pospuesta: dentro de unos minutos u horas, o mañana, dentro de tres días o de una semana a las 8:00. */
function fechaDeAplazamiento(hasta: "15m" | "30m" | "1h" | "2h" | "4h" | "manana" | "3dias" | "semana"): Date {
  const d = new Date();
  const minutos = { "15m": 15, "30m": 30, "1h": 60, "2h": 120, "4h": 240 }[hasta as "15m"];
  if (minutos) return new Date(d.getTime() + minutos * 60_000);
  d.setDate(d.getDate() + (hasta === "manana" ? 1 : hasta === "3dias" ? 3 : 7));
  d.setHours(8, 0, 0, 0);
  return d;
}

export const POST = manejar(async (req: Request) => {
  const u = await requireSession("no_invitado");
  const e = await leerJson(req, esquema);
  if (e.accion === "hecho") await resolverAlerta(db, u, e.id);
  else if (e.accion === "reabrir") await reabrirAlerta(db, u, e.id);
  else if (e.accion === "eliminar") await eliminarAlerta(db, u, e.id);
  else if (e.accion === "vaciar_resueltas") return NextResponse.json({ success: true, data: { eliminadas: await vaciarResueltas(db, u) } });
  else if (e.accion === "posponer") await posponerAlerta(db, u, e.id, fechaDeAplazamiento(e.hasta));
  else throw new HttpError(400, "Acción no válida");
  return NextResponse.json({ success: true, data: { ok: true } });
});
