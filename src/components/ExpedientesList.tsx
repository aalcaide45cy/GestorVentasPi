"use client";

import { Fragment, useEffect, useMemo, useState, type ChangeEvent, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import BotonesBackup from "@/components/BotonesBackup";
import { BotonesDatosSeccion } from "@/components/datos/DatosSeccion";
import PanelColumnas, { normalizarOrden, type ConfigColumnas } from "@/components/expedientes/PanelColumnas";
import { ModalConfirmar } from "@/components/Modal";
import Modal from "@/components/Modal";
import { useToast } from "@/components/Toast";
import { construirCsv, descargarTexto, interpretarCsvExpedientes } from "@/lib/csv-expedientes";
import { formatDate } from "@/lib/date-utils";
import {
  CLAVE_FILTROS_GUARDADOS,
  CLAVE_FILTROS_PREDEFINIDOS,
  CLAVE_RECORDAR_FILTROS,
  aplicarPredefinidos,
  leerFiltrosGuardados,
  leerPredefinidos,
  type FiltrosActuales,
} from "@/lib/filtros-expedientes";
import { CLAVE_ETIQUETA_COPIA, CLAVE_PERMITIR_DUPLICADOS, guardarPreferencia, permitirDuplicadosAhora, usePreferencia } from "@/lib/preferencias";
import type { ExpedienteDto, TiendaDto, VendedorDto } from "@/lib/dto";
import { leerExcelExpedientes, type FilaExcel } from "@/lib/excel-expedientes";
import type { ResultadoVerificacion } from "@/lib/servicios/importaciones";
import { EtiquetaClase, EtiquetaMarca, PuntoMarca } from "./etiquetas";
import { BadgeEstado, BadgeTipoVenta, CeldaCliente, CeldaFecha, FONDO_FECHA_A, FONDO_FECHA_B, TextoCopiable, mensajeDeError, type CampoFecha } from "./expedientes/comun";
import BarraPaginacion from "./expedientes/BarraPaginacion";
import ModalAsignarCliente from "./expedientes/ModalAsignarCliente";
import ModalCompletarDatos from "./expedientes/ModalCompletarDatos";
import ModalContrasteListado from "./expedientes/ModalContrasteListado";
import { leerListadoVentas, type ResultadoContraste } from "@/lib/contraste-listado";
import ModalConflictoExcel, { type ConflictoExcel } from "./expedientes/ModalConflictoExcel";
import ModalEdicionMasiva, { type CambiosMasivos } from "./expedientes/ModalEdicionMasiva";
import ResumenMensual, { MESES } from "./expedientes/ResumenMensual";
import { useEdicionFechas } from "./expedientes/useEdicionFechas";

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
}

interface ActualizacionExcel {
  rowIdx: number;
  id_cliente: number;
  id_expediente: number;
  nif: string;
  bastidor: string;
  matricula: string;
  f_afect: string | null;
  f_mat: string | null;
  email: string;
  f_exp: string | null;
  telefono: string;
  f_entrega: string | null;
}

type Columna =
  | "cliente"
  | "telefono"
  | "email"
  | "clase"
  | "punto"
  | "marca"
  | "modelo"
  | "marca_modelo"
  | "tipo_venta"
  | "estado"
  | "vendedor"
  | "fecha_expediente"
  | "fecha_afectacion"
  | "fecha_rci"
  | "fecha_matriculacion"
  | "fecha_facturacion"
  | "fecha_entrega"
  | "cobro";

const COLUMNAS: { clave: Columna; etiqueta: string }[] = [
  { clave: "cliente", etiqueta: "Cliente" },
  { clave: "telefono", etiqueta: "Teléfono" },
  { clave: "email", etiqueta: "Email" },
  { clave: "clase", etiqueta: "VN / VO" },
  { clave: "punto", etiqueta: "Punto de color de la marca" },
  { clave: "marca", etiqueta: "Marca" },
  { clave: "modelo", etiqueta: "Modelo" },
  { clave: "marca_modelo", etiqueta: "Marca y modelo" },
  { clave: "tipo_venta", etiqueta: "T. Venta" },
  { clave: "estado", etiqueta: "Estado" },
  { clave: "vendedor", etiqueta: "Vendedor" },
  { clave: "fecha_expediente", etiqueta: "F. Exp." },
  { clave: "fecha_afectacion", etiqueta: "F. Afect" },
  { clave: "fecha_rci", etiqueta: "F. RCI" },
  { clave: "fecha_matriculacion", etiqueta: "F. Mat" },
  { clave: "fecha_facturacion", etiqueta: "F. FAC." },
  { clave: "fecha_entrega", etiqueta: "F. Entrega" },
  { clave: "cobro", etiqueta: "Comisionado" },
];

