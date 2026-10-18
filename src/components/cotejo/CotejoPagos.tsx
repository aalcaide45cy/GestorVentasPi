"use client";

import { useMemo, useState } from "react";
import { useToast } from "@/components/Toast";
import { llamar, textoError } from "@/components/comisiones/api";
import { useCarga } from "@/components/comisiones/useCarga";
import { ajustarLecturas, cotejarPagos, sugerirMes, type CocheCotejo, type EstadoCotejo, type FilaCotejo } from "@/lib/cotejo-pagos";
import { leerListadoVentas, type FilaListado } from "@/lib/contraste-listado";
import { formatDate } from "@/lib/date-utils";
import { euros, nombreMes } from "@/lib/formato";
import TablaDatos, { type ColumnaTabla } from "@/components/TablaDatos";
import type { DatosCotejo } from "@/lib/servicios/cotejo";
import type { MatriculaLeida } from "@/lib/servicios/ocr-rejilla";

interface Borrador {
  clave: string;
  nombreArchivo: string;
  mes: string;
  filas: { matricula: string; confianza: number; corregidaDe?: string }[];
}

interface Listado {
  nombre: string;
  coches: CocheCotejo[];
}

const COLORES: Record<EstadoCotejo, { texto: string; fondo: string; borde: string; icono: string }> = {
  pagado: { texto: "Pagado", fondo: "rgba(34, 197, 94, 0.14)", borde: "#22c55e", icono: "🟢" },
  dudoso: { texto: "Dudoso", fondo: "rgba(234, 179, 8, 0.18)", borde: "#eab308", icono: "🟡" },
  no_pagado: { texto: "No pagado", fondo: "rgba(239, 68, 68, 0.16)", borde: "#ef4444", icono: "🔴" },
  sin_rejilla: { texto: "Sin rejilla de ese mes", fondo: "rgba(148, 163, 184, 0.12)", borde: "#94a3b8", icono: "⚪" },
};

const esImagen = (f: File) => f.type.startsWith("image/") || /\.(png|jpe?g|webp|bmp|tiff?)$/i.test(f.name);
const esPdf = (f: File) => f.type === "application/pdf" || /\.pdf$/i.test(f.name);

const cocheDeListado = (f: FilaListado): CocheCotejo => ({
  origen: "listado",
  id_expediente: null,
  cliente: f.cliente,
  tipo_pago: "",
  marca: f.marca,
  modelo: f.modelo,
  matricula: f.matricula,
  f_expediente: f.f_creado,
  f_afectacion: f.f_afect,
  f_matriculacion: f.f_mat,
  f_entrega: f.f_entrega,
  estado: f.estado,
  usado: f.usado,
});

const fecha = (v: string | null) => formatDate(v) || "-";

