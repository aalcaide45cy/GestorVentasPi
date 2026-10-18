"use client";

import Link from "next/link";
import { useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { useCarga } from "@/components/comisiones/useCarga";
import type { FinanciacionFueraDeMes, ResultadoMes, TasaCocheDetalle } from "@/lib/comisiones";
import type { ExpedienteDto } from "@/lib/dto";
import { efectoPuntos, efectoTramo } from "@/lib/efectos-tramo";
import { etiquetaTramo, euros, puntos } from "@/lib/formato";
import { usePreferencia } from "@/lib/preferencias";
import TablaDatos, { type ColumnaTabla } from "@/components/TablaDatos";
import Modal from "@/components/Modal";
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
const etiquetaMesCorta = (anio: number, mes: number) => `${MESES[mes - 1].slice(0, 3).toLowerCase()} ${anio}`;
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
  /** Frase completa de cuándo se cobra (la que sale al pasar el ratón por el texto corto). */
  pagoAyuda: string;
  resultado: (ResultadoMes & { expedientes?: Record<string, { cliente: string; vehiculo: string; matricula: string | null }> }) | null;
  cargado: boolean;
  porId: Map<number, ExpedienteDto>;
  /** El mes que se muestra no es el actual: se rodea con el marco amarillo punteado, como el resumen estadístico. */
  fueraDeMes?: boolean;
}

