"use client";

import { useSyncExternalStore } from "react";
import { cancelarLecturas, cerrarDialogoCancelar, leerDialogoCancelar, leerResumenLecturas, leerSubida, solicitarCancelacion, suscribirDialogoCancelar, suscribirResumenLecturas, suscribirSubida } from "@/lib/lecturas-pedidos-cliente";

const capa = { position: "fixed", inset: 0, background: "rgba(0, 0, 0, 0.72)", display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" } as const;

/**
 * Pantalla completa mientras se suben los pedidos al servidor: no se puede cambiar de pantalla ni cerrar la pestaña (el navegador
 * pregunta antes de salir) hasta que termine, para que no se quede ninguno a medias. Después, la lectura sigue en el servidor (o espera
 * a «Iniciar lectura» si la lectura es manual). El botón «Cancelar subida» pregunta si se elimina lo ya subido o se deja subido.
 * También pinta el diálogo de cancelación que abren los demás botones «Cancelar» de lectura.
 */
export default function OverlaySubida() {
  const s = useSyncExternalStore(suscribirSubida, leerSubida, () => null);
  const dialogo = useSyncExternalStore(suscribirDialogoCancelar, leerDialogoCancelar, () => false);
  const resumen = useSyncExternalStore(suscribirResumenLecturas, leerResumenLecturas, () => null);
  const pct = s && s.total > 0 ? Math.round((100 * s.hechos) / s.total) : 0;
  const manual = resumen?.manual ?? false;
  return (
    <>
      {s && (
        <div role="alertdialog" aria-live="polite" style={{ ...capa, zIndex: 100000 }}>
          <div className="glass-panel" style={{ padding: "28px 32px", maxWidth: "460px", width: "100%", display: "flex", flexDirection: "column", gap: "14px", textAlign: "center" }}>
            <div style={{ fontSize: "2rem" }}>📤</div>
            <strong style={{ fontSize: "1.1rem" }}>
              Subiendo pedidos: {s.hechos} de {s.total}
            </strong>
            <div style={{ height: "10px", borderRadius: "999px", background: "var(--bg-surface-tint)", overflow: "hidden" }}>
              <div style={{ width: `${pct}%`, height: "100%", background: "var(--primary)", transition: "width 0.2s" }} />
            </div>
            <span style={{ color: "var(--text-secondary)", fontSize: "0.9rem", lineHeight: 1.5 }}>
              No cierres esta pestaña ni cambies de pantalla hasta que termine. {manual ? "Cuando acabe de subirlos, la lectura empieza cuando pulses «Iniciar lectura»." : "Cuando acabe de subirlos, se leerán solos en segundo plano."}
            </span>
            <button type="button" className="btn btn-secondary" onClick={solicitarCancelacion} title="Pregunta qué hacer con lo ya subido: eliminarlo o dejarlo subido. La subida se para al momento.">
              ✖ Cancelar subida
            </button>
          </div>
        </div>
      )}
      {dialogo && (
        <div role="alertdialog" aria-modal="true" style={{ ...capa, zIndex: 100001 }}>
          <div className="glass-panel" style={{ padding: "26px 28px", maxWidth: "480px", width: "100%", display: "flex", flexDirection: "column", gap: "14px" }}>
            <strong style={{ fontSize: "1.1rem" }}>{s ? "¿Cancelar la subida?" : "¿Cancelar la lectura?"}</strong>
            <span style={{ color: "var(--text-secondary)", fontSize: "0.9rem", lineHeight: 1.5 }}>
              {s
                ? "La subida se para ahora mismo. ¿Qué hacemos con lo que ya se haya subido de esta tanda?"
                : "Se parará la lectura de lo que falta y se borrarán esos documentos del servidor (lo que ya está leído y en la cola de pedidos se queda)."}
            </span>
            {s ? (
              <>
                <button type="button" className="btn btn-primary" style={{ background: "var(--danger)", borderColor: "var(--danger)" }} onClick={() => void cancelarLecturas({ eliminar: true })} title="Borra todo lo subido en esta tanda: lo que esperaba, lo que se estaba leyendo y lo ya leído que aún esté en la cola de pedidos (con sus documentos).">
                  🗑 Eliminar todo lo subido
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => void cancelarLecturas({ eliminar: false })} title={manual ? "Se para la subida y lo ya subido queda esperando: lo leerás cuando pulses «Iniciar lectura»." : "Se para la subida y lo ya subido se lee como siempre."}>
                  📌 Dejarlo subido {manual ? "(espera a «Iniciar lectura»)" : "(se leerá)"}
                </button>
                <button type="button" className="btn btn-secondary" onClick={cerrarDialogoCancelar}>
                  Seguir subiendo
                </button>
              </>
            ) : (
              <>
                <button type="button" className="btn btn-primary" style={{ background: "var(--danger)", borderColor: "var(--danger)" }} onClick={() => void cancelarLecturas({ eliminar: true })}>
                  ✖ Cancelar y eliminar lo que falta
                </button>
                <button type="button" className="btn btn-secondary" onClick={cerrarDialogoCancelar}>
                  Seguir leyendo
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
