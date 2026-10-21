"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useToast } from "@/components/Toast";
import { llamar, textoError } from "@/components/comisiones/api";
import { useCarga } from "@/components/comisiones/useCarga";
import { SIN_ESTADO, editarBorrador, leerRejillas, quitarBorrador, quitarHoja, releerHoja, subirHojas, suscribirRejillas, usarContextoRejillas, type BorradorRejilla, type HojaEnCola } from "@/lib/rejillas-lectura-cliente";
import { cotejarPagos, diaClave, filasDelMes, filasSinMes, resumenPorMes, type CocheCotejo, type EstadoCotejo, type FilaCotejo, type PagoRejilla } from "@/lib/cotejo-pagos";
import { leerListadoVentas, type FilaListado } from "@/lib/contraste-listado";
import { formatDate } from "@/lib/date-utils";
import { euros, mesActual, nombreMes, sumarMeses } from "@/lib/formato";
import { usePreferencia } from "@/lib/preferencias";
import { normalizarMatricula } from "@/lib/rejilla/analizar";
import TablaDatos, { type ColumnaTabla } from "@/components/TablaDatos";
import SelectorMotorRelectura, { useMotorDeRelectura } from "@/components/documentos/SelectorMotorRelectura";
import { columnasVehiculo } from "@/components/etiquetas";
import type { ExpedienteDto } from "@/lib/dto";
import type { DatosCotejo } from "@/lib/servicios/cotejo";
import CalendarioCotejo from "./CalendarioCotejo";
import MiMes from "./MiMes";

