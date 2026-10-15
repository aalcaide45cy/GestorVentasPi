"use client";

import { useMemo, useState } from "react";
import type { ExpedienteDto } from "@/lib/dto";

const MESES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

export { MESES };

interface Props {
  expedientes: ExpedienteDto[];
  anios: number[];
}

const enMes = (fecha: string | null, anio: number, mes: number) => {
  if (!fecha) return false;
  const [a, m] = fecha.split("-");
  return Number(a) === anio && Number(m) === mes;
};

const estiloTarjeta = { padding: "16px", display: "flex", flexDirection: "column", justifyContent: "space-between" } as const;
const estiloEtiqueta = { fontSize: "0.8rem", color: "var(--text-secondary)", fontWeight: 600 } as const;
const estiloPie = { display: "flex", justifyContent: "space-between", fontSize: "0.75rem", color: "var(--text-secondary)" } as const;

/**
 * «Detalle y Resumen Estadístico»: recuentos del mes elegido.
 * Los tramos y el importe de comisión se añaden en F4 (dependen del motor de comisiones).
 */
export default function ResumenMensual({ expedientes, anios }: Props) {
  const hoy = new Date();
  const [anio, setAnio] = useState(hoy.getFullYear());
  const [mes, setMes] = useState(hoy.getMonth() + 1);

  const mover = (delta: number) => {
    let m = mes + delta;
    let a = anio;
    if (m < 1) {
      m = 12;
      a -= 1;
    } else if (m > 12) {
      m = 1;
      a += 1;
    }
    setMes(m);
    setAnio(a);
  };

  const r = useMemo(() => {
    const total = { afectados: 0, matriculados: 0, mContado: 0, mCredito: 0, mPref: 0, vn: 0, vnFinanciados: 0, pedidos: 0, pContado: 0, pCredito: 0, pPref: 0 };
    for (const e of expedientes) {
      const categoria = e.tipoDeVenta?.categoria ?? "";
      const esContado = categoria === "CONTADO";
      const esPref = categoria === "PREFERENCE";
      const esCredito = categoria === "CREDITO" || categoria === "RENTING";
      const estado = e.estadoVehiculo?.nombre_estado_vehiculo?.toLowerCase() ?? "";
      const esVn = estado === "nuevo" || estado === "demo";
      const fechaMat = e.cobrado_otra_fecha && e.fecha_cobrado ? e.fecha_cobrado : e.fecha_matriculacion;

      if (enMes(fechaMat, anio, mes)) {
        total.matriculados++;
        if (esContado) total.mContado++;
        else if (esCredito) total.mCredito++;
        else if (esPref) total.mPref++;
        if (esVn) total.vn++;
      }
      if (esVn && (esCredito || esPref) && enMes(e.fecha_rci, anio, mes)) total.vnFinanciados++;
      if (enMes(e.fecha_afectacion, anio, mes)) total.afectados++;
      if (enMes(e.fecha_expediente, anio, mes)) {
        total.pedidos++;
        if (esContado) total.pContado++;
        else if (esCredito) total.pCredito++;
        else if (esPref) total.pPref++;
      }
    }
    return total;
  }, [expedientes, anio, mes]);

  const listaAnios = anios.includes(anio) ? anios : [anio, ...anios].sort((a, b) => b - a);
  const botonMes = { padding: "6px 12px", fontSize: "0.8rem", whiteSpace: "nowrap" } as const;

  return (
    <div className="glass-panel" style={{ padding: "24px", display: "flex", flexDirection: "column", gap: "20px", marginTop: "10px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "15px" }}>
        <div>
          <h4 style={{ fontSize: "1.1rem", fontWeight: "bold", margin: 0 }}>📊 Detalle y Resumen Estadístico</h4>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem", margin: "4px 0 0 0" }}>Estadísticas de ventas para el período seleccionado.</p>
        </div>
        <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
          <button type="button" className="btn btn-secondary" onClick={() => mover(-1)} style={botonMes}>
            ⬅ Mes Anterior
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => {
              setMes(hoy.getMonth() + 1);
              setAnio(hoy.getFullYear());
            }}
            style={botonMes}
          >
            Mes Actual
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => mover(1)} style={botonMes}>
            Mes Siguiente ➡
          </button>
          <select className="form-select" value={mes} onChange={(e) => setMes(Number(e.target.value))} style={{ padding: "6px 12px", fontSize: "0.85rem", minWidth: "120px" }}>
            {MESES.map((nombre, i) => (
              <option key={nombre} value={i + 1}>
                {nombre}
              </option>
            ))}
          </select>
          <select className="form-select" value={anio} onChange={(e) => setAnio(Number(e.target.value))} style={{ padding: "6px 12px", fontSize: "0.85rem", minWidth: "90px" }}>
            {listaAnios.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "15px" }}>
        <div className="glass-panel-interactive" style={estiloTarjeta}>
          <span style={estiloEtiqueta}>AFECTADOS EN EL MES</span>
          <h3 style={{ fontSize: "1.85rem", margin: "8px 0", color: "var(--primary)", fontWeight: "bold" }}>{r.afectados}</h3>
          <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>Total de afectaciones en el mes</span>
        </div>
        <div className="glass-panel-interactive" style={estiloTarjeta}>
          <span style={estiloEtiqueta}>MATRICULADOS EN EL MES</span>
          <h3 style={{ fontSize: "1.85rem", margin: "8px 0", color: "var(--success)", fontWeight: "bold" }}>{r.matriculados}</h3>
          <div style={estiloPie}>
            <span>Cont/Créd/Pref:</span>
            <strong>
              {r.mContado}/{r.mCredito}/{r.mPref}
            </strong>
          </div>
        </div>
        <div className="glass-panel-interactive" style={estiloTarjeta}>
          <span style={estiloEtiqueta}>TASA INT. FINANCIERA</span>
          <h3 style={{ fontSize: "1.85rem", margin: "8px 0", color: "var(--secondary)", fontWeight: "bold" }}>
            {r.vn > 0 ? `${((r.vnFinanciados / r.vn) * 100).toFixed(1)}%` : "0.0%"}
          </h3>
          <div style={estiloPie}>
            <span>VN Finan/Total:</span>
            <strong>
              {r.vnFinanciados}/{r.vn}
            </strong>
          </div>
        </div>
        <div className="glass-panel-interactive" style={estiloTarjeta}>
          <span style={estiloEtiqueta}>PEDIDOS EN EL MES</span>
          <h3 style={{ fontSize: "1.85rem", margin: "8px 0", color: "var(--warning)", fontWeight: "bold" }}>{r.pedidos}</h3>
          <div style={estiloPie}>
            <span>Cont/Créd/Pref:</span>
            <strong>
              {r.pContado}/{r.pCredito}/{r.pPref}
            </strong>
          </div>
        </div>
      </div>
    </div>
  );
}
