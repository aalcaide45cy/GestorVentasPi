"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import { useCarga } from "@/components/comisiones/useCarga";
import type { ResultadoMes } from "@/lib/comisiones";
import type { ExpedienteDto } from "@/lib/dto";
import { efectoPuntos, efectoTramo } from "@/lib/efectos-tramo";
import { etiquetaTramo, euros, puntos } from "@/lib/formato";
import { usePreferencia } from "@/lib/preferencias";
import TablaDatos, { type ColumnaTabla } from "@/components/TablaDatos";
import AvisoComision from "./AvisoComision";
import { TextoCopiable, datosVehiculoDeExpediente } from "./comun";
import { columnasVehiculo } from "../etiquetas";

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

interface TarjetaProps {
  /** Identifica el desglose para recordar si está abierto (anterior / elegido). */
  clave: string;
  titulo: string;
  mesTexto: string;
  pagoTexto: string;
  resultado: (ResultadoMes & { expedientes?: Record<string, { cliente: string; vehiculo: string; matricula: string | null }> }) | null;
  cargado: boolean;
  porId: Map<number, ExpedienteDto>;
  destacada?: boolean;
  /** El mes que se muestra no es el actual: se rodea con el marco amarillo punteado, como el resumen estadístico. */
  fueraDeMes?: boolean;
}

