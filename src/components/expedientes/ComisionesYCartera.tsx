"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useCarga } from "@/components/comisiones/useCarga";
import type { ResultadoMes } from "@/lib/comisiones";
import type { ExpedienteDto } from "@/lib/dto";
import { etiquetaTramo, euros, puntos } from "@/lib/formato";
import { usePreferencia } from "@/lib/preferencias";

const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

const aIso = (anio: number, mes: number) => `${anio}-${String(mes).padStart(2, "0")}`;
/** Mes `delta` meses antes o después de `anio`/`mes` (mes de 1 a 12). */
function desplazar(anio: number, mes: number, delta: number): { anio: number; mes: number } {
  const total = anio * 12 + (mes - 1) + delta;
  return { anio: Math.floor(total / 12), mes: (total % 12) + 1 };
}
const etiquetaMes = (anio: number, mes: number) => `${MESES[mes - 1]} ${anio}`;
const fechaCorta = (f: string | null) => (f ? f.split("-").reverse().join("/") : "—");

/** Huella de los datos que cambian una comisión: al editar una fecha o un importe se vuelve a calcular. */
export function firmaExpedientes(lista: ExpedienteDto[]): string {
  let h = 5381;
  for (const e of lista) {
    const s = `${e.id_expediente}|${e.fecha_expediente}|${e.fecha_afectacion}|${e.fecha_matriculacion}|${e.fecha_facturacion}|${e.fecha_rci}|${e.fecha_cobrado}|${e.cobrado_otra_fecha}|${e.puntos}|${e.id_modelo}|${e.id_tipo_de_venta}|${e.id_estado_vehiculo}|${e.id_promocion}|${e.comision_coche_manual}|${e.comision_financiacion_manual}|${e.conceptos_especiales.length}|${e.id_usuario}`;
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  }
  return `${lista.length}-${(h >>> 0).toString(36)}`;
}

/** Estado plegado/desplegado de un panel, recordado en este navegador (por defecto, desplegado). */
export function usePlegable(clave: string): { abierto: boolean; alternar: () => void } {
  const [guardado, guardar] = usePreferencia(`panel-${clave}`);
  const abierto = guardado !== "cerrado";
  return { abierto, alternar: () => guardar(abierto ? "cerrado" : "abierto") };
}

export function BotonPlegar({ abierto, alternar, titulo }: { abierto: boolean; alternar: () => void; titulo: string }) {
  return (
    <button type="button" onClick={alternar} aria-expanded={abierto} title={abierto ? `Plegar «${titulo}»` : `Desplegar «${titulo}»`} className="btn btn-secondary" style={{ padding: "3px 10px", fontSize: "0.8rem" }}>
      {abierto ? "▾ Plegar" : "▸ Desplegar"}
    </button>
  );
}

const ETIQUETA_CONCEPTO: Record<string, string> = { coche_vn: "Coche", vo: "VO", financiacion: "Financiación", preference: "Preference / BOX3" };

const nombreExpediente = (e: ExpedienteDto | undefined, id: number) =>
  e ? `${e.cliente?.nombre ?? "Sin cliente"} · ${[e.modelo?.marca?.nombre, e.modelo?.nombre_modelo].filter(Boolean).join(" ") || "sin modelo"}` : `Expediente #${id}`;

interface TarjetaProps {
  titulo: string;
  mesTexto: string;
  pagoTexto: string;
  resultado: ResultadoMes | null;
  cargado: boolean;
  porId: Map<number, ExpedienteDto>;
  destacada?: boolean;
}

