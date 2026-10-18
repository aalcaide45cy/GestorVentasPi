import { NextResponse } from "next/server";
import { db } from "@/db";
import { HttpError, requireSession } from "@/lib/auth/sesion";
import { leerIdQuery, manejar } from "@/lib/http";
import { leerDocumentoPapelera } from "@/lib/servicios/papelera";

export const dynamic = "force-dynamic";

/** Descarga (o, con `?ver=1`, muestra en línea) un documento de la papelera, también eliminado o sin vincular, ya descifrado. Solo el administrador. */
export const GET = manejar(async (req: Request) => {
  await requireSession("administrador");
  const ver = new URL(req.url).searchParams.get("ver") === "1";
  const id = leerIdQuery(req);
  if (!id) throw new HttpError(400, "Falta el documento");
  const d = await leerDocumentoPapelera(db, id);
  return new NextResponse(new Uint8Array(d.datos), { headers: { "Content-Type": d.mime, "Content-Disposition": `${ver ? "inline" : "attachment"}; filename="${encodeURIComponent(d.nombre)}"`, "Cache-Control": "no-store" } });
});
