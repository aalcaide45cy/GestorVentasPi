"use client";

import { useToast } from "@/components/Toast";
import { TAMANOS_PAGINA } from "@/components/expedientes/BarraPaginacion";
import {
  CLAVE_FILTROS_PREDEFINIDOS,
  CLAVE_RECORDAR_FILTROS,
  leerPredefinidos,
} from "@/lib/filtros-expedientes";
import { CLAVE_RETRASO_FOTO, RETRASO_FOTO_POR_DEFECTO, usePreferencia } from "@/lib/preferencias";
import { CLAVE_BORRADO_MINUTOS, CLAVE_SELECCION_MINUTOS, leerMinutos } from "@/lib/modo-temporal";
import GestorReglasColor, { type SugerenciasReglas } from "./GestorReglasColor";
import { SubPestanas } from "./estructura";
import { estiloPanel } from "./utilidades";

const OPCIONES_INICIO = [
  { texto: "Solo mis expedientes", soloMios: true, mesActual: false },
  { texto: "Solo los míos de este mes", soloMios: true, mesActual: true },
  { texto: "Todos los expedientes", soloMios: false, mesActual: false },
];

const estiloOpcion = (activa: boolean) =>
  ({
    padding: "12px 20px",
    fontSize: "0.95rem",
    fontWeight: activa ? 800 : 500,
    border: `2px solid ${activa ? "var(--primary)" : "var(--border-light)"}`,
    borderRadius: "var(--radius-md)",
    background: activa ? "rgba(var(--primary-rgb), 0.15)" : "rgba(255, 255, 255, 0.02)",
    color: activa ? "var(--primary)" : "var(--text-secondary)",
    cursor: "pointer",
  }) as const;

const OPCIONES_TIEMPO = [
  { minutos: 0, texto: "Sin límite" },
  { minutos: 1, texto: "1 minuto" },
  { minutos: 5, texto: "5 minutos" },
  { minutos: 10, texto: "10 minutos" },
  { minutos: 30, texto: "30 minutos" },
  { minutos: 60, texto: "1 hora" },
];

/** Tiempo tras el cual un modo de la lista de expedientes (selección o eliminación) se desactiva solo. */
function TiempoModo({ titulo, ayuda, clave }: { titulo: string; ayuda: string; clave: string }) {
  const { mostrar } = useToast();
  const [guardado, guardar] = usePreferencia(clave);
  const minutos = leerMinutos(guardado);
  const elegir = (m: number) => {
    guardar(String(m));
    mostrar("Guardado.");
  };
  return (
    <div className="glass-panel" style={{ padding: "24px", display: "flex", flexDirection: "column", gap: "14px", borderLeft: "3px solid var(--primary)" }}>
      <div>
        <h4 style={{ fontSize: "1rem", fontWeight: 700, margin: "0 0 6px 0", color: "var(--text-primary)" }}>{titulo}</h4>
        <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem", margin: 0, lineHeight: "1.5" }}>{ayuda}</p>
      </div>
      <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
        {OPCIONES_TIEMPO.map((o) => (
          <button key={o.minutos} type="button" style={estiloOpcion(minutos === o.minutos)} onClick={() => elegir(o.minutos)}>
            {o.texto}
          </button>
        ))}
        <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.9rem" }}>
          Otro (minutos):
          <input type="number" className="form-input" min={0} max={1440} step={1} style={{ width: "90px" }} value={minutos} onChange={(e) => elegir(Math.max(0, Math.min(1440, Math.round(Number(e.target.value) || 0))))} />
        </label>
      </div>
    </div>
  );
}

