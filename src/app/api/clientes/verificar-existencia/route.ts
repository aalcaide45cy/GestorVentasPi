import { NextResponse } from "next/server";
import { and, eq, ilike, isNull, or, type SQL } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { clientes } from "@/db/schema";
import { requireSession } from "@/lib/auth/sesion";
import { leerJson, manejar } from "@/lib/http";
import { escaparLike } from "@/lib/servicios/comun";

export const dynamic = "force-dynamic";

const esquema = z.object({
  dni: z.string().nullish(),
  nombre: z.string().nullish(),
});

export const POST = manejar(async (req: Request) => {
  await requireSession();
  const { dni, nombre } = await leerJson(req, esquema);
  const condiciones: SQL[] = [];
  if (dni?.trim()) condiciones.push(eq(clientes.dni, dni.trim()));
  if (nombre?.trim()) condiciones.push(ilike(clientes.nombre, escaparLike(nombre.trim())));
  if (condiciones.length === 0) return NextResponse.json({ exists: false });

  const [c] = await db
    .select({ id: clientes.id, nombre: clientes.nombre, dni: clientes.dni })
    .from(clientes)
    .where(and(isNull(clientes.eliminadoEn), or(...condiciones)))
    .limit(1);
  return NextResponse.json(c ? { exists: true, cliente: c } : { exists: false });
});
