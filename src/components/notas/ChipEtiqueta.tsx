import type { EtiquetaDto } from "@/lib/notas";

/** La etiqueta con su color y su emoticono (sin ellos, neutra). */
export default function ChipEtiqueta({
  nombre,
  aspecto,
  pequeno,
  children,
}: {
  nombre: string;
  aspecto?: EtiquetaDto;
  pequeno?: boolean;
  children?: React.ReactNode;
}) {
  const color = aspecto?.color ?? null;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "4px",
        padding: pequeno ? "0 6px" : "1px 8px",
        borderRadius: "999px",
        fontSize: pequeno ? "0.68rem" : "0.78rem",
        background: color ? `${color}26` : "rgba(127, 127, 127, 0.15)",
        border: `1px solid ${color ?? "var(--border-light)"}`,
        color: "var(--text-primary)",
        whiteSpace: "nowrap",
      }}
    >
      <span aria-hidden>{aspecto?.emoji || "🏷"}</span>
      {nombre}
      {children}
    </span>
  );
}

/** Busca el aspecto de una etiqueta (sin distinguir mayúsculas). */
export const aspectoDe = (
  catalogo: EtiquetaDto[],
  nombre: string,
): EtiquetaDto | undefined =>
  catalogo.find((c) => c.nombre.toLowerCase() === nombre.toLowerCase());
