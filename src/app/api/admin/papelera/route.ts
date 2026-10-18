import { NextResponse } from "next/server";
import { db } from "@/db";
import { auditar } from "@/lib/auditoria";
import { HttpError, requireSession } from "@/lib/auth/sesion";
import { leerJsonCrudo, manejar } from "@/lib/http";
import { CATEGORIAS, compactar, descargarPapelera, esquemaAFondo, esquemaCompactar, esquemaPurga, espacioBaseDeDatos, filasPapelera, purgar, purgarAFondo, resumenPapelera, type Categoria } from "@/lib/servicios/papelera";

export const dynamic = "force-dynamic";
export const maxDuration = 900;

const categoriaValida = (v: string | null): Categoria => {
  if (!v || !(CATEGORIAS as readonly string[]).includes(v)) throw new HttpError(400, "Categoría no válida");
  return v as Categoria;
};

/**
 * Sin parámetros: resumen de la papelera (qué hay en cada categoría y cuánto ocupa) y espacio de la base de datos.
 * `?categoria=x`: las filas de esa categoría. `?categoria=x&descargar=1[&ids=1,2]`: descarga su contenido en JSON.
 */
export const GET = manejar(async (req: Request) => {
  const admin = await requireSession("administrador");
  const q = new URL(req.url).searchParams;
  if (q.get("categoria")) {
    const categoria = categoriaValida(q.get("categoria"));
    if (q.get("descargar") === "1") {
      const ids = q.get("ids") ? (q.get("ids") as string).split(",") : null;
      const contenido = await descargarPapelera(db, categoria, ids);
      await auditar({ idUsuario: admin.idUsuario, accion: "papelera_descargada", entidad: categoria, detalle: { registros: contenido.registros } });
      return new NextResponse(JSON.stringify(contenido, null, 2), { headers: { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename="gv_papelera_${categoria}_${new Date().toISOString().slice(0, 10)}.json"`, "Cache-Control": "no-store" } });
    }
    const motivo = q.get("motivo");
    return NextResponse.json({ success: true, data: await filasPapelera(db, categoria, 500, motivo === "sin_vincular" || motivo === "eliminados" ? motivo : undefined) });
  }
  const [categorias, espacio] = await Promise.all([resumenPapelera(db), espacioBaseDeDatos(db)]);
  return NextResponse.json({ success: true, data: { categorias, espacio } });
});

/** Purgar una categoría (`{categoria, ids | todo | antesDeDias, confirmacion: "PURGAR"}`), purgar a fondo (`{accion: "a_fondo"}`) o compactar (`{accion: "compactar"}`). */
export const POST = manejar(async (req: Request) => {
  const admin = await requireSession("administrador");
  const crudo = await leerJsonCrudo(req);
  if (crudo.accion === "compactar") {
    esquemaCompactar.parse(crudo);
    const r = await compactar(db);
    await auditar({ idUsuario: admin.idUsuario, accion: "bbdd_compactada", entidad: "papelera", detalle: { ...r } });
    return NextResponse.json({ success: true, data: r });
  }
  if (crudo.accion === "a_fondo") {
    const r = await purgarAFondo(db, admin.idUsuario, esquemaAFondo.parse(crudo));
    await auditar({ idUsuario: admin.idUsuario, accion: "papelera_purgada_a_fondo", entidad: "papelera", detalle: { purgados: r.purgados, bloqueados: r.bloqueados, detalle: r.detalle } });
    return NextResponse.json({ success: true, data: r });
  }
  const entrada = esquemaPurga.parse(crudo);
  const r = await purgar(db, admin.idUsuario, entrada);
  await auditar({ idUsuario: admin.idUsuario, accion: "papelera_purgada", entidad: entrada.categoria, detalle: { purgados: r.purgados, bloqueados: r.bloqueados } });
  return NextResponse.json({ success: true, data: r });
});
