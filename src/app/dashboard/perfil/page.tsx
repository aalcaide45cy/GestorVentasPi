import { redirect } from "next/navigation";
import { db } from "@/db";
import PerfilForm from "@/components/PerfilForm";
import { getCurrentUser } from "@/lib/auth/sesion";
import { leerCatalogos } from "@/lib/servicios/catalogos";
import { obtenerUsuario } from "@/lib/servicios/usuarios";

export const dynamic = "force-dynamic";

export default async function PerfilPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const [perfil, catalogos] = await Promise.all([obtenerUsuario(db, user.idUsuario), leerCatalogos(db)]);
  if (!perfil) redirect("/login");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      <div>
        <h1 style={{ fontSize: "1.85rem", marginBottom: "8px" }}>Mis Datos</h1>
        <p style={{ color: "var(--text-secondary)" }}>Gestiona tu información de contacto personal y las tiendas físicas en las que trabajas.</p>
      </div>

      <PerfilForm
        nombreInicial={perfil.nombre ?? ""}
        rol={perfil.rol ?? "invitado"}
        fechaRegistro={perfil.fecha_de_registro ?? ""}
        emailsIniciales={perfil.emails.map((e) => ({ email: e.email, tipo_email: e.tipo_email || "Principal" }))}
        telefonosIniciales={perfil.telefonos.map((t) => ({ telefono: t.telefono, tipo_telefono: t.tipo_telefono || "Principal" }))}
        todasLasTiendas={catalogos.tiendas.map((t) => ({ id: t.id_tienda, nombre: t.nombre }))}
        tiendasAsignadasIniciales={perfil.tiendas}
      />
    </div>
  );
}