type Borrador = BorradorRejilla;

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
  const [idElegido, setIdVendedor] = useState<number | null>(null);
  const [mesGuardado, guardarMes] = usePreferencia("cotejo-mes");
  // Si se llega desde el aviso del menú (círculo rojo de «Comisiones»), se abre ya con el vendedor de ese aviso; al salir se olvida
  const [vendedorAviso, guardarVendedorAviso] = usePreferencia("cotejo-vendedor");
  const montado = useRef(false);
  useEffect(() => {
    montado.current = true;
    return () => {
      montado.current = false;
      // (con un instante de margen: el modo estricto de desarrollo desmonta y vuelve a montar al instante)
      setTimeout(() => {
        if (!montado.current) guardarVendedorAviso("");
      }, 50);
    };
  }, [guardarVendedorAviso]);
  const idAviso = esAdministrador && vendedorAviso && vendedores.some((v) => v.id === Number(vendedorAviso)) ? Number(vendedorAviso) : null;
  // El vendedor elegido se recuerda: al cambiar de pestaña y volver no se vuelve a «uno mismo»
  const [vendedorRecordado, recordarVendedor] = usePreferencia("cotejo-vendedor-elegido");
  const idRecordado = esAdministrador && vendedorRecordado && vendedores.some((v) => v.id === Number(vendedorRecordado)) ? Number(vendedorRecordado) : null;
  const idVendedor = idElegido ?? idAviso ?? idRecordado ?? idUsuarioActual;
  const { datos, recargar } = useCarga<DatosCotejo>(`/api/cotejo?usuario=${idVendedor}`, { coches: [], pagos: [], rejillas: [] });
  const mes = esMes(mesGuardado) ? mesGuardado : mesActual();
  // Las hojas en lectura y los borradores viven fuera del componente: siguen su curso aunque se cambie de pestaña
  const { hojas, borradores } = useSyncExternalStore(suscribirRejillas, leerRejillas, () => SIN_ESTADO);
  const { motor: motorLectura } = useMotorDeRelectura();
  const saltoPendiente = useRef(false);
  const [listados, setListados] = useState<Listado[]>([]);
  const [trabajando, setTrabajando] = useState(false);
  const [arrastrando, setArrastrando] = useState(false);
  const [filtro, setFiltro] = useState<"todos" | EstadoCotejo>("todos");
  const [verSinMatricula, setVerSinMatricula] = useState(false);
  const [calendario, setCalendario] = useState(false);
  const [diaElegido, setDia] = useState<string | null>(null);
  // El filtro de día solo vale en el mes al que pertenece (al cambiar de mes desaparece)
  const dia = diaElegido && diaElegido.startsWith(mes) ? diaElegido : null;

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

  const mesesGuardados = useMemo(() => new Set(datos.rejillas.map((r) => r.mes)), [datos.rejillas]);
  const mesesEnBorrador = useMemo(() => new Set(borradoresConMes.map((b) => b.mes)), [borradoresConMes]);

  // La lectura (que sigue aunque se cambie de pestaña) necesita saber qué coches hay y qué mes se está mirando
  useEffect(() => {
    usarContextoRejillas({ coches: cochesTodos, mes, idVendedor, avisar: mostrar });
  }, [cochesTodos, mes, idVendedor, mostrar]);
  // Al terminar de leerse la primera hoja de una subida se salta a su mes, para ver enseguida su cotejo
  const prev = useRef(borradores.length);
  useEffect(() => {
    if (borradores.length > prev.current && saltoPendiente.current) {
      saltoPendiente.current = false;
      const nuevo = borradores[borradores.length - 1];
      if (esMes(nuevo.mes) && nuevo.mes !== mes) guardarMes(nuevo.mes);
    }
    prev.current = borradores.length;
  }, [borradores, mes, guardarMes]);


  const filasMes = useMemo(() => filasDelMes(resultado.filas, mes), [resultado.filas, mes]);
  const filas = filasMes.filter((f) => (filtro === "todos" || f.estado === filtro) && (!dia || (f.coche && diaClave(f.coche) === dia)));
  const resumen = resumenes.get(mes) ?? { total: 0, pagados: 0, dudosos: 0, noPagados: 0, sinRejilla: 0 };
  const sinFecha = useMemo(() => filasSinMes(resultado.filas), [resultado.filas]);
  const hayRejilla = mesesGuardados.has(mes) || mesesEnBorrador.has(mes);
  const rejillaMes = datos.rejillas.find((r) => r.mes === mes);
  const borradorMes = borradores.find((b) => b.mes === mes);
  const otrosBorradores = borradores.filter((b) => b.mes !== mes);
  const hojasEnCurso = hojas.filter((h) => h.estado === "en_cola" || h.estado === "leyendo").length;

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
  const subirRejillas = (archivos: FileList | File[] | null) => {
    const lista = archivos ? Array.from(archivos) : [];
    const validos = lista.filter((f) => {
      if (esPdf(f) || esImagen(f)) return true;
      mostrar(`«${f.name}» no es un PDF ni una imagen.`, "error");
      return false;
    });
    if (validos.length === 0) return;
    // Todas las hojas entran en la cola de lectura del servidor (de una en una, por orden); se puede seguir usando la aplicación
    saltoPendiente.current = true;
    subirHojas(validos, motorLectura);
  };

  const editar = (clave: string, cambio: Partial<Borrador>) => {
    editarBorrador(clave, cambio);
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
      quitarBorrador(b.clave);
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
              <select className="form-input" value={idVendedor} onChange={(e) => { setIdVendedor(Number(e.target.value)); recordarVendedor(e.target.value); borradores.forEach((b) => quitarBorrador(b.clave)); }}>
                {vendedores.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.nombre}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        {/* Calendario: todos los meses y días a la vista, con filtros */}
        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
          <button type="button" className="btn btn-primary" onClick={() => setCalendario(true)} title="Abre un calendario amplio con un botón por día y una bolita de color por coche, con filtros por resultado, tipo y texto">
            📆 Calendario…
          </button>
          <span style={{ fontSize: "0.8rem", color: "var(--text-muted)", display: "flex", gap: "12px", flexWrap: "wrap" }}>
            <span>{mesesEnBorrador.has(mes) ? "📝 rejilla leída sin guardar" : mesesGuardados.has(mes) ? "📄 con rejilla guardada" : "▫️ sin rejilla"}</span>
            {resumen.noPagados > 0 && <span>🔴 {resumen.noPagados} sin pagar</span>}
            {resumen.dudosos > 0 && <span>🟡 {resumen.dudosos} dudosos</span>}
            {resumen.sinRejilla > 0 && <span>⚪ {resumen.sinRejilla} sin rejilla</span>}
            {resumen.pagados > 0 && <span>🟢 {resumen.pagados} pagados</span>}
          </span>
          {dia && (
            <button type="button" className="btn btn-secondary" style={{ padding: "3px 10px", fontSize: "0.8rem" }} onClick={() => setDia(null)} title="Quitar el filtro de día y ver todo el mes">
              Solo el {formatDate(dia)} ✕
            </button>
          )}
        </div>
      </section>

      {calendario && (
        <CalendarioCotejo
          filas={resultado.filas}
          mes={mes}
          dia={dia}
          resumenes={resumenes}
          mesesGuardados={mesesGuardados}
          mesesEnBorrador={mesesEnBorrador}
          alAplicar={(m, d) => {
            guardarMes(m);
            setDia(d);
            setCalendario(false);
          }}
          alCerrar={() => setCalendario(false)}
        />
      )}

      {/* 2. Rejilla del mes + resultado */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 380px), 1fr))", gap: "16px", alignItems: "start" }}>
        <section
          className="glass-panel"
          style={{ padding: "16px", display: "flex", flexDirection: "column", gap: "12px", outline: arrastrando ? "2px dashed var(--primary)" : undefined, outlineOffset: "-6px", gridColumn: "span 1" }}
          onDragOver={(e) => { e.preventDefault(); setArrastrando(true); }}
          onDragLeave={() => setArrastrando(false)}
          onDrop={(e) => { e.preventDefault(); setArrastrando(false); subirRejillas(e.dataTransfer.files); }}
        >
          <h3 style={{ margin: 0, fontSize: "1.02rem" }}>📄 Rejilla de {nombreMes(mes)}</h3>
          {/* Los tres pasos, con el que toca ahora resaltado */}
          <ol style={{ display: "flex", gap: "6px", flexWrap: "wrap", listStyle: "none", margin: 0, padding: 0, fontSize: "0.78rem" }}>
            {["Sube la hoja", "Revisa lo leído", "Guarda la rejilla"].map((texto, k) => {
              // paso 1: subir; 2: se está leyendo o hay un borrador que revisar; 4: ya guardada
              const paso = borradorMes || hojasEnCurso > 0 ? 2 : rejillaMes ? 4 : 1;
              const hecho = k + 1 < paso;
              const ahora = k + 1 === paso;
              return (
                <li key={texto} style={{ padding: "3px 10px", borderRadius: "999px", border: `1px solid ${ahora ? "var(--primary)" : "var(--border-light)"}`, background: hecho ? "rgba(34, 197, 94, 0.14)" : ahora ? "rgba(var(--primary-rgb), 0.14)" : "transparent", color: hecho ? "var(--success)" : ahora ? "var(--primary)" : "var(--text-muted)", fontWeight: ahora ? 700 : 500 }}>
                  {hecho ? "✔" : k + 1}. {texto}
                </li>
              );
            })}
          </ol>

          {hojas.length > 0 && <ColaDeHojas hojas={hojas} motor={motorLectura} />}

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
                <button type="button" className="btn btn-secondary" disabled={!hojas.some((h) => h.id === borradorMes.idHoja)} onClick={() => releerHoja(borradorMes.idHoja, motorLectura)} title={hojas.some((h) => h.id === borradorMes.idHoja) ? "Vuelve a leer esta hoja con el motor elegido abajo (se pierden las correcciones que hayas hecho a mano)" : "El archivo ya no está en memoria (se recargó la página): vuelve a subirlo para releerlo"}>
                  🔄 Releer
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => quitarBorrador(borradorMes.clave)}>
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

          <label className="btn btn-primary" style={{ cursor: "pointer", textAlign: "center", justifyContent: "center" }}>
            {hojasEnCurso > 0 ? `📄 Subir más hojas (${hojasEnCurso} en lectura)` : borradorMes || rejillaMes ? "📄 Subir otra hoja (PDF o foto)" : `📄 Subir la rejilla de ${mesCorto(mes)} (PDF o foto)`}
            <input type="file" multiple accept=".pdf,image/*" style={{ display: "none" }} onChange={(e) => { subirRejillas(e.target.files); e.target.value = ""; }} />
          </label>
          <div style={{ color: "var(--text-muted)", fontSize: "0.78rem" }}>Puedes subir varias a la vez o arrastrarlas aquí: se leen en segundo plano, de una en una (puedes cambiar de pestaña). No se guarda nada hasta que pulses «Guardar rejilla».</div>
          <SelectorMotorRelectura etiqueta="Leer con" />

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
                  <button type="button" className="btn btn-secondary" style={{ padding: "3px 8px" }} title="Descartar esta hoja" onClick={() => quitarBorrador(b.clave)}>
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

