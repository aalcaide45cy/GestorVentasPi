"use client";

/** El PDF (o la foto) del pedido leído, al lado de los datos, para decidir qué se aplica mirando el original. */
export default function VisorPedido({ idAdjunto, nombre }: { idAdjunto: number; nombre: string }) {
  return (
    <div style={{ flex: "1.2 1 0", minWidth: 0, display: "flex", flexDirection: "column", gap: "6px", position: "sticky", top: 0 }}>
      <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", display: "flex", justifyContent: "space-between", gap: "8px" }}>
        <span>📄 {nombre}</span>
        <a href={`/api/adjuntos?id=${idAdjunto}`} target="_blank" rel="noreferrer" style={{ color: "var(--primary)" }}>
          Abrir en otra pestaña
        </a>
      </div>
      <iframe src={`/api/adjuntos?id=${idAdjunto}`} title={`Pedido ${nombre}`} style={{ width: "100%", height: "72vh", border: "1px solid var(--border-light)", borderRadius: "var(--radius-sm)", background: "#fff" }} />
    </div>
  );
}
