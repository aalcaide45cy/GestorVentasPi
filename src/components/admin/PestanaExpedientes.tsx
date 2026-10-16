"use client";

import { useToast } from "@/components/Toast";
import { TAMANOS_PAGINA } from "@/components/expedientes/BarraPaginacion";
import {
  CLAVE_FILTROS_PREDEFINIDOS,
  CLAVE_RECORDAR_FILTROS,
  TIPOS_FECHA_FILTRO,
  leerPredefinidos,
  type FiltrosPredefinidos,
} from "@/lib/filtros-expedientes";
import { usePreferencia } from "@/lib/preferencias";
import { estiloPanel } from "./utilidades";

const NOMBRES_FECHA: Record<(typeof TIPOS_FECHA_FILTRO)[number], string> = {
  fecha_expediente: "Fecha de expediente",
  fecha_comisionado: "Fecha de comisionado",
  fecha_afectacion: "Fecha de afectación",
  fecha_matriculacion: "Fecha de matriculación",
  fecha_entrega: "Fecha de entrega",
  fecha_rci: "Fecha RCI",
  fecha_cobrado: "Fecha de cobro",
};

/** Pestaña «Expedientes»: paginación por defecto de la lista (se guarda en el navegador). */
export default function PestanaExpedientes() {
  const { mostrar } = useToast();
  const [guardado, guardar] = usePreferencia("exp-default-page-size");
  const tamano = Number(guardado) > 0 ? Number(guardado) : 20;

  const elegir = (t: number) => {
    guardar(String(t));
    mostrar(`Paginación por defecto establecida en ${t} expedientes.`);
  };

  const [predefinidosGuardados, guardarPredefinidos] = usePreferencia(CLAVE_FILTROS_PREDEFINIDOS);
  const predefinidos = leerPredefinidos(predefinidosGuardados);
  const cambiarPredefinido = <K extends keyof FiltrosPredefinidos>(campo: K, valor: FiltrosPredefinidos[K]) => {
    guardarPredefinidos(JSON.stringify({ ...predefinidos, [campo]: valor }));
    mostrar("Filtros predefinidos actualizados.");
  };
  const [recordarGuardado, guardarRecordar] = usePreferencia(CLAVE_RECORDAR_FILTROS);
  const recordar = recordarGuardado === "true";

  const casilla = (etiqueta: string, ayuda: string, marcada: boolean, alCambiar: (v: boolean) => void) => (
    <label style={{ display: "flex", gap: "10px", alignItems: "flex-start", cursor: "pointer" }}>
      <input type="checkbox" checked={marcada} onChange={(e) => alCambiar(e.target.checked)} style={{ marginTop: "3px" }} />
      <span>
        <strong style={{ color: "var(--text-primary)" }}>{etiqueta}</strong>
        <br />
        <span style={{ color: "var(--text-secondary)", fontSize: "0.85rem" }}>{ayuda}</span>
      </span>
    </label>
  );

  return (
    <div className="glass-panel" style={{ ...estiloPanel, gap: "28px" }}>
      <div>
        <h3 style={{ fontSize: "1.15rem", marginBottom: "8px" }}>⚙️ Configuración de Expedientes</h3>
        <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem", margin: 0 }}>
          Personaliza el comportamiento por defecto de la lista de expedientes. Estos ajustes se guardan en tu navegador.
        </p>
      </div>

      <div className="glass-panel" style={{ padding: "24px", display: "flex", flexDirection: "column", gap: "20px", borderLeft: "3px solid var(--primary)" }}>
        <div>
          <h4 style={{ fontSize: "1rem", fontWeight: 700, margin: "0 0 6px 0", color: "var(--text-primary)" }}>📄 Número de expedientes por página (por defecto)</h4>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem", margin: 0, lineHeight: "1.5" }}>
            Define cuántos expedientes se mostrarán al cargar la lista. Puedes cambiarlo en cualquier momento desde la propia tabla.
          </p>
        </div>

        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
          {TAMANOS_PAGINA.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => elegir(t)}
              style={{
                padding: "12px 24px",
                fontSize: "1rem",
                fontWeight: tamano === t ? 800 : 500,
                border: `2px solid ${tamano === t ? "var(--primary)" : "var(--border-light)"}`,
                borderRadius: "var(--radius-md)",
                background: tamano === t ? "linear-gradient(135deg, rgba(var(--primary-rgb), 0.2), rgba(var(--secondary-rgb), 0.1))" : "rgba(255, 255, 255, 0.02)",
                color: tamano === t ? "var(--primary)" : "var(--text-secondary)",
                cursor: "pointer",
                transition: "all 0.2s ease",
                boxShadow: tamano === t ? "0 0 0 3px rgba(var(--primary-rgb), 0.15)" : "none",
                position: "relative",
              }}
            >
              {t}
              {tamano === t && (
                <span style={{ position: "absolute", top: "-8px", right: "-8px", background: "var(--primary)", color: "#fff", fontSize: "0.6rem", padding: "2px 5px", borderRadius: "999px", fontWeight: 700, letterSpacing: "0.04em" }}>
                  ✓ ACTIVO
                </span>
              )}
            </button>
          ))}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "12px 16px", background: "rgba(var(--primary-rgb), 0.05)", border: "1px solid rgba(var(--primary-rgb), 0.15)", borderRadius: "var(--radius-sm)", fontSize: "0.85rem", color: "var(--text-secondary)" }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <span>
            Actualmente configurado en <strong style={{ color: "var(--primary)" }}>{tamano}</strong> expedientes por página. Este valor se aplica al cargar la pestaña de expedientes por primera vez.
          </span>
        </div>
      </div>

      <div className="glass-panel" style={{ padding: "24px", display: "flex", flexDirection: "column", gap: "18px", borderLeft: "3px solid var(--primary)" }}>
        <div>
          <h4 style={{ fontSize: "1rem", fontWeight: 700, margin: "0 0 6px 0", color: "var(--text-primary)" }}>🔍 Filtros predefinidos de la lista</h4>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem", margin: 0, lineHeight: "1.5" }}>
            Filtros que se aplican al abrir la lista de expedientes. Puedes cambiarlos o limpiarlos después desde la propia lista.
          </p>
        </div>
        {casilla("Solo mis expedientes", "Filtra por el comercial que ha iniciado sesión.", predefinidos.soloMios, (v) => cambiarPredefinido("soloMios", v))}
        {casilla("Ocultar entregados", "No muestra los expedientes que ya tienen fecha de entrega.", predefinidos.ocultarEntregados, (v) => cambiarPredefinido("ocultarEntregados", v))}
        {casilla("Solo el mes actual", "Filtra por el mes y el año en curso, según el campo de fecha elegido.", predefinidos.mesActual, (v) => cambiarPredefinido("mesActual", v))}
        {casilla("Solo el año actual", "Filtra por el año en curso (no hace falta si ya has marcado el mes actual).", predefinidos.anioActual, (v) => cambiarPredefinido("anioActual", v))}
        <label style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
          <strong style={{ color: "var(--text-primary)" }}>Campo de fecha</strong>
          <select className="form-input" value={predefinidos.tipoFecha} onChange={(e) => cambiarPredefinido("tipoFecha", e.target.value)} style={{ padding: "8px", maxWidth: "260px" }}>
            {TIPOS_FECHA_FILTRO.map((t) => (
              <option key={t} value={t}>
                {NOMBRES_FECHA[t]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="glass-panel" style={{ padding: "24px", display: "flex", flexDirection: "column", gap: "14px", borderLeft: "3px solid var(--primary)" }}>
        <div>
          <h4 style={{ fontSize: "1rem", fontWeight: 700, margin: "0 0 6px 0", color: "var(--text-primary)" }}>💾 Recordar el filtro al refrescar</h4>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem", margin: 0, lineHeight: "1.5" }}>
            Si está activado, la lista conserva los filtros que tengas puestos aunque recargues la página. Si no, siempre arranca con los filtros predefinidos.
          </p>
        </div>
        {casilla("Recordar filtros entre recargas", recordar ? "Activado: se conserva el último filtro usado." : "Desactivado: se aplican los filtros predefinidos.", recordar, (v) => {
          guardarRecordar(v ? "true" : "false");
          mostrar(v ? "La lista recordará el filtro al refrescar." : "La lista volverá a los filtros predefinidos al refrescar.");
        })}
      </div>
    </div>
  );
}