/** «Cotejo de pagos»: sube las rejillas de la empresa y comprueba, por matrícula, qué coches vendidos no te han pagado. */
export default function CotejoPagos() {
  const { mostrar } = useToast();
  const { datos, recargar } = useCarga<DatosCotejo>("/api/cotejo", { coches: [], pagos: [], rejillas: [] });
  const [borradores, setBorradores] = useState<Borrador[]>([]);
  const [listados, setListados] = useState<Listado[]>([]);
  const [trabajando, setTrabajando] = useState(false);
  const [filtro, setFiltro] = useState<"todos" | EstadoCotejo>("todos");
  const [verSinMatricula, setVerSinMatricula] = useState(false);

  const cochesTodos = useMemo(() => [...datos.coches, ...listados.flatMap((l) => l.coches)], [datos.coches, listados]);
  const resultado = useMemo(() => cotejarPagos(cochesTodos, datos.pagos), [cochesTodos, datos.pagos]);

  /** Resuelve una lectura dudosa de la rejilla ya guardada: se corrige la matrícula o se confirma que estaba bien leída. */
  const resolver = async (f: FilaCotejo, accion: "corregir" | "confirmar") => {
    if (!f.matriculaHoja || !f.mesRejilla) return;
    setTrabajando(true);
    try {
      await llamar("/api/cotejo/rejillas/lectura", { method: "POST", cuerpo: { mes: f.mesRejilla, accion, de: f.matriculaHoja, a: accion === "corregir" ? f.matricula : undefined } });
      mostrar(accion === "corregir" ? `Lectura corregida: ${f.matriculaHoja} → ${f.matricula}.` : "Lectura confirmada.");
      recargar();
    } catch (e) {
      mostrar(textoError(e), "error");
    } finally {
      setTrabajando(false);
    }
  };

  /* ---------------- Rejillas (PDF o imagen) ---------------- */
  const subirRejillas = async (archivos: FileList | null) => {
    if (!archivos || archivos.length === 0) return;
    setTrabajando(true);
    try {
      const nuevos: Borrador[] = [];
      for (const f of Array.from(archivos)) {
        if (!esPdf(f) && !esImagen(f)) {
          mostrar(`«${f.name}» no es un PDF ni una imagen.`, "error");
          continue;
        }
        const r = await fetch("/api/cotejo/leer", { method: "POST", headers: { "Content-Type": f.type || "application/pdf" }, body: f, credentials: "same-origin" });
        const json = (await r.json().catch(() => ({}))) as { message?: string; data?: { paginas: { matriculas: MatriculaLeida[] }[] } };
        if (!r.ok || !json.data) {
          mostrar(`${f.name}: ${json.message ?? `Error ${r.status}`}`, "error");
          continue;
        }
        json.data.paginas.forEach((p, i) => {
          if (p.matriculas.length === 0) {
            mostrar(`No he podido leer ninguna matrícula en «${f.name}»${json.data!.paginas.length > 1 ? ` (página ${i + 1})` : ""}. Puedes escribirlas a mano.`, "error");
          }
          nuevos.push({
            clave: `${f.name}-${i}-${Date.now()}`,
            nombreArchivo: json.data!.paginas.length > 1 ? `${f.name} (pág. ${i + 1})` : f.name,
            mes: sugerirMes(p.matriculas.map((m) => m.matricula), cochesTodos) ?? "",
            filas: ajustarLecturas(p.matriculas.map((m) => ({ matricula: m.matricula, confianza: m.valida ? m.confianza : 0 })), cochesTodos.map((c) => c.matricula)),
          });
        });
      }
      setBorradores((b) => [...b, ...nuevos]);
    } catch (e) {
      mostrar(textoError(e), "error");
    } finally {
      setTrabajando(false);
    }
  };

  const editar = (clave: string, cambio: Partial<Borrador>) => setBorradores((b) => b.map((x) => (x.clave === clave ? { ...x, ...cambio } : x)));

  const guardar = async (b: Borrador) => {
    const matriculas = b.filas.map((f) => f.matricula.trim()).filter(Boolean);
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(b.mes)) return mostrar("Indica el mes de la rejilla antes de guardarla.", "error");
    if (matriculas.length === 0) return mostrar("La rejilla no tiene ninguna matrícula.", "error");
    const existente = datos.rejillas.find((r) => r.mes === b.mes);
    if (existente && !window.confirm(`Ya hay una rejilla guardada de ${nombreMes(b.mes)} (${existente.filas} matrículas). ¿La sustituyo por esta?`)) return;
    setTrabajando(true);
    try {
      await llamar("/api/cotejo/rejillas", { method: "PUT", cuerpo: { mes: b.mes, nombreArchivo: b.nombreArchivo, origen: "pdf", matriculas } });
      setBorradores((x) => x.filter((y) => y.clave !== b.clave));
      mostrar(`Rejilla de ${nombreMes(b.mes)} guardada.`);
      recargar();
    } catch (e) {
      mostrar(textoError(e), "error");
    } finally {
      setTrabajando(false);
    }
  };

  const borrar = async (mes: string) => {
    if (!window.confirm(`¿Quito la rejilla de ${nombreMes(mes)}? Los coches de ese mes volverán a salir sin rejilla.`)) return;
    try {
      await llamar(`/api/cotejo/rejillas?mes=${mes}`, { method: "DELETE" });
      recargar();
    } catch (e) {
      mostrar(textoError(e), "error");
    }
  };

  /* ---------------- Listados del fabricante (Excel) ---------------- */
  const subirListados = async (archivos: FileList | null) => {
    if (!archivos) return;
    try {
      const nuevos: Listado[] = [];
      for (const f of Array.from(archivos)) {
        const filas = leerListadoVentas(await f.arrayBuffer());
        nuevos.push({ nombre: f.name, coches: filas.map(cocheDeListado) });
      }
      setListados((l) => [...l, ...nuevos]);
    } catch (e) {
      mostrar(textoError(e), "error");
    }
  };

  const filas = resultado.filas.filter((f) => (filtro === "todos" ? f.estado !== "sin_rejilla" : f.estado === filtro));
  const r = resultado.resumen;

  const sinCoche = <span style={{ color: "var(--text-muted)" }}>—</span>;
  const columnasResultado: ColumnaTabla<FilaCotejo>[] = [
    {
      clave: "resultado",
      etiqueta: "Resultado",
      valor: (f) => COLORES[f.estado].texto,
      celda: (f) => (
        <div style={{ minWidth: "190px", whiteSpace: "normal" }}>
          <div style={{ fontWeight: 600, whiteSpace: "nowrap" }}>
            {COLORES[f.estado].icono} {COLORES[f.estado].texto}
          </div>
          <div style={{ color: "var(--text-secondary)", fontSize: "0.78rem", marginTop: "2px" }}>{f.motivo}</div>
          {f.estado === "dudoso" && f.matriculaHoja && f.mesRejilla && (
            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginTop: "6px" }}>
              {f.coche && (
                <button type="button" className="btn btn-secondary" style={{ padding: "3px 8px", fontSize: "0.75rem" }} disabled={trabajando} onClick={() => void resolver(f, "corregir")} title={`Cambia ${f.matriculaHoja} por ${f.matricula} en la rejilla guardada: era una mala lectura`}>
                  ✏️ Es este coche ({f.matricula})
                </button>
              )}
              <button type="button" className="btn btn-secondary" style={{ padding: "3px 8px", fontSize: "0.75rem" }} disabled={trabajando} onClick={() => void resolver(f, "confirmar")} title="La hoja trae exactamente esa matrícula: la lectura no se corrige y se deja de preguntar">
                ✔ La lectura es correcta
              </button>
            </div>
          )}
        </div>
      ),
    },
    { clave: "matricula", etiqueta: "Matrícula", valor: (f) => f.matricula, celda: (f) => <b>{f.matricula}</b> },
    { clave: "cliente", etiqueta: "Cliente", valor: (f) => f.coche?.cliente ?? "", celda: (f) => f.coche?.cliente || <span style={{ color: "var(--text-muted)" }}>(sin coche)</span> },
    { clave: "tipo", etiqueta: "VN / VO", valor: (f) => (f.coche ? (f.coche.usado ? "VO" : "VN") : ""), celda: (f) => (f.coche ? <b style={{ color: f.coche.usado ? "var(--warning)" : "var(--success)" }}>{f.coche.usado ? "VO" : "VN"}</b> : sinCoche), alinear: "center" },
    { clave: "marca", etiqueta: "Marca", valor: (f) => f.coche?.marca ?? "", celda: (f) => f.coche?.marca || sinCoche },
    { clave: "modelo", etiqueta: "Modelo", valor: (f) => f.coche?.modelo ?? "", celda: (f) => f.coche?.modelo || sinCoche },
    { clave: "estadoVehiculo", etiqueta: "Estado", valor: (f) => f.coche?.estado ?? "", celda: (f) => f.coche?.estado || sinCoche, ayuda: "Estado del vehículo en el expediente" },
    { clave: "tipoPago", etiqueta: "Tipo de pago", valor: (f) => f.coche?.tipo_pago ?? "", celda: (f) => f.coche?.tipo_pago || sinCoche },
    { clave: "fechaClave", etiqueta: "F. matric. / afect.", valor: (f) => (f.coche?.usado ? f.coche.f_afectacion : f.coche?.f_matriculacion) ?? "", celda: (f) => (f.coche ? fecha((f.coche.usado ? f.coche.f_afectacion : f.coche.f_matriculacion) ?? null) : "-"), ayuda: "Fecha de afectación en los usados y de matriculación en los nuevos" },
    { clave: "entrega", etiqueta: "F. entrega", valor: (f) => f.coche?.f_entrega ?? "", celda: (f) => (f.coche ? fecha(f.coche.f_entrega) : "-") },
    { clave: "mes", etiqueta: "Rejilla de", valor: (f) => f.mesRejilla ?? "", celda: (f) => (f.mesRejilla ? nombreMes(f.mesRejilla) : "-"), oculta: true },
    { clave: "importe", etiqueta: "Importe en la hoja", valor: (f) => f.importe ?? -1, celda: (f) => (f.importe === null ? "-" : euros(f.importe)), alinear: "right", oculta: true },
  ];
  const columnasSinMatricula: ColumnaTabla<CocheCotejo>[] = [
    { clave: "origen", etiqueta: "Origen", valor: (c) => (c.origen === "app" ? `Expediente #${c.id_expediente}` : "Listado") },
    { clave: "cliente", etiqueta: "Cliente", valor: (c) => c.cliente },
    { clave: "tipo", etiqueta: "VN / VO", valor: (c) => (c.usado ? "VO" : "VN"), alinear: "center" },
    { clave: "marca", etiqueta: "Marca", valor: (c) => c.marca },
    { clave: "modelo", etiqueta: "Modelo", valor: (c) => c.modelo },
    { clave: "estado", etiqueta: "Estado", valor: (c) => c.estado || "Sin matricular" },
    { clave: "fExp", etiqueta: "F. expediente", valor: (c) => c.f_expediente ?? "", celda: (c) => fecha(c.f_expediente) },
    { clave: "fEntrega", etiqueta: "F. entrega", valor: (c) => c.f_entrega ?? "", celda: (c) => fecha(c.f_entrega) },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      {/* 1. Rejillas */}
      <section className="glass-panel" style={{ padding: "16px", display: "flex", flexDirection: "column", gap: "12px" }}>
        <h3 style={{ margin: 0 }}>1. Rejillas de la empresa</h3>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
          <label className="btn btn-primary" style={{ cursor: trabajando ? "wait" : "pointer" }}>
            {trabajando ? "⏳ Leyendo…" : "📄 Subir rejillas (PDF o foto)"}
            <input type="file" multiple accept=".pdf,image/*" style={{ display: "none" }} disabled={trabajando} onChange={(e) => { void subirRejillas(e.target.files); e.target.value = ""; }} />
          </label>
          <span style={{ color: "var(--text-secondary)", fontSize: "0.85rem" }}>Puedes subir varias a la vez. La lectura tarda unos segundos por hoja.</span>
        </div>

        {borradores.map((b) => (
          <div key={b.clave} style={{ border: "1px solid var(--border-light)", borderRadius: "var(--radius-sm)", padding: "12px", display: "flex", flexDirection: "column", gap: "10px" }}>
            <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", alignItems: "end" }}>
              <div>
                <strong>{b.nombreArchivo}</strong>
                <div style={{ color: "var(--text-secondary)", fontSize: "0.85rem" }}>Revisa las matrículas: las marcadas en amarillo o rojo no se han leído con seguridad.</div>
              </div>
              <div>
                <label className="form-label">Mes de la rejilla</label>
                <input className="form-input" type="month" value={b.mes} onChange={(e) => editar(b.clave, { mes: e.target.value })} />
              </div>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
              {b.filas.map((f, i) => (
                <div key={i} style={{ display: "flex", gap: "4px", alignItems: "center" }}>
                  <input
                    className="form-input"
                    style={{ width: "110px", padding: "6px 8px", fontWeight: 600, background: f.confianza >= 90 ? undefined : f.confianza >= 50 ? "rgba(234, 179, 8, 0.25)" : "rgba(239, 68, 68, 0.25)" }}
                    value={f.matricula}
                    title={f.corregidaDe ? `La hoja se leyó como ${f.corregidaDe}; se ha cambiado por la matrícula de un coche tuyo muy parecida. Revísalo.` : undefined}
                    onChange={(e) => editar(b.clave, { filas: b.filas.map((x, j) => (j === i ? { matricula: e.target.value.toUpperCase(), confianza: 100 } : x)) })}
                  />
                  {f.corregidaDe && <span style={{ fontSize: "0.7rem", color: "var(--text-muted)" }} title="Lectura del OCR antes del ajuste">(leído {f.corregidaDe})</span>}
                  <button type="button" className="btn btn-secondary" style={{ padding: "2px 8px" }} title="Quitar" onClick={() => editar(b.clave, { filas: b.filas.filter((_, j) => j !== i) })}>✕</button>
                </div>
              ))}
              <button type="button" className="btn btn-secondary" style={{ padding: "4px 10px" }} onClick={() => editar(b.clave, { filas: [...b.filas, { matricula: "", confianza: 100 }] })}>＋ Añadir matrícula</button>
            </div>
            <div style={{ display: "flex", gap: "8px" }}>
              <button type="button" className="btn btn-primary" disabled={trabajando} onClick={() => void guardar(b)}>💾 Guardar rejilla</button>
              <button type="button" className="btn btn-secondary" onClick={() => setBorradores((x) => x.filter((y) => y.clave !== b.clave))}>Descartar</button>
            </div>
          </div>
        ))}

        {datos.rejillas.length > 0 ? (
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            {datos.rejillas.map((h) => (
              <span key={h.id} className="glass-panel" style={{ padding: "6px 10px", fontSize: "0.85rem", display: "inline-flex", gap: "8px", alignItems: "center" }}>
                <strong>{nombreMes(h.mes)}</strong> · {h.filas} matrículas
                <button type="button" onClick={() => void borrar(h.mes)} title="Quitar esta rejilla" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-secondary)" }}>✕</button>
              </span>
            ))}
          </div>
        ) : (
          <span style={{ color: "var(--text-secondary)" }}>Todavía no hay ninguna rejilla guardada.</span>
        )}
      </section>

      {/* 2. Listados */}
      <section className="glass-panel" style={{ padding: "16px", display: "flex", flexDirection: "column", gap: "12px" }}>
        <h3 style={{ margin: 0 }}>2. Listados de ventas del fabricante (opcional)</h3>
        <p style={{ margin: 0, color: "var(--text-secondary)", fontSize: "0.9rem" }}>
          Para cotejar también las ventas que aún no están como expedientes en la app. Se leen en tu navegador y no se guardan: hay que volver a subirlos cada vez.
        </p>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
          <label className="btn btn-secondary" style={{ cursor: "pointer" }}>
            📊 Subir listados (Excel)
            <input type="file" multiple accept=".xlsx,.xls" style={{ display: "none" }} onChange={(e) => { void subirListados(e.target.files); e.target.value = ""; }} />
          </label>
          {listados.map((l, i) => (
            <span key={i} className="glass-panel" style={{ padding: "6px 10px", fontSize: "0.85rem", display: "inline-flex", gap: "8px", alignItems: "center" }}>
              {l.nombre} · {l.coches.length} filas
              <button type="button" onClick={() => setListados((x) => x.filter((_, j) => j !== i))} title="Quitar" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-secondary)" }}>✕</button>
            </span>
          ))}
        </div>
        <span style={{ color: "var(--text-secondary)", fontSize: "0.85rem" }}>Expedientes de la app con datos: {datos.coches.length}.</span>
      </section>

      {/* 3. Resultado */}
      <section className="glass-panel" style={{ padding: "16px", display: "flex", flexDirection: "column", gap: "12px" }}>
        <h3 style={{ margin: 0 }}>3. Resultado</h3>
        {cochesTodos.length === 0 || datos.pagos.length === 0 ? (
          <p style={{ margin: 0, color: "var(--text-secondary)" }}>
            {datos.pagos.length === 0 ? "Guarda al menos una rejilla para ver el cotejo." : "No hay coches que cotejar: sube un listado o crea expedientes."}
          </p>
        ) : (
          <>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              <button type="button" className={`btn ${filtro === "todos" ? "btn-primary" : "btn-secondary"}`} style={{ padding: "6px 12px" }} onClick={() => setFiltro("todos")}>Todos</button>
              {(["no_pagado", "dudoso", "pagado", "sin_rejilla"] as const).map((e) => {
                const n = e === "no_pagado" ? r.noPagados : e === "dudoso" ? r.dudosos : e === "pagado" ? r.pagados : r.sinRejilla;
                return (
                  <button key={e} type="button" className={`btn ${filtro === e ? "btn-primary" : "btn-secondary"}`} style={{ padding: "6px 12px", borderLeft: `4px solid ${COLORES[e].borde}` }} onClick={() => setFiltro(e)}>
                    {COLORES[e].icono} {COLORES[e].texto} ({n})
                  </button>
                );
              })}
            </div>
            <TablaDatos<FilaCotejo>
              id="cotejo-resultado"
              columnas={columnasResultado}
              filas={filas}
              clave={(f) => `${f.matricula}-${f.estado}-${f.mesRejilla ?? ""}`}
              placeholder="Buscar por matrícula, cliente, marca, modelo, resultado…"
              vacio="No hay nada en esta categoría."
              estiloFila={(f) => ({ background: COLORES[f.estado].fondo, boxShadow: `inset 4px 0 0 ${COLORES[f.estado].borde}` })}
              textoExtra={(f) => f.motivo}
              pie={(fs) => ({ resultado: `${fs.length} fila${fs.length === 1 ? "" : "s"}`, importe: euros(fs.reduce((t, f) => t + (f.importe ?? 0), 0)) })}
            />
          </>
        )}

        {resultado.sinMatricula.length > 0 && (
          <div>
            <button type="button" className="btn btn-secondary" onClick={() => setVerSinMatricula((v) => !v)}>
              {verSinMatricula ? "▾" : "▸"} Sin matrícula, no se pueden cotejar ({resultado.sinMatricula.length})
            </button>
            {verSinMatricula && (
              <div style={{ marginTop: "8px" }}>
                <TablaDatos<CocheCotejo> id="cotejo-sin-matricula" columnas={columnasSinMatricula} filas={resultado.sinMatricula} clave={(c) => `${c.origen}-${c.id_expediente}-${c.cliente}-${c.f_expediente}`} placeholder="Buscar por cliente, modelo, estado…" />
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
