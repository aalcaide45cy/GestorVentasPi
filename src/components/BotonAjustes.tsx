"use client";

import Link from "next/link";
import { guardarPreferencia } from "@/lib/preferencias";

/**
 * Botón «⚙️ Ajustes» de las pantallas: lleva a la pestaña de Configuración que ajusta esa pantalla (y, si la pestaña tiene subpestañas, a la que toca).
 * Solo lo ve el administrador, que es quien entra en Configuración.
 */
export default function BotonAjustes({ pestana, subpestana, subpestanaId, titulo = "Ajustes", ayuda, soloIcono }: { pestana: string; subpestana?: string; subpestanaId?: string; titulo?: string; ayuda?: string; soloIcono?: boolean }) {
  return (
    <Link
      href="/dashboard/admin"
      className="btn btn-secondary"
      style={{ padding: soloIcono ? "5px 10px" : "3px 10px", fontSize: "0.8rem", textDecoration: "none" }}
      aria-label={titulo}
      title={ayuda ?? `Abre Configuración › ${titulo}`}
      onClick={() => {
        guardarPreferencia("config-pestana", pestana);
        if (subpestana && subpestanaId) guardarPreferencia(`subpestana-${subpestanaId}`, subpestana);
      }}
    >
      {soloIcono ? "⚙️" : `⚙️ ${titulo}`}
    </Link>
  );
}
