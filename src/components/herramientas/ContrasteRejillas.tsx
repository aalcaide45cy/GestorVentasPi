"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import CasillaAnulados, { CasillaDeshabilitados, useMostrarAnulados, useMostrarDeshabilitados } from "@/components/CasillaAnulados";
import { useCarga } from "@/components/comisiones/useCarga";
import TablaDatos, { type ColumnaTabla } from "@/components/TablaDatos";
import { columnasVehiculo } from "@/components/etiquetas";
import type { EstadoFilaRejilla, EstadoSinPagar, ExpedienteContrastado, FilaContraste, FilaSinPagar, ResultadoContraste } from "@/lib/contraste-rejillas";
import { formatDate } from "@/lib/date-utils";
import { euros, nombreMes } from "@/lib/formato";

type Filtro = "todo" | "coinciden" | "repetidas" | "otro_mes" | "sin_expediente" | "otro_vendedor" | "anulado" | "deshabilitado" | "sin_pagar" | "sin_rejilla";

const ASPECTO: Record<EstadoFilaRejilla, { borde: string; icono: string; texto: string }> = {
  coincide: { borde: "#22c55e", icono: "🟢", texto: "Coincide" },
  otro_mes: { borde: "#eab308", icono: "🟡", texto: "Pagado en otro mes" },
  sin_expediente: { borde: "#a855f7", icono: "🟣", texto: "Sin expediente" },
  otro_vendedor: { borde: "#f97316", icono: "🟠", texto: "Expediente de otro vendedor" },
  anulado: { borde: "#64748b", icono: "🚫", texto: "Expediente anulado" },
  deshabilitado: { borde: "#64748b", icono: "⏸", texto: "Expediente deshabilitado" },
};
const ASPECTO_SIN_PAGAR: Record<EstadoSinPagar, { borde: string; icono: string; texto: string }> = {
  no_pagado: { borde: "#ef4444", icono: "🔴", texto: "No figura en ninguna rejilla" },
  sin_fecha: { borde: "#94a3b8", icono: "⚪", texto: "Sin fecha para saber su mes" },
  sin_rejilla: { borde: "#94a3b8", icono: "⚪", texto: "Aún sin rejilla de su mes" },
};

const fecha = (v: string | null) => (v ? formatDate(v) : "—");
const vacio = <span style={{ color: "var(--text-muted)" }}>—</span>;
const datosVehiculo = (e: ExpedienteContrastado | null) => ({ clase: e ? (e.usado ? ("VO" as const) : ("VN" as const)) : null, marca: e?.marca, modelo: e?.modelo, estado: e?.estado, tipoPago: e?.tipoPago });
const enlaceExpediente = (e: ExpedienteContrastado) =>
  e.idExpediente ? (
    <Link href={`/dashboard/expedientes/editar/${e.idExpediente}`} target="_blank" style={{ fontWeight: 700, whiteSpace: "nowrap" }}>
      #EXP-{String(e.idExpediente).padStart(4, "0")}
    </Link>
  ) : (
    vacio
  );
const mesQueLeToca = (e: ExpedienteContrastado) => (e.mesesEsperados.length > 0 ? e.mesesEsperados.map(nombreMes).join(" / ") : "—");
const fechaClave = (e: ExpedienteContrastado) => (e.usado ? e.fAfectacion : e.fMatriculacion);

/**
 * «Contraste» (Herramientas): las matrículas que se han leído de las rejillas guardadas, agrupadas por rejilla y con su expediente en la misma línea,
 * para saber en qué mes se ha pagado cada coche. Avisa de las matrículas que salen en más de una rejilla y lista los expedientes que no han salido
 * en ninguna (los que quedan por cobrar). Solo lee: no cambia nada.
 */