function TarjetaComision({ titulo, mesTexto, pagoTexto, resultado, cargado, porId, destacada }: TarjetaProps) {
  const [abierta, setAbierta] = useState(false);
  const hayPlan = resultado !== null && resultado.idPlan !== null;
  const lineas = hayPlan ? resultado.lineas.filter((l) => l.importe !== 0 || l.cuenta) : [];
  return (
    <div className="glass-panel" style={{ padding: "18px", display: "flex", flexDirection: "column", gap: "8px", border: destacada ? "1px solid var(--primary)" : undefined }}>
      <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)", fontWeight: 600, textTransform: "uppercase" }}>{titulo}</span>
      <span style={{ fontSize: "0.9rem", fontWeight: 600 }}>{mesTexto}</span>
      <h3 style={{ fontSize: "1.9rem", margin: 0, color: "var(--success)", fontWeight: "bold" }}>{!cargado ? "…" : hayPlan ? euros(resultado.neto) : "—"}</h3>
      {hayPlan ? (
        <>
          <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
            Puntos {puntos(resultado.puntosMes)} / objetivo {puntos(resultado.objetivoX)} · Tramo <strong>{etiquetaTramo(resultado.tramo)}</strong>
          </span>
          <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
            Bruto {euros(resultado.bruto)}
            {resultado.penalizacion > 0 ? ` · Penalización ${euros(resultado.penalizacion)}` : ""}
          </span>
          <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>💶 {pagoTexto}</span>
          <button type="button" className="btn btn-secondary" onClick={() => setAbierta(!abierta)} style={{ padding: "6px 10px", fontSize: "0.8rem", alignSelf: "flex-start" }}>
            {abierta ? "Ocultar desglose" : `Ver desglose (${lineas.length})`}
          </button>
          {abierta && (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px", borderTop: "1px solid var(--border-light)", paddingTop: "10px" }}>
              {lineas.length === 0 && <span style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>Todavía no hay coches que cuenten en este mes.</span>}
              {lineas.map((l) => {
                const detalle = l.conceptos.filter((c) => c.importe !== 0).map((c) => `${ETIQUETA_CONCEPTO[c.concepto] ?? c.descripcion} ${euros(c.importe)}`);
                const e = porId.get(l.idExpediente);
                const contenido = (
                  <>
                    <span style={{ fontWeight: 600 }}>{nombreExpediente(e, l.idExpediente)}</span>
                    <span style={{ fontSize: "0.78rem", color: "var(--text-secondary)" }}>
                      {l.cuenta ? "Cuenta este mes" : "Otros conceptos de este mes"}
                      {e ? ` · Matriculación ${fechaCorta(e.fecha_matriculacion)}` : ""}
                      {detalle.length > 0 ? ` · ${detalle.join(" · ")}` : ""}
                    </span>
                  </>
                );
                return (
                  <div key={l.idExpediente} style={{ display: "flex", justifyContent: "space-between", gap: "10px", fontSize: "0.85rem" }}>
                    {e ? (
                      <Link href={`/dashboard/expedientes/editar/${e.id_expediente}`} style={{ display: "flex", flexDirection: "column", color: "inherit" }}>
                        {contenido}
                      </Link>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column" }}>{contenido}</div>
                    )}
                    <strong style={{ whiteSpace: "nowrap" }}>{euros(l.importe)}</strong>
                  </div>
                );
              })}
              {resultado.avisos.map((a) => (
                <span key={a} style={{ color: "var(--warning)", fontSize: "0.8rem" }}>⚠ {a}</span>
              ))}
            </div>
          )}
        </>
      ) : (
        <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>{cargado ? "No hay plan de comisionamiento para este mes." : "Calculando…"}</span>
      )}
    </div>
  );
}

interface ComisionesProps {
  anio: number;
  mes: number;
  expedientes: ExpedienteDto[];
  /** Vendedor del que se calculan (solo administrador); sin él, el usuario actual. */
  usuario?: number;
}

/**
 * «Mis comisiones»: lo que llevas generado en el mes elegido (se actualiza al poner fechas de matriculación) y, siempre a
 * la vista, el mes anterior al real, que es el que se cobra en la nómina de este mes. Las cifras salen del motor de comisiones.
 */
