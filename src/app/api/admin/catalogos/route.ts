import { NextResponse } from "next/server";
import { db } from "@/db";
import { requireSession } from "@/lib/auth/sesion";
import { leerJson, manejar } from "@/lib/http";
import {
  actualizarCatalogo,
  crearCatalogo,
  eliminarCatalogo,
  esquemaActualizarCatalogo,
  esquemaCrearCatalogo,
  esquemaEliminarCatalogo,
  leerCatalogos,
  usosDeModelo,
} from "@/lib/servicios/catalogos";
import { listarVendedores } from "@/lib/servicios/usuarios";

export const dynamic = "force-dynamic";

/** Lectura para cualquier sesión (los formularios la usan para sus desplegables). */
export const GET = manejar(async () => {
  await requireSession();
  const c = await leerCatalogos(db);
  const modelosPorMarca: Record<number, { id: number; nombre: string }[]> = {};
  for (const m of c.modelos) {
    if (m.marca_id) (modelosPorMarca[m.marca_id] ??= []).push({ id: m.id_modelo, nombre: m.nombre_modelo });
  }
  const vendedores = await listarVendedores(db);
  return NextResponse.json({
    success: true,
    data: {
      marcas: c.marcas.map((m) => ({ id: m.id_marca, nombre: m.nombre })),
      modelosPorMarca,
      tiposVenta: c.tiposVenta.map((t) => ({ id: t.id_tipo_de_venta, nombre: t.nombre_tipo_venta })),
      vendedores: vendedores.map((v) => ({ id: v.id_usuario, nombre: v.nombre })),
    },
  });
});

/** `?usos_modelo=ID`: cuántos expedientes usan ese modelo (para preguntar adónde pasan al eliminarlo). */
export const PATCH = manejar(async (req: Request) => {
  await requireSession("administrador");
  const id = Number(new URL(req.url).searchParams.get("usos_modelo"));
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ success: false, message: "Falta el modelo" }, { status: 400 });
  return NextResponse.json({ success: true, data: { expedientes: await usosDeModelo(db, id) } });
});

export const POST = manejar(async (req: Request) => {
  await requireSession("administrador");
  const data = await crearCatalogo(db, await leerJson(req, esquemaCrearCatalogo));
  return NextResponse.json({ success: true, data }, { status: 201 });
});

export const PUT = manejar(async (req: Request) => {
  await requireSession("administrador");
  const data = await actualizarCatalogo(db, await leerJson(req, esquemaActualizarCatalogo));
  return NextResponse.json({ success: true, data });
});

export const DELETE = manejar(async (req: Request) => {
  await requireSession("administrador");
  const message = await eliminarCatalogo(db, await leerJson(req, esquemaEliminarCatalogo));
  return NextResponse.json({ success: true, message });
});
