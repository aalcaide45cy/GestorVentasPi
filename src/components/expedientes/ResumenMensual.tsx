"use client";

import Link from "next/link";
import { useMemo, type KeyboardEvent } from "react";
import { usePreferencia } from "@/lib/preferencias";
import { useCarga } from "@/components/comisiones/useCarga";
import TablaDatos, { type ColumnaTabla } from "@/components/TablaDatos";
import type { ExpedienteDto } from "@/lib/dto";
import { efectoPuntos, efectoTramo } from "@/lib/efectos-tramo";
import { etiquetaTramo, euros, puntos } from "@/lib/formato";
import type { ResultadoMes } from "@/lib/comisiones";
import { columnasVehiculo } from "../etiquetas";
import { TextoCopiable, datosVehiculoDeExpediente } from "./comun";
import { BotonPlegar, PanelCartera, PanelComisiones, firmaExpedientes, usePlegable } from "./ComisionesYCartera";

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

const fechaCorta = (f: string | null) => (f ? f.split("-").reverse().join("/") : "—");

/** Columnas de la lista que se abre al pulsar una tarjeta del resumen: las mismas de las demás tablas de coches (colores de marca y tipo). */
const columnasListaResumen: ColumnaTabla<ExpedienteDto>[] = [
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
  { clave: "comercial", etiqueta: "Comercial", valor: (e) => e.usuario?.nombre ?? "", celda: (e) => e.usuario?.nombre ?? "—" },
  { clave: "pedido", etiqueta: "F. pedido", valor: (e) => e.fecha_expediente ?? "", celda: (e) => fechaCorta(e.fecha_expediente) },
  { clave: "afectacion", etiqueta: "F. afectación", valor: (e) => e.fecha_afectacion ?? "", celda: (e) => fechaCorta(e.fecha_afectacion), oculta: true },
  { clave: "matriculacion", etiqueta: "F. matriculación", valor: (e) => e.fecha_matriculacion ?? "", celda: (e) => fechaCorta(e.fecha_matriculacion), oculta: true },
];

interface Props {
  expedientes: ExpedienteDto[];
  anios: number[];
  /** Vendedor elegido en el filtro de la lista (nombre); vacío = todos. Las cifras y las comisiones son las suyas. */
  vendedor: string;
  esAdministrador: boolean;
  /** Oculta el panel de cartera (pedidos del mes), por ejemplo en Cotejo de pagos. */
  sinCartera?: boolean;
}

const enMes = (fecha: string | null, anio: number, mes: number) => {
  if (!fecha) return false;
  const [a, m] = fecha.split("-");
  return Number(a) === anio && Number(m) === mes;
};

const estiloTarjeta = { padding: "16px", display: "flex", flexDirection: "column", justifyContent: "space-between" } as const;
const estiloEtiqueta = { fontSize: "0.8rem", color: "var(--text-secondary)", fontWeight: 600 } as const;
const estiloPie = { display: "flex", justifyContent: "space-between", fontSize: "0.75rem", color: "var(--text-secondary)" } as const;

/** Año y mes recordados («AAAA-MM»); si no hay o no valen, el mes actual. */
function mesGuardado(guardado: string | null, hoy: Date): { anio: number; mes: number } {
  const partes = (guardado ?? "").split("-");
  const a = Number(partes[0]);
  const m = Number(partes[1]);
  return partes.length === 2 && a > 1900 && a < 3000 && m >= 1 && m <= 12 ? { anio: a, mes: m } : { anio: hoy.getFullYear(), mes: hoy.getMonth() + 1 };
}

/**
 * «Detalle y Resumen Estadístico»: recuentos del mes elegido.
 * Puntos, tramo y comisión estimada salen del motor de comisiones (el mismo que la liquidación).
 */
