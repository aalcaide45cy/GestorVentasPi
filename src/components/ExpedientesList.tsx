"use client";

import { CLAVE_BORRADO_DESDE, CLAVE_BORRADO_MINUTOS, CLAVE_SELECCION_DESDE, CLAVE_SELECCION_MINUTOS, formatoCuentaAtras, useModoTemporal } from "@/lib/modo-temporal";
import { avisarCambioDeDatos } from "@/lib/datos-version";
import { llamarComoTarea } from "@/lib/tareas-cliente";
import { aspectoVehiculo } from "@/lib/aspecto";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import Link from "next/link";
import BotonAjustes from "@/components/BotonAjustes";
import { puedeCrearExpedientes } from "@/lib/auth/permisos";
import { usePathname, useRouter } from "next/navigation";
import { CajaDatos, GrupoDatos, OpcionDatos } from "@/components/datos/OpcionesDatos";
import { eventoDeArchivos } from "@/lib/biblioteca-cliente";
import { BotonesDatosSeccion } from "@/components/datos/DatosSeccion";
import CabeceraFlotante from "@/components/expedientes/CabeceraFlotante";
import PanelColumnas, { normalizarOrden, type ConfigColumnas } from "@/components/expedientes/PanelColumnas";
import { ModalConfirmar } from "@/components/Modal";
import Modal from "@/components/Modal";
import { useToast } from "@/components/Toast";
import { construirCsv, descargarTexto, interpretarCsvExpedientes } from "@/lib/csv-expedientes";
import { formatDate } from "@/lib/date-utils";
import {
  CLAVE_FILTROS_GUARDADOS,
  CLAVE_FILTROS_PREDEFINIDOS,
  PREDEFINIDOS_INICIALES,
  CLAVE_RECORDAR_FILTROS,
  aplicarPredefinidos,
  leerFiltrosGuardados,
  leerPredefinidos,
  type FiltrosActuales,
} from "@/lib/filtros-expedientes";
import CasillaAnulados, { CasillaDeshabilitados, useMostrarAnulados, useMostrarDeshabilitados } from "@/components/CasillaAnulados";
import { esAnulado, estaEntregadoEnIntranet } from "@/lib/anulados";
import { TODAS_LAS_FECHAS } from "@/lib/filtros-expedientes";
import { RANGO_VACIO, enRango, hayRango, moverMeses, normalizarRango, rangoDeAtajo, textoRango, type AtajoRango, type RangoFechas } from "@/lib/rango-fechas";
import { fondoDeRegla, gruposDeRegla, reglaQueAplica, textoDeRegla } from "@/lib/reglas-color";
import { useReglasColor } from "@/lib/reglas-color-cliente";
import { CLAVE_ETIQUETA_COPIA, CLAVE_PERMITIR_DUPLICADOS, guardarPreferencia, permitirDuplicadosAhora, usePreferencia } from "@/lib/preferencias";
import type { ExpedienteDto, TiendaDto, VendedorDto } from "@/lib/dto";
import { leerExcelExpedientes, type FilaExcel } from "@/lib/excel-expedientes";
import type { ResultadoVerificacion } from "@/lib/servicios/importaciones";
import { EtiquetaClase, EtiquetaMarca, PuntoMarca } from "./etiquetas";
import { BadgeEstado, BadgeTipoVenta, CeldaCliente, CeldaFecha, FONDO_FECHA_A, FONDO_FECHA_B, TextoCopiable, mensajeDeError, type CampoFecha } from "./expedientes/comun";
import BarraPaginacion from "./expedientes/BarraPaginacion";
import ModalAsignarCliente from "./expedientes/ModalAsignarCliente";
import ModalDuplicados from "./expedientes/ModalDuplicados";
import ModalCompletarDatos from "./expedientes/ModalCompletarDatos";
import ModalContrasteListado from "./expedientes/ModalContrasteListado";
import { leerListadoVentas, type ResultadoContraste } from "@/lib/contraste-listado";
import ModalConflictoExcel, { type ConflictoExcel } from "./expedientes/ModalConflictoExcel";
import ModalEdicionMasiva, { type CambiosMasivos } from "./expedientes/ModalEdicionMasiva";
import ResumenMensual, { MESES } from "./expedientes/ResumenMensual";
import { useEdicionFechas } from "./expedientes/useEdicionFechas";
import {
  ANCHO_ACCIONES,
  ANCHO_COLUMNA,
  ANCHO_SELECCION,
  AYUDA_COLUMNA,
  ActualizacionExcel,
  COLUMNAS,
  Columna,
  ENCABEZADOS,
  FECHAS_FILTRO,
  ORDEN_POR_DEFECTO,
  POR_DEFECTO,
  VISTAS_INCLUIDAS,
  Visibles,
  aActualizacion,
  botonHerramienta,
  botonMes,
  cajaMes,
  etiquetaFiltro,
  hoyIsoLocal,
  leerArchivo,
  marcaYModelo,
  textoCaja,
} from "./expedientes/lista-columnas";

interface Props {
  expedientesIniciales: ExpedienteDto[];
  /** Total de expedientes en la base de datos (si es mayor que los cargados, se avisa de que la lista está recortada). */
  totalEnBd?: number;
  userRole: string;
  tiendas: TiendaDto[];
  vendedores: VendedorDto[];
  tiendaPredeterminadaId: number | null;
  currentUserName: string | null;
  mostrarBotonesCsv: boolean;
  /**
   * Recordar los filtros de esta lista entre visitas y recargas (por defecto sí). La página de resultados de búsqueda no los recuerda ni los aplica:
   * sus resultados salen sin filtros, aunque en la lista de Expedientes hubiera alguno puesto.
   */
  recordarFiltros?: boolean;
}

const estiloSelectFiltro: React.CSSProperties = { padding: "4px 6px", fontSize: "0.8rem" };

