import { NextResponse } from "next/server";
import { db } from "@/db";
import { HttpError, requireSession } from "@/lib/auth/sesion";
import { leerIdQuery, manejar } from "@/lib/http";
import { CATEGORIAS, documentosDeFila, type Categoria } from "@/lib/servicios/papelera";

export const dynamic = "force-dynamic";

/** Los documentos de una fila de la papelera (`?categoria=expedientes|clientes|documentos&id=N`), también los eliminados. Solo el administrador. */
export const GET = manejar(async (req: Request) => {
  await requireSession("administrador");
  const categoria = new URL(req.url).searchParams.get("categoria");
  if (!categoria || !(CATEGORIAS as readonly string[]).includes(categoria)) throw new HttpError(400, "Categoría no válida");
  const id = leerIdQuery(req);
  if (!id) throw new HttpError(400, "Falta la fila");
  return NextResponse.json({ success: true, data: await documentosDeFila(db, categoria as Categoria, id) });
});