/** Pestaña «Expedientes»: paginación por defecto de la lista (se guarda en el navegador). */
export default function PestanaExpedientes({ sugerencias }: { sugerencias: SugerenciasReglas }) {
  const { mostrar } = useToast();
  const [retrasoFoto, guardarRetrasoFoto] = usePreferencia(CLAVE_RETRASO_FOTO);
  const segundosFoto = retrasoFoto !== null && Number(retrasoFoto) >= 0 ? Number(retrasoFoto) : RETRASO_FOTO_POR_DEFECTO;
  const [guardado, guardar] = usePreferencia("exp-default-page-size");
  const tamano = Number(guardado) > 0 ? Number(guardado) : 20;

  const elegir = (t: number) => {
    guardar(String(t));
    mostrar(`Paginación por defecto establecida en ${t} expedientes.`);
  };

  const [predefinidosGuardados, guardarPredefinidos] = usePreferencia(CLAVE_FILTROS_PREDEFINIDOS);
  const predefinidos = leerPredefinidos(predefinidosGuardados);
  const elegirInicio = (o: { soloMios: boolean; mesActual: boolean }) => {
    guardarPredefinidos(JSON.stringify({ ...predefinidos, soloMios: o.soloMios, mesActual: o.mesActual }));
    mostrar("Guardado.");
  };
  const [recordarGuardado, guardarRecordar] = usePreferencia(CLAVE_RECORDAR_FILTROS);
  const recordar = recordarGuardado !== "false";
  const elegirRecordar = (v: boolean) => {
    guardarRecordar(v ? "true" : "false");
    mostrar("Guardado.");
  };

  return (
    <div className="glass-panel" style={{ ...estiloPanel, gap: "20px" }}>
      <div>
        <h3 style={{ fontSize: "1.15rem", marginBottom: "8px" }}>⚙️ Configuración de Expedientes</h3>
        <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem", margin: 0 }}>
          Personaliza el comportamiento por defecto de la lista de expedientes. Estos ajustes se guardan en tu navegador.
        </p>
      </div>

      <SubPestanas
        id="config-expedientes"
        guiaBase="config.expedientes"
        pestanas={[
          { clave: "lista", etiqueta: "📄 Lista", ayuda: "Cuántos expedientes se ven por página, qué se ve al abrir la lista y si se recuerda el filtro" },
          { clave: "reglas", etiqueta: "🎨 Colores de fila", ayuda: "Reglas para pintar de un color las filas de la lista de expedientes según su estado, sus fechas, su marca…, con esquemas guardados y exportación" },
          { clave: "modos", etiqueta: "🔓 Selección y eliminación", ayuda: "Cuánto tiempo se quedan activos los modos de selección y de eliminación de la lista" },
          { clave: "foto", etiqueta: "🖼️ Foto del cliente", ayuda: "Cuántos segundos hay que esperar con el ratón encima del cliente para ver su foto" },
        ]}
      >
        {(pestana) => (
          <>
            {pestana === "reglas" && <GestorReglasColor sugerencias={sugerencias} />}
            {pestana === "lista" && (
              <>
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

      <div className="glass-panel" style={{ padding: "24px", display: "flex", flexDirection: "column", gap: "16px", borderLeft: "3px solid var(--primary)" }}>
        <div>
          <h4 style={{ fontSize: "1rem", fontWeight: 700, margin: "0 0 6px 0", color: "var(--text-primary)" }}>🔍 ¿Qué quieres ver al abrir Expedientes?</h4>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem", margin: 0, lineHeight: "1.5" }}>Pulsa una opción. Se guarda sola.</p>
        </div>
        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
          {OPCIONES_INICIO.map((o) => {
            const activa = o.soloMios === predefinidos.soloMios && o.mesActual === predefinidos.mesActual;
            return (
              <button key={o.texto} type="button" onClick={() => elegirInicio(o)} style={estiloOpcion(activa)}>
                {o.texto}
              </button>
            );
          })}
        </div>
      </div>

      <div className="glass-panel" style={{ padding: "24px", display: "flex", flexDirection: "column", gap: "16px", borderLeft: "3px solid var(--primary)" }}>
        <div>
          <h4 style={{ fontSize: "1rem", fontWeight: 700, margin: "0 0 6px 0", color: "var(--text-primary)" }}>💾 Si refresco la página, ¿se queda el filtro que puse?</h4>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem", margin: 0, lineHeight: "1.5" }}>Pulsa una opción. Se guarda sola.</p>
        </div>
        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
          <button type="button" style={estiloOpcion(recordar)} onClick={() => elegirRecordar(true)}>
            Sí, que se quede
          </button>
          <button type="button" style={estiloOpcion(!recordar)} onClick={() => elegirRecordar(false)}>
            No, que vuelva al inicio
          </button>
        </div>
      </div>
              </>
            )}
            {pestana === "modos" && (
              <>
      <TiempoModo
        titulo="🔓 Selección masiva: tiempo activa"
        ayuda="Al activar «Selección» en la lista de expedientes se queda activada (aunque recargues la página) hasta que la desactives. Aquí eliges si además se desactiva sola pasado un tiempo desde que la activaste; en el botón verás la cuenta atrás. Se guarda en este navegador."
        clave={CLAVE_SELECCION_MINUTOS}
      />
      <TiempoModo
        titulo="🗑️ Eliminación: tiempo activa"
        ayuda="Igual que la selección, pero para «Eliminación»: se queda activada hasta que la desactives o hasta que pase este tiempo desde que la activaste, con su propia cuenta atrás. Se guarda en este navegador."
        clave={CLAVE_BORRADO_MINUTOS}
      />
              </>
            )}
            {pestana === "foto" && (
              <>
      <div className="glass-panel" style={{ padding: "24px", display: "flex", flexDirection: "column", gap: "12px", borderLeft: "3px solid var(--primary)" }}>
        <div>
          <h4 style={{ fontSize: "1rem", fontWeight: 700, margin: "0 0 6px 0", color: "var(--text-primary)" }}>🖼️ Foto del cliente al pasar el ratón</h4>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem", margin: 0, lineHeight: "1.5" }}>Si dejas el ratón encima del nombre de un cliente (lista de clientes o expedientes) aparece una ventanita con su foto, tomada del DNI. Aquí eliges cuántos segundos hay que esperar (0 = al instante). Se guarda en este navegador.</p>
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "0.9rem" }}>
          Segundos de espera:
          <input type="number" className="form-input" min={0} max={30} step={0.5} style={{ width: "90px" }} value={segundosFoto} onChange={(e) => guardarRetrasoFoto(String(Math.max(0, Math.min(30, Number(e.target.value) || 0))))} />
        </label>
      </div>
              </>
            )}
          </>
        )}
      </SubPestanas>
    </div>
  );
}
