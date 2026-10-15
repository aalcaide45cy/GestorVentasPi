import { NextResponse } from "next/server";
import { db } from "@/db";
import { requireSession } from "@/lib/auth/sesion";
import { manejar } from "@/lib/http";
import { buscarClientes } from "@/lib/servicios/clientes";

export const dynamic = "force-dynamic";

export const GET = manejar(async (req: Request) => {
  await requireSession();
  const q = new URL(req.url).searchParams.get("q") ?? "";
  if (!q.trim()) return NextResponse.json({ data: [] });
  return NextResponse.json({ data: await buscarClientes(db, q) });
});