/** Un grupo de la barra de acciones: su nombre en pequeño y sus botones, separado de los demás por una línea. */
function GrupoAcciones({ titulo, ayuda, destacado, children }: { titulo: string; ayuda?: string; destacado?: boolean; children: React.ReactNode }) {
  return (
    <div title={ayuda} style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap", paddingRight: "6px", ...(destacado ? { background: "rgba(var(--primary-rgb), 0.08)", border: "1px solid var(--primary)", borderRadius: "var(--radius-sm)", padding: "4px 8px" } : {}) }}>
      <span style={{ fontSize: "0.68rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: destacado ? "var(--primary)" : "var(--text-muted)" }}>{titulo}</span>
      {children}
    </div>
  );
}

/** Un bloque de filtros con su título (Fecha, Vehículo y venta, Comercial y tienda). */
function BloqueFiltros({ titulo, ayuda, crece, children }: { titulo: string; ayuda?: string; crece?: boolean; children: React.ReactNode }) {
  return (
    <fieldset title={ayuda} style={{ margin: 0, padding: "8px 12px 10px", border: "1px solid var(--border-light)", borderRadius: "var(--radius-sm)", display: "flex", flexDirection: "column", gap: "8px", minWidth: 0, ...(crece ? { flex: "1 1 520px" } : {}) }}>
      <legend style={{ padding: "0 6px", fontSize: "0.76rem", fontWeight: 700, color: "var(--text-secondary)" }}>{titulo}</legend>
      {children}
    </fieldset>
  );
}

/** Un filtro: su nombre encima y su control debajo. */
function CampoFiltro({ etiqueta, ayuda, children }: { etiqueta: string; ayuda?: string; children: React.ReactNode }) {
  return (
    <div className="form-group" style={{ marginBottom: 0 }}>
      <label className="form-label" style={etiquetaFiltro} title={ayuda}>
        {etiqueta}
      </label>
      {children}
    </div>
  );
}

/** Cuatro botones pequeños bajo un campo de fecha: retroceden o avanzan un año («), un mes (‹, ›) o un año (»). Sin fecha en el campo parten de hoy. */
function BotonesMoverFecha({ etiqueta, alMover }: { etiqueta: string; alMover: (meses: number) => void }) {
  const estilo: React.CSSProperties = { padding: "0 6px", minWidth: "26px", height: "20px", fontSize: "0.72rem", lineHeight: 1, fontWeight: 700 };
  const botones: { texto: string; meses: number; ayuda: string }[] = [
    { texto: "«", meses: -12, ayuda: "1 año atrás" },
    { texto: "‹", meses: -1, ayuda: "1 mes atrás" },
    { texto: "›", meses: 1, ayuda: "1 mes adelante" },
    { texto: "»", meses: 12, ayuda: "1 año adelante" },
  ];
  return (
    <div style={{ display: "flex", gap: "3px", marginTop: "3px" }}>
      {botones.map((b) => (
        <button key={b.texto} type="button" className="btn btn-secondary" style={estilo} onClick={() => alMover(b.meses)} title={`${b.ayuda} en «${etiqueta}» (si está vacío, parte de hoy)`} aria-label={`${b.ayuda} en ${etiqueta}`}>
          {b.texto}
        </button>
      ))}
    </div>
  );
}

/** Listado completo de expedientes con filtros, ordenación, paginación, selección masiva e importación/exportación. */
export default function ExpedientesList({
  expedientesIniciales,
  totalEnBd,
  userRole,
  tiendas,
  vendedores,
  tiendaPredeterminadaId,
  currentUserName,
  mostrarBotonesCsv,
  recordarFiltros: recordarEnEstaPantalla = true,
}: Props) {
  const router = useRouter();
  const ruta = usePathname();
  const { mostrar } = useToast();
  const esAdministrador = userRole === "administrador";

  const [expedientes, setExpedientes] = useState<ExpedienteDto[]>(expedientesIniciales);
  // Si el servidor entrega datos nuevos (router.refresh), se reemplazan los locales.
  const [inicialesPrevios, setInicialesPrevios] = useState(expedientesIniciales);
  if (expedientesIniciales !== inicialesPrevios) {
    setInicialesPrevios(expedientesIniciales);
    setExpedientes(expedientesIniciales);
  }

  const [cargando, setCargando] = useState(false);
  const [borrando, setBorrando] = useState(false);
  const [aBorrar, setABorrar] = useState<ExpedienteDto | null>(null);
  // Duplicar expedientes (solo con «Permitir expedientes duplicados» activa en Mis datos)
  const [permitirDupGuardado] = usePreferencia(CLAVE_PERMITIR_DUPLICADOS);
  const permitirDup = permitirDupGuardado === "true";
  const [etiquetaCopiaGuardada] = usePreferencia(CLAVE_ETIQUETA_COPIA);
  const [duplicando, setDuplicando] = useState<number[] | null>(null);
  const [copias, setCopias] = useState("1");
  const [duplicandoEnCurso, setDuplicandoEnCurso] = useState(false);
  const [falloCopia, setFalloCopia] = useState<string | null>(null);
  const [confirmarBorradoMasivo, setConfirmarBorradoMasivo] = useState(false);
  const [asignandoId, setAsignandoId] = useState<number | null>(null);

  // Preferencias del navegador (null hasta hidratar; después el valor guardado)
  const [filtrosGuardado, fijarFiltrosAbiertos] = usePreferencia("exp-filtros-abiertos");
  const filtrosAbiertos = filtrosGuardado !== "false";
  // Antes «Comisionado» tenía su propio interruptor además de la casilla del gestor de columnas, y con la columna activa en el gestor no se veía si el
  // interruptor estaba apagado. Ahora manda solo el gestor de columnas (el interruptor de la barra lo cambia); lo que alguien tenía encendido se respeta.
  const [cobrosGuardado] = usePreferencia("exp-show-cobro-status");
  // Los anulados en el listado de la intranet no son ventas: salen ocultos salvo que se active la casilla (o se pida «Anulado» a propósito)
  const [mostrarAnulados, fijarMostrarAnulados] = useMostrarAnulados("expedientes");
  const nAnulados = useMemo(() => expedientes.filter((e) => esAnulado(e.estado_intranet)).length, [expedientes]);
  // Los deshabilitados no cuentan (ni en la lista ni en los totales) salvo que se active la casilla
  const [mostrarDeshabilitados, fijarMostrarDeshabilitados] = useMostrarDeshabilitados("expedientes");
  const nDeshabilitados = useMemo(() => expedientes.filter((e) => e.deshabilitado).length, [expedientes]);
  const [columnasGuardadas, fijarColumnas] = usePreferencia("exp-visible-columns");
  const visibles = useMemo<Visibles>(() => {
    try {
      const guardadas = columnasGuardadas ? (JSON.parse(columnasGuardadas) as Partial<Visibles>) : {};
      return { ...POR_DEFECTO, ...(cobrosGuardado === "true" ? { cobro: true } : {}), ...guardadas };
    } catch {
      return POR_DEFECTO; // preferencia corrupta: se vuelve a lo habitual
    }
  }, [columnasGuardadas, cobrosGuardado]);
  const mostrarCobros = visibles.cobro !== false;
  const mostrarIntranet = visibles.estado_intranet === true;
  const [ordenGuardado, fijarOrden] = usePreferencia("exp-column-order");
  const orden = useMemo<Columna[]>(() => {
    try {
      return normalizarOrden(ordenGuardado ? (JSON.parse(ordenGuardado) as string[]) : null, ORDEN_POR_DEFECTO) as Columna[];
    } catch {
      return ORDEN_POR_DEFECTO;
    }
  }, [ordenGuardado]);
  // Ancho de cada columna cuando se ha cambiado desde «Columnas y vistas» (se guarda en el perfil, en la base de datos)
  const [anchosGuardados, fijarAnchos] = usePreferencia("exp-column-widths");
  const anchos = useMemo<Record<string, number>>(() => {
    try {
      const v = anchosGuardados ? (JSON.parse(anchosGuardados) as Record<string, number>) : {};
      return v && typeof v === "object" ? v : {};
    } catch {
      return {};
    }
  }, [anchosGuardados]);
  const anchoDe = (clave: Columna): number => (Number.isFinite(anchos[clave]) ? Math.max(40, Math.min(anchos[clave], 600)) : ANCHO_COLUMNA[clave]);
  const [tamanoGuardado] = usePreferencia("exp-default-page-size");
  const [tamanoElegido, setTamano] = useState<number | null>(null);
  const tamano = tamanoElegido ?? (Number(tamanoGuardado) > 0 ? Number(tamanoGuardado) : 20);

  const [selectorColumnas, setSelectorColumnas] = useState(false);
  // Paneles plegables de la pantalla (filtros, resumen, comisiones y cartera): un solo botón los pliega o despliega todos
  const [pResumen, fijarPResumen] = usePreferencia("panel-resumen");
  const [pComisiones, fijarPComisiones] = usePreferencia("panel-comisiones");
  const [pCartera, fijarPCartera] = usePreferencia("panel-cartera");
  const hayPanelAbierto = pResumen !== "cerrado" || pComisiones !== "cerrado" || pCartera !== "cerrado" || filtrosAbiertos;
  const alternarPaneles = () => {
    const v = hayPanelAbierto ? "cerrado" : "abierto";
    fijarPResumen(v);
    fijarPComisiones(v);
    fijarPCartera(v);
    fijarFiltrosAbiertos(hayPanelAbierto ? "false" : "true");
  };
  const [menuDatos, setMenuDatos] = useState(false);
  // Los dos modos se quedan activados hasta que se desactiven (o hasta que pase el tiempo configurado en Configuración de expedientes)
  const modoSeleccion = useModoTemporal(CLAVE_SELECCION_DESDE, CLAVE_SELECCION_MINUTOS);
  const modoBorrado = useModoTemporal(CLAVE_BORRADO_DESDE, CLAVE_BORRADO_MINUTOS);
  const seleccionActiva = modoSeleccion.activo;
  const borradoActivo = modoBorrado.activo;
  const [seleccionados, setSeleccionados] = useState<number[]>([]);
  const [verDuplicados, setVerDuplicados] = useState(false);
  const [edicionMasiva, setEdicionMasiva] = useState(false);

  const [ordenCampo, setOrdenCampo] = useState("fecha_expediente");
  const [ordenAsc, setOrdenAsc] = useState(false);
  const [pagina, setPagina] = useState(1);

  // Filtros
  const [busqueda, setBusqueda] = useState("");
  const [ocultarEntregados, setOcultarEntregados] = useState(false);
  const [fMarca, setFMarca] = useState("");
  const [fModelo, setFModelo] = useState("");
  const [fTipo, setFTipo] = useState("");
  const [fEstado, setFEstado] = useState("");
  const [fIntranet, setFIntranet] = useState("");
  // «En curso»: los expedientes con los que se está trabajando (todo menos Anulado, Post-venta y Archivado en la intranet)
  const [fEnCurso, setFEnCurso] = useState(false);
  const [fApunte, setFApunte] = useState("");
  const [fVendedor, setFVendedor] = useState(currentUserName ?? "");
  const [fMes, setFMes] = useState("");
  const [fAnio, setFAnio] = useState("");
  const [fTipoFecha, setFTipoFecha] = useState("fecha_expediente");
  const [fTienda, setFTienda] = useState("");
  // Rango «Desde / Hasta» sobre el campo de fecha elegido: no se guarda con los filtros, así que siempre empieza vacío al entrar
  const [rango, setRango] = useState<RangoFechas>(RANGO_VACIO);
  const rangoOk = useMemo(() => normalizarRango(rango), [rango]);
  const rangoActivo = hayRango(rango);

  // Importación de Excel
  // Filtros predefinidos y recuerdo entre recargas (preferencias del navegador, ver Administración › Expedientes)
  const [filtrosListos, setFiltrosListos] = useState(false);
  useEffect(() => {
    const leerLocal = (clave: string): string | null => {
      try {
        return localStorage.getItem(clave);
      } catch {
        return null;
      }
    };
    const f: FiltrosActuales = !recordarEnEstaPantalla
      ? aplicarPredefinidos(PREDEFINIDOS_INICIALES, "")
      : (leerLocal(CLAVE_RECORDAR_FILTROS) !== "false" ? leerFiltrosGuardados(leerLocal(CLAVE_FILTROS_GUARDADOS)) : null) ??
      aplicarPredefinidos(leerPredefinidos(leerLocal(CLAVE_FILTROS_PREDEFINIDOS)), currentUserName ?? "");
    /* eslint-disable react-hooks/set-state-in-effect -- el navegador solo se puede leer tras hidratar */
    setBusqueda(f.busqueda);
    setOcultarEntregados(f.ocultarEntregados);
    setFMarca(f.marca);
    setFModelo(f.modelo);
    setFTipo(f.tipo);
    setFEstado(f.estado);
    setFVendedor(f.vendedor);
    setFMes(f.mes);
    setFAnio(f.anio);
    setFTipoFecha(f.tipoFecha);
    setFTienda(f.tienda);
    setFIntranet(f.intranet);
    setFApunte(f.apunte);
    setRango({ desde: f.desde, hasta: f.hasta });
    setOrdenCampo(f.ordenCampo);
    setOrdenAsc(f.ordenAsc);
    setFiltrosListos(true);
    /* eslint-enable react-hooks/set-state-in-effect */
    // Solo al montar: después mandan los controles de la pantalla.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [recordarFiltros] = usePreferencia(CLAVE_RECORDAR_FILTROS);
  useEffect(() => {
    if (!filtrosListos || !recordarEnEstaPantalla) return;
    if (recordarFiltros === "false") return;
    const actuales: FiltrosActuales = {
      busqueda,
      ocultarEntregados,
      marca: fMarca,
      modelo: fModelo,
      tipo: fTipo,
      estado: fEstado,
      vendedor: fVendedor,
      mes: fMes,
      anio: fAnio,
      tipoFecha: fTipoFecha,
      tienda: fTienda,
      intranet: fIntranet,
      apunte: fApunte,
      desde: rango.desde,
      hasta: rango.hasta,
      ordenCampo,
      ordenAsc,
    };
    guardarPreferencia(CLAVE_FILTROS_GUARDADOS, JSON.stringify(actuales));
  }, [filtrosListos, recordarEnEstaPantalla, recordarFiltros, busqueda, ocultarEntregados, fMarca, fModelo, fTipo, fEstado, fVendedor, fMes, fAnio, fTipoFecha, fTienda, fIntranet, fApunte, rango, ordenCampo, ordenAsc]);

  const [importandoExcel, setImportandoExcel] = useState(false);
  const [completando, setCompletando] = useState(false);
  const [contraste, setContraste] = useState<{ archivo: string; resultado: ResultadoContraste } | null>(null);
  const [nombreExcel, setNombreExcel] = useState("");
  const [conflictos, setConflictos] = useState<ConflictoExcel[]>([]);
  const [indiceConflicto, setIndiceConflicto] = useState(0);
  const [actualizaciones, setActualizaciones] = useState<ActualizacionExcel[]>([]);

  const { abrirEditar, abrirBorrar, modales } = useEdicionFechas((id, cambios) =>
    setExpedientes((prev) => prev.map((e) => (e.id_expediente === id ? { ...e, ...cambios } : e))),
  );

  /* ---------------- Opciones de filtros ---------------- */
  const opciones = useMemo(() => {
    const unicos = (valores: (string | null | undefined)[]) =>
      Array.from(new Set(valores.filter((v): v is string => !!v))).sort((a, b) => a.localeCompare(b, "es"));
    const modelos = expedientes.filter((e) => !fMarca || (fMarca === "VO_NO_BRAND" ? !e.modelo?.marca?.nombre : e.modelo?.marca?.nombre === fMarca));
    return {
      marcas: unicos(expedientes.map((e) => e.modelo?.marca?.nombre)),
      modelos: unicos(modelos.map((e) => e.modelo?.nombre_modelo)),
      vendedores: unicos(expedientes.map((e) => e.usuario?.nombre)),
      tipos: unicos(expedientes.map((e) => e.tipoDeVenta?.nombre_tipo_venta)),
      estados: unicos(expedientes.map((e) => e.estadoVehiculo?.nombre_estado_vehiculo)),
      estadosIntranet: unicos(expedientes.map((e) => e.estado_intranet)),
      apuntes: unicos(expedientes.flatMap((e) => (e.apuntes ?? []).map((a) => a.titulo))),
      anios: Array.from(
        new Set(
          expedientes.flatMap((e) =>
            [e.fecha_expediente, e.fecha_afectacion, e.fecha_matriculacion, e.fecha_entrega, e.fecha_rci, e.fecha_cobrado]
              .map((f) => f?.split("-")[0])
              .filter((a): a is string => !!a),
          ),
        ),
      ).sort((a, b) => Number(b) - Number(a)),
    };
  }, [expedientes, fMarca]);

  /* ---------------- Filtrado, orden y paginación ---------------- */
  /**
   * Las fechas del expediente sobre las que se filtra por mes, año y rango: la que se elige en «Campo de Fecha» o, con «Todas las fechas», cualquiera de
   * ellas (el expediente entra si alguna cumple).
   */
  const fechasDeFiltro = useCallback(
    (e: ExpedienteDto): (string | null)[] => {
      const una = (tipo: string): string | null => (tipo === "fecha_comisionado" ? (e.cobrado_otra_fecha && e.fecha_cobrado ? e.fecha_cobrado : e.fecha_matriculacion) : ((e as unknown as Record<string, string | null>)[tipo] ?? null));
      return fTipoFecha === TODAS_LAS_FECHAS ? FECHAS_FILTRO.filter((f) => f.valor !== TODAS_LAS_FECHAS).map((f) => una(f.valor)) : [una(fTipoFecha)];
    },
    [fTipoFecha],
  );
  /** ¿Alguna de las fechas cumple el rango y el mes y año elegidos (a la vez)? */
  const cumpleFechas = useCallback(
    (e: ExpedienteDto): boolean =>
      fechasDeFiltro(e).some((f) => {
        if (rangoActivo && !enRango(f, rangoOk)) return false;
        if (fMes || fAnio) {
          if (!f) return false;
          const [a, m] = f.split("-");
          if (!m) return false;
          if (fAnio && a !== fAnio) return false;
          if (fMes && m !== fMes) return false;
        }
        return true;
      }),
    [fechasDeFiltro, rangoActivo, rangoOk, fMes, fAnio],
  );
  // Reglas de color de las filas (Configuración › Expedientes › Colores de fila): gana la primera que se cumple
  const [reglasColor] = useReglasColor();
  const hoyLocal = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  })();
  const reglaDe = (e: ExpedienteDto) => reglaQueAplica(e, reglasColor, hoyLocal);
  const filtrados = useMemo(() => {
    const gs = busqueda.toLowerCase();
    return expedientes.filter((e) => {
      if (ocultarEntregados && estaEntregadoEnIntranet(e.estado_intranet)) return false;
      if (!mostrarDeshabilitados && e.deshabilitado) return false;
      if (!mostrarAnulados && esAnulado(e.estado_intranet) && !/anulad/i.test(fIntranet) && !gs.includes("anulad")) return false;
      if (gs) {
        const campos = [
          e.cliente?.nombre,
          e.cliente?.dni,
          e.modelo?.nombre_modelo,
          e.modelo?.marca?.nombre,
          e.tipoDeVenta?.nombre_tipo_venta,
          e.estadoVehiculo?.nombre_estado_vehiculo,
          e.usuario?.nombre,
          e.vin,
          e.matricula,
          e.estado_intranet,
        ];
        if (!campos.some((c) => c?.toLowerCase().includes(gs))) return false;
      }
      if (fMarca) {
        if (fMarca === "VO_NO_BRAND") {
          if (e.modelo?.marca?.nombre) return false;
        } else if (e.modelo?.marca?.nombre !== fMarca) return false;
      }
      if (fModelo) {
        const f = fModelo.toLowerCase();
        if (!e.modelo?.nombre_modelo?.toLowerCase().includes(f) && !e.vin?.toLowerCase().includes(f)) return false;
      }
      if (fTipo && !e.tipoDeVenta?.nombre_tipo_venta?.toLowerCase().includes(fTipo.toLowerCase())) return false;
      if (fEstado && !e.estadoVehiculo?.nombre_estado_vehiculo?.toLowerCase().includes(fEstado.toLowerCase())) return false;
      if (fApunte && (fApunte === "__sin__" ? (e.apuntes ?? []).length > 0 : !(e.apuntes ?? []).some((a) => a.titulo.toLowerCase() === fApunte.toLowerCase()))) return false;
      if (fEnCurso && /anulad|post[\s-]?venta|archivad/i.test(e.estado_intranet ?? "")) return false;
      if (fIntranet && (fIntranet === "__sin__" ? !!e.estado_intranet : (e.estado_intranet ?? "").toLowerCase() !== fIntranet.toLowerCase())) return false;
      if (fVendedor && (e.usuario?.nombre?.toLowerCase().trim() ?? "") !== fVendedor.toLowerCase().trim()) return false;
      if ((rangoActivo || fMes || fAnio) && !cumpleFechas(e)) return false;
      if (fTienda && e.id_tienda !== Number(fTienda)) return false;
      return true;
    });
  }, [expedientes, busqueda, ocultarEntregados, mostrarAnulados, mostrarDeshabilitados, fMarca, fModelo, fTipo, fEstado, fIntranet, fEnCurso, fApunte, fVendedor, fTienda, rangoActivo, fMes, fAnio, cumpleFechas]);

  const ordenados = useMemo(() => {
    const valor = (e: ExpedienteDto): string => {
      switch (ordenCampo) {
        case "cliente":
          return e.cliente?.nombre ?? "";
        case "telefono":
          return e.cliente?.telefonos[0]?.telefono ?? "";
        case "email":
          return e.cliente?.emails[0]?.email ?? "";
        case "clase":
          return e.estadoVehiculo?.clase ?? "";
        case "punto":
          const a = aspectoVehiculo(e.modelo?.marca, e.estadoVehiculo);
          return `${a.puntoColor ?? a.capsula ?? "~"}|${e.modelo?.marca?.nombre ?? ""}`;
        case "marca":
          return e.modelo?.marca?.nombre ?? "";
        case "modelo":
          return e.modelo?.nombre_modelo ?? "";
        case "marca_modelo":
          return marcaYModelo(e);
        case "tipo_venta":
          return e.tipoDeVenta?.nombre_tipo_venta ?? "";
        case "estado":
          return e.estadoVehiculo?.nombre_estado_vehiculo ?? "";
        case "estado_intranet":
          return e.estado_intranet ?? "";
        case "vendedor":
          return e.usuario?.nombre ?? "";
        default:
          return ((e as unknown as Record<string, string | null>)[ordenCampo] ?? "") as string;
      }
    };
    const lista = [...filtrados].sort((a, b) => valor(a).localeCompare(valor(b), "es", { sensitivity: "base" }));
    return ordenAsc ? lista : lista.reverse();
  }, [filtrados, ordenCampo, ordenAsc]);

  useEffect(() => {
    guardarPreferencia("visible_expediente_ids", JSON.stringify(ordenados.map((e) => e.id_expediente)));
  }, [ordenados]);

  const totalPaginas = Math.max(1, Math.ceil(filtrados.length / tamano));
  const paginaSegura = Math.min(pagina, totalPaginas);
  const visiblesPagina = ordenados.slice((paginaSegura - 1) * tamano, paginaSegura * tamano);

  const ordenar = (campo: string) => {
    if (ordenCampo === campo) setOrdenAsc((a) => !a);
    else {
      setOrdenCampo(campo);
      setOrdenAsc(true);
    }
    setPagina(1);
  };
  const indicador = (campo: string) => (
    <span style={{ marginLeft: "4px", fontSize: "0.75rem", display: "inline-block", opacity: ordenCampo === campo ? 1 : 0.6 }}>
      {ordenCampo !== campo ? "↕" : ordenAsc ? "▲" : "▼"}
    </span>
  );

  /** Pone el rango «Desde / Hasta» y quita mes y año: los tres juntos casi nunca coinciden y la lista saldría vacía sin que se entienda por qué. */
  const ponerRango = (cambio: (r: RangoFechas) => RangoFechas) => {
    setRango(cambio);
    setFMes("");
    setFAnio("");
    setPagina(1);
  };

  const limpiarFiltros = () => {
    setBusqueda("");
    setOcultarEntregados(false);
    setFMarca("");
    setFModelo("");
    setFTipo("");
    setFEstado("");
    setFIntranet("");
    setFEnCurso(false);
    setFApunte("");
    setFVendedor(currentUserName ?? ""); // al limpiar se vuelve a ver solo lo del usuario que ha iniciado sesión
    setFMes("");
    setFAnio("");
    setFTipoFecha("fecha_expediente");
    setFTienda("");
    setRango(RANGO_VACIO);
    setOrdenCampo("fecha_expediente");
    setOrdenAsc(false);
    setPagina(1);
    // Si la lista es el resultado de la búsqueda de la barra superior, limpiar también quita esa búsqueda (y vacía su caja)
    if (ruta.startsWith("/dashboard/buscar")) router.push("/dashboard/expedientes");
  };

  const cambiarMesFiltro = (campo: "fecha_comisionado" | "fecha_afectacion", movimiento: "ant" | "actual" | "sig") => {
    const ahora = new Date();
    const mesReal = ahora.getMonth() + 1;
    const anioReal = ahora.getFullYear();
    let m = fMes ? Number(fMes) : mesReal;
    let a = fAnio ? Number(fAnio) : anioReal;
    if (movimiento === "actual") {
      m = campo === "fecha_comisionado" ? mesReal - 1 : mesReal;
      a = anioReal;
      if (m < 1) {
        m = 12;
        a -= 1;
      }
    } else {
      m += movimiento === "ant" ? -1 : 1;
      if (m < 1) {
        m = 12;
        a -= 1;
      } else if (m > 12) {
        m = 1;
        a += 1;
      }
      // Comisionado no viaja más allá del mes real
      if (campo === "fecha_comisionado" && movimiento === "sig" && (a > anioReal || (a === anioReal && m > mesReal))) {
        m = mesReal;
        a = anioReal;
      }
    }
    setFTipoFecha(campo);
    setFMes(String(m).padStart(2, "0"));
    setFAnio(String(a));
    setRango(RANGO_VACIO); // mes/año y rango se excluyen: si no, juntos casi nunca coinciden y la lista sale vacía
    setPagina(1);
  };

  /* ---------------- Selección ---------------- */
  const seleccionarTodos = (marcado: boolean) => setSeleccionados(marcado ? filtrados.map((e) => e.id_expediente) : []);
  /** Último expediente marcado o desmarcado con su casilla: el punto de partida de un rango con Mayús. */
  const ultimaMarca = useRef<number | null>(null);
  const refTabla = useRef<HTMLDivElement>(null);
  /**
   * Se elige solo con la casilla (pulsar en otra parte de la fila no elige). Con Mayús pulsada, la casilla marca (o desmarca) de golpe todos los que hay
   * entre el último que se tocó y este, en el orden en que se ven en la tabla.
   */
  const seleccionarUno = (id: number, marcado: boolean, conMayus = false) => {
    const desde = ultimaMarca.current;
    ultimaMarca.current = id;
    const orden = ordenados.map((e) => e.id_expediente);
    const a = desde === null ? -1 : orden.indexOf(desde);
    const b = orden.indexOf(id);
    const ids = conMayus && a >= 0 && b >= 0 ? orden.slice(Math.min(a, b), Math.max(a, b) + 1) : [id];
    setSeleccionados((prev) => (marcado ? [...prev, ...ids.filter((x) => !prev.includes(x))] : prev.filter((x) => !ids.includes(x))));
  };

  /* ---------------- Acciones ---------------- */
  const exportarCsv = (soloSeleccionados: boolean) => {
    const lista = soloSeleccionados ? expedientes.filter((e) => seleccionados.includes(e.id_expediente)) : expedientes;
    if (lista.length === 0) {
      mostrar("No hay expedientes para exportar.", "error");
      return;
    }
    descargarTexto(`expedientes_${soloSeleccionados ? "seleccionados_" : ""}export_${hoyIsoLocal()}.csv`, construirCsv(lista), "text/csv;charset=utf-8;");
    mostrar("Exportación CSV realizada con éxito.");
  };

  const importarCsv = async (ev: ChangeEvent<HTMLInputElement>) => {
    const archivo = ev.target.files?.[0];
    const entrada = ev.target;
    if (!archivo) return;
    setCargando(true);
    try {
      const texto = await leerArchivo<string>(archivo, "texto");
      if (!texto) throw new Error("Archivo vacío");
      const items = interpretarCsvExpedientes(texto);
      const res = await fetch("/api/expedientes/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items, filename: archivo.name, permitir_duplicados: permitirDuplicadosAhora() }),
      });
      if (!res.ok) throw new Error(await mensajeDeError(res, "Error al procesar la importación en el servidor."));
      const r = (await res.json()) as { message?: string };
      mostrar(r.message ?? "Importación realizada.");
      router.refresh();
    } catch (e) {
      mostrar(e instanceof Error ? e.message : "Error al importar el archivo CSV.", "error");
    } finally {
      setCargando(false);
      entrada.value = "";
    }
  };

  const ejecutarImportacionExcel = async (lista: ActualizacionExcel[], archivo: string) => {
    setImportandoExcel(true);
    try {
      // En segundo plano (una importación grande tarda): la barra de arriba enseña el avance y se puede cancelar sin que cambie nada
      mostrar(`📥 Importando ${lista.length} filas de «${archivo}» en segundo plano… puedes seguir usando la aplicación.`, "aviso", 5000);
      const r = await llamarComoTarea<{ message?: string }>("/api/expedientes/importar-excel/procesar", { updates: lista, filename: archivo, permitir_duplicados: permitirDuplicadosAhora() });
      mostrar(r.message ?? "Importación realizada.");
      router.refresh();
    } catch (e) {
      mostrar(e instanceof Error ? e.message : "Error al completar la importación.", "error");
    } finally {
      setImportandoExcel(false);
      setConflictos([]);
      setActualizaciones([]);
    }
  };

  const importarExcel = async (ev: ChangeEvent<HTMLInputElement>) => {
    const archivo = ev.target.files?.[0];
    const entrada = ev.target;
    if (!archivo) return;
    setNombreExcel(archivo.name);
    setImportandoExcel(true);
    try {
      const filas: FilaExcel[] = leerExcelExpedientes(await leerArchivo<ArrayBuffer>(archivo, "binario"));
      const res = await fetch("/api/expedientes/importar-excel/verificar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: filas }),
      });
      if (!res.ok) throw new Error(await mensajeDeError(res, "Error al verificar el archivo Excel."));
      const { results } = (await res.json()) as { results: ResultadoVerificacion[] };

      const auto: ActualizacionExcel[] = [];
      const pendientes: ConflictoExcel[] = [];
      for (const r of results) {
        const fila = filas.find((f) => f.rowIdx === r.rowIdx);
        if (!fila) continue;
        if (r.status === "ok") auto.push(aActualizacion(fila, r.id_cliente, r.id_expediente));
        else if (r.status === "multiple") pendientes.push({ rowIdx: r.rowIdx, id_cliente: r.id_cliente, client: r.client, expedientes: r.expedientes, data: fila });
      }
      setActualizaciones(auto);
      if (pendientes.length > 0) {
        setConflictos(pendientes);
        setIndiceConflicto(0);
      } else if (auto.length > 0) {
        await ejecutarImportacionExcel(auto, archivo.name);
      } else {
        mostrar("No había ningún cliente coincidente en el archivo Excel.", "error");
      }
    } catch (e) {
      mostrar(e instanceof Error ? e.message : "Error al importar el archivo Excel.", "error");
    } finally {
      setImportandoExcel(false);
      entrada.value = "";
    }
  };

  /** Compara un listado de ventas (Excel) con los expedientes. Solo lee: no cambia nada. */
  const contrastarListado = async (ev: ChangeEvent<HTMLInputElement>) => {
    const archivo = ev.target.files?.[0];
    const entrada = ev.target;
    if (!archivo) return;
    setImportandoExcel(true);
    try {
      const filas = leerListadoVentas(await leerArchivo<ArrayBuffer>(archivo, "binario"));
      const res = await fetch("/api/expedientes/contrastar-listado", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filas }),
      });
      if (!res.ok) throw new Error(await mensajeDeError(res, "Error al contrastar el listado."));
      const { resultado } = (await res.json()) as { resultado: ResultadoContraste };
      setContraste({ archivo: archivo.name, resultado });
    } catch (e) {
      mostrar(e instanceof Error ? e.message : "Error al contrastar el listado.", "error");
    } finally {
      setImportandoExcel(false);
      entrada.value = "";
    }
  };

  const avanzarConflicto = (nuevas: ActualizacionExcel[]) => {
    setActualizaciones(nuevas);
    if (indiceConflicto + 1 < conflictos.length) setIndiceConflicto(indiceConflicto + 1);
    else void ejecutarImportacionExcel(nuevas, nombreExcel);
  };

  const eliminar = async (ids: number[]) => {
    setBorrando(true);
    try {
      const res = await fetch(ids.length === 1 ? `/api/expedientes?id=${ids[0]}` : "/api/expedientes", {
        method: "DELETE",
        ...(ids.length === 1 ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids }) }),
      });
      if (!res.ok) throw new Error(await mensajeDeError(res, "Error al eliminar el expediente"));
      setExpedientes((prev) => prev.filter((e) => !ids.includes(e.id_expediente)));
      setSeleccionados((prev) => prev.filter((x) => !ids.includes(x)));
      avisarCambioDeDatos();
      mostrar(ids.length === 1 ? "Expediente enviado a la Papelera (Herramientas › Papelera): se puede recuperar." : `${ids.length} expedientes enviados a la Papelera (Herramientas › Papelera): se pueden recuperar.`);
      setABorrar(null);
      setConfirmarBorradoMasivo(false);
      router.refresh();
    } catch (e) {
      mostrar(e instanceof Error ? e.message : "Ocurrió un error inesperado al eliminar el expediente.", "error");
    } finally {
      setBorrando(false);
    }
  };

  /** Deshabilita (o vuelve a habilitar) los expedientes seleccionados: dejan de contar en las comisiones, la tasa y las liquidaciones. */
  const deshabilitarSeleccionados = async (deshabilitado: boolean) => {
    const ids = seleccionados;
    if (ids.length === 0) return;
    try {
      const res = await fetch("/api/expedientes", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isBulkEdit: true, ids, expediente: { deshabilitado } }),
      });
      if (!res.ok) throw new Error(await mensajeDeError(res, "No se pudo cambiar el estado de los expedientes."));
      setExpedientes((prev) => prev.map((e) => (ids.includes(e.id_expediente) ? { ...e, deshabilitado } : e)));
      avisarCambioDeDatos();
      mostrar(deshabilitado ? `${ids.length} expedientes deshabilitados: ya no cuentan en las comisiones ni en los totales y salen de la lista (activa «Mostrar deshabilitados» para verlos).` : `${ids.length} expedientes habilitados: vuelven a contar en las comisiones.`);
      router.refresh();
    } catch (e) {
      mostrar(e instanceof Error ? e.message : "Error de conexión al actualizar.", "error");
    }
  };

  const guardarEdicionMasiva = async (cambios: CambiosMasivos) => {
    setCargando(true);
    try {
      const res = await fetch("/api/expedientes", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isBulkEdit: true, ids: seleccionados, expediente: cambios }),
      });
      if (!res.ok) throw new Error(await mensajeDeError(res, "Error al actualizar expedientes."));
      avisarCambioDeDatos();
      mostrar(`${seleccionados.length} expedientes modificados correctamente.`);
      // Lo que falta (por ejemplo, la fecha RCI de un pago que la pide) no impide guardar: se avisa
      const avisos = ((await res.json().catch(() => ({}))) as { avisos?: { mensaje: string }[] }).avisos ?? [];
      if (avisos.length > 0) mostrar(avisos.length === 1 ? avisos[0].mensaje : `${avisos.length} expedientes se han guardado con algo sin rellenar (por ejemplo: ${avisos[0].mensaje.replace(/^Expediente \d+: /, "")})`, "aviso", 10000);
      setEdicionMasiva(false);
      setSeleccionados([]);
      router.refresh();
    } catch (e) {
      mostrar(e instanceof Error ? e.message : "Error de conexión al actualizar.", "error");
    } finally {
      setCargando(false);
    }
  };

  /* ---------------- Render ---------------- */
  const columnasActivas = orden.map((clave) => COLUMNAS.find((c) => c.clave === clave)!).filter((c) => visibles[c.clave] !== false);
  const totalColSpan = columnasActivas.length + (seleccionActiva ? 1 : 0) + 1;
  const mostrarCol = (c: Columna) => visibles[c] !== false;

  const hoyF = new Date();
  // «Todas las fechas»: el filtro vale para cualquiera de las fechas del expediente, y el aviso lo dice así
  const etiquetaFechaFiltro = fTipoFecha === TODAS_LAS_FECHAS ? "Cualquiera de las fechas" : (FECHAS_FILTRO.find((f) => f.valor === fTipoFecha)?.etiqueta ?? "Fecha");
  const filtrosActivos: string[] = [];
  if (busqueda.trim()) filtrosActivos.push(`Búsqueda: «${busqueda.trim()}»`);
  if (fMes || fAnio) {
    const esActual = (!fMes || fMes === String(hoyF.getMonth() + 1).padStart(2, "0")) && (!fAnio || fAnio === String(hoyF.getFullYear()));
    filtrosActivos.push(`${etiquetaFechaFiltro}: ${[fMes ? MESES[Number(fMes) - 1] : "todos los meses", fAnio || "todos los años"].join(" ")}${esActual ? "" : " (no es el mes actual)"}`);
  }
  if (rangoActivo) filtrosActivos.push(`📅 ${etiquetaFechaFiltro} ${textoRango(rangoOk)}${rango.desde && rango.hasta && rango.desde > rango.hasta ? " (las fechas estaban al revés y se han cambiado de sitio)" : ""}`);
  if (fMarca) filtrosActivos.push(`Marca: ${fMarca === "VO_NO_BRAND" ? "sin marca" : fMarca}`);
  if (fModelo) filtrosActivos.push(`Modelo: ${fModelo}`);
  if (fTienda) filtrosActivos.push(`Tienda: ${tiendas.find((t) => String(t.id_tienda) === fTienda)?.nombre ?? fTienda}`);
  if (fVendedor && fVendedor !== (currentUserName ?? "")) filtrosActivos.push(`Comercial: ${fVendedor}`);
  if (!fVendedor) filtrosActivos.push("Todos los comerciales");
  if (fTipo) filtrosActivos.push(`Tipo de venta: ${fTipo}`);
  if (fEstado) filtrosActivos.push(`Estado: ${fEstado}`);
  if (fApunte) filtrosActivos.push(`Apunte: ${fApunte === "__sin__" ? "sin apuntes" : fApunte}`);
  if (fEnCurso) filtrosActivos.push("En curso (sin Anulado, Post-venta ni Archivado)");
  if (fIntranet) filtrosActivos.push(`Estado intranet: ${fIntranet === "__sin__" ? "sin estado" : fIntranet}`);
  if (ocultarEntregados) filtrosActivos.push("Entregados ocultos");

  const nCopias = Math.max(0, Math.floor(Number(copias) || 0));
  const copiasValidas = nCopias >= 1 && nCopias <= 50;
  const duplicar = async (sinCopia = false) => {
    if (!duplicando || !copiasValidas) return;
    setDuplicandoEnCurso(true);
    const inicio = performance.now();
    try {
      // Un solo envío para todo el lote: o se crean todas las copias o ninguna
      const res = await fetch("/api/expedientes/duplicar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: duplicando, copias: nCopias, etiqueta: etiquetaCopiaGuardada !== "false", sin_copia: sinCopia }) });
      if (!res.ok) {
        const mensaje = await mensajeDeError(res, "Error al duplicar.");
        if (mensaje.startsWith("COPIA_PREVIA:")) {
          setFalloCopia(mensaje.replace("COPIA_PREVIA:", "").trim());
          return;
        }
        throw new Error(mensaje);
      }
      const r = (await res.json()) as { creados: number; copia: { nombre: string; creadaAhora: boolean } | null };
      const segundos = ((performance.now() - inicio) / 1000).toFixed(1).replace(".", ",");
      mostrar(`✅ ${r.creados} expediente${r.creados === 1 ? "" : "s"} duplicado${r.creados === 1 ? "" : "s"} en ${segundos} s. ${r.copia ? (r.copia.creadaAhora ? ` Antes se hizo una copia de seguridad (${r.copia.nombre}).` : ` Ya había una copia de seguridad reciente (${r.copia.nombre}).`) : ""}`);
      setDuplicando(null);
      setFalloCopia(null);
      setSeleccionados([]);
      router.refresh();
    } catch (e) {
      mostrar(`No se ha creado ninguna copia. Motivo: ${e instanceof Error ? e.message : "error inesperado."}`, "error");
    } finally {
      setDuplicandoEnCurso(false);
    }
  };

  const cambiarConfigColumnas = (c: ConfigColumnas) => {
    fijarColumnas(JSON.stringify(c.visibles));
    fijarOrden(JSON.stringify(c.orden));
  };

  // El <colgroup> y el <thead> de la tabla de la lista (se pintan dos veces: en la tabla y en la cabecera flotante que se ve al bajar)
  const encabezadoTabla = () => (
    <>
            <colgroup>
              {seleccionActiva && <col style={{ width: ANCHO_SELECCION }} />}
              {columnasActivas.map((c) => (
                <col key={c.clave} style={{ width: anchoDe(c.clave) }} />
              ))}
              <col style={{ width: ANCHO_ACCIONES }} />
            </colgroup>
            <thead>
              <tr>
                {seleccionActiva && (
                  <th style={{ width: "40px", textAlign: "center" }}>
                    <input
                      type="checkbox"
                      checked={filtrados.length > 0 && seleccionados.length === filtrados.length}
                      onChange={(e) => seleccionarTodos(e.target.checked)}
                      style={{ width: "16px", height: "16px", cursor: "pointer" }}
                    />
                  </th>
                )}
                {columnasActivas.map((c) => (
                  <Fragment key={c.clave}>{cabecera(c.clave, ENCABEZADOS[c.clave].etiqueta, ENCABEZADOS[c.clave].fondo)}</Fragment>
                ))}
                <th style={{ whiteSpace: "nowrap", textAlign: "center" }}>Acciones</th>
              </tr>
            </thead>
    </>
  );

  const celdaFecha = (exp: ExpedienteDto, campo: CampoFecha, nombre: string, fondo: string) => (
    <CeldaFecha exp={exp} campo={campo} nombre={nombre} fondo={fondo} formatear={formatDate} detalleMatricula alEditar={abrirEditar} alBorrar={abrirBorrar} />
  );

  const cabecera = (clave: Columna, etiqueta: string, fondo?: string) =>
    mostrarCol(clave) && (
      <th
        key={clave}
        title={AYUDA_COLUMNA[clave]}
        onClick={clave === "cobro" ? undefined : () => ordenar(clave)}
        style={{
          cursor: clave === "cobro" ? "default" : "pointer",
          userSelect: "none",
          whiteSpace: "nowrap",
          // El tinte de la columna se pinta sobre el fondo opaco de la cabecera fija; si no, se transparenta lo que pasa por debajo
          ...(fondo ? { textAlign: "center", backgroundColor: "var(--bg-card)", backgroundImage: `linear-gradient(${fondo}, ${fondo})` } : {}),
        }}
      >
        {etiqueta}
        {clave !== "cobro" && indicador(clave)}
      </th>
    );

  const expedienteAsignando = expedientes.find((e) => e.id_expediente === asignandoId);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
      {/* Cabecera fija: herramientas y filtros se quedan arriba al bajar por la lista (el buscador global es el del encabezado de la aplicación) */}
      <div style={{ position: "sticky", top: 0, zIndex: 40, background: "var(--bg-app)", paddingBottom: "6px", display: "flex", flexDirection: "column", gap: "10px" }}>
      {/* BARRA DE ACCIONES: lo que se hace con la lista, en cuatro grupos */}
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "8px 16px", background: "rgba(255, 255, 255, 0.03)", padding: "8px 12px", borderRadius: "8px", border: "1px solid var(--border-light)" }}>
        <GrupoAcciones titulo="Datos">
          <button type="button" className="btn btn-primary" onClick={() => setMenuDatos(true)} style={{ padding: "5px 12px", fontSize: "0.82rem" }} title="Importar expedientes (Excel o CSV), contrastar un listado, exportar (CSV o JSON), copias internas y copia de seguridad: todo en una sola ventana, con la explicación de cada opción">
            🗂️ Importar y exportar
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => setVerDuplicados(true)} style={{ padding: "5px 12px", fontSize: "0.82rem" }} title="Busca expedientes duplicados: mismo bastidor, misma matrícula, o mismo cliente y modelo. Solo lee, no cambia nada">
            🔎 Duplicados
          </button>
        </GrupoAcciones>

        <GrupoAcciones titulo="Vista">
          <button type="button" className="btn" onClick={() => setSelectorColumnas(true)} style={botonHerramienta(selectorColumnas, "var(--primary)", "white")} title="Ordena las columnas de la tabla (arrastrando), muéstralas u ocúltalas, vuelve a lo predeterminado o guarda tus propias vistas">
            ⚙️ Columnas
          </button>
          <button type="button" className="btn" onClick={alternarPaneles} style={botonHerramienta(false, "", "")} title={hayPanelAbierto ? "Pliega de golpe los filtros, el resumen estadístico, las comisiones y la cartera" : "Despliega de golpe los filtros, el resumen estadístico, las comisiones y la cartera"}>
            {hayPanelAbierto ? "⇕ Plegar" : "⇕ Desplegar"}
          </button>
          {selectorColumnas && (
            <PanelColumnas anchos={anchos} anchosPorDefecto={ANCHO_COLUMNA} alCambiarAnchos={(a) => fijarAnchos(JSON.stringify(a))} columnas={COLUMNAS} actual={{ orden, visibles }} predeterminada={{ orden: ORDEN_POR_DEFECTO, visibles: POR_DEFECTO }} vistasIncluidas={VISTAS_INCLUIDAS} alCambiar={cambiarConfigColumnas} alCerrar={() => setSelectorColumnas(false)} />
          )}
        </GrupoAcciones>

        <GrupoAcciones titulo="Edición masiva" ayuda="Para cambiar o borrar varios expedientes a la vez hay que desbloquear antes: se vuelven a bloquear solos pasado el tiempo configurado">
          <button
            type="button"
            className="btn"
            onClick={() => {
              if (seleccionActiva) setSeleccionados([]);
              modoSeleccion.alternar();
            }}
            style={botonHerramienta(seleccionActiva, "var(--warning)", "black")}
            title={seleccionActiva ? "Bloquear Selección Masiva. Se queda activa hasta que la desactives" + (modoSeleccion.restante !== null ? "; si no, se desactiva sola cuando acabe la cuenta atrás (se configura en Configuración de expedientes)." : ".") : "Desbloquear Selección Masiva. Se queda activa hasta que la desactives o hasta que pase el tiempo configurado."}
          >
            {seleccionActiva ? "🔓 Selección activa" : "🔒 Selección"}
            {modoSeleccion.restante !== null && <span style={{ marginLeft: "6px", fontVariantNumeric: "tabular-nums" }}>⏱ {formatoCuentaAtras(modoSeleccion.restante)}</span>}
          </button>
          <button
            type="button"
            className="btn"
            onClick={modoBorrado.alternar}
            style={botonHerramienta(borradoActivo, "var(--danger)", "white")}
            title={borradoActivo ? "Bloquear Eliminación. Se queda activa hasta que la desactives" + (modoBorrado.restante !== null ? "; si no, se desactiva sola cuando acabe la cuenta atrás (se configura en Configuración de expedientes)." : ".") : "Desbloquear Eliminación. Se queda activa hasta que la desactives o hasta que pase el tiempo configurado."}
          >
            {borradoActivo ? "🔓 Eliminación activa" : "🔒 Eliminación"}
            {modoBorrado.restante !== null && <span style={{ marginLeft: "6px", fontVariantNumeric: "tabular-nums" }}>⏱ {formatoCuentaAtras(modoBorrado.restante)}</span>}
          </button>
        </GrupoAcciones>

        {(puedeCrearExpedientes(userRole) || esAdministrador) && (
          <div style={{ display: "flex", alignItems: "center", gap: "6px", marginLeft: "auto" }}>
            {puedeCrearExpedientes(userRole) && (
              <Link href="/dashboard/expedientes/nuevo" className="btn btn-primary" style={{ padding: "5px 12px", fontSize: "0.95rem", fontWeight: 800, lineHeight: 1, textDecoration: "none" }} title="Nuevo expediente" aria-label="Nuevo expediente">
                ➕
              </Link>
            )}
            {esAdministrador && <BotonAjustes soloIcono pestana="expedientes" titulo="Ajustes de Expedientes" ayuda="Ajustes de Expedientes (Configuración › Expedientes): expedientes por página, qué se ve al abrir, colores de fila, selección y eliminación, foto del cliente" />}
          </div>
        )}

        {seleccionActiva && seleccionados.length > 0 && (
          <GrupoAcciones titulo={`${seleccionados.length} seleccionado${seleccionados.length === 1 ? "" : "s"}`} destacado>
            <button type="button" className="btn" onClick={() => setEdicionMasiva(true)} style={{ padding: "5px 12px", fontSize: "0.8rem", backgroundColor: "#2e7d32", color: "white", border: "none", borderRadius: "var(--radius-sm)", fontWeight: 600, cursor: "pointer" }} title="Cambia a la vez un dato de todos los seleccionados">
              ✏️ Editar
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => void deshabilitarSeleccionados(true)} style={{ padding: "5px 12px", fontSize: "0.8rem" }} title="Los expedientes deshabilitados no cuentan en las comisiones, la tasa ni las liquidaciones, ni en los totales y listados, hasta que los vuelvas a habilitar (se ven con «Mostrar deshabilitados»)">
              ⏸ Deshabilitar
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => void deshabilitarSeleccionados(false)} style={{ padding: "5px 12px", fontSize: "0.8rem" }} title="Vuelve a contar los expedientes seleccionados en las comisiones, la tasa y las liquidaciones">
              ▶ Habilitar
            </button>
            {permitirDup && (
              <button type="button" className="btn btn-secondary" onClick={() => { setCopias("1"); setDuplicando(seleccionados); }} style={{ padding: "5px 12px", fontSize: "0.8rem" }} title="Crea copias de los expedientes seleccionados (para pruebas)">
                📑 Duplicar
              </button>
            )}
            <button type="button" className="btn btn-secondary" onClick={() => exportarCsv(true)} style={{ padding: "5px 12px", fontSize: "0.8rem" }} title="Descarga en CSV solo los expedientes seleccionados">
              📤 Exportar (CSV)
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => borradoActivo && setConfirmarBorradoMasivo(true)}
              disabled={!borradoActivo}
              title={borradoActivo ? "Manda los seleccionados a la Papelera (se pueden recuperar)" : "Desbloquea antes «Eliminación»"}
              style={{ padding: "5px 12px", fontSize: "0.8rem", backgroundColor: borradoActivo ? "var(--danger)" : "rgba(255,255,255,0.02)", color: borradoActivo ? "white" : "var(--text-muted)", border: borradoActivo ? "none" : "1px solid var(--border-light)", cursor: borradoActivo ? "pointer" : "not-allowed", borderRadius: "var(--radius-sm)", fontWeight: 600, opacity: borradoActivo ? 1 : 0.5 }}
            >
              🗑️ A la Papelera
            </button>
          </GrupoAcciones>
        )}
      </div>
      {verDuplicados && <ModalDuplicados alCerrar={() => setVerDuplicados(false)} />}

      {menuDatos && (
        <Modal
          titulo="🗂️ Importar y exportar expedientes"
          ancho="860px"
          pie={
            <button type="button" className="btn btn-secondary" onClick={() => setMenuDatos(false)}>
              Cerrar
            </button>
          }
        >
          <div style={{ display: "flex", flexDirection: "column", gap: "18px", fontSize: "0.9rem" }}>
            <GrupoDatos titulo="📥 Traer expedientes" ayuda="Para añadir ventas desde fuera de la aplicación.">
              <OpcionDatos
                icono="🟢"
                titulo="Importar datos de Excel"
                texto="Lee el listado de ventas en Excel (.xlsx) y crea o actualiza expedientes. Si hay conflictos te los enseña antes de cambiar nada."
                ayuda="Elige un archivo Excel del listado de ventas. Solo actualiza datos de expedientes que ya existen (por cliente); no crea expedientes y te pregunta qué hacer cuando un cliente tiene varios. Para listados del fabricante es mejor «Completar datos desde listados»."
                archivo=".xlsx, .xls"
                deshabilitado={importandoExcel || cargando}
                alElegir={(e) => {
                  setMenuDatos(false);
                  void importarExcel(e);
                }}
                biblioteca={{
                  categorias: ["listado"],
                  multiple: false,
                  alElegir: (a) => {
                    setMenuDatos(false);
                    void importarExcel(eventoDeArchivos<ChangeEvent<HTMLInputElement>>(a));
                  },
                }}
              />
              {mostrarBotonesCsv && (
                <OpcionDatos
                  icono="📥"
                  titulo="Importar CSV"
                  texto="Carga expedientes desde un archivo CSV exportado antes con esta aplicación."
                  ayuda="Elige un archivo .csv con el formato de «Exportar todo (CSV)». Crea expedientes y los enlaza con las marcas, modelos, tipos de venta y estados que ya tienes; nunca crea ni cambia esos catálogos."
                  archivo=".csv"
                  deshabilitado={cargando}
                  alElegir={(e) => {
                    setMenuDatos(false);
                    void importarCsv(e);
                  }}
                />
              )}
            </GrupoDatos>

            <GrupoDatos titulo="🧩 Completar datos de expedientes que ya tienes" ayuda="No crea nada: solo rellena huecos o corrige datos.">
              <OpcionDatos
                icono="🧩"
                titulo="Completar datos desde listados"
                texto="Sube los Excel o CSV del fabricante (Expedientes, Llamadas de calidad…): la app reconoce las columnas, encuentra tus expedientes por bastidor, matrícula, NIF o correo y propone rellenar o corregir (con el PDF del pedido al lado, filtros por anulados y archivados y edición a mano). Ves todo antes de aplicar."
                ayuda="Completa matrícula, bastidor, fechas, NIF, código postal, correo y teléfono de expedientes existentes. No crea expedientes ni modelos y se puede deshacer desde el Log de importaciones."
                alPulsar={() => {
                  setMenuDatos(false);
                  setCompletando(true);
                }}
              />
            </GrupoDatos>

            <GrupoDatos titulo="🔎 Comprobar sin cambiar nada" ayuda="Para revisar, no modifica ningún expediente.">
              <OpcionDatos
                icono="🔎"
                titulo="Contrastar listado"
                texto="Compara un listado de ventas en Excel con tus expedientes y te dice qué falta o no coincide. No cambia nada."
                ayuda="Elige el Excel de la empresa: se compara con tus expedientes y se muestra un informe. No se crea ni se modifica nada."
                archivo=".xlsx, .xls"
                deshabilitado={importandoExcel || cargando}
                alElegir={(e) => {
                  setMenuDatos(false);
                  void contrastarListado(e);
                }}
                biblioteca={{
                  categorias: ["listado"],
                  multiple: false,
                  alElegir: (a) => {
                    setMenuDatos(false);
                    void contrastarListado(eventoDeArchivos<ChangeEvent<HTMLInputElement>>(a));
                  },
                }}
              />
            </GrupoDatos>

            {mostrarBotonesCsv && (
              <GrupoDatos titulo="📤 Sacar expedientes" ayuda="Descarga un archivo con los expedientes.">
                <OpcionDatos
                  icono="📤"
                  titulo="Exportar SOLO expedientes: todos (CSV)"
                  texto="Descarga todos los expedientes (los que ves con los filtros actuales) en un CSV que se abre con Excel."
                  ayuda="Descarga un archivo .csv en tu equipo con los expedientes de la tabla. No cambia nada en la aplicación."
                  alPulsar={() => {
                    setMenuDatos(false);
                    exportarCsv(false);
                  }}
                />
                <OpcionDatos
                  icono="☑️"
                  titulo="Exportar SOLO expedientes: los seleccionados (CSV)"
                  texto={seleccionados.length > 0 ? `Descarga solo los ${seleccionados.length} expedientes que has marcado.` : "Primero activa «Selección» en la barra y marca los expedientes que quieras."}
                  ayuda="Descarga solo los expedientes marcados. Requiere activar la selección masiva y marcar alguno."
                  deshabilitado={seleccionados.length === 0}
                  alPulsar={() => {
                    setMenuDatos(false);
                    exportarCsv(true);
                  }}
                />
              </GrupoDatos>
            )}

            {esAdministrador && (
              <GrupoDatos titulo="🗄️ Copias y traspaso entre instalaciones" ayuda="Solo administradores. Para guardar, recuperar o llevar los expedientes a otro equipo.">
                <CajaDatos titulo="📁 Expedientes en archivo JSON y copias internas" texto="Exporta o importa solo los expedientes (con vista previa y copia de seguridad automática) y guarda copias internas de esta sección dentro de la aplicación para restaurarlas cuando quieras.">
                  <BotonesDatosSeccion modo="botones" seccion="expedientes" />
                </CajaDatos>
              </GrupoDatos>
            )}
          </div>
        </Modal>
      )}
      {/* FILTROS: lo que se ve, la fecha, el vehículo y la venta, y quién */}
      <div className="glass-panel" style={{ padding: "10px 14px", display: "flex", flexDirection: "column", gap: "10px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px 14px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <h4 onClick={() => fijarFiltrosAbiertos(filtrosAbiertos ? "false" : "true")} title={filtrosAbiertos ? "Plegar filtros" : "Desplegar filtros"} style={{ cursor: "pointer", userSelect: "none", margin: 0, fontSize: "0.95rem", fontWeight: 600, color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "8px" }}>
              <span>{filtrosAbiertos ? "▾" : "▸"} 🔍 Filtros</span>
            </h4>
            <button type="button" className="btn btn-secondary" onClick={limpiarFiltros} title="Quita todos los filtros y deja solo los expedientes del comercial que ha iniciado sesión" style={{ padding: "4px 10px", fontSize: "0.75rem", color: "var(--danger)", borderColor: "rgba(239, 68, 68, 0.2)" }}>
              🧹 Limpiar filtros
            </button>
            <button
              type="button"
              className={fEnCurso ? "btn btn-primary" : "btn btn-secondary"}
              onClick={() => {
                limpiarFiltros();
                setFEnCurso(true);
              }}
              title="Muestra los expedientes con los que estás trabajando: todos los que no están Anulados, en Post-venta ni Archivados en la intranet, sin importar la fecha, y solo los del comercial que ha iniciado sesión"
              style={{ padding: "4px 10px", fontSize: "0.75rem" }}
            >
              🛠️ En curso
            </button>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }} title="Qué expedientes entran en la lista y en los totales">
            <span style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>Mostrar:</span>
            <label style={{ ...botonHerramienta(false, "", ""), gap: "8px", fontSize: "0.78rem" }} title="Quita de la lista los expedientes que ya tienen fecha de entrega">
              <input type="checkbox" checked={ocultarEntregados} onChange={(e) => { setOcultarEntregados(e.target.checked); setPagina(1); }} style={{ width: "15px", height: "15px", accentColor: "var(--primary)", cursor: "pointer" }} />
              <span>Ocultar entregados</span>
            </label>
            <label
              style={{ ...botonHerramienta(false, "", ""), gap: "8px", fontSize: "0.78rem", background: mostrarCobros ? "rgba(var(--primary-rgb), 0.12)" : "rgba(255, 255, 255, 0.05)", border: `1px solid ${mostrarCobros ? "var(--primary)" : "var(--border-light)"}` }}
              title="Enseña la columna «Comisionado» (si la comisión ya aparece como pagada en el Cotejo de pagos). Es la misma casilla que en «Columnas y vistas»"
            >
              <input type="checkbox" checked={mostrarCobros} onChange={(e) => { fijarColumnas(JSON.stringify({ ...visibles, cobro: e.target.checked })); }} style={{ width: "15px", height: "15px", accentColor: "var(--primary)", cursor: "pointer" }} />
              <span>👁️ Columna Comisionado</span>
            </label>
            <label
              style={{ ...botonHerramienta(false, "", ""), gap: "8px", fontSize: "0.78rem", background: mostrarIntranet ? "rgba(var(--primary-rgb), 0.12)" : "rgba(255, 255, 255, 0.05)", border: `1px solid ${mostrarIntranet ? "var(--primary)" : "var(--border-light)"}` }}
              title="Enseña la columna «Estado intranet» (el estado del expediente en la intranet del fabricante). Es la misma casilla que en «Columnas y vistas»"
            >
              <input type="checkbox" checked={mostrarIntranet} onChange={(e) => { fijarColumnas(JSON.stringify({ ...visibles, estado_intranet: e.target.checked })); }} style={{ width: "15px", height: "15px", accentColor: "var(--primary)", cursor: "pointer" }} />
              <span>🏷️ Columna Estado intranet</span>
            </label>
            <CasillaAnulados activa={mostrarAnulados} alCambiar={(v) => { fijarMostrarAnulados(v); setPagina(1); }} anulados={nAnulados} estilo={{ fontSize: "0.78rem" }} />
            <CasillaDeshabilitados activa={mostrarDeshabilitados} alCambiar={(v) => { fijarMostrarDeshabilitados(v); setPagina(1); }} deshabilitados={nDeshabilitados} estilo={{ fontSize: "0.78rem" }} />
          </div>
        </div>

        {filtrosActivos.length > 0 && (
          <div style={{ display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap", padding: "6px 10px", borderRadius: "var(--radius-sm)", border: "1px dashed var(--warning)", background: "rgba(245, 158, 11, 0.07)" }}>
            <strong style={{ fontSize: "0.78rem", color: "var(--warning)" }}>⚠️ Estás viendo una lista filtrada:</strong>
            {filtrosActivos.map((f) => (
              <span key={f} style={{ fontSize: "0.75rem", border: "1px solid var(--warning)", borderRadius: "999px", padding: "1px 8px" }}>
                {f}
              </span>
            ))}
            <button type="button" className="btn btn-secondary" onClick={limpiarFiltros} style={{ padding: "2px 10px", fontSize: "0.72rem" }} title="Quita todos los filtros y deja solo los expedientes del comercial que ha iniciado sesión">
              Quitar filtros
            </button>
          </div>
        )}

        {filtrosAbiertos && (
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            <BloqueFiltros titulo="📅 Fecha" ayuda="Se filtra por el campo de fecha elegido. El rango «Desde / Hasta» y el mes y año se excluyen: al usar uno se quita el otro">
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: "8px" }}>
                <CampoFiltro etiqueta="Campo de fecha" ayuda="Sobre qué fecha del expediente se filtra. «Todas las fechas» vale con cualquiera de ellas">
                  <select className="form-input" value={fTipoFecha} onChange={(e) => { setFTipoFecha(e.target.value); setPagina(1); }} style={estiloSelectFiltro}>
                    {FECHAS_FILTRO.map((f) => (
                      <option key={f.valor} value={f.valor}>
                        {f.etiqueta}
                      </option>
                    ))}
                  </select>
                </CampoFiltro>
                <CampoFiltro etiqueta="Desde" ayuda="Primer día del rango, sobre el campo de fecha elegido (incluido)">
                  <input type="date" className="form-input" value={rango.desde} max={rango.hasta || undefined} onChange={(e) => { ponerRango((r) => ({ ...r, desde: e.target.value })); }} style={{ ...estiloSelectFiltro, padding: "3px 6px" }} />
                  <BotonesMoverFecha etiqueta="Desde" alMover={(meses) => { ponerRango((r) => ({ ...r, desde: moverMeses(r.desde, meses) })); }} />
                </CampoFiltro>
                <CampoFiltro etiqueta="Hasta" ayuda="Último día del rango, sobre el campo de fecha elegido (incluido)">
                  <input type="date" className="form-input" value={rango.hasta} min={rango.desde || undefined} onChange={(e) => { ponerRango((r) => ({ ...r, hasta: e.target.value })); }} style={{ ...estiloSelectFiltro, padding: "3px 6px" }} />
                  <BotonesMoverFecha etiqueta="Hasta" alMover={(meses) => { ponerRango((r) => ({ ...r, hasta: moverMeses(r.hasta, meses) })); }} />
                </CampoFiltro>
                <CampoFiltro etiqueta="Mes">
                  <select className="form-input" value={fMes} onChange={(e) => { setFMes(e.target.value); if (e.target.value) setRango(RANGO_VACIO); setPagina(1); }} style={estiloSelectFiltro}>
                    <option value="">Todos los meses</option>
                    {MESES.map((nombre, i) => (
                      <option key={nombre} value={String(i + 1).padStart(2, "0")}>
                        {nombre}
                      </option>
                    ))}
                  </select>
                </CampoFiltro>
                <CampoFiltro etiqueta="Año">
                  <select className="form-input" value={fAnio} onChange={(e) => { setFAnio(e.target.value); if (e.target.value) setRango(RANGO_VACIO); setPagina(1); }} style={estiloSelectFiltro}>
                    <option value="">Todos los años</option>
                    {opciones.anios.map((a) => (
                      <option key={a} value={a}>
                        {a}
                      </option>
                    ))}
                  </select>
                </CampoFiltro>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "8px 18px", flexWrap: "wrap" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                  <span style={{ fontSize: "0.72rem", color: "var(--text-muted)" }} title="Rellenan «Desde» y «Hasta» con un clic, sobre el campo de fecha elegido">
                    Rangos rápidos:
                  </span>
                  {(
                    [
                      { id: "hoy", texto: "Hoy" },
                      { id: "semana", texto: "Esta semana" },
                      { id: "mes", texto: "Este mes" },
                      { id: "mes_pasado", texto: "Mes pasado" },
                      { id: "anio", texto: "Este año" },
                    ] as { id: AtajoRango; texto: string }[]
                  ).map((a) => {
                    const r = rangoDeAtajo(a.id);
                    const activo = rango.desde === r.desde && rango.hasta === r.hasta;
                    return (
                      <button key={a.id} type="button" className={activo ? "btn btn-primary" : "btn btn-secondary"} onClick={() => { ponerRango(() => r); }} style={botonMes} title={`${a.texto}: ${textoRango(r)}`}>
                        {a.texto}
                      </button>
                    );
                  })}
                  {rangoActivo && (
                    <button type="button" className="btn btn-secondary" onClick={() => { setRango(RANGO_VACIO); setPagina(1); }} style={{ ...botonMes, color: "var(--danger)" }} title="Quita el rango de fechas y deja los demás filtros">
                      ✕ Quitar rango
                    </button>
                  )}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                  <span style={{ fontSize: "0.72rem", color: "var(--text-muted)" }} title="Filtran por mes completo y cambian el campo de fecha: pulsa Anterior / Actual / Siguiente para ir de mes en mes">
                    Por mes:
                  </span>
                  {(
                    [
                      { campo: "fecha_comisionado", etiqueta: "Se cobra en", ayuda: "expedientes comisionados (que se cobran) en el mes elegido; «Actual» es el mes en curso" },
                      { campo: "fecha_afectacion", etiqueta: "Afectados en", ayuda: "expedientes con fecha de afectación en el mes elegido" },
                    ] as const
                  ).map((g) => (
                    <div key={g.campo} style={cajaMes}>
                      <span style={textoCaja}>{g.etiqueta}</span>
                      <div style={{ display: "flex", gap: "4px" }}>
                        <button type="button" className="btn btn-secondary" onClick={() => cambiarMesFiltro(g.campo, "ant")} style={botonMes} title={`Mes anterior: ${g.ayuda}`}>
                          ◀ Anterior
                        </button>
                        <button type="button" className="btn btn-secondary" onClick={() => cambiarMesFiltro(g.campo, "actual")} style={botonMes} title={`Mes actual: ${g.ayuda}`}>
                          Actual
                        </button>
                        <button type="button" className="btn btn-secondary" onClick={() => cambiarMesFiltro(g.campo, "sig")} style={botonMes} title={`Mes siguiente: ${g.ayuda}`}>
                          Siguiente ▶
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </BloqueFiltros>

            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "stretch" }}>
              <BloqueFiltros titulo="🚗 Vehículo y venta" crece>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: "8px" }}>
                  <CampoFiltro etiqueta="Marca">
                    <select className="form-input" value={fMarca} onChange={(e) => { setFMarca(e.target.value); setFModelo(""); setPagina(1); }} style={estiloSelectFiltro}>
                      <option value="">Todas las marcas</option>
                      <option value="VO_NO_BRAND">Sin Marca (VO)</option>
                      {opciones.marcas.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                  </CampoFiltro>
                  <CampoFiltro etiqueta="Modelo">
                    <select className="form-input" value={fModelo} onChange={(e) => { setFModelo(e.target.value); setPagina(1); }} style={estiloSelectFiltro} disabled={fMarca === "VO_NO_BRAND"}>
                      <option value="">Todos los modelos</option>
                      {opciones.modelos.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                  </CampoFiltro>
                  <CampoFiltro etiqueta="Tipo de venta">
                    <select className="form-input" value={fTipo} onChange={(e) => { setFTipo(e.target.value); setPagina(1); }} style={estiloSelectFiltro}>
                      <option value="">Todos los tipos</option>
                      {opciones.tipos.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </CampoFiltro>
                  <CampoFiltro etiqueta="Estado del vehículo">
                    <select className="form-input" value={fEstado} onChange={(e) => { setFEstado(e.target.value); setPagina(1); }} style={estiloSelectFiltro}>
                      <option value="">Todos los estados</option>
                      {opciones.estados.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </CampoFiltro>
                  <CampoFiltro etiqueta="Estado intranet" ayuda="Estado del expediente en la intranet del fabricante (Archivado, Anulado…), importado desde sus listados con «Completar datos desde listados»">
                    <select className="form-input" value={fIntranet} onChange={(e) => { setFIntranet(e.target.value); setPagina(1); }} style={estiloSelectFiltro}>
                      <option value="">Todos</option>
                      <option value="__sin__">Sin estado importado</option>
                      {opciones.estadosIntranet.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </CampoFiltro>
                  <CampoFiltro etiqueta="Apunte" ayuda="Expedientes que llevan un apunte concreto (Seguro, VO de retoma…) o ninguno">
                    <select className="form-input" value={fApunte} onChange={(e) => { setFApunte(e.target.value); setPagina(1); }} style={estiloSelectFiltro}>
                      <option value="">Todos</option>
                      <option value="__sin__">Sin apuntes</option>
                      {opciones.apuntes.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </CampoFiltro>
                </div>
              </BloqueFiltros>

              <BloqueFiltros titulo="👤 Comercial y tienda">
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(130px, 1fr))", gap: "8px" }}>
                  <CampoFiltro etiqueta="Comercial">
                    <select className="form-input" value={fVendedor} onChange={(e) => { setFVendedor(e.target.value); setPagina(1); }} style={estiloSelectFiltro}>
                      <option value="">Todos los comerciales</option>
                      {opciones.vendedores.map((v) => (
                        <option key={v} value={v}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </CampoFiltro>
                  <CampoFiltro etiqueta="Tienda">
                    <select className="form-input" value={fTienda} onChange={(e) => { setFTienda(e.target.value); setPagina(1); }} style={estiloSelectFiltro}>
                      <option value="">Todas las tiendas</option>
                      {tiendas.map((t) => (
                        <option key={t.id_tienda} value={t.id_tienda}>
                          {t.nombre}
                        </option>
                      ))}
                    </select>
                  </CampoFiltro>
                </div>
              </BloqueFiltros>
            </div>
          </div>
        )}
      </div>

      {totalEnBd !== undefined && totalEnBd > expedientes.length && (
        <div style={{ padding: "12px 16px", borderLeft: "4px solid var(--warning)", background: "var(--bg-card)", borderRadius: "var(--radius-sm)", fontSize: "0.9rem" }}>
          ⚠️ Se muestran los {expedientes.length.toLocaleString("es-ES")} expedientes más recientes de {totalEnBd.toLocaleString("es-ES")}. Para localizar uno anterior usa el buscador de arriba o la ficha del cliente.
        </div>
      )}

      </div>

      {/* TABLA */}
      <div className="glass-panel" style={{ padding: "8px" }}>
        <BarraPaginacion
          tamano={tamano}
          pagina={paginaSegura}
          totalPaginas={totalPaginas}
          totalFiltrados={filtrados.length}
          totalGeneral={expedientes.length}
          alCambiarTamano={(t) => {
            setTamano(t);
            setPagina(1);
          }}
          alIrAPagina={(p) => setPagina(Math.max(1, Math.min(p, totalPaginas)))}
        />

        <div className="table-container tabla-pagina" ref={refTabla}>
          <table className="table-premium table-compact tabla-fija" style={{ width: (seleccionActiva ? ANCHO_SELECCION : 0) + columnasActivas.reduce((t, c) => t + anchoDe(c.clave), 0) + ANCHO_ACCIONES, minWidth: "100%" }}>
            {encabezadoTabla()}
            <tbody>
              {visiblesPagina.map((exp) => {
                const marcada = seleccionados.includes(exp.id_expediente);
                return (
                  <tr
                    key={exp.id_expediente}
                    style={{ background: marcada ? "rgba(var(--primary-rgb), 0.04)" : reglaDe(exp) ? fondoDeRegla(reglaDe(exp)!) : undefined, opacity: exp.deshabilitado ? 0.5 : undefined }}
                    title={exp.deshabilitado ? "Expediente deshabilitado: no cuenta en las comisiones ni en la tasa. Se vuelve a habilitar desde la selección o dentro del expediente." : reglaDe(exp) ? `Regla de color: ${reglaDe(exp)!.nombre}` : undefined}
                  >
                    {seleccionActiva && (
                      <td style={{ textAlign: "center" }}>
                        <input
                          type="checkbox"
                          checked={marcada}
                          onMouseDown={(e) => {
                            if (e.shiftKey) e.preventDefault();
                          }}
                          onChange={(e) => seleccionarUno(exp.id_expediente, e.target.checked, (e.nativeEvent as MouseEvent).shiftKey === true)}
                          title="Elige este expediente. Con Mayús pulsada, elige de golpe todos los que hay entre el último que tocaste y este"
                          style={{ width: "16px", height: "16px", cursor: "pointer" }}
                        />
                      </td>
                    )}
                    {(() => {
                      const celdas: Record<Columna, ReactNode> = {
                      cliente: mostrarCol("cliente") && (
                          <td style={{ fontWeight: 600, color: "var(--text-primary)", whiteSpace: "nowrap" }}>
                            <CeldaCliente exp={exp} alAsignar={setAsignandoId} />
                            {exp.deshabilitado && <span style={{ marginLeft: "6px", fontSize: "0.7rem", fontWeight: 700, color: "var(--text-muted)", border: "1px solid var(--border-light)", borderRadius: "999px", padding: "1px 6px" }}>⏸ Deshabilitado</span>}
                          </td>
                      ),
                      telefono: mostrarCol("telefono") && (
                          <td>
                            {exp.cliente?.telefonos[0]?.telefono ? <TextoCopiable texto={exp.cliente.telefonos[0].telefono} /> : <span style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>N/D</span>}
                          </td>
                      ),
                      email: mostrarCol("email") && (
                          <td>
                            {exp.cliente?.emails[0]?.email ? <TextoCopiable texto={exp.cliente.emails[0].email} /> : <span style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>N/D</span>}
                          </td>
                      ),
                      punto: mostrarCol("punto") && (
                          <td style={{ textAlign: "center" }}>
                            <PuntoMarca punto={aspectoVehiculo(exp.modelo?.marca, exp.estadoVehiculo).punto} color={aspectoVehiculo(exp.modelo?.marca, exp.estadoVehiculo).puntoColor} />
                          </td>
                      ),
                      clase: mostrarCol("clase") && (
                          <td style={{ textAlign: "center" }}>
                            <EtiquetaClase clase={exp.estadoVehiculo?.clase} />
                          </td>
                      ),
                      marca: mostrarCol("marca") && (
                          <td>{exp.modelo?.marca?.nombre ? <TextoCopiable texto={exp.modelo.marca.nombre}><EtiquetaMarca texto={exp.modelo.marca.nombre} color={aspectoVehiculo(exp.modelo.marca, exp.estadoVehiculo).capsula} /></TextoCopiable> : <span style={{ fontStyle: "italic", color: "var(--text-muted)" }}>VO (Sin marca)</span>}</td>
                      ),
                      modelo: mostrarCol("modelo") && (
                          <td>
                            {exp.modelo ? (
                              <TextoCopiable texto={exp.modelo.nombre_modelo} estilo={{ fontWeight: 500, color: "var(--text-primary)" }}>
                                <EtiquetaMarca texto={exp.modelo.nombre_modelo} color={aspectoVehiculo(exp.modelo.marca, exp.estadoVehiculo).capsula} />
                              </TextoCopiable>
                            ) : (
                              <span style={{ fontStyle: "italic", color: "var(--text-muted)" }}>VO (Sin modelo)</span>
                            )}
                            {exp.copia_de && exp.copia_etiqueta && <span title={`Copia del expediente nº ${exp.copia_de} (hecha con «Duplicar»)`} style={{ display: "inline-block", fontSize: "0.65rem", fontWeight: 700, letterSpacing: "0.04em", color: "var(--warning)", border: "1px solid var(--warning)", borderRadius: "4px", padding: "0 5px", marginTop: "2px" }}>COPIA de #{exp.copia_de}</span>}
                            {exp.vin && <TextoCopiable texto={exp.vin} estilo={{ fontSize: "0.7rem", color: "var(--text-muted)", fontFamily: "monospace", marginTop: "1px" }}>VIN: {exp.vin}</TextoCopiable>}
                          </td>
                      ),
                      marca_modelo: mostrarCol("marca_modelo") && (
                          <td>
                            {marcaYModelo(exp) ? (
                              <TextoCopiable texto={marcaYModelo(exp)} estilo={{ fontWeight: 500, color: "var(--text-primary)" }}>
                                <EtiquetaMarca texto={marcaYModelo(exp)} color={aspectoVehiculo(exp.modelo?.marca, exp.estadoVehiculo).capsula} />
                              </TextoCopiable>
                            ) : (
                              <span style={{ fontStyle: "italic", color: "var(--text-muted)" }}>VO (Sin marca ni modelo)</span>
                            )}
                            {exp.copia_de && exp.copia_etiqueta && <span title={`Copia del expediente nº ${exp.copia_de} (hecha con «Duplicar»)`} style={{ display: "inline-block", fontSize: "0.65rem", fontWeight: 700, letterSpacing: "0.04em", color: "var(--warning)", border: "1px solid var(--warning)", borderRadius: "4px", padding: "0 5px", marginTop: "2px" }}>COPIA de #{exp.copia_de}</span>}
                            {exp.vin && <TextoCopiable texto={exp.vin} estilo={{ fontSize: "0.7rem", color: "var(--text-muted)", fontFamily: "monospace", marginTop: "1px" }}>VIN: {exp.vin}</TextoCopiable>}
                          </td>
                      ),
                      tipo_venta: mostrarCol("tipo_venta") && (
                          <td>
                            <BadgeTipoVenta exp={exp} />
                          </td>
                      ),
                      estado: mostrarCol("estado") && (
                          <td style={{ textAlign: "center" }}>
                            <BadgeEstado exp={exp} />
                          </td>
                      ),
                      vendedor: mostrarCol("vendedor") && (
                          <td>
                            {exp.usuario?.nombre ? <TextoCopiable texto={exp.usuario.nombre} estilo={{ fontSize: "0.9rem", fontWeight: 500 }} /> : <span style={{ fontSize: "0.9rem", fontWeight: 500 }}>N/D</span>}
                          </td>
                      ),
                      fecha_expediente: mostrarCol("fecha_expediente") && (
                          <td style={{ textAlign: "center", backgroundColor: FONDO_FECHA_A }}>
                            <span style={{ fontSize: "0.85rem" }}>{formatDate(exp.fecha_expediente)}</span>
                          </td>
                      ),
                      fecha_afectacion: mostrarCol("fecha_afectacion") && celdaFecha(exp, "fecha_afectacion", "Afectación", FONDO_FECHA_B),
                      fecha_rci: mostrarCol("fecha_rci") && celdaFecha(exp, "fecha_rci", "RCI", FONDO_FECHA_A),
                      fecha_matriculacion: mostrarCol("fecha_matriculacion") && celdaFecha(exp, "fecha_matriculacion", "Matriculación", FONDO_FECHA_B),
                      fecha_facturacion: mostrarCol("fecha_facturacion") && celdaFecha(exp, "fecha_facturacion", "Facturación", FONDO_FECHA_A),
                      fecha_entrega: mostrarCol("fecha_entrega") && celdaFecha(exp, "fecha_entrega", "Entrega", FONDO_FECHA_B),
                      estado_intranet: mostrarCol("estado_intranet") && (
                          <td style={{ textAlign: "center" }}>
                            {exp.estado_intranet ? (
                              <span className="badge" title={`Estado del expediente en la intranet del fabricante: ${exp.estado_intranet}`} style={{ fontSize: "0.75rem", ...(/anulad/i.test(exp.estado_intranet) ? { backgroundColor: "rgba(239, 68, 68, 0.12)", color: "var(--danger)", border: "1px solid rgba(239, 68, 68, 0.3)" } : { backgroundColor: "rgba(128, 128, 128, 0.1)", color: "var(--text-secondary)", border: "1px solid var(--border-light)" }) }}>
                                {exp.estado_intranet}
                              </span>
                            ) : (
                              <span style={{ color: "var(--text-muted)" }}>—</span>
                            )}
                          </td>
                      ),
                      cobro: mostrarCol("cobro") && (
                          <td style={{ textAlign: "center" }}>
                            {exp.comisionado?.estado === "pagado" ? (
                              <span className="badge" title={`Comisión pagada según el Cotejo de pagos de ${exp.comisionado.mes.split("-").reverse().join("/")}`} style={{ fontSize: "0.75rem", backgroundColor: "rgba(16, 185, 129, 0.15)", color: "var(--success)", border: "1px solid rgba(16, 185, 129, 0.3)" }}>
                                💰 Comisionado {exp.comisionado.mes.split("-").reverse().join("/")}
                              </span>
                            ) : exp.comisionado?.estado === "reclamado" ? (
                              <span className="badge" title={`Comisión reclamada a la empresa (liquidación de ${exp.comisionado.mes.split("-").reverse().join("/")})`} style={{ fontSize: "0.75rem", backgroundColor: "rgba(245, 158, 11, 0.12)", color: "var(--warning)", border: "1px solid rgba(245, 158, 11, 0.25)" }}>
                                ⚠️ Reclamado
                              </span>
                            ) : (
                              <span className="badge" title="Todavía no está marcado como pagado en el Cotejo de pagos" style={{ fontSize: "0.75rem", backgroundColor: "rgba(128, 128, 128, 0.1)", color: "var(--text-muted)", border: "1px solid var(--border-light)" }}>
                                Pendiente
                              </span>
                            )}
                          </td>
                      ),
                      };
                      return columnasActivas.map((c) => <Fragment key={c.clave}>{celdas[c.clave]}</Fragment>);
                    })()}
                    <td>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }}>
                        <Link
                          href={`/dashboard/expedientes/editar/${exp.id_expediente}`}
                          title="Editar expediente"
                          style={{ width: "28px", height: "28px", display: "inline-flex", alignItems: "center", justifyContent: "center", backgroundColor: "#f59e0b", color: "#000", borderRadius: "var(--radius-sm)", fontSize: "0.85rem", textDecoration: "none", boxShadow: "0 1px 3px rgba(0,0,0,0.2)" }}
                        >
                          ✏️
                        </Link>
                        {permitirDup && (
                          <button
                            type="button"
                            onClick={() => { setCopias("1"); setDuplicando([exp.id_expediente]); }}
                            title="Duplicar expediente"
                            style={{ width: "28px", height: "28px", display: "inline-flex", alignItems: "center", justifyContent: "center", backgroundColor: "var(--bg-btn-secondary)", border: "1px solid var(--border-light)", color: "var(--text-primary)", borderRadius: "var(--radius-sm)", fontSize: "0.85rem", cursor: "pointer" }}
                          >
                            📑
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => borradoActivo && setABorrar(exp)}
                          title={borradoActivo ? "Eliminar expediente" : "Desbloquea la eliminación primero"}
                          disabled={!borradoActivo}
                          style={{
                            width: "28px",
                            height: "28px",
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            backgroundColor: borradoActivo ? "#ef4444" : "rgba(239, 68, 68, 0.2)",
                            color: "#ffffff",
                            border: "none",
                            borderRadius: "var(--radius-sm)",
                            fontSize: "0.85rem",
                            cursor: borradoActivo ? "pointer" : "not-allowed",
                            opacity: borradoActivo ? 1 : 0.4,
                            boxShadow: borradoActivo ? "0 1px 3px rgba(0,0,0,0.2)" : "none",
                          }}
                        >
                          🗑️
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {visiblesPagina.length === 0 && (
                <tr>
                  <td colSpan={totalColSpan} style={{ textAlign: "center", color: "var(--text-muted)", padding: "40px" }}>
                    {expedientes.length === 0
                      ? "No hay expedientes registrados en el sistema."
                      : `No se encontraron expedientes con los filtros aplicados.${(!mostrarAnulados && nAnulados > 0) || (!mostrarDeshabilitados && nDeshabilitados > 0) ? ` Ojo: hay ${[!mostrarAnulados && nAnulados > 0 ? `${nAnulados} anulados` : "", !mostrarDeshabilitados && nDeshabilitados > 0 ? `${nDeshabilitados} deshabilitados` : ""].filter(Boolean).join(" y ")} ocultos (casillas «Mostrar…» de arriba).` : ""}`}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <CabeceraFlotante
          contenedor={refTabla}
          claseTabla="table-premium table-compact tabla-fija"
          anchoTabla={(seleccionActiva ? ANCHO_SELECCION : 0) + columnasActivas.reduce((t, c) => t + anchoDe(c.clave), 0) + ANCHO_ACCIONES}
        >
          {encabezadoTabla()}
        </CabeceraFlotante>

        {reglasColor.some((r) => r.activa && gruposDeRegla(r).some((g) => g.condiciones.length > 0)) && (
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "6px 10px", padding: "8px 4px 2px", fontSize: "0.78rem", color: "var(--text-secondary)" }} title="Qué significa el color de cada fila. Gana la primera regla, por orden, cuyas condiciones se cumplan. Se configura en Configuración › Expedientes › Colores de fila">
            <strong>🎨 Colores de las filas:</strong>
            {reglasColor.filter((r) => r.activa && gruposDeRegla(r).some((g) => g.condiciones.length > 0)).map((r) => (
              <span key={r.id} className="leyenda-regla" tabIndex={0} title={`${r.nombre || "Regla sin nombre"}: ${textoDeRegla(r)}`} style={{ display: "inline-flex", alignItems: "center", padding: "2px 8px", borderRadius: "999px", border: `1px solid ${r.color}`, background: fondoDeRegla(r), color: "var(--text-primary)", cursor: "default" }}>
                <span style={{ width: "10px", height: "10px", borderRadius: "50%", background: r.color, flex: "0 0 auto", marginRight: "6px" }} />
                <span style={{ whiteSpace: "nowrap" }}>{r.nombre || "Regla sin nombre"}</span>
                <span className="leyenda-regla-detalle" style={{ color: "var(--text-secondary)" }}>· {textoDeRegla(r)}</span>
              </span>
            ))}
          </div>
        )}

        <BarraPaginacion
          tamano={tamano}
          pagina={paginaSegura}
          totalPaginas={totalPaginas}
          totalFiltrados={filtrados.length}
          totalGeneral={expedientes.length}
          alCambiarTamano={(t) => {
            setTamano(t);
            setPagina(1);
          }}
          alIrAPagina={(p) => setPagina(Math.max(1, Math.min(p, totalPaginas)))}
        />
      </div>

      <ResumenMensual catalogo={expedientes} expedientes={expedientes.filter((e) => (mostrarAnulados || !esAnulado(e.estado_intranet)) && (mostrarDeshabilitados || !e.deshabilitado) && (!rangoActivo || fechasDeFiltro(e).some((f) => enRango(f, rangoOk))))} anios={opciones.anios.map(Number)} vendedor={fVendedor} esAdministrador={esAdministrador} />

      {modales}

      {asignandoId !== null && expedienteAsignando && (
        <ModalAsignarCliente
          expedienteId={asignandoId}
          vendedores={vendedores}
          vendedorInicial={expedienteAsignando.id_usuario}
          tiendas={tiendas}
          tiendaPredeterminadaId={tiendaPredeterminadaId}
          alCerrar={() => setAsignandoId(null)}
          alAsignado={(c, idVendedor) => {
            const vendedor = vendedores.find((v) => v.id_usuario === idVendedor);
            setExpedientes((prev) =>
              prev.map((e) =>
                e.id_expediente === asignandoId
                  ? {
                      ...e,
                      id_cliente: c.id,
                      id_usuario: idVendedor ?? e.id_usuario,
                      usuario: vendedor ? { id_usuario: vendedor.id_usuario, nombre: vendedor.nombre } : e.usuario,
                      cliente: { id: c.id, cliente_id: "", dni: c.dni, nombre: c.nombre, fecha_de_nacimiento: null, tienda_id: null, emails: [], telefonos: [] },
                    }
                  : e,
              ),
            );
            setAsignandoId(null);
          }}
        />
      )}

      {aBorrar && (
        <ModalConfirmar
          titulo="Confirmar Eliminación"
          mensaje="¿Eliminar este expediente? No se borra del todo: va a la Papelera (Herramientas › Papelera), donde se puede recuperar. Mientras esté allí no cuenta en listados, totales ni comisiones."
          textoConfirmar="Eliminar Expediente"
          ocupado={borrando}
          alConfirmar={() => void eliminar([aBorrar.id_expediente])}
          alCancelar={() => setABorrar(null)}
        />
      )}

      {confirmarBorradoMasivo && (
        <ModalConfirmar
          titulo="Confirmar Borrado Masivo"
          mensaje={
            <>
              ¿Eliminar los <strong>{seleccionados.length}</strong> expedientes seleccionados? No se borran del todo: van a la Papelera (Herramientas › Papelera), donde se pueden recuperar. Mientras estén allí no cuentan en listados, totales ni comisiones.
            </>
          }
          textoConfirmar="Eliminar Expedientes"
          ocupado={borrando}
          alConfirmar={() => void eliminar(seleccionados)}
          alCancelar={() => setConfirmarBorradoMasivo(false)}
        />
      )}

      {duplicando && (
        <Modal
          titulo="📑 Duplicar expedientes"
          ancho="460px"
          pie={
            <>
              <button type="button" className="btn btn-secondary" onClick={() => { setDuplicando(null); setFalloCopia(null); }} disabled={duplicandoEnCurso}>
                Cancelar
              </button>
              {falloCopia && (
                <button type="button" className="btn btn-secondary" style={{ color: "var(--danger)", borderColor: "var(--danger)" }} onClick={() => void duplicar(true)} disabled={duplicandoEnCurso} title="Duplica igualmente sin tener una copia de seguridad reciente. Solo si estás seguro de que no necesitas poder volver atrás.">
                  Duplicar sin copia previa
                </button>
              )}
              <button type="button" className="btn btn-primary" onClick={() => void duplicar()} disabled={duplicandoEnCurso || !copiasValidas}>
                {duplicandoEnCurso ? (duplicando.length * nCopias > 10 ? "Copia de seguridad y duplicado…" : "Duplicando…") : falloCopia ? "Reintentar" : "Sí, duplicar"}
              </button>
            </>
          }
        >
          <div style={{ display: "flex", flexDirection: "column", gap: "12px", fontSize: "0.9rem" }}>
            <div>
              Vas a duplicar <strong>{duplicando.length}</strong> expediente{duplicando.length === 1 ? "" : "s"}. ¿Cuántas copias de cada uno?
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Copias de cada expediente (de 1 a 50)</label>
              <input type="number" className="form-input" min={1} max={50} value={copias} onChange={(e) => setCopias(e.target.value)} disabled={duplicandoEnCurso} autoFocus style={{ maxWidth: "140px" }} />
            </div>
            <div style={{ color: copiasValidas ? "var(--text-secondary)" : "var(--danger)" }}>
              {copiasValidas ? <>Se crearán <strong>{duplicando.length * nCopias}</strong> expedientes nuevos en total.</> : "Escribe un número de copias entre 1 y 50."}
            </div>
            <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
              Se copian el cliente, el vendedor, el tipo de venta, las fechas y las comisiones a mano. No se copian el bastidor, la matrícula ni los documentos adjuntos. Las copias se pueden borrar después con «Eliminar Seleccionados» (llevan la etiqueta «COPIA» salvo que la hayas desactivado en Mis datos). Se crean todas a la vez: si falla algo, no se crea ninguna.
            </div>
            {duplicando.length * nCopias > 10 && (
              <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                🛡️ Como son muchos expedientes, antes se comprueba que haya una copia de seguridad válida de los últimos 15 minutos y, si no la hay, se hace una (tarda unos segundos).
              </div>
            )}
            {falloCopia && (
              <div role="alert" style={{ padding: "10px 12px", borderLeft: "4px solid var(--danger)", background: "rgba(239, 68, 68, 0.08)", color: "var(--danger)", fontSize: "0.85rem" }}>
                🛑 No se ha duplicado nada: no se pudo hacer la copia de seguridad previa. {falloCopia}
              </div>
            )}
          </div>
        </Modal>
      )}

      {edicionMasiva && (
        <ModalEdicionMasiva
          seleccionados={seleccionados.length}
          idsSeleccionados={seleccionados}
          esAdministrador={esAdministrador}
          ocupado={cargando}
          alGuardar={(c) => void guardarEdicionMasiva(c)}
          alCancelar={() => setEdicionMasiva(false)}
          alAvisar={(m) => mostrar(m, "error")}
        />
      )}

      {completando && <ModalCompletarDatos alCerrar={() => setCompletando(false)} alAplicar={() => router.refresh()} />}
      {contraste && <ModalContrasteListado nombreArchivo={contraste.archivo} resultado={contraste.resultado} alCerrar={() => setContraste(null)} />}

      {conflictos.length > 0 && conflictos[indiceConflicto] && (
        <ModalConflictoExcel
          conflicto={conflictos[indiceConflicto]}
          indice={indiceConflicto}
          total={conflictos.length}
          alElegir={(idExpediente) => {
            const c = conflictos[indiceConflicto];
            avanzarConflicto([...actualizaciones, aActualizacion(c.data, c.id_cliente, idExpediente)]);
          }}
          alOmitir={() => avanzarConflicto(actualizaciones)}
          alCancelarTodo={() => {
            setConflictos([]);
            setActualizaciones([]);
          }}
        />
      )}

      {importandoExcel && conflictos.length === 0 && (
        <div style={{ position: "fixed", inset: 0, background: "var(--bg-overlay)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 10000, backdropFilter: "blur(4px)" }}>
          <div className="glass-panel" style={{ padding: "32px 40px", textAlign: "center", color: "var(--text-primary)", fontWeight: 600 }}>
            Procesando Archivo Excel...
          </div>
        </div>
      )}
    </div>
  );
}
