import { NextResponse } from "next/server";
import { db } from "@/db";
import { auditar } from "@/lib/auditoria";
import { requireSession } from "@/lib/auth/sesion";
import { errorJson, leerIdQuery, manejar } from "@/lib/http";
import { borrarCopia, borrarCopiasInvalidas, crearCopia, estadoCopias, leerAjustesCopias, listarCopias } from "@/lib/servicios/copias";
import { avisoEspacioCopias } from "@/lib/servicios/copias";
import { estadoClaveRecuperacion } from "@/lib/servicios/clave-recuperacion";
import { borrarEnDrive, estadoDrive, subirCopiaADrive } from "@/lib/servicios/drive";

export const dynamic = "force-dynamic";
export const maxDuration = 600;

export const GET = manejar(async () => {
  await requireSession("administrador");
  const [copias, estado, ajustes, drive, claveRecuperacion, aviso] = await Promise.all([listarCopias(db), estadoCopias(db), leerAjustesCopias(db), estadoDrive(db), estadoClaveRecuperacion(db), avisoEspacioCopias(db)]);
  return NextResponse.json({ success: true, data: { copias, estado, ajustes, drive, claveRecuperacion, aviso } });
});

/** «Crear copia ahora» (y, si se pide, subirla a Drive). */
export const POST = manejar(async (req: Request) => {
  const admin = await requireSession("administrador");
  const subirDrive = new URL(req.url).searchParams.get("drive") === "1";
  const copia = await crearCopia(db, "manual", admin.idUsuario);
  await auditar({ idUsuario: admin.idUsuario, accion: "copia_creada", entidad: "copias_seguridad", entidadId: copia.id, detalle: { nombre: copia.nombre } });
  let aviso: string | null = null;
  if (subirDrive) {
    try {
      await subirCopiaADrive(db, copia.id);
    } catch (e) {
      aviso = `La copia se creó, pero no se pudo subir a Google Drive: ${e instanceof Error ? e.message : "error"}`;
    }
  }
  return NextResponse.json({ success: true, data: copia, aviso }, { status: 201 });
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
