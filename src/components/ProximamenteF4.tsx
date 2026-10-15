/** Marcador de las pantallas que llegan con el motor de comisiones (F3) y su interfaz (F4). */
export default function ProximamenteF4({ titulo, descripcion }: { titulo: string; descripcion: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "32px" }}>
      <div>
        <h1 style={{ fontSize: "1.85rem", marginBottom: "8px" }}>{titulo}</h1>
        <p style={{ color: "var(--text-secondary)" }}>{descripcion}</p>
      </div>
      <div className="glass-panel" style={{ padding: "50px", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: "16px", borderLeft: "4px solid var(--info)" }}>
        <h2 style={{ fontSize: "1.3rem" }}>Próximamente</h2>
        <p style={{ color: "var(--text-secondary)", maxWidth: "520px", lineHeight: "1.6" }}>
          Esta pantalla se activará cuando esté listo el motor de comisiones. Mientras tanto puedes seguir trabajando con expedientes y clientes.
        </p>
      </div>
    </div>
  );
}
