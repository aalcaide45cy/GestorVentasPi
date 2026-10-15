"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/Toast";
import { llamar, textoError } from "@/components/comisiones/api";
import type { CopiaV1, InformeMigracion, ResultadoMigracion } from "@/lib/servicios/migracion-v1";

/** «Convertir copia de la aplicación antigua» (12.13): análisis y clasificación previos, y conversión repetible. */
export default function PanelMigracion() {
  const router = useRouter();
  const { mostrar } = useToast();
  const [copia, setCopia] = useState<CopiaV1 | null>(null);
  const [nombre, setNombre] = useState("");
  const [informe, setInforme] = useState<InformeMigracion | null>(null);
  const [resultado, setResultado] = useState<ResultadoMigracion | null>(null);
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
      const { data } = await llamar<ResultadoMigracion>("/api/admin/migracion", { method: "POST", cuerpo: { accion: "convertir", copia, confirmacion } });
      setResultado(data);
      setConfirmacion("");
      mostrar("Conversión terminada.");
      router.refresh();
    } catch (e) {
      mostrar(textoError(e), "error");
    } finally {
      setTrabajando(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
      <h3 style={{ fontSize: "1.15rem" }}>🔄 Convertir copia de la aplicación antigua</h3>
      <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem", margin: 0, lineHeight: 1.5 }}>
        Sube la copia JSON (formato 1.0) de la aplicación antigua. Se muestra primero un análisis; al convertir se <b>sustituyen</b> los catálogos, clientes, expedientes y comisiones actuales (las cuentas de acceso se conservan). Es repetible: ejecutarla dos veces no duplica nada. Haz antes una copia de seguridad completa.
      </p>
      <label className="btn btn-secondary" style={{ alignSelf: "flex-start", cursor: "pointer" }}>
        {trabajando && !informe ? "Analizando…" : "Elegir copia .json…"}
        <input type="file" accept=".json,application/json" style={{ display: "none" }} onChange={(e) => void leer(e.target.files?.[0] ?? null)} />
      </label>

      {informe && (
        <div className="glass-panel" style={{ padding: "18px", display: "flex", flexDirection: "column", gap: "12px" }}>
          <strong>Análisis de {nombre}</strong>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "8px", fontSize: "0.9rem" }}>
            {informe.tablas.map((t) => (
              <span key={t.nombre}>
                {t.nombre}: <b>{t.filas}</b>
              </span>
            ))}
          </div>
          <div style={{ fontSize: "0.9rem" }}>
            <b>Estados del vehículo:</b> {informe.estados.map((e) => `${e.nombre} → ${e.clase}${e.subtipo ? ` (${e.subtipo})` : ""}`).join(" · ")}
          </div>
          <div style={{ fontSize: "0.9rem" }}>
            <b>Formas de pago:</b> {informe.tiposVenta.map((t) => `${t.nombre} → ${t.categoria}`).join(" · ")}
          </div>
          <div style={{ fontSize: "0.9rem" }}>
            <b>Usuarios:</b> {informe.usuarios.map((u) => `${u.nombre ?? "(sin nombre)"} → ${u.destino}`).join(" · ")}
          </div>
          {informe.avisos.length > 0 && (
            <ul style={{ margin: 0, paddingLeft: "20px", color: "var(--warning)", fontSize: "0.9rem" }}>
              {informe.avisos.map((a, i) => (
                <li key={i}>⚠️ {a}</li>
              ))}
            </ul>
          )}
          <div style={{ display: "flex", gap: "10px", alignItems: "end", flexWrap: "wrap" }}>
            <div>
              <label className="form-label">Escribe CONVERTIR para confirmar</label>
              <input className="form-input" value={confirmacion} onChange={(e) => setConfirmacion(e.target.value)} />
            </div>
            <button type="button" className="btn btn-primary" disabled={trabajando || confirmacion !== "CONVERTIR"} onClick={() => void convertir()}>
              {trabajando ? "Convirtiendo…" : "Convertir"}
            </button>
          </div>
        </div>
      )}

      {resultado && (
        <div style={{ padding: "14px 18px", borderLeft: "4px solid var(--success)", background: "var(--bg-card)", borderRadius: "var(--radius-sm)", fontSize: "0.9rem" }}>
          ✅ Convertidos {resultado.expedientes} expedientes, {resultado.clientes} clientes, {resultado.planes} planes, {resultado.promociones} promociones y {resultado.liquidaciones} liquidaciones (cerradas, solo lectura). Cuentas creadas sin acceso: {resultado.usuariosCreados}. Abre Comisiones → plan → Liquidación → «Comparar con liquidación antigua».
        </div>
      )}
    </div>
  );
}