/** Cajita con un indicador (puntos, tramo, bruto…) para ver las cifras de un vistazo. */
function Indicador({ etiqueta, ayuda, children, alAbrir }: { etiqueta: string; ayuda: string; children: ReactNode; alAbrir?: () => void }) {
  return (
    <div
      title={alAbrir ? `${ayuda} (pulsa para ver el detalle)` : ayuda}
      role={alAbrir ? "button" : undefined}
      tabIndex={alAbrir ? 0 : undefined}
      onClick={alAbrir}
      onKeyDown={alAbrir ? (e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), alAbrir()) : undefined}
      style={{ border: "1px solid var(--border-light)", borderRadius: "var(--radius-sm)", padding: "8px 10px", background: "rgba(255, 255, 255, 0.02)", display: "flex", flexDirection: "column", justifyContent: "center", gap: "2px", minWidth: 0, minHeight: "58px", overflow: "hidden", cursor: alAbrir ? "pointer" : undefined }}
    >
      <span style={{ fontSize: "0.68rem", color: "var(--text-secondary)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{etiqueta}{alAbrir ? " 🔎" : ""}</span>
      <span style={{ fontSize: "1.15rem", fontWeight: 800, overflowWrap: "anywhere", lineHeight: 1.2 }}>{children}</span>
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
  /** Su financiación (RCI) cae en un mes distinto al que cuenta el coche. */
  fuera?: FinanciacionFueraDeMes;
  /** Importes de los conceptos propios del plan («extra:Nombre»), por nombre. */
  extras: Record<string, number>;
}

/** Importes de los conceptos propios de un expediente, por nombre. */
function extrasDe(linea: ResultadoMes["lineas"][number]): Record<string, number> {
  const r: Record<string, number> = {};
  for (const c of linea.conceptos) if (c.concepto.startsWith("extra:")) r[c.concepto.slice(6)] = (r[c.concepto.slice(6)] ?? 0) + c.importe;
  return r;
}

/** Nombres de los conceptos propios que aparecen en las filas, en orden alfabético. */
function nombresExtras(filas: FilaDesglose[]): string[] {
  return [...new Set(filas.flatMap((f) => Object.keys(f.extras)))].sort((a, b) => a.localeCompare(b, "es"));
}

const nombreMesIso = (m: string | null) => (m ? `${MESES[Number(m.slice(5, 7)) - 1].toLowerCase()} ${m.slice(0, 4)}` : "");

/** Texto que explica por qué se marca un coche con financiación de otro mes. */
export function textoFinanciacionFuera(f: FinanciacionFueraDeMes): string {
  return f.tipo === "anterior"
    ? `Financiación contratada el mes anterior (${nombreMesIso(f.mesRci)}): ya sumó a la tasa de aquel mes; este mes cuenta el coche, pero no vuelve a sumar a la tasa.`
    : `Financiación adelantada: contratada este mes (${nombreMesIso(f.mesRci)}) aunque el coche cuenta ${f.mesComputo ? `en ${nombreMesIso(f.mesComputo)}` : "más adelante (aún no tiene fecha para contar)"}. Suma a la tasa de este mes, pero no su comisión del coche.`;
}

/** Clase del marco amarillo punteado de las filas con financiación de otro mes (solo esa fila, no la tabla entera). */
export const claseFinanciacionFuera = (f: { fuera?: FinanciacionFueraDeMes }): string => (f.fuera ? "fila-aviso" : "");

const nombreCliente = (f: FilaDesglose): string => f.e?.cliente?.nombre ?? f.info?.cliente ?? `Expediente ${f.linea.idExpediente}`;
const marcaDe = (f: FilaDesglose) => f.e?.modelo?.marca?.nombre ?? "";
const centimos = (n: number) => (n === 0 ? <span style={{ color: "var(--text-muted)" }}>—</span> : euros(n));

/** Columnas del desglose: cada expediente con lo que aporta el coche, la financiación, Preference y los bonus o reglas. */
const columnasBase: ColumnaTabla<FilaDesglose>[] = [
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
  { clave: "matriculacion", etiqueta: "Matriculación", valor: (f) => f.e?.fecha_matriculacion ?? "", celda: (f) => fechaCorta(f.e?.fecha_matriculacion ?? null), oculta: true },
  ...columnasVehiculo<FilaDesglose>((f) => ({ ...datosVehiculoDeExpediente(f.e), clase: f.linea.clase, marca: marcaDe(f) || null, modelo: f.e?.modelo?.nombre_modelo ?? (f.e ? null : f.info?.vehiculo) ?? null, estado: f.e?.estadoVehiculo?.nombre_estado_vehiculo ?? (f.linea.clase === "VO" ? "Usado" : "Nuevo") }), { punto: true }),
  {
    clave: "cuenta",
    etiqueta: "Cuenta",
    valor: (f) => (f.linea.cuenta ? "Sí" : "Otros"),
    celda: (f) => (
      <span title={f.fuera ? textoFinanciacionFuera(f.fuera) : undefined}>
        {f.linea.cuenta ? "Sí" : "Otros"}
      </span>
    ),
    ayuda: "«Sí»: el coche cuenta en este mes. «Otros»: el coche no cuenta este mes, solo suma bonus o financiación de este mes. Con marco amarillo punteado: su financiación es de otro mes.",
  },
  { clave: "puntos", etiqueta: "Puntos", valor: (f) => f.linea.puntos, celda: (f) => puntos(f.linea.puntos), alinear: "right", oculta: true },
  { clave: "coche", etiqueta: "Coche", valor: (f) => f.coche, celda: (f) => centimos(f.coche), alinear: "right", ayuda: "Comisión del coche (tarifa VN o VO)" },
  { clave: "financiacion", etiqueta: "Financiación", valor: (f) => f.financiacion, celda: (f) => centimos(f.financiacion), alinear: "right" },
  { clave: "preference", etiqueta: "Preference", valor: (f) => f.preference, celda: (f) => centimos(f.preference), alinear: "right" },
  { clave: "bonus", etiqueta: "Bonus / reglas", valor: (f) => f.bonus, celda: (f) => centimos(f.bonus), alinear: "right", ayuda: "Bonus, reglas y conceptos especiales" },
  { clave: "total", etiqueta: "Total", valor: (f) => f.linea.importe, celda: (f) => <strong>{euros(f.linea.importe)}</strong>, alinear: "right" },
];

/** Cápsula con el borde amarillo punteado, igual que la de las filas con la financiación en otro mes. */
const capsulaAviso: CSSProperties = { display: "inline-block", border: "2px dashed var(--warning)", borderRadius: "999px", background: "rgba(245, 158, 11, 0.08)" };

/** Línea pequeña bajo la tasa: cuántas financiaciones son de otro mes (ya incluidas en la cifra, o excluidas por ser del mes anterior). */
function NotaFueraDeMes({ numerador, adelantadas, anteriores }: { numerador: number; adelantadas: number; anteriores: number }) {
  if (adelantadas === 0 && anteriores === 0) return null;
  const partes = [adelantadas > 0 ? `${numerador - adelantadas} + ${adelantadas} adelantada${adelantadas === 1 ? "" : "s"}` : null, anteriores > 0 ? `${anteriores} del mes anterior (no suma)` : null].filter(Boolean);
  return (
    <span title="Adelantadas: financiación de este mes de coches que cuentan en otro mes. Del mes anterior: coches de este mes cuya financiación sumó en el mes anterior (no suman aquí)." style={{ ...capsulaAviso, alignSelf: "flex-start", fontSize: "0.66rem", fontWeight: 600, color: "var(--warning)", lineHeight: 1.3, padding: "0 8px", marginTop: "2px", maxWidth: "100%", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
      💳 {partes.join(" · ")}
    </span>
  );
}

type TipoDetalle = "puntos" | "tramo" | "tasa" | "tasaVo" | "bruto" | "penalizacion" | "objetivo" | "coches" | "neto";

interface FilaTasa {
  coche: TasaCocheDetalle;
  fila: FilaDesglose;
}

interface FilaResumen {
  concepto: string;
  valor: string;
  nota: string;
}

const columnasResumen: ColumnaTabla<FilaResumen>[] = [
  { clave: "concepto", etiqueta: "Concepto", valor: (f) => f.concepto },
  { clave: "valor", etiqueta: "Valor", valor: (f) => f.valor, alinear: "right" },
  { clave: "nota", etiqueta: "Cómo sale", valor: (f) => f.nota },
];

const pcTexto = (n: number, d: number) => (d === 0 ? "—" : `${((n / d) * 100).toFixed(1).replace(".", ",")} %`);

/** Columnas de los coches que entran en la tasa: si cuentan en el mes y si están financiados. */
const columnasTasa: ColumnaTabla<FilaTasa>[] = [
  { clave: "cliente", etiqueta: "Cliente", valor: (f) => nombreCliente(f.fila), celda: (f) => <Link href={`/dashboard/expedientes/editar/${f.coche.idExpediente}`} style={{ color: "inherit", fontWeight: 600 }}>{nombreCliente(f.fila)}</Link>, ancho: 130 },
  { clave: "matricula", etiqueta: "Matrícula", valor: (f) => f.fila.e?.matricula ?? f.fila.info?.matricula ?? "", oculta: true },
  ...columnasVehiculo<FilaTasa>((f) => ({ ...datosVehiculoDeExpediente(f.fila.e), clase: f.coche.clase, marca: marcaDe(f.fila) || null, modelo: f.fila.e?.modelo?.nombre_modelo ?? (f.fila.e ? null : f.fila.info?.vehiculo) ?? null, estado: f.fila.e?.estadoVehiculo?.nombre_estado_vehiculo ?? (f.coche.clase === "VO" ? "Usado" : "Nuevo") }), { punto: true }),
  { clave: "cuenta", etiqueta: "Cuenta este mes", valor: (f) => (f.coche.cuenta ? "Sí" : "No"), ayuda: "Suma en el denominador de la tasa" },
  { clave: "financiado", etiqueta: "Financiado (RCI este mes)", valor: (f) => (f.coche.financiado ? "Sí" : "No"), ayuda: "Suma en el numerador de la tasa" },
  { clave: "aviso", etiqueta: "Otro mes", valor: (f) => (f.fila.fuera ? (f.fila.fuera.tipo === "anterior" ? "Mes anterior" : "Adelantada") : ""), celda: (f) => (f.fila.fuera ? <span title={textoFinanciacionFuera(f.fila.fuera)} style={{ color: "var(--warning)", fontWeight: 700 }}>💳 {f.fila.fuera.tipo === "anterior" ? "Mes anterior" : "Adelantada"}</span> : ""), ayuda: "Coches cuya financiación se contrató en un mes distinto al que cuenta el coche" },
];

type ResultadoConInfo = ResultadoMes & { expedientes?: Record<string, { cliente: string; vehiculo: string; matricula: string | null }> };

/** Modal con el detalle de un indicador del panel de comisiones: una tabla con ordenación, buscador y columnas a elegir. */
function DetalleIndicador({ tipo, resultado, filas, porId, nombreMarca, alCerrar }: { tipo: TipoDetalle; resultado: ResultadoConInfo; filas: FilaDesglose[]; porId: Map<number, ExpedienteDto>; nombreMarca: (id: number) => string; alCerrar: () => void }) {
  const cuentan = filas.filter((f) => f.linea.cuenta);
  const extrasModal = nombresExtras(filas);
  const columnasModal = columnasDesgloseDe(extrasModal, true);
  const titulos: Record<TipoDetalle, string> = { puntos: "Puntos del mes", tramo: "Tramo del mes", tasa: "Tasa de intervención financiera", tasaVo: "Tasa de intervención de usados", bruto: "Bruto del mes", penalizacion: "Penalización", objetivo: "Objetivo X", coches: "Coches que cuentan en el mes", neto: "Neto a cobrar" };
  const filaDe = (idExpediente: number): FilaDesglose =>
    filas.find((f) => f.linea.idExpediente === idExpediente) ?? { linea: { idExpediente, clase: "VN", mesComputo: null, cuenta: false, unidades: 0, puntos: 0, importe: 0, conceptos: [] }, e: porId.get(idExpediente), info: resultado.expedientes?.[String(idExpediente)], coche: 0, financiacion: 0, preference: 0, bonus: 0, extras: {}, fuera: resultado.financiacionesFueraDeMes.find((f) => f.idExpediente === idExpediente) };
  let contenido: ReactNode;
  if (tipo === "tasa" || tipo === "tasaVo") {
    const esVo = tipo === "tasaVo";
    const t = esVo ? resultado.tasaVo : resultado.tasaGlobal;
    const coches: FilaTasa[] = resultado.tasaCoches.filter((c) => (esVo ? c.clase === "VO" : c.clase === "VN" || resultado.tasaIncluyeVo)).map((c) => ({ coche: c, fila: filaDe(c.idExpediente) }));
    const resumen: FilaResumen[] = [
      { concepto: esVo ? "Usados (VO)" : resultado.tasaIncluyeVo ? "Global (nuevos y usados)" : "Global (solo nuevos)", valor: `${t.numerador}/${t.denominador} · ${pcTexto(t.numerador, t.denominador)}`, nota: t.conObjetivo ? (t.cumplida ? "Objetivo cumplido" : "Objetivo NO cumplido") : "Sin objetivo en el plan (se da por cumplida)" },
      ...(esVo ? [] : resultado.tasaIntervencion.map((x) => ({ concepto: `Marca ${nombreMarca(x.idMarca)}`, valor: `${x.numerador}/${x.denominador} · ${pcTexto(x.numerador, x.denominador)}`, nota: x.cumplida ? "Objetivo cumplido" : "Objetivo NO cumplido" }))),
    ];
    contenido = (
      <>
        <TablaDatos<FilaResumen> id="detalle-tasa-resumen" columnas={columnasResumen} filas={resumen} clave={(f) => f.concepto} />
        <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--text-secondary)" }}>
          El denominador son los coches que cuentan este mes y el numerador los financiados (RCI este mes).{esVo || resultado.tasaIncluyeVo ? "" : " Los usados no cuentan porque el plan lo tiene desactivado."}
        </p>
        <TablaDatos<FilaTasa> id="detalle-tasa-coches" columnas={columnasTasa} claseFila={(f) => claseFinanciacionFuera(f.fila)} compacta filas={coches} clave={(f) => f.coche.idExpediente} placeholder="Buscar por cliente, marca, modelo…" vacio="No hay coches para calcular esta tasa." pie={(fs) => ({ cliente: `${fs.length} coche${fs.length === 1 ? "" : "s"}`, cuenta: `${fs.filter((f) => f.coche.cuenta).length} cuentan`, financiado: `${fs.filter((f) => f.coche.financiado).length} financiados`, aviso: fs.some((f) => f.fila.fuera) ? `${fs.filter((f) => f.fila.fuera).length} de otro mes` : "" })} />
      </>
    );
  } else if (tipo === "objetivo") {
    const resumen: FilaResumen[] = [
      { concepto: "Objetivo base", valor: puntos(resultado.objetivoBase), nota: "Puntos fijados en el plan para este vendedor" },
      { concepto: "Arrastre", valor: puntos(resultado.objetivoArrastre), nota: "Puntos que se arrastran de meses anteriores" },
      { concepto: "Objetivo X", valor: puntos(resultado.objetivoX), nota: "Base + arrastre" },
    ];
    contenido = <TablaDatos<FilaResumen> id="detalle-objetivo" columnas={columnasResumen} filas={resumen} clave={(f) => f.concepto} />;
  } else if (tipo === "penalizacion" || tipo === "neto") {
    const resumen: FilaResumen[] = [
      { concepto: "Bruto", valor: euros(resultado.bruto), nota: "Suma de las comisiones de los coches del mes" },
      { concepto: "Penalización", valor: resultado.penalizacion > 0 ? `−${euros(resultado.penalizacion)}` : "—", nota: "Importe fijado en el plan, se descuenta del bruto" },
      { concepto: "Neto", valor: euros(resultado.neto), nota: "Bruto menos penalización (nunca menos de 0 €)" },
    ];
    contenido = <TablaDatos<FilaResumen> id="detalle-neto" columnas={columnasResumen} filas={resumen} clave={(f) => f.concepto} />;
  } else {
    const resumen: FilaResumen[] = [{ concepto: "Puntos del mes", valor: puntos(resultado.puntosMes), nota: `Objetivo X ${puntos(resultado.objetivoX)} → tramo ${etiquetaTramo(resultado.tramo)}` }];
    contenido = (
      <>
        {(tipo === "puntos" || tipo === "tramo") && <TablaDatos<FilaResumen> id="detalle-puntos-resumen" columnas={columnasResumen} filas={resumen} clave={(f) => f.concepto} />}
        <TablaDatos<FilaDesglose>
          id={`detalle-${tipo}`}
          claseFila={claseFinanciacionFuera}
          compacta
          columnas={columnasModal}
          filas={tipo === "bruto" ? filas : cuentan}
          clave={(f) => f.linea.idExpediente}
          textoExtra={(f) => f.linea.conceptos.map((c) => c.descripcion).join(" ")}
          placeholder="Buscar por cliente, modelo, marca, matrícula…"
          vacio="Todavía no hay coches que cuenten en este mes."
          pie={(fs) => ({ ...pieExtras(extrasModal, fs), cliente: `${fs.length} expediente${fs.length === 1 ? "" : "s"}`, puntos: puntos(fs.reduce((t, f) => t + f.linea.puntos, 0)), coche: euros(fs.reduce((t, f) => t + f.coche, 0)), financiacion: euros(fs.reduce((t, f) => t + f.financiacion, 0)), preference: euros(fs.reduce((t, f) => t + f.preference, 0)), bonus: euros(fs.reduce((t, f) => t + f.bonus, 0)), total: euros(fs.reduce((t, f) => t + f.linea.importe, 0)) })}
        />
      </>
    );
  }
  return (
    <Modal
      titulo={`${titulos[tipo]} · ${resultado.mes}`}
      ancho="min(96vw, 1500px)"
      pie={
        <button type="button" className="btn btn-secondary" onClick={alCerrar}>
          Cerrar
        </button>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>{contenido}</div>
    </Modal>
  );
}

/** Columnas del desglose con una columna más por cada concepto propio del plan, antes de «Bonus / reglas». */
const cacheColumnas = new Map<string, ColumnaTabla<FilaDesglose>[]>();
function columnasDesgloseDe(extras: string[], modal = false): ColumnaTabla<FilaDesglose>[] {
  // Mismo arreglo mientras no cambien los conceptos propios: la tabla no recalcula sus columnas en cada pintado
  const clave = `${modal ? "m" : "t"}|${extras.join("|")}`;
  const guardado = cacheColumnas.get(clave);
  if (guardado) return guardado;
  const columnas = construirColumnas(extras).map((c) => (modal && c.clave === "matriculacion" ? { ...c, oculta: true } : c));
  cacheColumnas.set(clave, columnas);
  return columnas;
}

function construirColumnas(extras: string[]): ColumnaTabla<FilaDesglose>[] {
  if (extras.length === 0) return columnasBase;
  const i = columnasBase.findIndex((c) => c.clave === "bonus");
  const propias: ColumnaTabla<FilaDesglose>[] = extras.map((n) => ({ clave: `extra:${n}`, etiqueta: n, valor: (f) => f.extras[n] ?? 0, celda: (f) => centimos(f.extras[n] ?? 0), alinear: "right", ayuda: `Concepto propio del plan: ${n}` }));
  return [...columnasBase.slice(0, i), ...propias, ...columnasBase.slice(i)];
}

/** Totales de las columnas de conceptos propios para la fila del pie. */
const pieExtras = (extras: string[], fs: FilaDesglose[]): Record<string, string> => Object.fromEntries(extras.map((n) => [`extra:${n}`, euros(fs.reduce((t, f) => t + (f.extras[n] ?? 0), 0))]));

interface PropsFichaTasa {
  titulo: string;
  numerador: number;
  denominador: number;
  objetivo: number | null;
  tipoTasa: "porcentaje" | "unidades";
  cumplida: boolean;
  nota?: ReactNode;
  ayuda: string;
  alAbrir: () => void;
}

/** Una tasa de intervención financiera de un vistazo: porcentaje, fracción, barra con la marca del objetivo y si se cumple. */
function FichaTasa({ titulo, numerador, denominador, objetivo, tipoTasa, cumplida, nota, ayuda, alAbrir }: PropsFichaTasa) {
  const sinCoches = denominador === 0;
  const pct = sinCoches ? 0 : (numerador * 100) / denominador;
  const color = sinCoches ? "var(--text-muted)" : objetivo === null ? "var(--text-primary)" : cumplida ? "var(--success)" : "var(--warning)";
  const marcaObjetivo = objetivo !== null && tipoTasa === "porcentaje" ? Math.min(100, objetivo) : null;
  return (
    <div
      role="button"
      tabIndex={0}
      title={`${ayuda} (pulsa para ver el detalle)`}
      onClick={alAbrir}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), alAbrir())}
      style={{ border: `1px solid ${sinCoches || objetivo === null ? "var(--border-light)" : cumplida ? "var(--success)" : "var(--warning)"}`, borderRadius: "var(--radius-sm)", padding: "8px 10px", display: "flex", flexDirection: "column", gap: "4px", cursor: "pointer", minWidth: 0, background: "rgba(255, 255, 255, 0.02)" }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "6px" }}>
        <span style={{ fontSize: "0.7rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{titulo}</span>
        {!sinCoches && objetivo !== null && <span style={{ fontSize: "0.8rem", color }}>{cumplida ? "✔" : "✘"}</span>}
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: "8px", flexWrap: "wrap" }}>
        <span style={{ fontSize: "1.25rem", fontWeight: 800, color, lineHeight: 1.1 }}>{sinCoches ? "—" : `${pct.toFixed(1).replace(".", ",")} %`}</span>
        <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>{sinCoches ? "sin coches" : `${numerador} de ${denominador}`}</span>
      </div>
      <div style={{ position: "relative", height: "6px", borderRadius: "999px", background: "var(--border-light)", overflow: "visible" }}>
        <div style={{ width: `${Math.min(100, pct)}%`, height: "100%", borderRadius: "999px", background: color }} />
        {marcaObjetivo !== null && <div title={`Objetivo ${objetivo} %`} style={{ position: "absolute", left: `${marcaObjetivo}%`, top: "-3px", width: "2px", height: "12px", background: "var(--text-primary)" }} />}
      </div>
      <span style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>{objetivo === null ? "Sin objetivo (se da por cumplida)" : tipoTasa === "porcentaje" ? `Objetivo: ${objetivo} %` : `Objetivo: ${objetivo} ${objetivo === 1 ? "unidad" : "unidades"}`}</span>
      {nota ?? <span aria-hidden="true" style={{ minHeight: "1.3em" }} />}
    </div>
  );
}

