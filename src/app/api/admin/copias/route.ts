import { NextResponse } from "next/server";
import { db } from "@/db";
import { auditar } from "@/lib/auditoria";
import { requireSession } from "@/lib/auth/sesion";
import { errorJson, leerIdQuery, manejar } from "@/lib/http";
import { z } from "zod";
import { leerJson } from "@/lib/http";
import { guardarNotaCopia, borrarCopia, borrarCopiasInvalidas, crearCopia, estadoCopias, leerAjustesCopias, listarCopias } from "@/lib/servicios/copias";
import { avisoEspacioCopias } from "@/lib/servicios/copias";
import { encolar, type ContextoTarea } from "@/lib/servicios/tareas";
import { estadoClaveRecuperacion } from "@/lib/servicios/clave-recuperacion";
import { borrarEnDrive, estadoDrive, subirCopiaADrive } from "@/lib/servicios/drive";

export const dynamic = "force-dynamic";
export const maxDuration = 600;

export const GET = manejar(async () => {
  await requireSession("administrador");
  const [copias, estado, ajustes, drive, claveRecuperacion, aviso] = await Promise.all([listarCopias(db), estadoCopias(db), leerAjustesCopias(db), estadoDrive(db), estadoClaveRecuperacion(db), avisoEspacioCopias(db)]);
  return NextResponse.json({ success: true, data: { copias, estado, ajustes, drive, claveRecuperacion, aviso } });
});

/**
 * «Crear copia ahora» (y, si se pide, subirla a Drive). Con `?asincrono=1` se pone en la cola de segundo plano y devuelve `{ tarea }`: una
 * base grande tarda un buen rato y así se puede seguir usando la aplicación.
 */
export const POST = manejar(async (req: Request) => {
  const admin = await requireSession("administrador");
  const q = new URL(req.url).searchParams;
  const subirDrive = q.get("drive") === "1";
  const trabajo = async (ctx?: ContextoTarea) => {
    ctx?.avance(0, 0, "Haciendo la copia de seguridad…");
    const copia = await crearCopia(db, "manual", admin.idUsuario);
    await auditar({ idUsuario: admin.idUsuario, accion: "copia_creada", entidad: "copias_seguridad", entidadId: copia.id, detalle: { nombre: copia.nombre } });
    let aviso: string | null = null;
    if (subirDrive) {
      ctx?.avance(0, 0, "Subiendo la copia a Google Drive…");
      try {
        await subirCopiaADrive(db, copia.id);
      } catch (e) {
        aviso = `La copia se creó, pero no se pudo subir a Google Drive: ${e instanceof Error ? e.message : "error"}`;
      }
    }
    return { copia, aviso, detalle: [`Copia creada: ${copia.nombre}`, ...(subirDrive && !aviso ? ["Subida a Google Drive"] : []), ...(aviso ? [aviso] : [])] };
  };
  if (q.get("asincrono") === "1") {
    const tarea = encolar({ tipo: "copias", titulo: subirDrive ? "Crear copia y subirla a Drive" : "Crear copia de seguridad", idUsuario: admin.idUsuario, cancelable: false }, (ctx) => trabajo(ctx));
    return NextResponse.json({ success: true, tarea: tarea.id }, { status: 202 });
  }
  const r = await trabajo();
  return NextResponse.json({ success: true, data: r.copia, aviso: r.aviso }, { status: 201 });
});

/** Pone o cambia la nota de una copia. */
export const PATCH = manejar(async (req: Request) => {
  const admin = await requireSession("administrador");
  const e = await leerJson(req, z.object({ id: z.number().int().positive(), notas: z.string().max(2000).nullable() }));
  await guardarNotaCopia(db, e.id, e.notas);
  await auditar({ idUsuario: admin.idUsuario, accion: "copia_nota", entidad: "copias_seguridad", entidadId: e.id });
  return NextResponse.json({ success: true });
});

export const DELETE = manejar(async (req: Request) => {
  const admin = await requireSession("administrador");
  // «Borrar las copias inválidas»: quita las copias vacías o rotas (no sirven para restaurar)
  if (new URL(req.url).searchParams.get("invalidas") === "1") {
    const { borradas, driveFileIds } = await borrarCopiasInvalidas(db);
    let aviso: string | null = null;
    if (driveFileIds.length > 0) {
      try {
        await borrarEnDrive(db, driveFileIds);
      } catch {
        aviso = "Se borraron las copias locales, pero no se pudieron borrar las de Google Drive.";
      }
    }
    await auditar({ idUsuario: admin.idUsuario, accion: "copias_invalidas_borradas", entidad: "copias_seguridad", detalle: { borradas } });
    return NextResponse.json({ success: true, borradas, aviso });
  }
  const id = leerIdQuery(req);
  // Varias a la vez: `{ ids: [...] }` en el cuerpo; una sola petición y una sola llamada a Google Drive con todas
  if (!id && (req.headers.get("content-type") ?? "").includes("json")) {
    const { ids } = await leerJson(req, z.object({ ids: z.array(z.number().int().positive()).min(1) }));
    let borradas = 0;
    const fallos: string[] = [];
    const idsDrive: string[] = [];
    for (const unico of [...new Set(ids)]) {
      try {
        const { driveFileId } = await borrarCopia(db, unico);
        if (driveFileId) idsDrive.push(driveFileId);
        borradas++;
      } catch (e) {
        fallos.push(e instanceof Error ? e.message : "Error desconocido");
      }
    }
    let avisoDrive: string | null = null;
    if (idsDrive.length > 0) {
      try {
        await borrarEnDrive(db, idsDrive);
      } catch {
        avisoDrive = "Se borraron las copias locales, pero no se pudieron borrar las de Google Drive.";
      }
    }
    await auditar({ idUsuario: admin.idUsuario, accion: "copias_borradas_en_lote", entidad: "copias_seguridad", detalle: { borradas } });
    return NextResponse.json({ success: true, data: { borradas, fallos, aviso: avisoDrive } });
  }
  if (!id) return errorJson(400, "Falta el ID de la copia");
  const { driveFileId } = await borrarCopia(db, id);
  let aviso: string | null = null;
  if (driveFileId) {
    try {
      await borrarEnDrive(db, [driveFileId]);
    } catch {
      aviso = "Se borró la copia local, pero no se pudo borrar la de Google Drive.";
    }
  }
  await auditar({ idUsuario: admin.idUsuario, accion: "copia_borrada", entidad: "copias_seguridad", entidadId: id });
  return NextResponse.json({ success: true, aviso });
});