export function PanelComisiones({ anio, mes, expedientes, usuario }: ComisionesProps) {
  const hoy = new Date();
  const previoReal = desplazar(hoy.getFullYear(), hoy.getMonth() + 1, -1);
  const firma = useMemo(() => firmaExpedientes(expedientes), [expedientes]);
  const porId = useMemo(() => new Map(expedientes.map((e) => [e.id_expediente, e])), [expedientes]);
  const q = `${usuario ? `&usuario=${usuario}` : ""}&v=${firma}`;
  const { datos: elegido } = useCarga<ResultadoMes | null | undefined>(`/api/comisiones/mes?mes=${aIso(anio, mes)}${q}`, undefined);
  const { datos: anterior } = useCarga<ResultadoMes | null | undefined>(`/api/comisiones/mes?mes=${aIso(previoReal.anio, previoReal.mes)}${q}`, undefined);
  const pago = desplazar(anio, mes, 1);
  const pagoAnterior = desplazar(previoReal.anio, previoReal.mes, 1);

  const { abierto, alternar } = usePlegable("comisiones");
  return (
    <div className="glass-panel" style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: "10px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", flexWrap: "wrap", alignItems: "flex-start" }}>
        <div>
          <h4 style={{ fontSize: "1rem", fontWeight: "bold", margin: 0 }}>💶 Comisiones</h4>
          {abierto && (
            <p style={{ color: "var(--text-secondary)", fontSize: "0.8rem", margin: "2px 0 0 0" }}>
              Lo que generas en un mes se cobra en la nómina del mes siguiente. Se recalcula solo al poner fechas de matriculación (o de facturación, cobro, RCI…).
            </p>
          )}
        </div>
        <BotonPlegar abierto={abierto} alternar={alternar} titulo="Comisiones" />
      </div>
      {abierto && <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "16px" }}>
        <TarjetaComision
          titulo="Mes elegido (llevas generado)"
          mesTexto={etiquetaMes(anio, mes)}
          pagoTexto={`Se cobrará en la nómina de ${etiquetaMes(pago.anio, pago.mes)}`}
          resultado={elegido ?? null}
          cargado={elegido !== undefined}
          porId={porId}
          destacada
        />
        <TarjetaComision
          titulo="Mes anterior (se cobra ahora)"
          mesTexto={etiquetaMes(previoReal.anio, previoReal.mes)}
          pagoTexto={`Nómina de ${etiquetaMes(pagoAnterior.anio, pagoAnterior.mes)}`}
          resultado={anterior ?? null}
          cargado={anterior !== undefined}
          porId={porId}
        />
      </div>}
    </div>
  );
}

const ESTADOS_CARTERA = {
  sinAfectar: { texto: "Sin afectar (sin bastidor)", color: "var(--warning)", orden: 0 },
  sinMatricular: { texto: "Afectado · pendiente de matricular", color: "var(--primary)", orden: 1 },
  matriculado: { texto: "Matriculado", color: "var(--success)", orden: 2 },
} as const;

function estadoCartera(e: ExpedienteDto): keyof typeof ESTADOS_CARTERA {
  if (e.fecha_matriculacion) return "matriculado";
  if (e.fecha_afectacion) return "sinMatricular";
  return "sinAfectar";
}

/**
 * «Cartera»: expedientes (pedidos) del mes anterior al elegido según su fecha de pedido, con el estado en que están. La
 * afectación (cuando fábrica asigna el bastidor) es la fecha clave: de ella dependen comisiones. Cada fila abre el expediente.
 */
