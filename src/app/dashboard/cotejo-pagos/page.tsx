import { asc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { usuarios } from "@/db/schema";
import CotejoHub from "@/components/cotejo/CotejoHub";
import { BotonesDatosSeccion } from "@/components/datos/DatosSeccion";
import { esAdministrador, esRolActivo } from "@/lib/auth/permisos";
import { getCurrentUser } from "@/lib/auth/sesion";
import { LIMITE_LISTA_EXPEDIENTES, listarExpedientes } from "@/lib/servicios/expedientes-lectura";

export const dynamic = "force-dynamic";

export default async function CotejoPagosPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!esRolActivo(user.rol)) redirect("/dashboard");
  const [expedientes, vendedores] = await Promise.all([
    listarExpedientes(db, { limite: LIMITE_LISTA_EXPEDIENTES }),
    db.select({ id: usuarios.idUsuario, nombre: usuarios.nombre, tipo: usuarios.tipoVendedor }).from(usuarios).where(eq(usuarios.bloqueado, false)).orderBy(asc(usuarios.nombre)),
  ]);
  const lista = vendedores.map((v) => ({ id: v.id, nombre: v.nombre ?? `Usuario ${v.id}`, tipo: v.tipo }));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "8px" }}>
        <div style={{ flex: "1 1 420px" }}>
          <h1 style={{ fontSize: "1.85rem", marginBottom: "8px" }}>Cotejo de pagos</h1>
          <p style={{ color: "var(--text-secondary)" }}>Todo para comprobar que la empresa te ha pagado lo que toca: tu mes, la hoja de la empresa y tu nómina.</p>
        </div>
        {esAdministrador(user.rol) && <BotonesDatosSeccion seccion="rejillas" />}
      </div>
      <CotejoHub
        expedientes={expedientes}
        vendedores={lista.map((v) => ({ id: v.id, nombre: v.nombre }))}
        esAdministrador={esAdministrador(user.rol)}
        catalogo={{ marcas: [], modelos: [], vendedores: lista }}
        idUsuario={user.idUsuario}
      />
    </div>
  );
}
