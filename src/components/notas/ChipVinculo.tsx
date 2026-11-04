"use client";

import { NOMBRE_VINCULO, type VinculoDto } from "@/lib/notas";

/** Etiqueta de «a qué está asignada la nota»: con enlace a la ficha si la hay y una ✕ para quitarla. */
export default function ChipVinculo({
  v,
  alQuitar,
  pequeno,
}: {
  v: VinculoDto;
  alQuitar?: () => void;
  pequeno?: boolean;
}) {
  const estilo = {
    display: "inline-flex",
    alignItems: "center",
    gap: "4px",
    padding: pequeno ? "0 6px" : "1px 8px",
    borderRadius: "999px",
    fontSize: pequeno ? "0.7rem" : "0.8rem",
    background: "rgba(59,130,246,0.14)",
    border: "1px solid rgba(59,130,246,0.35)",
    color: "var(--text-primary)",
    maxWidth: "100%",
  } as const;
  const texto = `${NOMBRE_VINCULO[v.tipo].icono} ${v.texto}`;
  return (
    <span style={estilo} title={NOMBRE_VINCULO[v.tipo].singular}>
      {v.url && !pequeno ? (
        <a
          href={v.url}
          style={{
            color: "inherit",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {texto}
        </a>
      ) : (
        <span
          style={{
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {texto}
        </span>
      )}
      {alQuitar && (
        <button
          type="button"
          aria-label={`Quitar ${v.texto}`}
          onClick={alQuitar}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "var(--text-muted)",
            padding: 0,
          }}
        >
          ✕
        </button>
      )}
    </span>
  );
}