function TarjetaComision({ clave, titulo, mesTexto, pagoTexto, resultado, cargado, porId, pagoAyuda, fueraDeMes }: TarjetaProps) {
  const [desgloseGuardado, guardarDesglose] = usePreferencia(`desglose-${clave}`);
  const abierta = desgloseGuardado === "abierto";
  const [detalle, setDetalle] = useState<TipoDetalle | null>(null);
  const setAbierta = (v: boolean) => guardarDesglose(v ? "abierto" : "cerrado");
  const hayPlan = resultado !== null && resultado.idPlan !== null;
  const lineas = hayPlan ? resultado.lineas.filter((l) => l.importe !== 0 || l.cuenta) : [];
  const finFuera = new Map((hayPlan ? resultado.financiacionesFueraDeMes : []).map((f) => [f.idExpediente, f]));
  const filasDesglose: FilaDesglose[] = lineas.map((linea) => {
    const suma = (...ids: string[]) => linea.conceptos.filter((c) => ids.includes(c.concepto)).reduce((t, c) => t + c.importe, 0);
    return { linea, e: porId.get(linea.idExpediente), info: resultado?.expedientes?.[String(linea.idExpediente)], coche: suma("coche_vn", "vo"), financiacion: suma("financiacion"), preference: suma("preference"), bonus: suma("regla", "especial"), extras: extrasDe(linea), fuera: finFuera.get(linea.idExpediente) };
  });
  const fueraLista = [...finFuera.values()];
  const entraG = (f: FinanciacionFueraDeMes) => f.clase === "VN" || (hayPlan && resultado.tasaIncluyeVo);
  const adelantadasG = fueraLista.filter((f) => f.tipo === "adelantada" && entraG(f)).length;
  const anterioresG = fueraLista.filter((f) => f.tipo === "anterior" && entraG(f)).length;
  const adelantadasV = fueraLista.filter((f) => f.tipo === "adelantada" && f.clase === "VO").length;
  const anterioresV = fueraLista.filter((f) => f.tipo === "anterior" && f.clase === "VO").length;
  // Financiaciones adelantadas sin importe: el coche no cuenta este mes y no tiene línea, pero hay que verlo para validar la tasa
  for (const f of finFuera.values()) {
    if (f.tipo !== "adelantada" || filasDesglose.some((x) => x.linea.idExpediente === f.idExpediente)) continue;
    const e = porId.get(f.idExpediente);
    filasDesglose.push({ linea: { idExpediente: f.idExpediente, clase: e?.estadoVehiculo?.clase === "VO" ? "VO" : "VN", mesComputo: f.mesComputo, cuenta: false, unidades: 0, puntos: 0, importe: 0, conceptos: [] }, e, info: resultado?.expedientes?.[String(f.idExpediente)], coche: 0, financiacion: 0, preference: 0, bonus: 0, extras: {}, fuera: f });
  }
  // Tasa de intervención financiera del mes: global (todos los coches nuevos), por marca y de usados
  const tasas = hayPlan ? resultado.tasaIntervencion : [];
  const tasaG = hayPlan ? resultado.tasaGlobal : null;
  const tasaV = hayPlan ? resultado.tasaVo : null;
  const nombreMarca = (id: number) => [...porId.values()].find((e) => e.modelo?.marca?.id_marca === id)?.modelo?.marca?.nombre ?? `Marca ${id}`;
  const efP = efectoPuntos(hayPlan ? resultado.puntosMes : null, hayPlan ? resultado.objetivoX : null);
  const extrasTarjeta = nombresExtras(filasDesglose);
  const columnasTarjeta = columnasDesgloseDe(extrasTarjeta);
  const efT = efectoTramo(hayPlan ? resultado.tramo : null);
  return (
    <div className="glass-panel" style={{ padding: "18px", display: "flex", flexDirection: "column", gap: "8px", ...(fueraDeMes ? { border: "1px solid transparent", outline: "2px dashed var(--warning)", outlineOffset: "-3px" } : {}) }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "10px", flexWrap: "wrap" }}>
        <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)", fontWeight: 600, textTransform: "uppercase" }}>{titulo}</span>
        <span style={{ fontSize: "0.95rem", fontWeight: 700 }}>{mesTexto}</span>
      </div>
      {hayPlan ? (
        <>
          <div style={{ display: "flex", gap: "18px", alignItems: "stretch", flexWrap: "wrap" }}>
            <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", flex: "0 0 150px", minWidth: 0 }}>
              <span style={{ fontSize: "0.72rem", color: "var(--text-secondary)", fontWeight: 600, textTransform: "uppercase" }}>Neto a cobrar</span>
              <h3 role="button" tabIndex={0} title="Pulsa para ver cómo sale el neto" onClick={() => setDetalle("neto")} style={{ fontSize: "clamp(1.5rem, 3vw, 2.1rem)", overflowWrap: "anywhere", margin: 0, color: "var(--success)", fontWeight: "bold", lineHeight: 1.1, cursor: "pointer" }}>{!cargado ? "…" : euros(resultado.neto)}</h3>
              <span title={pagoAyuda} style={{ fontSize: "0.75rem", color: "var(--text-secondary)", whiteSpace: "nowrap" }}>💶 {pagoTexto}</span>
            </div>
            <div style={{ flex: 1, minWidth: "260px", display: "flex", flexDirection: "column", gap: "8px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: "8px" }}>
                <Indicador etiqueta="Puntos" alAbrir={() => setDetalle("puntos")} ayuda={efP.titulo || "Puntos del mes"}>
                  <span className={efP.className} style={efP.style}>{puntos(resultado.puntosMes)}</span>
                  <span style={{ fontSize: "0.72rem", color: "var(--text-secondary)", fontWeight: 400 }}> / {puntos(resultado.objetivoX)}</span>
                </Indicador>
                <Indicador etiqueta="Tramo" alAbrir={() => setDetalle("tramo")} ayuda={efT.titulo || "Tramo del mes"}>
                  <span className={efT.className} style={efT.style}>{etiquetaTramo(resultado.tramo)}</span>
                </Indicador>
                <Indicador etiqueta="Objetivo X" alAbrir={() => setDetalle("objetivo")} ayuda="Puntos que marcan el tramo X de este mes">
                  {puntos(resultado.objetivoX)}
                </Indicador>
                <Indicador etiqueta="Coches" alAbrir={() => setDetalle("coches")} ayuda="Expedientes que cuentan en este mes">
                  {resultado.lineas.filter((l) => l.cuenta).length}
                </Indicador>
                <Indicador etiqueta="Bruto" alAbrir={() => setDetalle("bruto")} ayuda="Comisión antes de penalizaciones">
                  {euros(resultado.bruto)}
                </Indicador>
                <Indicador etiqueta="Penalización" alAbrir={() => setDetalle("penalizacion")} ayuda="Penalizaciones descontadas del bruto">
                  <span style={{ color: resultado.penalizacion > 0 ? "var(--danger)" : "var(--text-muted)" }}>{resultado.penalizacion > 0 ? `−${euros(resultado.penalizacion)}` : "—"}</span>
                </Indicador>
              </div>
              {tasaG && (
                <div style={{ border: "1px solid var(--border-light)", borderRadius: "var(--radius-sm)", padding: "8px 10px", display: "flex", flexDirection: "column", gap: "6px" }}>
                  <span style={{ fontSize: "0.68rem", color: "var(--text-secondary)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>Tasa de intervención financiera</span>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "8px" }}>
                    <FichaTasa titulo={resultado.tasaIncluyeVo ? "Global (nuevos y usados)" : "Global (nuevos)"} numerador={tasaG.numerador} denominador={tasaG.denominador} objetivo={tasaG.objetivo} tipoTasa={tasaG.tipoTasa} cumplida={tasaG.cumplida} ayuda="Coches financiados entre los que cuentan este mes" alAbrir={() => setDetalle("tasa")} nota={<NotaFueraDeMes numerador={tasaG.numerador} adelantadas={adelantadasG} anteriores={anterioresG} />} />
                    {tasas.map((x) => (
                      <FichaTasa key={x.idMarca} titulo={nombreMarca(x.idMarca)} numerador={x.numerador} denominador={x.denominador} objetivo={x.objetivo} tipoTasa={x.tipoTasa} cumplida={x.cumplida} ayuda={`Tasa de la marca ${nombreMarca(x.idMarca)}`} alAbrir={() => setDetalle("tasa")} />
                    ))}
                    {tasaV && tasaV.denominador > 0 && <FichaTasa titulo="Usados (VO)" numerador={tasaV.numerador} denominador={tasaV.denominador} objetivo={tasaV.objetivo} tipoTasa={tasaV.tipoTasa} cumplida={tasaV.cumplida} ayuda="Usados financiados entre los que cuentan este mes" alAbrir={() => setDetalle("tasaVo")} nota={<NotaFueraDeMes numerador={tasaV.numerador} adelantadas={adelantadasV} anteriores={anterioresV} />} />}
                  </div>
                </div>
              )}
            </div>
          </div>
          {detalle && <DetalleIndicador tipo={detalle} resultado={resultado} filas={filasDesglose} porId={porId} nombreMarca={nombreMarca} alCerrar={() => setDetalle(null)} />}
          <button type="button" className="btn btn-secondary" onClick={() => setAbierta(!abierta)} style={{ padding: "6px 10px", fontSize: "0.8rem", alignSelf: "flex-start" }}>
            {abierta ? "Ocultar desglose" : `Ver desglose (${lineas.length})`}
          </button>
          {abierta && (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px", borderTop: "1px solid var(--border-light)", paddingTop: "10px" }}>
              <TablaDatos<FilaDesglose>
                id="desglose-comisiones"
                columnas={columnasTarjeta}
                compacta
                claseFila={claseFinanciacionFuera}
                filas={filasDesglose}
                clave={(f) => f.linea.idExpediente}
                textoExtra={(f) => f.linea.conceptos.map((c) => c.descripcion).join(" ")}
                placeholder="Buscar por cliente, modelo, marca, matrícula, concepto…"
                vacio="Todavía no hay coches que cuenten en este mes."
                pie={(fs) => ({
                  ...pieExtras(extrasTarjeta, fs),
                  cliente: `${fs.length} expediente${fs.length === 1 ? "" : "s"}`,
                  coche: euros(fs.reduce((t, f) => t + f.coche, 0)),
                  financiacion: euros(fs.reduce((t, f) => t + f.financiacion, 0)),
                  preference: euros(fs.reduce((t, f) => t + f.preference, 0)),
                  bonus: euros(fs.reduce((t, f) => t + f.bonus, 0)),
                  total: euros(fs.reduce((t, f) => t + f.linea.importe, 0)),
                })}
              />
              {finFuera.size > 0 && (
                <p style={{ margin: 0, fontSize: "0.8rem", color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: "10px" }}>
                  <span aria-hidden="true" style={{ ...capsulaAviso, flex: "0 0 auto", width: "44px", height: "16px" }} />
                  <span>
                    Fila con la financiación en otro mes: {[...finFuera.values()].filter((f) => f.tipo === "adelantada").length} adelantada(s) y {[...finFuera.values()].filter((f) => f.tipo === "anterior").length} contratada(s) el mes anterior. Pasa el ratón por la columna «Cuenta» para ver el detalle.
                  </span>
                </p>
              )}
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
  // El cuadro del mes anterior se puede ocultar para dar todo el ancho al mes elegido; queda guardado hasta que se vuelva a mostrar
  const [anteriorGuardado, guardarAnterior] = usePreferencia("panel-comisiones-anterior");
  const verAnterior = esMesActual && anteriorGuardado !== "oculto";
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
        <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
          {abierto && esMesActual && (
            <button type="button" onClick={() => guardarAnterior(verAnterior ? "oculto" : "visible")} className="btn btn-secondary" style={{ padding: "3px 10px", fontSize: "0.8rem" }} title={verAnterior ? "Oculta el cuadro del mes anterior para ver más grande el del mes elegido. Queda guardado hasta que lo vuelvas a mostrar." : "Vuelve a mostrar el cuadro del mes anterior (el que se cobra ahora)"}>
              {verAnterior ? "Ocultar mes anterior" : "Mostrar mes anterior"}
            </button>
          )}
          <BotonPlegar abierto={abierto} alternar={alternar} titulo="Comisiones" />
        </div>
      </div>
      {abierto && <div style={{ display: "grid", gridTemplateColumns: verAnterior ? "repeat(auto-fit, minmax(min(420px, 100%), 1fr))" : "1fr", gap: "16px" }}>
        {verAnterior && <TarjetaComision
          clave="anterior"
          titulo="Mes anterior (se cobra ahora)"
          mesTexto={etiquetaMes(previoReal.anio, previoReal.mes)}
          pagoTexto={`Nómina ${etiquetaMesCorta(pagoAnterior.anio, pagoAnterior.mes)}`}
          pagoAyuda={`Se cobra en la nómina de ${etiquetaMes(pagoAnterior.anio, pagoAnterior.mes)}`}
          resultado={anterior ?? null}
          cargado={anterior !== undefined}
          porId={porId}
        />}
        <TarjetaComision
          clave="elegido"
          titulo={esMesActual ? "Mes elegido (llevas generado)" : "Mes elegido (no es el mes actual)"}
          mesTexto={etiquetaMes(anio, mes)}
          pagoTexto={`Nómina ${etiquetaMesCorta(pago.anio, pago.mes)}`}
          pagoAyuda={`Se cobrará en la nómina de ${etiquetaMes(pago.anio, pago.mes)}`}
          resultado={elegido ?? null}
          cargado={elegido !== undefined}
          porId={porId}
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
  ...columnasVehiculo<ExpedienteDto>((e) => datosVehiculoDeExpediente(e), { punto: true }),
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
