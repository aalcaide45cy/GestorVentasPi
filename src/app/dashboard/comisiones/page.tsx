import { redirect } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { usuarios } from "@/db/schema";
import ComisionesManager from "@/components/comisiones/ComisionesManager";
import { esAdministrador, esRolActivo } from "@/lib/auth/permisos";
import { getCurrentUser } from "@/lib/auth/sesion";
import { leerCatalogos } from "@/lib/servicios/catalogos";

export const dynamic = "force-dynamic";

export default async function ComisionesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!esRolActivo(user.rol)) redirect("/dashboard");
  const esAdmin = esAdministrador(user.rol);

  const catalogos = await leerCatalogos(db);
  const vendedores = await db
    .select({ id: usuarios.idUsuario, nombre: usuarios.nombre, tipo: usuarios.tipoVendedor })
    .from(usuarios)
    .where(and(eq(usuarios.bloqueado, false)))
    .orderBy(asc(usuarios.nombre));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      <div>
        <h1 style={{ fontSize: "1.85rem", marginBottom: "8px" }}>Comisiones</h1>
        <p style={{ color: "var(--text-secondary)" }}>Planes de comisionamiento, liquidaciones y control de cobros.</p>
      </div>
      <ComisionesManager
        esAdmin={esAdmin}
        idUsuario={user.idUsuario}
        cat={{
          marcas: catalogos.marcas.map((m) => ({ id: m.id_marca, nombre: m.nombre })),
          modelos: catalogos.modelos.map((m) => ({ id: m.id_modelo, nombre: m.nombre_modelo, marcaId: m.marca_id })),
          vendedores: vendedores.map((v) => ({ id: v.id, nombre: v.nombre ?? `Usuario ${v.id}`, tipo: v.tipo })),
        }}
      />
    </div>
  );
}
