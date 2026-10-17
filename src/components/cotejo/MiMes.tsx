"use client";

import { useMemo, useState } from "react";
import { useCarga } from "@/components/comisiones/useCarga";
import type { ResultadoMes } from "@/lib/comisiones";
import type { ExpedienteDto } from "@/lib/dto";
import { euros, mesActual, nombreMes, sumarMeses } from "@/lib/formato";
import { usePreferencia } from "@/lib/preferencias";

interface Props {
  expedientes: ExpedienteDto[];
  /** Vendedores entre los que puede elegir el administrador. */
  vendedores: { id: number; nombre: string }[];
  idUsuarioActual: number;
  esAdministrador: boolean;
}

type Respuesta = (ResultadoMes & { expedientes?: Record<string, { cliente: string; vehiculo: string; matricula: string | null }> }) | null;

interface Fila {
  id: number;
  matricula: string | null;
  cliente: string;
  vehiculo: string;
  tipoPago: string;
  usado: boolean;
  coche: number;
  financiacion: number;
  preference: number;
  bonus: number;
  total: number;
  cuenta: boolean;
}

/**
 * «Mi mes»: la lista de los coches que deberían venir en la rejilla de la empresa en ese mes, con lo que te corresponde por cada
 * uno (coche, financiación, Preference y bonus). Sirve para ir tachando a mano con la hoja delante.
 */
