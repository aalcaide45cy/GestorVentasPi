import { redirect } from "next/navigation";

/** La biblioteca vive ahora en Herramientas (pestaña «Biblioteca»): se mantiene esta dirección por si estaba guardada en favoritos. */
export default function BibliotecaPage() {
  redirect("/dashboard/herramientas?p=biblioteca");
}
