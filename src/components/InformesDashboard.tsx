"use client";

import Link from "next/link";
import TablaDatos, { type ColumnaTabla } from "@/components/TablaDatos";
import { columnasVehiculo } from "@/components/etiquetas";
import { useState } from "react";
import { useToast } from "@/components/Toast";
import { llamar, textoError } from "@/components/comisiones/api";
import { Seccion } from "@/components/comisiones/campos";
import { codigoExpediente, formatDate } from "@/lib/date-utils";
import { euros, mesActual, puntos } from "@/lib/formato";
import type { Informe } from "@/lib/servicios/informes";

type Vendedor = Informe["porVendedor"][number];
type Matriculado = Informe["matriculados"][number];
type Cartera = Informe["cartera"][number];

interface Props {
  vendedores: { id: number; nombre: string }[];
  marcas: { id: number; nombre: string }[];
  puedeElegirVendedor: boolean;
}

function Barras({ datos }: { datos: { nombre: string; total: number }[] }) {
  const max = Math.max(1, ...datos.map((d) => d.total));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      {datos.map((d) => (
        <div key={d.nombre} style={{ display: "grid", gridTemplateColumns: "140px 1fr 40px", gap: "10px", alignItems: "center" }}>
          <span>{d.nombre}</span>
          <div style={{ background: "var(--bg-card)", borderRadius: "4px", height: "14px" }}>
            <div style={{ width: `${(d.total / max) * 100}%`, height: "100%", background: "var(--primary)", borderRadius: "4px" }} />
          </div>
          <b style={{ textAlign: "right" }}>{d.total}</b>
        </div>
      ))}
      {datos.length === 0 && <span style={{ color: "var(--text-muted)" }}>Sin datos en el periodo.</span>}
    </div>
  );
}

