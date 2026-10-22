import { NextResponse } from "next/server";
import { db } from "@/db";
import { auditar } from "@/lib/auditoria";
import { HttpError, requireSession } from "@/lib/auth/sesion";
import { leerJsonCrudo, manejar } from "@/lib/http";
import { encolar, type ContextoTarea } from "@/lib/servicios/tareas";
import { CATEGORIAS, compactar, descargarPapelera, esquemaAFondo, esquemaCompactar, esquemaPurga, esquemaRestaurar, espacioBaseDeDatos, filasPapelera, purgar, purgarAFondo, restaurar, resumenPapelera, type Categoria } from "@/lib/servicios/papelera";

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

/**
 * Restaurar lo elegido (`{accion: "restaurar", categoria, ids}`), purgar una categoría (`{categoria, ids | todo | antesDeDias, confirmacion: "PURGAR"}`), purgar a fondo (`{accion: "a_fondo"}`) o compactar
 * (`{accion: "compactar"}`). Con `?asincrono=1` no espera: pone la tarea en la cola de segundo plano y devuelve `{ tarea }` para seguir su
 * avance en `/api/tareas` (se puede navegar por la aplicación mientras tanto).
 */
export const POST = manejar(async (req: Request) => {
  const admin = await requireSession("administrador");
  const crudo = await leerJsonCrudo(req);
  const asincrono = new URL(req.url).searchParams.get("asincrono") === "1";

  // Se valida todo antes de poner nada en cola
  type Trabajo = { titulo: string; ejecutar: (ctx?: ContextoTarea) => Promise<unknown> };
  let trabajo: Trabajo;
  if (crudo.accion === "compactar") {
    esquemaCompactar.parse(crudo);
    trabajo = {
      titulo: "Compactar la base de datos",
      ejecutar: async (ctx) => {
        const r = await compactar(db, ctx);
        await auditar({ idUsuario: admin.idUsuario, accion: "bbdd_compactada", entidad: "papelera", detalle: { ...r } });
        return r;
      },
    };
  } else if (crudo.accion === "restaurar") {
    const entrada = esquemaRestaurar.parse(crudo);
    trabajo = {
      titulo: `Restaurar ${entrada.ids.length.toLocaleString("es-ES")} de la papelera`,
      ejecutar: async (ctx) => {
        const r = await restaurar(db, entrada, ctx);
        await auditar({ idUsuario: admin.idUsuario, accion: "papelera_restaurada", entidad: entrada.categoria, detalle: { restaurados: r.restaurados, bloqueados: r.bloqueados } });
        return r;
      },
    };
  } else if (crudo.accion === "a_fondo") {
    const entrada = esquemaAFondo.parse(crudo);
    trabajo = {
      titulo: "Purgar a fondo la papelera",
      ejecutar: async (ctx) => {
        const r = await purgarAFondo(db, admin.idUsuario, entrada, ctx);
        await auditar({ idUsuario: admin.idUsuario, accion: "papelera_purgada_a_fondo", entidad: "papelera", detalle: { purgados: r.purgados, bloqueados: r.bloqueados, detalle: r.detalle } });
        return r;
      },
    };
  } else {
    const entrada = esquemaPurga.parse(crudo);
    trabajo = {
      titulo: `Purgar ${entrada.categoria}`,
      ejecutar: async (ctx) => {
        const r = await purgar(db, admin.idUsuario, entrada, ctx);
        await auditar({ idUsuario: admin.idUsuario, accion: "papelera_purgada", entidad: entrada.categoria, detalle: { purgados: r.purgados, bloqueados: r.bloqueados } });
        return r;
      },
    };
  }
  if (asincrono) {
    const tarea = encolar({ tipo: "papelera", titulo: trabajo.titulo, idUsuario: admin.idUsuario }, (ctx) => trabajo.ejecutar(ctx));
    return NextResponse.json({ success: true, tarea: tarea.id }, { status: 202 });
  }
  return NextResponse.json({ success: true, data: await trabajo.ejecutar() });
});
