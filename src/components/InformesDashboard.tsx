"use client";

import Link from "next/link";
import { useState } from "react";
import { useToast } from "@/components/Toast";
import { llamar, textoError } from "@/components/comisiones/api";
import { Seccion } from "@/components/comisiones/campos";
import { codigoExpediente, formatDate } from "@/lib/date-utils";
import { euros, mesActual, puntos } from "@/lib/formato";
import type { Informe } from "@/lib/servicios/informes";

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

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      <div>
        <h1 style={{ fontSize: "1.85rem", marginBottom: "8px" }}>📊 Detalle y Análisis Estadístico</h1>
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

          <Seccion titulo="📈 Rendimiento Económico por Comercial">
            <div className="table-container">
              <table className="table-premium">
                <thead>
                  <tr>
                    <th>Comercial</th>
                    <th style={{ textAlign: "right" }}>Matriculados</th>
                    <th style={{ textAlign: "right" }}>Puntos</th>
                    <th style={{ textAlign: "right" }}>Tramo medio</th>
                    <th style={{ textAlign: "right" }}>Bruto</th>
                    <th style={{ textAlign: "right" }}>Neto</th>
                  </tr>
                </thead>
                <tbody>
                  {informe.porVendedor.map((v) => (
                    <tr key={v.idUsuario}>
                      <td>{v.nombre}</td>
                      <td style={{ textAlign: "right" }}>{v.matriculados}</td>
                      <td style={{ textAlign: "right" }}>{puntos(v.puntos)}</td>
                      <td style={{ textAlign: "right" }}>{v.tramoMedio ?? "—"}</td>
                      <td style={{ textAlign: "right" }}>{euros(v.bruto)}</td>
                      <td style={{ textAlign: "right", fontWeight: 700 }}>{euros(v.neto)}</td>
                    </tr>
                  ))}
                  {informe.porVendedor.length === 0 && (
                    <tr>
                      <td colSpan={6} style={{ color: "var(--text-muted)" }}>
                        Sin datos en el periodo.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Seccion>

          <Seccion titulo={`📋 Vehículos Matriculados en el Periodo (${informe.matriculados.length})`}>
            <div className="table-container">
              <table className="table-premium table-compact">
                <thead>
                  <tr>
                    <th>Expediente</th>
                    <th>Fecha</th>
                    <th>Matrícula</th>
                    <th>Vehículo</th>
                    <th>Pago</th>
                    <th>Comercial</th>
                  </tr>
                </thead>
                <tbody>
                  {informe.matriculados.map((m) => (
                    <tr key={m.id}>
                      <td>
                        <Link href={`/dashboard/expedientes/editar/${m.id}`} style={{ color: "var(--primary)" }}>
                          {codigoExpediente(m.id)}
                        </Link>
                      </td>
                      <td>{formatDate(m.fecha)}</td>
                      <td>{m.matricula ?? "—"}</td>
                      <td>
                        {m.marca} {m.modelo}
                      </td>
                      <td>{m.tipoVenta}</td>
                      <td>{m.vendedor}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Seccion>

          <Seccion titulo={`💼 Pedidos en Cartera (Pendientes de Matriculación) (${informe.cartera.length})`}>
            <div className="table-container">
              <table className="table-premium table-compact">
                <thead>
                  <tr>
                    <th>Expediente</th>
                    <th>Pedido</th>
                    <th>Vehículo</th>
                    <th>Pago</th>
                    <th>Comercial</th>
                  </tr>
                </thead>
                <tbody>
                  {informe.cartera.map((m) => (
                    <tr key={m.id}>
                      <td>
                        <Link href={`/dashboard/expedientes/editar/${m.id}`} style={{ color: "var(--primary)" }}>
                          {codigoExpediente(m.id)}
                        </Link>
                      </td>
                      <td>{formatDate(m.fechaPedido)}</td>
                      <td>
                        {m.marca} {m.modelo}
                      </td>
                      <td>{m.tipoVenta}</td>
                      <td>{m.vendedor}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Seccion>
        </>
      )}
    </div>
  );
}
