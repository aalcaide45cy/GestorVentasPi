import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { HttpError, requireSession } from "@/lib/auth/sesion";
import { leerIdQuery, leerJson, manejar } from "@/lib/http";
import { TIPOS_NOTA, esquemaCambiarNota, esquemaCrearNota, type TipoNota } from "@/lib/notas";
import { actualizarNota, crearNota, duplicarNota, eliminarDefinitivamente, enviarAPapelera, listarNotas, leerNota, restaurarNota, vaciarPapelera } from "@/lib/servicios/notas";

export const dynamic = "force-dynamic";

const tiposDe = (q: URLSearchParams): TipoNota[] | undefined => {
  const t = q.get("tipos");
  if (!t) return undefined;
  const l = t.split(",").filter((x): x is TipoNota => (TIPOS_NOTA as readonly string[]).includes(x));
  return l.length > 0 ? l : undefined;
};

/** `?id=N` una nota con su contenido; sin `id`, la lista (mis notas y las compartidas conmigo) de `?tipos=nota` o `?tipos=diagrama,tablero`; `&papelera=1` la papelera. */
export const GET = manejar(async (req: Request) => {
  const u = await requireSession("no_invitado");
  const q = new URL(req.url).searchParams;
  const id = leerIdQuery(req);
  if (id) return NextResponse.json({ success: true, data: await leerNota(db, u, id) });
  return NextResponse.json({ success: true, data: await listarNotas(db, u, { tipos: tiposDe(q), papelera: q.get("papelera") === "1" }) });
});

export const POST = manejar(async (req: Request) => {
  const u = await requireSession("no_invitado");
  const q = new URL(req.url).searchParams;
  const accion = q.get("accion");
  if (accion === "restaurar" || accion === "duplicar") {
    const id = leerIdQuery(req);
    if (!id) throw new HttpError(400, "Falta la nota");
    if (accion === "restaurar") {
      await restaurarNota(db, u, id);
      return NextResponse.json({ success: true, data: { ok: true } });
    }
    return NextResponse.json({ success: true, data: await duplicarNota(db, u, id) }, { status: 201 });
  }
  if (accion === "vaciar-papelera") {
    const { tipos } = await leerJson(req, z.object({ tipos: z.array(z.enum(TIPOS_NOTA)).optional() }));
    return NextResponse.json({ success: true, data: { eliminadas: await vaciarPapelera(db, u, tipos) } });
  }
  return NextResponse.json({ success: true, data: await crearNota(db, u, await leerJson(req, esquemaCrearNota)) }, { status: 201 });
});

export const PUT = manejar(async (req: Request) => {
  const u = await requireSession("no_invitado");
  const id = leerIdQuery(req);
  if (!id) throw new HttpError(400, "Falta la nota");
  return NextResponse.json({ success: true, data: await actualizarNota(db, u, id, await leerJson(req, esquemaCambiarNota)) });
});

/** A la papelera; con `&definitivo=1` (solo desde la papelera) la borra para siempre. */
export const DELETE = manejar(async (req: Request) => {
  const u = await requireSession("no_invitado");
  const id = leerIdQuery(req);
  if (!id) throw new HttpError(400, "Falta la nota");
  if (new URL(req.url).searchParams.get("definitivo") === "1") await eliminarDefinitivamente(db, u, id);
  else await enviarAPapelera(db, u, id);
  return NextResponse.json({ success: true, data: { ok: true } });
});