const ESTADO_HOJA: Record<HojaEnCola["estado"], { icono: string; texto: string; color: string }> = {
  en_cola: { icono: "⏳", texto: "En cola, esperando su turno", color: "var(--text-secondary)" },
  leyendo: { icono: "📖", texto: "Leyendo…", color: "var(--primary)" },
  leida: { icono: "✅", texto: "Leída", color: "var(--success)" },
  error: { icono: "⚠️", texto: "No se ha podido leer", color: "var(--danger)" },
};

/** Cola de lectura de las hojas subidas: en qué punto está cada una, con releer (con otro motor si se quiere) y quitar. Sigue ahí aunque se cambie de pestaña. */
function ColaDeHojas({ hojas, motor }: { hojas: HojaEnCola[]; motor: string | undefined }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px", border: "1px solid var(--border-light)", borderRadius: "var(--radius-sm)", padding: "8px 10px" }}>
      <div style={{ fontSize: "0.8rem", fontWeight: 700 }}>Cola de lectura ({hojas.length})</div>
      {hojas.map((h) => {
        const e = ESTADO_HOJA[h.estado];
        const trabajando = h.estado === "en_cola" || h.estado === "leyendo";
        return (
          <div key={h.id} style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap", fontSize: "0.82rem" }}>
            <span style={{ flex: "1 1 150px", overflowWrap: "anywhere", fontWeight: 600 }} title={h.nombre}>
              {e.icono} {h.nombre}
            </span>
            <span style={{ color: e.color }}>
              {e.texto}
              {h.estado === "leida" && h.matriculas !== undefined ? `: ${h.matriculas} matrículas` : ""}
              {h.estado === "error" && h.error ? ` · ${h.error}` : ""}
            </span>
            {!trabajando && (
              <button type="button" className="btn btn-secondary" style={{ padding: "2px 8px" }} onClick={() => releerHoja(h.id, motor)} title="Vuelve a leer esta hoja con el motor elegido abajo («Leer con»)">
                🔄 Releer
              </button>
            )}
            <button type="button" className="btn btn-secondary" style={{ padding: "2px 8px" }} onClick={() => quitarHoja(h.id)} title={trabajando ? "Quita la hoja de la lista (su lectura se tirará al terminar)" : "Quita la hoja de la lista (lo leído se queda como borrador)"}>
              ✕
            </button>
          </div>
        );
      })}
    </div>
  );
}