export default function MiMes({ expedientes, vendedores, idUsuarioActual, esAdministrador }: Props) {
  const [idVendedor, setIdVendedor] = useState(idUsuarioActual);
  const [mesGuardado, guardarMes] = usePreferencia("cotejo-mes");
  const mes = /^\d{4}-\d{2}$/.test(mesGuardado ?? "") ? (mesGuardado as string) : mesActual();
  const [soloPendientes, setSoloPendientes] = useState(false);
  const [vistoGuardado, guardarVisto] = usePreferencia(`cotejo-visto-${idVendedor}-${mes}`);
  const visto = useMemo(() => {
    try {
      return new Set<number>(vistoGuardado ? (JSON.parse(vistoGuardado) as number[]) : []);
    } catch {
      return new Set<number>();
    }
  }, [vistoGuardado]);
  const { datos } = useCarga<Respuesta | undefined>(`/api/comisiones/mes?mes=${mes}&usuario=${idVendedor}`, undefined);

  const porId = useMemo(() => new Map(expedientes.map((e) => [e.id_expediente, e])), [expedientes]);
  const filas: Fila[] = useMemo(() => {
    if (!datos || datos.idPlan === null) return [];
    return datos.lineas
      .filter((l) => l.importe !== 0 || l.cuenta)
      .map((l) => {
        const e = porId.get(l.idExpediente);
        const info = datos.expedientes?.[String(l.idExpediente)];
        const suma = (...ids: string[]) => l.conceptos.filter((c) => ids.includes(c.concepto)).reduce((t, c) => t + c.importe, 0);
        return {
          id: l.idExpediente,
          matricula: e?.matricula ?? info?.matricula ?? null,
          cliente: e?.cliente?.nombre ?? info?.cliente ?? `Expediente ${l.idExpediente}`,
          vehiculo: [e?.modelo?.marca?.nombre, e?.modelo?.nombre_modelo].filter(Boolean).join(" ") || info?.vehiculo || "—",
          tipoPago: e?.tipoDeVenta?.nombre_tipo_venta ?? "—",
          usado: l.clase === "VO",
          coche: suma("coche_vn", "vo"),
          financiacion: suma("financiacion"),
          preference: suma("preference"),
          bonus: suma("regla", "especial"),
          total: l.importe,
          cuenta: l.cuenta,
        };
      })
      .sort((a, b) => (a.matricula ?? "~").localeCompare(b.matricula ?? "~"));
  }, [datos, porId]);

  const alternar = (id: number) => {
    const n = new Set(visto);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    guardarVisto(JSON.stringify([...n]));
  };
  const mostradas = soloPendientes ? filas.filter((f) => !visto.has(f.id)) : filas;
  const totalEsperado = filas.reduce((t, f) => t + f.total, 0);
  const sinMatricula = filas.filter((f) => f.usado && !(f.matricula ?? "").trim()).length;

  return (
    <section className="glass-panel" style={{ padding: "16px", display: "flex", flexDirection: "column", gap: "12px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap", alignItems: "center" }}>
        <div>
          <h2 style={{ fontSize: "1.15rem", margin: 0 }}>🚗 Coches que deberían venir en la rejilla de {nombreMes(mes)}</h2>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem", margin: "2px 0 0 0" }}>
            Con la hoja de la empresa delante, ve marcando cada coche cuando lo encuentres. Lo que te falte por marcar es lo que hay que reclamar.
          </p>
        </div>
        {esAdministrador && (
          <label style={{ display: "flex", gap: "8px", alignItems: "center", fontSize: "0.85rem" }}>
            Vendedor
            <select className="form-input" value={idVendedor} onChange={(e) => setIdVendedor(Number(e.target.value))}>
              {vendedores.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.nombre}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
        <button type="button" className="btn btn-secondary" onClick={() => guardarMes(sumarMeses(mes, -1))}>
          ◀ Anterior
        </button>
        <button type="button" className="btn btn-secondary" onClick={() => guardarMes(mesActual())} disabled={mes === mesActual()}>
          Mes actual
        </button>
        <button type="button" className="btn btn-secondary" onClick={() => guardarMes(sumarMeses(mes, 1))}>
          Siguiente ▶
        </button>
        <input type="month" className="form-input" value={mes} onChange={(e) => e.target.value && guardarMes(e.target.value)} style={{ width: "auto" }} />
        <label style={{ display: "flex", gap: "6px", alignItems: "center", fontSize: "0.85rem", marginLeft: "auto" }}>
          <input type="checkbox" checked={soloPendientes} onChange={(e) => setSoloPendientes(e.target.checked)} /> Ver solo los que me faltan por marcar
        </label>
      </div>

      {datos === undefined ? (
        <p style={{ color: "var(--text-secondary)" }}>Calculando…</p>
      ) : datos === null || datos.idPlan === null ? (
        <p style={{ color: "var(--warning)" }}>⚠️ No hay plan de comisionamiento para {nombreMes(mes)}, así que la app no sabe qué coches deberían venir.</p>
      ) : (
        <>
          <div style={{ display: "flex", gap: "18px", flexWrap: "wrap", fontSize: "0.9rem" }}>
            <span>
              <b>{filas.length}</b> coche(s)
            </span>
            <span>
              Marcados: <b>{filas.filter((f) => visto.has(f.id)).length}</b> de {filas.length}
            </span>
            <span>
              Total esperado: <b>{euros(totalEsperado)}</b>
            </span>
            <span style={{ color: "var(--text-secondary)" }}>Se cobra en la nómina de {nombreMes(sumarMeses(mes, 1))}</span>
          </div>
          {sinMatricula > 0 && (
            <div role="status" style={{ color: "var(--warning)", fontSize: "0.85rem" }}>
              ⚠️ {sinMatricula} usado(s) sin matrícula: no es obligatoria, pero sin ella no se pueden buscar en la hoja.
            </div>
          )}
          <div className="table-container">
            <table className="table-premium table-compact">
              <thead>
                <tr>
                  <th style={{ width: "36px" }} title="Marca el coche cuando lo veas en la rejilla">✔</th>
                  <th>Matrícula</th>
                  <th>Cliente</th>
                  <th>Vehículo</th>
                  <th>Tipo de pago</th>
                  <th style={{ textAlign: "right" }}>Coche</th>
                  <th style={{ textAlign: "right" }}>Financiación</th>
                  <th style={{ textAlign: "right" }}>Preference</th>
                  <th style={{ textAlign: "right" }}>Bonus</th>
                  <th style={{ textAlign: "right" }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {mostradas.length === 0 && (
                  <tr>
                    <td colSpan={10} style={{ textAlign: "center", color: "var(--text-muted)" }}>
                      {filas.length === 0 ? "Este mes no hay coches que generen comisión." : "¡Has marcado todos!"}
                    </td>
                  </tr>
                )}
                {mostradas.map((f) => {
                  const ok = visto.has(f.id);
                  const sinMat = !(f.matricula ?? "").trim();
                  return (
                    <tr key={f.id} style={{ opacity: ok ? 0.55 : 1, background: ok ? "rgba(34, 197, 94, 0.08)" : undefined }}>
                      <td>
                        <input type="checkbox" checked={ok} onChange={() => alternar(f.id)} style={{ width: "18px", height: "18px", accentColor: "var(--success)" }} />
                      </td>
                      <td style={{ fontWeight: 700 }}>{sinMat ? <span style={{ color: f.usado ? "var(--warning)" : "var(--text-muted)" }}>{f.usado ? "⚠️ falta" : "—"}</span> : f.matricula}</td>
                      <td>{f.cliente}</td>
                      <td>
                        {f.vehiculo} {f.usado && <span style={{ color: "var(--warning)", fontSize: "0.72rem", fontWeight: 700 }}>VO</span>}
                      </td>
                      <td>{f.tipoPago}</td>
                      <td style={{ textAlign: "right" }}>{f.coche ? euros(f.coche) : "—"}</td>
                      <td style={{ textAlign: "right" }}>{f.financiacion ? euros(f.financiacion) : "—"}</td>
                      <td style={{ textAlign: "right" }}>{f.preference ? euros(f.preference) : "—"}</td>
                      <td style={{ textAlign: "right" }}>{f.bonus ? euros(f.bonus) : "—"}</td>
                      <td style={{ textAlign: "right", fontWeight: 700 }}>{euros(f.total)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
