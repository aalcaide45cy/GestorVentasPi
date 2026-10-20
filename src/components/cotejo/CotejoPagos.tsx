"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useToast } from "@/components/Toast";
import { llamar, textoError } from "@/components/comisiones/api";
import { useCarga } from "@/components/comisiones/useCarga";
import { esperarTarea, refrescarTareas } from "@/lib/tareas-cliente";
import { ajustarLecturas, cotejarPagos, filasDelMes, filasSinMes, resumenPorMes, sugerirMes, type CocheCotejo, type EstadoCotejo, type FilaCotejo, type PagoRejilla } from "@/lib/cotejo-pagos";
import { leerListadoVentas, type FilaListado } from "@/lib/contraste-listado";
import { formatDate } from "@/lib/date-utils";
import { euros, mesActual, nombreMes, sumarMeses } from "@/lib/formato";
import { usePreferencia } from "@/lib/preferencias";
import { normalizarMatricula } from "@/lib/rejilla/analizar";
import TablaDatos, { type ColumnaTabla } from "@/components/TablaDatos";
import ControlesLectura from "@/components/documentos/ControlesLectura";
import { columnasVehiculo } from "@/components/etiquetas";
import type { ExpedienteDto } from "@/lib/dto";
import type { DatosCotejo } from "@/lib/servicios/cotejo";
import type { MatriculaLeida } from "@/lib/servicios/ocr-rejilla";
import MiMes from "./MiMes";

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

