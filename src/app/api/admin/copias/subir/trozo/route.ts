import { NextResponse } from "next/server";
import { db } from "@/db";
import { auditar } from "@/lib/auditoria";
import { requireSession } from "@/lib/auth/sesion";
import { errorJson, manejar } from "@/lib/http";
import { enMantenimiento } from "@/lib/mantenimiento";
import { origenValido } from "@/lib/origen";
import { anadirTrozoSubida, bytesDeSubida, limpiarSubidasAntiguas, terminarSubida } from "@/lib/servicios/copias";

export const dynamic = "force-dynamic";
export const maxDuration = 900;

/**
 * Subida de un `.dump` por trozos (reanudable). Cada petición lleva un trozo como cuerpo crudo:
 * `?id=<32 hex>&desde=<bytes ya recibidos>` y, en el último, `&fin=1&total=<bytes>&nombre=<fichero.dump>`.
 * Así una copia de un giga no depende de que una sola conexión dure minutos (túneles y navegadores las cortan: «Load failed»), y si
 * un trozo falla se repite desde donde se quedó. Como la de la subida entera, esta ruta no pasa por el proxy (ver su matcher) y
 * comprueba aquí el origen, el modo mantenimiento y la sesión.
 */
export const POST = manejar(async (req: Request) => {
  if (!origenValido(req)) return errorJson(403, "Origen no permitido");
  if (enMantenimiento()) return errorJson(503, "Restauración en curso. Inténtalo en unos minutos.");
  const admin = await requireSession("administrador");
  const q = new URL(req.url).searchParams;
  const id = q.get("id") ?? "";
  const desde = Number(q.get("desde") ?? "0");
  if (!Number.isInteger(desde) || desde < 0) return errorJson(400, "Posición no válida");
  const actual = await bytesDeSubida(id);
  // Si no encaja, se dice cuánto lleva recibido para que el navegador siga desde ahí
  if (desde !== actual) return NextResponse.json({ message: "El trozo no encaja con lo recibido", recibidos: actual }, { status: 409 });
  if (desde === 0) void limpiarSubidasAntiguas();
  const recibidos = await anadirTrozoSubida(id, desde, req.body);
  if (q.get("fin") !== "1") return NextResponse.json({ success: true, recibidos });
  const total = Number(q.get("total") ?? "-1");
  const copia = await terminarSubida(db, id, decodeURIComponent(q.get("nombre") ?? ""), total, admin.idUsuario);
  await auditar({ idUsuario: admin.idUsuario, accion: "copia_subida", entidad: "copias_seguridad", entidadId: copia.id });
  return NextResponse.json({ success: true, data: copia }, { status: 201 });
});
