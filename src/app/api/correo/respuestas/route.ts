import { NextResponse } from "next/server";
import { db } from "@/db";
import { requireSession } from "@/lib/auth/sesion";
import { manejar } from "@/lib/http";
import {
  estadoRevision,
  revisarRespuestas,
} from "@/lib/servicios/correo-respuestas";
import { listarCuentas } from "@/lib/servicios/correo";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** Cuándo se revisó por última vez el buzón de cada una de mis cuentas y el último error. */
export const GET = manejar(async () => {
  const u = await requireSession("no_invitado");
  const cuentas = await listarCuentas(db, u);
  return NextResponse.json({
    success: true,
    data: await estadoRevision(
      db,
      cuentas.map((c) => c.id),
    ),
  });
});

/** Revisa ahora el buzón de mis cuentas con la lectura de respuestas activada (solo lectura). */
export const POST = manejar(async () => {
  const u = await requireSession("no_invitado");
  return NextResponse.json({
    success: true,
    data: await revisarRespuestas(db, { idUsuario: u.idUsuario }),
  });
});
