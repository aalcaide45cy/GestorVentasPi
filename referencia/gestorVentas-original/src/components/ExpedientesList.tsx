"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatDate } from "@/lib/date-utils";
import * as XLSX from "xlsx";

interface Cliente {
  id: number;
  dni: string | null;
  nombre: string | null;
  fecha_de_nacimiento?: string | null;
  emails?: { email: string; tipo_email: string | null }[] | null;
  telefonos?: { telefono: string; tipo_telefono: string | null }[] | null;
}

interface Marca {
  id_marca: number;
  nombre: string;
  activo?: boolean | null;
  acceso_rapido?: boolean | null;
  sistema_comisiones?: boolean | null;
}

interface Modelo {
  id_modelo: number;
  nombre_modelo: string;
  marca?: Marca | null;
  marca_id?: number | null;
  acceso_rapido?: boolean | null;
  orden_acceso_rapido?: number | null;
}

interface TipoDeVenta {
  id_tipo_de_venta: number;
  nombre_tipo_venta: string;
  color: string | null;
}

interface EstadoVehiculo {
  id_estado_vehiculo: number;
  nombre_estado_vehiculo: string;
  predeterminado?: boolean | null;
}

interface Usuario {
  id_usuario: number;
  nombre: string | null;
}

interface Expediente {
  id_expediente: number;
  id_usuario: number | null;
  id_cliente: number | null;
  id_modelo: number | null;
  id_tienda: number | null;
  fecha_expediente: string | null;
  fecha_afectacion: string | null;
  fecha_matriculacion: string | null;
  fecha_entrega: string | null;
  fecha_rci: string | null;
  fecha_facturacion?: string | null;
  matricula: string | null;
  id_tipo_de_venta: number | null;
  id_estado_vehiculo: number | null;
  vin: string | null;
  valor_objetivo?: number | null;
  min_coches_multiplicador?: number | null;
  cobrado_otra_fecha?: boolean | null;
  fecha_cobrado?: string | null;
  comision_cobrada?: boolean | null;
  comision_coche_real?: number | null;
  comision_financiacion_real?: number | null;
  comision_preference_real?: number | null;
  comision_usado_real?: number | null;
  comision_bonus_real?: number | null;
  
  cliente?: Cliente | null;
  modelo?: Modelo | null;
  tipoDeVenta?: TipoDeVenta | null;
  estadoVehiculo?: EstadoVehiculo | null;
  usuario?: Usuario | null;
}

interface Tienda {
  id_tienda: number;
  nombre: string;
  ciudad: string | null;
}

interface ExpedientesListProps {
  expedientesIniciales: Expediente[];
  userRole: string;
  tiendas?: Tienda[];
  tiendaPredeterminadaId?: number | null;
  currentUserId?: number | null;
  currentUserName?: string | null;
}

