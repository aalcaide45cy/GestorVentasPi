import { notFound, redirect } from "next/navigation";
import { db } from "@/db";
import FichaCliente from "@/components/clientes/FichaCliente";
import { esRolActivo } from "@/lib/auth/permisos";
import { getCurrentUser } from "@/lib/auth/sesion";
import { leerCatalogos } from "@/lib/servicios/catalogos";
import { obtenerCliente } from "@/lib/servicios/clientes";
import { expedientesDeCliente } from "@/lib/servicios/expedientes-lectura";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

/** Ficha de un cliente: sus datos y documentos, y la tabla de todos sus expedientes (página entera, como «Editar expediente»). */
export default async function FichaClientePage({ params }: Props) {
  const user = await getCurrentUser();
  if (!user || !esRolActivo(user.rol)) redirect("/dashboard");

  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const [cliente, expedientes, catalogos] = await Promise.all([obtenerCliente(db, id), expedientesDeCliente(db, id), leerCatalogos(db)]);
  if (!cliente) notFound();

  return <FichaCliente cliente={cliente} expedientes={expedientes} tiendas={catalogos.tiendas} />;
}
