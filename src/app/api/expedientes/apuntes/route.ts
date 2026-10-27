import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { HttpError, requireSession } from "@/lib/auth/sesion";
import { leerIdQuery, leerJson, manejar } from "@/lib/http";
import { actualizarApunte, anadirRapido, anadirVoRetoma, crearApunte, eliminarApunte, esquemaApunte, fijarEstadoSemaforo, listarApuntes } from "@/lib/servicios/apuntes";

export const dynamic = "force-dynamic";

/** Apuntes de un expediente (`?id=N`). */
export const GET = manejar(async (req: Request) => {
  await requireSession("no_invitado");
  const id = leerIdQuery(req);
  if (!id) throw new HttpError(400, "Falta el expediente");
  return NextResponse.json({ success: true, data: await listarApuntes(db, id) });
});

const esquemaCrear = z.discriminatedUnion("accion", [
  z.object({ accion: z.literal("nuevo"), id_expediente: z.number().int().positive(), apunte: esquemaApunte }),
  z.object({ accion: z.literal("rapido"), id_expediente: z.number().int().positive(), id_predefinido: z.number().int().positive(), descripcion: z.string().max(500).nullish() }),
  /** Lo usa la lectura de un pedido con retoma (matrícula o texto de la retoma). */
  z.object({ accion: z.literal("vo_retoma"), id_expediente: z.number().int().positive(), detalle: z.string().max(500).nullish() }),
]);

/** Añade un apunte a mano, con un botón rápido (solo uno por predefinido y expediente) o el de VO de retoma. */
export const POST = manejar(async (req: Request) => {
  const u = await requireSession("no_invitado");
  const e = await leerJson(req, esquemaCrear);
  if (e.accion === "nuevo") return NextResponse.json({ success: true, data: { creado: true, apunte: await crearApunte(db, u, e.id_expediente, e.apunte) } }, { status: 201 });
  if (e.accion === "rapido") return NextResponse.json({ success: true, data: await anadirRapido(db, u, e.id_expediente, e.id_predefinido, e.descripcion) });
  return NextResponse.json({ success: true, data: await anadirVoRetoma(db, u, e.id_expediente, e.detalle ?? null) });
});

export const PUT = manejar(async (req: Request) => {
  const u = await requireSession("no_invitado");
  const id = leerIdQuery(req);
  if (!id) throw new HttpError(400, "Falta el apunte");
  // Dos usos: cambiar el estado de un semáforo (`{ accion: "estado", estado_semaforo }`) o editar el texto del apunte
  const e = await leerJson(req, z.union([z.object({ accion: z.literal("estado"), estado_semaforo: z.number().int().min(0).max(9) }), esquemaApunte]));
  if ("accion" in e) return NextResponse.json({ success: true, data: await fijarEstadoSemaforo(db, u, id, e.estado_semaforo) });
  return NextResponse.json({ success: true, data: await actualizarApunte(db, u, id, e) });
});

export const DELETE = manejar(async (req: Request) => {
  const u = await requireSession("no_invitado");
  const id = leerIdQuery(req);
  if (!id) throw new HttpError(400, "Falta el apunte");
  await eliminarApunte(db, u, id);
  return NextResponse.json({ success: true, data: { eliminado: true } });
});
