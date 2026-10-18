"use client";

import { useMemo, useState } from "react";
import { useCarga } from "@/components/comisiones/useCarga";
import { columnasVehiculo } from "@/components/etiquetas";
import TablaDatos, { type ColumnaTabla } from "@/components/TablaDatos";
import ResumenLiquidacion from "./ResumenLiquidacion";
import { claseFinanciacionFuera, textoFinanciacionFuera } from "@/components/expedientes/ComisionesYCartera";
import type { FinanciacionFueraDeMes, ResultadoMes } from "@/lib/comisiones";
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
  exp: ExpedienteDto | undefined;
  marca: string;
  modelo: string;
  estado: string;
  coche: number;
  financiacion: number;
  preference: number;
  bonus: number;
  total: number;
  cuenta: boolean;
  /** Su financiación cae en un mes distinto al que cuenta el coche. */
  fuera?: FinanciacionFueraDeMes;
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
          exp: e,
          marca: e?.modelo?.marca?.nombre ?? (info?.vehiculo ?? "").split(" ")[0] ?? "",
          modelo: e?.modelo?.nombre_modelo ?? (info?.vehiculo ?? "").split(" ").slice(1).join(" "),
          estado: e?.estadoVehiculo?.nombre_estado_vehiculo ?? (l.clase === "VO" ? "Usado" : "Nuevo"),
          coche: suma("coche_vn", "vo"),
          financiacion: suma("financiacion"),
          preference: suma("preference"),
          // Los conceptos propios del plan («extra:Nombre») se cuentan con los bonus
          bonus: suma("regla", "especial") + l.conceptos.filter((c) => c.concepto.startsWith("extra:")).reduce((t, c) => t + c.importe, 0),
          total: l.importe,
          cuenta: l.cuenta,
          fuera: datos.financiacionesFueraDeMes.find((x) => x.idExpediente === l.idExpediente),
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

  const celdaDinero = (n: number) => (n ? euros(n) : <span style={{ color: "var(--text-muted)" }}>—</span>);
  const columnas: ColumnaTabla<Fila>[] = [
    { clave: "visto", etiqueta: "✔", valor: (f) => (visto.has(f.id) ? 1 : 0), celda: (f) => <input type="checkbox" checked={visto.has(f.id)} onChange={() => alternar(f.id)} style={{ width: "18px", height: "18px", accentColor: "var(--success)" }} />, ayuda: "Marca el coche cuando lo veas en la rejilla" },
    { clave: "matricula", etiqueta: "Matrícula", valor: (f) => f.matricula ?? "", celda: (f) => (!(f.matricula ?? "").trim() ? <span style={{ color: f.usado ? "var(--warning)" : "var(--text-muted)" }}>{f.usado ? "⚠️ falta" : "—"}</span> : <b>{f.matricula}</b>) },
    {
      clave: "cliente",
      etiqueta: "Cliente",
      valor: (f) => f.cliente,
      celda: (f) => (
        <span title={f.fuera ? textoFinanciacionFuera(f.fuera) : undefined}>
          {f.cliente}
          {f.fuera && <span style={{ display: "block", fontSize: "0.7rem", fontWeight: 700, color: "var(--warning)" }}>💳 {f.fuera.tipo === "anterior" ? "Financiado el mes anterior" : "Financiación adelantada"}</span>}
        </span>
      ),
    },
    ...columnasVehiculo<Fila>((f) => ({ clase: f.usado ? "VO" : "VN", marca: f.marca, marcaColor: f.exp?.modelo?.marca?.color ?? null, marcaPunto: f.exp?.modelo?.marca?.punto ?? null, marcaPuntoColor: f.exp?.modelo?.marca?.punto_color ?? null, modelo: f.modelo, estado: f.estado, estadoColor: f.exp?.estadoVehiculo?.color, tipoPago: f.tipoPago === "—" ? null : f.tipoPago, tipoPagoColor: f.exp?.tipoDeVenta?.color }), { punto: true }),
    { clave: "coche", etiqueta: "Coche", valor: (f) => f.coche, celda: (f) => celdaDinero(f.coche), alinear: "right", ayuda: "Solo la comisión del coche, sin financiación" },
    { clave: "financiacion", etiqueta: "Financiación", valor: (f) => f.financiacion, celda: (f) => celdaDinero(f.financiacion), alinear: "right" },
    { clave: "preference", etiqueta: "Preference", valor: (f) => f.preference, celda: (f) => celdaDinero(f.preference), alinear: "right" },
    { clave: "bonus", etiqueta: "Bonus", valor: (f) => f.bonus, celda: (f) => celdaDinero(f.bonus), alinear: "right" },
    { clave: "total", etiqueta: "Total", valor: (f) => f.total, celda: (f) => <b>{euros(f.total)}</b>, alinear: "right" },
  ];

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
          <TablaDatos<Fila>
            id="cotejo-mi-mes"
            claseFila={claseFinanciacionFuera}
            columnas={columnas}
            filas={mostradas}
            clave={(f) => f.id}
            placeholder="Buscar por matrícula, cliente, marca, modelo, tipo de pago…"
            vacio={filas.length === 0 ? "Este mes no hay coches que generen comisión." : "¡Has marcado todos!"}
            pie={(fs) => ({
              marca: `${fs.length} coche${fs.length === 1 ? "" : "s"}`,
              coche: euros(fs.reduce((t, f) => t + f.coche, 0)),
              financiacion: euros(fs.reduce((t, f) => t + f.financiacion, 0)),
              preference: euros(fs.reduce((t, f) => t + f.preference, 0)),
              bonus: euros(fs.reduce((t, f) => t + f.bonus, 0)),
              total: euros(fs.reduce((t, f) => t + f.total, 0)),
            })}
          />
          <ResumenLiquidacion usuario={idVendedor} mes={mes} sinCoches />
        </>
      )}
    </section>
  );
}