type Visibles = Record<Columna, boolean>;
const TODAS: Visibles = Object.fromEntries(COLUMNAS.map((c) => [c.clave, true])) as Visibles;
/** Por defecto «Marca» y «Modelo» van por separado; la columna unificada «Marca y modelo» se activa desde «Columnas». */
const POR_DEFECTO: Visibles = { ...TODAS, marca_modelo: false };
const ORDEN_POR_DEFECTO: Columna[] = COLUMNAS.map((c) => c.clave);
const solo = (claves: Columna[]): Visibles => Object.fromEntries(COLUMNAS.map((c) => [c.clave, claves.includes(c.clave)])) as Visibles;
const VISTAS_INCLUIDAS: { id: string; nombre: string; ayuda: string; config: ConfigColumnas }[] = [
  { id: "compacta", nombre: "Compacta", ayuda: "Cliente, marca y modelo juntos, tipo de venta, estado, vendedor y fecha de expediente.", config: { orden: ORDEN_POR_DEFECTO, visibles: solo(["cliente", "clase", "marca_modelo", "tipo_venta", "estado", "vendedor", "fecha_expediente"]) } },
  { id: "fechas", nombre: "Seguimiento de fechas", ayuda: "Cliente, vehículo, vendedor y todas las fechas (expediente, afectación, RCI, matriculación, facturación, entrega).", config: { orden: ORDEN_POR_DEFECTO, visibles: solo(["cliente", "marca_modelo", "vendedor", "fecha_expediente", "fecha_afectacion", "fecha_rci", "fecha_matriculacion", "fecha_facturacion", "fecha_entrega"]) } },
  { id: "contacto", nombre: "Contacto", ayuda: "Cliente, teléfono, email, vehículo y vendedor para llamar o escribir.", config: { orden: ["cliente", "telefono", "email", "marca_modelo", "vendedor", ...ORDEN_POR_DEFECTO.filter((c) => !["cliente", "telefono", "email", "marca_modelo", "vendedor"].includes(c))], visibles: solo(["cliente", "telefono", "email", "marca_modelo", "vendedor"]) } },
  { id: "todas", nombre: "Todas las columnas", ayuda: "Todas las columnas, con marca y modelo por separado.", config: { orden: ORDEN_POR_DEFECTO, visibles: { ...TODAS, marca_modelo: false } } },
];

/** Ancho fijo de cada columna (px): la tabla no cambia de tamaño al ocultar entregados, filtrar u ordenar. */
const ANCHO_COLUMNA: Record<Columna, number> = {
  cliente: 200,
  telefono: 112,
  email: 210,
  marca: 90,
  modelo: 150,
  marca_modelo: 170,
  clase: 70,
  punto: 34,
  tipo_venta: 100,
  estado: 100,
  vendedor: 130,
  fecha_expediente: 100,
  fecha_afectacion: 150,
  fecha_rci: 150,
  fecha_matriculacion: 150,
  fecha_facturacion: 150,
  fecha_entrega: 150,
  cobro: 150,
};
/** «Dacia Sandero»: marca y modelo en una sola cadena, sin repetir la marca si el modelo ya la incluye («Renault 5» de la marca Renault). */
function marcaYModelo(e: ExpedienteDto): string {
  const marca = e.modelo?.marca?.nombre?.trim() ?? "";
  const modelo = e.modelo?.nombre_modelo?.trim() ?? "";
  if (!marca) return modelo;
  if (!modelo) return marca;
  const sinAcentos = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  return sinAcentos(modelo).startsWith(sinAcentos(marca)) ? modelo : `${marca} ${modelo}`;
}

const ENCABEZADOS: Record<Columna, { etiqueta: string; fondo?: string }> = {
  cliente: { etiqueta: "Cliente" },
  telefono: { etiqueta: "Teléfono" },
  email: { etiqueta: "Email" },
  clase: { etiqueta: "VN / VO" },
  punto: { etiqueta: "●" },
  marca: { etiqueta: "Marca" },
  modelo: { etiqueta: "Modelo" },
  marca_modelo: { etiqueta: "Marca y modelo" },
  tipo_venta: { etiqueta: "T. Venta" },
  estado: { etiqueta: "Estado" },
  vendedor: { etiqueta: "Vendedor" },
  fecha_expediente: { etiqueta: "F. Exp.", fondo: FONDO_FECHA_A },
  fecha_afectacion: { etiqueta: "F. Afect", fondo: FONDO_FECHA_B },
  fecha_rci: { etiqueta: "F. RCI", fondo: FONDO_FECHA_A },
  fecha_matriculacion: { etiqueta: "F. Mat", fondo: FONDO_FECHA_B },
  fecha_facturacion: { etiqueta: "F. FAC.", fondo: FONDO_FECHA_A },
  fecha_entrega: { etiqueta: "F. Entrega", fondo: FONDO_FECHA_B },
  cobro: { etiqueta: "Comisionado", fondo: "rgba(128, 128, 128, 0.06)" },
};

const ANCHO_SELECCION = 40;
const ANCHO_ACCIONES = 130;

