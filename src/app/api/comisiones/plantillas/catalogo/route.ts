import { NextResponse } from "next/server";
import { db } from "@/db";
import { auditar } from "@/lib/auditoria";
import { requireSession } from "@/lib/auth/sesion";
import { leerJsonCrudo, manejar } from "@/lib/http";
import { crearCatalogoFaltante } from "@/lib/servicios/plantillas-tarifas";

export const dynamic = "force-dynamic";

/** Crea las marcas y modelos que una plantilla necesita y todavía no existen (todo o nada). */
export const POST = manejar(async (req: Request) => {
  const u = await requireSession("administrador");
  const r = await crearCatalogoFaltante(db, await leerJsonCrudo(req));
  await auditar({ idUsuario: u.idUsuario, accion: "catalogo_creado_desde_plantilla", entidad: "marcas", detalle: { marcas: r.marcasCreadas, modelos: r.modelosCreados } });
  return NextResponse.json({ success: true, ...r }, { status: 201 });
});
