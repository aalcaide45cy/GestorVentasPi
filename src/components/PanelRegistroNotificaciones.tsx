"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import Modal from "@/components/Modal";
import { leerRegistro, marcarTodasLeidas, quitarNotificacion, registroServidor, suscribirRegistro, vaciarRegistro, type TipoNotificacion } from "@/lib/notificaciones-cliente";

const ICONO: Record<TipoNotificacion, string> = { exito: "✅", error: "🛑", aviso: "⚠️" };
const COLOR: Record<TipoNotificacion, string> = { exito: "var(--success)", error: "var(--danger)", aviso: "var(--warning)" };
const NOMBRE: Record<TipoNotificacion | "todas", string> = { todas: "Todas", exito: "Hechas", error: "Errores", aviso: "Avisos" };

const diaLargo = new Intl.DateTimeFormat("es-ES", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
const hora = new Intl.DateTimeFormat("es-ES", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
/** Día local (no el UTC) al que pertenece el instante: así las de la noche no saltan al día siguiente. */
const clave = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
};
const diaConMayuscula = (iso: string) => {
  const t = diaLargo.format(new Date(iso));
  return t.charAt(0).toUpperCase() + t.slice(1);
};

/** Registro de notificaciones: todo lo que la aplicación ha avisado, de lo más reciente a lo más antiguo, agrupado por día. */
export default function PanelRegistroNotificaciones({ alCerrar }: { alCerrar: () => void }) {
  const registro = useSyncExternalStore(suscribirRegistro, leerRegistro, registroServidor);
  const [tipo, setTipo] = useState<TipoNotificacion | "todas">("todas");
  const [buscar, setBuscar] = useState("");
  const [seguro, setSeguro] = useState(false);

  // Abrir el registro es verlas: dejan de contar como nuevas
  useEffect(() => {
    marcarTodasLeidas();
  }, [registro.length]);

  const filtradas = useMemo(() => {
    const q = buscar.trim().toLowerCase();
    return registro
      .filter((n) => (tipo === "todas" || n.tipo === tipo) && (!q || `${n.titulo ?? ""} ${n.texto} ${n.detalles.join(" ")}`.toLowerCase().includes(q)))
      .slice()
      .reverse();
  }, [registro, tipo, buscar]);

  const dias = useMemo(() => {
    const grupos: { dia: string; items: typeof filtradas }[] = [];
    for (const n of filtradas) {
      const d = clave(n.fecha);
      const ultimo = grupos[grupos.length - 1];
      if (ultimo && ultimo.dia === d) ultimo.items.push(n);
      else grupos.push({ dia: d, items: [n] });
    }
    return grupos;
  }, [filtradas]);

  return (
    <Modal
      titulo="🔔 Registro de notificaciones"
      ancho="720px"
      pie={
        <>
          {registro.length > 0 && (
            <button
              type="button"
              className="btn btn-secondary"
              style={seguro ? { borderColor: "var(--danger)", color: "var(--danger)" } : undefined}
              title="Borra todas las notificaciones guardadas en este navegador"
              onClick={() => {
                if (!seguro) {
                  setSeguro(true);
                  setTimeout(() => setSeguro(false), 4000);
                  return;
                }
                vaciarRegistro();
                setSeguro(false);
              }}
            >
              {seguro ? "Pulsa otra vez para vaciar" : "Vaciar registro"}
            </button>
          )}
          <button type="button" className="btn btn-primary" data-tecla="escape" onClick={alCerrar}>
            Cerrar
          </button>
        </>
      }
    >
      <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>Aquí quedan guardados los avisos que salen en pantalla (se conservan hasta 60 días, en este navegador).</div>
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
        {(["todas", "error", "aviso", "exito"] as const).map((t) => (
          <button key={t} type="button" className={tipo === t ? "btn btn-primary" : "btn btn-secondary"} style={{ padding: "4px 12px" }} onClick={() => setTipo(t)}>
            {t !== "todas" && `${ICONO[t]} `}
            {NOMBRE[t]}
          </button>
        ))}
        <input className="form-input" style={{ flex: "1 1 180px", minWidth: "140px" }} placeholder="Buscar en el registro…" value={buscar} onChange={(e) => setBuscar(e.target.value)} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "14px", maxHeight: "52vh", overflowY: "auto" }}>
        {dias.length === 0 && <div style={{ color: "var(--text-muted)", padding: "18px 0", textAlign: "center" }}>{registro.length === 0 ? "Todavía no hay notificaciones guardadas." : "Ninguna notificación coincide con el filtro."}</div>}
        {dias.map((g) => (
          <section key={g.dia} style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <h4 style={{ margin: 0, fontSize: "0.82rem", color: "var(--text-muted)" }}>{diaConMayuscula(g.items[0].fecha)}</h4>
            {g.items.map((n) => (
              <div key={n.id} style={{ display: "flex", gap: "10px", alignItems: "flex-start", border: "1px solid var(--border-light)", borderLeft: `4px solid ${COLOR[n.tipo]}`, borderRadius: "var(--radius-sm)", padding: "9px 12px" }}>
                <span aria-hidden style={{ fontSize: "1rem", lineHeight: 1.4 }}>
                  {ICONO[n.tipo]}
                </span>
                <div style={{ display: "flex", flexDirection: "column", gap: "3px", minWidth: 0, flex: 1 }}>
                  {n.titulo && <div style={{ fontSize: "0.76rem", fontWeight: 700, color: COLOR[n.tipo], textTransform: "uppercase" }}>{n.titulo}</div>}
                  <div style={{ fontSize: "0.92rem", fontWeight: 600, overflowWrap: "anywhere" }}>{n.texto}</div>
                  {n.detalles.length > 0 && (
                    <ul style={{ margin: 0, paddingLeft: "16px", fontSize: "0.82rem", color: "var(--text-secondary)", display: "flex", flexDirection: "column", gap: "2px" }}>
                      {n.detalles.map((d, i) => (
                        <li key={i} style={{ overflowWrap: "anywhere" }}>
                          {d}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "2px", flexShrink: 0 }}>
                  <span style={{ fontSize: "0.76rem", color: "var(--text-muted)" }}>{hora.format(new Date(n.fecha))}</span>
                  <button type="button" aria-label="Quitar esta notificación" title="Quitar esta notificación del registro" onClick={() => quitarNotificacion(n.id)} style={{ border: "none", background: "transparent", color: "var(--text-muted)", cursor: "pointer", padding: 0, fontSize: "0.9rem" }}>
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </section>
        ))}
      </div>
    </Modal>
  );
}
