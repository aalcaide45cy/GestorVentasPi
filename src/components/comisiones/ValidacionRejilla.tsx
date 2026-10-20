"use client";

import Link from "next/link";
import ResumenLiquidacion from "@/components/cotejo/ResumenLiquidacion";
import { useState } from "react";
import { useToast } from "@/components/Toast";
import { codigoExpediente } from "@/lib/date-utils";
import { euros, nombreMes, sumarMeses, mesActual } from "@/lib/formato";
import { filasDeMatriz, matrizDeCsv, proponerMapeo, type FilaRejilla, type MapeoColumnas } from "@/lib/rejilla/analizar";
import type { EstadoComprobacion, EstadoValidacion, FilaComprobacion, ResultadoRejilla } from "@/lib/servicios/rejillas";
import TablaDatos, { type ColumnaTabla } from "@/components/TablaDatos";
import { columnasVehiculo } from "@/components/etiquetas";
import { llamar, textoError } from "./api";
import { InputCentesimas, Seccion } from "./campos";
import { useCarga } from "./useCarga";
import type { CatalogosComisiones } from "./tipos";

type Origen = "excel" | "csv" | "pdf" | "imagen" | "manual";

interface Borrador {
  origen: Origen;
  nombreArchivo: string | null;
  filas: FilaRejilla[];
  matriz: string[][] | null;
  mapeo: MapeoColumnas | null;
  aviso: string | null;
}

const ETIQUETA: Record<EstadoComprobacion, { texto: string; color: string }> = {
  ok: { texto: "✅ Cuadra", color: "var(--success)" },
  distinto: { texto: "⚠️ Importe distinto", color: "var(--warning)" },
  falta_en_hoja: { texto: "❌ Falta en la hoja", color: "var(--danger, #ef4444)" },
  sin_importe: { texto: "❓ Sin importe", color: "var(--warning)" },
  no_en_app: { texto: "❓ No está en la app", color: "var(--warning)" },
  otro_mes: { texto: "📅 Está en otro mes", color: "var(--warning)" },
};

const filaVacia = (): FilaRejilla => ({ matricula: "", cliente: null, financiacion: null, concepto: null, importe: null });

const esImagen = (f: File) => f.type.startsWith("image/") || /\.(png|jpe?g|webp|bmp|tiff?)$/i.test(f.name);
const esPdf = (f: File) => f.type === "application/pdf" || /\.pdf$/i.test(f.name);

