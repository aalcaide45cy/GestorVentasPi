import { redirect } from "next/navigation";
import { db } from "@/db";
import { anunciarPrimerArranque, hayUsuarios } from "@/lib/servicios/primer-arranque";
import PrimerArranque from "./PrimerArranque";

export const dynamic = "force-dynamic";

/** Pantalla de primer arranque: solo existe mientras la instalación no tenga ningún usuario. */
export default async function PrimerArranquePage() {
  if (await hayUsuarios(db)) redirect("/login");
  // Deja el código a la vista en el registro del servidor por si todavía no se había anunciado
  await anunciarPrimerArranque(db);
  return <PrimerArranque />;
}