interface Props {
  expedientes: ExpedienteDto[];
  vendedores: { id: number; nombre: string }[];
  idUsuarioActual: number;
  esAdministrador: boolean;
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
const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const mesCorto = (m: string) => `${MESES_CORTOS[Number(m.slice(5, 7)) - 1]} ${m.slice(2, 4)}`;
const esMes = (m: string | null | undefined): m is string => /^\d{4}-(0[1-9]|1[0-2])$/.test(m ?? "");

/**
 * Cotejo de un mes en una sola vista: arriba se elige el mes (con el estado de cada uno de un vistazo), a un lado la rejilla de la empresa de
 * ese mes (subirla, revisar lo leído y guardarla) y en el centro los coches del mes con su resultado. Mientras la rejilla leída no se guarda, el
 * cotejo ya se calcula con ella (vista previa), así se ve el resultado al instante y se corrige lo mal leído antes de guardar.
 */
export default function CotejoPagos({ expedientes, vendedores, idUsuarioActual, esAdministrador }: Props) {
  const { mostrar, confirmar } = useToast();
  const [idVendedor, setIdVendedor] = useState(idUsuarioActual);
  const { datos, recargar } = useCarga<DatosCotejo>(`/api/cotejo?usuario=${idVendedor}`, { coches: [], pagos: [], rejillas: [] });
  const [mesGuardado, guardarMes] = usePreferencia("cotejo-mes");
  const mes = esMes(mesGuardado) ? mesGuardado : mesActual();
  const [borradores, setBorradores] = useState<Borrador[]>([]);
  const [listados, setListados] = useState<Listado[]>([]);
  const [trabajando, setTrabajando] = useState(false);
  const [arrastrando, setArrastrando] = useState(false);
  const [filtro, setFiltro] = useState<"todos" | EstadoCotejo>("todos");
  const [verSinMatricula, setVerSinMatricula] = useState(false);
  const carril = useRef<HTMLDivElement>(null);

  const cochesTodos = useMemo(() => [...datos.coches, ...listados.flatMap((l) => l.coches)], [datos.coches, listados]);
  const borradoresConMes = useMemo(() => borradores.filter((b) => esMes(b.mes)), [borradores]);

  // Los pagos con los que se cotejará: los guardados, salvo los meses que tengan una rejilla leída sin guardar (esa manda, como vista previa)
  const pagos: PagoRejilla[] = useMemo(() => {
    const enBorrador = new Set(borradoresConMes.map((b) => b.mes));
    const guardados = datos.pagos.filter((p) => !enBorrador.has(p.mes));
    const provisionales = borradoresConMes.flatMap((b) => [...new Set(b.filas.map((f) => normalizarMatricula(f.matricula)).filter(Boolean))].map((matricula) => ({ mes: b.mes, matricula, importe: null })));
    return [...guardados, ...provisionales];
  }, [datos.pagos, borradoresConMes]);
  const resultado = useMemo(() => cotejarPagos(cochesTodos, pagos), [cochesTodos, pagos]);
  const resumenes = useMemo(() => resumenPorMes(resultado.filas), [resultado.filas]);

  // Meses que se ofrecen arriba: los que tienen coches o rejilla, el elegido y el actual
  const meses = useMemo(() => {
    const s = new Set<string>([...resumenes.keys(), ...resultado.mesesConRejilla, mes, mesActual()]);
    return [...s].filter(esMes).sort();
  }, [resumenes, resultado.mesesConRejilla, mes]);
  const mesesGuardados = useMemo(() => new Set(datos.rejillas.map((r) => r.mes)), [datos.rejillas]);
  const mesesEnBorrador = useMemo(() => new Set(borradoresConMes.map((b) => b.mes)), [borradoresConMes]);

  // El mes elegido se deja a la vista en el carril de meses
  useEffect(() => {
    carril.current?.querySelector<HTMLElement>('[aria-current="true"]')?.scrollIntoView({ inline: "center", block: "nearest" });
  }, [mes, meses.length]);

  const filasMes = useMemo(() => filasDelMes(resultado.filas, mes), [resultado.filas, mes]);
  const filas = filasMes.filter((f) => filtro === "todos" || f.estado === filtro);
  const resumen = resumenes.get(mes) ?? { total: 0, pagados: 0, dudosos: 0, noPagados: 0, sinRejilla: 0 };
  const sinFecha = useMemo(() => filasSinMes(resultado.filas), [resultado.filas]);
  const hayRejilla = mesesGuardados.has(mes) || mesesEnBorrador.has(mes);
  const rejillaMes = datos.rejillas.find((r) => r.mes === mes);
  const borradorMes = borradores.find((b) => b.mes === mes);
  const otrosBorradores = borradores.filter((b) => b.mes !== mes);

  /** Resuelve una lectura dudosa de la rejilla ya guardada: se corrige la matrícula o se confirma que estaba bien leída. */
  const resolver = async (f: FilaCotejo, accion: "corregir" | "confirmar") => {
    if (!f.matriculaHoja || !f.mesRejilla) return;
    setTrabajando(true);
    try {
      await llamar(`/api/cotejo/rejillas/lectura?usuario=${idVendedor}`, { method: "POST", cuerpo: { mes: f.mesRejilla, accion, de: f.matriculaHoja, a: accion === "corregir" ? f.matricula : undefined } });
      mostrar(accion === "corregir" ? `Lectura corregida: ${f.matriculaHoja} → ${f.matricula}.` : "Lectura confirmada.");
      recargar();
    } catch (e) {
      mostrar(textoError(e), "error");
    } finally {
      setTrabajando(false);
    }
  };

  /* ---------------- Rejillas (PDF o imagen) ---------------- */
  const subirRejillas = async (archivos: FileList | File[] | null) => {
    const lista = archivos ? Array.from(archivos) : [];
    if (lista.length === 0) return;
    setTrabajando(true);
    try {
      // Todas las hojas se ponen primero en la cola de segundo plano del servidor (que las lee de una en una, por orden) y se van recogiendo según terminan
      const enCola: { f: File; tarea: string }[] = [];
      for (const f of lista) {
        if (!esPdf(f) && !esImagen(f)) {
          mostrar(`«${f.name}» no es un PDF ni una imagen.`, "error");
          continue;
        }
        const r = await fetch(`/api/cotejo/leer?asincrono=1&nombre=${encodeURIComponent(f.name)}`, { method: "POST", headers: { "Content-Type": f.type || "application/pdf" }, body: f, credentials: "same-origin" });
        const json = (await r.json().catch(() => ({}))) as { message?: string; tarea?: string };
        if (!r.ok || !json.tarea) {
          mostrar(`${f.name}: ${json.message ?? `Error ${r.status}`}`, "error");
          continue;
        }
        enCola.push({ f, tarea: json.tarea });
      }
      await refrescarTareas();
      const nuevos: Borrador[] = [];
      for (const { f, tarea } of enCola) {
        let paginas: { matriculas: MatriculaLeida[] }[];
        try {
          paginas = (await esperarTarea<{ paginas: { matriculas: MatriculaLeida[] }[] }>(tarea)).paginas;
        } catch (e) {
          mostrar(`${f.name}: ${textoError(e)}`, "error");
          continue;
        }
        const hechos: Borrador[] = [];
        paginas.forEach((p, i) => {
          if (p.matriculas.length === 0) mostrar(`No he podido leer ninguna matrícula en «${f.name}»${paginas.length > 1 ? ` (página ${i + 1})` : ""}. Puedes escribirlas a mano.`, "error");
          const sugerido = sugerirMes(p.matriculas.map((m) => m.matricula), cochesTodos);
          hechos.push({
            clave: `${f.name}-${i}-${Date.now()}`,
            nombreArchivo: paginas.length > 1 ? `${f.name} (pág. ${i + 1})` : f.name,
            // Si la hoja no deja adivinar su mes, se supone que es el que se está mirando
            mes: sugerido ?? mes,
            filas: ajustarLecturas(p.matriculas.map((m) => ({ matricula: m.matricula, confianza: m.valida ? m.confianza : 0 })), cochesTodos.map((c) => c.matricula)),
          });
        });
        // Cada hoja aparece en cuanto se lee, sin esperar a las demás
        nuevos.push(...hechos);
        setBorradores((b) => [...b, ...hechos]);
        // Se salta al mes de la primera rejilla leída para ver enseguida su cotejo
        if (nuevos.length === hechos.length && hechos.length > 0 && hechos[0].mes !== mes) guardarMes(hechos[0].mes);
      }
    } catch (e) {
      mostrar(textoError(e), "error");
    } finally {
      setTrabajando(false);
    }
  };

  const editar = (clave: string, cambio: Partial<Borrador>) => {
    setBorradores((b) => b.map((x) => (x.clave === clave ? { ...x, ...cambio } : x)));
    if (cambio.mes && esMes(cambio.mes)) guardarMes(cambio.mes);
  };

  const guardar = async (b: Borrador) => {
    const matriculas = b.filas.map((f) => f.matricula.trim()).filter(Boolean);
    if (!esMes(b.mes)) return mostrar("Indica el mes de la rejilla antes de guardarla.", "error");
    if (matriculas.length === 0) return mostrar("La rejilla no tiene ninguna matrícula.", "error");
    const existente = datos.rejillas.find((r) => r.mes === b.mes);
    if (existente && !await confirmar({ texto: `Ya hay una rejilla guardada de ${nombreMes(b.mes)} (${existente.filas} matrículas). ¿La sustituyo por esta?` })) return;
    setTrabajando(true);
    try {
      await llamar(`/api/cotejo/rejillas?usuario=${idVendedor}`, { method: "PUT", cuerpo: { mes: b.mes, nombreArchivo: b.nombreArchivo, origen: "pdf", matriculas } });
      setBorradores((x) => x.filter((y) => y.clave !== b.clave));
      mostrar(`Rejilla de ${nombreMes(b.mes)} guardada.`);
      recargar();
    } catch (e) {
      mostrar(textoError(e), "error");
    } finally {
      setTrabajando(false);
    }
  };

  const borrar = async (m: string) => {
    if (!await confirmar({ texto: `¿Quito la rejilla de ${nombreMes(m)}? Los coches de ese mes volverán a salir sin rejilla.` })) return;
    try {
      await llamar(`/api/cotejo/rejillas?mes=${m}&usuario=${idVendedor}`, { method: "DELETE" });
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
        const filasListado = leerListadoVentas(await f.arrayBuffer());
        nuevos.push({ nombre: f.name, coches: filasListado.map(cocheDeListado) });
      }
      setListados((l) => [...l, ...nuevos]);
    } catch (e) {
      mostrar(textoError(e), "error");
    }
  };

