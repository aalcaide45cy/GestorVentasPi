"use client";

import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";

/** «#EXP-0044» a partir del número de expediente. */
export const codigoExpediente = (id: number): string => `#EXP-${String(id).padStart(4, "0")}`;

/** Ruta de la ficha de un cliente y de la edición de un expediente (para no escribirlas a mano en cada pantalla). */
export const rutaCliente = (id: number): string => `/dashboard/clientes/${id}`;
export const rutaExpediente = (id: number): string => `/dashboard/expedientes/editar/${id}`;

const estiloEnlace: CSSProperties = { color: "var(--primary)", fontWeight: 700, textDecoration: "underline dotted", textUnderlineOffset: "3px", cursor: "pointer" };

interface PropsEnlace {
  /** Se abre en otra pestaña (útil dentro de una ventana, para no perder lo que se está mirando). */
  nuevaPestana?: boolean;
  estilo?: CSSProperties;
}

/** El código de un expediente (#EXP-0044) como enlace a su edición. Se usa en cualquier ventana o tabla que enseñe un expediente. */
export function EnlaceExpediente({ id, children, nuevaPestana, estilo }: PropsEnlace & { id: number; children?: ReactNode }) {
  return (
    <Link href={rutaExpediente(id)} target={nuevaPestana ? "_blank" : undefined} title="Abrir el expediente" style={{ ...estiloEnlace, ...estilo }}>
      {children ?? codigoExpediente(id)}
    </Link>
  );
}

/** Un icono pequeño 👤 que abre la ficha del cliente: para ponerlo al lado de un nombre que no puede ser un enlace (porque al pulsarlo se copia, por ejemplo). */
export function IconoCliente({ id, nuevaPestana }: { id: number | null | undefined; nuevaPestana?: boolean }) {
  if (!id) return null;
  return (
    <Link href={rutaCliente(id)} target={nuevaPestana ? "_blank" : undefined} title="Abrir la ficha del cliente y todos sus expedientes" aria-label="Abrir la ficha del cliente" style={{ marginLeft: "6px", textDecoration: "none", fontSize: "0.85rem" }}>
      👤
    </Link>
  );
}

/** El nombre de un cliente como enlace a su ficha (con sus datos y todos sus expedientes). Sin id, se pinta solo el texto. */
export function EnlaceCliente({ id, nombre, nuevaPestana, estilo }: PropsEnlace & { id: number | null | undefined; nombre: ReactNode }) {
  if (!id) return <>{nombre}</>;
  return (
    <Link href={rutaCliente(id)} target={nuevaPestana ? "_blank" : undefined} title="Abrir la ficha del cliente" style={{ ...estiloEnlace, fontWeight: 600, ...estilo }}>
      {nombre}
    </Link>
  );
}
