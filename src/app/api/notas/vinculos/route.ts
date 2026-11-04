import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { HttpError, requireSession } from "@/lib/auth/sesion";
import { manejar } from "@/lib/http";
import { TIPOS_VINCULO } from "@/lib/notas";
import { buscarDestinos, notasDeDestino } from "@/lib/servicios/notas-vinculos";

export const dynamic = "force-dynamic";

const esquema = z.object({
  tipo: z.enum(TIPOS_VINCULO),
  q: z.string().max(100).optional(),
  id: z.coerce.number().int().positive().optional(),
});

/** `?tipo=&q=`: busca a qué se puede vincular. `?tipo=&id=`: las notas vinculadas a ese expediente, cliente, plan… */
export const GET = manejar(async (req: Request) => {
  const u = await requireSession("no_invitado");
  const p = esquema.safeParse(
    Object.fromEntries(new URL(req.url).searchParams),
  );
  if (!p.success) throw new HttpError(400, "Petición no válida");
  if (p.data.id)
    return NextResponse.json({
      success: true,
      data: await notasDeDestino(db, u, p.data.tipo, p.data.id),
    });
  return NextResponse.json({
    success: true,
    data: await buscarDestinos(db, p.data.tipo, p.data.q ?? ""),
  });
});
