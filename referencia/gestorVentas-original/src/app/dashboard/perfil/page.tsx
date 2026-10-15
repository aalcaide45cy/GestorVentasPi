import { syncUser } from "@/lib/auth-utils";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { usuarios } from "@/db/schema";
import { eq } from "drizzle-orm";
import PerfilForm from "@/components/PerfilForm";

export default async function PerfilPage() {
  const user = await syncUser();

  if (!user) {
    redirect("/sign-in");
  }

  // 1. Obtener los datos completos del usuario con emails, teléfonos y tiendas asignadas
  const dbUser = await db.query.usuarios.findFirst({
    where: eq(usuarios.id_usuario, user.id_usuario),
    with: {
      emails: true,
      telefonos: true,
      tiendas: true
    }
  });

  if (!dbUser) {
    redirect("/sign-in");
  }

  // 2. Obtener todas las tiendas disponibles del sistema
  const dbTiendas = await db.query.tiendas.findMany();

  // Transformar las tiendas al formato del componente
  const todasLasTiendas = dbTiendas.map(t => ({ id: t.id_tienda, nombre: t.nombre }));
  const tiendasAsignadas = dbUser.tiendas.map(ut => ut.id_tienda);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      <div>
        <h1 style={{ fontSize: "1.85rem", marginBottom: "8px" }}>Mis Datos</h1>
        <p style={{ color: "var(--text-secondary)" }}>
          Gestiona tu información de contacto personal y las tiendas físicas en las que trabajas.
        </p>
      </div>

      <PerfilForm
        nombreInicial={dbUser.nombre || ""}
        rol={dbUser.rol || "invitado"}
        fechaRegistro={dbUser.fecha_de_registro || ""}
        emailsIniciales={dbUser.emails.map(e => ({ email: e.email, tipo_email: e.tipo_email || "Principal" }))}
        telefonosIniciales={dbUser.telefonos.map(t => ({ telefono: t.telefono, tipo_telefono: t.tipo_telefono || "Principal" }))}
        todasLasTiendas={todasLasTiendas}
        tiendasAsignadasIniciales={tiendasAsignadas}
      />
    </div>
  );
}