const FECHAS_FILTRO: { valor: string; etiqueta: string }[] = [
  { valor: "fecha_expediente", etiqueta: "Fecha Expediente" },
  { valor: "fecha_afectacion", etiqueta: "Fecha Afectación" },
  { valor: "fecha_matriculacion", etiqueta: "Fecha Matriculación" },
  { valor: "fecha_entrega", etiqueta: "Fecha Entrega" },
  { valor: "fecha_rci", etiqueta: "Fecha RCI" },
  { valor: "fecha_comisionado", etiqueta: "Fecha Comisionado" },
];

const etiquetaFiltro: CSSProperties = { fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.5px" };
const botonHerramienta = (activo: boolean, fondoActivo: string, colorActivo: string): CSSProperties => ({
  padding: "5px 10px",
  fontSize: "0.8rem",
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  gap: "6px",
  backgroundColor: activo ? fondoActivo : "rgba(255,255,255,0.05)",
  color: activo ? colorActivo : "var(--text-primary)",
  border: "1px solid var(--border-light)",
  borderRadius: "var(--radius-sm)",
  fontWeight: 600,
});
const botonMes: CSSProperties = { padding: "3px 8px", fontSize: "0.75rem", fontWeight: 600 };
const cajaMes: CSSProperties = {
  padding: "4px 10px",
  border: "1px solid rgba(255, 255, 255, 0.08)",
  borderRadius: "8px",
  background: "rgba(255, 255, 255, 0.02)",
  display: "flex",
  alignItems: "center",
  gap: "8px",
  width: "fit-content",
};
const textoCaja: CSSProperties = { fontSize: "0.75rem", fontWeight: 700, color: "var(--primary-light, #60a5fa)", textTransform: "uppercase", letterSpacing: "0.5px" };


const hoyIsoLocal = () => new Date().toISOString().split("T")[0];

function leerArchivo<T extends string | ArrayBuffer>(archivo: File, como: "texto" | "binario"): Promise<T> {
  return new Promise((resolver, rechazar) => {
    const lector = new FileReader();
    lector.onload = () => resolver(lector.result as T);
    lector.onerror = () => rechazar(new Error("Error de lectura del archivo."));
    if (como === "texto") lector.readAsText(archivo);
    else lector.readAsArrayBuffer(archivo);
  });
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
}: Props) {
  const router = useRouter();
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
  const [cobrosGuardado, fijarCobros] = usePreferencia("exp-show-cobro-status");
  const mostrarCobros = cobrosGuardado === "true";
  const [columnasGuardadas, fijarColumnas] = usePreferencia("exp-visible-columns");
  const visibles = useMemo<Visibles>(() => {
    try {
      return columnasGuardadas ? { ...POR_DEFECTO, ...(JSON.parse(columnasGuardadas) as Partial<Visibles>) } : POR_DEFECTO;
    } catch {
      return POR_DEFECTO; // preferencia corrupta: se vuelve a lo habitual
    }
  }, [columnasGuardadas]);
  const [ordenGuardado, fijarOrden] = usePreferencia("exp-column-order");
  const orden = useMemo<Columna[]>(() => {
    try {
      return normalizarOrden(ordenGuardado ? (JSON.parse(ordenGuardado) as string[]) : null, ORDEN_POR_DEFECTO) as Columna[];
    } catch {
      return ORDEN_POR_DEFECTO;
    }
  }, [ordenGuardado]);
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
  const [seleccionActiva, setSeleccionActiva] = useState(false);
  const [borradoActivo, setBorradoActivo] = useState(false);
  const [seleccionados, setSeleccionados] = useState<number[]>([]);
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
  const [fVendedor, setFVendedor] = useState(currentUserName ?? "");
  const [fMes, setFMes] = useState("");
  const [fAnio, setFAnio] = useState("");
  const [fTipoFecha, setFTipoFecha] = useState("fecha_expediente");
  const [fTienda, setFTienda] = useState("");

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
    const f: FiltrosActuales =
      (leerLocal(CLAVE_RECORDAR_FILTROS) !== "false" ? leerFiltrosGuardados(leerLocal(CLAVE_FILTROS_GUARDADOS)) : null) ??
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
    setFiltrosListos(true);
    /* eslint-enable react-hooks/set-state-in-effect */
    // Solo al montar: después mandan los controles de la pantalla.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [recordarFiltros] = usePreferencia(CLAVE_RECORDAR_FILTROS);
  useEffect(() => {
    if (!filtrosListos) return;
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
    };
    guardarPreferencia(CLAVE_FILTROS_GUARDADOS, JSON.stringify(actuales));
  }, [filtrosListos, recordarFiltros, busqueda, ocultarEntregados, fMarca, fModelo, fTipo, fEstado, fVendedor, fMes, fAnio, fTipoFecha, fTienda]);

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
  const filtrados = useMemo(() => {
    const gs = busqueda.toLowerCase();
    return expedientes.filter((e) => {
      if (ocultarEntregados && e.fecha_entrega) return false;
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
      if (fVendedor && (e.usuario?.nombre?.toLowerCase().trim() ?? "") !== fVendedor.toLowerCase().trim()) return false;
      if (fMes || fAnio) {
        const objetivo =
          fTipoFecha === "fecha_comisionado"
            ? e.cobrado_otra_fecha && e.fecha_cobrado
              ? e.fecha_cobrado
              : e.fecha_matriculacion
            : ((e as unknown as Record<string, string | null>)[fTipoFecha] ?? null);
        if (!objetivo) return false;
        const [a, m] = objetivo.split("-");
        if (!m) return false;
        if (fAnio && a !== fAnio) return false;
        if (fMes && m !== fMes) return false;
      }
      if (fTienda && e.id_tienda !== Number(fTienda)) return false;
      return true;
    });
  }, [expedientes, busqueda, ocultarEntregados, fMarca, fModelo, fTipo, fEstado, fVendedor, fMes, fAnio, fTipoFecha, fTienda]);

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
          return `${e.modelo?.marca?.punto_color ?? e.modelo?.marca?.color ?? "~"}|${e.modelo?.marca?.nombre ?? ""}`;
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

  const limpiarFiltros = () => {
    setBusqueda("");
    setOcultarEntregados(false);
    setFMarca("");
    setFModelo("");
    setFTipo("");
    setFEstado("");
    setFVendedor(currentUserName ?? ""); // al limpiar se vuelve a ver solo lo del usuario que ha iniciado sesión
    setFMes("");
    setFAnio("");
    setFTipoFecha("fecha_expediente");
    setFTienda("");
    setPagina(1);
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
    setPagina(1);
  };

  /* ---------------- Selección ---------------- */
  const seleccionarTodos = (marcado: boolean) => setSeleccionados(marcado ? filtrados.map((e) => e.id_expediente) : []);
  const seleccionarUno = (id: number, marcado: boolean) =>
    setSeleccionados((prev) => (marcado ? (prev.includes(id) ? prev : [...prev, id]) : prev.filter((x) => x !== id)));

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
      const res = await fetch("/api/expedientes/importar-excel/procesar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates: lista, filename: archivo, permitir_duplicados: permitirDuplicadosAhora() }),
      });
      if (!res.ok) throw new Error(await mensajeDeError(res, "Error al procesar los datos de Excel."));
      const r = (await res.json()) as { message?: string };
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
      mostrar(ids.length === 1 ? "Expediente eliminado con éxito." : `${ids.length} expedientes eliminados con éxito.`);
      setABorrar(null);
      setConfirmarBorradoMasivo(false);
      router.refresh();
    } catch (e) {
      mostrar(e instanceof Error ? e.message : "Ocurrió un error inesperado al eliminar el expediente.", "error");
    } finally {
      setBorrando(false);
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
      mostrar(`${seleccionados.length} expedientes modificados correctamente.`);
      setEdicionMasiva(false);
      setSeleccionados([]);
      router.refresh();
      setTimeout(() => window.location.reload(), 1000);
    } catch (e) {
      mostrar(e instanceof Error ? e.message : "Error de conexión al actualizar.", "error");
    } finally {
      setCargando(false);
    }
  };

  /* ---------------- Render ---------------- */
  const columnasActivas = orden.map((clave) => COLUMNAS.find((c) => c.clave === clave)!).filter((c) => (c.clave === "cobro" ? mostrarCobros : true) && visibles[c.clave] !== false);
  const totalColSpan = columnasActivas.length + (seleccionActiva ? 1 : 0) + 1;
  const mostrarCol = (c: Columna) => visibles[c] !== false && (c !== "cobro" || mostrarCobros);

  const hoyF = new Date();
  const filtrosActivos: string[] = [];
  if (busqueda.trim()) filtrosActivos.push(`Búsqueda: «${busqueda.trim()}»`);
  if (fMes || fAnio) {
    const esActual = (!fMes || fMes === String(hoyF.getMonth() + 1).padStart(2, "0")) && (!fAnio || fAnio === String(hoyF.getFullYear()));
    filtrosActivos.push(`${FECHAS_FILTRO.find((f) => f.valor === fTipoFecha)?.etiqueta ?? "Fecha"}: ${[fMes ? MESES[Number(fMes) - 1] : "todos los meses", fAnio || "todos los años"].join(" ")}${esActual ? "" : " (no es el mes actual)"}`);
  }
  if (fMarca) filtrosActivos.push(`Marca: ${fMarca === "VO_NO_BRAND" ? "sin marca" : fMarca}`);
  if (fModelo) filtrosActivos.push(`Modelo: ${fModelo}`);
  if (fTienda) filtrosActivos.push(`Tienda: ${tiendas.find((t) => String(t.id_tienda) === fTienda)?.nombre ?? fTienda}`);
  if (fVendedor && fVendedor !== (currentUserName ?? "")) filtrosActivos.push(`Comercial: ${fVendedor}`);
  if (!fVendedor) filtrosActivos.push("Todos los comerciales");
  if (fTipo) filtrosActivos.push(`Tipo de venta: ${fTipo}`);
  if (fEstado) filtrosActivos.push(`Estado: ${fEstado}`);
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
      setTimeout(() => window.location.reload(), 1500);
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

  const celdaFecha = (exp: ExpedienteDto, campo: CampoFecha, nombre: string, fondo: string) => (
    <CeldaFecha exp={exp} campo={campo} nombre={nombre} fondo={fondo} formatear={formatDate} detalleMatricula alEditar={abrirEditar} alBorrar={abrirBorrar} />
  );

  const cabecera = (clave: Columna, etiqueta: string, fondo?: string) =>
    mostrarCol(clave) && (
      <th
        key={clave}
        onClick={clave === "cobro" ? undefined : () => ordenar(clave)}
        style={{
          cursor: clave === "cobro" ? "default" : "pointer",
          userSelect: "none",
          whiteSpace: "nowrap",
          ...(fondo ? { textAlign: "center", backgroundColor: fondo } : {}),
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
      {/* BARRA DE HERRAMIENTAS */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "10px",
          background: "rgba(255, 255, 255, 0.03)",
          padding: "8px 12px",
          borderRadius: "8px",
          border: "1px solid var(--border-light)",
        }}
      >
        <div style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
          <label style={{ ...botonHerramienta(false, "", ""), gap: "8px" }}>
            <input
              type="checkbox"
              checked={ocultarEntregados}
              onChange={(e) => {
                setOcultarEntregados(e.target.checked);
                setPagina(1);
              }}
              style={{ width: "15px", height: "15px", accentColor: "var(--primary)", cursor: "pointer" }}
            />
            <span>Ocultar Entregados</span>
          </label>

          <label
            style={{
              ...botonHerramienta(false, "", ""),
              gap: "8px",
              background: mostrarCobros ? "rgba(var(--primary-rgb), 0.12)" : "rgba(255, 255, 255, 0.05)",
              border: `1px solid ${mostrarCobros ? "var(--primary)" : "var(--border-light)"}`,
            }}
          >
            <input
              type="checkbox"
              checked={mostrarCobros}
              onChange={(e) => {
                fijarCobros(String(e.target.checked));
              }}
              style={{ width: "15px", height: "15px", accentColor: "var(--primary)", cursor: "pointer" }}
            />
            <span>👁️ Mostrar Comisionados</span>
          </label>

          <button
            type="button"
            className="btn"
            onClick={() => {
              if (seleccionActiva) setSeleccionados([]);
              setSeleccionActiva(!seleccionActiva);
            }}
            style={botonHerramienta(seleccionActiva, "var(--warning)", "black")}
            title={seleccionActiva ? "Bloquear Selección Masiva" : "Desbloquear Selección Masiva"}
          >
            {seleccionActiva ? "🔓 Selección Activa" : "🔒 Selección Inactiva"}
          </button>

          <button
            type="button"
            className="btn"
            onClick={() => setBorradoActivo(!borradoActivo)}
            style={botonHerramienta(borradoActivo, "var(--danger)", "white")}
            title={borradoActivo ? "Bloquear Eliminación" : "Desbloquear Eliminación"}
          >
            {borradoActivo ? "🔓 Eliminación Activa" : "🔒 Eliminación Inactiva"}
          </button>

          <button
            type="button"
            className="btn"
            onClick={alternarPaneles}
            style={botonHerramienta(false, "", "")}
            title={hayPanelAbierto ? "Pliega de golpe los filtros, el resumen estadístico, las comisiones y la cartera" : "Despliega de golpe los filtros, el resumen estadístico, las comisiones y la cartera"}
          >
            {hayPanelAbierto ? "⇕ Plegar paneles" : "⇕ Desplegar paneles"}
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => setSelectorColumnas(true)}
            style={botonHerramienta(selectorColumnas, "var(--primary)", "white")}
            title="Ordena las columnas de la tabla (arrastrando), muéstralas u ocúltalas, vuelve a lo predeterminado o guarda tus propias vistas"
          >
            ⚙️ Columnas y vistas
          </button>
          {selectorColumnas && (
            <PanelColumnas
              columnas={COLUMNAS}
              actual={{ orden, visibles }}
              predeterminada={{ orden: ORDEN_POR_DEFECTO, visibles: POR_DEFECTO }}
              vistasIncluidas={VISTAS_INCLUIDAS}
              alCambiar={cambiarConfigColumnas}
              alCerrar={() => setSelectorColumnas(false)}
            />
          )}

          {seleccionActiva && seleccionados.length > 0 && (
            <>
              <span style={{ fontSize: "0.9rem", fontWeight: 600, color: "var(--primary)" }}>({seleccionados.length} seleccionados):</span>
              <button
                type="button"
                className="btn"
                onClick={() => borradoActivo && setConfirmarBorradoMasivo(true)}
                disabled={!borradoActivo}
                style={{
                  padding: "6px 12px",
                  fontSize: "0.8rem",
                  backgroundColor: borradoActivo ? "var(--danger)" : "rgba(255,255,255,0.02)",
                  color: borradoActivo ? "white" : "var(--text-muted)",
                  border: borradoActivo ? "none" : "1px solid var(--border-light)",
                  cursor: borradoActivo ? "pointer" : "not-allowed",
                  borderRadius: "var(--radius-sm)",
                  fontWeight: 600,
                  opacity: borradoActivo ? 1 : 0.5,
                }}
              >
                🗑️ Eliminar Seleccionados
              </button>
              {permitirDup && (
                <button type="button" className="btn btn-secondary" onClick={() => { setCopias("1"); setDuplicando(seleccionados); }} style={{ padding: "6px 12px", fontSize: "0.8rem" }} title="Crea copias de los expedientes seleccionados (para pruebas)">
                  📑 Duplicar Seleccionados
                </button>
              )}
              <button type="button" className="btn btn-secondary" onClick={() => exportarCsv(true)} style={{ padding: "6px 12px", fontSize: "0.8rem" }}>
                📤 Exportar SOLO expedientes seleccionados (CSV)
              </button>
              <button
                type="button"
                onClick={() => setEdicionMasiva(true)}
                style={{ padding: "6px 12px", fontSize: "0.8rem", backgroundColor: "#2e7d32", color: "white", border: "none", borderRadius: "var(--radius-sm)", fontWeight: 600, cursor: "pointer" }}
              >
                ✏️ Editar
              </button>
            </>
          )}
        </div>

        <button
          type="button"
          className="btn btn-primary"
          onClick={() => setMenuDatos(true)}
          style={{ padding: "6px 14px", fontSize: "0.85rem" }}
          title="Importar expedientes (Excel o CSV), contrastar un listado, exportar (CSV o JSON), copias internas y copia de seguridad: todo en una sola ventana, con la explicación de cada opción"
        >
          🗂️ Importar y exportar
        </button>
      </div>

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
                texto="Sube los Excel o CSV del fabricante (Expedientes, Llamadas de calidad…): la app reconoce las columnas, encuentra tus expedientes por bastidor, matrícula o NIF y propone rellenar o corregir. Ves todo antes de aplicar."
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
                <div style={{ border: "1px solid var(--border-light)", borderRadius: "var(--radius-sm)", padding: "12px 14px", display: "flex", flexDirection: "column", gap: "8px" }}>
                  <div style={{ fontWeight: 600 }}>📁 Expedientes en archivo JSON y copias internas</div>
                  <div style={{ fontSize: "0.82rem", color: "var(--text-secondary)" }}>Exporta o importa solo los expedientes (con vista previa y copia de seguridad automática) y guarda copias internas de esta sección dentro de la aplicación para restaurarlas cuando quieras.</div>
                  <BotonesDatosSeccion seccion="expedientes" />
                </div>
                <div style={{ border: "1px solid var(--border-light)", borderRadius: "var(--radius-sm)", padding: "12px 14px", display: "flex", flexDirection: "column", gap: "8px" }}>
                  <div style={{ fontWeight: 600 }}>💾 Datos básicos de la aplicación (JSON)</div>
                  <div style={{ fontSize: "0.82rem", color: "var(--text-secondary)" }}>Incluye tiendas, usuarios, clientes, expedientes y catálogos, pero NO planes, liquidaciones, puntos ni documentos; trae contraseñas cifradas y secretos del doble factor, así que guárdalo en un sitio seguro. La copia de TODO es la .dump de Configuración › BBDD.</div>
                  <BotonesBackup deshabilitado={cargando} />
                </div>
              </GrupoDatos>
            )}
          </div>
        </Modal>
      )}
      {/* FILTRADO AVANZADO */}
      <div className="glass-panel" style={{ padding: "10px 14px", display: "flex", flexDirection: "column", gap: "8px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px" }}>
          <h4 onClick={() => fijarFiltrosAbiertos(filtrosAbiertos ? "false" : "true")} title={filtrosAbiertos ? "Plegar filtros" : "Desplegar filtros"} style={{ cursor: "pointer", userSelect: "none", margin: 0, fontSize: "0.95rem", fontWeight: 600, color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "8px" }}>
            <span>{filtrosAbiertos ? "▾" : "▸"} 🔍 Filtrado y Búsqueda Avanzada</span>
          </h4>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
          <span style={{ fontSize: "0.72rem", color: "var(--text-muted)" }} title="Atajos para filtrar por mes sin abrir los desplegables">
            Atajos de mes:
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
          <button type="button" className="btn btn-secondary" onClick={limpiarFiltros} title="Quita todos los filtros y deja solo los expedientes del comercial que ha iniciado sesión" style={{ padding: "4px 10px", fontSize: "0.75rem", color: "var(--danger)", borderColor: "rgba(239, 68, 68, 0.2)" }}>
            🧹 Limpiar Filtros
          </button>
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
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(105px, 1fr))", gap: "8px" }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label" style={etiquetaFiltro}>Campo de Fecha</label>
            <select
              className="form-input"
              value={fTipoFecha}
              onChange={(e) => {
                setFTipoFecha(e.target.value);
                setPagina(1);
              }}
              style={{ padding: "4px 6px", fontSize: "0.8rem" }}
            >
              {FECHAS_FILTRO.map((f) => (
                <option key={f.valor} value={f.valor}>
                  {f.etiqueta}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label" style={etiquetaFiltro}>Mes</label>
            <select
              className="form-input"
              value={fMes}
              onChange={(e) => {
                setFMes(e.target.value);
                setPagina(1);
              }}
              style={{ padding: "4px 6px", fontSize: "0.8rem" }}
            >
              <option value="">Todos los meses</option>
              {MESES.map((nombre, i) => (
                <option key={nombre} value={String(i + 1).padStart(2, "0")}>
                  {nombre}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label" style={etiquetaFiltro}>Año</label>
            <select
              className="form-input"
              value={fAnio}
              onChange={(e) => {
                setFAnio(e.target.value);
                setPagina(1);
              }}
              style={{ padding: "4px 6px", fontSize: "0.8rem" }}
            >
              <option value="">Todos los años</option>
              {opciones.anios.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label" style={etiquetaFiltro}>Marca</label>
            <select
              className="form-input"
              value={fMarca}
              onChange={(e) => {
                setFMarca(e.target.value);
                setFModelo("");
                setPagina(1);
              }}
              style={{ padding: "4px 6px", fontSize: "0.8rem" }}
            >
              <option value="">Todas las marcas</option>
              <option value="VO_NO_BRAND">Sin Marca (VO)</option>
              {opciones.marcas.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label" style={etiquetaFiltro}>Modelo</label>
            <select
              className="form-input"
              value={fModelo}
              onChange={(e) => {
                setFModelo(e.target.value);
                setPagina(1);
              }}
              style={{ padding: "4px 6px", fontSize: "0.8rem" }}
              disabled={fMarca === "VO_NO_BRAND"}
            >
              <option value="">Todos los modelos</option>
              {opciones.modelos.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label" style={etiquetaFiltro}>Tienda</label>
            <select
              className="form-input"
              value={fTienda}
              onChange={(e) => {
                setFTienda(e.target.value);
                setPagina(1);
              }}
              style={{ padding: "4px 6px", fontSize: "0.8rem" }}
            >
              <option value="">Todas las tiendas</option>
              {tiendas.map((t) => (
                <option key={t.id_tienda} value={t.id_tienda}>
                  {t.nombre}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label" style={etiquetaFiltro}>Comercial</label>
            <select
              className="form-input"
              value={fVendedor}
              onChange={(e) => {
                setFVendedor(e.target.value);
                setPagina(1);
              }}
              style={{ padding: "4px 6px", fontSize: "0.8rem" }}
            >
              <option value="">Todos los comerciales</option>
              {opciones.vendedores.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label" style={etiquetaFiltro}>Tipo Venta</label>
            <select
              className="form-input"
              value={fTipo}
              onChange={(e) => {
                setFTipo(e.target.value);
                setPagina(1);
              }}
              style={{ padding: "4px 6px", fontSize: "0.8rem" }}
            >
              <option value="">Todos los tipos</option>
              {opciones.tipos.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label" style={etiquetaFiltro}>Estado Vehículo</label>
            <select
              className="form-input"
              value={fEstado}
              onChange={(e) => {
                setFEstado(e.target.value);
                setPagina(1);
              }}
              style={{ padding: "4px 6px", fontSize: "0.8rem" }}
            >
              <option value="">Todos los estados</option>
              {opciones.estados.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
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

        <div className="table-container tabla-scroll" style={{ ["--alto-tabla" as string]: "min(68vh, 760px)" }}>
          <table className="table-premium table-compact tabla-fija" style={{ width: (seleccionActiva ? ANCHO_SELECCION : 0) + columnasActivas.reduce((t, c) => t + ANCHO_COLUMNA[c.clave], 0) + ANCHO_ACCIONES, minWidth: "100%" }}>
            <colgroup>
              {seleccionActiva && <col style={{ width: ANCHO_SELECCION }} />}
              {columnasActivas.map((c) => (
                <col key={c.clave} style={{ width: ANCHO_COLUMNA[c.clave] }} />
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
            <tbody>
              {visiblesPagina.map((exp) => {
                const marcada = seleccionados.includes(exp.id_expediente);
                return (
                  <tr
                    key={exp.id_expediente}
                    onClick={(ev) => {
                      if (!seleccionActiva) return;
                      if ((ev.target as HTMLElement).closest("button, a, input, select, textarea, [role='button']")) return;
                      seleccionarUno(exp.id_expediente, !marcada);
                    }}
                    style={{ background: marcada ? "rgba(var(--primary-rgb), 0.04)" : undefined, cursor: seleccionActiva ? "pointer" : "default" }}
                  >
                    {seleccionActiva && (
                      <td style={{ textAlign: "center" }}>
                        <input
                          type="checkbox"
                          checked={marcada}
                          onChange={(e) => seleccionarUno(exp.id_expediente, e.target.checked)}
                          style={{ width: "16px", height: "16px", cursor: "pointer" }}
                        />
                      </td>
                    )}
                    {(() => {
                      const celdas: Record<Columna, ReactNode> = {
                      cliente: mostrarCol("cliente") && (
                          <td style={{ fontWeight: 600, color: "var(--text-primary)", whiteSpace: "nowrap" }}>
                            <CeldaCliente exp={exp} alAsignar={setAsignandoId} />
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
                            <PuntoMarca punto={exp.modelo?.marca?.punto} color={exp.modelo?.marca?.punto_color} />
                          </td>
                      ),
                      clase: mostrarCol("clase") && (
                          <td style={{ textAlign: "center" }}>
                            <EtiquetaClase clase={exp.estadoVehiculo?.clase} />
                          </td>
                      ),
                      marca: mostrarCol("marca") && (
                          <td>{exp.modelo?.marca?.nombre ? <TextoCopiable texto={exp.modelo.marca.nombre}><EtiquetaMarca texto={exp.modelo.marca.nombre} color={exp.modelo.marca.color} /></TextoCopiable> : <span style={{ fontStyle: "italic", color: "var(--text-muted)" }}>VO (Sin marca)</span>}</td>
                      ),
                      modelo: mostrarCol("modelo") && (
                          <td>
                            {exp.modelo ? (
                              <TextoCopiable texto={exp.modelo.nombre_modelo} estilo={{ fontWeight: 500, color: "var(--text-primary)" }}>
                                <EtiquetaMarca texto={exp.modelo.nombre_modelo} color={exp.modelo.marca?.color} />
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
                                <EtiquetaMarca texto={marcaYModelo(exp)} color={exp.modelo?.marca?.color} />
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
                    {expedientes.length === 0 ? "No hay expedientes registrados en el sistema." : "No se encontraron expedientes con los filtros aplicados."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

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

      <ResumenMensual expedientes={expedientes} anios={opciones.anios.map(Number)} vendedor={fVendedor} esAdministrador={esAdministrador} />

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
          mensaje="¿Estás seguro de que deseas eliminar permanentemente este expediente? Esta acción no se podrá deshacer."
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
              ¿Estás seguro de que deseas eliminar permanentemente los <strong>{seleccionados.length}</strong> expedientes seleccionados? Esta acción no se podrá deshacer.
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

function aActualizacion(fila: FilaExcel, idCliente: number, idExpediente: number): ActualizacionExcel {
  return {
    rowIdx: fila.rowIdx,
    id_cliente: idCliente,
    id_expediente: idExpediente,
    nif: fila.nif,
    bastidor: fila.bastidor,
    matricula: fila.matricula,
    f_afect: fila.f_afect,
    f_mat: fila.f_mat,
    email: fila.email,
    f_exp: fila.f_exp,
    telefono: fila.telefono,
    f_entrega: fila.f_entrega,
  };
}

/* ---------------- Piezas de la ventana «Importar y exportar» ---------------- */

function GrupoDatos({ titulo, ayuda, children }: { titulo: string; ayuda: string; children: ReactNode }) {
  return (
    <section style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      <div style={{ display: "flex", gap: "10px", alignItems: "baseline", flexWrap: "wrap", borderBottom: "1px solid var(--border-light)", paddingBottom: "4px" }}>
        <b>{titulo}</b>
        <span style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>{ayuda}</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "10px" }} className="rejilla-propia">
        {children}
      </div>
    </section>
  );
}

/** Una opción: botón (o selector de archivo) con su nombre y una frase que explica qué hace. */
function OpcionDatos({ icono, titulo, texto, ayuda, archivo, deshabilitado, alElegir, alPulsar }: { icono: string; titulo: string; texto: string; ayuda: string; archivo?: string; deshabilitado?: boolean; alElegir?: (e: ChangeEvent<HTMLInputElement>) => void; alPulsar?: () => void }) {
  const estilo: CSSProperties = { display: "flex", gap: "10px", alignItems: "flex-start", textAlign: "left", border: "1px solid var(--border-light)", borderRadius: "var(--radius-sm)", padding: "12px 14px", background: "rgba(255, 255, 255, 0.03)", color: "var(--text-primary)", cursor: deshabilitado ? "not-allowed" : "pointer", opacity: deshabilitado ? 0.5 : 1, width: "100%" };
  const contenido = (
    <>
      <span style={{ fontSize: "1.3rem" }}>{icono}</span>
      <span>
        <b style={{ display: "block" }}>{titulo}</b>
        <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)", lineHeight: 1.4 }}>{texto}</span>
      </span>
    </>
  );
  if (archivo) {
    return (
      <label style={estilo} title={ayuda}>
        {contenido}
        <input type="file" accept={archivo} onChange={alElegir} style={{ display: "none" }} disabled={deshabilitado} />
      </label>
    );
  }
  return (
    <button type="button" style={estilo} title={ayuda} disabled={deshabilitado} onClick={alPulsar}>
      {contenido}
    </button>
  );
}