export function PanelCartera({ anio, mes, expedientes }: { anio: number; mes: number; expedientes: ExpedienteDto[] }) {
  const [pendientesAntiguos, setPendientesAntiguos] = useState(false);
  const { abierto, alternar } = usePlegable("cartera");
  const previo = desplazar(anio, mes, -1);
  const inicio = aIso(previo.anio, previo.mes);
  const lista = (() => {
    const delMes = expedientes.filter((e) => e.fecha_expediente?.slice(0, 7) === inicio);
    const antiguos = pendientesAntiguos ? expedientes.filter((e) => e.fecha_expediente !== null && e.fecha_expediente.slice(0, 7) < inicio && !e.fecha_matriculacion) : [];
    return [...delMes, ...antiguos].sort((a, b) => ESTADOS_CARTERA[estadoCartera(a)].orden - ESTADOS_CARTERA[estadoCartera(b)].orden || (a.fecha_expediente ?? "").localeCompare(b.fecha_expediente ?? ""));
  })();
  const cuenta = { sinAfectar: 0, sinMatricular: 0, matriculado: 0 };
  for (const e of lista) cuenta[estadoCartera(e)]++;

  return (
    <div className="glass-panel" style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: "10px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: "10px", alignItems: "center" }}>
        <div>
          <h4 style={{ fontSize: "1rem", fontWeight: "bold", margin: 0 }}>📁 Cartera: pedidos de {etiquetaMes(previo.anio, previo.mes)}</h4>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.8rem", margin: "2px 0 0 0" }}>
            Expedientes con fecha de pedido en ese mes. La afectación (bastidor de fábrica) es la fecha clave. Pulsa uno para abrirlo.
          </p>
        </div>
        <div style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
          {abierto && (
            <label style={{ display: "flex", gap: "8px", alignItems: "center", fontSize: "0.85rem", cursor: "pointer" }}>
              <input type="checkbox" checked={pendientesAntiguos} onChange={(e) => setPendientesAntiguos(e.target.checked)} />
              Añadir pendientes de matricular de meses anteriores
            </label>
          )}
          <BotonPlegar abierto={abierto} alternar={alternar} titulo="Cartera" />
        </div>
      </div>
      {abierto && <div style={{ display: "flex", gap: "16px", flexWrap: "wrap", fontSize: "0.85rem" }}>
        <strong>{lista.length} en total</strong>
        <span style={{ color: ESTADOS_CARTERA.sinAfectar.color }}>● {cuenta.sinAfectar} sin afectar</span>
        <span style={{ color: ESTADOS_CARTERA.sinMatricular.color }}>● {cuenta.sinMatricular} afectados, sin matricular</span>
        <span style={{ color: ESTADOS_CARTERA.matriculado.color }}>● {cuenta.matriculado} matriculados</span>
      </div>}
      {abierto && (lista.length === 0 ? (
        <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem", margin: 0 }}>No hay expedientes con fecha de pedido en ese mes.</p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", fontSize: "0.85rem", borderCollapse: "collapse", minWidth: "640px" }}>
            <thead>
              <tr style={{ textAlign: "left", color: "var(--text-secondary)" }}>
                <th style={{ padding: "6px 8px" }}>Cliente</th>
                <th style={{ padding: "6px 8px" }}>Modelo</th>
                <th style={{ padding: "6px 8px" }}>F. pedido</th>
                <th style={{ padding: "6px 8px" }}>F. afectación</th>
                <th style={{ padding: "6px 8px" }}>F. matriculación</th>
                <th style={{ padding: "6px 8px" }}>Situación</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((e) => {
                const est = ESTADOS_CARTERA[estadoCartera(e)];
                return (
                  <tr key={e.id_expediente} style={{ borderTop: "1px solid var(--border-light)" }}>
                    <td style={{ padding: "6px 8px" }}>
                      <Link href={`/dashboard/expedientes/editar/${e.id_expediente}`} style={{ color: "inherit", fontWeight: 600 }} title="Abrir el expediente">
                        {e.cliente?.nombre ?? "Sin cliente"}
                      </Link>
                    </td>
                    <td style={{ padding: "6px 8px" }}>{[e.modelo?.marca?.nombre, e.modelo?.nombre_modelo].filter(Boolean).join(" ") || "—"}</td>
                    <td style={{ padding: "6px 8px" }}>{fechaCorta(e.fecha_expediente)}</td>
                    <td style={{ padding: "6px 8px", fontWeight: 700 }}>{fechaCorta(e.fecha_afectacion)}</td>
                    <td style={{ padding: "6px 8px" }}>{fechaCorta(e.fecha_matriculacion)}</td>
                    <td style={{ padding: "6px 8px", color: est.color, fontWeight: 600 }}>{est.texto}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
