"use client";

import { useEffect, useMemo, useState, type ChangeEvent, type CSSProperties } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ModalConfirmar } from "@/components/Modal";
import { useToast } from "@/components/Toast";
import { construirCsv, descargarTexto, interpretarCsvExpedientes } from "@/lib/csv-expedientes";
import { formatDate } from "@/lib/date-utils";
import type { ExpedienteDto, TiendaDto, VendedorDto } from "@/lib/dto";
import { leerExcelExpedientes, type FilaExcel } from "@/lib/excel-expedientes";
import type { ResultadoVerificacion } from "@/lib/servicios/importaciones";
import { BadgeEstado, BadgeTipoVenta, CeldaCliente, CeldaFecha, FONDO_FECHA_A, FONDO_FECHA_B, mensajeDeError, type CampoFecha } from "./expedientes/comun";
import BarraPaginacion from "./expedientes/BarraPaginacion";
import ModalAsignarCliente from "./expedientes/ModalAsignarCliente";
import ModalConflictoExcel, { type ConflictoExcel } from "./expedientes/ModalConflictoExcel";
import ModalEdicionMasiva, { type CambiosMasivos } from "./expedientes/ModalEdicionMasiva";
import ResumenMensual, { MESES } from "./expedientes/ResumenMensual";
import { useEdicionFechas } from "./expedientes/useEdicionFechas";

interface Props {
  expedientesIniciales: ExpedienteDto[];
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
  | "marca"
  | "modelo"
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
  { clave: "marca", etiqueta: "Marca" },
  { clave: "modelo", etiqueta: "Modelo" },
  { clave: "tipo_venta", etiqueta: "T. Venta" },
  { clave: "estado", etiqueta: "Estado" },
  { clave: "vendedor", etiqueta: "Vendedor" },
  { clave: "fecha_expediente", etiqueta: "F. Exp." },
  { clave: "fecha_afectacion", etiqueta: "F. Afect" },
  { clave: "fecha_rci", etiqueta: "F. RCI" },
  { clave: "fecha_matriculacion", etiqueta: "F. Mat" },
  { clave: "fecha_facturacion", etiqueta: "F. FAC." },
  { clave: "fecha_entrega", etiqueta: "F. Entrega" },
  { clave: "cobro", etiqueta: "Cobro" },
];

type Visibles = Record<Columna, boolean>;
const TODAS: Visibles = Object.fromEntries(COLUMNAS.map((c) => [c.clave, true])) as Visibles;
const MINIMAS: Visibles = Object.fromEntries(COLUMNAS.map((c) => [c.clave, c.clave === "cliente" || c.clave === "vendedor"])) as Visibles;

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
  padding: "8px 14px",
  fontSize: "0.85rem",
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
const botonMes: CSSProperties = { padding: "6px 12px", fontSize: "0.85rem", fontWeight: 600 };
const cajaMes: CSSProperties = {
  padding: "10px 14px",
  border: "1px solid rgba(255, 255, 255, 0.08)",
  borderRadius: "8px",
  background: "rgba(255, 255, 255, 0.02)",
  display: "flex",
  alignItems: "center",
  gap: "12px",
  width: "fit-content",
};
const textoCaja: CSSProperties = { fontSize: "0.75rem", fontWeight: 700, color: "var(--primary-light, #60a5fa)", textTransform: "uppercase", letterSpacing: "0.5px" };