/** «✅ Validación de comisiones con la rejilla de la empresa»: sube la hoja, cruza por matrícula y controla qué coches se han pagado. */
export default function ValidacionRejilla({ cat, usuarioInicial, esAdmin }: { cat: CatalogosComisiones; usuarioInicial: number; esAdmin: boolean }) {
  const { mostrar, confirmar } = useToast();
  const [usuario, setUsuario] = useState(usuarioInicial);
  // La hoja de un mes llega a lo largo de dos meses después (liquidación de agosto → nómina de septiembre → hoja en octubre)
  const [mes, setMes] = useState(sumarMeses(mesActual(), -2));
  const [borrador, setBorrador] = useState<Borrador | null>(null);
  const [trabajando, setTrabajando] = useState(false);
  const [filtro, setFiltro] = useState<"incidencias" | "todos">("incidencias");

  const url = `/api/comisiones/rejillas?usuario=${usuario}&mes=${mes}`;
  const { datos, recargar } = useCarga<ResultadoRejilla | null>(url, null);

  /* ---------------- Subida ---------------- */
  const leerArchivo = async (f: File | null) => {
    if (!f) return;
    setTrabajando(true);
    try {
      if (esPdf(f) || esImagen(f)) {
        const r = await fetch(`/api/comisiones/rejillas/ocr?nombre=${encodeURIComponent(f.name)}`, { method: "POST", headers: { "Content-Type": f.type || (esPdf(f) ? "application/pdf" : "image/png") }, body: f, credentials: "same-origin" });
        const json = (await r.json().catch(() => ({}))) as { message?: string; data?: { filas: FilaRejilla[]; aviso?: string | null } };
        if (!r.ok || !json.data) throw new Error(json.message ?? `Error ${r.status}`);
        setBorrador({ origen: esPdf(f) ? "pdf" : "imagen", nombreArchivo: f.name, filas: json.data.filas, matriz: null, mapeo: null, aviso: json.data.aviso ?? null });
        if (json.data.filas.length === 0) mostrar("No se ha reconocido ninguna matrícula. Prueba con otra foto o añade las filas a mano.", "error");
      } else {
        let matriz: string[][];
        if (/\.csv$|\.txt$/i.test(f.name)) matriz = matrizDeCsv(await f.text());
        else {
          const XLSX = await import("xlsx");
          const libro = XLSX.read(new Uint8Array(await f.arrayBuffer()), { type: "array" });
          matriz = XLSX.utils.sheet_to_json<string[]>(libro.Sheets[libro.SheetNames[0]], { header: 1, defval: "", raw: false });
        }
        const mapeo = proponerMapeo(matriz);
        setBorrador({ origen: /\.csv$|\.txt$/i.test(f.name) ? "csv" : "excel", nombreArchivo: f.name, filas: filasDeMatriz(matriz, mapeo), matriz, mapeo, aviso: null });
      }
    } catch (e) {
      mostrar(textoError(e), "error");
    } finally {
      setTrabajando(false);
    }
  };

  const cambiarMapeo = (cambio: Partial<MapeoColumnas>) => {
    if (!borrador?.matriz || !borrador.mapeo) return;
    const mapeo = { ...borrador.mapeo, ...cambio };
    setBorrador({ ...borrador, mapeo, filas: filasDeMatriz(borrador.matriz, mapeo) });
  };

  const guardar = async () => {
    if (!borrador) return;
    const filas = borrador.filas.filter((f) => f.matricula.trim() !== "");
    if (filas.length === 0) return mostrar("Añade al menos una fila con matrícula.", "error");
    setTrabajando(true);
    try {
      await llamar<ResultadoRejilla>(url, {
        method: "PUT",
        cuerpo: { mes, origen: borrador.origen, nombreArchivo: borrador.nombreArchivo, filas: filas.map((f) => ({ ...f, importe: f.importe ?? null })) },
      });
      setBorrador(null);
      recargar();
      mostrar("Rejilla guardada y comprobada.", "exito");
    } catch (e) {
      mostrar(textoError(e), "error");
    } finally {
      setTrabajando(false);
    }
  };

  const borrarRejilla = async () => {
    if (!await confirmar({ texto: `¿Eliminar la rejilla de ${nombreMes(mes)}? Las marcas de pagado/reclamado se conservan.`, peligro: true })) return;
    try {
      await llamar(url, { method: "DELETE" });
      recargar();
    } catch (e) {
      mostrar(textoError(e), "error");
    }
  };

  const validar = async (idExpediente: number, estado: EstadoValidacion, nota?: string | null) => {
    try {
      await llamar(`/api/comisiones/rejillas/validar?usuario=${usuario}`, { method: "POST", cuerpo: { mes, idExpediente, estado, nota: nota ?? null } });
      recargar();
    } catch (e) {
      mostrar(textoError(e), "error");
    }
  };

  const editarFila = (i: number, cambio: Partial<FilaRejilla>) => {
    if (!borrador) return;
    setBorrador({ ...borrador, filas: borrador.filas.map((f, j) => (j === i ? { ...f, ...cambio } : f)) });
  };

  const r = datos;
  const esDuplicada = (f: { duplicadaEn: string[]; repetidaEnHoja: boolean }) => f.duplicadaEn.length > 0 || f.repetidaEnHoja;
  const columnasFilas: ColumnaTabla<FilaComprobacion>[] = [
    {
      clave: "matricula",
      etiqueta: "Matrícula",
      valor: (f) => f.matricula,
      celda: (f) => (
        <>
          {f.idExpediente ? (
            <Link href={`/dashboard/expedientes/editar/${f.idExpediente}`} style={{ color: "var(--primary)" }} title={codigoExpediente(f.idExpediente)}>
              {f.matricula}
            </Link>
          ) : (
            f.matricula
          )}
          {esDuplicada(f) && (
            <span title={[f.duplicadaEn.length > 0 ? `También sale en la hoja de ${f.duplicadaEn.map((m) => nombreMes(m)).join(", ")}` : "", f.repetidaEnHoja ? "Está repetida con el mismo concepto e importe en esta hoja" : ""].filter(Boolean).join(". ")} style={{ marginLeft: "6px", color: "var(--danger, #ef4444)", fontSize: "0.75rem", fontWeight: 700 }}>
              🔁 {f.duplicadaEn.length > 0 ? `también en ${f.duplicadaEn.map((m) => nombreMes(m)).join(", ")}` : "repetida"}
            </span>
          )}
        </>
      ),
    },
    { clave: "cliente", etiqueta: "Cliente", valor: (f) => f.cliente ?? "", celda: (f) => f.cliente ?? "—" },
    ...columnasVehiculo<FilaComprobacion>((f) => ({ clase: f.clase, marca: f.marca, modelo: f.modelo, estado: f.estadoVehiculo })),
    { clave: "financiacion", etiqueta: "Financiación", valor: (f) => f.financiacion ?? "", celda: (f) => f.financiacion ?? "—" },
    {
      clave: "resultado",
      etiqueta: "Resultado",
      valor: (f) => ETIQUETA[f.estado].texto,
      celda: (f) => (
        <div style={{ whiteSpace: "normal" }}>
          <span style={{ color: ETIQUETA[f.estado].color, fontWeight: 600 }}>{ETIQUETA[f.estado].texto}</span>
          {f.nota && <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", maxWidth: "260px" }}>{f.nota}</div>}
        </div>
      ),
    },
    { clave: "app", etiqueta: "App", valor: (f) => f.importeApp, celda: (f) => euros(f.importeApp), alinear: "right" },
    { clave: "hoja", etiqueta: "Hoja", valor: (f) => f.importeHoja ?? -1, celda: (f) => (f.importeHoja === null ? "—" : euros(f.importeHoja)), alinear: "right" },
    { clave: "diferencia", etiqueta: "Diferencia", valor: (f) => f.diferencia, celda: (f) => <span style={{ color: f.diferencia !== 0 ? "var(--warning)" : undefined }}>{f.diferencia === 0 ? "—" : euros(f.diferencia)}</span>, alinear: "right" },
    {
      clave: "cobro",
      etiqueta: "Estado del cobro",
      valor: (f) => f.validacion,
      celda: (f) =>
        f.idExpediente ? (
          <select className="form-input" style={{ padding: "4px 8px" }} value={f.validacion} onChange={(e) => void validar(f.idExpediente as number, e.target.value as EstadoValidacion, f.notaValidacion)}>
            <option value="pagado">Pagado</option>
            <option value="pendiente">Pendiente</option>
            <option value="reclamado">Reclamado</option>
          </select>
        ) : (
          <span style={{ color: "var(--text-muted)" }}>—</span>
        ),
    },
  ];
  const filas = (r?.filas ?? []).filter((f) => filtro === "todos" || f.estado !== "ok" || esDuplicada(f));
  const cabeceras = borrador?.matriz?.[borrador.mapeo?.filaCabecera ?? 0] ?? [];
  const selectorColumna = (valor: number | null, onChange: (v: number | null) => void) => (
    <select className="form-input" value={valor ?? ""} onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}>
      <option value="">— ninguna —</option>
      {cabeceras.map((c, i) => (
        <option key={i} value={i}>
          {String(c).trim() || `Columna ${i + 1}`}
        </option>
      ))}
    </select>
  );

  return (
    <Seccion
      titulo="✅ Validación de comisiones con la rejilla de la empresa"
      ayuda="Sube la hoja de comisiones que te entrega la empresa (Excel, CSV, PDF o foto). Se cruza por matrícula con tu liquidación del mismo mes para ver qué coches faltan, cuáles no cuadran y cuáles están pagados."
    >
      <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", alignItems: "end" }}>
        {esAdmin && (
          <div>
            <label className="form-label">Vendedor</label>
            <select className="form-input" value={usuario} onChange={(e) => setUsuario(Number(e.target.value))}>
              {cat.vendedores.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.nombre}
                </option>
              ))}
            </select>
          </div>
        )}
        <div>
          <label className="form-label">Mes de la liquidación</label>
          <input className="form-input" type="month" value={mes} onChange={(e) => setMes(e.target.value)} />
        </div>
        <label className="btn btn-primary" style={{ cursor: "pointer" }}>
          {trabajando && !borrador ? "Leyendo…" : r?.rejilla ? "Subir otra rejilla" : "Subir rejilla"}
          <input type="file" accept=".xlsx,.xls,.csv,.txt,.pdf,image/*" style={{ display: "none" }} onChange={(e) => { void leerArchivo(e.target.files?.[0] ?? null); e.target.value = ""; }} />
        </label>
        <button type="button" className="btn btn-secondary" onClick={() => setBorrador({ origen: "manual", nombreArchivo: null, filas: [filaVacia()], matriz: null, mapeo: null, aviso: null })}>
          Escribir a mano
        </button>
        {r?.rejilla && (
          <button type="button" className="btn btn-secondary" onClick={borrarRejilla}>
            Eliminar rejilla
          </button>
        )}
      </div>
      <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", margin: 0 }}>
        Se validan las comisiones generadas en {nombreMes(mes)} (matriculados en ese mes o con la casilla «contabilizar en otro mes»), que se cobran en la nómina de {nombreMes(sumarMeses(mes, 1))}.
      </p>

      {/* ---------- Revisión previa a guardar ---------- */}
      {borrador && (
        <div className="glass-panel" style={{ padding: "16px", display: "flex", flexDirection: "column", gap: "12px" }}>
          <strong>
            Revisa lo leído {borrador.nombreArchivo ? `de «${borrador.nombreArchivo}»` : ""} ({borrador.filas.length} fila(s))
          </strong>
          {borrador.origen === "pdf" || borrador.origen === "imagen" ? (
            <p style={{ margin: 0, color: "var(--warning)", fontSize: "0.9rem" }}>
              ⚠️ El reconocimiento de texto puede equivocarse (especialmente en importes y matrículas). Comprueba cada fila con la línea original antes de guardar.
            </p>
          ) : null}
          {borrador.aviso && <p style={{ margin: 0, color: "var(--warning)", fontSize: "0.9rem" }}>{borrador.aviso}</p>}
          <details>
            <summary style={{ cursor: "pointer", fontWeight: 600 }}>🧮 Ver mi liquidación de {nombreMes(mes)} para ir cotejando mientras revisas</summary>
            <ResumenLiquidacion usuario={usuario} mes={mes} />
          </details>
          {borrador.matriz && borrador.mapeo && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "10px" }}>
              <div>
                <label className="form-label">Fila de cabeceras</label>
                <input className="form-input" type="number" min={1} value={borrador.mapeo.filaCabecera + 1} onChange={(e) => cambiarMapeo({ filaCabecera: Math.max(0, Number(e.target.value) - 1) })} />
              </div>
              <div>
                <label className="form-label">Columna matrícula</label>
                {selectorColumna(borrador.mapeo.matricula, (v) => cambiarMapeo({ matricula: v }))}
              </div>
              <div>
                <label className="form-label">Columna cliente</label>
                {selectorColumna(borrador.mapeo.cliente, (v) => cambiarMapeo({ cliente: v }))}
              </div>
              <div>
                <label className="form-label">Columna financiación</label>
                {selectorColumna(borrador.mapeo.financiacion, (v) => cambiarMapeo({ financiacion: v }))}
              </div>
              <div>
                <label className="form-label">Columnas de importe (se suman)</label>
                <select
                  className="form-input"
                  multiple
                  size={Math.min(5, Math.max(2, cabeceras.length))}
                  value={borrador.mapeo.importes.map(String)}
                  onChange={(e) => cambiarMapeo({ importes: Array.from(e.target.selectedOptions).map((o) => Number(o.value)) })}
                >
                  {cabeceras.map((c, i) => (
                    <option key={i} value={i}>
                      {String(c).trim() || `Columna ${i + 1}`}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}
          <div className="table-container">
            <table className="table-premium">
              <thead>
                <tr>
                  <th>Matrícula</th>
                  <th>Cliente</th>
                  <th>Financiación</th>
                  <th style={{ textAlign: "right" }}>Importe</th>
                  {borrador.filas.some((f) => f.textoOriginal) && <th>Línea original</th>}
                  <th />
                </tr>
              </thead>
              <tbody>
                {borrador.filas.map((f, i) => (
                  <tr key={i} style={f.confianza !== null && f.confianza !== undefined && f.confianza < 70 ? { background: "rgba(245, 158, 11, 0.12)" } : undefined}>
                    <td>
                      <input className="form-input" style={{ width: "120px", padding: "6px 8px" }} value={f.matricula} onChange={(e) => editarFila(i, { matricula: e.target.value })} />
                    </td>
                    <td>
                      <input className="form-input" style={{ padding: "6px 8px" }} value={f.cliente ?? ""} onChange={(e) => editarFila(i, { cliente: e.target.value || null })} />
                    </td>
                    <td>
                      <input className="form-input" style={{ width: "130px", padding: "6px 8px" }} value={f.financiacion ?? ""} onChange={(e) => editarFila(i, { financiacion: e.target.value || null })} />
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <InputCentesimas valor={f.importe} vacioEsNulo onChange={(v) => editarFila(i, { importe: v })} sufijo="€" ancho="100px" />
                    </td>
                    {borrador.filas.some((x) => x.textoOriginal) && <td style={{ fontSize: "0.8rem", color: "var(--text-muted)", maxWidth: "280px" }}>{f.textoOriginal}</td>}
                    <td>
                      <button type="button" className="btn btn-secondary" style={{ padding: "4px 10px" }} onClick={() => setBorrador({ ...borrador, filas: borrador.filas.filter((_, j) => j !== i) })} title="Quitar fila">
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <button type="button" className="btn btn-secondary" onClick={() => setBorrador({ ...borrador, filas: [...borrador.filas, filaVacia()] })}>
              + Añadir fila
            </button>
            <button type="button" className="btn btn-primary" disabled={trabajando} onClick={() => void guardar()}>
              {trabajando ? "Guardando…" : "Guardar y comprobar"}
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => setBorrador(null)}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* ---------- Resultado del cruce ---------- */}
      {r && !r.hayLiquidacion && (
        <p style={{ color: "var(--warning)", margin: 0 }}>⚠️ No hay liquidación calculada de {nombreMes(mes)}: la app no tiene comisiones que comparar con la hoja.</p>
      )}
      {r && !r.rejilla && r.hayLiquidacion && (
        <p style={{ color: "var(--text-secondary)", margin: 0 }}>Todavía no has subido la rejilla de {nombreMes(mes)}. Hay {r.filas.length} coche(s) con comisión pendientes de validar.</p>
      )}
      {r?.rejilla && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "10px" }}>
            {[
              { t: "Cuadran", v: r.resumen.cuadran, c: "var(--success)" },
              { t: "Importe distinto", v: r.resumen.distintos, c: "var(--warning)" },
              { t: "Faltan en la hoja", v: r.resumen.faltan, c: "var(--danger, #ef4444)" },
              { t: "No están en la app", v: r.resumen.sobran + r.resumen.otroMes, c: "var(--warning)" },
              { t: "Sin importe", v: r.resumen.sinImporte, c: "var(--warning)" },
              { t: "Posibles duplicados", v: r.resumen.duplicados, c: "var(--danger, #ef4444)" },
            ].map((x) => (
              <div key={x.t} className="glass-panel" style={{ padding: "12px 14px" }}>
                <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>{x.t}</div>
                <div style={{ fontSize: "1.6rem", fontWeight: 700, color: x.v > 0 ? x.c : undefined }}>{x.v}</div>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: "24px", flexWrap: "wrap" }}>
            <span>Según la app: <b>{euros(r.resumen.importeApp)}</b></span>
            <span>Según la hoja: <b>{euros(r.resumen.importeHoja)}</b></span>
            <span>Diferencia: <b style={{ color: r.resumen.diferencia !== 0 ? "var(--warning)" : undefined }}>{euros(r.resumen.diferencia)}</b></span>
            <span style={{ color: "var(--text-muted)" }}>
              Hoja: {r.rejilla.origen}
              {r.rejilla.nombreArchivo ? ` · ${r.rejilla.nombreArchivo}` : ""} · {r.rejilla.filas} fila(s)
            </span>
          </div>
          {r.resumen.faltan > 0 && (
            <div style={{ padding: "12px 16px", borderLeft: "4px solid var(--danger, #ef4444)", background: "var(--bg-card)", borderRadius: "var(--radius-sm)" }}>
              ❌ <b>{r.resumen.faltan} coche(s) tienen comisión en la app pero no aparecen en la hoja de la empresa.</b> Revisa si se han quedado sin comisionar y márcalos como «reclamado» cuando lo comuniques.
            </div>
          )}
          <ResumenLiquidacion usuario={usuario} mes={mes} />
          {r.sinMatricula.length > 0 && (
            <div role="status" style={{ padding: "12px 16px", borderLeft: "4px solid var(--warning, #eab308)", background: "var(--bg-card)", borderRadius: "var(--radius-sm)" }}>
              🔎 <b>{r.sinMatricula.length} usado(s) de este mes no tienen matrícula</b>: {r.sinMatricula.map((u) => `${u.cliente ?? "Sin cliente"} (exp. ${u.idExpediente})`).join(", ")}. No es obligatoria al crear el expediente, pero sin ella no se puede cruzar con la hoja de la empresa: añádela cuando la tengas.
            </div>
          )}
          {r.resumen.duplicados > 0 && (
            <div role="alert" style={{ padding: "12px 16px", borderLeft: "4px solid var(--danger, #ef4444)", background: "rgba(239, 68, 68, 0.08)", borderRadius: "var(--radius-sm)" }}>
              🔁 <b>{r.resumen.duplicados} coche(s) parecen duplicados.</b> Su matrícula aparece también en la hoja de otro mes que tienes guardada, o está repetida con el mismo concepto e importe en esta hoja. Si la empresa te ha pagado dos veces el mismo coche, o lo ha movido de un mes a otro, aquí lo verás marcado con 🔁.
            </div>
          )}
          <div style={{ display: "flex", gap: "6px" }}>
            {(["incidencias", "todos"] as const).map((f) => (
              <button key={f} type="button" className={`btn ${filtro === f ? "btn-primary" : "btn-secondary"}`} style={{ padding: "6px 12px" }} onClick={() => setFiltro(f)}>
                {f === "incidencias" ? `Incidencias (${r.filas.filter((x) => x.estado !== "ok" || esDuplicada(x)).length})` : `Todos (${r.filas.length})`}
              </button>
            ))}
          </div>
          <TablaDatos<FilaComprobacion>
            id="validacion-rejilla"
            columnas={columnasFilas}
            filas={filas}
            clave={(f) => f.clave + (f.idExpediente ?? "")}
            placeholder="Buscar por matrícula, cliente, marca, modelo, resultado…"
            vacio={filtro === "incidencias" ? "🎉 Sin incidencias: todos los coches cuadran con la hoja." : "No hay filas."}
            textoExtra={(f) => `${f.nota ?? ""} ${ETIQUETA[f.estado].texto}`}
            pie={(fs) => ({
              matricula: `${fs.length} fila${fs.length === 1 ? "" : "s"}`,
              app: euros(fs.reduce((t, f) => t + f.importeApp, 0)),
              hoja: euros(fs.reduce((t, f) => t + (f.importeHoja ?? 0), 0)),
              diferencia: euros(fs.reduce((t, f) => t + f.diferencia, 0)),
            })}
          />
        </>
      )}
    </Seccion>
  );
}