export default function ResumenMensual({ expedientes: todos, anios, vendedor, esAdministrador, sinCartera }: Props) {
  const hoy = new Date();
  // El mes elegido se recuerda en este navegador: al volver de otra pantalla sigue el último que se puso
  const [guardado, guardarMes] = usePreferencia("exp-resumen-mes");
  const { anio, mes } = mesGuardado(guardado, hoy);
  const fijarMes = (a: number, m: number) => guardarMes(`${a}-${String(m).padStart(2, "0")}`);
  const setMes = (m: number) => fijarMes(anio, m);
  const setAnio = (a: number) => fijarMes(a, mes);

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
    fijarMes(a, m);
  };

  // Las estadísticas y las comisiones son del vendedor elegido en el filtro (por defecto, el usuario actual)
  const expedientes = useMemo(() => {
    const nombre = vendedor.toLowerCase().trim();
    return nombre ? todos.filter((e) => (e.usuario?.nombre?.toLowerCase().trim() ?? "") === nombre) : todos;
  }, [todos, vendedor]);
  // Solo el administrador puede ver las comisiones de otra persona; el resto siempre ve las suyas
  const idVendedor = esAdministrador ? expedientes.find((e) => e.usuario !== null)?.usuario?.id_usuario : undefined;
  const usuarioQ = vendedor && idVendedor ? `&usuario=${idVendedor}` : "";
  const firma = useMemo(() => firmaExpedientes(expedientes), [expedientes]);

  const mesIso = `${anio}-${String(mes).padStart(2, "0")}`;
  const { datos: motor } = useCarga<ResultadoMes | null>(`/api/comisiones/mes?mes=${mesIso}${usuarioQ}&v=${firma}`, null);
  const m = motor !== null && motor.idPlan !== null ? motor : null;

  const r = useMemo(() => {
    const listas: Record<string, ExpedienteDto[]> = { afectados: [], matriculados: [], financiados: [], pedidos: [] };
    const total = { afectados: 0, matriculados: 0, mContado: 0, mCredito: 0, mPref: 0, vn: 0, vnFinanciados: 0, pedidos: 0, pContado: 0, pCredito: 0, pPref: 0 };
    for (const e of expedientes) {
      const categoria = e.tipoDeVenta?.categoria ?? "";
      const esContado = categoria === "CONTADO";
      const esPref = categoria === "PREFERENCE";
      const esCredito = categoria === "CREDITO" || categoria === "RENTING";
      const estado = e.estadoVehiculo?.nombre_estado_vehiculo?.toLowerCase() ?? "";
      // Nuevo o usado lo decide la clase del estado (Configuración › Estados): demo, KM0, buyback… son usados
      const esVn = e.estadoVehiculo ? e.estadoVehiculo.clase === "VN" : estado === "nuevo";
      const fechaMat = e.cobrado_otra_fecha && e.fecha_cobrado ? e.fecha_cobrado : e.fecha_matriculacion;

      if (enMes(fechaMat, anio, mes)) {
        total.matriculados++;
        listas.matriculados.push(e);
        if (esContado) total.mContado++;
        else if (esCredito) total.mCredito++;
        else if (esPref) total.mPref++;
        if (esVn) total.vn++;
      }
      if (esVn && (esCredito || esPref) && enMes(e.fecha_rci, anio, mes)) {
        total.vnFinanciados++;
        listas.financiados.push(e);
      }
      if (enMes(e.fecha_afectacion, anio, mes)) {
        total.afectados++;
        listas.afectados.push(e);
      }
      if (enMes(e.fecha_expediente, anio, mes)) {
        total.pedidos++;
        listas.pedidos.push(e);
        if (esContado) total.pContado++;
        else if (esCredito) total.pCredito++;
        else if (esPref) total.pPref++;
      }
    }
    return { ...total, listas };
  }, [expedientes, anio, mes]);

  const { abierto: panelAbierto, alternar: alternarPanel } = usePlegable("resumen");
  // La tarjeta de detalle abierta se recuerda en este navegador
  const [abiertoGuardado, guardarAbierto] = usePreferencia("exp-resumen-detalle");
  const abierto = abiertoGuardado === "" ? null : abiertoGuardado;
  const alternar = (clave: string) => guardarAbierto(abierto === clave ? "" : clave);

  const tarjeta = (clave: string) => ({
    style: { ...estiloTarjeta, outline: abierto === clave ? "2px solid var(--primary)" : "none" },
    role: "button" as const,
    tabIndex: 0,
    "aria-expanded": abierto === clave,
    title: "Pulsa para ver más datos",
    onClick: () => alternar(clave),
    onKeyDown: (ev: KeyboardEvent<HTMLDivElement>) => {
      if (ev.key === "Enter" || ev.key === " ") {
        ev.preventDefault();
        alternar(clave);
      }
    },
  });

  const TITULOS: Record<string, string> = {
    afectados: "Expedientes afectados en el mes",
    matriculados: "Expedientes matriculados en el mes",
    financiados: "VN financiados (fecha RCI en el mes)",
    pedidos: "Pedidos del mes (contado, crédito y preference)",
  };
  const lista = abierto ? r.listas[abierto] : undefined;
  const detalleMotor = abierto === "puntos" || abierto === "tramo" || abierto === "comision";

  const esMesActual = anio === hoy.getFullYear() && mes === hoy.getMonth() + 1;
  const efPuntos = efectoPuntos(m?.puntosMes, m?.objetivoX);
  const efTramo = efectoTramo(m?.tramo);
  const listaAnios = anios.includes(anio) ? anios : [anio, ...anios].sort((a, b) => b - a);
  const botonMes = { padding: "3px 10px", fontSize: "0.8rem", whiteSpace: "nowrap" } as const;

  return (
    <>
    <div className="glass-panel" style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: "10px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
        <div>
          <h4 style={{ fontSize: "1rem", fontWeight: "bold", margin: 0 }}>📊 Detalle y Resumen Estadístico</h4>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.8rem", margin: "2px 0 0 0" }}>Estadísticas de ventas para el período seleccionado.</p>
          <div style={{ marginTop: "6px", display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
            {esMesActual ? (
              <span style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--success)", border: "1px solid var(--success)", borderRadius: "999px", padding: "2px 10px" }} title="Estás viendo el mes en curso">
                📅 {MESES[mes - 1]} {anio} · mes actual
              </span>
            ) : (
              <>
                <span style={{ fontSize: "0.82rem", fontWeight: 800, color: "#1a1a1a", background: "var(--warning)", borderRadius: "999px", padding: "3px 12px" }} title={`Los datos de abajo son de ${MESES[mes - 1]} ${anio}, no del mes en curso`}>
                  ⚠️ Estás viendo otro mes: {MESES[mes - 1]} {anio}
                </span>
                <button type="button" className="btn btn-secondary" style={{ padding: "2px 10px", fontSize: "0.75rem" }} onClick={() => fijarMes(hoy.getFullYear(), hoy.getMonth() + 1)} title={`Vuelve a ${MESES[hoy.getMonth()]} ${hoy.getFullYear()}, el mes en curso`}>
                  Volver a {MESES[hoy.getMonth()]} {hoy.getFullYear()}
                </button>
              </>
            )}
          </div>
        </div>
        <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
          <button type="button" className="btn btn-secondary" onClick={() => mover(-1)} style={botonMes}>
            ⬅ Mes Anterior
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => {
              fijarMes(hoy.getFullYear(), hoy.getMonth() + 1);
            }}
            style={botonMes}
          >
            Mes Actual
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => mover(1)} style={botonMes}>
            Mes Siguiente ➡
          </button>
          <select className="form-select" value={mes} onChange={(e) => setMes(Number(e.target.value))} style={{ padding: "3px 8px", fontSize: "0.8rem", width: "auto", minWidth: "110px" }}>
            {MESES.map((nombre, i) => (
              <option key={nombre} value={i + 1}>
                {nombre}
              </option>
            ))}
          </select>
          <select className="form-select" value={anio} onChange={(e) => setAnio(Number(e.target.value))} style={{ padding: "3px 8px", fontSize: "0.8rem", width: "auto", minWidth: "80px" }}>
            {listaAnios.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
          <BotonPlegar abierto={panelAbierto} alternar={alternarPanel} titulo="Detalle y Resumen Estadístico" />
        </div>
      </div>

      {panelAbierto && <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "15px", ...(esMesActual ? {} : { outline: "2px dashed var(--warning)", outlineOffset: "6px", borderRadius: "var(--radius-md)" }) }}>
        <div className="glass-panel-interactive" {...tarjeta("afectados")}>
          <span style={estiloEtiqueta}>AFECTADOS EN EL MES</span>
          <h3 style={{ fontSize: "1.85rem", margin: "8px 0", color: "var(--primary)", fontWeight: "bold" }}>{r.afectados}</h3>
          <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>Total de afectaciones en el mes</span>
        </div>
        <div className="glass-panel-interactive" {...tarjeta("matriculados")}>
          <span style={estiloEtiqueta}>MATRICULADOS EN EL MES</span>
          <h3 style={{ fontSize: "1.85rem", margin: "8px 0", color: "var(--success)", fontWeight: "bold" }}>{r.matriculados}</h3>
          <div style={estiloPie}>
            <span>Contado {r.mContado} · Crédito {r.mCredito} · Preference {r.mPref}</span>
          </div>
        </div>
        <div className="glass-panel-interactive" {...tarjeta("financiados")}>
          <span style={estiloEtiqueta}>TASA INT. FINANCIERA</span>
          <h3 style={{ fontSize: "1.85rem", margin: "8px 0", color: m && m.tasaGlobal.conObjetivo ? (m.tasaGlobal.cumplida ? "var(--success)" : "var(--warning)") : "var(--secondary)", fontWeight: "bold" }}>
            {m ? (m.tasaGlobal.porcentaje !== null ? `${m.tasaGlobal.porcentaje.toFixed(1)}%` : "—") : r.vn > 0 ? `${((r.vnFinanciados / r.vn) * 100).toFixed(1)}%` : "0.0%"}
          </h3>
          <div style={estiloPie}>
            <span>{m ? "Global (todos los nuevos):" : "VN Finan/Total:"}</span>
            <strong>
              {m ? `${m.tasaGlobal.numerador}/${m.tasaGlobal.denominador}${m.tasaGlobal.conObjetivo ? (m.tasaGlobal.cumplida ? " ✔" : " ✘") : ""}` : `${r.vnFinanciados}/${r.vn}`}
            </strong>
          </div>
          {m && m.tasaIntervencion.length > 0 && (
            <div style={{ ...estiloPie, flexDirection: "column", alignItems: "stretch", gap: "2px", marginTop: "4px" }}>
              {m.tasaIntervencion.map((t) => (
                <span key={t.idMarca} style={{ display: "flex", justifyContent: "space-between", gap: "8px" }}>
                  <span>{expedientes.find((e) => e.modelo?.marca?.id_marca === t.idMarca)?.modelo?.marca?.nombre ?? `Marca ${t.idMarca}`}:</span>
                  <strong>
                    {t.numerador}/{t.denominador}
                    {t.porcentaje !== null ? ` (${t.porcentaje.toFixed(1)}%)` : ""} {t.cumplida ? "✔" : "✘"}
                  </strong>
                </span>
              ))}
            </div>
          )}
        </div>
        {m && (
          <div className="glass-panel-interactive" style={estiloTarjeta}>
            <span style={estiloEtiqueta}>TASA INT. FINANCIERA USADOS</span>
            <h3 style={{ fontSize: "1.85rem", margin: "8px 0", color: m.tasaVo.conObjetivo ? (m.tasaVo.cumplida ? "var(--success)" : "var(--warning)") : "var(--secondary)", fontWeight: "bold" }}>
              {m.tasaVo.porcentaje !== null ? `${m.tasaVo.porcentaje.toFixed(1)}%` : "—"}
            </h3>
            <div style={estiloPie}>
              <span>VO Finan/Total:</span>
              <strong>
                {m.tasaVo.numerador}/{m.tasaVo.denominador}
                {m.tasaVo.conObjetivo ? (m.tasaVo.cumplida ? " ✔" : " ✘") : ""}
              </strong>
            </div>
          </div>
        )}
        <div className="glass-panel-interactive" {...tarjeta("pedidos")}>
          <span style={estiloEtiqueta}>PEDIDOS EN EL MES</span>
          <h3 style={{ fontSize: "1.85rem", margin: "8px 0", color: "var(--warning)", fontWeight: "bold" }}>{r.pedidos}</h3>
          <div style={estiloPie}>
            <span>Contado {r.pContado} · Crédito {r.pCredito} · Preference {r.pPref}</span>
          </div>
        </div>
        <div className="glass-panel-interactive" {...tarjeta("puntos")}>
          <span style={estiloEtiqueta}>PUNTOS / OBJETIVO</span>
          <h3 style={{ fontSize: "1.85rem", margin: "8px 0", color: "var(--primary)", fontWeight: "bold" }}>
            {m ? (
              <>
                <span className={efPuntos.className} style={efPuntos.style} title={efPuntos.titulo}>{puntos(m.puntosMes)}</span> / {puntos(m.objetivoX)}
              </>
            ) : (
              "—"
            )}
          </h3>
          <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>{m ? "Puntos del mes frente a tu objetivo X" : "No hay plan para este mes"}</span>
        </div>
        <div className="glass-panel-interactive" {...tarjeta("tramo")}>
          <span style={estiloEtiqueta}>TRAMO DEL MES</span>
          <h3 style={{ fontSize: "1.85rem", margin: "8px 0", color: "var(--secondary)", fontWeight: "bold" }}>
            {m ? <span className={efTramo.className} style={efTramo.style} title={efTramo.titulo}>{etiquetaTramo(m.tramo)}</span> : "—"}
          </h3>
          <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>Respecto a X, redondeo hacia abajo</span>
        </div>
        <div className="glass-panel-interactive" {...tarjeta("comision")}>
          <span style={estiloEtiqueta}>COMISIÓN ESTIMADA</span>
          <h3 style={{ fontSize: "1.85rem", margin: "8px 0", color: "var(--success)", fontWeight: "bold" }}>{m ? euros(m.neto) : "—"}</h3>
          <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>{m ? "Neta; se cobra en la nómina del mes siguiente" : "Sin plan de comisionamiento"}</span>
        </div>
      </div>}

      {panelAbierto && lista && (
        <div style={{ borderTop: "1px solid var(--border-light)", paddingTop: "16px" }}>
          <h5 style={{ margin: "0 0 10px 0", fontSize: "0.95rem" }}>
            {TITULOS[abierto ?? ""]} ({lista.length})
          </h5>
          <TablaDatos<ExpedienteDto>
            id={`resumen-${abierto ?? "lista"}`}
            columnas={columnasListaResumen}
            filas={lista}
            clave={(e) => e.id_expediente}
            compacta
            placeholder="Buscar por cliente, modelo, matrícula, tipo, comercial…"
            vacio="No hay expedientes en este período."
            pie={(fs) => ({ cliente: `${fs.length} expediente${fs.length === 1 ? "" : "s"}` })}
          />
        </div>
      )}

      {panelAbierto && detalleMotor && (
        <div style={{ borderTop: "1px solid var(--border-light)", paddingTop: "16px", fontSize: "0.9rem", display: "flex", flexDirection: "column", gap: "6px" }}>
          {m ? (
            <>
              <div>Puntos del mes: <strong>{puntos(m.puntosMes)}</strong> · Objetivo X: <strong>{puntos(m.objetivoX)}</strong> · Tramo: <strong>{etiquetaTramo(m.tramo)}</strong></div>
              <div>Comisión bruta: <strong>{euros(m.bruto)}</strong> · Penalización: <strong>{euros(m.penalizacion)}</strong> · Neta: <strong>{euros(m.neto)}</strong></div>
              <div>Expedientes que cuentan: <strong>{m.lineas.length}</strong></div>
              {m.avisos.map((a) => (
                <div key={a} style={{ color: "var(--warning)" }}>⚠ {a}</div>
              ))}
            </>
          ) : (
            <span style={{ color: "var(--text-secondary)" }}>No hay plan de comisionamiento para este mes.</span>
          )}
        </div>
      )}
    </div>
    <PanelComisiones anio={anio} mes={mes} expedientes={expedientes} usuario={vendedor && idVendedor ? idVendedor : undefined} />
    {!sinCartera && <PanelCartera anio={anio} mes={mes} expedientes={expedientes} />}
    </>
  );
}
