import { NextResponse } from "next/server";
import { db } from "@/db";
import { requireSession } from "@/lib/auth/sesion";
import { leerJson, manejar } from "@/lib/http";
import { esquemaInforme, generarInforme } from "@/lib/servicios/informes";

export const dynamic = "force-dynamic";

/** Informe de rendimiento. Los vendedores solo ven lo suyo; el resto de roles activos, todo. */
export const POST = manejar(async (req: Request) => {
  const u = await requireSession("no_invitado");
  const filtro = await leerJson(req, esquemaInforme);
  const soloVendedor = u.rol === "vendedor" ? u.idUsuario : undefined;
  return NextResponse.json({ success: true, data: await generarInforme(db, filtro, soloVendedor) });
});
