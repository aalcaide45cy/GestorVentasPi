"use client";

import Link from "next/link";
import TablaDatos, { type ColumnaTabla } from "@/components/TablaDatos";
import type { ClienteDto } from "@/lib/dto";

const columnas: ColumnaTabla<ClienteDto>[] = [
  { clave: "nombre", etiqueta: "Nombre", valor: (c) => c.nombre ?? "", celda: (c) => <b style={{ color: "var(--text-primary)" }}>{c.nombre}</b> },
  { clave: "dni", etiqueta: "DNI / NIE", valor: (c) => c.dni ?? "" },
  { clave: "email", etiqueta: "Correo", valor: (c) => c.emails[0]?.email ?? "", celda: (c) => (c.emails[0]?.email ? `📧 ${c.emails[0].email}` : "—") },
  { clave: "telefono", etiqueta: "Teléfono", valor: (c) => c.telefonos[0]?.telefono ?? "", celda: (c) => (c.telefonos[0]?.telefono ? `📞 ${c.telefonos[0].telefono}` : "—") },
  { clave: "cp", etiqueta: "C. postal", valor: (c) => c.codigo_postal ?? "", oculta: true },
  {
    clave: "historial",
    etiqueta: "Historial",
    valor: () => "",
    celda: () => (
      <Link href="/dashboard/expedientes" style={{ fontSize: "0.85rem", color: "var(--primary)", textDecoration: "underline" }}>
        Ver en expedientes
      </Link>
    ),
  },
];

/** Clientes encontrados en una búsqueda, con orden, buscador y columnas a elegir. */
export default function TablaClientesEncontrados({ clientes }: { clientes: ClienteDto[] }) {
  return <TablaDatos<ClienteDto> id="buscar-clientes" columnas={columnas} filas={clientes} clave={(c) => c.id} placeholder="Buscar dentro de los resultados…" textoExtra={(c) => `${c.emails.map((e) => e.email).join(" ")} ${c.telefonos.map((t) => t.telefono).join(" ")}`} pie={(fs) => ({ nombre: `${fs.length} cliente${fs.length === 1 ? "" : "s"}` })} />;
}