  /* ---------------- Tablas ---------------- */
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
          {f.estado === "dudoso" && f.matriculaHoja && f.mesRejilla && mesesGuardados.has(f.mesRejilla) && !mesesEnBorrador.has(f.mesRejilla) && (
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
    ...columnasVehiculo<FilaCotejo>((f) => ({ clase: f.coche ? (f.coche.usado ? "VO" : "VN") : null, marca: f.coche?.marca, modelo: f.coche?.modelo, estado: f.coche?.estado, tipoPago: f.coche?.tipo_pago }), { vacio: sinCoche }),
    { clave: "fechaClave", etiqueta: "F. matric. / afect.", valor: (f) => (f.coche?.usado ? f.coche.f_afectacion : f.coche?.f_matriculacion) ?? "", celda: (f) => (f.coche ? fecha((f.coche.usado ? f.coche.f_afectacion : f.coche.f_matriculacion) ?? null) : "-"), ayuda: "Fecha de afectación en los usados y de matriculación en los nuevos" },
    { clave: "entrega", etiqueta: "F. entrega", valor: (f) => f.coche?.f_entrega ?? "", celda: (f) => (f.coche ? fecha(f.coche.f_entrega) : "-") },
    { clave: "mes", etiqueta: "Rejilla de", valor: (f) => f.mesRejilla ?? "", celda: (f) => (f.mesRejilla ? nombreMes(f.mesRejilla) : "-"), oculta: true },
    { clave: "importe", etiqueta: "Importe en la hoja", valor: (f) => f.importe ?? -1, celda: (f) => (f.importe === null ? "-" : euros(f.importe)), alinear: "right", oculta: true },
  ];
  const columnasSinMatricula: ColumnaTabla<CocheCotejo>[] = [
    { clave: "origen", etiqueta: "Origen", valor: (c) => (c.origen === "app" ? `Expediente #${c.id_expediente}` : "Listado") },
    { clave: "cliente", etiqueta: "Cliente", valor: (c) => c.cliente },
    ...columnasVehiculo<CocheCotejo>((c) => ({ clase: c.usado ? "VO" : "VN", marca: c.marca, modelo: c.modelo, estado: c.estado || "Sin matricular" }), { sin: ["tipoPago"] }),
    { clave: "fExp", etiqueta: "F. expediente", valor: (c) => c.f_expediente ?? "", celda: (c) => fecha(c.f_expediente) },
    { clave: "fEntrega", etiqueta: "F. entrega", valor: (c) => c.f_entrega ?? "", celda: (c) => fecha(c.f_entrega) },
  ];

  const tablaResultado = (id: string, lista: FilaCotejo[], vacio: string) => (
    <TablaDatos<FilaCotejo>
      id={id}
      columnas={columnasResultado}
      filas={lista}
      clave={(f) => `${f.matricula}-${f.estado}-${f.mesRejilla ?? ""}`}
      placeholder="Buscar por matrícula, cliente, marca, modelo, resultado…"
      vacio={vacio}
      estiloFila={(f) => ({ background: COLORES[f.estado].fondo, boxShadow: `inset 4px 0 0 ${COLORES[f.estado].borde}` })}
      textoExtra={(f) => f.motivo}
      pie={(fs) => ({ resultado: `${fs.length} fila${fs.length === 1 ? "" : "s"}` })}
    />
  );

  /** Estado de una matrícula de la rejilla leída frente a los coches de ese mes (para ver de un vistazo qué cuadra). */
  const coincidencia = (m: string): { icono: string; ayuda: string } => {
    const clave = normalizarMatricula(m);
    if (!clave) return { icono: "", ayuda: "" };
    const f = resultado.filas.find((x) => x.matricula === clave && x.coche);
    if (!f?.coche) return { icono: "❔", ayuda: "No es la matrícula de ningún coche tuyo: ¿está mal leída o falta el expediente?" };
    return { icono: "✔", ayuda: `${f.coche.cliente} · ${[f.coche.marca, f.coche.modelo].filter(Boolean).join(" ")}` };
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      {/* 1. Mes y vendedor */}
      <section className="glass-panel" style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: "12px" }}>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
          <button type="button" className="btn btn-secondary" onClick={() => guardarMes(sumarMeses(mes, -1))} title="Mes anterior">
            ◀
          </button>
          <input type="month" className="form-input" value={mes} onChange={(e) => esMes(e.target.value) && guardarMes(e.target.value)} style={{ width: "auto", fontWeight: 700 }} aria-label="Mes que se coteja" />
          <button type="button" className="btn btn-secondary" onClick={() => guardarMes(sumarMeses(mes, 1))} title="Mes siguiente">
            ▶
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => guardarMes(mesActual())} disabled={mes === mesActual()}>
            Mes actual
          </button>
          <h2 style={{ margin: "0 0 0 6px", fontSize: "1.15rem" }}>{nombreMes(mes)}</h2>
          {esAdministrador && vendedores.length > 1 && (
            <label style={{ display: "flex", gap: "8px", alignItems: "center", fontSize: "0.85rem", marginLeft: "auto" }}>
              Vendedor
              <select className="form-input" value={idVendedor} onChange={(e) => { setIdVendedor(Number(e.target.value)); setBorradores([]); }}>
                {vendedores.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.nombre}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        {/* Carril de meses: cada uno con su rejilla y lo que falta por revisar */}
        <div ref={carril} role="tablist" aria-label="Meses" style={{ display: "flex", gap: "6px", overflowX: "auto", paddingBottom: "4px" }}>
          {meses.map((m) => {
            const r = resumenes.get(m);
            const seleccionado = m === mes;
            const conRejilla = mesesGuardados.has(m) || mesesEnBorrador.has(m);
            return (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={seleccionado}
                aria-current={seleccionado ? "true" : undefined}
                onClick={() => guardarMes(m)}
                title={`${nombreMes(m)}: ${r ? `${r.total} coche(s)` : "sin coches"} · ${mesesEnBorrador.has(m) ? "rejilla leída sin guardar" : mesesGuardados.has(m) ? "con rejilla" : "sin rejilla"}${r && r.noPagados ? ` · ${r.noPagados} sin pagar` : ""}${r && r.dudosos ? ` · ${r.dudosos} dudoso(s)` : ""}`}
                className={seleccionado ? "btn btn-primary" : "btn btn-secondary"}
                style={{ flexShrink: 0, padding: "5px 10px", display: "flex", flexDirection: "column", alignItems: "center", gap: "2px", minWidth: "74px", fontSize: "0.82rem" }}
              >
                <span style={{ fontWeight: 700 }}>{mesCorto(m)}</span>
                <span style={{ fontSize: "0.68rem", display: "flex", gap: "5px", opacity: 0.95 }}>
                  <span title={conRejilla ? "Tiene rejilla" : "Sin rejilla"}>{mesesEnBorrador.has(m) ? "📝" : conRejilla ? "📄" : "▫️"}</span>
                  {r?.noPagados ? <span>🔴{r.noPagados}</span> : null}
                  {r?.dudosos ? <span>🟡{r.dudosos}</span> : null}
                  {r && r.total > 0 && !r.noPagados && !r.dudosos && !r.sinRejilla ? <span>🟢{r.total}</span> : null}
                  {r?.sinRejilla ? <span>⚪{r.sinRejilla}</span> : null}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* 2. Rejilla del mes + resultado */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 380px), 1fr))", gap: "16px", alignItems: "start" }}>
        <section
          className="glass-panel"
          style={{ padding: "16px", display: "flex", flexDirection: "column", gap: "12px", outline: arrastrando ? "2px dashed var(--primary)" : undefined, outlineOffset: "-6px", gridColumn: "span 1" }}
          onDragOver={(e) => { e.preventDefault(); setArrastrando(true); }}
          onDragLeave={() => setArrastrando(false)}
          onDrop={(e) => { e.preventDefault(); setArrastrando(false); void subirRejillas(e.dataTransfer.files); }}
        >
          <h3 style={{ margin: 0, fontSize: "1.02rem" }}>📄 Rejilla de {nombreMes(mes)}</h3>

          {borradorMes ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <div style={{ background: "rgba(234, 179, 8, 0.14)", borderLeft: "4px solid #eab308", padding: "8px 10px", borderRadius: "var(--radius-sm)", fontSize: "0.82rem" }}>
                <b>{borradorMes.nombreArchivo}</b>: leída, <b>sin guardar</b>. El resultado de la derecha ya la usa como vista previa. Revisa las matrículas (amarillo o rojo = lectura dudosa) y guarda.
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                {borradorMes.filas.map((f, i) => {
                  const c = coincidencia(f.matricula);
                  return (
                    <div key={i} style={{ display: "flex", gap: "4px", alignItems: "center" }}>
                      <span title={c.ayuda} style={{ width: "16px", textAlign: "center", fontSize: "0.85rem", color: c.icono === "✔" ? "var(--success)" : "var(--warning)" }}>
                        {c.icono}
                      </span>
                      <input
                        className="form-input"
                        style={{ width: "108px", padding: "6px 8px", fontWeight: 600, background: f.confianza >= 90 ? undefined : f.confianza >= 50 ? "rgba(234, 179, 8, 0.25)" : "rgba(239, 68, 68, 0.25)" }}
                        value={f.matricula}
                        aria-label={`Matrícula ${i + 1}`}
                        title={f.corregidaDe ? `La hoja se leyó como ${f.corregidaDe}; se ha cambiado por la matrícula de un coche tuyo muy parecida. Revísalo.` : c.ayuda || undefined}
                        onChange={(e) => editar(borradorMes.clave, { filas: borradorMes.filas.map((x, j) => (j === i ? { matricula: e.target.value.toUpperCase(), confianza: 100 } : x)) })}
                      />
                      <button type="button" className="btn btn-secondary" style={{ padding: "2px 8px" }} title="Quitar esta matrícula" onClick={() => editar(borradorMes.clave, { filas: borradorMes.filas.filter((_, j) => j !== i) })}>
                        ✕
                      </button>
                    </div>
                  );
                })}
                <button type="button" className="btn btn-secondary" style={{ padding: "4px 10px" }} onClick={() => editar(borradorMes.clave, { filas: [...borradorMes.filas, { matricula: "", confianza: 100 }] })}>
                  ＋ Añadir matrícula
                </button>
              </div>
              <label style={{ display: "flex", gap: "8px", alignItems: "center", fontSize: "0.82rem" }}>
                Mes de esta rejilla
                <input className="form-input" type="month" style={{ width: "auto" }} value={borradorMes.mes} onChange={(e) => editar(borradorMes.clave, { mes: e.target.value })} />
              </label>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                <button type="button" className="btn btn-primary" disabled={trabajando} onClick={() => void guardar(borradorMes)}>
                  💾 Guardar rejilla
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => setBorradores((x) => x.filter((y) => y.clave !== borradorMes.clave))}>
                  Descartar
                </button>
              </div>
            </div>
          ) : rejillaMes ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <div style={{ fontSize: "0.88rem" }}>
                ✅ Guardada: <b>{rejillaMes.filas} matrículas</b>
                {rejillaMes.nombreArchivo ? ` · ${rejillaMes.nombreArchivo}` : ""}
              </div>
              <div style={{ color: "var(--text-secondary)", fontSize: "0.8rem" }}>Para ver o corregir sus filas, usa la pestaña «Mis rejillas». Si subes otra hoja de este mes, sustituirá a esta.</div>
              <div>
                <button type="button" className="btn btn-secondary" style={{ padding: "4px 10px" }} onClick={() => void borrar(mes)}>
                  Quitar esta rejilla
                </button>
              </div>
            </div>
          ) : (
            <div style={{ color: "var(--text-secondary)", fontSize: "0.88rem" }}>Todavía no has subido la rejilla de este mes: sin ella la app no puede decirte qué coches no te han pagado.</div>
          )}

          <label className="btn btn-primary" style={{ cursor: trabajando ? "wait" : "pointer", textAlign: "center", justifyContent: "center" }}>
            {trabajando ? "⏳ Leyendo en segundo plano…" : borradorMes || rejillaMes ? "📄 Subir otra hoja (PDF o foto)" : `📄 Subir la rejilla de ${mesCorto(mes)} (PDF o foto)`}
            <input type="file" multiple accept=".pdf,image/*" style={{ display: "none" }} disabled={trabajando} onChange={(e) => { void subirRejillas(e.target.files); e.target.value = ""; }} />
          </label>
          <div style={{ color: "var(--text-muted)", fontSize: "0.78rem" }}>También puedes arrastrar el archivo aquí. La lectura tarda unos segundos por hoja y no guarda nada hasta que pulses «Guardar rejilla».</div>
          <ControlesLectura parte="motor" />

          {otrosBorradores.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: "6px", borderTop: "1px solid var(--border-light)", paddingTop: "10px" }}>
              <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>Otras hojas leídas, sin guardar:</div>
              {otrosBorradores.map((b) => (
                <div key={b.clave} style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap", fontSize: "0.82rem" }}>
                  <span style={{ flex: "1 1 140px", overflowWrap: "anywhere" }}>
                    {b.nombreArchivo} · {b.filas.length} matrículas
                  </span>
                  <button type="button" className="btn btn-secondary" style={{ padding: "3px 10px" }} onClick={() => guardarMes(esMes(b.mes) ? b.mes : mes)} disabled={!esMes(b.mes)}>
                    Ir a {esMes(b.mes) ? mesCorto(b.mes) : "su mes"}
                  </button>
                  <button type="button" className="btn btn-secondary" style={{ padding: "3px 8px" }} title="Descartar esta hoja" onClick={() => setBorradores((x) => x.filter((y) => y.clave !== b.clave))}>
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="glass-panel" style={{ padding: "16px", display: "flex", flexDirection: "column", gap: "12px", minWidth: 0 }}>
          <h3 style={{ margin: 0, fontSize: "1.02rem" }}>🚗 Resultado de {nombreMes(mes)}</h3>
          {resumen.total === 0 && !hayRejilla ? (
            <p style={{ margin: 0, color: "var(--text-secondary)" }}>Este mes no hay coches con fecha para cobrar y todavía no hay rejilla. Sube la hoja o elige otro mes.</p>
          ) : (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: "8px" }}>
                {([["todos", "Todos", resumen.total, "var(--primary)", "🚗"], ["no_pagado", "No pagados", resumen.noPagados, COLORES.no_pagado.borde, COLORES.no_pagado.icono], ["dudoso", "Dudosos", resumen.dudosos, COLORES.dudoso.borde, COLORES.dudoso.icono], ["pagado", "Pagados", resumen.pagados, COLORES.pagado.borde, COLORES.pagado.icono], ["sin_rejilla", "Sin rejilla", resumen.sinRejilla, COLORES.sin_rejilla.borde, COLORES.sin_rejilla.icono]] as const).map(([id, texto, n, color, icono]) => (
                  <button
                    key={id}
                    type="button"
                    aria-pressed={filtro === id}
                    onClick={() => setFiltro(id)}
                    className={filtro === id ? "btn btn-primary" : "btn btn-secondary"}
                    style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: "2px", padding: "8px 12px", borderLeft: `4px solid ${color}`, opacity: n === 0 && filtro !== id ? 0.55 : 1 }}
                  >
                    <span style={{ fontSize: "1.35rem", fontWeight: 800, lineHeight: 1.1 }}>{n}</span>
                    <span style={{ fontSize: "0.78rem" }}>
                      {icono} {texto}
                    </span>
                  </button>
                ))}
              </div>
              {!hayRejilla && resumen.total > 0 && <div style={{ color: "var(--text-secondary)", fontSize: "0.85rem" }}>Estos son los coches que deberían cobrarse este mes. Sube la rejilla para saber cuáles te han pagado.</div>}
              {hayRejilla && resumen.noPagados + resumen.dudosos === 0 && resumen.total > 0 && <div style={{ color: "var(--success)", fontSize: "0.88rem" }}>✅ Todos los coches de este mes aparecen en la rejilla.</div>}
              {resumen.noPagados > 0 && <div style={{ color: "var(--danger)", fontSize: "0.88rem" }}>🔴 {resumen.noPagados} coche(s) no aparecen en la rejilla: es lo que hay que reclamar.</div>}
            </>
          )}
        </section>
      </div>

      {(resumen.total > 0 || filasMes.length > 0) && (
        <section className="glass-panel" style={{ padding: "16px", display: "flex", flexDirection: "column", gap: "10px", minWidth: 0 }}>
          <h3 style={{ margin: 0, fontSize: "1.02rem" }}>
            Coches de {nombreMes(mes)}
            {filtro !== "todos" ? ` · ${COLORES[filtro].texto}` : ""}
          </h3>
          {tablaResultado("cotejo-resultado", filas, "No hay nada en esta categoría.")}
        </section>
      )}

      {/* 3. Con la hoja delante: marcar a mano y ver importes */}
      <details className="glass-panel" style={{ padding: "12px 16px" }}>
        <summary style={{ cursor: "pointer", fontWeight: 600 }}>✔ Con la hoja delante: marcar a mano y ver lo que te corresponde por cada coche</summary>
        <div style={{ marginTop: "12px" }}>
          <MiMes expedientes={expedientes} vendedores={vendedores} idUsuarioActual={idUsuarioActual} esAdministrador={esAdministrador} integrada={{ idVendedor }} />
        </div>
      </details>

      {/* 4. Otros coches */}
      <details className="glass-panel" style={{ padding: "12px 16px" }}>
        <summary style={{ cursor: "pointer", fontWeight: 600 }}>
          📊 Añadir coches desde un listado del fabricante (Excel){listados.length > 0 ? ` · ${listados.length}` : ""}
        </summary>
        <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: "12px" }}>
          <p style={{ margin: 0, color: "var(--text-secondary)", fontSize: "0.88rem" }}>
            Para cotejar también las ventas que aún no están como expedientes en la app. Se leen en tu navegador y no se guardan: hay que volver a subirlos cada vez. Ahora se cotejan {datos.coches.length} expedientes de la app.
          </p>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
            <label className="btn btn-secondary" style={{ cursor: "pointer" }}>
              📊 Subir listados (Excel)
              <input type="file" multiple accept=".xlsx,.xls" style={{ display: "none" }} onChange={(e) => { void subirListados(e.target.files); e.target.value = ""; }} />
            </label>
            {listados.map((l, i) => (
              <span key={i} className="glass-panel" style={{ padding: "6px 10px", fontSize: "0.85rem", display: "inline-flex", gap: "8px", alignItems: "center" }}>
                {l.nombre} · {l.coches.length} filas
                <button type="button" onClick={() => setListados((x) => x.filter((_, j) => j !== i))} title="Quitar" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-secondary)" }}>
                  ✕
                </button>
              </span>
            ))}
          </div>
        </div>
      </details>

      {/* 5. Lo que no se puede asignar a un mes */}
      {(sinFecha.length > 0 || resultado.sinMatricula.length > 0) && (
        <section className="glass-panel" style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: "10px" }}>
          <h3 style={{ margin: 0, fontSize: "1rem" }}>Sin mes o sin matrícula</h3>
          {sinFecha.length > 0 && (
            <details>
              <summary style={{ cursor: "pointer" }}>Sin fecha para saber en qué mes cobrarlos ({sinFecha.length})</summary>
              <div style={{ marginTop: "8px" }}>{tablaResultado("cotejo-sin-fecha", sinFecha, "Nada.")}</div>
            </details>
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
      )}
    </div>
  );
}