const leerLocal = (clave: string): string | null => {
  try {
    return localStorage.getItem(clave);
  } catch {
    return null;
  }
};
const guardarLocal = (clave: string, valor: string) => {
  try {
    localStorage.setItem(clave, valor);
  } catch {
    /* sin almacenamiento: la preferencia no se recuerda */
  }
};

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
  useEffect(() => setExpedientes(expedientesIniciales), [expedientesIniciales]);

  const [cargando, setCargando] = useState(false);
  const [borrando, setBorrando] = useState(false);
  const [aBorrar, setABorrar] = useState<ExpedienteDto | null>(null);
  const [confirmarBorradoMasivo, setConfirmarBorradoMasivo] = useState(false);
  const [asignandoId, setAsignandoId] = useState<number | null>(null);

  // Preferencias del navegador (se leen tras montar para no romper la hidratación)
  const [mostrarCobros, setMostrarCobros] = useState(false);
  const [visibles, setVisibles] = useState<Visibles>(TODAS);
  const [tamano, setTamano] = useState(20);
  useEffect(() => {
    setMostrarCobros(leerLocal("exp-show-cobro-status") === "true");
    try {
      const guardado = leerLocal("exp-visible-columns");
      if (guardado) setVisibles({ ...TODAS, ...(JSON.parse(guardado) as Partial<Visibles>) });
    } catch {
      /* preferencia corrupta: se usan todas */
    }
    const t = Number(leerLocal("exp-default-page-size"));
    if (t > 0) setTamano(t);
  }, []);

  const [selectorColumnas, setSelectorColumnas] = useState(false);
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
  const [importandoExcel, setImportandoExcel] = useState(false);
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
        case "marca":
          return e.modelo?.marca?.nombre ?? "";
        case "modelo":
          return e.modelo?.nombre_modelo ?? "";
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
    guardarLocal("visible_expediente_ids", JSON.stringify(ordenados.map((e) => e.id_expediente)));
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
    setFVendedor("");
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
        body: JSON.stringify({ items, filename: archivo.name }),
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
        body: JSON.stringify({ updates: lista, filename: archivo }),
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

  const avanzarConflicto = (nuevas: ActualizacionExcel[]) => {
    setActualizaciones(nuevas);
    if (indiceConflicto + 1 < conflictos.length) setIndiceConflicto(indiceConflicto + 1);
    else void ejecutarImportacionExcel(nuevas, nombreExcel);
  };

  const exportarBackup = async () => {
    setCargando(true);
    try {
      const res = await fetch("/api/admin/backup");
      if (!res.ok) throw new Error(await mensajeDeError(res, "Error al generar la copia de seguridad."));
      const copia = (await res.json()) as Record<string, unknown>;
      const conPreferencias = {
        ...copia,
        preferences: {
          expDefaultPageSize: Number(leerLocal("exp-default-page-size") || "20"),
          sidebarCollapsed: leerLocal("sidebar-collapsed") === "true",
        },
      };
      descargarTexto(`backup_completo_${hoyIsoLocal()}.json`, JSON.stringify(conPreferencias, null, 2), "application/json");
      mostrar("Copia de seguridad JSON exportada correctamente.");
    } catch (e) {
      mostrar(e instanceof Error ? e.message : "Error al exportar copia de seguridad.", "error");
    } finally {
      setCargando(false);
    }
  };

  const restaurarBackup = async (ev: ChangeEvent<HTMLInputElement>) => {
    const archivo = ev.target.files?.[0];
    const entrada = ev.target;
    if (!archivo) return;
    const ok = window.confirm(
      "¡ATENCIÓN! Estás a punto de restaurar una copia de seguridad COMPLETA de la base de datos.\n\n" +
        "Esto ELIMINARÁ permanentemente todos los datos existentes (tiendas, usuarios, clientes, comisiones, expedientes, etc.) e importará los registros del archivo.\n\n" +
        "¿Estás completamente seguro de que deseas proceder?",
    );
    if (!ok) {
      entrada.value = "";
      return;
    }
    setCargando(true);
    try {
      const texto = await leerArchivo<string>(archivo, "texto");
      if (!texto) throw new Error("Archivo vacío");
      const copia = JSON.parse(texto) as { preferences?: { expDefaultPageSize?: unknown; sidebarCollapsed?: unknown } };
      if (copia.preferences) {
        if (typeof copia.preferences.expDefaultPageSize === "number") guardarLocal("exp-default-page-size", String(copia.preferences.expDefaultPageSize));
        if (typeof copia.preferences.sidebarCollapsed === "boolean") guardarLocal("sidebar-collapsed", String(copia.preferences.sidebarCollapsed));
      }
      const res = await fetch("/api/admin/backup", { method: "POST", headers: { "Content-Type": "application/json" }, body: texto });
      if (!res.ok) throw new Error(await mensajeDeError(res, "Error al restaurar la copia de seguridad."));
      const r = (await res.json()) as { message?: string };
      mostrar(r.message ?? "Copia restaurada.");
      setTimeout(() => window.location.reload(), 1500);
    } catch (e) {
      mostrar(e instanceof Error ? e.message : "Error al procesar el archivo de copia de seguridad JSON.", "error");
    } finally {
      setCargando(false);
      entrada.value = "";
    }
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
  const columnasActivas = COLUMNAS.filter((c) => (c.clave === "cobro" ? mostrarCobros : true) && visibles[c.clave] !== false);
  const totalColSpan = columnasActivas.length + (seleccionActiva ? 1 : 0) + 1;
  const mostrarCol = (c: Columna) => visibles[c] !== false && (c !== "cobro" || mostrarCobros);

  const cambiarVisibles = (siguiente: Visibles) => {
    setVisibles(siguiente);
    guardarLocal("exp-visible-columns", JSON.stringify(siguiente));
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
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      {/* BUSCADOR GENERAL */}
      <div className="glass-panel" style={{ padding: "16px 20px", display: "flex", alignItems: "center", gap: "12px" }}>
        <span style={{ fontSize: "0.9rem", fontWeight: 600, color: "var(--text-secondary)" }}>🔎 Buscador Global:</span>
        <input
          type="text"
          className="form-input"
          placeholder="Busca por cliente, matrícula, DNI, vendedor, VIN..."
          value={busqueda}
          onChange={(e) => {
            setBusqueda(e.target.value);
            setPagina(1);
          }}
          style={{ flex: 1, padding: "8px 14px" }}
        />
        {busqueda && (
          <button type="button" className="btn btn-secondary" onClick={() => setBusqueda("")} style={{ padding: "8px 14px", fontSize: "0.85rem" }}>
            Limpiar
          </button>
        )}
      </div>

      {/* BARRA DE HERRAMIENTAS */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "10px",
          background: "rgba(255, 255, 255, 0.03)",
          padding: "12px 16px",
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
                setMostrarCobros(e.target.checked);
                guardarLocal("exp-show-cobro-status", String(e.target.checked));
              }}
              style={{ width: "15px", height: "15px", accentColor: "var(--primary)", cursor: "pointer" }}
            />
            <span>👁️ Mostrar Cobros</span>
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

          <div style={{ position: "relative", display: "inline-block" }}>
            <button
              type="button"
              className="btn"
              onClick={() => setSelectorColumnas(!selectorColumnas)}
              style={botonHerramienta(selectorColumnas, "var(--primary)", "white")}
              title="Ocultar o mostrar columnas de la tabla"
            >
              ⚙️ Columnas
            </button>
            {selectorColumnas && (
              <div
                style={{
                  position: "absolute",
                  top: "calc(100% + 6px)",
                  right: 0,
                  zIndex: 999,
                  minWidth: "220px",
                  background: "#1e1e2d",
                  border: "1px solid var(--border-light)",
                  borderRadius: "var(--radius-md)",
                  padding: "14px",
                  boxShadow: "0 10px 25px rgba(0, 0, 0, 0.5)",
                  backdropFilter: "blur(12px)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px", paddingBottom: "6px", borderBottom: "1px solid var(--border-light)" }}>
                  <span style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--text-primary)" }}>Visibilidad Columnas</span>
                  <button type="button" onClick={() => setSelectorColumnas(false)} style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: "0.9rem" }}>
                    ✕
                  </button>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "8px", maxHeight: "280px", overflowY: "auto" }}>
                  {COLUMNAS.filter((c) => c.clave !== "cobro" || mostrarCobros).map((c) => (
                    <label key={c.clave} style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.82rem", cursor: "pointer", color: "var(--text-primary)", userSelect: "none" }}>
                      <input
                        type="checkbox"
                        checked={visibles[c.clave] !== false}
                        onChange={(e) => cambiarVisibles({ ...visibles, [c.clave]: e.target.checked })}
                        style={{ width: "15px", height: "15px", accentColor: "var(--primary)", cursor: "pointer" }}
                      />
                      {c.etiqueta}
                    </label>
                  ))}
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: "10px", paddingTop: "8px", borderTop: "1px solid var(--border-light)" }}>
                  <button type="button" onClick={() => cambiarVisibles(TODAS)} style={{ background: "none", border: "none", color: "var(--primary)", fontSize: "0.75rem", cursor: "pointer", fontWeight: 600 }}>
                    Mostrar Todas
                  </button>
                  <button type="button" onClick={() => cambiarVisibles(MINIMAS)} style={{ background: "none", border: "none", color: "var(--text-muted)", fontSize: "0.75rem", cursor: "pointer" }}>
                    Mínimas
                  </button>
                </div>
              </div>
            )}
          </div>

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
              <button type="button" className="btn btn-secondary" onClick={() => exportarCsv(true)} style={{ padding: "6px 12px", fontSize: "0.8rem" }}>
                📤 Exportar Seleccionados (CSV)
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

        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          <label
            className="btn btn-secondary"
            style={{ padding: "8px 14px", fontSize: "0.85rem", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "6px", backgroundColor: "rgba(16, 185, 129, 0.08)", border: "1px solid rgba(16, 185, 129, 0.2)", color: "var(--success)" }}
          >
            🟢 Importar Datos Excel
            <input type="file" accept=".xlsx, .xls" onChange={importarExcel} style={{ display: "none" }} disabled={importandoExcel || cargando} />
          </label>

          {mostrarBotonesCsv && (
            <>
              <button type="button" className="btn btn-secondary" onClick={() => exportarCsv(false)} style={{ padding: "8px 14px", fontSize: "0.85rem" }}>
                📤 Exportar Todo (CSV)
              </button>
              <label className="btn btn-primary" style={{ padding: "8px 14px", fontSize: "0.85rem", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "6px" }}>
                📥 Importar CSV
                <input type="file" accept=".csv" onChange={importarCsv} style={{ display: "none" }} disabled={cargando} />
              </label>
            </>
          )}

          {esAdministrador && (
            <>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={exportarBackup}
                style={{ padding: "8px 14px", fontSize: "0.85rem", backgroundColor: "rgba(124, 58, 237, 0.08)", border: "1px solid rgba(124, 58, 237, 0.2)", color: "var(--primary)", fontWeight: 500 }}
                disabled={cargando}
              >
                💾 Exportar Backup (JSON)
              </button>
              <label
                className="btn"
                style={{ padding: "8px 14px", fontSize: "0.85rem", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "6px", backgroundColor: "rgba(16, 185, 129, 0.08)", border: "1px solid rgba(16, 185, 129, 0.2)", color: "var(--success)", fontWeight: 500 }}
              >
                🔄 Restaurar Backup (JSON)
                <input type="file" accept=".json" onChange={restaurarBackup} style={{ display: "none" }} disabled={cargando} />
              </label>
            </>
          )}
        </div>
      </div>

      {/* FILTRADO AVANZADO */}
      <div className="glass-panel" style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px" }}>
          <h4 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 600, color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "8px" }}>
            <span>🔍 Filtrado y Búsqueda Avanzada</span>
          </h4>
          <button type="button" className="btn btn-secondary" onClick={limpiarFiltros} style={{ padding: "6px 12px", fontSize: "0.8rem", color: "var(--danger)", borderColor: "rgba(239, 68, 68, 0.2)" }}>
            🧹 Limpiar Filtros
          </button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "16px" }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label" style={etiquetaFiltro}>Campo de Fecha</label>
            <select
              className="form-input"
              value={fTipoFecha}
              onChange={(e) => {
                setFTipoFecha(e.target.value);
                setPagina(1);
              }}
              style={{ padding: "8px" }}
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
              style={{ padding: "8px" }}
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
              style={{ padding: "8px" }}
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
              style={{ padding: "8px" }}
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
              style={{ padding: "8px" }}
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
              style={{ padding: "8px" }}
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
              style={{ padding: "8px" }}
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
              style={{ padding: "8px" }}
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
              style={{ padding: "8px" }}
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

        <div style={{ marginTop: "16px", display: "flex", alignItems: "center", gap: "16px", flexWrap: "wrap" }}>
          <div style={cajaMes}>
            <span style={textoCaja}>Comisionado:</span>
            <div style={{ display: "flex", gap: "6px" }}>
              <button type="button" className="btn btn-secondary" onClick={() => cambiarMesFiltro("fecha_comisionado", "ant")} style={botonMes} title="Mes Anterior (-1)">←</button>
              <button type="button" className="btn btn-secondary" onClick={() => cambiarMesFiltro("fecha_comisionado", "actual")} style={botonMes} title="Mes Actual -1">Actual</button>
              <button type="button" className="btn btn-secondary" onClick={() => cambiarMesFiltro("fecha_comisionado", "sig")} style={botonMes} title="Mes Siguiente (+1)">→</button>
            </div>
          </div>
          <div style={cajaMes}>
            <span style={textoCaja}>Afectación:</span>
            <div style={{ display: "flex", gap: "6px" }}>
              <button type="button" className="btn btn-secondary" onClick={() => cambiarMesFiltro("fecha_afectacion", "ant")} style={botonMes} title="Mes Anterior (-1)">←</button>
              <button type="button" className="btn btn-secondary" onClick={() => cambiarMesFiltro("fecha_afectacion", "actual")} style={botonMes} title="Mes Actual Real">Actual</button>
              <button type="button" className="btn btn-secondary" onClick={() => cambiarMesFiltro("fecha_afectacion", "sig")} style={botonMes} title="Mes Siguiente (+1)">→</button>
            </div>
          </div>
        </div>
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

        <div className="table-container">
          <table className="table-premium table-compact">
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
                {cabecera("cliente", "Cliente")}
                {cabecera("telefono", "Teléfono")}
                {cabecera("email", "Email")}
                {cabecera("marca", "Marca")}
                {cabecera("modelo", "Modelo")}
                {cabecera("tipo_venta", "T. Venta")}
                {cabecera("estado", "Estado")}
                {cabecera("vendedor", "Vendedor")}
                {cabecera("fecha_expediente", "F. Exp.", FONDO_FECHA_A)}
                {cabecera("fecha_afectacion", "F. Afect", FONDO_FECHA_B)}
                {cabecera("fecha_rci", "F. RCI", FONDO_FECHA_A)}
                {cabecera("fecha_matriculacion", "F. Mat", FONDO_FECHA_B)}
                {cabecera("fecha_facturacion", "F. FAC.", FONDO_FECHA_A)}
                {cabecera("fecha_entrega", "F. Entrega", FONDO_FECHA_B)}
                {cabecera("cobro", "Cobro", "rgba(128, 128, 128, 0.06)")}
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
                    {mostrarCol("cliente") && (
                      <td style={{ fontWeight: 600, color: "var(--text-primary)", whiteSpace: "nowrap" }}>
                        <CeldaCliente exp={exp} alAsignar={setAsignandoId} />
                      </td>
                    )}
                    {mostrarCol("telefono") && (
                      <td style={{ userSelect: "text", whiteSpace: "nowrap" }}>
                        {exp.cliente?.telefonos[0]?.telefono ?? <span style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>N/D</span>}
                      </td>
                    )}
                    {mostrarCol("email") && (
                      <td style={{ userSelect: "text", whiteSpace: "nowrap" }}>
                        {exp.cliente?.emails[0]?.email ?? <span style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>N/D</span>}
                      </td>
                    )}
                    {mostrarCol("marca") && (
                      <td>{exp.modelo?.marca?.nombre || <span style={{ fontStyle: "italic", color: "var(--text-muted)" }}>VO (Sin marca)</span>}</td>
                    )}
                    {mostrarCol("modelo") && (
                      <td>
                        {exp.modelo ? (
                          <div style={{ fontWeight: 500, color: "var(--text-primary)" }}>{exp.modelo.nombre_modelo}</div>
                        ) : (
                          <span style={{ fontStyle: "italic", color: "var(--text-muted)" }}>VO (Sin modelo)</span>
                        )}
                        {exp.vin && <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", fontFamily: "monospace", marginTop: "1px" }}>VIN: {exp.vin}</div>}
                      </td>
                    )}
                    {mostrarCol("tipo_venta") && (
                      <td>
                        <BadgeTipoVenta exp={exp} />
                      </td>
                    )}
                    {mostrarCol("estado") && (
                      <td>
                        <BadgeEstado exp={exp} />
                      </td>
                    )}
                    {mostrarCol("vendedor") && (
                      <td>
                        <div style={{ fontSize: "0.9rem", fontWeight: 500 }}>{exp.usuario?.nombre || "N/D"}</div>
                      </td>
                    )}
                    {mostrarCol("fecha_expediente") && (
                      <td style={{ textAlign: "center", backgroundColor: FONDO_FECHA_A }}>
                        <span style={{ fontSize: "0.85rem" }}>{formatDate(exp.fecha_expediente)}</span>
                      </td>
                    )}
                    {mostrarCol("fecha_afectacion") && celdaFecha(exp, "fecha_afectacion", "Afectación", FONDO_FECHA_B)}
                    {mostrarCol("fecha_rci") && celdaFecha(exp, "fecha_rci", "RCI", FONDO_FECHA_A)}
                    {mostrarCol("fecha_matriculacion") && celdaFecha(exp, "fecha_matriculacion", "Matriculación", FONDO_FECHA_B)}
                    {mostrarCol("fecha_facturacion") && celdaFecha(exp, "fecha_facturacion", "Facturación", FONDO_FECHA_A)}
                    {mostrarCol("fecha_entrega") && celdaFecha(exp, "fecha_entrega", "Entrega", FONDO_FECHA_B)}
                    {mostrarCol("cobro") && (
                      <td style={{ textAlign: "center" }}>
                        {exp.comision_cobrada ? (
                          <span className="badge" style={{ fontSize: "0.75rem", backgroundColor: "rgba(16, 185, 129, 0.15)", color: "var(--success)", border: "1px solid rgba(16, 185, 129, 0.3)" }}>
                            💰 Cobrado
                          </span>
                        ) : (
                          <span className="badge" style={{ fontSize: "0.75rem", backgroundColor: "rgba(245, 158, 11, 0.12)", color: "var(--warning)", border: "1px solid rgba(245, 158, 11, 0.25)" }}>
                            🕒 Pendiente
                          </span>
                        )}
                      </td>
                    )}
                    <td>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }}>
                        <Link
                          href={`/dashboard/expedientes/editar/${exp.id_expediente}`}
                          title="Editar expediente"
                          style={{ width: "28px", height: "28px", display: "inline-flex", alignItems: "center", justifyContent: "center", backgroundColor: "#f59e0b", color: "#000", borderRadius: "var(--radius-sm)", fontSize: "0.85rem", textDecoration: "none", boxShadow: "0 1px 3px rgba(0,0,0,0.2)" }}
                        >
                          ✏️
                        </Link>
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

      <ResumenMensual expedientes={expedientes} anios={opciones.anios.map(Number)} />

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
