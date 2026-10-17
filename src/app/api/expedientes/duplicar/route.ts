import { NextResponse } from "next/server";
import { db } from "@/db";
import { requireSession } from "@/lib/auth/sesion";
import { leerJson, manejar } from "@/lib/http";
import { esquemaDuplicarExpedientes } from "@/lib/servicios/expedientes";
import { duplicarExpedientes } from "@/lib/servicios/expedientes-escritura";

export const dynamic = "force-dynamic";

/** Duplica expedientes (uno o en masa) en una sola operación: o se crean todas las copias o ninguna. */
export const POST = manejar(async (req: Request) => {
  const usuario = await requireSession("crear_expedientes");
  const entrada = await leerJson(req, esquemaDuplicarExpedientes);
  const r = await duplicarExpedientes(db, usuario, entrada);
  return NextResponse.json({ success: true, creados: r.creados, impactos: r.impactos, copia: r.copia, message: `${r.creados} expediente${r.creados === 1 ? "" : "s"} duplicado${r.creados === 1 ? "" : "s"}` }, { status: 201 });
});