export default function ContrasteRejillas({ vendedores, idUsuarioActual, esAdmin }: { vendedores: { id: number; nombre: string }[]; idUsuarioActual: number; esAdmin: boolean }) {
  const [vendedor, setVendedor] = useState<string>(esAdmin ? "todos" : String(idUsuarioActual));
  const { datos, recargar } = useCarga<ResultadoContraste | null>(`/api/contraste?usuario=${vendedor}`, null);
  const [filtro, setFiltro] = useState<Filtro>("todo");
  const [rejilla, setRejilla] = useState<string>("todas");
  const todos = vendedor === "todos";

  // Los expedientes anulados en el listado de la intranet no son ventas: salen ocultos (también en las cifras) salvo que se active la casilla
  const [mostrarAnulados, fijarMostrarAnulados] = useMostrarAnulados("contraste");
  const [mostrarDeshabilitados, fijarMostrarDeshabilitados] = useMostrarDeshabilitados("contraste");
  const nAnulados = (datos?.resumen.anulados ?? 0);
  const nDeshabilitados = (datos?.resumen.deshabilitados ?? 0);
  const filas = useMemo(() => (datos?.filas ?? []).filter((f) => (mostrarAnulados || f.estado !== "anulado") && (mostrarDeshabilitados || f.estado !== "deshabilitado")), [datos, mostrarAnulados, mostrarDeshabilitados]);
  const sinPagar = useMemo(() => (datos?.sinPagar ?? []).filter((s) => (mostrarAnulados || !s.expediente.anulado) && (mostrarDeshabilitados || !s.expediente.deshabilitado)), [datos, mostrarAnulados, mostrarDeshabilitados]);
  const rejillasLista = useMemo(() => {
    const m = new Map<number, string>();
    for (const f of filas) if (!m.has(f.idRejilla)) m.set(f.idRejilla, `${nombreMes(f.mes)}${todos ? ` · ${f.vendedorRejilla}` : ""}`);
    return [...m];
  }, [filas, todos]);

  const verSinPagar = filtro === "sin_pagar" || filtro === "sin_rejilla";
  const filasVisibles = useMemo(() => {
    let l = rejilla === "todas" ? filas : filas.filter((f) => String(f.idRejilla) === rejilla);
    if (filtro === "coinciden") l = l.filter((f) => f.estado === "coincide" && f.repetidaEn.length === 0);
    else if (filtro === "repetidas") l = l.filter((f) => f.repetidaEn.length > 0);
    else if (filtro === "otro_mes" || filtro === "sin_expediente" || filtro === "otro_vendedor" || filtro === "anulado" || filtro === "deshabilitado") l = l.filter((f) => f.estado === filtro);
    return l;
  }, [filas, filtro, rejilla]);
  const sinPagarVisibles = useMemo(() => sinPagar.filter((s) => (filtro === "sin_pagar" ? s.estado === "no_pagado" : s.estado !== "no_pagado")), [sinPagar, filtro]);

  const columnas: ColumnaTabla<FilaContraste>[] = [
    {
      clave: "rejilla",
      etiqueta: "Rejilla",
      valor: (f) => `${f.mes}|${f.vendedorRejilla}`,
      celda: (f) => (
        <div style={{ whiteSpace: "nowrap" }}>
          <b>{nombreMes(f.mes)}</b>
          {todos && <span style={{ color: "var(--text-secondary)", fontSize: "0.78rem" }}> · {f.vendedorRejilla}</span>}
        </div>
      ),
      ayuda: "Rejilla de la empresa en la que sale esta matrícula (el mes en que se paga)",
    },
    { clave: "matricula", etiqueta: "Matrícula", valor: (f) => f.matricula, celda: (f) => <b>{f.matricula}</b>, ayuda: "Matrícula leída de la rejilla" },
    {
      clave: "resultado",
      etiqueta: "Resultado",
      valor: (f) => ASPECTO[f.estado].texto,
      celda: (f) => (
        <div style={{ minWidth: "190px", whiteSpace: "normal" }}>
          <div style={{ fontWeight: 600, whiteSpace: "nowrap" }}>
            {ASPECTO[f.estado].icono} {ASPECTO[f.estado].texto}
          </div>
          <div style={{ color: "var(--text-secondary)", fontSize: "0.76rem", marginTop: "2px" }}>{f.motivo}</div>
        </div>
      ),
    },
    {
      clave: "repetida",
      etiqueta: "Repetida en",
      valor: (f) => f.repetidaEn.map((r) => r.mes).join(" "),
      celda: (f) =>
        f.repetidaEn.length === 0 ? (
          vacio
        ) : (
          <div style={{ whiteSpace: "normal", minWidth: "150px", color: "var(--warning)", fontWeight: 600, fontSize: "0.82rem" }}>
            🔁 {f.repetidaEn.map((r) => (r.mismaRejilla ? "otra vez en esta misma hoja" : `${nombreMes(r.mes)}${todos ? ` (${r.vendedor})` : ""}`)).join(", ")}
          </div>
        ),
      ayuda: "Otras rejillas en las que sale la misma matrícula: puede ser un pago repartido o un error de la empresa; revísalo",
    },
    { clave: "expediente", etiqueta: "Expediente", valor: (f) => f.expediente?.idExpediente ?? 0, celda: (f) => (f.expediente ? <>{enlaceExpediente(f.expediente)}{f.expedientesExtra > 0 && <span title="Hay más de un expediente con esta matrícula" style={{ color: "var(--warning)" }}> +{f.expedientesExtra}</span>}</> : vacio), ayuda: "Expediente de la aplicación con el que se contrasta la matrícula" },
    { clave: "cliente", etiqueta: "Cliente", valor: (f) => f.expediente?.cliente ?? "", celda: (f) => f.expediente?.cliente || vacio },
    ...columnasVehiculo<FilaContraste>((f) => datosVehiculo(f.expediente), { vacio }),
    { clave: "fechaClave", etiqueta: "F. matric. / afect.", valor: (f) => (f.expediente ? (fechaClave(f.expediente) ?? "") : ""), celda: (f) => (f.expediente ? fecha(fechaClave(f.expediente)) : "—"), ayuda: "Fecha de matriculación en los nuevos y de afectación en los usados" },
    { clave: "mesToca", etiqueta: "Mes que le tocaba", valor: (f) => f.expediente?.mesesEsperados.join(" ") ?? "", celda: (f) => (f.expediente ? mesQueLeToca(f.expediente) : "—"), ayuda: "Mes en que el coche debía cobrarse según sus fechas" },
    { clave: "importe", etiqueta: "Importe hoja", valor: (f) => f.importe ?? 0, celda: (f) => (f.importe === null ? vacio : euros(f.importe)), alinear: "right", ayuda: "Importe que trae la hoja de esa matrícula, si lo trae", oculta: true },
    { clave: "vendedorExp", etiqueta: "Vendedor (expediente)", valor: (f) => f.expediente?.vendedor ?? "", celda: (f) => f.expediente?.vendedor || vacio, oculta: !todos },
    { clave: "lectura", etiqueta: "Lectura", valor: (f) => (f.lecturaConfirmada ? "Confirmada" : "Sin revisar"), celda: (f) => (f.lecturaConfirmada ? "✔ Confirmada" : <span style={{ color: "var(--text-muted)" }}>Sin revisar</span>), oculta: true, ayuda: "Si alguien ha confirmado que la matrícula está bien leída de la hoja" },
    { clave: "archivo", etiqueta: "Archivo", valor: (f) => f.archivo ?? "", celda: (f) => f.archivo || vacio, oculta: true },
  ];

  const columnasSinPagar: ColumnaTabla<FilaSinPagar>[] = [
    {
      clave: "resultado",
      etiqueta: "Resultado",
      valor: (f) => ASPECTO_SIN_PAGAR[f.estado].texto,
      celda: (f) => (
        <div style={{ minWidth: "200px", whiteSpace: "normal" }}>
          <div style={{ fontWeight: 600, whiteSpace: "nowrap" }}>
            {ASPECTO_SIN_PAGAR[f.estado].icono} {ASPECTO_SIN_PAGAR[f.estado].texto}
          </div>
          <div style={{ color: "var(--text-secondary)", fontSize: "0.76rem", marginTop: "2px" }}>{f.motivo}</div>
        </div>
      ),
    },
    { clave: "matricula", etiqueta: "Matrícula", valor: (f) => f.matricula, celda: (f) => <b>{f.matricula}</b> },
    { clave: "expediente", etiqueta: "Expediente", valor: (f) => f.expediente.idExpediente ?? 0, celda: (f) => enlaceExpediente(f.expediente) },
    { clave: "cliente", etiqueta: "Cliente", valor: (f) => f.expediente.cliente, celda: (f) => f.expediente.cliente || vacio },
    ...columnasVehiculo<FilaSinPagar>((f) => datosVehiculo(f.expediente), { vacio }),
    { clave: "fechaClave", etiqueta: "F. matric. / afect.", valor: (f) => fechaClave(f.expediente) ?? "", celda: (f) => fecha(fechaClave(f.expediente)) },
    { clave: "mesToca", etiqueta: "Mes que le toca", valor: (f) => f.expediente.mesesEsperados.join(" "), celda: (f) => mesQueLeToca(f.expediente), ayuda: "Mes en que debía cobrarse el coche" },
    {
      clave: "parecida",
      etiqueta: "¿Mal leída?",
      valor: (f) => f.parecidaEn?.matricula ?? "",
      celda: (f) => (f.parecidaEn ? <span style={{ color: "var(--warning)", whiteSpace: "normal" }}>La rejilla de {nombreMes(f.parecidaEn.mes)} trae {f.parecidaEn.matricula}</span> : vacio),
      ayuda: "Si una rejilla trae una matrícula casi igual (sin expediente), puede ser este coche mal leído o mal escrito",
    },
    { clave: "vendedor", etiqueta: "Vendedor", valor: (f) => f.expediente.vendedor, celda: (f) => f.expediente.vendedor || vacio, oculta: !todos },
  ];

  const cuenta = (e: FilaContraste["estado"]) => filas.filter((f) => f.estado === e).length;
  const tarjetas: { id: Filtro; texto: string; n: number; color: string; icono: string; ayuda: string }[] = [
    { id: "todo", texto: "Matrículas leídas", n: filas.length, color: "var(--primary)", icono: "📚", ayuda: "Todas las matrículas de las rejillas guardadas, agrupadas por rejilla" },
    { id: "coinciden", texto: "Coinciden", n: filas.filter((f) => f.estado === "coincide" && f.repetidaEn.length === 0).length, color: ASPECTO.coincide.borde, icono: ASPECTO.coincide.icono, ayuda: "Tienen expediente, se pagaron en su mes y salen una sola vez" },
    { id: "repetidas", texto: "Repetidas", n: filas.filter((f) => f.repetidaEn.length > 0).length, color: "#eab308", icono: "🔁", ayuda: "La misma matrícula sale en más de una rejilla (o dos veces en la misma)" },
    { id: "otro_mes", texto: "Pagadas en otro mes", n: cuenta("otro_mes"), color: ASPECTO.otro_mes.borde, icono: ASPECTO.otro_mes.icono, ayuda: "Se han pagado en una rejilla distinta de la que les tocaba" },
    { id: "sin_expediente", texto: "Sin expediente", n: cuenta("sin_expediente"), color: ASPECTO.sin_expediente.borde, icono: ASPECTO.sin_expediente.icono, ayuda: "Están en una rejilla, pero ningún expediente tiene esa matrícula" },
    { id: "otro_vendedor", texto: "De otro vendedor", n: cuenta("otro_vendedor"), color: ASPECTO.otro_vendedor.borde, icono: ASPECTO.otro_vendedor.icono, ayuda: "Su expediente es de un vendedor distinto al de la rejilla" },
    ...(mostrarDeshabilitados ? [{ id: "deshabilitado" as Filtro, texto: "Deshabilitados pagados", n: cuenta("deshabilitado"), color: ASPECTO.deshabilitado.borde, icono: ASPECTO.deshabilitado.icono, ayuda: "Expedientes deshabilitados en la app cuya matrícula sale en una rejilla" }] : []),
    ...(mostrarAnulados ? [{ id: "anulado" as Filtro, texto: "Anulados pagados", n: cuenta("anulado"), color: ASPECTO.anulado.borde, icono: ASPECTO.anulado.icono, ayuda: "Expedientes anulados en la intranet cuya matrícula sale en una rejilla: revisa si te los han pagado por error" }] : []),
    { id: "sin_pagar", texto: "Expedientes sin pagar", n: sinPagar.filter((s) => s.estado === "no_pagado").length, color: ASPECTO_SIN_PAGAR.no_pagado.borde, icono: ASPECTO_SIN_PAGAR.no_pagado.icono, ayuda: "Expedientes con matrícula que no salen en ninguna rejilla aunque ya hay rejilla del mes que les tocaba: son los que te deben" },
    { id: "sin_rejilla", texto: "Aún sin rejilla", n: sinPagar.filter((s) => s.estado !== "no_pagado").length, color: "#94a3b8", icono: "⚪", ayuda: "Expedientes cuya rejilla todavía no has subido (o que no tienen fecha para saberlo)" },
  ];

  return (
    <section className="glass-panel" style={{ padding: "16px", display: "flex", flexDirection: "column", gap: "14px" }}>
      <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <h2 style={{ margin: 0, fontSize: "1.15rem" }}>🔎 Contraste: rejillas frente a expedientes</h2>
          <p style={{ margin: "2px 0 0 0", color: "var(--text-secondary)", fontSize: "0.85rem", maxWidth: "70ch" }}>
            {datos ? `${filas.length} matrículas leídas en ${datos.resumen.rejillas} rejilla${datos.resumen.rejillas === 1 ? "" : "s"} guardada${datos.resumen.rejillas === 1 ? "" : "s"}, agrupadas por rejilla y con su expediente en la misma línea: así ves en qué mes se ha pagado cada coche, qué matrículas salen en más de una rejilla y qué expedientes todavía no te han pagado.` : "Cargando…"}
          </p>
        </div>
        <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
          {esAdmin && vendedores.length > 1 && (
            <label style={{ display: "flex", gap: "8px", alignItems: "center", fontSize: "0.85rem" }}>
              Vendedor
              <select className="form-input" value={vendedor} onChange={(e) => { setVendedor(e.target.value); setRejilla("todas"); }}>
                <option value="todos">Todos los vendedores</option>
                {vendedores.map((v) => (
                  <option key={v.id} value={String(v.id)}>
                    {v.nombre}
                  </option>
                ))}
              </select>
            </label>
          )}
          {!verSinPagar && rejillasLista.length > 1 && (
            <label style={{ display: "flex", gap: "8px", alignItems: "center", fontSize: "0.85rem" }}>
              Rejilla
              <select className="form-input" value={rejilla} onChange={(e) => setRejilla(e.target.value)}>
                <option value="todas">Todas ({rejillasLista.length})</option>
                {rejillasLista.map(([id, etiqueta]) => (
                  <option key={id} value={String(id)}>
                    {etiqueta}
                  </option>
                ))}
              </select>
            </label>
          )}
          <CasillaAnulados activa={mostrarAnulados} alCambiar={(v) => { fijarMostrarAnulados(v); if (!v && filtro === "anulado") setFiltro("todo"); }} anulados={nAnulados} />
          <CasillaDeshabilitados activa={mostrarDeshabilitados} alCambiar={(v) => { fijarMostrarDeshabilitados(v); if (!v && filtro === "deshabilitado") setFiltro("todo"); }} deshabilitados={nDeshabilitados} />
          <button type="button" className="btn btn-secondary" onClick={recargar} title="Vuelve a leer las rejillas y los expedientes con los datos de ahora">
            🔄 Actualizar
          </button>
        </div>
      </div>

      {datos && datos.resumen.rejillas === 0 && (
        <p style={{ margin: 0, color: "var(--text-secondary)" }}>
          Todavía no hay ninguna rejilla guardada. Súbela en <Link href="/dashboard/cotejo-pagos">Cotejo de pagos › Mi mes</Link> y sus matrículas aparecerán aquí, contrastadas con tus expedientes.
        </p>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "8px" }}>
        {tarjetas.map((t) => (
          <button key={t.id} type="button" title={t.ayuda} aria-pressed={filtro === t.id} onClick={() => setFiltro(t.id)} className={filtro === t.id ? "btn btn-primary" : "btn btn-secondary"} style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: "2px", padding: "8px 12px", borderLeft: `4px solid ${t.color}`, opacity: t.n === 0 && filtro !== t.id ? 0.55 : 1 }}>
            <span style={{ fontSize: "1.3rem", fontWeight: 800, lineHeight: 1.1 }}>{t.n}</span>
            <span style={{ fontSize: "0.78rem", textAlign: "left" }}>
              {t.icono} {t.texto}
            </span>
          </button>
        ))}
      </div>

      {verSinPagar ? (
        <TablaDatos<FilaSinPagar>
          id="contraste-sin-pagar"
          columnas={columnasSinPagar}
          filas={sinPagarVisibles}
          clave={(f) => f.clave}
          placeholder="Buscar por matrícula, cliente, marca, modelo…"
          vacio={filtro === "sin_pagar" ? "No hay expedientes sin pagar: todos los que tienen matrícula figuran en alguna rejilla." : "No hay expedientes pendientes de rejilla."}
          estiloFila={(f) => ({ boxShadow: `inset 4px 0 0 ${ASPECTO_SIN_PAGAR[f.estado].borde}` })}
          textoExtra={(f) => f.motivo}
          pie={(fs) => ({ resultado: `${fs.length} expediente${fs.length === 1 ? "" : "s"}` })}
          compacta
        />
      ) : (
        <TablaDatos<FilaContraste>
          id="contraste-rejillas"
          columnas={columnas}
          filas={filasVisibles}
          clave={(f) => f.clave}
          placeholder="Buscar por matrícula, cliente, marca, modelo, mes…"
          vacio={filas.length === 0 ? "Todavía no hay matrículas que contrastar." : "No hay nada en esta categoría."}
          ordenInicial={{ clave: "rejilla", asc: false }}
          estiloFila={(f) => ({
            boxShadow: `inset 4px 0 0 ${ASPECTO[f.estado].borde}`,
            background: f.grupo % 2 === 0 ? "rgba(255, 255, 255, 0.02)" : "rgba(var(--primary-rgb), 0.05)",
            ...(f.primeraDelGrupo ? { borderTop: "2px solid var(--border-light)" } : {}),
          })}
          textoExtra={(f) => `${f.motivo} ${nombreMes(f.mes)} ${f.vendedorRejilla}`}
          pie={(fs) => ({ resultado: `${fs.length} matrícula${fs.length === 1 ? "" : "s"}` })}
          compacta
        />
      )}
      {datos && datos.sinMatricula > 0 && <p style={{ margin: 0, color: "var(--text-muted)", fontSize: "0.82rem" }}>Hay {datos.sinMatricula} expediente(s) sin matrícula que no se pueden contrastar (anulados o sin matricular).</p>}
    </section>
  );
}
