"use client";

import { useMemo, useState } from "react";
import ResumenMensual from "@/components/expedientes/ResumenMensual";
import type { ExpedienteDto } from "@/lib/dto";
import { usePreferencia } from "@/lib/preferencias";

interface Props {
  expedientes: ExpedienteDto[];
  /** Nombres de los vendedores (solo los usa el administrador para cambiar de vendedor). */
  vendedores: string[];
  nombreActual: string;
  esAdministrador: boolean;
}

/** Mes elegido en el resumen («AAAA-MM»): el mismo que usa «Control de expedientes», para que ambas pantallas vayan a la par. */
function mesActual(guardado: string | null): string {
  const p = (guardado ?? "").split("-");
  const a = Number(p[0]);
  const m = Number(p[1]);
  if (p.length === 2 && a > 1900 && a < 3000 && m >= 1 && m <= 12) return `${a}-${String(m).padStart(2, "0")}`;
  const hoy = new Date();
  return `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}`;
}

const fecha = (v: string | null) => (v ? v.split("-").reverse().join("/") : "—");

/**
 * «Mi mes»: el resumen del mes (créditos, contados, preference, VN, VO, tramo, objetivo y puntos) con sus flechas, y debajo la lista
 * de coches que cuentan en ese mes, para cotejarla a mano con la hoja de la empresa. Los usados sin matrícula se marcan.
 */
export default function MiMes({ expedientes, vendedores, nombreActual, esAdministrador }: Props) {
  const [vendedor, setVendedor] = useState(nombreActual);
  const [guardado] = usePreferencia("exp-resumen-mes");
  const mes = mesActual(guardado);

  const anios = useMemo(() => {
    const a = new Set<number>([new Date().getFullYear()]);
    for (const e of expedientes) for (const f of [e.fecha_matriculacion, e.fecha_facturacion, e.fecha_expediente]) if (f) a.add(Number(f.slice(0, 4)));
    return [...a].sort((x, y) => y - x);
  }, [expedientes]);

  const filas = useMemo(
    () =>
      expedientes
        .filter((e) => (e.usuario?.nombre ?? "") === vendedor && (e.fecha_facturacion ?? e.fecha_matriculacion ?? "").slice(0, 7) === mes)
        .sort((a, b) => (a.fecha_facturacion ?? a.fecha_matriculacion ?? "").localeCompare(b.fecha_facturacion ?? b.fecha_matriculacion ?? "")),
    [expedientes, vendedor, mes],
  );
  const usadosSinMatricula = filas.filter((e) => e.estadoVehiculo?.clase === "VO" && !(e.matricula ?? "").trim()).length;

  return (
    <section style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap", alignItems: "center" }}>
        <div>
          <h2 style={{ fontSize: "1.15rem", margin: 0 }}>📅 Mi mes: resumen y listado para cotejar</h2>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem", margin: "2px 0 0 0" }}>
            Usa las flechas del resumen para cambiar de mes. Debajo tienes los coches de ese mes (por fecha de facturación) para ir cotejándolos con la hoja de la empresa, aunque no la subas.
          </p>
        </div>
        {esAdministrador && (
          <label style={{ display: "flex", gap: "8px", alignItems: "center", fontSize: "0.85rem" }}>
            Vendedor
            <select className="form-input" value={vendedor} onChange={(e) => setVendedor(e.target.value)}>
              {[...new Set(vendedores)].map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      <ResumenMensual expedientes={expedientes} anios={anios} vendedor={vendedor} esAdministrador={esAdministrador} sinCartera />

      <div className="glass-panel" style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: "8px" }}>
        <h4 style={{ margin: 0 }}>🚗 Coches del mes ({filas.length})</h4>
        {usadosSinMatricula > 0 && (
          <div role="status" style={{ color: "var(--warning)", fontSize: "0.85rem" }}>
            ⚠️ {usadosSinMatricula} usado(s) sin matrícula: no es obligatoria, pero la necesitas para cruzarlos con la hoja de la empresa.
          </div>
        )}
        <div className="table-container">
          <table className="table-premium table-compact">
            <thead>
              <tr>
                <th>Matrícula</th>
                <th>Cliente</th>
                <th>Modelo</th>
                <th>Tipo de pago</th>
                <th>Estado</th>
                <th>F. facturación</th>
                <th>Comisión pagada</th>
              </tr>
            </thead>
            <tbody>
              {filas.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ textAlign: "center", color: "var(--text-muted)" }}>
                    No hay coches facturados en este mes.
                  </td>
                </tr>
              )}
              {filas.map((e) => {
                const esVo = e.estadoVehiculo?.clase === "VO";
                const sinMat = !(e.matricula ?? "").trim();
                return (
                  <tr key={e.id_expediente}>
                    <td style={{ fontWeight: 600 }}>{sinMat ? <span style={{ color: esVo ? "var(--warning)" : "var(--text-muted)" }}>{esVo ? "⚠️ falta" : "—"}</span> : e.matricula}</td>
                    <td>{e.cliente?.nombre ?? "—"}</td>
                    <td>{[e.modelo?.marca?.nombre, e.modelo?.nombre_modelo].filter(Boolean).join(" ") || "—"}</td>
                    <td>{e.tipoDeVenta?.nombre_tipo_venta ?? "—"}</td>
                    <td>{e.estadoVehiculo?.nombre_estado_vehiculo ?? "—"}</td>
                    <td>{fecha(e.fecha_facturacion ?? e.fecha_matriculacion)}</td>
                    <td>{e.comisionado ? (e.comisionado.estado === "pagado" ? "🟢 Pagada" : "🟠 Reclamada") : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