/** «📊 Detalle y Análisis Estadístico». Las cifras económicas salen del mismo motor que las liquidaciones. */
export default function InformesDashboard({ vendedores, marcas, puedeElegirVendedor }: Props) {
  const { mostrar } = useToast();
  const [desde, setDesde] = useState(mesActual());
  const [hasta, setHasta] = useState(mesActual());
  const [vendedor, setVendedor] = useState<number | "">("");
  const [marca, setMarca] = useState<number | "">("");
  const [informe, setInforme] = useState<Informe | null>(null);
  const [cargando, setCargando] = useState(false);

  const generar = async () => {
    if (desde > hasta) return mostrar("El mes inicial no puede ser posterior al final", "error");
    setCargando(true);
    try {
      const { data } = await llamar<Informe>("/api/informes", { method: "POST", cuerpo: { desde, hasta, idVendedor: vendedor || undefined, idMarca: marca || undefined } });
      setInforme(data);
    } catch (e) {
      mostrar(textoError(e), "error");
    } finally {
      setCargando(false);
    }
  };

  const t = informe?.totales;
  const tarjeta = (titulo: string, valor: string, color: string) => (
    <div className="glass-panel-interactive" style={{ padding: "16px" }}>
      <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)", fontWeight: 600 }}>{titulo}</span>
      <h3 style={{ fontSize: "1.6rem", margin: "8px 0 0", color }}>{valor}</h3>
    </div>
  );

  const enlaceExp = (id: number) => (
    <Link href={`/dashboard/expedientes/editar/${id}`} style={{ color: "var(--primary)" }}>
      {codigoExpediente(id)}
    </Link>
  );
  const colVendedores: ColumnaTabla<Vendedor>[] = [
    { clave: "comercial", etiqueta: "Comercial", valor: (v) => v.nombre },
    { clave: "matriculados", etiqueta: "Matriculados", valor: (v) => v.matriculados, alinear: "right" },
    { clave: "puntos", etiqueta: "Puntos", valor: (v) => v.puntos, celda: (v) => puntos(v.puntos), alinear: "right" },
    { clave: "tramo", etiqueta: "Tramo medio", valor: (v) => v.tramoMedio ?? "", celda: (v) => v.tramoMedio ?? "—", alinear: "right" },
    { clave: "bruto", etiqueta: "Bruto", valor: (v) => v.bruto, celda: (v) => euros(v.bruto), alinear: "right" },
    { clave: "neto", etiqueta: "Neto", valor: (v) => v.neto, celda: (v) => <b>{euros(v.neto)}</b>, alinear: "right" },
  ];
  const colMatriculados: ColumnaTabla<Matriculado>[] = [
    { clave: "expediente", etiqueta: "Expediente", valor: (m) => m.id, celda: (m) => enlaceExp(m.id) },
    { clave: "fecha", etiqueta: "Fecha", valor: (m) => m.fecha ?? "", celda: (m) => formatDate(m.fecha) },
    { clave: "matricula", etiqueta: "Matrícula", valor: (m) => m.matricula ?? "", celda: (m) => m.matricula ?? "—" },
    ...columnasVehiculo<Matriculado>((m) => ({ marca: m.marca, modelo: m.modelo, tipoPago: m.tipoVenta }), { sin: ["clase", "estado"] }),
    { clave: "comercial", etiqueta: "Comercial", valor: (m) => m.vendedor ?? "" },
  ];
  const colCartera: ColumnaTabla<Cartera>[] = [
    { clave: "expediente", etiqueta: "Expediente", valor: (m) => m.id, celda: (m) => enlaceExp(m.id) },
    { clave: "pedido", etiqueta: "Pedido", valor: (m) => m.fechaPedido ?? "", celda: (m) => formatDate(m.fechaPedido) },
    ...columnasVehiculo<Cartera>((m) => ({ marca: m.marca, modelo: m.modelo, tipoPago: m.tipoVenta }), { sin: ["clase", "estado"] }),
    { clave: "comercial", etiqueta: "Comercial", valor: (m) => m.vendedor ?? "" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      <div>
        <h1 style={{ fontSize: "1.85rem", marginBottom: "8px" }}>Detalle y Análisis Estadístico</h1>
        <p style={{ color: "var(--text-secondary)" }}>Rendimiento de ventas, comisiones y ratios de penetración financiera.</p>
      </div>

      <Seccion titulo="🔍 Filtros de Consulta">
        <div style={{ display: "flex", gap: "14px", alignItems: "end", flexWrap: "wrap" }}>
          <div>
            <label className="form-label">Desde</label>
            <input className="form-input" type="month" value={desde} onChange={(e) => setDesde(e.target.value)} />
          </div>
          <div>
            <label className="form-label">Hasta</label>
            <input className="form-input" type="month" value={hasta} onChange={(e) => setHasta(e.target.value)} />
          </div>
          {puedeElegirVendedor && (
            <div>
              <label className="form-label">Vendedor</label>
              <select className="form-input" value={vendedor} onChange={(e) => setVendedor(e.target.value ? Number(e.target.value) : "")}>
                <option value="">Todos</option>
                {vendedores.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.nombre}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className="form-label">Marca</label>
            <select className="form-input" value={marca} onChange={(e) => setMarca(e.target.value ? Number(e.target.value) : "")}>
              <option value="">Todas</option>
              {marcas.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nombre}
                </option>
              ))}
            </select>
          </div>
          <button type="button" className="btn btn-primary" disabled={cargando} onClick={generar}>
            {cargando ? "Generando…" : "Generar informe"}
          </button>
        </div>
      </Seccion>

      {t && informe && (
        <>
          <Seccion titulo="Informe de Rendimiento de Ventas y Comisiones">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: "14px" }}>
              {tarjeta("MATRICULADOS", String(t.matriculados), "var(--success)")}
              {tarjeta("PEDIDOS EN CARTERA", String(t.pedidosCartera), "var(--warning)")}
              {tarjeta("PUNTOS", puntos(t.puntos), "var(--primary)")}
              {tarjeta("COMISIÓN BRUTA", euros(t.bruto), "var(--secondary)")}
              {tarjeta("COMISIÓN NETA", euros(t.neto), "var(--success)")}
              {tarjeta("FINANCIADOS", `${t.financiados} (${t.ratioFinanciacion.toLocaleString("es-ES")} %)`, "var(--info)")}
            </div>
            {informe.avisos.length > 0 && (
              <details>
                <summary style={{ cursor: "pointer", color: "var(--warning)" }}>⚠️ {informe.avisos.length} avisos del motor</summary>
                <ul style={{ margin: "8px 0 0", paddingLeft: "20px" }}>
                  {informe.avisos.map((a, i) => (
                    <li key={i}>{a}</li>
                  ))}
                </ul>
              </details>
            )}
          </Seccion>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "24px" }}>
            <Seccion titulo="Distribución por Marca">
              <Barras datos={informe.porMarca} />
            </Seccion>
            <Seccion titulo="Distribución por Forma de Pago">
              <Barras datos={informe.porFormaPago} />
            </Seccion>
          </div>

          {informe.eliminados.total > 0 && (
            <Seccion titulo={`🗑️ Expedientes eliminados del periodo (${informe.eliminados.total})`}>
              <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem", margin: "0 0 12px 0" }}>
                Se conservan solo para estadística: no cuentan en matriculaciones, puntos ni comisiones.
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "24px" }}>
                <Barras datos={informe.eliminados.porFormaPago} />
                <Barras datos={informe.eliminados.porVendedor} />
              </div>
            </Seccion>
          )}

          <Seccion titulo="📈 Rendimiento Económico por Comercial">
            <TablaDatos<Vendedor>
              id="informe-comerciales"
              columnas={colVendedores}
              filas={informe.porVendedor}
              clave={(v) => v.idUsuario}
              placeholder="Buscar comercial…"
              vacio="Sin datos en el periodo."
              pie={(fs) => ({ comercial: `${fs.length} comercial${fs.length === 1 ? "" : "es"}`, matriculados: fs.reduce((t, v) => t + v.matriculados, 0), puntos: puntos(fs.reduce((t, v) => t + v.puntos, 0)), bruto: euros(fs.reduce((t, v) => t + v.bruto, 0)), neto: euros(fs.reduce((t, v) => t + v.neto, 0)) })}
            />
          </Seccion>

          <Seccion titulo={`📋 Vehículos Matriculados en el Periodo (${informe.matriculados.length})`}>
            <TablaDatos<Matriculado>
              id="informe-matriculados"
              columnas={colMatriculados}
              filas={informe.matriculados}
              clave={(m) => m.id}
              placeholder="Buscar por matrícula, marca, modelo, comercial…"
              vacio="No hay vehículos matriculados en el periodo."
              pie={(fs) => ({ expediente: `${fs.length} vehículo${fs.length === 1 ? "" : "s"}` })}
            />
          </Seccion>

          <Seccion titulo={`💼 Pedidos en Cartera (Pendientes de Matriculación) (${informe.cartera.length})`}>
            <TablaDatos<Cartera>
              id="informe-cartera"
              columnas={colCartera}
              filas={informe.cartera}
              clave={(m) => m.id}
              placeholder="Buscar por marca, modelo, pago, comercial…"
              vacio="No hay pedidos en cartera."
              pie={(fs) => ({ expediente: `${fs.length} pedido${fs.length === 1 ? "" : "s"}` })}
            />
          </Seccion>
        </>
      )}
    </div>
  );
}