export default function ExpedientesList({
  expedientesIniciales,
  userRole,
  tiendas = [],
  tiendaPredeterminadaId = null,
  currentUserId = null,
  currentUserName = null
}: ExpedientesListProps) {
  const router = useRouter();
  const [expedientes, setExpedientes] = useState<Expediente[]>(expedientesIniciales);

  useEffect(() => {
    setExpedientes(expedientesIniciales);
  }, [expedientesIniciales]);

  const [confirmDeleteExpediente, setConfirmDeleteExpediente] = useState<Expediente | null>(null);
  const [showCobroStatus, setShowCobroStatus] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("exp-show-cobro-status") === "true";
    }
    return false;
  });
  const [deleting, setDeleting] = useState(false);
  const [loading, setLoading] = useState(false);
  const [mostrarBotonesCSV, setMostrarBotonesCSV] = useState<boolean>(true);

  // Estados para ordenación de cabeceras
  const [sortField, setSortField] = useState<string>("fecha_expediente");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  // Estados para selección masiva e Importación/Exportación
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [bulkSelectionUnlocked, setBulkSelectionUnlocked] = useState(false);
  const [deleteUnlocked, setDeleteUnlocked] = useState(false);

  // Estados para Visibilidad de Columnas
  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("exp-visible-columns");
        if (saved) {
          return JSON.parse(saved);
        }
      } catch (e) {}
    }
    return {
      cliente: true,
      telefono: true,
      email: true,
      marca: true,
      modelo: true,
      tipo_venta: true,
      estado: true,
      vendedor: true,
      fecha_expediente: true,
      fecha_afectacion: true,
      fecha_rci: true,
      fecha_matriculacion: true,
      fecha_facturacion: true,
      fecha_entrega: true,
      cobro: true,
    };
  });
  const [showColumnSelector, setShowColumnSelector] = useState(false);

  // Estados para Importación Excel
  const [importingExcel, setImportingExcel] = useState(false);
  const [excelFileName, setExcelFileName] = useState("");
  const [excelConflictRows, setExcelConflictRows] = useState<any[]>([]);
  const [currentConflictIdx, setCurrentConflictIdx] = useState(0);
  const [excelUpdatesToProcess, setExcelUpdatesToProcess] = useState<any[]>([]);
  const [showExcelModal, setShowExcelModal] = useState(false);

  // Estados para Edición Masiva (Lote)
  const [showBulkEditModal, setShowBulkEditModal] = useState(false);
  const [catalogs, setCatalogs] = useState<{
    marcas: { id: number; nombre: string }[];
    modelosPorMarca: Record<number, { id: number; nombre: string }[]>;
    tiposVenta: { id: number; nombre: string }[];
    vendedores: { id: number; nombre: string }[];
  } | null>(null);

  const [bulkMarca, setBulkMarca] = useState<number | "">("");
  const [bulkModelo, setBulkModelo] = useState<number | "">("");
  const [bulkTipoVenta, setBulkTipoVenta] = useState<number | "">("");
  const [bulkVendedor, setBulkVendedor] = useState<number | "">("");
  const [bulkFExp, setBulkFExp] = useState("");
  const [bulkFAfect, setBulkFAfect] = useState("");
  const [bulkFRci, setBulkFRci] = useState("");
  const [bulkFMat, setBulkFMat] = useState("");
  const [bulkFEntrega, setBulkFEntrega] = useState("");

  useEffect(() => {
    if (showBulkEditModal && !catalogs) {
      const fetchCatalogs = async () => {
        try {
          const res = await fetch("/api/admin/catalogos");
          const result = await res.json();
          if (result.success) {
            setCatalogs(result.data);
          }
        } catch (err) {
          console.error("Error al cargar catálogos para edición masiva:", err);
        }
      };
      fetchCatalogs();
    }
  }, [showBulkEditModal, catalogs]);

  // Estados para buscadores y filtros
  const [globalSearch, setGlobalSearch] = useState("");
  const [ocultarEntregados, setOcultarEntregados] = useState(false);
  const [filterCliente, setFilterCliente] = useState("");
  const [filterMarca, setFilterMarca] = useState("");
  const [filterModelo, setFilterModelo] = useState("");
  const [filterTipoVenta, setFilterTipoVenta] = useState("");
  const [filterEstadoVehiculo, setFilterEstadoVehiculo] = useState("");
  const [filterVendedor, setFilterVendedor] = useState<string>(() => currentUserName || "");
  const [filterFExp, setFilterFExp] = useState("");
  const [filterFAfect, setFilterFAfect] = useState("");
  const [filterFRci, setFilterFRci] = useState("");
  const [filterFMat, setFilterFMat] = useState("");
  const [filterFEntrega, setFilterFEntrega] = useState("");
  const [filterMes, setFilterMes] = useState("");
  const [filterAnio, setFilterAnio] = useState("");
  const [filterFechaTipo, setFilterFechaTipo] = useState("fecha_expediente");
  const [filterTienda, setFilterTienda] = useState("");

  // Estado para el modal de detalle de comisiones estimadas
  const [comisionesDetailModal, setComisionesDetailModal] = useState<{
    type: "total_estimado" | "comision_teorica" | "base_vn" | "base_vo" | "credito" | "preference" | "bonus" | "penalizaciones" | "penalizacion_fija";
    title: string;
  } | null>(null);

  // Estados para estadísticas mensuales del final
  const todayDate = new Date();
  const [statsYear, setStatsYear] = useState<number>(todayDate.getFullYear());
  const [statsMonth, setStatsMonth] = useState<number>(todayDate.getMonth() + 1);

  const handleComisionadoPrevMonth = () => {
    const realCurrentDate = new Date();
    const realCurrentMonth = realCurrentDate.getMonth() + 1;
    const realCurrentYear = realCurrentDate.getFullYear();

    let currentMonth = filterMes ? parseInt(filterMes, 10) : realCurrentMonth;
    let currentYear = filterAnio ? parseInt(filterAnio, 10) : realCurrentYear;

    currentMonth -= 1;
    if (currentMonth < 1) {
      currentMonth = 12;
      currentYear -= 1;
    }

    setFilterFechaTipo("fecha_comisionado");
    setFilterMes(String(currentMonth).padStart(2, "0"));
    setFilterAnio(String(currentYear));
    setCurrentPage(1);
  };

  const handleComisionadoActualMonth = () => {
    const realCurrentDate = new Date();
    let targetMonth = realCurrentDate.getMonth() + 1 - 1; // Mes actual - 1
    let targetYear = realCurrentDate.getFullYear();

    if (targetMonth < 1) {
      targetMonth = 12;
      targetYear -= 1;
    }

    setFilterFechaTipo("fecha_comisionado");
    setFilterMes(String(targetMonth).padStart(2, "0"));
    setFilterAnio(String(targetYear));
    setCurrentPage(1);
  };

  const handleComisionadoNextMonth = () => {
    const realCurrentDate = new Date();
    const realCurrentMonth = realCurrentDate.getMonth() + 1;
    const realCurrentYear = realCurrentDate.getFullYear();

    let currentMonth = filterMes ? parseInt(filterMes, 10) : realCurrentMonth;
    let currentYear = filterAnio ? parseInt(filterAnio, 10) : realCurrentYear;

    currentMonth += 1;
    if (currentMonth > 12) {
      currentMonth = 1;
      currentYear += 1;
    }

    // Como no podrá viajar en el futuro, no debe pasar del mes actual real
    if (currentYear > realCurrentYear || (currentYear === realCurrentYear && currentMonth > realCurrentMonth)) {
      currentMonth = realCurrentMonth;
      currentYear = realCurrentYear;
    }

    setFilterFechaTipo("fecha_comisionado");
    setFilterMes(String(currentMonth).padStart(2, "0"));
    setFilterAnio(String(currentYear));
    setCurrentPage(1);
  };

  const handleAfectacionPrevMonth = () => {
    const realCurrentDate = new Date();
    const realCurrentMonth = realCurrentDate.getMonth() + 1;
    const realCurrentYear = realCurrentDate.getFullYear();

    let currentMonth = filterMes ? parseInt(filterMes, 10) : realCurrentMonth;
    let currentYear = filterAnio ? parseInt(filterAnio, 10) : realCurrentYear;

    currentMonth -= 1;
    if (currentMonth < 1) {
      currentMonth = 12;
      currentYear -= 1;
    }

    setFilterFechaTipo("fecha_afectacion");
    setFilterMes(String(currentMonth).padStart(2, "0"));
    setFilterAnio(String(currentYear));
    setCurrentPage(1);
  };

  const handleAfectacionActualMonth = () => {
    const realCurrentDate = new Date();
    const realCurrentMonth = realCurrentDate.getMonth() + 1;
    const realCurrentYear = realCurrentDate.getFullYear();

    setFilterFechaTipo("fecha_afectacion");
    setFilterMes(String(realCurrentMonth).padStart(2, "0"));
    setFilterAnio(String(realCurrentYear));
    setCurrentPage(1);
  };

  const handleAfectacionNextMonth = () => {
    const realCurrentDate = new Date();
    const realCurrentMonth = realCurrentDate.getMonth() + 1;
    const realCurrentYear = realCurrentDate.getFullYear();

    let currentMonth = filterMes ? parseInt(filterMes, 10) : realCurrentMonth;
    let currentYear = filterAnio ? parseInt(filterAnio, 10) : realCurrentYear;

    currentMonth += 1;
    if (currentMonth > 12) {
      currentMonth = 1;
      currentYear += 1;
    }

    setFilterFechaTipo("fecha_afectacion");
    setFilterMes(String(currentMonth).padStart(2, "0"));
    setFilterAnio(String(currentYear));
    setCurrentPage(1);
  };


  const [planes, setPlanes] = useState<any[]>([]);
  const [activePlan, setActivePlan] = useState<any | null>(null);

  useEffect(() => {
    const fetchPlanes = async () => {
      try {
        const res = await fetch("/api/comisiones/planes");
        const result = await res.json();
        if (result.success) {
          setPlanes(result.data);
        }
      } catch (err) {
        console.error(err);
      }
    };
    const fetchSettings = async () => {
      try {
        const res = await fetch("/api/admin/ajustes");
        const result = await res.json();
        if (result.success && result.data && result.data.mostrar_botones_csv !== undefined) {
          setMostrarBotonesCSV(result.data.mostrar_botones_csv === "true");
        }
      } catch (err) {
        console.error("Error al cargar los ajustes de CSV:", err);
      }
    };
    fetchPlanes();
    fetchSettings();
  }, []);

  // Sincronizar el mes y año de estadísticas con los del filtro cuando se filtra por fecha_comisionado
  useEffect(() => {
    if (filterFechaTipo === "fecha_comisionado") {
      if (filterMes) {
        setStatsMonth(parseInt(filterMes, 10));
      }
      if (filterAnio) {
        setStatsYear(parseInt(filterAnio, 10));
      }
    }
  }, [filterFechaTipo, filterMes, filterAnio]);

  useEffect(() => {
    if (planes.length === 0) {
      setActivePlan(null);
      return;
    }
    setActivePlan(null);
    const targetDateStr = `${statsYear}-${String(statsMonth).padStart(2, "0")}-01`;
    const matched = planes.find(p => p.fecha_inicio <= targetDateStr && p.fecha_fin >= targetDateStr);
    if (matched) {
      const fetchPlanDetails = async () => {
        try {
          const res = await fetch(`/api/comisiones/planes?id=${matched.id_plan}`);
          const result = await res.json();
          if (result.success) {
            setActivePlan(result.data);
          }
        } catch (err) {
          console.error(err);
        }
      };
      fetchPlanDetails();
    }
  }, [planes, statsYear, statsMonth]);

  // Estados de paginación (lee preferencia guardada en configuración)
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("exp-default-page-size");
      if (stored) return Number(stored);
    }
    return 20;
  });
  
  // Modales y estados para fechas inline
  const [editDateModal, setEditDateModal] = useState<{
    expediente: Expediente;
    fieldName: "fecha_afectacion" | "fecha_matriculacion" | "fecha_entrega" | "fecha_rci" | "fecha_facturacion";
    displayName: string;
  } | null>(null);

  const [deleteDateModal, setDeleteDateModal] = useState<{
    expediente: Expediente;
    fieldName: "fecha_afectacion" | "fecha_matriculacion" | "fecha_entrega" | "fecha_rci" | "fecha_facturacion";
    displayName: string;
  } | null>(null);

  const [inputDate, setInputDate] = useState("");
  const [inputMatricula, setInputMatricula] = useState("");

  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [assigningClientExpId, setAssigningClientExpId] = useState<number | null>(null);
  const [clientSearchQuery, setClientSearchQuery] = useState("");
  const [clientSearchResults, setClientSearchResults] = useState<any[]>([]);
  const [searchingClient, setSearchingClient] = useState(false);

  // Estados de creación rápida de cliente
  const [assignClientModalTab, setAssignClientModalTab] = useState<"buscar" | "crear">("buscar");
  const [newClientNombre, setNewClientNombre] = useState("");
  const [newClientDni, setNewClientDni] = useState("");
  const [newClientEmail, setNewClientEmail] = useState("");
  const [newClientTelefono, setNewClientTelefono] = useState("");
  const [newClientTiendaId, setNewClientTiendaId] = useState("");
  const [creatingClient, setCreatingClient] = useState(false);
  const [createClientError, setCreateClientError] = useState<string | null>(null);

  const showNotification = (text: string, type: "success" | "error") => {
    if (type === "success") {
      setSuccess(text);
      setTimeout(() => setSuccess(null), 3000);
    } else {
      setError(text);
      setTimeout(() => setError(null), 4000);
    }
  };

  const handleSearchClientsForAssign = async (val: string) => {
    setClientSearchQuery(val);
    if (val.trim().length < 2) {
      setClientSearchResults([]);
      return;
    }
    setSearchingClient(true);
    try {
      const res = await fetch(`/api/clientes/buscar?q=${encodeURIComponent(val)}`);
      if (res.ok) {
        const data = await res.json();
        setClientSearchResults(data.data || []);
      }
    } catch (e) {
      console.error("Error al buscar clientes:", e);
    } finally {
      setSearchingClient(false);
    }
  };

  const handleAssignClient = async (selectedClient: any) => {
    if (!assigningClientExpId) return;
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/expedientes", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id_expediente: assigningClientExpId,
          expediente: {},
          id_cliente: selectedClient.id
        })
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.message || "Error al asignar el cliente.");
      }

      setExpedientes(prev => prev.map(exp => {
        if (exp.id_expediente === assigningClientExpId) {
          return {
            ...exp,
            id_cliente: selectedClient.id,
            cliente: {
              id: selectedClient.id,
              dni: selectedClient.dni,
              nombre: selectedClient.nombre,
              fecha_de_nacimiento: selectedClient.fecha_de_nacimiento,
              tienda_id: selectedClient.tienda_id,
              emails: selectedClient.emails || [],
              telefonos: selectedClient.telefonos || []
            }
          };
        }
        return exp;
      }));

      showNotification("Cliente asignado correctamente.", "success");
      setAssigningClientExpId(null);
      setClientSearchQuery("");
      setClientSearchResults([]);
    } catch (e: any) {
      showNotification(e.message || "Error al asignar el cliente.", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateAndAssignClient = async () => {
    if (!newClientNombre.trim()) {
      setCreateClientError("El nombre es obligatorio.");
      return;
    }
    setCreatingClient(true);
    setCreateClientError(null);
    try {
      const res = await fetch("/api/clientes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nombre: newClientNombre,
          dni: newClientDni || null,
          tienda_id: newClientTiendaId ? Number(newClientTiendaId) : null,
          emails: newClientEmail ? [{ email: newClientEmail, tipo: "Principal" }] : [],
          telefonos: newClientTelefono ? [{ telefono: newClientTelefono, tipo: "Principal" }] : []
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || "Error al crear el cliente.");
      }

      const createdClient = data.data;
      // Asignar el cliente creado al expediente
      await handleAssignClient(createdClient);

      // Limpiar formulario de creación de cliente
      setNewClientNombre("");
      setNewClientDni("");
      setNewClientEmail("");
      setNewClientTelefono("");
      setNewClientTiendaId("");
      setAssignClientModalTab("buscar");
    } catch (err: any) {
      setCreateClientError(err.message || "Error interno al crear el cliente.");
    } finally {
      setCreatingClient(false);
    }
  };

  // Manejo de Selección Masiva
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(expedientes.map(e => e.id_expediente));
    } else {
      setSelectedIds([]);
    }
  };

  const handleSelectOne = (id: number, checked: boolean) => {
    if (checked) {
      setSelectedIds(prev => [...prev, id]);
    } else {
      setSelectedIds(prev => prev.filter(item => item !== id));
    }
  };

  // Borrado Masivo
  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    setDeleting(true);
    setError(null);

    try {
      const response = await fetch("/api/expedientes", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: selectedIds }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || "Error al eliminar los expedientes seleccionados");
      }

      setExpedientes(prev => prev.filter(e => !selectedIds.includes(e.id_expediente)));
      showNotification(`${selectedIds.length} expedientes eliminados con éxito.`, "success");
      setSelectedIds([]);
      setConfirmBulkDelete(false);
      router.refresh();
    } catch (err: any) {
      showNotification(err.message || "Ocurrió un error inesperado al eliminar los expedientes.", "error");
    } finally {
      setDeleting(false);
    }
  };

  // Exportar a CSV
  const handleExportCSV = (onlySelected = false) => {
    const listToExport = onlySelected 
      ? expedientes.filter(e => selectedIds.includes(e.id_expediente))
      : expedientes;

    if (listToExport.length === 0) {
      showNotification("No hay expedientes para exportar.", "error");
      return;
    }

    // Cabeceras de las columnas del CSV
    const headers = [
      "ID Expediente", "Cliente Nombre", "Cliente DNI", "Cliente Fecha Nacimiento", "Cliente Emails", "Cliente Telefonos",
      "Marca", "Marca Activo", "Marca Acceso Rapido", "Marca Sistema Comisiones",
      "Modelo", "Modelo Acceso Rapido", "Modelo Orden Acceso Rapido",
      "Tipo Venta", "Tipo Venta Color", "Estado Vehiculo", "Estado Vehiculo Predeterminado",
      "Vendedor", "F. Expediente", 
      "F. Afectacion", "F. RCI", "F. Matriculacion", "F. Entrega", "Matricula", "VIN"
    ];

    const rows = listToExport.map(e => [
      e.id_expediente,
      e.cliente?.nombre || "",
      e.cliente?.dni || "",
      e.cliente?.fecha_de_nacimiento || "",
      e.cliente?.emails && e.cliente.emails.length > 0 ? e.cliente.emails.map(em => `${em.email}:${em.tipo_email || "Principal"}`).join("|") : "",
      e.cliente?.telefonos && e.cliente.telefonos.length > 0 ? e.cliente.telefonos.map(tel => `${tel.telefono}:${tel.tipo_telefono || "Principal"}`).join("|") : "",
      e.modelo?.marca?.nombre || "",
      e.modelo?.marca?.activo !== undefined && e.modelo?.marca?.activo !== null ? String(e.modelo.marca.activo) : "true",
      e.modelo?.marca?.acceso_rapido !== undefined && e.modelo?.marca?.acceso_rapido !== null ? String(e.modelo.marca.acceso_rapido) : "false",
      e.modelo?.marca?.sistema_comisiones !== undefined && e.modelo?.marca?.sistema_comisiones !== null ? String(e.modelo.marca.sistema_comisiones) : "false",
      e.modelo?.nombre_modelo || "",
      e.modelo?.acceso_rapido !== undefined && e.modelo?.acceso_rapido !== null ? String(e.modelo.acceso_rapido) : "false",
      e.modelo?.orden_acceso_rapido !== undefined && e.modelo?.orden_acceso_rapido !== null ? String(e.modelo.orden_acceso_rapido) : "0",
      e.tipoDeVenta?.nombre_tipo_venta || "",
      e.tipoDeVenta?.color || "",
      e.estadoVehiculo?.nombre_estado_vehiculo || "",
      e.estadoVehiculo?.predeterminado !== undefined && e.estadoVehiculo?.predeterminado !== null ? String(e.estadoVehiculo.predeterminado) : "false",
      e.usuario?.nombre || "",
      e.fecha_expediente || "",
      e.fecha_afectacion || "",
      e.fecha_rci || "",
      e.fecha_matriculacion || "",
      e.fecha_entrega || "",
      e.matricula || "",
      e.vin || ""
    ]);

    // Añadir el BOM y directiva sep=; para asegurar compatibilidad de caracteres especiales y detección de separador en Excel
    const csvContent = "\uFEFF" + [
      "sep=;",
      headers.join(";"),
      ...rows.map(r => r.map(val => `"${String(val).replace(/"/g, '""')}"`).join(";"))
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `expedientes_${onlySelected ? 'seleccionados_' : ''}export_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showNotification("Exportación CSV realizada con éxito.", "success");
  };

  // Importar desde CSV con prevención de duplicados
  const handleImportCSV = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setError(null);
    const reader = new FileReader();

    reader.onload = async (e) => {
      try {
        const text = e.target?.result as string;
        if (!text) throw new Error("Archivo vacío");

        // Parsear líneas del CSV
        const lines = text.split(/\r?\n/).filter(line => line.trim().length > 0);
        if (lines.length < 2) {
          throw new Error("El archivo CSV no contiene suficientes líneas (cabecera + datos).");
        }

        // Detectar si la primera línea es la directiva de separador (ej: sep=;)
        let headerIndex = 0;
        if (lines[0].toLowerCase().startsWith("sep=")) {
          headerIndex = 1;
        }

        if (lines.length <= headerIndex + 1) {
          throw new Error("El archivo CSV no contiene suficientes líneas de datos.");
        }

        // Detectar delimitador (punto y coma o coma)
        const headerLine = lines[headerIndex];
        const delimiter = headerLine.includes(";") ? ";" : ",";
        const rawHeaders = headerLine.split(delimiter).map(h => h.trim().replace(/^["']|["']$/g, "").toLowerCase());

        const getColIndex = (names: string[]) => {
          return rawHeaders.findIndex(h => names.some(name => h.includes(name)));
        };

        const idxClienteNombre = getColIndex(["cliente nombre", "nombre cliente", "cliente", "name"]);
        const idxClienteDni = getColIndex(["cliente dni", "dni cliente", "dni", "nif"]);
        const idxClienteFechaNac = getColIndex(["cliente fecha nacimiento", "cliente_fecha_nacimiento", "fecha_nacimiento_cliente"]);
        const idxClienteEmails = getColIndex(["cliente emails", "cliente_emails", "emails_cliente"]);
        const idxClienteTels = getColIndex(["cliente telefonos", "cliente_telefonos", "telefonos_cliente", "tels_cliente"]);
        const idxMarca = getColIndex(["marca", "brand"]);
        const idxMarcaActivo = getColIndex(["marca activo", "marca_activo"]);
        const idxMarcaAccesoRapido = getColIndex(["marca acceso rapido", "marca_acceso_rapido"]);
        const idxMarcaSistemaComisiones = getColIndex(["marca sistema comisiones", "marca_sistema_comisiones"]);
        const idxModelo = getColIndex(["modelo", "model"]);
        const idxModeloAccesoRapido = getColIndex(["modelo acceso rapido", "modelo_acceso_rapido"]);
        const idxModeloOrdenAccesoRapido = getColIndex(["modelo orden acceso rapido", "modelo_orden_acceso_rapido"]);
        const idxTipoVenta = getColIndex(["tipo venta", "tipo de venta", "tipo_venta"]);
        const idxTipoVentaColor = getColIndex(["tipo venta color", "tipo_venta_color"]);
        const idxEstadoVehiculo = getColIndex(["estado vehiculo", "estado de vehiculo", "estado_vehiculo", "estado"]);
        const idxEstadoVehiculoPredeterminado = getColIndex(["estado vehiculo predeterminado", "estado_vehiculo_predeterminado"]);
        const idxFechaExp = getColIndex(["f. expediente", "fecha expediente", "fecha_expediente", "fecha"]);
        const idxFechaAfect = getColIndex(["f. afectacion", "fecha afectacion", "fecha_afectacion", "afectacion"]);
        const idxFechaRci = getColIndex(["f. rci", "fecha rci", "fecha_rci", "rci"]);
        const idxFechaMat = getColIndex(["f. matriculacion", "fecha matriculacion", "fecha_matriculacion", "matriculacion"]);
        const idxFechaEntrega = getColIndex(["f. entrega", "fecha entrega", "fecha_entrega", "entrega"]);
        const idxMatricula = getColIndex(["matricula", "license plate"]);
        const idxVin = getColIndex(["vin", "bastidor"]);

        const itemsToImport = [];

        for (let i = headerIndex + 1; i < lines.length; i++) {
          const line = lines[i];
          // Regex robusto para separar valores respetando comillas
          let parts = [];
          let current = "";
          let inQuotes = false;
          for (let c = 0; c < line.length; c++) {
            const char = line[c];
            if (char === '"') {
              inQuotes = !inQuotes;
            } else if (char === delimiter && !inQuotes) {
              parts.push(current.trim().replace(/^["']|["']$/g, ""));
              current = "";
            } else {
              current += char;
            }
          }
          parts.push(current.trim().replace(/^["']|["']$/g, ""));

          if (parts.length === 0 || (parts.length === 1 && parts[0] === "")) continue;

          const getValue = (idx: number) => idx !== -1 && idx < parts.length ? parts[idx] : null;

          itemsToImport.push({
            cliente_nombre: getValue(idxClienteNombre),
            cliente_dni: getValue(idxClienteDni),
            cliente_fecha_nacimiento: getValue(idxClienteFechaNac),
            cliente_emails: getValue(idxClienteEmails),
            cliente_telefonos: getValue(idxClienteTels),
            marca_nombre: getValue(idxMarca),
            marca_activo: getValue(idxMarcaActivo),
            marca_acceso_rapido: getValue(idxMarcaAccesoRapido),
            marca_sistema_comisiones: getValue(idxMarcaSistemaComisiones),
            modelo_nombre: getValue(idxModelo),
            modelo_acceso_rapido: getValue(idxModeloAccesoRapido),
            modelo_orden_acceso_rapido: getValue(idxModeloOrdenAccesoRapido),
            tipo_venta_nombre: getValue(idxTipoVenta),
            tipo_venta_color: getValue(idxTipoVentaColor),
            estado_vehiculo_nombre: getValue(idxEstadoVehiculo),
            estado_vehiculo_predeterminado: getValue(idxEstadoVehiculoPredeterminado),
            fecha_expediente: getValue(idxFechaExp),
            fecha_afectacion: getValue(idxFechaAfect),
            fecha_rci: getValue(idxFechaRci),
            fecha_matriculacion: getValue(idxFechaMat),
            fecha_entrega: getValue(idxFechaEntrega),
            matricula: getValue(idxMatricula),
            vin: getValue(idxVin)
          });
        }

        if (itemsToImport.length === 0) {
          throw new Error("No se encontraron registros válidos de datos en el CSV.");
        }

        const response = await fetch("/api/expedientes/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ items: itemsToImport, filename: file.name })
        });

        const result = await response.json();
        if (!response.ok) {
          throw new Error(result.message || "Error al procesar la importación en el servidor.");
        }

        showNotification(result.message, "success");
        router.refresh();
      } catch (err: any) {
        showNotification(err.message || "Error al importar el archivo CSV.", "error");
      } finally {
        setLoading(false);
        event.target.value = "";
      }
    };

    reader.onerror = () => {
      showNotification("Error de lectura del archivo.", "error");
      setLoading(false);
      event.target.value = "";
    };

    reader.readAsText(file);
  };

  // --- IMPORTADOR DE EXCEL (XLSX) ---
  const parseExcelDate = (val: any) => {
    if (!val) return null;
    if (val instanceof Date) {
      return val.toISOString().split("T")[0];
    }
    if (typeof val === "number") {
      const date = new Date(Math.round((val - 25569) * 86400 * 1000));
      return date.toISOString().split("T")[0];
    }
    const str = String(val).trim();
    if (!str) return null;

    const matchDMY = str.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
    if (matchDMY) {
      const day = matchDMY[1].padStart(2, "0");
      const month = matchDMY[2].padStart(2, "0");
      const year = matchDMY[3];
      return `${year}-${month}-${day}`;
    }

    const matchYMD = str.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
    if (matchYMD) {
      const year = matchYMD[1];
      const month = matchYMD[2].padStart(2, "0");
      const day = matchYMD[3].padStart(2, "0");
      return `${year}-${month}-${day}`;
    }

    const d = new Date(str);
    if (!isNaN(d.getTime())) {
      return d.toISOString().split("T")[0];
    }
    return null;
  };

  const handleImportExcel = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setExcelFileName(file.name);
    setImportingExcel(true);
    const reader = new FileReader();

    reader.onload = async (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: "array" });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];

        const rawRows: any[] = XLSX.utils.sheet_to_json(sheet, { defval: "" });
        if (rawRows.length === 0) {
          throw new Error("El archivo Excel está vacío.");
        }

        const firstRow = rawRows[0];
        const keys = Object.keys(firstRow);

        const getColKey = (names: string[]) => {
          return keys.find(k => names.some(name => k.toLowerCase().trim() === name.toLowerCase().trim() || k.toLowerCase().trim().includes(name.toLowerCase().trim()))) || "";
        };

        const clienteKey = getColKey(["cliente"]);
        const nifKey = getColKey(["nif", "dni", "n.i.f"]);
        const bastidorKey = getColKey(["bastidor", "vin", "chasis"]);
        const matriculaKey = getColKey(["matrícula", "matricula", "patente"]);
        const fAfectKey = getColKey(["f. afect", "fecha afectacion", "fecha_afectacion", "afectación"]);
        const fMatKey = getColKey(["fecha matriculacion", "fecha matriculación", "f. mat", "fecha_matriculacion"]);
        const emailKey = getColKey(["email cliente", "email_cliente", "correo cliente", "correo"]);
        const fCreadoKey = getColKey(["f. creado", "fecha creado", "f_creado", "creado", "f. exp", "fecha expediente"]);
        const telefonoKey = getColKey(["teléfono", "telefono", "móvil", "movil", "tfno", "phone", "telf"]);
        const fEntregaKey = getColKey(["entrega fijada", "f. entrega", "fecha entrega", "entrega_fijada", "fecha de entrega"]);

        if (!clienteKey) {
          throw new Error("No se encontró la columna 'Cliente' en el archivo Excel.");
        }

        const rowsToVerify = rawRows.map((row, idx) => {
          let rawTel = telefonoKey ? String(row[telefonoKey]).trim() : "";
          if (rawTel.endsWith(".0")) {
            rawTel = rawTel.slice(0, -2);
          }
          const cleanTel = rawTel.replace(/[^\d+]/g, "");

          return {
            rowIdx: idx,
            cliente: row[clienteKey] ? String(row[clienteKey]).trim() : "",
            nif: nifKey ? String(row[nifKey]).trim() : "",
            bastidor: bastidorKey ? String(row[bastidorKey]).trim() : "",
            matricula: matriculaKey ? String(row[matriculaKey]).trim() : "",
            f_afect: fAfectKey ? parseExcelDate(row[fAfectKey]) : null,
            f_mat: fMatKey ? parseExcelDate(row[fMatKey]) : null,
            email: emailKey ? String(row[emailKey]).trim() : "",
            f_exp: fCreadoKey ? parseExcelDate(row[fCreadoKey]) : null,
            telefono: cleanTel,
            f_entrega: fEntregaKey ? parseExcelDate(row[fEntregaKey]) : null
          };
        }).filter(r => r.cliente !== "");

        if (rowsToVerify.length === 0) {
          throw new Error("No se encontraron registros de clientes válidos en el archivo Excel.");
        }

        const verifyRes = await fetch("/api/expedientes/importar-excel/verificar", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rows: rowsToVerify })
        });
        const verifyResult = await verifyRes.json();
        if (!verifyRes.ok) {
          throw new Error(verifyResult.message || "Error al verificar el archivo Excel.");
        }

        const verificationResults: any[] = verifyResult.results;
        const autoUpdates: any[] = [];
        const conflictRowsList: any[] = [];

        verificationResults.forEach(res => {
          const originalRow = rowsToVerify.find(r => r.rowIdx === res.rowIdx);
          if (!originalRow) return;

          if (res.status === "ok") {
            autoUpdates.push({
              rowIdx: res.rowIdx,
              id_cliente: res.id_cliente,
              id_expediente: res.id_expediente,
              nif: originalRow.nif,
              bastidor: originalRow.bastidor,
              matricula: originalRow.matricula,
              f_afect: originalRow.f_afect,
              f_mat: originalRow.f_mat,
              email: originalRow.email,
              f_exp: originalRow.f_exp,
              telefono: originalRow.telefono,
              f_entrega: originalRow.f_entrega
            });
          } else if (res.status === "multiple") {
            conflictRowsList.push({
              ...res,
              data: originalRow
            });
          }
        });

        setExcelUpdatesToProcess(autoUpdates);

        if (conflictRowsList.length > 0) {
          setExcelConflictRows(conflictRowsList);
          setCurrentConflictIdx(0);
          setShowExcelModal(true);
        } else if (autoUpdates.length > 0) {
          await executeExcelImport(autoUpdates);
        } else {
          showNotification("No había ningún cliente coincidente en el archivo Excel.", "error");
        }

      } catch (err: any) {
        showNotification(err.message || "Error al importar el archivo Excel.", "error");
      } finally {
        setImportingExcel(false);
        event.target.value = "";
      }
    };

    reader.onerror = () => {
      showNotification("Error de lectura del archivo.", "error");
      setImportingExcel(false);
      event.target.value = "";
    };

    reader.readAsArrayBuffer(file);
  };

  const executeExcelImport = async (updates: any[]) => {
    setImportingExcel(true);
    try {
      const response = await fetch("/api/expedientes/importar-excel/procesar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates, filename: excelFileName })
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.message || "Error al procesar los datos de Excel.");
      }
      showNotification(result.message, "success");
      router.refresh();
    } catch (err: any) {
      showNotification(err.message || "Error al completar la importación.", "error");
    } finally {
      setImportingExcel(false);
      setShowExcelModal(false);
      setExcelConflictRows([]);
      setExcelUpdatesToProcess([]);
    }
  };

  const handleResolveMultipleConflict = (selectedExpedienteId: number) => {
    const currentConflict = excelConflictRows[currentConflictIdx];
    const updatedPayload = {
      rowIdx: currentConflict.rowIdx,
      id_cliente: currentConflict.id_cliente,
      id_expediente: selectedExpedienteId,
      nif: currentConflict.data.nif,
      bastidor: currentConflict.data.bastidor,
      matricula: currentConflict.data.matricula,
      f_afect: currentConflict.data.f_afect,
      f_mat: currentConflict.data.f_mat,
      email: currentConflict.data.email,
      f_exp: currentConflict.data.f_exp,
      telefono: currentConflict.data.telefono,
      f_entrega: currentConflict.data.f_entrega
    };

    const nextUpdates = [...excelUpdatesToProcess, updatedPayload];
    setExcelUpdatesToProcess(nextUpdates);

    if (currentConflictIdx + 1 < excelConflictRows.length) {
      setCurrentConflictIdx(currentConflictIdx + 1);
    } else {
      executeExcelImport(nextUpdates);
    }
  };

  const handleSkipExcelConflict = () => {
    if (currentConflictIdx + 1 < excelConflictRows.length) {
      setCurrentConflictIdx(currentConflictIdx + 1);
    } else {
      executeExcelImport(excelUpdatesToProcess);
    }
  };

  // Exportar base de datos a JSON (Copia de seguridad)
  const handleExportBackupJSON = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/backup", { method: "GET" });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.message || "Error al generar la copia de seguridad.");
      }

      // Inyectar preferencias del navegador en el backup
      const backupWithPrefs = {
        ...result,
        preferences: {
          expDefaultPageSize: Number(localStorage.getItem("exp-default-page-size") || "20"),
          sidebarCollapsed: localStorage.getItem("sidebar-collapsed") === "true",
        }
      };

      const jsonString = `data:text/json;charset=utf-8,${encodeURIComponent(
        JSON.stringify(backupWithPrefs, null, 2)
      )}`;
      const downloadAnchor = document.createElement("a");
      downloadAnchor.setAttribute("href", jsonString);
      downloadAnchor.setAttribute(
        "download",
        `backup_completo_${new Date().toISOString().split("T")[0]}.json`
      );
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      document.body.removeChild(downloadAnchor);
      showNotification("Copia de seguridad JSON exportada correctamente.", "success");
    } catch (err: any) {
      showNotification(err.message || "Error al exportar copia de seguridad.", "error");
    } finally {
      setLoading(false);
    }
  };

  // Importar base de datos desde JSON (Restauración completa)
  const handleImportBackupJSON = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const confirmRestore = window.confirm(
      "¡ATENCIÓN! Estás a punto de restaurar una copia de seguridad COMPLETA de la base de datos.\n\n" +
      "Esto ELIMINARÁ permanentemente todos los datos existentes (tiendas, usuarios, clientes, comisiones, expedientes, etc.) e importará los registros del archivo.\n\n" +
      "¿Estás completamente seguro de que deseas proceder?"
    );

    if (!confirmRestore) {
      event.target.value = "";
      return;
    }

    setLoading(true);
    const reader = new FileReader();

    reader.onload = async (e) => {
      try {
        const text = e.target?.result as string;
        if (!text) throw new Error("Archivo vacío");

        const parsedBackup = JSON.parse(text);

        // Restaurar preferencias del navegador si el backup las contiene
        if (parsedBackup.preferences) {
          const prefs = parsedBackup.preferences;
          if (typeof prefs.expDefaultPageSize === "number") {
            localStorage.setItem("exp-default-page-size", String(prefs.expDefaultPageSize));
          }
          if (typeof prefs.sidebarCollapsed === "boolean") {
            localStorage.setItem("sidebar-collapsed", String(prefs.sidebarCollapsed));
          }
        }

        const response = await fetch("/api/admin/backup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(parsedBackup),
        });

        const result = await response.json();
        if (!response.ok) {
          throw new Error(result.message || "Error al restaurar la copia de seguridad.");
        }

        showNotification(result.message, "success");
        router.refresh();
        setTimeout(() => {
          window.location.reload();
        }, 1500);
      } catch (err: any) {
        showNotification(err.message || "Error al procesar el archivo de copia de seguridad JSON.", "error");
      } finally {
        setLoading(false);
        event.target.value = "";
      }
    };

    reader.onerror = () => {
      showNotification("Error al leer el archivo de backup.", "error");
      setLoading(false);
      event.target.value = "";
    };

    reader.readAsText(file);
  };


  const handleOpenEditDate = (
    exp: Expediente,
    field: "fecha_afectacion" | "fecha_matriculacion" | "fecha_entrega" | "fecha_rci" | "fecha_facturacion",
    displayName: string
  ) => {
    const today = new Date().toISOString().split("T")[0];
    setInputDate(exp[field] || today);
    setInputMatricula(exp.matricula || "");
    setEditDateModal({ expediente: exp, fieldName: field, displayName });
  };

  const handleSaveDate = async () => {
    if (!editDateModal) return;
    setLoading(true);
    setError(null);

    const { expediente, fieldName, displayName } = editDateModal;

    const updatePayload: any = {
      [fieldName]: inputDate || null,
    };

    if (fieldName === "fecha_matriculacion") {
      updatePayload.matricula = inputMatricula || null;
      const salesTypeNameLower = expediente.tipoDeVenta?.nombre_tipo_venta?.toLowerCase() || "";
      const isContado = salesTypeNameLower.includes("contado");
      if (!isContado && !expediente.fecha_rci) {
        updatePayload.fecha_rci = inputDate || null;
      }
    }

    try {
      const response = await fetch("/api/expedientes", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id_expediente: expediente.id_expediente,
          expediente: updatePayload,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || "Error al actualizar la fecha");
      }

      setExpedientes(prev => prev.map(e => e.id_expediente === expediente.id_expediente ? {
        ...e,
        ...updatePayload,
      } : e));

      showNotification(`Fecha de ${displayName} actualizada correctamente.`, "success");
      setEditDateModal(null);
      router.refresh();
    } catch (err: any) {
      showNotification(err.message || "Ocurrió un error al guardar la fecha.", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDeleteDate = (
    exp: Expediente,
    field: "fecha_afectacion" | "fecha_matriculacion" | "fecha_entrega" | "fecha_rci" | "fecha_facturacion",
    displayName: string
  ) => {
    setDeleteDateModal({ expediente: exp, fieldName: field, displayName });
  };

  const handleDeleteDate = async () => {
    if (!deleteDateModal) return;
    setLoading(true);
    setError(null);

    const { expediente, fieldName, displayName } = deleteDateModal;

    try {
      const response = await fetch("/api/expedientes", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id_expediente: expediente.id_expediente,
          expediente: {
            [fieldName]: null,
          },
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || "Error al eliminar la fecha");
      }

      setExpedientes(prev => prev.map(e => e.id_expediente === expediente.id_expediente ? {
        ...e,
        [fieldName]: null,
      } : e));

      showNotification(`Fecha de ${displayName} eliminada correctamente.`, "success");
      setDeleteDateModal(null);
      router.refresh();
    } catch (err: any) {
      showNotification(err.message || "Ocurrió un error al eliminar la fecha.", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveBulkEdit = async () => {
    if (selectedIds.length === 0) return;

    const expedientePayload: any = {};
    if (bulkModelo !== "") {
      expedientePayload.id_modelo = Number(bulkModelo);
    }
    if (bulkTipoVenta !== "") {
      expedientePayload.id_tipo_de_venta = Number(bulkTipoVenta);
    }
    if (userRole === "administrador" && bulkVendedor !== "") {
      expedientePayload.id_usuario = Number(bulkVendedor);
    }
    if (bulkFExp !== "") {
      expedientePayload.fecha_expediente = bulkFExp;
    }
    if (bulkFAfect !== "") {
      expedientePayload.fecha_afectacion = bulkFAfect;
    }
    if (bulkFRci !== "") {
      expedientePayload.fecha_rci = bulkFRci;
    }
    if (bulkFMat !== "") {
      expedientePayload.fecha_matriculacion = bulkFMat;
    }
    if (bulkFEntrega !== "") {
      expedientePayload.fecha_entrega = bulkFEntrega;
    }

    if (Object.keys(expedientePayload).length === 0) {
      showNotification("Por favor, rellene al menos un campo para modificar.", "error");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/expedientes", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          isBulkEdit: true,
          ids: selectedIds,
          expediente: expedientePayload
        })
      });
      const result = await res.json();
      if (result.success) {
        showNotification(`${selectedIds.length} expedientes modificados correctamente.`, "success");
        setShowBulkEditModal(false);
        setBulkMarca("");
        setBulkModelo("");
        setBulkTipoVenta("");
        setBulkVendedor("");
        setBulkFExp("");
        setBulkFAfect("");
        setBulkFRci("");
        setBulkFMat("");
        setBulkFEntrega("");
        setSelectedIds([]);
        router.refresh();
        setTimeout(() => {
          window.location.reload();
        }, 1000);
      } else {
        showNotification(result.message || "Error al actualizar expedientes.", "error");
      }
    } catch (err) {
      console.error(err);
      showNotification("Error de conexión al actualizar.", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteExpediente = async () => {
    if (!confirmDeleteExpediente) return;
    setDeleting(true);
    setError(null);

    try {
      const response = await fetch(`/api/expedientes?id=${confirmDeleteExpediente.id_expediente}`, {
        method: "DELETE",
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || "Error al eliminar el expediente");
      }

      setExpedientes(prev => prev.filter(e => e.id_expediente !== confirmDeleteExpediente.id_expediente));
      showNotification(`Expediente eliminado con éxito.`, "success");
      setConfirmDeleteExpediente(null);
      router.refresh();
    } catch (err: any) {
      showNotification(err.message || "Ocurrió un error inesperado al eliminar el expediente.", "error");
    } finally {
      setDeleting(false);
    }
  };

  // Renderizador inline de fecha con botones
  const renderDateField = (
    exp: Expediente,
    field: "fecha_afectacion" | "fecha_matriculacion" | "fecha_entrega" | "fecha_rci" | "fecha_facturacion",
    displayName: string,
    backgroundColor?: string
  ) => {
    const val = exp[field];
    return (
      <td style={{ textAlign: "center", backgroundColor }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "4px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}>
            <span 
              style={{ 
                fontSize: "0.85rem", 
                color: val ? "var(--text-primary)" : "var(--text-muted)", 
                fontWeight: val ? 500 : 400,
                textDecoration: (field === "fecha_matriculacion" && exp.cobrado_otra_fecha) ? "underline" : "none",
                cursor: (field === "fecha_matriculacion" && exp.cobrado_otra_fecha) ? "help" : "default"
              }}
              title={(field === "fecha_matriculacion" && exp.cobrado_otra_fecha && exp.fecha_cobrado) 
                ? `Fecha Cobrado: ${formatDate(exp.fecha_cobrado)}` 
                : undefined}
            >
              {formatDate(val)}
            </span>
            <div style={{ display: "flex", gap: "4px" }}>
              <button
                onClick={() => handleOpenEditDate(exp, field, displayName)}
                style={{
                  border: "none",
                  background: "rgba(255, 255, 255, 0.05)",
                  cursor: "pointer",
                  fontSize: "0.8rem",
                  padding: "4px 6px",
                  borderRadius: "4px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  transition: "all 0.2s"
                }}
                title={`Modificar fecha de ${displayName}`}
                className="glass-panel-interactive"
              >
                ✏️
              </button>
              {val && (
                <button
                  onClick={() => handleOpenDeleteDate(exp, field, displayName)}
                  style={{
                    border: "none",
                    background: "rgba(239, 68, 68, 0.05)",
                    cursor: "pointer",
                    fontSize: "0.8rem",
                    padding: "4px 6px",
                    borderRadius: "4px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    transition: "all 0.2s"
                  }}
                  title={`Eliminar fecha de ${displayName}`}
                  className="glass-panel-interactive"
                >
                  🗑️
                </button>
              )}
            </div>
          </div>
          {field === "fecha_matriculacion" && exp.matricula && (
            <div style={{
              fontSize: "0.75rem",
              fontWeight: 600,
              color: "var(--text-secondary)",
              background: "rgba(255, 255, 255, 0.05)",
              padding: "2px 6px",
              borderRadius: "4px",
              border: "1px solid var(--border-light)",
              marginTop: "2px",
              display: "inline-block"
            }}>
              🚗 {exp.matricula}
            </div>
          )}
        </div>
      </td>
    );
  };

  const months = [
    { value: 1, name: "Enero" },
    { value: 2, name: "Febrero" },
    { value: 3, name: "Marzo" },
    { value: 4, name: "Abril" },
    { value: 5, name: "Mayo" },
    { value: 6, name: "Junio" },
    { value: 7, name: "Julio" },
    { value: 8, name: "Agosto" },
    { value: 9, name: "Septiembre" },
    { value: 10, name: "Octubre" },
    { value: 11, name: "Noviembre" },
    { value: 12, name: "Diciembre" }
  ];

  const currentYearNum = new Date().getFullYear();
  const years = [currentYearNum, currentYearNum - 1, currentYearNum - 2];

  const getMonthStats = () => {
    let matriculados = 0;
    let matriculadosContado = 0;
    let matriculadosCredito = 0;
    let matriculadosPreference = 0;
    let matriculadosCreditoMat = 0;
    let matriculadosPreferenceMat = 0;

    let entregados = 0;
    let afectados = 0;

    let pedidos = 0;
    let pedidosContado = 0;
    let pedidosCredito = 0;
    let pedidosPreference = 0;

    let matriculadosVN = 0;
    let matriculadosVNFinanciados = 0;

    let objetivoComputado = 0;
    const matriculadosList: any[] = [];
    const pendientesList: any[] = [];

    let totalBaseVN = 0;
    let totalUsado = 0;
    let totalFinanciacion = 0;
    let totalPreference = 0;
    let totalReglasBonus = 0;
    let totalReglasPenalizacion = 0;
    let totalComisionGlobal = 0;

    const computedDetailsList: any[] = [];

    const isWithinPlan = (dateStr: string | null | undefined) => {
      if (!dateStr) return false;
      if (!activePlan) {
        const parts = dateStr.split("-");
        return parts.length > 1 && parseInt(parts[0], 10) === statsYear && parseInt(parts[1], 10) === statsMonth;
      }
      const d = dateStr.substring(0, 10);
      return d >= activePlan.fecha_inicio && d <= activePlan.fecha_fin;
    };

    const getEffectiveMatDate = (e: any) => {
      return e.cobrado_otra_fecha && e.fecha_cobrado ? e.fecha_cobrado : e.fecha_matriculacion;
    };

    const getActivityDate = (e: any) => {
      const effectiveMat = getEffectiveMatDate(e);
      if (e.fecha_expediente && e.fecha_afectacion) {
        return e.fecha_expediente < e.fecha_afectacion ? e.fecha_expediente : e.fecha_afectacion;
      }
      return e.fecha_expediente || e.fecha_afectacion || effectiveMat || "";
    };

    const isBeforeOrWithinPlan = (dateStr: string | null | undefined) => {
      if (!dateStr) return false;
      if (!activePlan) {
        const parts = dateStr.split("-");
        if (parts.length < 2) return false;
        const y = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10);
        if (y < statsYear) return true;
        if (y === statsYear && m <= statsMonth) return true;
        return false;
      }
      const d = dateStr.substring(0, 10);
      return d <= activePlan.fecha_fin;
    };

    const isAfterPlan = (dateStr: string | null | undefined) => {
      if (!dateStr) return true;
      if (!activePlan) {
        const parts = dateStr.split("-");
        if (parts.length < 2) return false;
        const y = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10);
        if (y > statsYear) return true;
        if (y === statsYear && m > statsMonth) return true;
        return false;
      }
      const d = dateStr.substring(0, 10);
      return d > activePlan.fecha_fin;
    };

    // 1. Filtrar expedientes que pertenezcan a este período (usando las fechas del plan si está activo)
    const periodExpedientes = expedientes.filter((e) => {
      // Si hay filtro de comercial, solo incluimos sus expedientes
      if (filterVendedor) {
        const sellerName = e.usuario?.nombre?.toLowerCase().trim() || "";
        const filterName = filterVendedor.toLowerCase().trim();
        if (sellerName !== filterName) return false;
      }

      const actDate = getActivityDate(e);
      const isRelatedThisMonth = isWithinPlan(actDate);
      const isMatriculadoThisMonth = isWithinPlan(getEffectiveMatDate(e));
      const isRciThisMonth = isWithinPlan(e.fecha_rci);

      const fuePedidoOFinanciado = isBeforeOrWithinPlan(actDate) || isBeforeOrWithinPlan(e.fecha_rci);
      const noMatriculadoAun = isAfterPlan(getEffectiveMatDate(e));
      const isPendingPipeline = fuePedidoOFinanciado && noMatriculadoAun;

      return isRelatedThisMonth || isMatriculadoThisMonth || isRciThisMonth || isPendingPipeline;
    });

    // 2. Agrupar por vendedor
    const expedientesByVendedor: Record<number, any[]> = {};
    periodExpedientes.forEach((e) => {
      const idVendedor = e.id_usuario || 999999;
      if (!expedientesByVendedor[idVendedor]) {
        expedientesByVendedor[idVendedor] = [];
      }
      expedientesByVendedor[idVendedor].push(e);
    });

    // 3. Procesar cada vendedor de forma independiente para alinearse con el backend
    for (const [idVendedorStr, vendedorExps] of Object.entries(expedientesByVendedor)) {
      const isVOVendedor = vendedorExps[0]?.usuario?.tipo_vendedor === "VO";
      const patronName = vendedorExps[0]?.usuario?.patron_vo || "Estándar VO";

      let matchedPatternTiers: any[] = [];
      if (isVOVendedor && activePlan) {
        const dbPattern = activePlan.voPatterns?.find((vp: any) => vp.nombre === patronName && vp.activo);
        if (dbPattern) {
          try {
            matchedPatternTiers = typeof dbPattern.tiers === "string" ? JSON.parse(dbPattern.tiers) : (dbPattern.tiers || []);
          } catch (e) {
            matchedPatternTiers = [];
          }
        }
      }

      // Ordenar vendedorExps cronológicamente
      vendedorExps.sort((a, b) => {
        const dateA = getEffectiveMatDate(a) || a.fecha_afectacion || a.fecha_expediente || "";
        const dateB = getEffectiveMatDate(b) || b.fecha_afectacion || b.fecha_expediente || "";
        return dateA.localeCompare(dateB);
      });

      const qualVendedorExps = vendedorExps.filter((exp) => {
        const isMatriculadoThisMonth = isWithinPlan(getEffectiveMatDate(exp));
        const isRciThisMonth = isWithinPlan(exp.fecha_rci);

        const actDate = getActivityDate(exp);
        const fuePedidoOFinanciado = isBeforeOrWithinPlan(actDate) || isBeforeOrWithinPlan(exp.fecha_rci);
        const noMatriculadoAun = isAfterPlan(getEffectiveMatDate(exp));
        const isPendingPipeline = fuePedidoOFinanciado && noMatriculadoAun;

        return isMatriculadoThisMonth || isRciThisMonth || isPendingPipeline;
      });

      // Calcular cupos para el vendedor actual
      const sellerCupoCounts: Record<number, number> = {};
      qualVendedorExps.forEach((e) => {
        const actDate = getActivityDate(e);
        const entraActivity = isWithinPlan(actDate);
        if (entraActivity) {
          const targetCupo = e.min_coches_multiplicador !== null && e.min_coches_multiplicador !== undefined
            ? Number(e.min_coches_multiplicador)
            : 0;
          if (targetCupo > 0) {
            sellerCupoCounts[targetCupo] = (sellerCupoCounts[targetCupo] || 0) + 1;
          }
        }
      });

      // Calcular objetivo del vendedor actual
      let sellerObjetivoComputado = 0;
      qualVendedorExps.forEach((exp) => {
        const actDate = getActivityDate(exp);
        const isActivityThisMonth = isWithinPlan(actDate);
        const isMatriculadoThisMonth = isWithinPlan(getEffectiveMatDate(exp));
        const entraPedido = isWithinPlan(exp.fecha_expediente);
        const entraAfectacion = isWithinPlan(exp.fecha_afectacion);
        const entraRci = isWithinPlan(exp.fecha_rci);

        const salesTypeNameLower = exp.tipoDeVenta?.nombre_tipo_venta?.toLowerCase() || "";
        const isCreditoVenta = (salesTypeNameLower.includes("crédito") || salesTypeNameLower.includes("credito") || salesTypeNameLower.includes("financiado") || salesTypeNameLower.includes("renting")) && !salesTypeNameLower.includes("preference");
        const isPreferenceVenta = salesTypeNameLower.includes("preference");

        const stateName = exp.estadoVehiculo?.nombre_estado_vehiculo?.toLowerCase() || "";
        const isVN = stateName === "nuevo" || stateName === "demo";
        let tipoUsado: string | null = null;
        if (!isVN) {
          if (stateName === "km0") tipoUsado = "KM0";
          else if (stateName === "buyback" || stateName === "bb") tipoUsado = "BB";
          else if (stateName === "seminuevo" || stateName === "vo") tipoUsado = "VO";
          else tipoUsado = "Usado";
        }

        let originalVal = 1.0;
        if (exp.valor_objetivo !== null && exp.valor_objetivo !== undefined) {
          originalVal = Number(exp.valor_objetivo);
        } else if (activePlan) {
          const brandId = exp.modelo?.marca?.id_marca || exp.modelo?.marca_id;
          if (brandId) {
            const brandIntervention = activePlan.brandInterventionRates?.find((r: any) => r.id_marca === brandId);
            if (brandIntervention && brandIntervention.valor_objetivo_defecto !== undefined && brandIntervention.valor_objetivo_defecto !== null) {
              originalVal = Number(brandIntervention.valor_objetivo_defecto);
            }
          }
        }

        let objValorExpediente = 0.0;
        let afectoObjetivo = false;
        const baseVal = originalVal === 0 ? 1.0 : originalVal;

        if (isActivityThisMonth || isMatriculadoThisMonth) {
          afectoObjetivo = true;
          if (isActivityThisMonth) {
            const targetCupo = exp.min_coches_multiplicador !== null && exp.min_coches_multiplicador !== undefined
              ? Number(exp.min_coches_multiplicador)
              : 0;
            if (targetCupo > 0 && baseVal > 1) {
              const countOfSameCupo = sellerCupoCounts[targetCupo] || 0;
              if (countOfSameCupo >= targetCupo) {
                objValorExpediente = baseVal;
              } else {
                objValorExpediente = 1.0;
              }
            } else {
              objValorExpediente = baseVal;
            }
          } else {
            // Entra únicamente por matriculación
            objValorExpediente = baseVal;
          }
        }

        let totalObjExp = 0;
        if (afectoObjetivo) {
          if (isVN) {
            totalObjExp = objValorExpediente;
          } else if (tipoUsado) {
            totalObjExp = objValorExpediente;
          }
        }

        // Reglas generales que afectan al objetivo
        if (activePlan) {
          activePlan.rules?.forEach((rule: any) => {
            if (!rule.activa || !rule.afecta_objetivo) return;
            const eventMatches = 
              (rule.tipo_evento === "pedido" && entraPedido) ||
              (rule.tipo_evento === "afectacion" && entraAfectacion) ||
              (rule.tipo_evento === "matriculacion" && isMatriculadoThisMonth) ||
              ((rule.tipo_evento === "credito" || rule.tipo_evento === "financiacion") && entraRci && exp.id_tipo_de_venta && isCreditoVenta) ||
              (rule.tipo_evento === "preference" && entraRci && isPreferenceVenta);

            if (!eventMatches) return;

            const brandId = exp.modelo?.marca_id || exp.modelo?.marca?.id_marca;
            const filterMarcaMatches = !rule.id_marca || brandId === rule.id_marca;
            const filterModeloMatches = !rule.id_modelo || exp.id_modelo === rule.id_modelo;

            if (filterMarcaMatches && filterModeloMatches) {
              totalObjExp += Number(rule.valor_objetivo || 0);

              // Ligar preference a credito
              if (rule.tipo_evento === "preference" && rule.ligar_a_credito) {
                const matchingCreditRule = activePlan.rules?.find((r: any) => {
                  if (!r.activa || !r.afecta_objetivo) return false;
                  if (r.tipo_evento !== "credito" && r.tipo_evento !== "financiacion") return false;

                  const filterMarcaMatches2 = !r.id_marca || brandId === r.id_marca;
                  const filterModeloMatches2 = !r.id_modelo || exp.id_modelo === r.id_modelo;
                  return filterMarcaMatches2 && filterModeloMatches2;
                });
                if (matchingCreditRule) {
                  totalObjExp += Number(matchingCreditRule.valor_objetivo || 0);
                }
              }
            }
          });

          // Bonus/Penalizaciones que afectan al objetivo
          activePlan.bonusRules?.forEach((bonus: any) => {
            if (!bonus.activo || !bonus.afecta_objetivo) return;
            const eventMatches = 
              (bonus.tipo_evento === "pedido" && (entraPedido || entraAfectacion)) ||
              (bonus.tipo_evento === "afectacion" && entraAfectacion) ||
              (bonus.tipo_evento === "matriculacion" && isMatriculadoThisMonth) ||
              ((bonus.tipo_evento === "credito" || bonus.tipo_evento === "financiacion") && entraRci && exp.id_tipo_de_venta && isCreditoVenta) ||
              (bonus.tipo_evento === "preference" && entraRci && isPreferenceVenta);

            if (!eventMatches) return;

            const brandId = exp.modelo?.marca_id || exp.modelo?.marca?.id_marca;
            const filterMarcaMatches = !bonus.id_marca || brandId === bonus.id_marca;
            const filterModeloMatches = !bonus.id_modelo || exp.id_modelo === bonus.id_modelo;

            if (filterMarcaMatches && filterModeloMatches) {
              totalObjExp += Number(bonus.valor_objetivo || 0);
            }
          });
        }

        sellerObjetivoComputado += totalObjExp;
      });

      // Determinar tramo del vendedor actual
      let sellerTramoAlcanzado: "X-4" | "X-3" | "X-2" | "X-1" | "X" | "X+1" | "X+2" | "X+3" = "X-4";
      if (activePlan) {
        const X_val = activePlan.objetivo_base + activePlan.arrastre;
        const diff = sellerObjetivoComputado - X_val;
        if (diff >= 3) sellerTramoAlcanzado = "X+3";
        else if (diff === 2) sellerTramoAlcanzado = "X+2";
        else if (diff === 1) sellerTramoAlcanzado = "X+1";
        else if (diff === 0) sellerTramoAlcanzado = "X";
        else if (diff === -1) sellerTramoAlcanzado = "X-1";
        else if (diff === -2) sellerTramoAlcanzado = "X-2";
        else if (diff === -3) sellerTramoAlcanzado = "X-3";
        else sellerTramoAlcanzado = "X-4";
      }

      // Contadores de Usados del vendedor actual
      const sellerUsedCounts: Record<string, number> = { VO: 0, KM0: 0, BB: 0, Usado: 0 };
      qualVendedorExps.forEach((exp) => {
        const isMatriculadoThisMonth = isWithinPlan(getEffectiveMatDate(exp));
        const stateName = exp.estadoVehiculo?.nombre_estado_vehiculo?.toLowerCase() || "";
        const isVN = stateName === "nuevo" || stateName === "demo";
        if (isMatriculadoThisMonth && !isVN) {
          let tipoUsado = "Usado";
          if (stateName === "km0") tipoUsado = "KM0";
          else if (stateName === "buyback" || stateName === "bb") tipoUsado = "BB";
          else if (stateName === "seminuevo" || stateName === "vo") tipoUsado = "VO";
          sellerUsedCounts[tipoUsado] = (sellerUsedCounts[tipoUsado] || 0) + 1;
        }
      });

      const sellerUsedProcessedIdx: Record<string, number> = { VO: 0, KM0: 0, BB: 0, Usado: 0 };
      let sellerVoUnitCounterPay = 0;

      // Calcular comisiones de los expedientes de este vendedor
      let sellerMatriculadosMes = 0;
      vendedorExps.forEach((exp) => {
        if (isWithinPlan(getEffectiveMatDate(exp))) {
          sellerMatriculadosMes++;
        }
      });

      const sellerCumpleMinimo = activePlan ? sellerMatriculadosMes >= activePlan.min_matriculaciones : false;

      // Evaluar cada expediente
      qualVendedorExps.forEach((exp) => {
        const actDate = getActivityDate(exp);
        const isRelatedThisMonth = isWithinPlan(actDate);
        const isMatriculadoThisMonth = isWithinPlan(getEffectiveMatDate(exp));
        const entraRci = isWithinPlan(exp.fecha_rci);
        const entraPedido = isWithinPlan(exp.fecha_expediente);
        const entraAfectacion = isWithinPlan(exp.fecha_afectacion);

        const stateName = exp.estadoVehiculo?.nombre_estado_vehiculo?.toLowerCase() || "";
        const isVN = stateName === "nuevo" || stateName === "demo";

        let baseVN = 0;
        let baseUsado = 0;
        let baseFinanciacion = 0;
        let basePreference = 0;
        let reglasBonus = 0;
        let reglasPenalizacion = 0;

        if (activePlan) {
          const hasCocheOverride = exp.comision_coche_real !== null && exp.comision_coche_real !== undefined;
          const hasFinanOverride = exp.comision_financiacion_real !== null && exp.comision_financiacion_real !== undefined;

          // Comisión base VN/VO (se abona por fecha_matriculacion)
          if (isMatriculadoThisMonth) {
            if (hasCocheOverride) {
              if (isVN) {
                baseVN = Number(exp.comision_coche_real);
              } else {
                baseUsado = Number(exp.comision_coche_real);
              }
            } else if (isVN) {
              if (!isVOVendedor) {
                const brandId = exp.modelo?.marca_id || exp.modelo?.marca?.id_marca;
                // Simular checkTasaCumplida para el vendedor
                const totalBrandMat = vendedorExps.filter(e => {
                  const bId = e.modelo?.marca_id || e.modelo?.marca?.id_marca;
                  const isVN_e = e.estadoVehiculo?.nombre_estado_vehiculo?.toLowerCase() === "nuevo" || e.estadoVehiculo?.nombre_estado_vehiculo?.toLowerCase() === "demo";
                  const mat_e = isWithinPlan(getEffectiveMatDate(e));
                  return bId === brandId && isVN_e && mat_e;
                }).length;

                const totalBrandFin = vendedorExps.filter(e => {
                  const bId = e.modelo?.marca_id || e.modelo?.marca?.id_marca;
                  const isVN_e = e.estadoVehiculo?.nombre_estado_vehiculo?.toLowerCase() === "nuevo" || e.estadoVehiculo?.nombre_estado_vehiculo?.toLowerCase() === "demo";
                  const rci_e = isWithinPlan(e.fecha_rci);
                  const salesTypeName = e.tipoDeVenta?.nombre_tipo_venta?.toLowerCase() || "";
                  const isFinancedType = salesTypeName.includes("preference") || salesTypeName.includes("crédito") || salesTypeName.includes("credito") || salesTypeName.includes("renting");
                  return bId === brandId && isVN_e && rci_e && isFinancedType;
                }).length;

                let tasaCumplida = true;
                if (totalBrandMat > 0) {
                  const brandInt = activePlan.brandInterventionRates?.find((i: any) => i.id_marca === brandId);
                  const targetRate = brandInt?.tasa_intervencion ?? 70;
                  const tipoTasa = brandInt?.tipo_tasa ?? "porcentaje";
                  if (tipoTasa === "unidades") {
                    tasaCumplida = totalBrandFin >= targetRate;
                  } else {
                    tasaCumplida = ((totalBrandFin / totalBrandMat) * 100) >= targetRate;
                  }
                }

                const modelRate = activePlan.rates?.find((r: any) => r.id_modelo === exp.id_modelo && r.activo && r.tasa_intervencion_cumplida === tasaCumplida);
                if (modelRate) {
                  let rateImporte = modelRate.rate_x_minus_4;
                  if (sellerTramoAlcanzado === "X-3") rateImporte = modelRate.rate_x_minus_3;
                  else if (sellerTramoAlcanzado === "X-2") rateImporte = modelRate.rate_x_minus_2;
                  else if (sellerTramoAlcanzado === "X-1") rateImporte = modelRate.rate_x_minus_1;
                  else if (sellerTramoAlcanzado === "X") rateImporte = modelRate.rate_x;
                  else if (sellerTramoAlcanzado === "X+1") rateImporte = modelRate.rate_x_plus_1;
                  else if (sellerTramoAlcanzado === "X+2") rateImporte = modelRate.rate_x_plus_2;
                  else if (sellerTramoAlcanzado === "X+3") rateImporte = modelRate.rate_x_plus_3;
                  baseVN = rateImporte;
                }
              }
            } else {
              let tipoUsado: "VO" | "KM0" | "BB" | "Usado" | null = null;
              const sName = stateName;
              if (sName === "km0") tipoUsado = "KM0";
              else if (sName === "buyback" || sName === "bb") tipoUsado = "BB";
              else if (sName === "seminuevo" || sName === "vo") tipoUsado = "VO";
              else tipoUsado = "Usado";

              if (tipoUsado) {
                if (!isVOVendedor) {
                  const usedRate = activePlan.usedRates?.find((r: any) => r.tipo_usado === tipoUsado && r.activo);
                  if (usedRate) {
                    const totalUnitsOfType = sellerUsedCounts[tipoUsado] || 0;
                    const currentIdx = sellerUsedProcessedIdx[tipoUsado]++;
                    if (totalUnitsOfType >= usedRate.min_aplicar) {
                      const isFirst = currentIdx === 0;
                      baseUsado = isFirst ? usedRate.importe_primera : usedRate.importe_resto;
                    }
                  }
                } else {
                  sellerVoUnitCounterPay++;
                  const tier = matchedPatternTiers.find((t: any) => t.unidad === sellerVoUnitCounterPay)
                    || matchedPatternTiers[matchedPatternTiers.length - 1]
                    || { valor_objetivo: 1, importe: 150 };
                  baseUsado = tier.importe;
                }
              }
            }
          }

          // Comisión Financiación (se abona por fecha_rci)
          const salesTypeNameLower = exp.tipoDeVenta?.nombre_tipo_venta?.toLowerCase() || "";
          const isCreditoVenta = (salesTypeNameLower.includes("crédito") || salesTypeNameLower.includes("credito") || salesTypeNameLower.includes("financiado") || salesTypeNameLower.includes("renting")) && !salesTypeNameLower.includes("preference");
          const isPreferenceVenta = salesTypeNameLower.includes("preference");
          const isFinancedType = isCreditoVenta || isPreferenceVenta;

          if (entraRci) {
            if (hasFinanOverride) {
              baseFinanciacion = Number(exp.comision_financiacion_real);
              basePreference = 0;
            } else {
              if (isFinancedType && exp.id_tipo_de_venta) {
                let matchedFinanceType = "";
                if (salesTypeNameLower.includes("preference")) matchedFinanceType = "Preference";
                else if (salesTypeNameLower.includes("crédito") || salesTypeNameLower.includes("credito") || salesTypeNameLower.includes("financiado")) matchedFinanceType = "Crédito";
                else if (salesTypeNameLower.includes("renting")) matchedFinanceType = "Renting";
                else if (salesTypeNameLower.includes("contado")) matchedFinanceType = "Contado";

                const brandId = exp.modelo?.marca_id || exp.modelo?.marca?.id_marca;
                if (matchedFinanceType && brandId) {
                  const finRate = activePlan.financeRates?.find(
                    (r: any) => r.id_marca === brandId && r.tipo_financiacion === matchedFinanceType
                  );
                  if (finRate) {
                    baseFinanciacion = finRate.importe;
                  }
                }
              }

              // Reglas Preference / BOX3 (se abona por fecha_rci)
              activePlan.preferenceRules?.forEach((rule: any) => {
                if (!rule.activa) return;
                const brandId = exp.modelo?.marca_id || exp.modelo?.marca?.id_marca;
                const filterMarcaMatches = !rule.id_marca || brandId === rule.id_marca;
                const filterModeloMatches = !rule.id_modelo || exp.id_modelo === rule.id_modelo;

                let finMatches = true;
                if (rule.tipo_financiacion) {
                  const ruleFin = rule.tipo_financiacion.toLowerCase();
                  const expFin = exp.tipoDeVenta?.nombre_tipo_venta?.toLowerCase() || "";
                  finMatches = expFin.includes(ruleFin) || ruleFin.includes(expFin);
                }

                if (filterMarcaMatches && filterModeloMatches && finMatches) {
                  basePreference += rule.importe;
                }
              });
            }
          }

          // Reglas generales (se abonan según tipo de evento)
          activePlan.rules?.forEach((rule: any) => {
            if (!rule.activa || !rule.afecta_comision) return;
            if (hasFinanOverride && (rule.tipo_evento === "preference" || rule.tipo_evento === "credito" || rule.tipo_evento === "financiacion")) return;
            const eventMatches = 
              (rule.tipo_evento === "pedido" && entraPedido) ||
              (rule.tipo_evento === "afectacion" && entraAfectacion) ||
              (rule.tipo_evento === "matriculacion" && isMatriculadoThisMonth) ||
              ((rule.tipo_evento === "credito" || rule.tipo_evento === "financiacion") && entraRci && exp.id_tipo_de_venta && isCreditoVenta) ||
              (rule.tipo_evento === "preference" && entraRci && isPreferenceVenta);

            if (!eventMatches) return;

            if (rule.tasa_intervencion_cumplida !== null && rule.tasa_intervencion_cumplida !== undefined) {
              const brandId = exp.modelo?.marca_id || exp.modelo?.marca?.id_marca;
              if (!brandId) return;
              const totalBrandMat = vendedorExps.filter(e => {
                const bId = e.modelo?.marca_id || e.modelo?.marca?.id_marca;
                const isVN_e = e.estadoVehiculo?.nombre_estado_vehiculo?.toLowerCase() === "nuevo" || e.estadoVehiculo?.nombre_estado_vehiculo?.toLowerCase() === "demo";
                const mat_e = isWithinPlan(getEffectiveMatDate(e));
                return bId === brandId && isVN_e && mat_e;
              }).length;

              const totalBrandFin = vendedorExps.filter(e => {
                const bId = e.modelo?.marca_id || e.modelo?.marca?.id_marca;
                const isVN_e = e.estadoVehiculo?.nombre_estado_vehiculo?.toLowerCase() === "nuevo" || e.estadoVehiculo?.nombre_estado_vehiculo?.toLowerCase() === "demo";
                const rci_e = isWithinPlan(e.fecha_rci);
                const salesTypeName = e.tipoDeVenta?.nombre_tipo_venta?.toLowerCase() || "";
                const isFinancedType = salesTypeName.includes("preference") || salesTypeName.includes("crédito") || salesTypeName.includes("credito") || salesTypeName.includes("renting");
                return bId === brandId && isVN_e && rci_e && isFinancedType;
              }).length;

              let tasaCumplida = true;
              if (totalBrandMat > 0) {
                const brandInt = activePlan.brandInterventionRates?.find((i: any) => i.id_marca === brandId);
                const targetRate = brandInt?.tasa_intervencion ?? 70;
                const tipoTasa = brandInt?.tipo_tasa ?? "porcentaje";
                if (tipoTasa === "unidades") {
                  tasaCumplida = totalBrandFin >= targetRate;
                } else {
                  tasaCumplida = ((totalBrandFin / totalBrandMat) * 100) >= targetRate;
                }
              }
              if (tasaCumplida !== rule.tasa_intervencion_cumplida) return;
            }

            const brandId = exp.modelo?.marca_id || exp.modelo?.marca?.id_marca;
            const filterMarcaMatches = !rule.id_marca || brandId === rule.id_marca;
            const filterModeloMatches = !rule.id_modelo || exp.id_modelo === rule.id_modelo;

            if (filterMarcaMatches && filterModeloMatches) {
              if (rule.tipo_evento === "preference") {
                basePreference += rule.importe;

                if (rule.ligar_a_credito) {
                  const matchingCreditRule = activePlan.rules?.find((r: any) => {
                    if (!r.activa) return false;
                    if (r.tipo_evento !== "credito" && r.tipo_evento !== "financiacion") return false;

                    const bId = exp.modelo?.marca_id || exp.modelo?.marca?.id_marca;
                    const fMarcaMatches = !r.id_marca || bId === r.id_marca;
                    const fModeloMatches = !r.id_modelo || exp.id_modelo === r.id_modelo;

                    let tMatches = true;
                    if (r.tasa_intervencion_cumplida !== null && r.tasa_intervencion_cumplida !== undefined) {
                      if (bId) {
                        const totalBrandMat = vendedorExps.filter(e => {
                          const brand_e = e.modelo?.marca_id || e.modelo?.marca?.id_marca;
                          const isVN_e = e.estadoVehiculo?.nombre_estado_vehiculo?.toLowerCase() === "nuevo" || e.estadoVehiculo?.nombre_estado_vehiculo?.toLowerCase() === "demo";
                          const mat_e = isWithinPlan(getEffectiveMatDate(e));
                          return brand_e === bId && isVN_e && mat_e;
                        }).length;

                        const totalBrandFin = vendedorExps.filter(e => {
                          const brand_e = e.modelo?.marca_id || e.modelo?.marca?.id_marca;
                          const isVN_e = e.estadoVehiculo?.nombre_estado_vehiculo?.toLowerCase() === "nuevo" || e.estadoVehiculo?.nombre_estado_vehiculo?.toLowerCase() === "demo";
                          const rci_e = isWithinPlan(e.fecha_rci);
                          const salesTypeName = e.tipoDeVenta?.nombre_tipo_venta?.toLowerCase() || "";
                          const isFinancedType = salesTypeName.includes("preference") || salesTypeName.includes("crédito") || salesTypeName.includes("credito") || salesTypeName.includes("renting");
                          return brand_e === bId && isVN_e && rci_e && isFinancedType;
                        }).length;

                        let tasaCumplida = true;
                        if (totalBrandMat > 0) {
                          const brandInt = activePlan.brandInterventionRates?.find((i: any) => i.id_marca === bId);
                          const targetRate = brandInt?.tasa_intervencion ?? 70;
                          const tipoTasa = brandInt?.tipo_tasa ?? "porcentaje";
                          if (tipoTasa === "unidades") {
                            tasaCumplida = totalBrandFin >= targetRate;
                          } else {
                            tasaCumplida = ((totalBrandFin / totalBrandMat) * 100) >= targetRate;
                          }
                        }
                        tMatches = (tasaCumplida === r.tasa_intervencion_cumplida);
                      } else {
                        tMatches = false;
                      }
                    }

                    return fMarcaMatches && fModeloMatches && tMatches;
                  });

                  if (matchingCreditRule) {
                    baseFinanciacion += matchingCreditRule.importe;
                  }
                }
              } else if (rule.tipo_evento === "credito" || rule.tipo_evento === "financiacion") {
                baseFinanciacion += rule.importe;
              } else {
                if (rule.importe < 0) {
                  reglasPenalizacion += Math.abs(rule.importe);
                } else {
                  reglasBonus += rule.importe;
                }
              }
            }
          });

          // Bonus y penalizaciones dinámicas
          activePlan.bonusRules?.forEach((bonus: any) => {
            if (!bonus.activo || (!bonus.es_penalizacion && bonus.importe <= 0)) return;
            const eventMatches = 
              (bonus.tipo_evento === "pedido" && (entraPedido || entraAfectacion)) ||
              (bonus.tipo_evento === "afectacion" && entraAfectacion) ||
              (bonus.tipo_evento === "matriculacion" && isMatriculadoThisMonth) ||
              ((bonus.tipo_evento === "credito" || bonus.tipo_evento === "financiacion") && entraRci && exp.id_tipo_de_venta && isCreditoVenta) ||
              (bonus.tipo_evento === "preference" && entraRci && isPreferenceVenta);

            if (!eventMatches) return;

            if (bonus.tipo_vehiculo === "nuevo" && !isVN) return;
            if (bonus.tipo_vehiculo === "usado" && isVN) return;

            const brandId = exp.modelo?.marca_id || exp.modelo?.marca?.id_marca;
            const filterMarcaMatches = !bonus.id_marca || brandId === bonus.id_marca;
            const filterModeloMatches = !bonus.id_modelo || exp.id_modelo === bonus.id_modelo;

            if (filterMarcaMatches && filterModeloMatches) {
              if (bonus.es_penalizacion) {
                reglasPenalizacion += Math.abs(bonus.importe);
              } else {
                reglasBonus += bonus.importe;
              }
            }
          });
        }

        const totalTeoricoExp = baseVN + baseUsado + baseFinanciacion + basePreference + reglasBonus - reglasPenalizacion;
        const totalExp = sellerCumpleMinimo ? totalTeoricoExp : 0;

        totalBaseVN += baseVN;
        totalUsado += baseUsado;
        totalFinanciacion += baseFinanciacion;
        totalPreference += basePreference;
        totalReglasBonus += reglasBonus;
        totalReglasPenalizacion += reglasPenalizacion;
        totalComisionGlobal += totalExp;

        computedDetailsList.push({
          id_expediente: exp.id_expediente,
          cliente: exp.cliente?.nombre || "Sin cliente",
          modelo: exp.modelo?.nombre_modelo || "S/D",
          marca: exp.modelo?.marca?.nombre || "VO",
          vendedor: exp.usuario?.nombre || "Sin comercial",
          matricula: exp.matricula || "S/M",
          estado: exp.estadoVehiculo?.nombre_estado_vehiculo || "N/D",
          tipoVenta: exp.tipoDeVenta?.nombre_tipo_venta || "N/D",
          baseVN,
          baseUsado,
          baseFinanciacion,
          basePreference,
          reglasBonus,
          reglasPenalizacion,
          total: totalExp,
          totalTeorico: totalTeoricoExp,
          fechaRef: getEffectiveMatDate(exp) || exp.fecha_rci || exp.fecha_afectacion || exp.fecha_expediente
        });
      });

      objetivoComputado += sellerObjetivoComputado;
    }

    // 4. Calcular contadores agregados para el panel superior e indicadores
    expedientes.forEach((exp) => {
      const actDate = getActivityDate(exp);
      const isRelatedThisMonth = isWithinPlan(actDate);
      const isMatriculadoThisMonth = isWithinPlan(getEffectiveMatDate(exp));
      const entraRci = isWithinPlan(exp.fecha_rci);

      const salesTypeNameLower = exp.tipoDeVenta?.nombre_tipo_venta?.toLowerCase() || "";
      const isContado = salesTypeNameLower.includes("contado");
      const isCredito = (salesTypeNameLower.includes("crédito") || salesTypeNameLower.includes("credito") || salesTypeNameLower.includes("financiado") || salesTypeNameLower.includes("renting")) && !salesTypeNameLower.includes("preference");
      const isPreference = salesTypeNameLower.includes("preference");
      const isFinancedType = isCredito || isPreference;

      const stateName = exp.estadoVehiculo?.nombre_estado_vehiculo?.toLowerCase() || "";
      const isVN = stateName === "nuevo" || stateName === "demo";

      if (isMatriculadoThisMonth) {
        matriculados++;
        if (isContado) matriculadosContado++;
        else if (isCredito) matriculadosCreditoMat++;
        else if (isPreference) matriculadosPreferenceMat++;

        if (isVN) {
          matriculadosVN++;
        }

        matriculadosList.push(exp);
      } else {
        const fuePedidoOFinanciado = isBeforeOrWithinPlan(actDate) || isBeforeOrWithinPlan(exp.fecha_rci);
        const noMatriculadoAun = isAfterPlan(getEffectiveMatDate(exp));
        if (fuePedidoOFinanciado && noMatriculadoAun) {
          pendientesList.push(exp);
        }
      }

      if (isVN && isFinancedType && entraRci) {
        matriculadosVNFinanciados++;
      }

      if (isCredito && entraRci) {
        matriculadosCredito++;
      } else if (isPreference && entraRci) {
        matriculadosPreference++;

        // Si tiene una regla de Preference en este plan que está ligada a crédito, también sumamos a matriculadosCredito
        if (activePlan) {
          const brandId = exp.modelo?.marca_id || exp.modelo?.marca?.id_marca;
          const hasLinkedRule = activePlan.rules?.some((r: any) => {
            if (!r.activa || r.tipo_evento !== "preference" || !r.ligar_a_credito) return false;
            const fMarcaMatches = !r.id_marca || brandId === r.id_marca;
            const fModeloMatches = !r.id_modelo || exp.id_modelo === r.id_modelo;
            return fMarcaMatches && fModeloMatches;
          });
          if (hasLinkedRule) {
            matriculadosCredito++;
          }
        }
      }

      if (isWithinPlan(exp.fecha_entrega)) entregados++;
      if (isWithinPlan(exp.fecha_afectacion)) afectados++;
      if (isWithinPlan(exp.fecha_expediente)) {
        pedidos++;
        if (isContado) pedidosContado++;
        else if (isCredito) pedidosCredito++;
        else if (isPreference) pedidosPreference++;
      }
    });

    // Deducción de penalización global fija si corresponde
    let finalComisionConPenalizacion = totalComisionGlobal;
    if (activePlan) {
      finalComisionConPenalizacion = Math.max(0, totalComisionGlobal - Math.abs(activePlan.penalizacion_importe || 0));
    }

    return {
      matriculados,
      matriculadosContado,
      matriculadosCredito,
      matriculadosPreference,
      matriculadosCreditoMat,
      matriculadosPreferenceMat,
      entregados,
      afectados,
      pedidos,
      pedidosContado,
      pedidosCredito,
      pedidosPreference,
      matriculadosVN,
      matriculadosVNFinanciados,
      objetivoComputado,
      matriculadosList,
      pendientesList,
      totalBaseVN,
      totalUsado,
      totalFinanciacion,
      totalPreference,
      totalReglasBonus,
      totalReglasPenalizacion,
      totalComisionTeorica: totalComisionGlobal,
      totalComisionGlobal: finalComisionConPenalizacion,
      computedDetailsList: computedDetailsList.filter(d => d.baseVN > 0 || d.baseUsado > 0 || d.baseFinanciacion > 0 || d.basePreference > 0 || d.reglasBonus > 0 || d.reglasPenalizacion > 0 || d.total > 0).sort((a,b) => b.total - a.total || b.totalTeorico - a.totalTeorico)
    };
  };

  const stats = getMonthStats();

  const handleSetCurrentMonth = () => {
    const d = new Date();
    const currYear = d.getFullYear();
    const currMonth = d.getMonth() + 1;
    setStatsYear(currYear);
    setStatsMonth(currMonth);
    if (filterFechaTipo === "fecha_comisionado") {
      setFilterMes(String(currMonth).padStart(2, "0"));
      setFilterAnio(String(currYear));
    }
  };

  const handleSetPreviousMonth = () => {
    let newMonth = statsMonth;
    let newYear = statsYear;
    if (statsMonth === 1) {
      newMonth = 12;
      newYear = statsYear - 1;
    } else {
      newMonth = statsMonth - 1;
    }
    setStatsMonth(newMonth);
    setStatsYear(newYear);
    if (filterFechaTipo === "fecha_comisionado") {
      setFilterMes(String(newMonth).padStart(2, "0"));
      setFilterAnio(String(newYear));
    }
  };

  const handleSetNextMonth = () => {
    let newMonth = statsMonth;
    let newYear = statsYear;
    if (statsMonth === 12) {
      newMonth = 1;
      newYear = statsYear + 1;
    } else {
      newMonth = statsMonth + 1;
    }
    setStatsMonth(newMonth);
    setStatsYear(newYear);
    if (filterFechaTipo === "fecha_comisionado") {
      setFilterMes(String(newMonth).padStart(2, "0"));
      setFilterAnio(String(newYear));
    }
  };

  const uniqueBrands = Array.from(
    new Set(
      expedientes
        .map(e => e.modelo?.marca?.nombre)
        .filter((brandName): brandName is string => !!brandName)
    )
  ).sort();

  const uniqueModelsFiltered = Array.from(
    new Set(
      expedientes
        .filter(e => !filterMarca || e.modelo?.marca?.nombre === filterMarca)
        .map(e => e.modelo?.nombre_modelo)
        .filter((modelName): modelName is string => !!modelName)
    )
  ).sort();

  const uniqueVendedores = Array.from(
    new Set([
      ...(currentUserName ? [currentUserName] : []),
      ...expedientes
        .map(e => e.usuario?.nombre)
        .filter((name): name is string => !!name)
    ])
  ).sort();

  const uniqueTiposVenta = Array.from(
    new Set(
      expedientes
        .map(e => e.tipoDeVenta?.nombre_tipo_venta)
        .filter((name): name is string => !!name)
    )
  ).sort();

  const uniqueEstados = Array.from(
    new Set(
      expedientes
        .map(e => e.estadoVehiculo?.nombre_estado_vehiculo)
        .filter((name): name is string => !!name)
    )
  ).sort();

  const uniqueYears = Array.from(
    new Set(
      expedientes.flatMap(e => [
        e.fecha_expediente?.split("-")[0],
        e.fecha_afectacion?.split("-")[0],
        e.fecha_matriculacion?.split("-")[0],
        e.fecha_entrega?.split("-")[0],
        e.fecha_rci?.split("-")[0],
        e.fecha_cobrado?.split("-")[0]
      ].filter((year): year is string => !!year))
    )
  ).sort((a, b) => Number(b) - Number(a));

  const handleClearFilters = () => {
    setGlobalSearch("");
    setOcultarEntregados(false);
    setFilterCliente("");
    setFilterMarca("");
    setFilterModelo("");
    setFilterTipoVenta("");
    setFilterEstadoVehiculo("");
    setFilterVendedor("");
    setFilterFExp("");
    setFilterFAfect("");
    setFilterFRci("");
    setFilterFMat("");
    setFilterFEntrega("");
    setFilterMes("");
    setFilterAnio("");
    setFilterFechaTipo("fecha_expediente");
    setFilterTienda("");
    setCurrentPage(1);
  };

  const filteredExpedientes = expedientes.filter(exp => {
    // Ocultar entregados
    if (ocultarEntregados && exp.fecha_entrega !== null && exp.fecha_entrega !== undefined && exp.fecha_entrega !== "") return false;

    // 1. Buscador global
    if (globalSearch) {
      const gs = globalSearch.toLowerCase();
      const matchCliente = exp.cliente?.nombre?.toLowerCase().includes(gs) || exp.cliente?.dni?.toLowerCase().includes(gs);
      const matchModelo = exp.modelo?.nombre_modelo?.toLowerCase().includes(gs) || exp.modelo?.marca?.nombre?.toLowerCase().includes(gs);
      const matchTipo = exp.tipoDeVenta?.nombre_tipo_venta?.toLowerCase().includes(gs);
      const matchEstado = exp.estadoVehiculo?.nombre_estado_vehiculo?.toLowerCase().includes(gs);
      const matchVendedor = exp.usuario?.nombre?.toLowerCase().includes(gs);
      const matchVin = exp.vin?.toLowerCase().includes(gs);
      const matchMatricula = exp.matricula?.toLowerCase().includes(gs);
      if (!matchCliente && !matchModelo && !matchTipo && !matchEstado && !matchVendedor && !matchVin && !matchMatricula) {
        return false;
      }
    }

    // 2. Filtros por columna
    if (filterCliente && !exp.cliente?.nombre?.toLowerCase().includes(filterCliente.toLowerCase()) && !exp.cliente?.dni?.toLowerCase().includes(filterCliente.toLowerCase())) return false;
    if (filterMarca) {
      if (filterMarca === "VO_NO_BRAND") {
        if (exp.modelo?.marca?.nombre) return false;
      } else {
        if (exp.modelo?.marca?.nombre !== filterMarca) return false;
      }
    }
    if (filterModelo) {
      const fMod = filterModelo.toLowerCase();
      const modelMatch = exp.modelo?.nombre_modelo?.toLowerCase().includes(fMod) || exp.vin?.toLowerCase().includes(fMod);
      if (!modelMatch) return false;
    }
    if (filterTipoVenta && !exp.tipoDeVenta?.nombre_tipo_venta?.toLowerCase().includes(filterTipoVenta.toLowerCase())) return false;
    if (filterEstadoVehiculo && !exp.estadoVehiculo?.nombre_estado_vehiculo?.toLowerCase().includes(filterEstadoVehiculo.toLowerCase())) return false;
    if (filterVendedor) {
      const sellerName = exp.usuario?.nombre?.toLowerCase().trim() || "";
      const filterName = filterVendedor.toLowerCase().trim();
      if (sellerName !== filterName) return false;
    }
    if (filterFExp && !formatDate(exp.fecha_expediente).toLowerCase().includes(filterFExp.toLowerCase())) return false;
    if (filterFAfect && !formatDate(exp.fecha_afectacion).toLowerCase().includes(filterFAfect.toLowerCase())) return false;
    if (filterFRci && !formatDate(exp.fecha_rci).toLowerCase().includes(filterFRci.toLowerCase())) return false;
    if (filterFMat && !formatDate(exp.fecha_matriculacion).toLowerCase().includes(filterFMat.toLowerCase()) && !(exp.matricula && exp.matricula.toLowerCase().includes(filterFMat.toLowerCase()))) return false;
    if (filterFEntrega && !formatDate(exp.fecha_entrega).toLowerCase().includes(filterFEntrega.toLowerCase())) return false;

    // 3. Filtrado avanzado por mes y año
    if (filterMes || filterAnio) {
      let targetDateStr: string | null = null;
      if (filterFechaTipo === "fecha_expediente") targetDateStr = exp.fecha_expediente;
      else if (filterFechaTipo === "fecha_afectacion") targetDateStr = exp.fecha_afectacion;
      else if (filterFechaTipo === "fecha_matriculacion") targetDateStr = exp.fecha_matriculacion;
      else if (filterFechaTipo === "fecha_entrega") targetDateStr = exp.fecha_entrega;
      else if (filterFechaTipo === "fecha_rci") targetDateStr = exp.fecha_rci;
      else if (filterFechaTipo === "fecha_facturacion") targetDateStr = exp.fecha_facturacion || null;
      else if (filterFechaTipo === "fecha_comisionado") targetDateStr = exp.cobrado_otra_fecha && exp.fecha_cobrado ? exp.fecha_cobrado : exp.fecha_matriculacion;

      if (!targetDateStr) return false;

      const dateParts = targetDateStr.split("-"); // [YYYY, MM, DD]
      if (dateParts.length >= 2) {
        const year = dateParts[0];
        const month = dateParts[1]; // "01", "02", etc.
        
        if (filterAnio && year !== filterAnio) return false;
        if (filterMes && month !== filterMes) return false;
      } else {
        return false;
      }
    }

    // 4. Filtrado por tienda
    if (filterTienda && exp.id_tienda !== Number(filterTienda)) return false;

    return true;
  });

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortOrder(prev => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortOrder("asc");
    }
    setCurrentPage(1);
  };

  const renderSortIndicator = (field: string) => {
    const symbol = sortField !== field ? "↕" : (sortOrder === "asc" ? "▲" : "▼");
    return <span style={{ marginLeft: "4px", fontSize: "0.75rem", display: "inline-block", opacity: sortField === field ? 1 : 0.6 }}>{symbol}</span>;
  };

  const sortedExpedientes = [...filteredExpedientes].sort((a, b) => {
    let valA: any = "";
    let valB: any = "";

    switch (sortField) {
      case "cliente":
        valA = a.cliente?.nombre || "";
        valB = b.cliente?.nombre || "";
        break;
      case "telefono":
        valA = a.cliente?.telefonos?.[0]?.telefono || "";
        valB = b.cliente?.telefonos?.[0]?.telefono || "";
        break;
      case "email":
        valA = a.cliente?.emails?.[0]?.email || "";
        valB = b.cliente?.emails?.[0]?.email || "";
        break;
      case "marca":
        valA = a.modelo?.marca?.nombre || "";
        valB = b.modelo?.marca?.nombre || "";
        break;
      case "modelo":
        valA = a.modelo?.nombre_modelo || "";
        valB = b.modelo?.nombre_modelo || "";
        break;
      case "tipo_venta":
        valA = a.tipoDeVenta?.nombre_tipo_venta || "";
        valB = b.tipoDeVenta?.nombre_tipo_venta || "";
        break;
      case "estado":
        valA = a.estadoVehiculo?.nombre_estado_vehiculo || "";
        valB = b.estadoVehiculo?.nombre_estado_vehiculo || "";
        break;
      case "vendedor":
        valA = a.usuario?.nombre || "";
        valB = b.usuario?.nombre || "";
        break;
      case "fecha_expediente":
        valA = a.fecha_expediente || "";
        valB = b.fecha_expediente || "";
        break;
      case "fecha_afectacion":
        valA = a.fecha_afectacion || "";
        valB = b.fecha_afectacion || "";
        break;
      case "fecha_rci":
        valA = a.fecha_rci || "";
        valB = b.fecha_rci || "";
        break;
      case "fecha_matriculacion":
        valA = a.fecha_matriculacion || "";
        valB = b.fecha_matriculacion || "";
        break;
      case "fecha_entrega":
        valA = a.fecha_entrega || "";
        valB = b.fecha_entrega || "";
        break;
      case "fecha_facturacion":
        valA = a.fecha_facturacion || "";
        valB = b.fecha_facturacion || "";
        break;
      default:
        valA = a.fecha_expediente || "";
        valB = b.fecha_expediente || "";
    }

    if (typeof valA === "string" && typeof valB === "string") {
      return sortOrder === "asc"
        ? valA.localeCompare(valB, undefined, { sensitivity: "base" })
        : valB.localeCompare(valA, undefined, { sensitivity: "base" });
    } else {
      return sortOrder === "asc"
        ? (valA > valB ? 1 : -1)
        : (valB > valA ? 1 : -1);
    }
  });

  // Guardar IDs visibles en localStorage para navegación en Editar
  useEffect(() => {
    if (typeof window !== "undefined") {
      const ids = sortedExpedientes.map(e => e.id_expediente);
      localStorage.setItem("visible_expediente_ids", JSON.stringify(ids));
    }
  }, [sortedExpedientes]);

  // Calcular paginación
  const totalFiltered = filteredExpedientes.length;
  const totalPages = Math.max(1, Math.ceil(totalFiltered / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedExpedientes = sortedExpedientes.slice((safePage - 1) * pageSize, safePage * pageSize);

  const handlePageSizeChange = (newSize: number) => {
    setPageSize(newSize);
    setCurrentPage(1);
  };

  const goToPage = (page: number) => {
    setCurrentPage(Math.max(1, Math.min(page, totalPages)));
  };

  // Componente de barra de paginación (reutilizable arriba y abajo)
  const PaginationBar = () => (
    <div style={{
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      flexWrap: "wrap",
      gap: "10px",
      padding: "10px 16px",
      background: "rgba(255, 255, 255, 0.02)",
      borderTop: "1px solid var(--border-light)",
      borderBottom: "1px solid var(--border-light)",
      fontSize: "0.85rem",
      color: "var(--text-secondary)"
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <span>Mostrar:</span>
        {[10, 20, 50, 100, 200].map(size => (
          <button
            key={size}
            type="button"
            onClick={() => handlePageSizeChange(size)}
            style={{
              padding: "3px 10px",
              fontSize: "0.8rem",
              border: `1px solid ${pageSize === size ? "var(--primary)" : "var(--border-light)"}`,
              borderRadius: "4px",
              background: pageSize === size ? "rgba(var(--primary-rgb), 0.12)" : "transparent",
              color: pageSize === size ? "var(--primary)" : "var(--text-secondary)",
              cursor: "pointer",
              fontWeight: pageSize === size ? 700 : 400
            }}
          >{size}</button>
        ))}
        <span style={{ marginLeft: "8px" }}>
          {totalFiltered} resultado(s)
          {totalFiltered !== expedientes.length ? ` (de ${expedientes.length} totales)` : ""}
        </span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
        <button type="button" onClick={() => goToPage(1)} disabled={safePage === 1}
          style={{ padding: "4px 8px", border: "1px solid var(--border-light)", borderRadius: "4px", background: "transparent", color: safePage === 1 ? "var(--text-muted)" : "var(--text-primary)", cursor: safePage === 1 ? "default" : "pointer", fontSize: "0.8rem" }}
          title="Primera página"
        >«</button>
        <button type="button" onClick={() => goToPage(safePage - 1)} disabled={safePage === 1}
          style={{ padding: "4px 8px", border: "1px solid var(--border-light)", borderRadius: "4px", background: "transparent", color: safePage === 1 ? "var(--text-muted)" : "var(--text-primary)", cursor: safePage === 1 ? "default" : "pointer", fontSize: "0.8rem" }}
          title="Página anterior"
        >‹</button>
        <span style={{ padding: "4px 12px", fontWeight: 600, color: "var(--text-primary)" }}>
          Pág. {safePage} / {totalPages}
        </span>
        <button type="button" onClick={() => goToPage(safePage + 1)} disabled={safePage === totalPages}
          style={{ padding: "4px 8px", border: "1px solid var(--border-light)", borderRadius: "4px", background: "transparent", color: safePage === totalPages ? "var(--text-muted)" : "var(--text-primary)", cursor: safePage === totalPages ? "default" : "pointer", fontSize: "0.8rem" }}
          title="Página siguiente"
        >›</button>
        <button type="button" onClick={() => goToPage(totalPages)} disabled={safePage === totalPages}
          style={{ padding: "4px 8px", border: "1px solid var(--border-light)", borderRadius: "4px", background: "transparent", color: safePage === totalPages ? "var(--text-muted)" : "var(--text-primary)", cursor: safePage === totalPages ? "default" : "pointer", fontSize: "0.8rem" }}
          title="Última página"
        >»</button>
      </div>
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      {/* NOTIFICACIONES FLOTANTES */}
      {error && (
        <div className="glass-panel" style={{
          position: "fixed",
          top: "20px",
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 10000,
          boxShadow: "var(--shadow-lg)",
          padding: "12px 24px",
          color: "#ffffff",
          borderLeft: "4px solid var(--danger)",
          background: "rgba(239, 68, 68, 0.95)",
          backdropFilter: "blur(8px)",
          minWidth: "300px",
          textAlign: "center",
          animation: "fadeIn 0.3s ease"
        }}>
          ⚠️ {error}
        </div>
      )}
      {success && (
        <div className="glass-panel" style={{
          position: "fixed",
          top: "20px",
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 10000,
          boxShadow: "var(--shadow-lg)",
          padding: "12px 24px",
          color: "#ffffff",
          borderLeft: "4px solid var(--success)",
          background: "rgba(16, 185, 129, 0.95)",
          backdropFilter: "blur(8px)",
          minWidth: "300px",
          textAlign: "center",
          animation: "fadeIn 0.3s ease"
        }}>
          ✓ {success}
        </div>
      )}

      {/* BUSCADOR GENERAL */}
      <div className="glass-panel" style={{ padding: "16px 20px", display: "flex", alignItems: "center", gap: "12px" }}>
        <span style={{ fontSize: "0.9rem", fontWeight: 600, color: "var(--text-secondary)" }}>🔎 Buscador Global:</span>
        <input
          type="text"
          className="form-input"
          placeholder="Busca por cliente, matrícula, DNI, vendedor, VIN..."
          value={globalSearch}
          onChange={e => setGlobalSearch(e.target.value)}
          style={{ flex: 1, padding: "8px 14px" }}
        />
        {globalSearch && (
          <button 
            type="button" 
            className="btn btn-secondary" 
            onClick={() => setGlobalSearch("")}
            style={{ padding: "8px 14px", fontSize: "0.85rem" }}
          >
            Limpiar
          </button>
        )}
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px", background: "rgba(255, 255, 255, 0.03)", padding: "12px 16px", borderRadius: "8px", border: "1px solid var(--border-light)" }}>
        <div style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
          <label style={{ 
            display: "inline-flex", 
            alignItems: "center", 
            gap: "8px", 
            fontSize: "0.85rem", 
            color: "var(--text-primary)", 
            cursor: "pointer", 
            background: "rgba(255, 255, 255, 0.05)", 
            border: "1px solid var(--border-light)", 
            padding: "8px 14px", 
            borderRadius: "var(--radius-sm)",
            fontWeight: 600,
            transition: "all 0.2s"
          }}>
            <input
              type="checkbox"
              checked={ocultarEntregados}
              onChange={e => setOcultarEntregados(e.target.checked)}
              style={{
                width: "15px",
                height: "15px",
                accentColor: "var(--primary)",
                cursor: "pointer"
              }}
            />
            <span>Ocultar Entregados</span>
          </label>

          <label style={{ 
            display: "inline-flex", 
            alignItems: "center", 
            gap: "8px", 
            fontSize: "0.85rem", 
            color: "var(--text-primary)", 
            cursor: "pointer", 
            background: showCobroStatus ? "rgba(var(--primary-rgb), 0.12)" : "rgba(255, 255, 255, 0.05)", 
            border: `1px solid ${showCobroStatus ? "var(--primary)" : "var(--border-light)"}`, 
            padding: "8px 14px", 
            borderRadius: "var(--radius-sm)",
            fontWeight: 600,
            transition: "all 0.2s"
          }}>
            <input
              type="checkbox"
              checked={showCobroStatus}
              onChange={e => {
                const newValue = e.target.checked;
                setShowCobroStatus(newValue);
                localStorage.setItem("exp-show-cobro-status", String(newValue));
              }}
              style={{
                width: "15px",
                height: "15px",
                accentColor: "var(--primary)",
                cursor: "pointer"
              }}
            />
            <span>👁️ Mostrar Cobros</span>
          </label>

          <button
            type="button"
            className="btn"
            onClick={() => {
              setBulkSelectionUnlocked(!bulkSelectionUnlocked);
              if (bulkSelectionUnlocked) setSelectedIds([]);
            }}
            style={{
              padding: "8px 14px",
              fontSize: "0.85rem",
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              backgroundColor: bulkSelectionUnlocked ? "var(--warning)" : "rgba(255,255,255,0.05)",
              color: bulkSelectionUnlocked ? "black" : "var(--text-primary)",
              border: "1px solid var(--border-light)",
              borderRadius: "var(--radius-sm)",
              fontWeight: 600
            }}
            title={bulkSelectionUnlocked ? "Bloquear Selección Masiva" : "Desbloquear Selección Masiva"}
          >
            {bulkSelectionUnlocked ? "🔓 Selección Activa" : "🔒 Selección Inactiva"}
          </button>

          <button
            type="button"
            className="btn"
            onClick={() => setDeleteUnlocked(!deleteUnlocked)}
            style={{
              padding: "8px 14px",
              fontSize: "0.85rem",
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              backgroundColor: deleteUnlocked ? "var(--danger)" : "rgba(255,255,255,0.05)",
              color: deleteUnlocked ? "white" : "var(--text-primary)",
              border: "1px solid var(--border-light)",
              borderRadius: "var(--radius-sm)",
              fontWeight: 600
            }}
            title={deleteUnlocked ? "Bloquear Eliminación" : "Desbloquear Eliminación"}
          >
            {deleteUnlocked ? "🔓 Eliminación Activa" : "🔒 Eliminación Inactiva"}
          </button>

          {/* BOTÓN VISIBILIDAD DE COLUMNAS */}
          <div style={{ position: "relative", display: "inline-block" }}>
            <button
              type="button"
              className="btn"
              onClick={() => setShowColumnSelector(!showColumnSelector)}
              style={{
                padding: "8px 14px",
                fontSize: "0.85rem",
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                backgroundColor: showColumnSelector ? "var(--primary)" : "rgba(255,255,255,0.05)",
                color: showColumnSelector ? "white" : "var(--text-primary)",
                border: "1px solid var(--border-light)",
                borderRadius: "var(--radius-sm)",
                fontWeight: 600
              }}
              title="Ocultar o mostrar columnas de la tabla"
            >
              ⚙️ Columnas
            </button>

            {showColumnSelector && (
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
                  backdropFilter: "blur(12px)"
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px", paddingBottom: "6px", borderBottom: "1px solid var(--border-light)" }}>
                  <span style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--text-primary)" }}>Visibilidad Columnas</span>
                  <button
                    type="button"
                    onClick={() => setShowColumnSelector(false)}
                    style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: "0.9rem" }}
                  >
                    ✕
                  </button>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "8px", maxHeight: "280px", overflowY: "auto" }}>
                  {[
                    { key: "cliente", label: "Cliente" },
                    { key: "telefono", label: "Teléfono" },
                    { key: "email", label: "Email" },
                    { key: "marca", label: "Marca" },
                    { key: "modelo", label: "Modelo" },
                    { key: "tipo_venta", label: "T. Venta" },
                    { key: "estado", label: "Estado" },
                    { key: "vendedor", label: "Vendedor" },
                    { key: "fecha_expediente", label: "F. Exp." },
                    { key: "fecha_afectacion", label: "F. Afect" },
                    { key: "fecha_rci", label: "F. RCI" },
                    { key: "fecha_matriculacion", label: "F. Mat" },
                    { key: "fecha_facturacion", label: "F. FAC." },
                    { key: "fecha_entrega", label: "F. Entrega" },
                    ...(showCobroStatus ? [{ key: "cobro", label: "Cobro" }] : [])
                  ].map(col => (
                    <label key={col.key} style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.82rem", cursor: "pointer", color: "var(--text-primary)", userSelect: "none" }}>
                      <input
                        type="checkbox"
                        checked={visibleColumns[col.key] !== false}
                        onChange={e => {
                          const next = { ...visibleColumns, [col.key]: e.target.checked };
                          setVisibleColumns(next);
                          localStorage.setItem("exp-visible-columns", JSON.stringify(next));
                        }}
                        style={{ width: "15px", height: "15px", accentColor: "var(--primary)", cursor: "pointer" }}
                      />
                      {col.label}
                    </label>
                  ))}
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: "10px", paddingTop: "8px", borderTop: "1px solid var(--border-light)" }}>
                  <button
                    type="button"
                    onClick={() => {
                      const allTrue: any = {};
                      ["cliente", "telefono", "email", "marca", "modelo", "tipo_venta", "estado", "vendedor", "fecha_expediente", "fecha_afectacion", "fecha_rci", "fecha_matriculacion", "fecha_facturacion", "fecha_entrega", "cobro"].forEach(k => allTrue[k] = true);
                      setVisibleColumns(allTrue);
                      localStorage.setItem("exp-visible-columns", JSON.stringify(allTrue));
                    }}
                    style={{ background: "none", border: "none", color: "var(--primary)", fontSize: "0.75rem", cursor: "pointer", fontWeight: 600 }}
                  >
                    Mostrar Todas
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const minCols: any = {};
                      ["cliente", "telefono", "email", "marca", "modelo", "tipo_venta", "estado", "vendedor", "fecha_expediente", "fecha_afectacion", "fecha_rci", "fecha_matriculacion", "fecha_facturacion", "fecha_entrega", "cobro"].forEach(k => minCols[k] = k === "cliente" || k === "vendedor");
                      setVisibleColumns(minCols);
                      localStorage.setItem("exp-visible-columns", JSON.stringify(minCols));
                    }}
                    style={{ background: "none", border: "none", color: "var(--text-muted)", fontSize: "0.75rem", cursor: "pointer" }}
                  >
                    Mínimas
                  </button>
                </div>
              </div>
            )}
          </div>

          {bulkSelectionUnlocked && selectedIds.length > 0 && (
            <>
              <span style={{ fontSize: "0.9rem", fontWeight: 600, color: "var(--primary)" }}>
                ({selectedIds.length} seleccionados):
              </span>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  if (deleteUnlocked) setConfirmBulkDelete(true);
                }}
                disabled={!deleteUnlocked}
                style={{ 
                  padding: "6px 12px", 
                  fontSize: "0.8rem", 
                  backgroundColor: deleteUnlocked ? "var(--danger)" : "rgba(255,255,255,0.02)", 
                  color: deleteUnlocked ? "white" : "var(--text-muted)", 
                  border: deleteUnlocked ? "none" : "1px solid var(--border-light)", 
                  cursor: deleteUnlocked ? "pointer" : "not-allowed", 
                  borderRadius: "var(--radius-sm)", 
                  fontWeight: "600",
                  opacity: deleteUnlocked ? 1 : 0.5 
                }}
              >
                🗑️ Eliminar Seleccionados
              </button>
               <button
                type="button"
                className="btn btn-secondary"
                onClick={() => handleExportCSV(true)}
                style={{ padding: "6px 12px", fontSize: "0.8rem" }}
              >
                📤 Exportar Seleccionados (CSV)
              </button>
              <button
                type="button"
                onClick={() => setShowBulkEditModal(true)}
                style={{ 
                  padding: "6px 12px", 
                  fontSize: "0.8rem", 
                  backgroundColor: "#2e7d32", 
                  color: "white", 
                  border: "none", 
                  borderRadius: "var(--radius-sm)", 
                  fontWeight: "600",
                  cursor: "pointer"
                }}
              >
                ✏️ Editar
              </button>
            </>
          )}
        </div>

        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          <label className="btn btn-secondary" style={{ padding: "8px 14px", fontSize: "0.85rem", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "6px", backgroundColor: "rgba(16, 185, 129, 0.08)", border: "1px solid rgba(16, 185, 129, 0.2)", color: "var(--success)" }}>
            🟢 Importar Datos Excel
            <input
              type="file"
              accept=".xlsx, .xls"
              onChange={handleImportExcel}
              style={{ display: "none" }}
              disabled={importingExcel || loading}
            />
          </label>

          {mostrarBotonesCSV && (
            <>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => handleExportCSV(false)}
                style={{ padding: "8px 14px", fontSize: "0.85rem" }}
              >
                📤 Exportar Todo (CSV)
              </button>
              
              <label className="btn btn-primary" style={{ padding: "8px 14px", fontSize: "0.85rem", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "6px" }}>
                📥 Importar CSV
                <input
                  type="file"
                  accept=".csv"
                  onChange={handleImportCSV}
                  style={{ display: "none" }}
                  disabled={loading}
                />
              </label>
            </>
          )}

          {userRole === "administrador" && (
            <>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleExportBackupJSON}
                style={{ 
                  padding: "8px 14px", 
                  fontSize: "0.85rem", 
                  backgroundColor: "rgba(124, 58, 237, 0.08)", 
                  border: "1px solid rgba(124, 58, 237, 0.2)", 
                  color: "var(--primary)",
                  fontWeight: 500
                }}
                disabled={loading}
              >
                💾 Exportar Backup (JSON)
              </button>
              
              <label 
                className="btn" 
                style={{ 
                  padding: "8px 14px", 
                  fontSize: "0.85rem", 
                  cursor: "pointer", 
                  display: "inline-flex", 
                  alignItems: "center", 
                  gap: "6px",
                  backgroundColor: "rgba(16, 185, 129, 0.08)", 
                  border: "1px solid rgba(16, 185, 129, 0.2)", 
                  color: "var(--success)",
                  fontWeight: 500
                }}
              >
                🔄 Restaurar Backup (JSON)
                <input
                  type="file"
                  accept=".json"
                  onChange={handleImportBackupJSON}
                  style={{ display: "none" }}
                  disabled={loading}
                />
              </label>
            </>
          )}
        </div>
      </div>

      {/* CAJA DE FILTRADO AVANZADO */}
      <div className="glass-panel" style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px" }}>
          <h4 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 600, color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "8px" }}>
            <span>🔍 Filtrado y Búsqueda Avanzada</span>
          </h4>
          <button 
            type="button" 
            className="btn btn-secondary" 
            onClick={handleClearFilters}
            style={{ padding: "6px 12px", fontSize: "0.8rem", color: "var(--danger)", borderColor: "rgba(239, 68, 68, 0.2)" }}
          >
            🧹 Limpiar Filtros
          </button>
        </div>

        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: "16px"
        }}>
          {/* Filtro por fecha */}
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label" style={{ fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.5px" }}>Campo de Fecha</label>
            <select 
              className="form-input" 
              value={filterFechaTipo} 
              onChange={e => { 
                const val = e.target.value;
                setFilterFechaTipo(val); 
                if (val === "fecha_comisionado") {
                  if (!filterMes) {
                    setFilterMes(String(statsMonth).padStart(2, "0"));
                  } else {
                    setStatsMonth(parseInt(filterMes, 10));
                  }
                  if (!filterAnio) {
                    setFilterAnio(String(statsYear));
                  } else {
                    setStatsYear(parseInt(filterAnio, 10));
                  }
                }
                setCurrentPage(1); 
              }}
              style={{ padding: "8px" }}
            >
              <option value="fecha_expediente">Fecha Expediente</option>
              <option value="fecha_afectacion">Fecha Afectación</option>
              <option value="fecha_matriculacion">Fecha Matriculación</option>
              <option value="fecha_entrega">Fecha Entrega</option>
              <option value="fecha_rci">Fecha RCI</option>
              <option value="fecha_comisionado">Fecha Comisionado</option>
            </select>
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label" style={{ fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.5px" }}>Mes</label>
            <select 
              className="form-input" 
              value={filterMes} 
              onChange={e => { 
                const val = e.target.value;
                setFilterMes(val); 
                if (filterFechaTipo === "fecha_comisionado" && val) {
                  setStatsMonth(parseInt(val, 10));
                }
                setCurrentPage(1); 
              }}
              style={{ padding: "8px" }}
            >
              <option value="">Todos los meses</option>
              <option value="01">Enero</option>
              <option value="02">Febrero</option>
              <option value="03">Marzo</option>
              <option value="04">Abril</option>
              <option value="05">Mayo</option>
              <option value="06">Junio</option>
              <option value="07">Julio</option>
              <option value="08">Agosto</option>
              <option value="09">Septiembre</option>
              <option value="10">Octubre</option>
              <option value="11">Noviembre</option>
              <option value="12">Diciembre</option>
            </select>
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label" style={{ fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.5px" }}>Año</label>
            <select 
              className="form-input" 
              value={filterAnio} 
              onChange={e => { 
                const val = e.target.value;
                setFilterAnio(val); 
                if (filterFechaTipo === "fecha_comisionado" && val) {
                  setStatsYear(parseInt(val, 10));
                }
                setCurrentPage(1); 
              }}
              style={{ padding: "8px" }}
            >
              <option value="">Todos los años</option>
              {uniqueYears.map(year => (
                <option key={year} value={year}>{year}</option>
              ))}
            </select>
          </div>

          {/* Filtro por Marca */}
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label" style={{ fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.5px" }}>Marca</label>
            <select 
              className="form-input" 
              value={filterMarca} 
              onChange={e => { setFilterMarca(e.target.value); setFilterModelo(""); setCurrentPage(1); }}
              style={{ padding: "8px" }}
            >
              <option value="">Todas las marcas</option>
              <option value="VO_NO_BRAND">Sin Marca (VO)</option>
              {uniqueBrands.map(brand => (
                <option key={brand} value={brand}>{brand}</option>
              ))}
            </select>
          </div>

          {/* Filtro por Modelo */}
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label" style={{ fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.5px" }}>Modelo</label>
            <select 
              className="form-input" 
              value={filterModelo} 
              onChange={e => { setFilterModelo(e.target.value); setCurrentPage(1); }}
              style={{ padding: "8px" }}
              disabled={filterMarca === "VO_NO_BRAND"}
            >
              <option value="">Todos los modelos</option>
              {uniqueModelsFiltered.map(model => (
                <option key={model} value={model}>{model}</option>
              ))}
            </select>
          </div>

          {/* Filtro por Tienda */}
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label" style={{ fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.5px" }}>Tienda</label>
            <select 
              className="form-input" 
              value={filterTienda} 
              onChange={e => { setFilterTienda(e.target.value); setCurrentPage(1); }}
              style={{ padding: "8px" }}
            >
              <option value="">Todas las tiendas</option>
              {tiendas.map(t => (
                <option key={t.id_tienda} value={t.id_tienda}>{t.nombre}</option>
              ))}
            </select>
          </div>

          {/* Filtro por Comercial */}
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label" style={{ fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.5px" }}>Comercial</label>
            <select 
              className="form-input" 
              value={filterVendedor} 
              onChange={e => { setFilterVendedor(e.target.value); setCurrentPage(1); }}
              style={{ padding: "8px" }}
            >
              <option value="">Todos los comerciales</option>
              {uniqueVendedores.map(v => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>
          </div>

          {/* Filtro por Tipo de Venta */}
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label" style={{ fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.5px" }}>Tipo Venta</label>
            <select 
              className="form-input" 
              value={filterTipoVenta} 
              onChange={e => { setFilterTipoVenta(e.target.value); setCurrentPage(1); }}
              style={{ padding: "8px" }}
            >
              <option value="">Todos los tipos</option>
              {uniqueTiposVenta.map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          {/* Filtro por Estado Vehículo */}
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label" style={{ fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.5px" }}>Estado Vehículo</label>
            <select 
              className="form-input" 
              value={filterEstadoVehiculo} 
              onChange={e => { setFilterEstadoVehiculo(e.target.value); setCurrentPage(1); }}
              style={{ padding: "8px" }}
            >
              <option value="">Todos los estados</option>
              {uniqueEstados.map(est => (
                <option key={est} value={est}>{est}</option>
              ))}
            </select>
          </div>
        </div>
        <div style={{
          marginTop: "16px",
          display: "flex",
          alignItems: "center",
          gap: "16px",
          flexWrap: "wrap"
        }}>
          {/* CAJA COMISIONADO */}
          <div style={{
            padding: "10px 14px",
            border: "1px solid rgba(255, 255, 255, 0.08)",
            borderRadius: "8px",
            background: "rgba(255, 255, 255, 0.02)",
            display: "flex",
            alignItems: "center",
            gap: "12px",
            width: "fit-content"
          }}>
            <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--primary-light, #60a5fa)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
              Comisionado:
            </span>
            <div style={{ display: "flex", gap: "6px" }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleComisionadoPrevMonth}
                style={{ padding: "6px 12px", fontSize: "0.85rem", fontWeight: 600 }}
                title="Mes Anterior (-1)"
              >
                ←
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleComisionadoActualMonth}
                style={{ padding: "6px 12px", fontSize: "0.85rem", fontWeight: 600 }}
                title="Mes Actual -1"
              >
                Actual
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleComisionadoNextMonth}
                style={{ padding: "6px 12px", fontSize: "0.85rem", fontWeight: 600 }}
                title="Mes Siguiente (+1)"
              >
                →
              </button>
            </div>
          </div>

          {/* CAJA AFECTACIÓN */}
          <div style={{
            padding: "10px 14px",
            border: "1px solid rgba(255, 255, 255, 0.08)",
            borderRadius: "8px",
            background: "rgba(255, 255, 255, 0.02)",
            display: "flex",
            alignItems: "center",
            gap: "12px",
            width: "fit-content"
          }}>
            <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--primary-light, #60a5fa)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
              Afectación:
            </span>
            <div style={{ display: "flex", gap: "6px" }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleAfectacionPrevMonth}
                style={{ padding: "6px 12px", fontSize: "0.85rem", fontWeight: 600 }}
                title="Mes Anterior (-1)"
              >
                ←
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleAfectacionActualMonth}
                style={{ padding: "6px 12px", fontSize: "0.85rem", fontWeight: 600 }}
                title="Mes Actual Real"
              >
                Actual
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleAfectacionNextMonth}
                style={{ padding: "6px 12px", fontSize: "0.85rem", fontWeight: 600 }}
                title="Mes Siguiente (+1)"
              >
                →
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* TABLA DE EXPEDIENTES */}
      <div className="glass-panel" style={{ padding: "8px" }}>
        {/* PAGINACIÓN SUPERIOR */}
        <PaginationBar />

        <div className="table-container">
          {(() => {
            const activeVisibleKeys = [
              "cliente", "telefono", "email", "marca", "modelo", "tipo_venta", "estado", "vendedor", 
              "fecha_expediente", "fecha_afectacion", "fecha_rci", "fecha_matriculacion", "fecha_facturacion", "fecha_entrega"
            ];
            if (showCobroStatus) activeVisibleKeys.push("cobro");
            const visibleColumnCount = activeVisibleKeys.filter(k => visibleColumns[k] !== false).length;
            const totalTableColSpan = visibleColumnCount + (bulkSelectionUnlocked ? 1 : 0) + 1;

            return (
              <table className="table-premium table-compact">
                <thead>
                  <tr>
                    {bulkSelectionUnlocked && (
                      <th style={{ width: "40px", textAlign: "center" }}>
                        <input
                          type="checkbox"
                          checked={filteredExpedientes.length > 0 && selectedIds.length === filteredExpedientes.length}
                          onChange={e => handleSelectAll(e.target.checked)}
                          style={{ width: "16px", height: "16px", cursor: "pointer" }}
                        />
                      </th>
                    )}
                    {visibleColumns.cliente !== false && (
                      <th onClick={() => handleSort("cliente")} style={{ cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" }}>
                        Cliente{renderSortIndicator("cliente")}
                      </th>
                    )}
                    {visibleColumns.telefono !== false && (
                      <th onClick={() => handleSort("telefono")} style={{ cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" }}>
                        Teléfono{renderSortIndicator("telefono")}
                      </th>
                    )}
                    {visibleColumns.email !== false && (
                      <th onClick={() => handleSort("email")} style={{ cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" }}>
                        Email{renderSortIndicator("email")}
                      </th>
                    )}
                    {visibleColumns.marca !== false && (
                      <th onClick={() => handleSort("marca")} style={{ cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" }}>
                        Marca{renderSortIndicator("marca")}
                      </th>
                    )}
                    {visibleColumns.modelo !== false && (
                      <th onClick={() => handleSort("modelo")} style={{ cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" }}>
                        Modelo{renderSortIndicator("modelo")}
                      </th>
                    )}
                    {visibleColumns.tipo_venta !== false && (
                      <th onClick={() => handleSort("tipo_venta")} style={{ cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" }}>
                        T. Venta{renderSortIndicator("tipo_venta")}
                      </th>
                    )}
                    {visibleColumns.estado !== false && (
                      <th onClick={() => handleSort("estado")} style={{ cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" }}>
                        Estado{renderSortIndicator("estado")}
                      </th>
                    )}
                    {visibleColumns.vendedor !== false && (
                      <th onClick={() => handleSort("vendedor")} style={{ cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" }}>
                        Vendedor{renderSortIndicator("vendedor")}
                      </th>
                    )}
                    {visibleColumns.fecha_expediente !== false && (
                      <th onClick={() => handleSort("fecha_expediente")} style={{ textAlign: "center", backgroundColor: "rgba(128, 128, 128, 0.03)", cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" }}>
                        F. Exp.{renderSortIndicator("fecha_expediente")}
                      </th>
                    )}
                    {visibleColumns.fecha_afectacion !== false && (
                      <th onClick={() => handleSort("fecha_afectacion")} style={{ textAlign: "center", backgroundColor: "rgba(128, 128, 128, 0.09)", cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" }}>
                        F. Afect{renderSortIndicator("fecha_afectacion")}
                      </th>
                    )}
                    {visibleColumns.fecha_rci !== false && (
                      <th onClick={() => handleSort("fecha_rci")} style={{ textAlign: "center", backgroundColor: "rgba(128, 128, 128, 0.03)", cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" }}>
                        F. RCI{renderSortIndicator("fecha_rci")}
                      </th>
                    )}
                    {visibleColumns.fecha_matriculacion !== false && (
                      <th onClick={() => handleSort("fecha_matriculacion")} style={{ textAlign: "center", backgroundColor: "rgba(128, 128, 128, 0.09)", cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" }}>
                        F. Mat{renderSortIndicator("fecha_matriculacion")}
                      </th>
                    )}
                    {visibleColumns.fecha_facturacion !== false && (
                      <th onClick={() => handleSort("fecha_facturacion")} style={{ textAlign: "center", backgroundColor: "rgba(128, 128, 128, 0.03)", cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" }}>
                        F. FAC.{renderSortIndicator("fecha_facturacion")}
                      </th>
                    )}
                    {visibleColumns.fecha_entrega !== false && (
                      <th onClick={() => handleSort("fecha_entrega")} style={{ textAlign: "center", backgroundColor: "rgba(128, 128, 128, 0.09)", cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" }}>
                        F. Entrega{renderSortIndicator("fecha_entrega")}
                      </th>
                    )}
                    {showCobroStatus && visibleColumns.cobro !== false && (
                      <th style={{ textAlign: "center", backgroundColor: "rgba(128, 128, 128, 0.06)", userSelect: "none", whiteSpace: "nowrap" }}>
                        Cobro
                      </th>
                    )}
                    <th style={{ whiteSpace: "nowrap", textAlign: "center" }}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedExpedientes.map((exp) => (
                    <tr 
                      key={exp.id_expediente} 
                      onClick={(e) => {
                        if (!bulkSelectionUnlocked) return;
                        const target = e.target as HTMLElement;
                        const isInteractive = target.closest("button, a, input, select, textarea, [role='button']");
                        if (isInteractive) return;
                        const isSelected = selectedIds.includes(exp.id_expediente);
                        handleSelectOne(exp.id_expediente, !isSelected);
                      }}
                      style={{ 
                        background: selectedIds.includes(exp.id_expediente) ? "rgba(var(--primary-rgb), 0.04)" : undefined,
                        cursor: bulkSelectionUnlocked ? "pointer" : "default"
                      }}
                    >
                      {bulkSelectionUnlocked && (
                        <td style={{ textAlign: "center" }}>
                          <input
                            type="checkbox"
                            checked={selectedIds.includes(exp.id_expediente)}
                            onChange={e => handleSelectOne(exp.id_expediente, e.target.checked)}
                            style={{ width: "16px", height: "16px", cursor: "pointer" }}
                          />
                        </td>
                      )}
                      {visibleColumns.cliente !== false && (
                        <td style={{ fontWeight: 600, color: "var(--text-primary)", whiteSpace: "nowrap" }}>
                          {exp.cliente?.nombre ? (
                            exp.cliente.nombre
                          ) : (
                            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                              <span style={{ color: "var(--text-muted)", fontStyle: "italic" }}>Sin Cliente</span>
                              <button
                                type="button"
                                title="Asignar Cliente"
                                onClick={() => {
                                  setAssigningClientExpId(exp.id_expediente);
                                  setClientSearchQuery("");
                                  setClientSearchResults([]);
                                }}
                                style={{
                                  background: "none",
                                  border: "none",
                                  cursor: "pointer",
                                  padding: "2px 6px",
                                  fontSize: "0.85rem",
                                  display: "inline-flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  color: "var(--primary)",
                                  borderRadius: "4px",
                                  transition: "all 0.2s"
                                }}
                                className="glass-panel-interactive"
                              >
                                🔍
                              </button>
                            </div>
                          )}
                        </td>
                      )}
                      {visibleColumns.telefono !== false && (
                        <td style={{ userSelect: "text", whiteSpace: "nowrap" }}>
                          {exp.cliente?.telefonos && exp.cliente.telefonos.length > 0 ? (
                            exp.cliente.telefonos[0].telefono
                          ) : (
                            <span style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>N/D</span>
                          )}
                        </td>
                      )}
                      {visibleColumns.email !== false && (
                        <td style={{ userSelect: "text", whiteSpace: "nowrap" }}>
                          {exp.cliente?.emails && exp.cliente.emails.length > 0 ? (
                            exp.cliente.emails[0].email
                          ) : (
                            <span style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>N/D</span>
                          )}
                        </td>
                      )}
                      {visibleColumns.marca !== false && (
                        <td>
                          {exp.modelo?.marca?.nombre || (
                            <span style={{ fontStyle: "italic", color: "var(--text-muted)" }}>VO (Sin marca)</span>
                          )}
                        </td>
                      )}
                      {visibleColumns.modelo !== false && (
                        <td>
                          {exp.modelo ? (
                            <div style={{ fontWeight: 500, color: "var(--text-primary)" }}>
                              {exp.modelo.nombre_modelo}
                            </div>
                          ) : (
                            <span style={{ fontStyle: "italic", color: "var(--text-muted)" }}>VO (Sin modelo)</span>
                          )}
                          {exp.vin && <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", fontFamily: "monospace", marginTop: "1px" }}>VIN: {exp.vin}</div>}
                        </td>
                      )}
                      {visibleColumns.tipo_venta !== false && (
                        <td>
                          {exp.tipoDeVenta ? (
                            <span className="badge" style={{
                              fontSize: "0.7rem",
                              padding: "3px 8px",
                              backgroundColor: exp.tipoDeVenta.color || "#3b82f6",
                              color: "#fff"
                            }}>
                              {exp.tipoDeVenta.nombre_tipo_venta}
                            </span>
                          ) : (
                            <span style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>N/D</span>
                          )}
                        </td>
                      )}
                      {visibleColumns.estado !== false && (
                        <td>
                          {exp.estadoVehiculo ? (
                            <span className={`badge badge-${exp.estadoVehiculo.nombre_estado_vehiculo?.toLowerCase() === 'nuevo' ? 'tienda' : 'vendedor'}`} style={{ fontSize: "0.7rem", padding: "3px 8px" }}>
                              {exp.estadoVehiculo.nombre_estado_vehiculo}
                            </span>
                          ) : (
                            <span style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>N/D</span>
                          )}
                        </td>
                      )}
                      {visibleColumns.vendedor !== false && (
                        <td>
                          <div style={{ fontSize: "0.9rem", fontWeight: 500 }}>{exp.usuario?.nombre || "N/D"}</div>
                        </td>
                      )}
                      {visibleColumns.fecha_expediente !== false && (
                        <td style={{ textAlign: "center", backgroundColor: "rgba(128, 128, 128, 0.03)" }}>
                          <span style={{ fontSize: "0.85rem" }}>{formatDate(exp.fecha_expediente)}</span>
                        </td>
                      )}
                      {visibleColumns.fecha_afectacion !== false && renderDateField(exp, "fecha_afectacion", "Afectación", "rgba(128, 128, 128, 0.09)")}
                      {visibleColumns.fecha_rci !== false && renderDateField(exp, "fecha_rci", "RCI", "rgba(128, 128, 128, 0.03)")}
                      {visibleColumns.fecha_matriculacion !== false && renderDateField(exp, "fecha_matriculacion", "Matriculación", "rgba(128, 128, 128, 0.09)")}
                      {visibleColumns.fecha_facturacion !== false && renderDateField(exp, "fecha_facturacion", "Facturación", "rgba(128, 128, 128, 0.03)")}
                      {visibleColumns.fecha_entrega !== false && renderDateField(exp, "fecha_entrega", "Entrega", "rgba(128, 128, 128, 0.09)")}
                      {showCobroStatus && visibleColumns.cobro !== false && (
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
                            style={{
                              width: "28px",
                              height: "28px",
                              display: "inline-flex",
                              alignItems: "center",
                              justifyContent: "center",
                              backgroundColor: "#f59e0b",
                              color: "#000",
                              borderRadius: "var(--radius-sm)",
                              fontSize: "0.85rem",
                              textDecoration: "none",
                              border: "none",
                              boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                              cursor: "pointer",
                              transition: "transform 0.15s ease, opacity 0.15s ease"
                            }}
                          >
                            ✏️
                          </Link>
                          <button
                            type="button"
                            onClick={() => {
                              if (deleteUnlocked) setConfirmDeleteExpediente(exp);
                            }}
                            title={deleteUnlocked ? "Eliminar expediente" : "Desbloquea la eliminación primero"}
                            style={{
                              width: "28px",
                              height: "28px",
                              display: "inline-flex",
                              alignItems: "center",
                              justifyContent: "center",
                              backgroundColor: deleteUnlocked ? "#ef4444" : "rgba(239, 68, 68, 0.2)",
                              color: "#ffffff",
                              border: "none",
                              borderRadius: "var(--radius-sm)",
                              fontSize: "0.85rem",
                              cursor: deleteUnlocked ? "pointer" : "not-allowed",
                              opacity: deleteUnlocked ? 1 : 0.4,
                              boxShadow: deleteUnlocked ? "0 1px 3px rgba(0,0,0,0.2)" : "none",
                              transition: "transform 0.15s ease, opacity 0.15s ease"
                            }}
                            disabled={!deleteUnlocked}
                          >
                            🗑️
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {paginatedExpedientes.length === 0 && (
                    <tr>
                      <td colSpan={totalTableColSpan} style={{ textAlign: "center", color: "var(--text-muted)", padding: "40px" }}>
                    {expedientes.length === 0
                      ? "No hay expedientes registrados en el sistema."
                      : "No se encontraron expedientes con los filtros aplicados."
                    }
                  </td>
                </tr>
              )}
            </tbody>
          </table>
            );
          })()}
        </div>

        {/* PAGINACIÓN INFERIOR */}
        <PaginationBar />

      </div>

      {/* SECCIÓN DE RESUMEN MENSUAL Y ESTADÍSTICAS */}
      <div className="glass-panel" style={{ padding: "24px", display: "flex", flexDirection: "column", gap: "20px", marginTop: "10px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "15px" }}>
          <div>
            <h4 style={{ fontSize: "1.1rem", fontWeight: "bold", margin: 0 }}>📊 Detalle y Resumen Estadístico</h4>
            <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem", margin: "4px 0 0 0" }}>Estadísticas de ventas para el período seleccionado.</p>
          </div>
          <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "nowrap" }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleSetPreviousMonth}
              style={{ padding: "6px 12px", fontSize: "0.8rem", whiteSpace: "nowrap" }}
            >
              ⬅ Mes Anterior
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleSetCurrentMonth}
              style={{ padding: "6px 12px", fontSize: "0.8rem", whiteSpace: "nowrap" }}
            >
              Mes Actual
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleSetNextMonth}
              style={{ padding: "6px 12px", fontSize: "0.8rem", whiteSpace: "nowrap" }}
            >
              Mes Siguiente ➡
            </button>
            <select
              className="form-select"
              value={statsMonth}
              onChange={e => {
                const val = Number(e.target.value);
                setStatsMonth(val);
                if (filterFechaTipo === "fecha_comisionado") {
                  setFilterMes(String(val).padStart(2, "0"));
                }
              }}
              style={{ padding: "6px 12px", fontSize: "0.85rem", minWidth: "120px" }}
            >
              {months.map(m => (
                <option key={m.value} value={m.value}>{m.name}</option>
              ))}
            </select>
            <select
              className="form-select"
              value={statsYear}
              onChange={e => {
                const val = Number(e.target.value);
                setStatsYear(val);
                if (filterFechaTipo === "fecha_comisionado") {
                  setFilterAnio(String(val));
                }
              }}
              style={{ padding: "6px 12px", fontSize: "0.85rem", minWidth: "90px" }}
            >
              {years.map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
        </div>

        {/* NUEVA MAQUETACIÓN: RESUMEN Y TRAMOS DE COMISIÓN */}
        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          {/* Fila de Tarjetas Clásicas */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "15px" }}>
            <div className="glass-panel-interactive" style={{ padding: "16px", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
              <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)", fontWeight: 600 }}>AFECTADOS EN EL MES</span>
              <h3 style={{ fontSize: "1.85rem", margin: "8px 0", color: "var(--primary)", fontWeight: "bold" }}>{stats.afectados}</h3>
              <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>Total de afectaciones en el mes</span>
            </div>

            <div className="glass-panel-interactive" style={{ padding: "16px", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
              <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)", fontWeight: 600 }}>MATRICULADOS EN EL MES</span>
              <h3 style={{ fontSize: "1.85rem", margin: "8px 0", color: "var(--success)", fontWeight: "bold" }}>{stats.matriculados}</h3>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                <span>Cont/Créd/Pref:</span>
                <strong>{stats.matriculadosContado}/{stats.matriculadosCreditoMat}/{stats.matriculadosPreferenceMat}</strong>
              </div>
            </div>

            <div className="glass-panel-interactive" style={{ padding: "16px", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
              <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)", fontWeight: 600 }}>TASA INT. FINANCIERA</span>
              <h3 style={{ fontSize: "1.85rem", margin: "8px 0", color: "var(--secondary)", fontWeight: "bold" }}>
                {stats.matriculadosVN > 0 ? `${((stats.matriculadosVNFinanciados / stats.matriculadosVN) * 100).toFixed(1)}%` : "0.0%"}
              </h3>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                <span>VN Finan/Total:</span>
                <strong>{stats.matriculadosVNFinanciados}/{stats.matriculadosVN}</strong>
              </div>
            </div>

            <div className="glass-panel-interactive" style={{ padding: "16px", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
              <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)", fontWeight: 600 }}>PEDIDOS EN EL MES</span>
              <h3 style={{ fontSize: "1.85rem", margin: "8px 0", color: "var(--warning)", fontWeight: "bold" }}>{stats.pedidos}</h3>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                <span>Cont/Créd/Pref:</span>
                <strong>{stats.pedidosContado}/{stats.pedidosCredito}/{stats.pedidosPreference}</strong>
              </div>
            </div>
          </div>

          {/* Información del Plan y Tramos */}
          {activePlan ? (() => {
            const X = activePlan.objetivo_base + activePlan.arrastre;
            const diff = stats.objetivoComputado - X;
            let tramo = "X-4";
            if (diff >= 3) tramo = "X+3";
            else if (diff === 2) tramo = "X+2";
            else if (diff === 1) tramo = "X+1";
            else if (diff === 0) tramo = "X";
            else if (diff === -1) tramo = "X-1";
            else if (diff === -2) tramo = "X-2";
            else if (diff === -3) tramo = "X-3";
            else tramo = "X-4";

            const tramosValidos = ["X-4", "X-3", "X-2", "X-1", "X", "X+1", "X+2", "X+3"];
            const cumpleMinimoMat = stats.matriculados >= activePlan.min_matriculaciones;

            // Calcular diferencia para el siguiente tramo
            let textoSiguiente = "";
            if (tramo !== "X+3") {
              const valorActual = stats.objetivoComputado;
              let valorSiguiente = X;
              if (tramo === "X-4") valorSiguiente = X - 3;
              else if (tramo === "X-3") valorSiguiente = X - 2;
              else if (tramo === "X-2") valorSiguiente = X - 1;
              else if (tramo === "X-1") valorSiguiente = X;
              else if (tramo === "X") valorSiguiente = X + 1;
              else if (tramo === "X+1") valorSiguiente = X + 2;
              else if (tramo === "X+2") valorSiguiente = X + 3;
              
              const faltan = valorSiguiente - valorActual;
              textoSiguiente = `Faltan ${faltan.toFixed(1)} ud. para subir al tramo ${tramosValidos[tramosValidos.indexOf(tramo) + 1]}`;
            } else {
              textoSiguiente = "¡Estás en el tramo máximo de comisión!";
            }

            return (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(350px, 1fr))", gap: "20px" }}>
                {/* Panel de Tramos e Inferencia */}
                <div className="glass-panel" style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "16px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <h5 style={{ margin: 0, fontWeight: 700, fontSize: "0.95rem", color: "var(--text-primary)" }}>🎯 Seguimiento de Tramos de Comisión</h5>
                    <span className="badge badge-tienda" style={{ fontSize: "0.75rem", backgroundColor: "rgba(59, 130, 246, 0.15)", color: "#3b82f6" }}>
                      Plan: {activePlan.nombre}
                    </span>
                  </div>

                  <div style={{ display: "flex", gap: "16px", alignItems: "center", background: "rgba(255,255,255,0.01)", padding: "12px", borderRadius: "4px", border: "1px solid var(--border-light)" }}>
                    <div style={{ textAlign: "center" }}>
                      <span style={{ fontSize: "0.7rem", color: "var(--text-secondary)" }}>PUNTOS HOY</span>
                      <div style={{ fontSize: "1.8rem", fontWeight: 800, color: "var(--primary)" }}>{stats.objetivoComputado.toFixed(1)}</div>
                    </div>
                    <div style={{ height: "40px", width: "1px", background: "var(--border-light)" }}></div>
                    <div style={{ textAlign: "center" }}>
                      <span style={{ fontSize: "0.7rem", color: "var(--text-secondary)" }}>OBJETIVO (X)</span>
                      <div style={{ fontSize: "1.8rem", fontWeight: 800, color: "var(--text-primary)" }}>{X}</div>
                    </div>
                    <div style={{ height: "40px", width: "1px", background: "var(--border-light)" }}></div>
                    <div>
                      <span style={{ fontSize: "0.7rem", color: "var(--text-secondary)" }}>TRAMO ALCANZADO</span>
                      <div style={{ fontSize: "1.2rem", fontWeight: 700, color: "var(--success)" }}>Tramo {tramo}</div>
                    </div>
                  </div>

                  {/* Barra visual de tramos */}
                  <div>
                    <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>Línea de Tramos:</span>
                    <div style={{ display: "flex", justifyContent: "space-between", marginTop: "8px", gap: "4px" }}>
                      {tramosValidos.map(t => {
                        const isCurrent = t === tramo;
                        return (
                          <div
                            key={t}
                            style={{
                              flex: 1,
                              textAlign: "center",
                              padding: "6px 2px",
                              fontSize: "0.75rem",
                              fontWeight: isCurrent ? 700 : 400,
                              borderRadius: "4px",
                              background: isCurrent ? "var(--success)" : "rgba(255,255,255,0.03)",
                              color: isCurrent ? "#ffffff" : "var(--text-muted)",
                              border: isCurrent ? "none" : "1px solid var(--border-light)",
                              transition: "all 0.3s ease",
                              boxShadow: isCurrent ? "0 0 10px rgba(16, 185, 129, 0.4)" : "none"
                            }}
                          >
                            {t}
                          </div>
                        );
                      })}
                    </div>
                    <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "8px", textAlign: "right", fontStyle: "italic" }}>
                      {textoSiguiente}
                    </div>
                  </div>

                  {/* Mínimo de matriculaciones */}
                  <div style={{
                    padding: "12px",
                    background: cumpleMinimoMat ? "rgba(16, 185, 129, 0.05)" : "rgba(239, 68, 68, 0.05)",
                    border: `1px solid ${cumpleMinimoMat ? "rgba(16, 185, 129, 0.2)" : "rgba(239, 68, 68, 0.2)"}`,
                    borderRadius: "4px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between"
                  }}>
                    <div>
                      <strong style={{ fontSize: "0.85rem", color: cumpleMinimoMat ? "var(--success)" : "var(--danger)" }}>
                        {cumpleMinimoMat ? "✓ Mínimo de Matriculaciones Cumplido" : "⚠️ Mínimo de Matriculaciones NO Alcanzado"}
                      </strong>
                      <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "2px" }}>
                        Necesitas mínimo {activePlan.min_matriculaciones} matriculaciones. Llevas {stats.matriculados}.
                      </div>
                    </div>
                    <span style={{ fontSize: "1.1rem", fontWeight: "bold", color: "var(--text-primary)" }}>
                      {stats.matriculados} / {activePlan.min_matriculaciones}
                    </span>
                  </div>
                </div>

                {/* Panel de Comisiones Acumuladas Estimadas */}
                <div className="glass-panel" style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "16px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <h5 style={{ margin: 0, fontWeight: 700, fontSize: "0.95rem", color: "var(--text-primary)" }}>💰 Comisiones Estimadas del Período</h5>
                    <span className="badge" style={{ fontSize: "0.75rem", backgroundColor: cumpleMinimoMat ? "rgba(16, 185, 129, 0.15)" : "rgba(239, 68, 68, 0.15)", color: cumpleMinimoMat ? "var(--success)" : "var(--danger)" }}>
                      {cumpleMinimoMat ? "Liquidables VN/VO" : "Penalizado (Min. Mat. 0€)"}
                    </span>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "12px" }}>
                    <div 
                      onClick={() => setComisionesDetailModal({ type: "total_estimado", title: "Total Estimado Neto" })}
                      className="glass-panel-interactive"
                      style={{ background: "rgba(16, 185, 129, 0.03)", padding: "10px", borderRadius: "4px", border: "1px solid rgba(16, 185, 129, 0.15)", cursor: "pointer", transition: "all 0.2s" }}
                    >
                      <span style={{ fontSize: "0.68rem", color: "var(--text-secondary)", display: "block" }}>TOTAL ESTIMADO 🔍</span>
                      <strong style={{ fontSize: "1.3rem", color: "var(--success)", fontWeight: 800 }}>
                        {stats.totalComisionGlobal.toLocaleString("es-ES", { style: "currency", currency: "EUR" })}
                      </strong>
                    </div>
                    <div 
                      onClick={() => setComisionesDetailModal({ type: "comision_teorica", title: "Comisión Teórica Total" })}
                      className="glass-panel-interactive"
                      style={{ background: "rgba(255, 255, 255, 0.01)", padding: "10px", borderRadius: "4px", border: "1px solid var(--border-light)", cursor: "pointer", transition: "all 0.2s" }}
                    >
                      <span style={{ fontSize: "0.68rem", color: "var(--text-secondary)", display: "block" }}>COMISIÓN TEÓRICA 🔍</span>
                      <strong style={{ fontSize: "1.3rem", color: "var(--text-primary)", fontWeight: 700 }}>
                        {stats.totalComisionTeorica.toLocaleString("es-ES", { style: "currency", currency: "EUR" })}
                      </strong>
                    </div>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "0.78rem" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 600, color: "var(--text-muted)", paddingBottom: "4px", borderBottom: "1px solid var(--border-light)", textTransform: "uppercase", fontSize: "0.65rem" }}>
                      <span style={{ flex: 1.2 }}>Concepto</span>
                      <span style={{ flex: 1.5, textAlign: "center" }}>Detalle / Cant.</span>
                      <span style={{ flex: 1, textAlign: "right" }}>Importe</span>
                    </div>

                    <div 
                      onClick={() => setComisionesDetailModal({ type: "base_vn", title: "Detalle - Base VN" })}
                      className="glass-panel-interactive"
                      style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 8px", borderRadius: "4px", borderBottom: "1px solid rgba(255,255,255,0.03)", cursor: "pointer", transition: "all 0.2s" }}
                    >
                      <span style={{ color: "var(--text-secondary)", flex: 1.2 }}>Base VN 🔍:</span>
                      <span style={{ color: "var(--text-muted)", fontSize: "0.72rem", flex: 1.5, textAlign: "center" }}>{stats.matriculadosVN} uds en Tramo {tramo}</span>
                      <strong style={{ flex: 1, textAlign: "right", color: cumpleMinimoMat ? "var(--text-primary)" : "var(--text-muted)", textDecoration: cumpleMinimoMat ? "none" : "line-through" }}>{stats.totalBaseVN.toLocaleString("es-ES", { style: "currency", currency: "EUR" })}</strong>
                    </div>
                    <div 
                      onClick={() => setComisionesDetailModal({ type: "base_vo", title: "Detalle - Base VO / Usado" })}
                      className="glass-panel-interactive"
                      style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 8px", borderRadius: "4px", borderBottom: "1px solid rgba(255,255,255,0.03)", cursor: "pointer", transition: "all 0.2s" }}
                    >
                      <span style={{ color: "var(--text-secondary)", flex: 1.2 }}>Base VO / Usado 🔍:</span>
                      <span style={{ color: "var(--text-muted)", fontSize: "0.72rem", flex: 1.5, textAlign: "center" }}>{stats.matriculados - stats.matriculadosVN} uds</span>
                      <strong style={{ flex: 1, textAlign: "right", color: cumpleMinimoMat ? "var(--text-primary)" : "var(--text-muted)", textDecoration: cumpleMinimoMat ? "none" : "line-through" }}>{stats.totalUsado.toLocaleString("es-ES", { style: "currency", currency: "EUR" })}</strong>
                    </div>
                    <div 
                      onClick={() => setComisionesDetailModal({ type: "credito", title: "Detalle - Crédito / Financiación" })}
                      className="glass-panel-interactive"
                      style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 8px", borderRadius: "4px", borderBottom: "1px solid rgba(255,255,255,0.03)", cursor: "pointer", transition: "all 0.2s" }}
                    >
                      <span style={{ color: "var(--text-secondary)", flex: 1.2 }}>Crédito / Finan 🔍:</span>
                      <span style={{ color: "var(--text-muted)", fontSize: "0.72rem", flex: 1.5, textAlign: "center" }}>{stats.matriculadosCredito} uds</span>
                      <strong style={{ flex: 1, textAlign: "right" }}>{stats.totalFinanciacion.toLocaleString("es-ES", { style: "currency", currency: "EUR" })}</strong>
                    </div>
                    <div 
                      onClick={() => setComisionesDetailModal({ type: "preference", title: "Detalle - Preference / BOX3" })}
                      className="glass-panel-interactive"
                      style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 8px", borderRadius: "4px", borderBottom: "1px solid rgba(255,255,255,0.03)", cursor: "pointer", transition: "all 0.2s" }}
                    >
                      <span style={{ color: "var(--text-secondary)", flex: 1.2 }}>Preference/BOX3 🔍:</span>
                      <span style={{ color: "var(--text-muted)", fontSize: "0.72rem", flex: 1.5, textAlign: "center" }}>{stats.matriculadosPreference} uds</span>
                      <strong style={{ flex: 1, textAlign: "right" }}>{stats.totalPreference.toLocaleString("es-ES", { style: "currency", currency: "EUR" })}</strong>
                    </div>
                    <div 
                      onClick={() => setComisionesDetailModal({ type: "bonus", title: "Detalle - Bonus Especiales" })}
                      className="glass-panel-interactive"
                      style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 8px", borderRadius: "4px", borderBottom: stats.totalReglasPenalizacion > 0 || (activePlan && Math.abs(activePlan.penalizacion_importe || 0) > 0) ? "1px solid rgba(255,255,255,0.03)" : "none", cursor: "pointer", transition: "all 0.2s" }}
                    >
                      <span style={{ color: "var(--text-secondary)", flex: 1.2 }}>Bonus Especiales 🔍:</span>
                      <span style={{ color: "var(--text-muted)", fontSize: "0.72rem", flex: 1.5, textAlign: "center" }}>Campañas / Reglas</span>
                      <strong style={{ flex: 1, textAlign: "right" }}>{stats.totalReglasBonus.toLocaleString("es-ES", { style: "currency", currency: "EUR" })}</strong>
                    </div>

                    {stats.totalReglasPenalizacion > 0 && (
                      <div 
                        onClick={() => setComisionesDetailModal({ type: "penalizaciones", title: "Detalle - Penalizaciones" })}
                        className="glass-panel-interactive"
                        style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 8px", borderRadius: "4px", borderBottom: (activePlan && Math.abs(activePlan.penalizacion_importe || 0) > 0) ? "1px solid rgba(255,255,255,0.03)" : "none", color: "var(--danger)", cursor: "pointer", transition: "all 0.2s" }}
                      >
                        <span style={{ color: "var(--danger)", flex: 1.2 }}>Penalizaciones 🔍:</span>
                        <span style={{ color: "var(--text-muted)", fontSize: "0.72rem", flex: 1.5, textAlign: "center" }}>Reglas / Conceptos</span>
                        <strong style={{ flex: 1, textAlign: "right" }}>-{stats.totalReglasPenalizacion.toLocaleString("es-ES", { style: "currency", currency: "EUR" })}</strong>
                      </div>
                    )}

                    {activePlan && Math.abs(activePlan.penalizacion_importe || 0) > 0 && (
                      <div 
                        onClick={() => setComisionesDetailModal({ type: "penalizacion_fija", title: "Detalle - Penalización Fija" })}
                        className="glass-panel-interactive"
                        style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 8px", borderRadius: "4px", color: "var(--danger)", cursor: "pointer", transition: "all 0.2s" }}
                        title={activePlan.penalizacion_descripcion ? `${activePlan.penalizacion_titulo || "Penalización"}: ${activePlan.penalizacion_descripcion}` : undefined}
                      >
                        <span style={{ color: "var(--danger)", flex: 1.2 }}>Penalización Fija 🔍:</span>
                        <span style={{ color: "var(--text-muted)", fontSize: "0.72rem", flex: 1.5, textAlign: "center", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {activePlan.penalizacion_titulo || "Fija de liquidación"}
                        </span>
                        <strong style={{ flex: 1, textAlign: "right" }}>-{Math.abs(activePlan.penalizacion_importe).toLocaleString("es-ES", { style: "currency", currency: "EUR" })}</strong>
                      </div>
                    )}
                  </div>
                </div>

                {/* Desglose de Expedientes */}
                <div className="glass-panel" style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "16px", gridColumn: "span 1" }}>
                  <h5 style={{ margin: 0, fontWeight: 700, fontSize: "0.95rem", color: "var(--text-primary)" }}>📂 Desglose de Expedientes en el Periodo</h5>
                  
                  <div style={{ display: "flex", flexDirection: "column", gap: "12px", maxHeight: "250px", overflowY: "auto" }}>
                    <div>
                      <span style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--success)" }}>✓ Sumando al Objetivo (Matriculados) ({stats.matriculadosList.length})</span>
                      <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginTop: "6px" }}>
                        {stats.matriculadosList.map((m: any) => {
                          const tipoVenta = m.tipoDeVenta?.nombre_tipo_venta || "N/D";
                          const esFinanciado = m.fecha_rci ? true : false;
                          const commDet = stats.computedDetailsList.find(d => d.id_expediente === m.id_expediente);
                          const commTotal = commDet ? commDet.total : 0;
                          return (
                            <Link
                              href={`/dashboard/expedientes/editar/${m.id_expediente}`}
                              key={m.id_expediente}
                              className="glass-panel-interactive"
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                                fontSize: "0.8rem",
                                padding: "8px 12px",
                                background: "rgba(255,255,255,0.01)",
                                borderRadius: "4px",
                                border: "1px solid var(--border-light)",
                                cursor: "pointer",
                                textDecoration: "none",
                                transition: "all 0.2s ease"
                              }}
                            >
                              <div style={{ display: "flex", flexDirection: "column", gap: "2px", width: "70%" }}>
                                <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                                  <strong style={{ color: "var(--primary)" }}>#EXP-{String(m.id_expediente).padStart(4, "0")}</strong>
                                  <span style={{ fontWeight: 600, color: "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "150px" }}>
                                    {m.cliente?.nombre || "Sin cliente"}
                                  </span>
                                </div>
                                <div style={{ fontSize: "0.7rem", color: "var(--text-secondary)", display: "flex", flexWrap: "wrap", gap: "6px", alignItems: "center" }}>
                                  <span>{m.modelo?.nombre_modelo} ({m.modelo?.marca?.nombre || "VO"})</span>
                                  <span style={{ color: "var(--border-light)" }}>|</span>
                                  <span className="badge" style={{ fontSize: "0.65rem", padding: "1px 4px", background: "rgba(59, 130, 246, 0.1)", color: "#3b82f6" }}>{tipoVenta}</span>
                                  {esFinanciado && (
                                    <span className="badge" style={{ fontSize: "0.65rem", padding: "1px 4px", background: "rgba(16, 185, 129, 0.1)", color: "var(--success)" }}>F. RCI</span>
                                  )}
                                </div>
                              </div>
                              <div style={{ textAlign: "right", display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
                                <span style={{ fontWeight: 700, color: "var(--success)", fontSize: "0.95rem" }}>
                                  +{m.valorObjetivoEstimado?.toFixed(1) || "1.0"}
                                </span>
                                {commTotal > 0 && (
                                  <span style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>
                                    {commTotal} €
                                  </span>
                                )}
                              </div>
                            </Link>
                          );
                        })}
                        {stats.matriculadosList.length === 0 && (
                          <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontStyle: "italic", padding: "4px" }}>
                            No hay expedientes matriculados en este periodo.
                          </div>
                        )}
                      </div>
                    </div>

                    <div style={{ marginTop: "8px" }}>
                      <span style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--warning)" }}>⏳ Pendientes de Matriculación (Pipeline) ({stats.pendientesList.length})</span>
                      <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginTop: "6px" }}>
                        {stats.pendientesList.map((p: any) => {
                          const tipoVenta = p.tipoDeVenta?.nombre_tipo_venta || "N/D";
                          const esFinanciado = p.fecha_rci ? true : false;
                          return (
                            <Link
                              href={`/dashboard/expedientes/editar/${p.id_expediente}`}
                              key={p.id_expediente}
                              className="glass-panel-interactive"
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                                fontSize: "0.8rem",
                                padding: "8px 12px",
                                background: "rgba(255,255,255,0.01)",
                                borderRadius: "4px",
                                border: "1px solid var(--border-light)",
                                cursor: "pointer",
                                textDecoration: "none",
                                transition: "all 0.2s ease"
                              }}
                            >
                              <div style={{ display: "flex", flexDirection: "column", gap: "2px", width: "85%" }}>
                                <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                                  <strong style={{ color: "var(--warning)" }}>#EXP-{String(p.id_expediente).padStart(4, "0")}</strong>
                                  <span style={{ fontWeight: 600, color: "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "150px" }}>
                                    {p.cliente?.nombre || "Sin cliente"}
                                  </span>
                                </div>
                                <div style={{ fontSize: "0.7rem", color: "var(--text-secondary)", display: "flex", flexWrap: "wrap", gap: "6px", alignItems: "center" }}>
                                  <span>{p.modelo?.nombre_modelo} ({p.modelo?.marca?.nombre || "VO"})</span>
                                  <span style={{ color: "var(--border-light)" }}>|</span>
                                  <span className="badge" style={{ fontSize: "0.65rem", padding: "1px 4px", background: "rgba(245, 158, 11, 0.1)", color: "var(--warning)" }}>{tipoVenta}</span>
                                  {esFinanciado && (
                                    <span className="badge" style={{ fontSize: "0.65rem", padding: "1px 4px", background: "rgba(16, 185, 129, 0.1)", color: "var(--success)" }}>F. RCI</span>
                                  )}
                                </div>
                                <div style={{ fontSize: "0.68rem", color: "var(--text-muted)" }}>
                                  F. Pedido: {formatDate(p.fecha_expediente)}{p.fecha_afectacion ? ` | F. Afect: ${formatDate(p.fecha_afectacion)}` : ""}
                                </div>
                              </div>
                              <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)", fontStyle: "italic", whiteSpace: "nowrap" }}>
                                Pedido/Afect.
                              </span>
                            </Link>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })() : (
            <div style={{
              padding: "24px",
              textAlign: "center",
              background: "rgba(255, 255, 255, 0.02)",
              border: "1px solid var(--border-light)",
              borderRadius: "4px",
              color: "var(--text-secondary)",
              fontSize: "0.9rem"
            }}>
              💡 No hay ningún plan de comisiones aplicable para el período seleccionado ({statsMonth}/{statsYear}).
              Configura un plan en la pestaña de comisiones para habilitar la barra de tramos de objetivos.
            </div>
          )}
        </div>
      </div>

      {/* MODAL PARA EDITAR FECHA */}
      {editDateModal && (
        <div style={{
          position: "fixed",
          top: 0,
          left: 0,
          width: "100vw",
          height: "100vh",
          background: "var(--bg-overlay)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 999,
          backdropFilter: "blur(4px)"
        }}>
          <form
            onSubmit={e => {
              e.preventDefault();
              handleSaveDate();
            }}
            className="glass-panel"
            style={{
              width: "100%",
              maxWidth: "400px",
              padding: "32px",
              display: "flex",
              flexDirection: "column",
              gap: "20px",
              background: "var(--bg-card)"
            }}
          >
            <h3 style={{ fontSize: "1.2rem", color: "var(--text-primary)", margin: 0 }}>
              Establecer fecha de {editDateModal.displayName}
            </h3>
            
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Selecciona Fecha</label>
              <input
                type="date"
                className="form-input"
                value={inputDate}
                onChange={e => setInputDate(e.target.value)}
              />
            </div>

            {editDateModal.fieldName === "fecha_matriculacion" && (
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Matrícula (Opcional)</label>
                <input
                  type="text"
                  className="form-input"
                  value={inputMatricula}
                  onChange={e => setInputMatricula(e.target.value)}
                  placeholder="Ej. 1234ABC"
                />
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px", marginTop: "8px" }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setEditDateModal(null)}
                disabled={loading}
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={loading}
              >
                {loading ? "Guardando..." : "Aceptar"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL PARA ASIGNAR CLIENTE */}
      {assigningClientExpId && (
        <div style={{
          position: "fixed",
          top: 0,
          left: 0,
          width: "100vw",
          height: "100vh",
          background: "var(--bg-overlay)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 999,
          backdropFilter: "blur(4px)"
        }}>
          <div className="glass-panel" style={{
            width: "100%",
            maxWidth: "450px",
            padding: "32px",
            display: "flex",
            flexDirection: "column",
            gap: "20px",
            background: "var(--bg-card)"
          }}>
            <h3 style={{ fontSize: "1.2rem", color: "var(--text-primary)", margin: 0 }}>
              Asignar Cliente al Expediente
            </h3>

            {/* Pestañas del Modal */}
            <div style={{ display: "flex", borderBottom: "1px solid var(--border-light)", gap: "8px", marginBottom: "8px" }}>
              <button
                type="button"
                style={{
                  padding: "8px 12px",
                  background: "none",
                  border: "none",
                  color: assignClientModalTab === "buscar" ? "var(--primary)" : "var(--text-secondary)",
                  borderBottom: assignClientModalTab === "buscar" ? "2px solid var(--primary)" : "none",
                  fontWeight: assignClientModalTab === "buscar" ? 700 : 400,
                  cursor: "pointer",
                  fontSize: "0.9rem"
                }}
                onClick={() => setAssignClientModalTab("buscar")}
              >
                Buscar Existente
              </button>
              <button
                type="button"
                style={{
                  padding: "8px 12px",
                  background: "none",
                  border: "none",
                  color: assignClientModalTab === "crear" ? "var(--primary)" : "var(--text-secondary)",
                  borderBottom: assignClientModalTab === "crear" ? "2px solid var(--primary)" : "none",
                  fontWeight: assignClientModalTab === "crear" ? 700 : 400,
                  cursor: "pointer",
                  fontSize: "0.9rem"
                }}
                onClick={() => {
                  setAssignClientModalTab("crear");
                  if (tiendas && tiendas.length > 0 && !newClientTiendaId) {
                    setNewClientTiendaId(tiendaPredeterminadaId ? String(tiendaPredeterminadaId) : String(tiendas[0].id_tienda));
                  }
                }}
              >
                ➕ Crear Nuevo Cliente
              </button>
            </div>

            {assignClientModalTab === "buscar" ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                <div className="form-group" style={{ marginBottom: 0, position: "relative" }}>
                  <label className="form-label">🔍 Buscar Cliente (Nombre o DNI)</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Escribe al menos 2 caracteres..."
                    value={clientSearchQuery}
                    onChange={e => handleSearchClientsForAssign(e.target.value)}
                    autoFocus
                  />
                  {searchingClient && (
                    <div style={{ position: "absolute", right: "12px", bottom: "10px", fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                      Buscando...
                    </div>
                  )}
                </div>

                {clientSearchResults.length > 0 ? (
                  <div style={{
                    maxHeight: "180px",
                    overflowY: "auto",
                    border: "1px solid var(--border-light)",
                    borderRadius: "var(--radius-sm)",
                    background: "rgba(255, 255, 255, 0.02)"
                  }}>
                    {clientSearchResults.map(c => (
                      <div
                        key={c.id}
                        onClick={() => handleAssignClient(c)}
                        className="glass-panel-interactive"
                        style={{
                          padding: "10px 16px",
                          cursor: "pointer",
                          borderBottom: "1px solid var(--border-light)",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          borderRadius: 0
                        }}
                      >
                        <div>
                          <div style={{ fontWeight: 600, color: "var(--text-primary)" }}>{c.nombre}</div>
                          <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>DNI: {c.dni || "N/D"}</div>
                        </div>
                        <span style={{ fontSize: "0.8rem", color: "var(--primary)", fontWeight: 600 }}>Seleccionar →</span>
                      </div>
                    ))}
                  </div>
                ) : clientSearchQuery.trim().length >= 2 && !searchingClient ? (
                  <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)", textAlign: "center", padding: "12px" }}>
                    No se encontraron clientes para "{clientSearchQuery}"
                  </div>
                ) : null}
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                {createClientError && (
                  <div style={{ color: "var(--danger)", fontSize: "0.8rem", padding: "6px 8px", background: "rgba(239, 68, 68, 0.05)", borderRadius: "4px" }}>
                    ⚠️ {createClientError}
                  </div>
                )}
                
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" style={{ fontSize: "0.8rem" }}>Nombre Completo *</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Ej. Juan Pérez"
                    value={newClientNombre}
                    onChange={e => setNewClientNombre(e.target.value)}
                    style={{ padding: "6px 10px" }}
                  />
                </div>

                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" style={{ fontSize: "0.8rem" }}>DNI / NIE</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Ej. 12345678Z"
                    value={newClientDni}
                    onChange={e => setNewClientDni(e.target.value)}
                    style={{ padding: "6px 10px" }}
                  />
                </div>

                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" style={{ fontSize: "0.8rem" }}>Teléfono</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Ej. 600123456"
                    value={newClientTelefono}
                    onChange={e => setNewClientTelefono(e.target.value)}
                    style={{ padding: "6px 10px" }}
                  />
                </div>

                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" style={{ fontSize: "0.8rem" }}>Email</label>
                  <input
                    type="email"
                    className="form-input"
                    placeholder="Ej. juan@correo.com"
                    value={newClientEmail}
                    onChange={e => setNewClientEmail(e.target.value)}
                    style={{ padding: "6px 10px" }}
                  />
                </div>

                {tiendas.length > 0 && (
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label" style={{ fontSize: "0.8rem" }}>Tienda Asociada</label>
                    <select
                      className="form-select"
                      value={newClientTiendaId}
                      onChange={e => setNewClientTiendaId(e.target.value)}
                      style={{ padding: "6px 10px" }}
                    >
                      {tiendas.map(t => (
                        <option key={t.id_tienda} value={t.id_tienda}>{t.nombre}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px", marginTop: "8px" }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  setAssigningClientExpId(null);
                  setClientSearchQuery("");
                  setClientSearchResults([]);
                  setNewClientNombre("");
                  setNewClientDni("");
                  setNewClientEmail("");
                  setNewClientTelefono("");
                  setNewClientTiendaId("");
                  setAssignClientModalTab("buscar");
                  setCreateClientError(null);
                }}
                disabled={loading || creatingClient}
              >
                Cancelar
              </button>
              {assignClientModalTab === "crear" && (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleCreateAndAssignClient}
                  disabled={creatingClient}
                >
                  {creatingClient ? "Creando..." : "Crear y Asignar"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL PARA ELIMINAR FECHA */}
      {deleteDateModal && (
        <div style={{
          position: "fixed",
          top: 0,
          left: 0,
          width: "100vw",
          height: "100vh",
          background: "var(--bg-overlay)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 999,
          backdropFilter: "blur(4px)"
        }}>
          <div className="glass-panel" style={{
            width: "100%",
            maxWidth: "400px",
            padding: "32px",
            display: "flex",
            flexDirection: "column",
            gap: "20px",
            borderLeft: "4px solid var(--danger)",
            background: "var(--bg-card)"
          }}>
            <h3 style={{ fontSize: "1.2rem", color: "var(--text-primary)", margin: 0 }}>
              Eliminar fecha de {deleteDateModal.displayName}
            </h3>
            <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem", lineHeight: "1.5", margin: 0 }}>
              ¿Estás seguro de que deseas eliminar la fecha de <strong>{deleteDateModal.displayName}</strong> de este expediente?
            </p>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px", marginTop: "8px" }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setDeleteDateModal(null)}
                disabled={loading}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="btn"
                onClick={handleDeleteDate}
                disabled={loading}
                style={{
                  backgroundColor: "var(--danger)",
                  color: "white",
                  border: "none",
                  borderRadius: "var(--radius-sm)",
                  padding: "8px 16px",
                  cursor: "pointer",
                  fontWeight: 600
                }}
              >
                {loading ? "Eliminando..." : "Confirmar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE ELIMINACIÓN DE EXPEDIENTE */}
      {confirmDeleteExpediente && (
        <div style={{
          position: "fixed",
          top: 0,
          left: 0,
          width: "100vw",
          height: "100vh",
          background: "var(--bg-overlay)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 999,
          backdropFilter: "blur(4px)"
        }}>
          <div className="glass-panel" style={{
            width: "100%",
            maxWidth: "450px",
            padding: "32px",
            display: "flex",
            flexDirection: "column",
            gap: "24px",
            borderLeft: "4px solid var(--danger)",
            background: "var(--bg-card)"
          }}>
            <h3 style={{ fontSize: "1.25rem", color: "var(--text-primary)", margin: 0 }}>
              Confirmar Eliminación
            </h3>
            <p style={{ color: "var(--text-secondary)", fontSize: "0.95rem", lineHeight: "1.6", margin: 0 }}>
              ¿Estás seguro de que deseas eliminar permanentemente este expediente? Esta acción no se podrá deshacer.
            </p>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px" }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setConfirmDeleteExpediente(null)}
                disabled={deleting}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="btn"
                onClick={handleDeleteExpediente}
                disabled={deleting}
                style={{
                  backgroundColor: "var(--danger)",
                  color: "white",
                  border: "none",
                  borderRadius: "var(--radius-sm)",
                  padding: "10px 20px",
                  cursor: "pointer",
                  fontWeight: 600
                }}
              >
                {deleting ? "Eliminando..." : "Eliminar Expediente"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE CONFIRMACIÓN DE BORRADO MASIVO */}
      {confirmBulkDelete && (
        <div style={{
          position: "fixed",
          top: 0,
          left: 0,
          width: "100vw",
          height: "100vh",
          background: "var(--bg-overlay)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 999,
          backdropFilter: "blur(4px)"
        }}>
          <div className="glass-panel" style={{
            width: "100%",
            maxWidth: "450px",
            padding: "32px",
            display: "flex",
            flexDirection: "column",
            gap: "24px",
            borderLeft: "4px solid var(--danger)",
            background: "var(--bg-card)"
          }}>
            <h3 style={{ fontSize: "1.25rem", color: "var(--text-primary)", margin: 0 }}>
              Confirmar Borrado Masivo
            </h3>
            <p style={{ color: "var(--text-secondary)", fontSize: "0.95rem", lineHeight: "1.6", margin: 0 }}>
              ¿Estás seguro de que deseas eliminar permanentemente los <strong>{selectedIds.length}</strong> expedientes seleccionados? Esta acción no se podrá deshacer.
            </p>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px" }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setConfirmBulkDelete(false)}
                disabled={deleting}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="btn"
                onClick={handleBulkDelete}
                disabled={deleting}
                style={{
                  backgroundColor: "var(--danger)",
                  color: "white",
                  border: "none",
                  borderRadius: "var(--radius-sm)",
                  padding: "10px 20px",
                  cursor: "pointer",
                  fontWeight: 600
                }}
              >
                {deleting ? "Eliminando..." : "Eliminar Expedientes"}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* MODAL DE EDICIÓN MASIVA */}
      {showBulkEditModal && (
        <div style={{
          position: "fixed",
          top: 0,
          left: 0,
          width: "100vw",
          height: "100vh",
          background: "var(--bg-overlay)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 999,
          backdropFilter: "blur(4px)"
        }}>
          <div className="glass-panel" style={{
            width: "100%",
            maxWidth: "600px",
            maxHeight: "90vh",
            overflowY: "auto",
            padding: "32px",
            display: "flex",
            flexDirection: "column",
            gap: "20px",
            background: "var(--bg-card)"
          }}>
            <div>
              <h3 style={{ fontSize: "1.25rem", color: "var(--text-primary)", margin: 0 }}>
                Editar Expedientes en Masa ({selectedIds.length} seleccionados)
              </h3>
              <p style={{ color: "var(--text-muted)", fontSize: "0.82rem", marginTop: "4px" }}>
                Rellene únicamente los campos que desea modificar. Los campos vacíos no se alterarán.
              </p>
            </div>

            {!catalogs ? (
              <div style={{ textAlign: "center", padding: "20px", color: "var(--text-secondary)" }}>
                Cargando catálogos...
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                {/* MARCA Y MODELO */}
                <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
                  <div className="form-group" style={{ flex: 1, minWidth: "200px", marginBottom: 0 }}>
                    <label className="form-label">Marca</label>
                    <select
                      className="form-select"
                      value={bulkMarca}
                      onChange={e => {
                        setBulkMarca(e.target.value ? Number(e.target.value) : "");
                        setBulkModelo("");
                      }}
                    >
                      <option value="">(No modificar)</option>
                      {catalogs.marcas.map(m => (
                        <option key={m.id} value={m.id}>{m.nombre}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group" style={{ flex: 1, minWidth: "200px", marginBottom: 0 }}>
                    <label className="form-label">Modelo</label>
                    <select
                      className="form-select"
                      value={bulkModelo}
                      onChange={e => setBulkModelo(e.target.value ? Number(e.target.value) : "")}
                      disabled={bulkMarca === ""}
                    >
                      <option value="">(No modificar)</option>
                      {bulkMarca !== "" && catalogs.modelosPorMarca[Number(bulkMarca)]?.map(m => (
                        <option key={m.id} value={m.id}>{m.nombre}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* TIPO DE VENTA Y VENDEDOR (ADMIN ONLY) */}
                <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
                  <div className="form-group" style={{ flex: 1, minWidth: "200px", marginBottom: 0 }}>
                    <label className="form-label">Tipo de Venta</label>
                    <select
                      className="form-select"
                      value={bulkTipoVenta}
                      onChange={e => setBulkTipoVenta(e.target.value ? Number(e.target.value) : "")}
                    >
                      <option value="">(No modificar)</option>
                      {catalogs.tiposVenta.map(t => (
                        <option key={t.id} value={t.id}>{t.nombre}</option>
                      ))}
                    </select>
                  </div>
                  {userRole === "administrador" && (
                    <div className="form-group" style={{ flex: 1, minWidth: "200px", marginBottom: 0 }}>
                      <label className="form-label">Vendedor</label>
                      <select
                        className="form-select"
                        value={bulkVendedor}
                        onChange={e => setBulkVendedor(e.target.value ? Number(e.target.value) : "")}
                      >
                        <option value="">(No modificar)</option>
                        {catalogs.vendedores.map(v => (
                          <option key={v.id} value={v.id}>{v.nombre}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>

                {/* FECHAS */}
                <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
                  <div className="form-group" style={{ flex: 1, minWidth: "130px", marginBottom: 0 }}>
                    <label className="form-label">Fecha Exp.</label>
                    <input
                      type="date"
                      className="form-input"
                      value={bulkFExp}
                      onChange={e => setBulkFExp(e.target.value)}
                    />
                  </div>
                  <div className="form-group" style={{ flex: 1, minWidth: "130px", marginBottom: 0 }}>
                    <label className="form-label">Fecha Afect.</label>
                    <input
                      type="date"
                      className="form-input"
                      value={bulkFAfect}
                      onChange={e => setBulkFAfect(e.target.value)}
                    />
                  </div>
                  <div className="form-group" style={{ flex: 1, minWidth: "130px", marginBottom: 0 }}>
                    <label className="form-label">Fecha RCI</label>
                    <input
                      type="date"
                      className="form-input"
                      value={bulkFRci}
                      onChange={e => setBulkFRci(e.target.value)}
                    />
                  </div>
                </div>

                <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
                  <div className="form-group" style={{ flex: 1, minWidth: "200px", marginBottom: 0 }}>
                    <label className="form-label">Fecha Mat.</label>
                    <input
                      type="date"
                      className="form-input"
                      value={bulkFMat}
                      onChange={e => setBulkFMat(e.target.value)}
                    />
                  </div>
                  <div className="form-group" style={{ flex: 1, minWidth: "200px", marginBottom: 0 }}>
                    <label className="form-label">Fecha Entrega</label>
                    <input
                      type="date"
                      className="form-input"
                      value={bulkFEntrega}
                      onChange={e => setBulkFEntrega(e.target.value)}
                    />
                  </div>
                </div>

                <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px", marginTop: "12px" }}>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => {
                      setShowBulkEditModal(false);
                      setBulkMarca("");
                      setBulkModelo("");
                      setBulkTipoVenta("");
                      setBulkVendedor("");
                      setBulkFExp("");
                      setBulkFAfect("");
                      setBulkFRci("");
                      setBulkFMat("");
                      setBulkFEntrega("");
                    }}
                    disabled={loading}
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    className="btn"
                    onClick={handleSaveBulkEdit}
                    disabled={loading}
                    style={{
                      backgroundColor: "#2e7d32",
                      color: "white",
                      border: "none",
                      borderRadius: "var(--radius-sm)",
                      padding: "8px 16px",
                      cursor: "pointer",
                      fontWeight: 600
                    }}
                  >
                    {loading ? "Guardando..." : "Guardar Cambios"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL DE RESOLUCIÓN DE CONFLICTOS EXCEL */}
      {showExcelModal && excelConflictRows.length > 0 && (() => {
        const currentConflict = excelConflictRows[currentConflictIdx];
        if (!currentConflict) return null;

        return (
          <div className="modal-overlay" style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0, 0, 0, 0.6)",
            backdropFilter: "blur(4px)",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            zIndex: 9999,
            padding: "20px"
          }}>
            <div className="modal-content glass-panel" style={{
              background: "var(--bg-card)",
              border: "1px solid var(--border-light)",
              borderRadius: "var(--radius-md)",
              padding: "24px",
              width: "100%",
              maxWidth: "850px",
              maxHeight: "90vh",
              overflowY: "auto",
              boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.3), 0 10px 10px -5px rgba(0, 0, 0, 0.2)"
            }}>
              {/* Header */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", borderBottom: "1px solid var(--border-light)", paddingBottom: "12px" }}>
                <h3 style={{ margin: 0, fontSize: "1.25rem", display: "flex", alignItems: "center", gap: "8px" }}>
                  <span>⚠️ Resolviendo Múltiples Expedientes</span>
                  <span style={{ fontSize: "0.85rem", color: "var(--text-secondary)", fontWeight: "normal" }}>
                    (Conflicto {currentConflictIdx + 1} de {excelConflictRows.length})
                  </span>
                </h3>
                <button
                  onClick={() => {
                    setShowExcelModal(false);
                    setExcelConflictRows([]);
                    setExcelUpdatesToProcess([]);
                  }}
                  style={{ background: "none", border: "none", color: "var(--text-secondary)", cursor: "pointer", fontSize: "1.2rem" }}
                >
                  ✕
                </button>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                <p style={{ margin: 0, fontSize: "0.95rem", color: "var(--text-secondary)" }}>
                  El cliente <strong style={{ color: "var(--text-primary)" }}>{currentConflict.client.nombre}</strong> ({currentConflict.client.dni || "Sin NIF"}) tiene múltiples expedientes asignados en la app. Selecciona el expediente correcto para actualizarlo con los datos del Excel.
                </p>

                {/* Previsualización Datos Excel */}
                <div style={{
                  backgroundColor: "rgba(255, 255, 255, 0.02)",
                  border: "1px solid var(--border-light)",
                  borderRadius: "var(--radius-sm)",
                  padding: "16px"
                }}>
                  <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)", fontWeight: 600, textTransform: "uppercase", marginBottom: "8px", borderBottom: "1px solid rgba(255,255,255,0.03)", paddingBottom: "4px" }}>
                    Datos del Archivo Excel:
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "12px", fontSize: "0.88rem" }}>
                    <div><strong>NIF:</strong> <span style={{ color: "var(--primary)" }}>{currentConflict.data.nif || "-"}</span></div>
                    <div><strong>Email:</strong> <span style={{ color: "var(--primary)" }}>{currentConflict.data.email || "-"}</span></div>
                    <div><strong>Bastidor:</strong> <span style={{ color: "var(--primary)" }}>{currentConflict.data.bastidor || "-"}</span></div>
                    <div><strong>Matrícula:</strong> <span style={{ color: "var(--primary)" }}>{currentConflict.data.matricula || "-"}</span></div>
                    <div><strong>F. Afectación:</strong> <span style={{ color: "var(--primary)" }}>{formatDate(currentConflict.data.f_afect) || "-"}</span></div>
                    <div><strong>F. Matriculación:</strong> <span style={{ color: "var(--primary)" }}>{formatDate(currentConflict.data.f_mat) || "-"}</span></div>
                  </div>
                </div>

                {/* Listado de Expedientes en Base de Datos */}
                <div>
                  <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)", fontWeight: 600, textTransform: "uppercase", marginBottom: "8px" }}>
                    Expedientes Existentes en la App:
                  </div>
                  <div className="table-container" style={{ border: "1px solid var(--border-light)", borderRadius: "var(--radius-sm)" }}>
                    <table className="table-premium" style={{ fontSize: "0.85rem", width: "100%" }}>
                      <thead>
                        <tr>
                          <th>ID</th>
                          <th>Marca/Modelo</th>
                          <th>VIN (Bastidor)</th>
                          <th>Matrícula</th>
                          <th>F. Afect.</th>
                          <th>F. Mat.</th>
                          <th>F. Exp.</th>
                          <th style={{ textAlign: "center" }}>Acción</th>
                        </tr>
                      </thead>
                      <tbody>
                        {currentConflict.expedientes.map((e: any) => (
                          <tr 
                            key={e.id_expediente}
                            style={{ cursor: "pointer" }}
                            onClick={() => handleResolveMultipleConflict(e.id_expediente)}
                          >
                            <td style={{ fontWeight: 600 }}>#{e.id_expediente}</td>
                            <td>
                              <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>{e.marca}</span> {e.modelo}
                            </td>
                            <td style={{ fontFamily: "monospace" }}>{e.vin || <span style={{ color: "var(--text-muted)" }}>-</span>}</td>
                            <td style={{ fontWeight: 600 }}>{e.matricula || <span style={{ color: "var(--text-muted)" }}>-</span>}</td>
                            <td>{formatDate(e.fecha_afectacion) || <span style={{ color: "var(--text-muted)" }}>-</span>}</td>
                            <td>{formatDate(e.fecha_matriculacion) || <span style={{ color: "var(--text-muted)" }}>-</span>}</td>
                            <td>{formatDate(e.fecha_expediente) || <span style={{ color: "var(--text-muted)" }}>-</span>}</td>
                            <td style={{ textAlign: "center" }}>
                              <button
                                onClick={(evt) => {
                                  evt.stopPropagation();
                                  handleResolveMultipleConflict(e.id_expediente);
                                }}
                                className="btn btn-primary"
                                style={{ padding: "4px 8px", fontSize: "0.75rem", borderRadius: "var(--radius-sm)" }}
                              >
                                Seleccionar
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Footer del Modal */}
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: "12px", borderTop: "1px solid var(--border-light)", paddingTop: "16px" }}>
                  <button
                    onClick={() => {
                      setShowExcelModal(false);
                      setExcelConflictRows([]);
                      setExcelUpdatesToProcess([]);
                      showNotification("Importación de Excel cancelada.", "success");
                    }}
                    className="btn btn-secondary"
                    style={{ padding: "8px 16px", fontSize: "0.85rem" }}
                  >
                    Cancelar Todo
                  </button>
                  <button
                    onClick={handleSkipExcelConflict}
                    className="btn btn-secondary"
                    style={{ padding: "8px 16px", fontSize: "0.85rem", backgroundColor: "rgba(239, 68, 68, 0.08)", border: "1px solid rgba(239, 68, 68, 0.2)", color: "var(--danger)" }}
                  >
                    Omitir este Registro
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* OVERLAY DE PROCESAMIENTO EXCEL */}
      {importingExcel && (
        <div style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: "rgba(0, 0, 0, 0.75)",
          backdropFilter: "blur(5px)",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          zIndex: 99999,
          gap: "16px"
        }}>
          <div className="spinner-excel" style={{
            width: "60px",
            height: "60px",
            border: "5px solid rgba(255, 255, 255, 0.1)",
            borderTop: "5px solid var(--success)",
            borderRadius: "50%",
            animation: "spin-excel 1s linear infinite"
          }} />
          <style>{`
            @keyframes spin-excel {
              0% { transform: rotate(0deg); }
              100% { transform: rotate(360deg); }
            }
          `}</style>
          <div style={{ color: "white", fontSize: "1.3rem", fontWeight: 700 }}>
            Procesando Archivo Excel...
          </div>
          <div style={{ color: "var(--text-secondary)", fontSize: "0.95rem" }}>
            Verificando clientes y actualizando expedientes en segundo plano.
          </div>
        </div>
      )}

      {/* MODAL DE DETALLE DE COMISIONES ESTIMADAS */}
      {comisionesDetailModal && (() => {
        const type = comisionesDetailModal.type;
        const title = comisionesDetailModal.title;

        // Filtrar y mapear expedientes correspondientes
        let rows: any[] = [];
        let showExplanation = "";
        let showTotalLabel = "Total";
        let isNegative = false;

        if (type === "base_vn") {
          rows = stats.computedDetailsList.filter(d => d.baseVN > 0).map(d => ({ ...d, value: d.baseVN }));
          showExplanation = "Comisiones base de vehículos nuevos (VN) y demos matriculados en el período, calculadas según el tramo del comercial y marcas.";
          showTotalLabel = "Total Base VN";
        } else if (type === "base_vo") {
          rows = stats.computedDetailsList.filter(d => d.baseUsado > 0).map(d => ({ ...d, value: d.baseUsado }));
          showExplanation = "Comisiones de vehículos de ocasión (VO), seminuevos, KM0 o buybacks matriculados, calculadas según las tarifas de VO o patrón asignado.";
          showTotalLabel = "Total Base VO";
        } else if (type === "credito") {
          rows = stats.computedDetailsList.filter(d => d.baseFinanciacion > 0).map(d => ({ ...d, value: d.baseFinanciacion }));
          showExplanation = "Importes devengados por operaciones de financiación (Crédito/Renting RCI) con fecha RCI en el período.";
          showTotalLabel = "Total Financiación";
        } else if (type === "preference") {
          rows = stats.computedDetailsList.filter(d => d.basePreference > 0).map(d => ({ ...d, value: d.basePreference }));
          showExplanation = "Importes devengados por reglas de productos Preference o BOX3 en el período.";
          showTotalLabel = "Total Preference";
        } else if (type === "bonus") {
          rows = stats.computedDetailsList.filter(d => d.reglasBonus > 0).map(d => ({ ...d, value: d.reglasBonus }));
          showExplanation = "Bonus, campañas e incentivos adicionales que cumplen las condiciones del plan de comisiones.";
          showTotalLabel = "Total Bonus";
        } else if (type === "penalizaciones") {
          rows = stats.computedDetailsList.filter(d => d.reglasPenalizacion > 0).map(d => ({ ...d, value: d.reglasPenalizacion }));
          showExplanation = "Penalizaciones o descuentos aplicados individualmente a los expedientes según las reglas del plan.";
          showTotalLabel = "Total Penalizaciones";
          isNegative = true;
        } else if (type === "comision_teorica") {
          rows = stats.computedDetailsList.filter(d => d.totalTeorico > 0).map(d => ({ ...d, value: d.totalTeorico }));
          showExplanation = "Suma acumulada de comisiones brutas devengadas por los expedientes antes de aplicar penalizaciones fijas globales o penalizaciones de mínimos.";
          showTotalLabel = "Total Comisión Teórica";
        } else if (type === "total_estimado") {
          rows = stats.computedDetailsList.map(d => ({ ...d, value: d.total }));
          showExplanation = "Comisión neta final a liquidar en este período. Si no se alcanza el mínimo de matriculaciones, se penaliza reduciéndose a 0 €.";
          showTotalLabel = "Total Estimado Neto";
        }

        const sumTotal = rows.reduce((sum, r) => sum + r.value, 0);

        return (
          <div className="modal-overlay" style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0, 0, 0, 0.65)",
            backdropFilter: "blur(4px)",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            zIndex: 9999,
            padding: "20px"
          }}>
            <div className="modal-content glass-panel" style={{
              background: "var(--bg-card, #111827)",
              border: "1px solid var(--border-light, rgba(255,255,255,0.08))",
              borderRadius: "var(--radius-md, 8px)",
              padding: "24px",
              width: "100%",
              maxWidth: "850px",
              maxHeight: "90vh",
              overflowY: "auto",
              boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.4)"
            }}>
              {/* Header */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", borderBottom: "1px solid var(--border-light, rgba(255,255,255,0.08))", paddingBottom: "12px" }}>
                <h3 style={{ margin: 0, fontSize: "1.2rem", display: "flex", alignItems: "center", gap: "8px", color: "var(--text-primary)" }}>
                  <span>{title}</span>
                </h3>
                <button
                  onClick={() => setComisionesDetailModal(null)}
                  style={{ background: "none", border: "none", color: "var(--text-secondary)", cursor: "pointer", fontSize: "1.2rem" }}
                >
                  ✕
                </button>
              </div>

              {/* Contenido */}
              <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                <div style={{
                  backgroundColor: "rgba(255, 255, 255, 0.02)",
                  border: "1px solid var(--border-light, rgba(255,255,255,0.08))",
                  borderRadius: "var(--radius-sm, 4px)",
                  padding: "12px 16px",
                  fontSize: "0.85rem",
                  color: "var(--text-secondary)",
                  lineHeight: "1.4"
                }}>
                  {showExplanation}
                </div>

                {type === "penalizacion_fija" ? (
                  <div style={{
                    padding: "20px",
                    backgroundColor: "rgba(239, 68, 68, 0.03)",
                    border: "1px dashed rgba(239, 68, 68, 0.2)",
                    borderRadius: "4px",
                    color: "var(--text-primary)"
                  }}>
                    <h4 style={{ margin: "0 0 8px 0", fontSize: "1rem", color: "var(--danger)" }}>
                      ⚠️ {activePlan?.penalizacion_titulo || "Penalización Fija de Liquidación"}
                    </h4>
                    <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                      {activePlan?.penalizacion_descripcion || "No hay una descripción detallada en el plan activo."}
                    </p>
                    <div style={{ marginTop: "16px", fontSize: "1.2rem", fontWeight: "bold", color: "var(--danger)" }}>
                      Importe: -{Math.abs(activePlan?.penalizacion_importe || 0).toLocaleString("es-ES", { style: "currency", currency: "EUR" })}
                    </div>
                  </div>
                ) : (
                  <div>
                    {rows.length === 0 ? (
                      <div style={{ padding: "30px 10px", textAlign: "center", color: "var(--text-muted)", fontStyle: "italic", fontSize: "0.85rem" }}>
                        No hay expedientes que aporten a este importe en el periodo actual.
                      </div>
                    ) : (
                      <>
                        <div className="table-container" style={{ border: "1px solid var(--border-light, rgba(255,255,255,0.08))", borderRadius: "var(--radius-sm, 4px)" }}>
                          <table className="table-premium" style={{ fontSize: "0.82rem", width: "100%" }}>
                            <thead>
                              <tr>
                                <th>Expediente</th>
                                <th>Comercial</th>
                                <th>Cliente</th>
                                <th>Vehículo</th>
                                <th>Fecha Ref</th>
                                <th style={{ textAlign: "right" }}>Importe</th>
                              </tr>
                            </thead>
                            <tbody>
                              {rows.map((r: any) => (
                                <tr key={r.id_expediente}>
                                  <td style={{ fontWeight: 600 }}>
                                    <Link 
                                      href={`/dashboard/expedientes/editar/${r.id_expediente}`}
                                      onClick={() => setComisionesDetailModal(null)}
                                      style={{ color: "var(--primary)", textDecoration: "none" }}
                                    >
                                      #EXP-{String(r.id_expediente).padStart(4, "0")}
                                    </Link>
                                  </td>
                                  <td>{r.vendedor}</td>
                                  <td style={{ maxWidth: "150px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={r.cliente}>
                                    {r.cliente}
                                  </td>
                                  <td>
                                    <span style={{ fontWeight: 600 }}>{r.marca}</span> {r.modelo} 
                                    <span style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginLeft: "6px" }}>({r.estado})</span>
                                  </td>
                                  <td style={{ color: "var(--text-muted)" }}>{formatDate(r.fechaRef)}</td>
                                  <td style={{ textAlign: "right", fontWeight: 700, color: isNegative ? "var(--danger)" : "var(--text-primary)" }}>
                                    {isNegative ? "-" : ""}{r.value.toLocaleString("es-ES", { style: "currency", currency: "EUR" })}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>

                        {/* Sumario del total */}
                        <div style={{
                          display: "flex",
                          justifyContent: "flex-end",
                          marginTop: "16px",
                          padding: "12px 16px",
                          backgroundColor: "rgba(255, 255, 255, 0.02)",
                          border: "1px solid var(--border-light, rgba(255,255,255,0.08))",
                          borderRadius: "4px",
                          fontSize: "0.95rem"
                        }}>
                          <span style={{ color: "var(--text-secondary)", marginRight: "12px" }}>{showTotalLabel}:</span>
                          <strong style={{ color: isNegative ? "var(--danger)" : "var(--success)" }}>
                            {isNegative ? "-" : ""}{sumTotal.toLocaleString("es-ES", { style: "currency", currency: "EUR" })}
                          </strong>
                        </div>
                      </>
                    )}
                  </div>
                )}

                {/* Footer del Modal */}
                <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "12px", borderTop: "1px solid var(--border-light, rgba(255,255,255,0.08))", paddingTop: "16px" }}>
                  <button
                    onClick={() => setComisionesDetailModal(null)}
                    className="btn btn-secondary"
                    style={{ padding: "8px 16px", fontSize: "0.85rem" }}
                  >
                    Cerrar Detalle
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
