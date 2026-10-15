"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/Toast";
import { llamar, textoError } from "@/components/comisiones/api";
import { SECCIONES_AL_ANADIR, SECCIONES_INFO, SECCIONES_V1, type SeccionV1 } from "@/lib/migracion-secciones";
import type { CopiaV1, InformeMigracion, ResultadoMigracion } from "@/lib/servicios/migracion-v1";

/** Marca una parte junto con las que necesita, o la desmarca junto con las que dependen de ella. */
function alternarSeccion(actual: SeccionV1[], clave: SeccionV1, activar: boolean): SeccionV1[] {
  const sel = new Set(actual);
  if (activar) {
    const anadir = (c: SeccionV1) => {
      sel.add(c);
      for (const r of SECCIONES_INFO.find((s) => s.clave === c)?.requiere ?? []) anadir(r);
    };
    anadir(clave);
  } else {
    const quitar = (c: SeccionV1) => {
      sel.delete(c);
      for (const s of SECCIONES_INFO) if (s.requiere.includes(c)) quitar(s.clave);
    };
    quitar(clave);
  }
  return SECCIONES_V1.filter((s) => sel.has(s));
}

/** «Convertir copia de la aplicación antigua» (12.13): análisis previo, elección de lo que se importa y conversión repetible. */
export default function PanelMigracion({ alTerminar }: { alTerminar?: () => void }) {
  const router = useRouter();
  const { mostrar } = useToast();
  const [copia, setCopia] = useState<CopiaV1 | null>(null);
  const [nombre, setNombre] = useState("");
  const [informe, setInforme] = useState<InformeMigracion | null>(null);
  const [resultado, setResultado] = useState<ResultadoMigracion | null>(null);
  const [secciones, setSecciones] = useState<SeccionV1[]>([...SECCIONES_AL_ANADIR]);
  const [modo, setModo] = useState<"anadir" | "sustituir">("anadir");
  const [copiaPrevia, setCopiaPrevia] = useState<string | null>(null);
  const [confirmacion, setConfirmacion] = useState("");
  const [trabajando, setTrabajando] = useState(false);

  const leer = async (f: File | null) => {
    if (!f) return;
    setResultado(null);
    setInforme(null);
    setTrabajando(true);
    try {
      const json = JSON.parse(await f.text()) as CopiaV1;
      setCopia(json);
      setNombre(f.name);
      setSecciones(modo === "anadir" ? [...SECCIONES_AL_ANADIR] : [...SECCIONES_V1]);
      const { data } = await llamar<InformeMigracion>("/api/admin/migracion", { method: "POST", cuerpo: { accion: "analizar", copia: json } });
      setInforme(data);
    } catch (e) {
      setCopia(null);
      mostrar(e instanceof SyntaxError ? "El fichero no es un JSON válido." : textoError(e), "error");
    } finally {
      setTrabajando(false);
    }
  };

  const convertir = async () => {
    if (!copia) return;
    setTrabajando(true);
    try {
      const { data } = await llamar<ResultadoMigracion>("/api/admin/migracion", { method: "POST", cuerpo: { accion: "convertir", copia, confirmacion, secciones, modo } });
      setResultado(data);
      setCopiaPrevia((data as ResultadoMigracion & { copiaPrevia?: string }).copiaPrevia ?? null);
      alTerminar?.();
      setConfirmacion("");
      mostrar("Conversión terminada.");
      router.refresh();
    } catch (e) {
      mostrar(textoError(e), "error");
    } finally {
      setTrabajando(false);
    }
  };

  const filasDe = (tablas: string[]): number => (informe ? informe.tablas.filter((t) => tablas.includes(t.nombre)).reduce((suma, t) => suma + t.filas, 0) : 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
      <h3 style={{ fontSize: "1.15rem" }}>🔄 Convertir copia de la aplicación antigua</h3>
      <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem", margin: 0, lineHeight: 1.5 }}>
        Sube la copia JSON (formato 1.0) de la aplicación antigua. Primero se muestra lo que contiene y eliges qué hacer con ella y qué partes importar. Antes de tocar nada se guarda <b>automáticamente una copia de seguridad</b> completa. Es repetible: ejecutarla dos veces no duplica nada.
      </p>
      <label className="btn btn-secondary" style={{ alignSelf: "flex-start", cursor: "pointer" }} title="Elige el archivo .json de copia de la aplicación antigua; no se importa nada hasta que confirmes">
        {trabajando && !informe ? "Analizando…" : "Elegir copia .json…"}
        <input type="file" accept=".json,application/json" style={{ display: "none" }} onChange={(e) => void leer(e.target.files?.[0] ?? null)} />
      </label>

      {informe && (
        <div className="glass-panel" style={{ padding: "18px", display: "flex", flexDirection: "column", gap: "16px" }}>
          <strong>Copia «{nombre}»: elige qué importar</strong>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "12px" }}>
            {([
              ["anadir", "➕ Añadir a lo que ya tengo (recomendado)", "Conserva todo lo actual. Se reutilizan las tiendas, marcas, modelos, pagos y estados con el mismo nombre, los clientes con el mismo DNI o nombre, y se omiten los expedientes cuya matrícula ya existe. Solo catálogos, clientes y expedientes."],
              ["sustituir", "♻️ Sustituir todo", "Borra los clientes, expedientes, catálogos y comisiones actuales y carga la copia. Lo que no marques queda vacío. Las cuentas de acceso se conservan. Permite importar también planes de comisiones, liquidaciones antiguas e historial."],
            ] as const).map(([clave, titulo, ayuda]) => (
              <label key={clave} title={ayuda} style={{ display: "flex", gap: "12px", alignItems: "flex-start", padding: "14px", borderRadius: "var(--radius-sm)", cursor: "pointer", border: `1px solid ${modo === clave ? "var(--primary)" : "var(--border-light)"}`, background: modo === clave ? "var(--bg-surface-hover)" : "var(--bg-surface-tint)" }}>
                <input
                  type="radio"
                  name="modo-importacion"
                  checked={modo === clave}
                  onChange={() => {
                    setModo(clave);
                    setSecciones(clave === "anadir" ? [...SECCIONES_AL_ANADIR] : [...SECCIONES_V1]);
                  }}
                  style={{ width: "18px", height: "18px", marginTop: "2px", accentColor: "var(--primary)" }}
                />
                <span style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                  <span style={{ fontWeight: 700 }}>{titulo}</span>
                  <span style={{ fontSize: "0.82rem", color: "var(--text-secondary)", lineHeight: 1.4 }}>{ayuda}</span>
                </span>
              </label>
            ))}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "12px" }}>
            {SECCIONES_INFO.map((s) => {
              const marcada = secciones.includes(s.clave);
              const noDisponible = modo === "anadir" && !SECCIONES_AL_ANADIR.includes(s.clave);
              const filas = filasDe(s.tablas);
              return (
                <label
                  key={s.clave}
                  title={noDisponible ? "Solo se puede importar sustituyendo los datos actuales" : s.ayuda}
                  style={{ opacity: noDisponible ? 0.45 : 1, display: "flex", gap: "12px", alignItems: "flex-start", padding: "14px", borderRadius: "var(--radius-sm)", cursor: noDisponible ? "not-allowed" : "pointer", border: `1px solid ${marcada ? "var(--primary)" : "var(--border-light)"}`, background: marcada ? "var(--bg-surface-hover)" : "var(--bg-surface-tint)" }}
                >
                  <input type="checkbox" checked={marcada} disabled={noDisponible} onChange={(e) => setSecciones((a) => alternarSeccion(a, s.clave, e.target.checked))} style={{ width: "18px", height: "18px", marginTop: "2px", accentColor: "var(--primary)" }} />
                  <span style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                    <span style={{ fontWeight: 700 }}>
                      {s.titulo} <span style={{ color: "var(--text-muted)", fontWeight: 500 }}>· {filas.toLocaleString("es-ES")} registros</span>
                    </span>
                    <span style={{ fontSize: "0.82rem", color: "var(--text-secondary)", lineHeight: 1.4 }}>{s.ayuda}</span>
                  </span>
                </label>
              );
            })}
          </div>
          <div style={{ fontSize: "0.82rem", color: "var(--text-muted)" }}>
            Al marcar una parte se marcan también las que necesita (por ejemplo, los expedientes necesitan los catálogos), y al desmarcar una se desmarcan las que dependen de ella.{modo === "sustituir" ? " Lo que no marques quedará vacío." : ""}
          </div>

          <details>
            <summary style={{ cursor: "pointer", fontWeight: 600, fontSize: "0.9rem" }} title="Número de filas de cada tabla de la copia antigua">
              Ver el detalle de tablas de la copia
            </summary>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: "4px 24px", fontSize: "0.85rem", marginTop: "10px" }}>
              {informe.tablas.map((t) => (
                <span key={t.nombre} style={{ display: "flex", justifyContent: "space-between", gap: "12px", borderBottom: "1px dashed var(--border-light)", padding: "2px 0" }}>
                  <span style={{ color: "var(--text-secondary)" }}>{t.nombre}</span>
                  <b>{t.filas}</b>
                </span>
              ))}
            </div>
          </details>

          <details>
            <summary style={{ cursor: "pointer", fontWeight: 600, fontSize: "0.9rem" }} title="Cómo se interpretan los estados, formas de pago y usuarios de la copia antigua">
              Ver cómo se traducen estados, pagos y usuarios
            </summary>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px", fontSize: "0.88rem", marginTop: "10px" }}>
              <div>
                <b>Estados del vehículo:</b> {informe.estados.map((e) => `${e.nombre} → ${e.clase}${e.subtipo ? ` (${e.subtipo})` : ""}`).join(" · ") || "—"}
              </div>
              <div>
                <b>Formas de pago:</b> {informe.tiposVenta.map((t) => `${t.nombre} → ${t.categoria}`).join(" · ") || "—"}
              </div>
              <div>
                <b>Usuarios:</b> {informe.usuarios.map((u) => `${u.nombre ?? "(sin nombre)"} → ${u.destino}`).join(" · ") || "—"}
              </div>
            </div>
          </details>

          {informe.avisos.length > 0 && (
            <ul style={{ margin: 0, paddingLeft: "20px", color: "var(--warning)", fontSize: "0.88rem" }}>
              {informe.avisos.map((a, i) => (
                <li key={i}>⚠️ {a}</li>
              ))}
            </ul>
          )}

          <div style={{ display: "flex", gap: "10px", alignItems: "end", flexWrap: "wrap" }}>
            <div>
              <label className="form-label">Escribe CONVERTIR para confirmar{modo === "sustituir" ? " (borra los datos actuales)" : ""}</label>
              <input className="form-input" value={confirmacion} onChange={(e) => setConfirmacion(e.target.value)} title="Medida de seguridad: la conversión sustituye los datos actuales" />
            </div>
            <button type="button" className="btn btn-primary" disabled={trabajando || confirmacion !== "CONVERTIR" || secciones.length === 0} onClick={() => void convertir()} title={modo === "anadir" ? "Añade lo nuevo sin borrar nada" : "Sustituye los datos actuales por las partes marcadas"}>
              {trabajando ? "Convirtiendo…" : `Convertir ${secciones.length} de ${SECCIONES_V1.length} partes`}
            </button>
          </div>
        </div>
      )}

      {resultado && (
        <div style={{ padding: "14px 18px", borderLeft: "4px solid var(--success)", background: "var(--bg-card)", borderRadius: "var(--radius-sm)", fontSize: "0.9rem" }}>
          ✅ {modo === "anadir" ? `Añadidos ${resultado.expedientes} expedientes y ${resultado.clientes} clientes nuevos (${resultado.clientesReutilizados ?? 0} clientes ya existían y se reutilizaron; ${resultado.expedientesOmitidos ?? 0} expedientes omitidos por estar ya).` : `Convertidos ${resultado.expedientes} expedientes, ${resultado.clientes} clientes, ${resultado.planes} planes, ${resultado.promociones} promociones y ${resultado.liquidaciones} liquidaciones (cerradas, solo lectura).`} Cuentas creadas sin acceso: {resultado.usuariosCreados}.{copiaPrevia ? ` Copia previa guardada como ${copiaPrevia} (la ves en «Copias de seguridad»).` : ""} {modo === "sustituir" ? "Si importaste las liquidaciones: Comisiones → plan → Liquidación → «Comparar con liquidación antigua»." : ""}
        </div>
      )}
    </div>
  );
}
