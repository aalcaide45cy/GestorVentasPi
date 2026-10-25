"use client";

import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/components/Toast";
import { llamar, textoError } from "@/components/comisiones/api";
import type { EstadoMemoriaBd, ResultadoAplicarMemoriaBd } from "@/lib/servicios/memoria-bd";

const MEGAS_A_TEXTO = (mb: number) => (mb >= 1024 ? `${Math.round((mb / 1024) * 10) / 10} GB` : `${mb} MB`);

/**
 * Memoria de la base de datos: la que tiene ahora frente a la que le conviene en este equipo (según su RAM y si es una Raspberry), con un botón para
 * aplicarla cuando la propia aplicación puede cambiarla (en una instalación con Docker se cambia en el archivo .env).
 */
export default function MemoriaBdPanel() {
  const { mostrar } = useToast();
  const [e, setE] = useState<EstadoMemoriaBd | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aplicando, setAplicando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoAplicarMemoriaBd | null>(null);

  const cargar = useCallback(async () => {
    try {
      setE((await llamar<EstadoMemoriaBd>("/api/admin/rendimiento/memoria-bd")).data);
      setError(null);
    } catch (x) {
      setError(textoError(x));
    }
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void cargar();
  }, [cargar]);

  const aplicar = async () => {
    setAplicando(true);
    try {
      const r = (await llamar<ResultadoAplicarMemoriaBd>("/api/admin/rendimiento/memoria-bd", { method: "POST" })).data;
      setResultado(r);
      mostrar(r.mensaje);
      await cargar();
    } catch (x) {
      mostrar(textoError(x), "error");
    } finally {
      setAplicando(false);
    }
  };

  if (error) return null;
  if (!e) return null;
  const lineasEnv = e.ajustes.filter((a) => !a.igual).map((a) => `${a.variableEnv}=${a.recomendado}`);
  const reinicioPendiente = e.ajustes.some((a) => a.pendienteReinicio) || resultado?.hayQueReiniciar;

  return (
    <div className="glass-panel" style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: "10px", border: "1px solid var(--border-light)" }}>
      <div style={{ fontWeight: 700 }}>🧠 Memoria de la base de datos</div>
      <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>
        Este equipo es {e.tipoEquipo === "Raspberry" ? "una Raspberry" : e.tipoEquipo === "Apple" ? "un Mac" : "un PC"} con {MEGAS_A_TEXTO(e.ramMb)} de RAM. La memoria que conviene darle a la base de datos depende de eso: una Raspberry tiene que ir más justa que un Mac o un PC con mucha RAM.
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", fontSize: "0.85rem", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ textAlign: "left", color: "var(--text-secondary)" }}>
              <th style={{ padding: "4px 8px" }}>Ajuste</th>
              <th style={{ padding: "4px 8px" }}>Ahora</th>
              <th style={{ padding: "4px 8px" }}>Recomendado</th>
              <th style={{ padding: "4px 8px" }}></th>
            </tr>
          </thead>
          <tbody>
            {e.ajustes.map((a) => (
              <tr key={a.nombre} style={{ borderTop: "1px solid var(--border-light)" }}>
                <td style={{ padding: "4px 8px" }} title={a.nombre === "shared_buffers" ? "Memoria compartida para tablas e índices (cambiarla exige reiniciar PostgreSQL)" : a.nombre === "effective_cache_size" ? "Lo que se supone que el sistema guarda en caché para PostgreSQL (no reserva memoria)" : a.nombre === "work_mem" ? "Memoria por ordenación o unión" : "Memoria para mantenimiento: índices y restauraciones"}>
                  {a.nombre}
                </td>
                <td style={{ padding: "4px 8px" }}>{a.actual}</td>
                <td style={{ padding: "4px 8px" }}>{a.recomendado}</td>
                <td style={{ padding: "4px 8px", color: a.igual ? "var(--success)" : "var(--warning)" }}>{a.igual ? "✔ bien" : a.pendienteReinicio ? "pendiente de reiniciar" : "mejorable"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!e.hayCambios && <div style={{ fontSize: "0.85rem", color: "var(--success)" }}>La base de datos ya tiene la memoria recomendada para este equipo.</div>}
      {e.hayCambios && !e.fijadoPorElArranque && (
        <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
          <button type="button" className="btn btn-primary" style={{ padding: "5px 14px", fontSize: "0.85rem" }} disabled={aplicando} onClick={() => void aplicar()}>
            {aplicando ? "Aplicando…" : "Aplicar la memoria recomendada"}
          </button>
          <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>Se guarda en la configuración de PostgreSQL. La memoria compartida solo cambia al reiniciar PostgreSQL.</span>
        </div>
      )}
      {e.hayCambios && e.fijadoPorElArranque && (
        <div style={{ fontSize: "0.85rem", display: "flex", flexDirection: "column", gap: "6px" }}>
          <span>Aquí la memoria la fija el arranque de la base de datos (Docker), así que se cambia en el archivo <code>.env</code> de la instalación. Pon estas líneas{e.tipoEquipo === "Raspberry" ? ", y súbele también el límite del contenedor" : ""} y reinicia la base de datos:</span>
          <pre style={{ margin: 0, padding: "8px 10px", background: "rgba(255,255,255,0.04)", borderRadius: "var(--radius-sm)", fontSize: "0.82rem", overflowX: "auto" }}>{[...lineasEnv, ...(e.tipoEquipo === "Raspberry" ? [`DB_MEM_LIMIT=${e.recomendado.limiteContenedor}`] : [])].join("\n")}</pre>
          <span style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>
            {e.tipoEquipo === "Raspberry" ? "En la Raspberry basta con volver a ejecutar el instalador de la última versión: pone estos valores sola." : "Después: docker compose up -d db"}
          </span>
        </div>
      )}
      {reinicioPendiente && (
        <div style={{ fontSize: "0.85rem", color: "var(--warning)" }}>
          ⚠️ Falta reiniciar PostgreSQL para que la memoria compartida cambie.{e.plataforma === "darwin" ? " En el Mac: brew services restart postgresql@16 (o la versión que tengas)." : ""}
        </div>
      )}
    </div>
  );
}
