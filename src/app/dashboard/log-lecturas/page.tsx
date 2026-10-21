import { redirect } from "next/navigation";

/** El historial de lecturas vive ahora en Herramientas (pestaña «Historial de lecturas»). */
export default function LogLecturasPage() {
  redirect("/dashboard/herramientas?p=historial");
}