/** Cajita con un indicador (puntos, tramo, bruto…) para ver las cifras de un vistazo. */
function Indicador({ etiqueta, ayuda, children }: { etiqueta: string; ayuda: string; children: ReactNode }) {
  return (
    <div title={ayuda} style={{ border: "1px solid var(--border-light)", borderRadius: "var(--radius-sm)", padding: "8px 10px", background: "rgba(255, 255, 255, 0.02)", display: "flex", flexDirection: "column", gap: "2px", minWidth: 0, overflow: "hidden" }}>
      <span style={{ fontSize: "0.68rem", color: "var(--text-secondary)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>{etiqueta}</span>
      <span style={{ fontSize: "clamp(0.95rem, 1.5vw, 1.2rem)", fontWeight: 800, overflowWrap: "anywhere", lineHeight: 1.2 }}>{children}</span>
    </div>
  );
}

interface FilaDesglose {
  linea: ResultadoMes["lineas"][number];
  e: ExpedienteDto | undefined;
  /** Datos que da el servidor cuando el expediente no está en la lista cargada en pantalla. */
  info: { cliente: string; vehiculo: string; matricula: string | null } | undefined;
  coche: number;
  financiacion: number;
  preference: number;
  bonus: number;
}

const nombreCliente = (f: FilaDesglose): string => f.e?.cliente?.nombre ?? f.info?.cliente ?? `Expediente ${f.linea.idExpediente}`;
const marcaDe = (f: FilaDesglose) => f.e?.modelo?.marca?.nombre ?? "";
const centimos = (n: number) => (n === 0 ? <span style={{ color: "var(--text-muted)" }}>—</span> : euros(n));

/** Columnas del desglose: cada expediente con lo que aporta el coche, la financiación, Preference y los bonus o reglas. */
const columnasDesglose: ColumnaTabla<FilaDesglose>[] = [
  {
    clave: "cliente",
    etiqueta: "Cliente",
    valor: (f) => nombreCliente(f),
    celda: (f) => (
      <Link href={`/dashboard/expedientes/editar/${f.linea.idExpediente}`} style={{ color: "inherit", fontWeight: 600 }} title="Abrir el expediente">
        {nombreCliente(f)}
      </Link>
    ),
    ancho: 130,
  },
  { clave: "matricula", etiqueta: "Matrícula", valor: (f) => f.e?.matricula ?? f.info?.matricula ?? "", oculta: true },
  { clave: "matriculacion", etiqueta: "Matriculación", valor: (f) => f.e?.fecha_matriculacion ?? "", celda: (f) => fechaCorta(f.e?.fecha_matriculacion ?? null) },
  ...columnasVehiculo<FilaDesglose>((f) => ({ ...datosVehiculoDeExpediente(f.e), clase: f.linea.clase, marca: marcaDe(f) || null, modelo: f.e?.modelo?.nombre_modelo ?? (f.e ? null : f.info?.vehiculo) ?? null, estado: f.e?.estadoVehiculo?.nombre_estado_vehiculo ?? (f.linea.clase === "VO" ? "Usado" : "Nuevo") })),
  { clave: "cuenta", etiqueta: "Cuenta", valor: (f) => (f.linea.cuenta ? "Este mes" : "Otros conceptos"), ayuda: "«Este mes»: el coche cuenta en este mes. «Otros conceptos»: solo suma bonus o financiación de este mes." },
  { clave: "puntos", etiqueta: "Puntos", valor: (f) => f.linea.puntos, celda: (f) => puntos(f.linea.puntos), alinear: "right", oculta: true },
  { clave: "coche", etiqueta: "Coche", valor: (f) => f.coche, celda: (f) => centimos(f.coche), alinear: "right", ayuda: "Comisión del coche (tarifa VN o VO)" },
  { clave: "financiacion", etiqueta: "Financiación", valor: (f) => f.financiacion, celda: (f) => centimos(f.financiacion), alinear: "right" },
  { clave: "preference", etiqueta: "Preference", valor: (f) => f.preference, celda: (f) => centimos(f.preference), alinear: "right" },
  { clave: "bonus", etiqueta: "Bonus / reglas", valor: (f) => f.bonus, celda: (f) => centimos(f.bonus), alinear: "right", ayuda: "Bonus, reglas y conceptos especiales" },
  { clave: "total", etiqueta: "Total", valor: (f) => f.linea.importe, celda: (f) => <strong>{euros(f.linea.importe)}</strong>, alinear: "right" },
];

function TarjetaComision({ clave, titulo, mesTexto, pagoTexto, resultado, cargado, porId, destacada, fueraDeMes }: TarjetaProps) {
  const [desgloseGuardado, guardarDesglose] = usePreferencia(`desglose-${clave}`);
  const abierta = desgloseGuardado === "abierto";
  const setAbierta = (v: boolean) => guardarDesglose(v ? "abierto" : "cerrado");
  const hayPlan = resultado !== null && resultado.idPlan !== null;
  const lineas = hayPlan ? resultado.lineas.filter((l) => l.importe !== 0 || l.cuenta) : [];
  const filasDesglose: FilaDesglose[] = lineas.map((linea) => {
    const suma = (...ids: string[]) => linea.conceptos.filter((c) => ids.includes(c.concepto)).reduce((t, c) => t + c.importe, 0);
    return { linea, e: porId.get(linea.idExpediente), info: resultado?.expedientes?.[String(linea.idExpediente)], coche: suma("coche_vn", "vo"), financiacion: suma("financiacion"), preference: suma("preference"), bonus: suma("regla", "especial") };
  });
  // Tasa de intervención financiera del mes: coches financiados / coches que cuentan, sumando todas las marcas
  const tasas = hayPlan ? resultado.tasaIntervencion : [];
  const tasaNum = tasas.reduce((t, x) => t + x.numerador, 0);
  const tasaDen = tasas.reduce((t, x) => t + x.denominador, 0);
  const tasaTotal = tasaDen > 0 ? (tasaNum / tasaDen) * 100 : null;
  const colorTasa = tasas.length === 0 ? undefined : tasas.every((x) => x.cumplida) ? "var(--success)" : "var(--warning)";
  const nombreMarca = (id: number) => [...porId.values()].find((e) => e.modelo?.marca?.id_marca === id)?.modelo?.marca?.nombre ?? `Marca ${id}`;
  const textoTasa = tasas.length === 0 ? "Sin coches con financiación calculable este mes" : `Coches financiados entre los que cuentan: ${tasas.map((x) => `${nombreMarca(x.idMarca)} ${x.numerador}/${x.denominador}${x.porcentaje !== null ? ` (${String(x.porcentaje).replace(".", ",")} %)` : ""} ${x.cumplida ? "✅ objetivo cumplido" : "❌ objetivo no cumplido"}`).join(" · ")}`;
  const efP = efectoPuntos(hayPlan ? resultado.puntosMes : null, hayPlan ? resultado.objetivoX : null);
  const efT = efectoTramo(hayPlan ? resultado.tramo : null);
  return (
    <div className="glass-panel" style={{ padding: "18px", display: "flex", flexDirection: "column", gap: "8px", border: destacada ? "1px solid var(--primary)" : undefined, ...(fueraDeMes ? { outline: "2px dashed var(--warning)", outlineOffset: "6px" } : {}) }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "10px", flexWrap: "wrap" }}>
        <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)", fontWeight: 600, textTransform: "uppercase" }}>{titulo}</span>
        <span style={{ fontSize: "0.95rem", fontWeight: 700 }}>{mesTexto}</span>
      </div>
      {hayPlan ? (
        <>
          <div style={{ display: "flex", gap: "18px", alignItems: "stretch", flexWrap: "wrap" }}>
            <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", minWidth: "150px" }}>
              <span style={{ fontSize: "0.72rem", color: "var(--text-secondary)", fontWeight: 600, textTransform: "uppercase" }}>Neto a cobrar</span>
              <h3 style={{ fontSize: "clamp(1.5rem, 3vw, 2.1rem)", overflowWrap: "anywhere", margin: 0, color: "var(--success)", fontWeight: "bold", lineHeight: 1.1 }}>{!cargado ? "…" : euros(resultado.neto)}</h3>
              <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>💶 {pagoTexto}</span>
            </div>
            <div style={{ flex: 1, minWidth: "260px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: "8px" }}>
              <Indicador etiqueta="Puntos" ayuda={efP.titulo || "Puntos del mes"}>
                <span className={efP.className} style={efP.style}>{puntos(resultado.puntosMes)}</span>
                <span style={{ fontSize: "0.72rem", color: "var(--text-secondary)", fontWeight: 400 }}> / {puntos(resultado.objetivoX)}</span>
              </Indicador>
              <Indicador etiqueta="Tramo" ayuda={efT.titulo || "Tramo del mes"}>
                <span className={efT.className} style={efT.style}>{etiquetaTramo(resultado.tramo)}</span>
              </Indicador>
              <Indicador etiqueta="Tasa int. financiera" ayuda={textoTasa}>
                {tasaTotal === null ? <span style={{ color: "var(--text-muted)" }}>—</span> : <span style={{ color: colorTasa }}>{`${tasaTotal.toFixed(1).replace(".", ",")} %`}</span>}
                {tasaDen > 0 && <span style={{ fontSize: "0.72rem", color: "var(--text-secondary)", fontWeight: 400 }}> {tasaNum}/{tasaDen}</span>}
              </Indicador>
              <Indicador etiqueta="Bruto" ayuda="Comisión antes de penalizaciones">
                {euros(resultado.bruto)}
              </Indicador>
              <Indicador etiqueta="Penalización" ayuda="Penalizaciones descontadas del bruto">
                <span style={{ color: resultado.penalizacion > 0 ? "var(--danger)" : "var(--text-muted)" }}>{resultado.penalizacion > 0 ? `−${euros(resultado.penalizacion)}` : "—"}</span>
              </Indicador>
              <Indicador etiqueta="Objetivo X" ayuda="Puntos que marcan el tramo X de este mes">
                {puntos(resultado.objetivoX)}
              </Indicador>
              <Indicador etiqueta="Coches" ayuda="Expedientes que cuentan en este mes">
                {resultado.lineas.filter((l) => l.cuenta).length}
              </Indicador>
            </div>
          </div>
          <button type="button" className="btn btn-secondary" onClick={() => setAbierta(!abierta)} style={{ padding: "6px 10px", fontSize: "0.8rem", alignSelf: "flex-start" }}>
            {abierta ? "Ocultar desglose" : `Ver desglose (${lineas.length})`}
          </button>
          {abierta && (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px", borderTop: "1px solid var(--border-light)", paddingTop: "10px" }}>
              <TablaDatos<FilaDesglose>
                id="desglose-comisiones"
                columnas={columnasDesglose}
                filas={filasDesglose}
                clave={(f) => f.linea.idExpediente}
                textoExtra={(f) => f.linea.conceptos.map((c) => c.descripcion).join(" ")}
                placeholder="Buscar por cliente, modelo, marca, matrícula, concepto…"
                vacio="Todavía no hay coches que cuenten en este mes."
                pie={(fs) => ({
                  cliente: `${fs.length} expediente${fs.length === 1 ? "" : "s"}`,
                  coche: euros(fs.reduce((t, f) => t + f.coche, 0)),
                  financiacion: euros(fs.reduce((t, f) => t + f.financiacion, 0)),
                  preference: euros(fs.reduce((t, f) => t + f.preference, 0)),
                  bonus: euros(fs.reduce((t, f) => t + f.bonus, 0)),
                  total: euros(fs.reduce((t, f) => t + f.linea.importe, 0)),
                })}
              />
              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                {resultado.avisos.map((a) => (
                  <AvisoComision
                    key={a}
                    texto={a}
                    expedientes={Object.fromEntries([...porId.entries()].map(([id, e]) => [String(id), { cliente: e.cliente?.nombre ?? "Sin cliente", vehiculo: [e.modelo?.marca?.nombre, e.modelo?.nombre_modelo].filter(Boolean).join(" ") || "sin modelo", matricula: e.matricula }]))}
                  />
                ))}
              </div>
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
  const esMesActual = anio === hoy.getFullYear() && mes === hoy.getMonth() + 1;
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
      {abierto && <div style={{ display: "grid", gridTemplateColumns: esMesActual ? "repeat(auto-fit, minmax(min(420px, 100%), 1fr))" : "1fr", gap: "16px" }}>
        {esMesActual && <TarjetaComision
          clave="anterior"
          titulo="Mes anterior (se cobra ahora)"
          mesTexto={etiquetaMes(previoReal.anio, previoReal.mes)}
          pagoTexto={`Nómina de ${etiquetaMes(pagoAnterior.anio, pagoAnterior.mes)}`}
          resultado={anterior ?? null}
          cargado={anterior !== undefined}
          porId={porId}
        />}
        <TarjetaComision
          clave="elegido"
          titulo={esMesActual ? "Mes elegido (llevas generado)" : "Mes elegido (no es el mes actual)"}
          mesTexto={etiquetaMes(anio, mes)}
          pagoTexto={`Se cobrará en la nómina de ${etiquetaMes(pago.anio, pago.mes)}`}
          resultado={elegido ?? null}
          cargado={elegido !== undefined}
          porId={porId}
          destacada
          fueraDeMes={!esMesActual}
        />
      </div>}
    </div>
  );
}

const columnasCartera: ColumnaTabla<ExpedienteDto>[] = [
  {
    clave: "cliente",
    etiqueta: "Cliente",
    valor: (e) => e.cliente?.nombre ?? "Sin cliente",
    celda: (e) => (
      <Link href={`/dashboard/expedientes/editar/${e.id_expediente}`} style={{ color: "inherit", fontWeight: 600 }} title="Abrir el expediente">
        {e.cliente?.nombre ?? "Sin cliente"}
      </Link>
    ),
    ancho: 150,
  },
  ...columnasVehiculo<ExpedienteDto>((e) => datosVehiculoDeExpediente(e)),
  { clave: "matricula", etiqueta: "Matrícula", valor: (e) => e.matricula ?? "", celda: (e) => (e.matricula ? <TextoCopiable texto={e.matricula} /> : "—") },
  { clave: "pedido", etiqueta: "F. pedido", valor: (e) => e.fecha_expediente ?? "", celda: (e) => fechaCorta(e.fecha_expediente) },
  { clave: "afectacion", etiqueta: "F. afectación", valor: (e) => e.fecha_afectacion ?? "", celda: (e) => <strong>{fechaCorta(e.fecha_afectacion)}</strong> },
  { clave: "matriculacion", etiqueta: "F. matriculación", valor: (e) => e.fecha_matriculacion ?? "", celda: (e) => fechaCorta(e.fecha_matriculacion) },
  { clave: "cobro", etiqueta: "Cobro otra fecha", valor: (e) => (e.cobrado_otra_fecha ? (e.fecha_cobrado ?? "") : ""), celda: (e) => (e.cobrado_otra_fecha ? fechaCorta(e.fecha_cobrado) : "—"), ayuda: "Fecha en la que se cobra el expediente cuando es distinta de la habitual («Expediente cobrado en otra fecha»)" },
  {
    clave: "situacion",
    etiqueta: "Situación",
    valor: (e) => ESTADOS_CARTERA[estadoCartera(e)].texto,
    celda: (e) => <span style={{ color: ESTADOS_CARTERA[estadoCartera(e)].color, fontWeight: 600 }}>{ESTADOS_CARTERA[estadoCartera(e)].texto}</span>,
  },
];

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
      {abierto && (
        <TablaDatos<ExpedienteDto>
          id="cartera"
          columnas={columnasCartera}
          filas={lista}
          clave={(e) => e.id_expediente}
          placeholder="Buscar por cliente, modelo, matrícula, tipo de venta, situación…"
          vacio="No hay expedientes con fecha de pedido en ese mes."
        />
      )}
    </div>
  );
}
