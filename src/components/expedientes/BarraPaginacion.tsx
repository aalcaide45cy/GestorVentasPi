"use client";

export const TAMANOS_PAGINA = [10, 20, 50, 100, 200, 500, 1000] as const;

interface Props {
  tamano: number;
  pagina: number;
  totalPaginas: number;
  totalFiltrados: number;
  totalGeneral: number;
  alCambiarTamano: (tamano: number) => void;
  alIrAPagina: (pagina: number) => void;
}

const estiloNavegacion = (desactivado: boolean) =>
  ({
    padding: "4px 8px",
    border: "1px solid var(--border-light)",
    borderRadius: "4px",
    background: "transparent",
    color: desactivado ? "var(--text-muted)" : "var(--text-primary)",
    cursor: desactivado ? "default" : "pointer",
    fontSize: "0.8rem",
  }) as const;

/** Barra de paginación que se repite arriba y abajo de la tabla. */
export default function BarraPaginacion({ tamano, pagina, totalPaginas, totalFiltrados, totalGeneral, alCambiarTamano, alIrAPagina }: Props) {
  const enPrimera = pagina === 1;
  const enUltima = pagina === totalPaginas;
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        flexWrap: "wrap",
        gap: "10px",
        padding: "10px 16px",
        background: "rgba(255, 255, 255, 0.02)",
        borderTop: "1px solid var(--border-light)",
        borderBottom: "1px solid var(--border-light)",
        fontSize: "0.85rem",
        color: "var(--text-secondary)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <span>Mostrar:</span>
        {TAMANOS_PAGINA.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => alCambiarTamano(t)}
            style={{
              padding: "3px 10px",
              fontSize: "0.8rem",
              border: `1px solid ${tamano === t ? "var(--primary)" : "var(--border-light)"}`,
              borderRadius: "4px",
              background: tamano === t ? "rgba(var(--primary-rgb), 0.12)" : "transparent",
              color: tamano === t ? "var(--primary)" : "var(--text-secondary)",
              cursor: "pointer",
              fontWeight: tamano === t ? 700 : 400,
            }}
          >
            {t}
          </button>
        ))}
        <span style={{ marginLeft: "8px" }}>
          {totalFiltrados} resultado(s){totalFiltrados !== totalGeneral ? ` (de ${totalGeneral} totales)` : ""}
        </span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
        <button type="button" onClick={() => alIrAPagina(1)} disabled={enPrimera} style={estiloNavegacion(enPrimera)} title="Primera página">
          «
        </button>
        <button type="button" onClick={() => alIrAPagina(pagina - 1)} disabled={enPrimera} style={estiloNavegacion(enPrimera)} title="Página anterior">
          ‹
        </button>
        <span style={{ padding: "4px 12px", fontWeight: 600, color: "var(--text-primary)" }}>
          Pág. {pagina} / {totalPaginas}
        </span>
        <button type="button" onClick={() => alIrAPagina(pagina + 1)} disabled={enUltima} style={estiloNavegacion(enUltima)} title="Página siguiente">
          ›
        </button>
        <button type="button" onClick={() => alIrAPagina(totalPaginas)} disabled={enUltima} style={estiloNavegacion(enUltima)} title="Última página">
          »
        </button>
      </div>
    </div>
  );
}
