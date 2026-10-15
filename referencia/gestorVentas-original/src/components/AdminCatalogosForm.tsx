"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

interface MarcaItem {
  id_marca: number;
  nombre: string;
  activo: boolean | null;
  acceso_rapido?: boolean | null;
  sistema_comisiones?: boolean | null;
  modelos: {
    id_modelo: number;
    nombre_modelo: string;
    acceso_rapido?: boolean | null;
    orden_acceso_rapido?: number | null;
  }[];
}

interface DropdownItem {
  id: number;
  nombre: string;
  color?: string | null;
  predeterminado?: boolean | null;
  orden?: number | null;
}

interface TiendaItem {
  id_tienda: number;
  nombre: string;
  ciudad: string | null;
}

interface AdminCatalogosFormProps {
  marcasIniciales: MarcaItem[];
  tiposVentaIniciales: DropdownItem[];
  estadosVehiculoIniciales: DropdownItem[];
  tiendasIniciales: TiendaItem[];
  tiendaPredeterminadaIdInicial?: number | null;
}

type TabType = "marcas" | "modelos" | "tiendas" | "pagos" | "estados" | "expedientes" | "bbdd";

export default function AdminCatalogosForm({
  marcasIniciales,
  tiposVentaIniciales,
  estadosVehiculoIniciales,
  tiendasIniciales,
  tiendaPredeterminadaIdInicial = null
}: AdminCatalogosFormProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabType>("marcas");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Datos locales
  const [marcas, setMarcas] = useState<MarcaItem[]>(marcasIniciales);
  const [tiposVenta, setTiposVenta] = useState<DropdownItem[]>(tiposVentaIniciales);
  const [estadosVehiculo, setEstadosVehiculo] = useState<DropdownItem[]>(estadosVehiculoIniciales);
  const [tiendas, setTiendas] = useState<TiendaItem[]>(tiendasIniciales);
  const [tiendaPredeterminadaId, setTiendaPredeterminadaId] = useState<number | null>(tiendaPredeterminadaIdInicial);

  // Preferencias de expedientes (localStorage)
  const [expDefaultPageSize, setExpDefaultPageSize] = useState<number>(20);

  // Estados para limpieza de base de datos BBDD
  const [analyzingDb, setAnalyzingDb] = useState(false);
  const [cleaningDb, setCleaningDb] = useState(false);
  const [dbAnalysis, setDbAnalysis] = useState<any | null>(null);

  // Visibilidad de botones CSV
  const [mostrarBotonesCSV, setMostrarBotonesCSV] = useState(true);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const res = await fetch("/api/admin/ajustes");
        const result = await res.json();
        if (result.success && result.data) {
          if (result.data.mostrar_botones_csv !== undefined) {
            setMostrarBotonesCSV(result.data.mostrar_botones_csv === "true");
          }
        }
      } catch (err) {
        console.error("Error al cargar los ajustes:", err);
      }
    };
    fetchSettings();
  }, []);

  const handleToggleCSVButtons = async (val: boolean) => {
    setMostrarBotonesCSV(val);
    try {
      const res = await fetch("/api/admin/ajustes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clave: "mostrar_botones_csv", valor: String(val) })
      });
      const result = await res.json();
      if (result.success) {
        showNotification("Ajuste de visibilidad de botones CSV guardado con éxito", "success");
      } else {
        showNotification("Error al guardar el ajuste de CSV en la base de datos", "error");
      }
    } catch (err) {
      console.error(err);
      showNotification("Error de conexión al guardar el ajuste de CSV", "error");
    }
  };

  // Cargar preferencias guardadas al montar
  const [prefLoaded, setPrefLoaded] = useState(false);
  if (!prefLoaded && typeof window !== "undefined") {
    const stored = localStorage.getItem("exp-default-page-size");
    if (stored) setExpDefaultPageSize(Number(stored));
    setPrefLoaded(true);
  }

  // Estados de ordenación
  const [sortField, setSortField] = useState<string>("id");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [modelSearchQuery, setModelSearchQuery] = useState<string>("");

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortOrder("asc");
    }
  };

  const changeTab = (tab: TabType) => {
    setActiveTab(tab);
    setSortField("id");
    setSortOrder("asc");
    setModelSearchQuery("");
  };

  // Listados ordenados
  const sortedMarcas = [...marcas].sort((a, b) => {
    let aVal: any = a.id_marca;
    let bVal: any = b.id_marca;
    if (sortField === "nombre") {
      aVal = a.nombre;
      bVal = b.nombre;
    } else if (sortField === "activo") {
      aVal = a.activo ? 1 : 0;
      bVal = b.activo ? 1 : 0;
    } else if (sortField === "acceso_rapido") {
      aVal = a.acceso_rapido ? 1 : 0;
      bVal = b.acceso_rapido ? 1 : 0;
    } else if (sortField === "sistema_comisiones") {
      aVal = a.sistema_comisiones ? 1 : 0;
      bVal = b.sistema_comisiones ? 1 : 0;
    } else if (sortField === "modelos") {
      aVal = a.modelos.length;
      bVal = b.modelos.length;
    }
    
    if (aVal < bVal) return sortOrder === "asc" ? -1 : 1;
    if (aVal > bVal) return sortOrder === "asc" ? 1 : -1;
    return 0;
  });

  const flatModelos = marcas.flatMap(m => 
    m.modelos.map(mod => ({
      id_modelo: mod.id_modelo,
      nombre_modelo: mod.nombre_modelo,
      acceso_rapido: mod.acceso_rapido,
      id_marca: m.id_marca,
      nombre_marca: m.nombre,
      sistema_comisiones: !!m.sistema_comisiones,
      orden_acceso_rapido: mod.orden_acceso_rapido || 0
    }))
  );

  const filteredModelos = flatModelos.filter(mod => {
    if (!modelSearchQuery) return true;
    const query = modelSearchQuery.toLowerCase();
    return mod.nombre_modelo.toLowerCase().includes(query) || mod.nombre_marca.toLowerCase().includes(query);
  });

  const sortedModelos = [...filteredModelos].sort((a, b) => {
    let aVal: any = a.nombre_marca; // por defecto ordenar por marca
    let bVal: any = b.nombre_marca;
    
    if (sortField === "nombre") {
      aVal = a.nombre_modelo;
      bVal = b.nombre_modelo;
    } else if (sortField === "acceso_rapido") {
      aVal = a.acceso_rapido ? 1 : 0;
      bVal = b.acceso_rapido ? 1 : 0;
    } else if (sortField === "orden_acceso_rapido") {
      aVal = a.orden_acceso_rapido || 0;
      bVal = b.orden_acceso_rapido || 0;
    } else if (sortField === "marca") {
      aVal = a.nombre_marca;
      bVal = b.nombre_marca;
    } else if (sortField === "id") {
      // Por defecto ordenar por nombre de marca y luego por nombre de modelo
      const brandCompare = a.nombre_marca.localeCompare(b.nombre_marca);
      if (brandCompare !== 0) return sortOrder === "asc" ? brandCompare : -brandCompare;
      return sortOrder === "asc" ? a.nombre_modelo.localeCompare(b.nombre_modelo) : -a.nombre_modelo.localeCompare(b.nombre_modelo);
    }
    
    if (aVal < bVal) return sortOrder === "asc" ? -1 : 1;
    if (aVal > bVal) return sortOrder === "asc" ? 1 : -1;

    // Sub-ordenar por nombre de modelo si las marcas son iguales
    if (sortField === "marca" || sortField === "id") {
      return sortOrder === "asc" ? a.nombre_modelo.localeCompare(b.nombre_modelo) : -a.nombre_modelo.localeCompare(b.nombre_modelo);
    }
    return 0;
  });


  const sortedTiendas = [...tiendas].sort((a, b) => {
    let aVal: any = a.id_tienda;
    let bVal: any = b.id_tienda;
    if (sortField === "nombre") {
      aVal = a.nombre;
      bVal = b.nombre;
    } else if (sortField === "ciudad") {
      aVal = a.ciudad || "";
      bVal = b.ciudad || "";
    }
    
    if (aVal < bVal) return sortOrder === "asc" ? -1 : 1;
    if (aVal > bVal) return sortOrder === "asc" ? 1 : -1;
    return 0;
  });

  const sortedTiposVenta = [...tiposVenta].sort((a, b) => {
    let aVal: any = a.id;
    let bVal: any = b.id;
    if (sortField === "nombre") {
      aVal = a.nombre;
      bVal = b.nombre;
    } else if (sortField === "orden") {
      aVal = a.orden || 0;
      bVal = b.orden || 0;
    }
    
    if (aVal < bVal) return sortOrder === "asc" ? -1 : 1;
    if (aVal > bVal) return sortOrder === "asc" ? 1 : -1;
    return 0;
  });

  const sortedEstadosVehiculo = [...estadosVehiculo].sort((a, b) => {
    let aVal: any = a.id;
    let bVal: any = b.id;
    if (sortField === "nombre") {
      aVal = a.nombre;
      bVal = b.nombre;
    }
    
    if (aVal < bVal) return sortOrder === "asc" ? -1 : 1;
    if (aVal > bVal) return sortOrder === "asc" ? 1 : -1;
    return 0;
  });

  // Estados de formularios
  const [nuevaMarcaNombre, setNuevaMarcaNombre] = useState("");
  const [nuevaMarcaAccesoRapido, setNuevaMarcaAccesoRapido] = useState(false);
  const [nuevaMarcaSistemaComisiones, setNuevaMarcaSistemaComisiones] = useState(false);
  const [nuevoModeloMarcaId, setNuevoModeloMarcaId] = useState<number | "">("");
  const [nuevoModeloNombre, setNuevoModeloNombre] = useState("");
  const [nuevoModeloAccesoRapido, setNuevoModeloAccesoRapido] = useState(false);
  const [nuevoModeloOrden, setNuevoModeloOrden] = useState<number>(0);
  const [tempOrders, setTempOrders] = useState<Record<number, number>>({});
  const [nuevoTipoVentaNombre, setNuevoTipoVentaNombre] = useState("");
  const [nuevoTipoVentaColor, setNuevoTipoVentaColor] = useState("#3b82f6");
  const [nuevoTipoVentaOrden, setNuevoTipoVentaOrden] = useState<number>(0);
  const [tempPagosOrders, setTempPagosOrders] = useState<Record<number, number>>({});
  const [nuevoEstadoVehiculoNombre, setNuevoEstadoVehiculoNombre] = useState("");
  const [nuevoEstadoVehiculoPredeterminado, setNuevoEstadoVehiculoPredeterminado] = useState(false);
  const [nuevaTiendaNombre, setNuevaTiendaNombre] = useState("");
  const [nuevaTiendaCiudad, setNuevaTiendaCiudad] = useState("");

  const showNotification = (text: string, type: "success" | "error") => {
    if (type === "success") {
      setSuccess(text);
      setTimeout(() => setSuccess(null), 3000);
    } else {
      setError(text);
      setTimeout(() => setError(null), 4000);
    }
  };

  const handleAnalyzeDb = async () => {
    setAnalyzingDb(true);
    try {
      const res = await fetch("/api/admin/db-cleanup");
      const data = await res.json();
      if (data.success) {
        setDbAnalysis(data);
        showNotification("Análisis de base de datos completado.", "success");
      } else {
        showNotification(data.message || "Error al analizar base de datos.", "error");
      }
    } catch (e) {
      console.error(e);
      showNotification("Error de conexión al analizar la base de datos.", "error");
    } finally {
      setAnalyzingDb(false);
    }
  };

  const handleBackupAndCleanDb = async () => {
    if (!dbAnalysis || !dbAnalysis.stats || dbAnalysis.stats.totalAnomalies === 0) {
      showNotification("No hay anomalías que limpiar.", "error");
      return;
    }

    if (!window.confirm(`¿Estás seguro de que deseas limpiar las ${dbAnalysis.stats.totalAnomalies} anomalías detectadas?\n\nSe descargará automáticamente un backup JSON antes de proceder de forma segura.`)) {
      return;
    }

    setCleaningDb(true);
    try {
      // 1. Exportar backup primero
      const backupRes = await fetch("/api/admin/backup", { method: "GET" });
      if (!backupRes.ok) throw new Error("Error al generar el backup previo.");
      const backupData = await backupRes.json();
      
      const backupWithPrefs = {
        ...backupData,
        preferences: {
          expDefaultPageSize
        }
      };

      const jsonString = `data:text/json;charset=utf-8,${encodeURIComponent(
        JSON.stringify(backupWithPrefs, null, 2)
      )}`;
      const downloadAnchor = document.createElement("a");
      downloadAnchor.setAttribute("href", jsonString);
      downloadAnchor.setAttribute(
        "download",
        `backup_previo_limpieza_${new Date().toISOString().split("T")[0]}.json`
      );
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();

      // 2. Ejecutar limpieza en el servidor
      const details = dbAnalysis.details || {};
      const payload = {
        cleanLines: details.orphanLines?.map((l: any) => l.id_line) || [],
        cleanEmails: details.orphanEmails?.map((e: any) => e.id) || [],
        cleanTelefonos: details.orphanTelefonos?.map((t: any) => t.id) || [],
        cleanUserTiendas: details.orphanUserTiendas?.map((ut: any) => ut.id) || [],
        cleanImportRegistros: details.orphanImportRegistros?.map((ir: any) => ir.id) || []
      };

      const cleanRes = await fetch("/api/admin/db-cleanup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const cleanData = await cleanRes.json();

      if (cleanData.success) {
        showNotification("Base de datos limpiada con éxito. Backup descargado.", "success");
        await handleAnalyzeDb();
        router.refresh();
      } else {
        showNotification(cleanData.message || "Error al ejecutar limpieza.", "error");
      }
    } catch (e: any) {
      console.error(e);
      showNotification(e.message || "Error al realizar backup y limpieza.", "error");
    } finally {
      setCleaningDb(false);
    }
  };

  // Estados para edición
  const [editingType, setEditingType] = useState<TabType | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingNombre, setEditingNombre] = useState("");
  const [editingExtra, setEditingExtra] = useState(""); // para ciudad en tiendas
  const [editingColor, setEditingColor] = useState(""); // para color en tipos de pago
  const [editingPredeterminado, setEditingPredeterminado] = useState(false); // para predeterminado en estados

  const iniciarEdicion = (tipo: TabType, id: number, nombre: string, extra = "", color = "", predeterminado = false) => {
    setEditingType(tipo);
    setEditingId(id);
    setEditingNombre(nombre);
    setEditingExtra(extra);
    setEditingColor(color);
    setEditingPredeterminado(predeterminado);
  };

  const cancelarEdicion = () => {
    setEditingType(null);
    setEditingId(null);
    setEditingNombre("");
    setEditingExtra("");
    setEditingColor("");
    setEditingPredeterminado(false);
  };

  const handleGuardarEdicion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingNombre.trim() || !editingId || !editingType) return;
    setLoading(true);

    try {
      if (editingType === "tiendas") {
        const res = await fetch("/api/admin/tiendas", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id_tienda: editingId, nombre: editingNombre, ciudad: editingExtra })
        });
        if (!res.ok) throw new Error("Error al actualizar la tienda");
        const result = await res.json();
        setTiendas(tiendas.map(t => t.id_tienda === editingId ? { ...t, nombre: result.data.nombre, ciudad: result.data.ciudad } : t));
        showNotification("Tienda actualizada correctamente", "success");
      } else {
        let payloadType = editingType as string;
        if (editingType === "pagos") {
          payloadType = "tipo_venta";
        } else if (editingType === "estados") {
          payloadType = "estado_vehiculo";
        } else if (editingType === "marcas") {
          payloadType = "marca";
        } else if (editingType === "modelos") {
          payloadType = "modelo";
        }

        const res = await fetch("/api/admin/catalogos", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tipo: payloadType,
            id: editingId,
            nombre: editingNombre,
            nombre_modelo: editingNombre,
            nombre_tipo_venta: editingNombre,
            nombre_estado_vehiculo: editingNombre,
            color: editingColor,
            predeterminado: editingPredeterminado
          })
        });

        if (!res.ok) throw new Error("Error al actualizar catálogo");
        const result = await res.json();

        if (payloadType === "marca") {
          setMarcas(marcas.map(m => m.id_marca === editingId ? { ...m, nombre: result.data.nombre } : m));
        } else if (payloadType === "modelo") {
          setMarcas(marcas.map(m => ({
            ...m,
            modelos: m.modelos.map(mod => mod.id_modelo === editingId ? { ...mod, nombre_modelo: result.data.nombre_modelo } : mod)
          })));
        } else if (payloadType === "tipo_venta") {
          setTiposVenta(tiposVenta.map(tv => tv.id === editingId ? { ...tv, nombre: result.data.nombre_tipo_venta, color: result.data.color, orden: result.data.orden } : tv));
        } else if (payloadType === "estado_vehiculo") {
          if (result.data.predeterminado) {
            setEstadosVehiculo(estadosVehiculo.map(ev => ev.id === editingId ? { ...ev, nombre: result.data.nombre_estado_vehiculo, predeterminado: true } : { ...ev, predeterminado: false }));
          } else {
            setEstadosVehiculo(estadosVehiculo.map(ev => ev.id === editingId ? { ...ev, nombre: result.data.nombre_estado_vehiculo, predeterminado: false } : ev));
          }
        }

        showNotification("Elemento actualizado correctamente", "success");
      }
      cancelarEdicion();
      router.refresh();
    } catch (err: any) {
      showNotification(err.message, "error");
    } finally {
      setLoading(false);
    }
  }

  const handleToggleMarcaSistemaComisiones = async (idMarca: number, estadoActual: boolean) => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/catalogos", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo: "marca", id: idMarca, sistema_comisiones: !estadoActual, nombre: marcas.find(m => m.id_marca === idMarca)?.nombre })
      });
      if (!res.ok) throw new Error("Error al cambiar sistema de comisiones de la marca");
      const result = await res.json();
      setMarcas(marcas.map(m => m.id_marca === idMarca ? { ...m, sistema_comisiones: result.data.sistema_comisiones } : m));
      showNotification("Sistema de comisiones de la marca actualizado", "success");
      router.refresh();
    } catch (err: any) {
      showNotification(err.message, "error");
    } finally {
      setLoading(false);
    }
  };

  const handleToggleMarcaAccesoRapido = async (idMarca: number, estadoActual: boolean) => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/catalogos", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo: "marca", id: idMarca, acceso_rapido: !estadoActual, nombre: marcas.find(m => m.id_marca === idMarca)?.nombre })
      });
      if (!res.ok) throw new Error("Error al cambiar acceso rápido de la marca");
      const result = await res.json();
      setMarcas(marcas.map(m => m.id_marca === idMarca ? { ...m, acceso_rapido: result.data.acceso_rapido } : m));
      showNotification("Acceso rápido de la marca actualizado", "success");
      router.refresh();
    } catch (err: any) {
      showNotification(err.message, "error");
    } finally {
      setLoading(false);
    }
  };

  const handleToggleModeloAccesoRapido = async (idModelo: number, estadoActual: boolean) => {
    setLoading(true);
    try {
      const modelItem = flatModelos.find(m => m.id_modelo === idModelo);
      const res = await fetch("/api/admin/catalogos", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo: "modelo", id: idModelo, acceso_rapido: !estadoActual, nombre_modelo: modelItem?.nombre_modelo })
      });
      if (!res.ok) throw new Error("Error al cambiar acceso rápido del modelo");
      const result = await res.json();
      setMarcas(marcas.map(m => ({
        ...m,
        modelos: m.modelos.map(mod => mod.id_modelo === idModelo ? { ...mod, acceso_rapido: result.data.acceso_rapido } : mod)
      })));
      showNotification("Acceso rápido del modelo actualizado", "success");
      router.refresh();
    } catch (err: any) {
      showNotification(err.message, "error");
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateModelOrder = async (idModelo: number, nuevoOrden: number, idMarca: number) => {
    setLoading(true);
    try {
      const modelItem = flatModelos.find(m => m.id_modelo === idModelo);
      const res = await fetch("/api/admin/catalogos", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          tipo: "modelo", 
          id: idModelo, 
          orden_acceso_rapido: nuevoOrden, 
          nombre_modelo: modelItem?.nombre_modelo 
        })
      });
      if (!res.ok) throw new Error("Error al cambiar el orden del modelo");
      const result = await res.json();
      setMarcas(marcas.map(m => {
        if (m.id_marca === idMarca) {
          return {
            ...m,
            modelos: m.modelos.map(mod => mod.id_modelo === idModelo ? { ...mod, orden_acceso_rapido: result.data.orden_acceso_rapido } : mod)
          };
        }
        return m;
      }));
      showNotification("Orden de modelo actualizado", "success");
      router.refresh();
    } catch (err: any) {
      showNotification(err.message, "error");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveBrandModelOrders = async (modelosList: any[]) => {
    const changes = modelosList.filter(mod => {
      const tempVal = tempOrders[mod.id_modelo];
      return tempVal !== undefined && tempVal !== mod.orden_acceso_rapido;
    });

    if (changes.length === 0) {
      showNotification("No hay cambios en el orden para guardar", "error");
      return;
    }

    setLoading(true);
    try {
      await Promise.all(changes.map(async (mod) => {
        const nuevoOrden = tempOrders[mod.id_modelo];
        const res = await fetch("/api/admin/catalogos", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
            tipo: "modelo", 
            id: mod.id_modelo, 
            orden_acceso_rapido: nuevoOrden, 
            nombre_modelo: mod.nombre_modelo 
          })
        });
        if (!res.ok) throw new Error(`Error al actualizar el modelo ${mod.nombre_modelo}`);
      }));

      setMarcas(prevMarcas => prevMarcas.map(m => {
        return {
          ...m,
          modelos: m.modelos.map(mod => {
            const tempVal = tempOrders[mod.id_modelo];
            if (tempVal !== undefined) {
              return { ...mod, orden_acceso_rapido: tempVal };
            }
            return mod;
          })
        };
      }));

      const updatedTempOrders = { ...tempOrders };
      changes.forEach(c => {
        delete updatedTempOrders[c.id_modelo];
      });
      setTempOrders(updatedTempOrders);

      showNotification("Orden de modelos guardado correctamente", "success");
      router.refresh();
    } catch (err: any) {
      showNotification(err.message, "error");
    } finally {
      setLoading(false);
    }
  };

  const handleSavePagosOrders = async () => {
    const changes = tiposVenta.filter(tv => {
      const tempVal = tempPagosOrders[tv.id];
      return tempVal !== undefined && tempVal !== tv.orden;
    });

    if (changes.length === 0) {
      showNotification("No hay cambios en el orden para guardar", "error");
      return;
    }

    setLoading(true);
    try {
      await Promise.all(changes.map(async (tv) => {
        const nuevoOrden = tempPagosOrders[tv.id];
        const res = await fetch("/api/admin/catalogos", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
            tipo: "tipo_venta", 
            id: tv.id, 
            orden: nuevoOrden, 
            nombre_tipo_venta: tv.nombre 
          })
        });
        if (!res.ok) throw new Error(`Error al actualizar el tipo de venta ${tv.nombre}`);
      }));

      setTiposVenta(prevTipos => prevTipos.map(tv => {
        const tempVal = tempPagosOrders[tv.id];
        if (tempVal !== undefined) {
          return { ...tv, orden: tempVal };
        }
        return tv;
      }));

      const updatedTempOrders = { ...tempPagosOrders };
      changes.forEach(c => {
        delete updatedTempOrders[c.id];
      });
      setTempPagosOrders(updatedTempOrders);

      showNotification("Orden de pagos actualizado correctamente", "success");
      router.refresh();
    } catch (err: any) {
      showNotification(err.message, "error");
    } finally {
      setLoading(false);
    }
  };

  const handleToggleEstadoPredeterminado = async (idEstado: number, estadoActual: boolean) => {
    if (estadoActual) return; // Ya es predeterminado
    setLoading(true);
    try {
      const stateItem = estadosVehiculo.find(ev => ev.id === idEstado);
      const res = await fetch("/api/admin/catalogos", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          tipo: "estado_vehiculo", 
          id: idEstado, 
          predeterminado: true, 
          nombre_estado_vehiculo: stateItem?.nombre 
        })
      });
      if (!res.ok) throw new Error("Error al cambiar el estado predeterminado");
      setEstadosVehiculo(estadosVehiculo.map(ev => ev.id === idEstado ? { ...ev, predeterminado: true } : { ...ev, predeterminado: false }));
      showNotification("Estado predeterminado actualizado", "success");
      router.refresh();
    } catch (err: any) {
      showNotification(err.message, "error");
    } finally {
      setLoading(false);
    }
  };

  // --- ACCIONES DE CREACIÓN ---

  const handleCrearMarca = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nuevaMarcaNombre.trim()) return;
    setLoading(true);

    try {
      const res = await fetch("/api/admin/catalogos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo: "marca", nombre: nuevaMarcaNombre, acceso_rapido: nuevaMarcaAccesoRapido, sistema_comisiones: nuevaMarcaSistemaComisiones })
      });

      if (!res.ok) throw new Error("Error al crear la marca");
      const result = await res.json();
      
      setMarcas([...marcas, { ...result.data, modelos: [] }]);
      setNuevaMarcaNombre("");
      setNuevaMarcaAccesoRapido(false);
      setNuevaMarcaSistemaComisiones(false);
      showNotification("Marca creada correctamente", "success");
      router.refresh();
    } catch (err: any) {
      showNotification(err.message, "error");
    } finally {
      setLoading(false);
    }
  };

  const handleCrearModelo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nuevoModeloMarcaId || !nuevoModeloNombre.trim()) return;
    setLoading(true);

    try {
      const res = await fetch("/api/admin/catalogos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipo: "modelo",
          marca_id: nuevoModeloMarcaId,
          nombre_modelo: nuevoModeloNombre,
          acceso_rapido: nuevoModeloAccesoRapido,
          orden_acceso_rapido: nuevoModeloOrden
        })
      });

      if (!res.ok) throw new Error("Error al crear el modelo");
      const result = await res.json();

      setMarcas(marcas.map(m => {
        if (m.id_marca === Number(nuevoModeloMarcaId)) {
          return {
            ...m,
            modelos: [...m.modelos, { 
              id_modelo: result.data.id_modelo, 
              nombre_modelo: result.data.nombre_modelo, 
              acceso_rapido: result.data.acceso_rapido,
              orden_acceso_rapido: result.data.orden_acceso_rapido 
            }]
          };
        }
        return m;
      }));
      setNuevoModeloNombre("");
      let defaultAccesoRapido = false;
      if (typeof nuevoModeloMarcaId === "number") {
        const marca = marcas.find(m => m.id_marca === nuevoModeloMarcaId);
        if (marca) {
          const nombreNorm = marca.nombre.toLowerCase().trim();
          if (nombreNorm === "renault" || nombreNorm === "dacia") {
            defaultAccesoRapido = true;
          }
        }
      }
      setNuevoModeloAccesoRapido(defaultAccesoRapido);
      setNuevoModeloOrden(0);
      showNotification("Modelo creado correctamente", "success");
      router.refresh();
    } catch (err: any) {
      showNotification(err.message, "error");
    } finally {
      setLoading(false);
    }
  };

  const handleCrearTienda = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nuevaTiendaNombre.trim()) return;
    setLoading(true);

    try {
      const res = await fetch("/api/admin/tiendas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre: nuevaTiendaNombre, ciudad: nuevaTiendaCiudad })
      });

      if (!res.ok) throw new Error("Error al crear tienda");
      const result = await res.json();

      setTiendas([...tiendas, {
        id_tienda: result.data.id_tienda,
        nombre: result.data.nombre,
        ciudad: result.data.ciudad
      }]);
      setNuevaTiendaNombre("");
      setNuevaTiendaCiudad("");
      showNotification("Tienda creada correctamente", "success");
      router.refresh();
    } catch (err: any) {
      showNotification(err.message, "error");
    } finally {
      setLoading(false);
    }
  };

  const handleCrearTipoVenta = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nuevoTipoVentaNombre.trim()) return;
    setLoading(true);

    try {
      const res = await fetch("/api/admin/catalogos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          tipo: "tipo_venta", 
          nombre_tipo_venta: nuevoTipoVentaNombre,
          color: nuevoTipoVentaColor,
          orden: nuevoTipoVentaOrden
        })
      });

      if (!res.ok) throw new Error("Error al crear tipo de venta");
      const result = await res.json();

      setTiposVenta([...tiposVenta, { 
        id: result.data.id_tipo_de_venta, 
        nombre: result.data.nombre_tipo_venta,
        color: result.data.color,
        orden: result.data.orden
      }]);
      setNuevoTipoVentaNombre("");
      setNuevoTipoVentaColor("#3b82f6");
      setNuevoTipoVentaOrden(0);
      showNotification("Tipo de venta creado", "success");
      router.refresh();
    } catch (err: any) {
      showNotification(err.message, "error");
    } finally {
      setLoading(false);
    }
  };

  const handleCrearEstadoVehiculo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nuevoEstadoVehiculoNombre.trim()) return;
    setLoading(true);

    try {
      const res = await fetch("/api/admin/catalogos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          tipo: "estado_vehiculo", 
          nombre_estado_vehiculo: nuevoEstadoVehiculoNombre,
          predeterminado: nuevoEstadoVehiculoPredeterminado
        })
      });

      if (!res.ok) throw new Error("Error al crear estado");
      const result = await res.json();

      const nuevoEstadoItem = { 
        id: result.data.id_estado_vehiculo, 
        nombre: result.data.nombre_estado_vehiculo,
        predeterminado: result.data.predeterminado
      };

      if (result.data.predeterminado) {
        setEstadosVehiculo([...estadosVehiculo.map(ev => ({ ...ev, predeterminado: false })), nuevoEstadoItem]);
      } else {
        setEstadosVehiculo([...estadosVehiculo, nuevoEstadoItem]);
      }

      setNuevoEstadoVehiculoNombre("");
      setNuevoEstadoVehiculoPredeterminado(false);
      showNotification("Estado de vehículo creado", "success");
      router.refresh();
    } catch (err: any) {
      showNotification(err.message, "error");
    } finally {
      setLoading(false);
    }
  };

  // --- ACCIONES DE ELIMINACIÓN ---

  const handleToggleMarcaActiva = async (idMarca: number, estadoActual: boolean) => {
    const nuevoEstado = !estadoActual;
    try {
      const res = await fetch("/api/admin/catalogos", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo: "marca", id: idMarca, toggleActivo: true, activo: nuevoEstado })
      });

      if (!res.ok) throw new Error("Error al cambiar estado de la marca");

      setMarcas(marcas.map(m => m.id_marca === idMarca ? { ...m, activo: nuevoEstado } : m));
      showNotification(`Marca ${nuevoEstado ? "activada" : "desactivada"}`, "success");
      router.refresh();
    } catch (err: any) {
      showNotification(err.message, "error");
    }
  };

  const handleEliminarMarcaFisicamente = async (idMarca: number, nombreMarca: string) => {
    if (!confirm(`¿Seguro que deseas eliminar definitivamente la marca "${nombreMarca}"? Se eliminarán todos sus modelos asociados.`)) return;

    try {
      const res = await fetch("/api/admin/catalogos", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo: "marca", id: idMarca })
      });

      if (res.status === 409) {
        throw new Error("No se puede eliminar la marca porque tiene modelos referenciados en expedientes activos.");
      }
      if (!res.ok) throw new Error("Error al eliminar la marca");

      setMarcas(marcas.filter(m => m.id_marca !== idMarca));
      showNotification("Marca eliminada con éxito", "success");
      router.refresh();
    } catch (err: any) {
      showNotification(err.message, "error");
    }
  };

  const handleEliminarModelo = async (idModelo: number, idMarca: number) => {
    if (!confirm("¿Seguro que deseas eliminar este modelo? Se borrará del catálogo.")) return;

    try {
      const res = await fetch("/api/admin/catalogos", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo: "modelo", id: idModelo })
      });

      if (res.status === 409) {
        throw new Error("No se puede eliminar este modelo porque está asociado a expedientes de venta activos.");
      }
      if (!res.ok) throw new Error("Error al eliminar modelo");

      setMarcas(marcas.map(m => {
        if (m.id_marca === idMarca) {
          return { ...m, modelos: m.modelos.filter(mod => mod.id_modelo !== idModelo) };
        }
        return m;
      }));
      showNotification("Modelo eliminado", "success");
      router.refresh();
    } catch (err: any) {
      showNotification(err.message, "error");
    }
  };

  const handleEliminarTienda = async (idTienda: number) => {
    if (!confirm("¿Seguro que deseas eliminar esta tienda física?")) return;

    try {
      const res = await fetch("/api/admin/tiendas", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id_tienda: idTienda })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Error al eliminar tienda");

      setTiendas(tiendas.filter(t => t.id_tienda !== idTienda));
      showNotification("Tienda eliminada con éxito", "success");
      router.refresh();
    } catch (err: any) {
      showNotification(err.message, "error");
    }
  };

  const handleEstablecerTiendaPredeterminada = async (idTienda: number | null) => {
    setLoading(true);
    try {
      const res = await fetch("/api/usuario/tienda-predeterminada", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id_tienda: idTienda })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Error al establecer la tienda predeterminada.");

      setTiendaPredeterminadaId(idTienda);
      showNotification(idTienda ? "Tienda predeterminada establecida correctamente" : "Tienda predeterminada quitada correctamente", "success");
      router.refresh();
    } catch (err: any) {
      showNotification(err.message || "Error al establecer tienda predeterminada", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleEliminarTipoVenta = async (idTipo: number) => {
    if (!confirm("¿Seguro que deseas eliminar este tipo de venta?")) return;

    try {
      const res = await fetch("/api/admin/catalogos", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo: "tipo_venta", id: idTipo })
      });

      if (res.status === 409) {
        throw new Error("No se puede eliminar porque tiene expedientes de venta registrados.");
      }
      if (!res.ok) throw new Error("Error al eliminar");

      setTiposVenta(tiposVenta.filter(t => t.id !== idTipo));
      showNotification("Tipo de venta eliminado", "success");
      router.refresh();
    } catch (err: any) {
      showNotification(err.message, "error");
    }
  };

  const handleEliminarEstadoVehiculo = async (idEstado: number) => {
    if (!confirm("¿Seguro que deseas eliminar este estado de vehículo?")) return;

    try {
      const res = await fetch("/api/admin/catalogos", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo: "estado_vehiculo", id: idEstado })
      });

      if (res.status === 409) {
        throw new Error("No se puede eliminar porque tiene expedientes de venta registrados.");
      }
      if (!res.ok) throw new Error("Error al eliminar");

      setEstadosVehiculo(estadosVehiculo.filter(ev => ev.id !== idEstado));
      showNotification("Estado de vehículo eliminado", "success");
      router.refresh();
    } catch (err: any) {
      showNotification(err.message, "error");
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "28px" }}>
      {/* NOTIFICACIONES FLOTANTES */}
      {(error || success) && (
        <div style={{
          position: "fixed",
          top: "24px",
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 9999,
          display: "flex",
          flexDirection: "column",
          gap: "10px",
          width: "90%",
          maxWidth: "450px",
          animation: "fadeIn 0.3s ease"
        }}>
          {error && (
            <div className="glass-panel" style={{
              padding: "16px 20px",
              color: "var(--danger)",
              borderLeft: "4px solid var(--danger)",
              background: "rgba(239, 68, 68, 0.1)",
              fontWeight: 500,
              display: "flex",
              alignItems: "center",
              gap: "10px",
              boxShadow: "0 10px 25px rgba(0,0,0,0.2)"
            }}>
              <span>⚠️ {error}</span>
            </div>
          )}
          {success && (
            <div className="glass-panel" style={{
              padding: "16px 20px",
              color: "var(--success)",
              borderLeft: "4px solid var(--success)",
              background: "rgba(16, 185, 129, 0.1)",
              fontWeight: 500,
              display: "flex",
              alignItems: "center",
              gap: "10px",
              boxShadow: "0 10px 25px rgba(0,0,0,0.2)"
            }}>
              <span>✓ {success}</span>
            </div>
          )}
        </div>
      )}

      {/* PESTAÑAS (TABS) */}
      <div style={{ display: "flex", justifyContent: "center", gap: "10px", borderBottom: "1px solid var(--border-light)", paddingBottom: "12px", flexWrap: "wrap" }}>
        <button
          type="button"
          className={`btn ${activeTab === "marcas" ? "btn-primary" : "btn-secondary"}`}
          onClick={() => changeTab("marcas")}
          style={{ padding: "10px 20px", fontSize: "0.9rem" }}
        >
          🏷️ Marcas
        </button>
        <button
          type="button"
          className={`btn ${activeTab === "modelos" ? "btn-primary" : "btn-secondary"}`}
          onClick={() => changeTab("modelos")}
          style={{ padding: "10px 20px", fontSize: "0.9rem" }}
        >
          🚙 Modelos
        </button>
        <button
          type="button"
          className={`btn ${activeTab === "tiendas" ? "btn-primary" : "btn-secondary"}`}
          onClick={() => changeTab("tiendas")}
          style={{ padding: "10px 20px", fontSize: "0.9rem" }}
        >
          🏢 Tiendas
        </button>
        <button
          type="button"
          className={`btn ${activeTab === "pagos" ? "btn-primary" : "btn-secondary"}`}
          onClick={() => changeTab("pagos")}
          style={{ padding: "10px 20px", fontSize: "0.9rem" }}
        >
          💰 Pagos
        </button>
        <button
          type="button"
          className={`btn ${activeTab === "estados" ? "btn-primary" : "btn-secondary"}`}
          onClick={() => changeTab("estados")}
          style={{ padding: "10px 20px", fontSize: "0.9rem" }}
        >
          🚗 Estados
        </button>
        <button
          type="button"
          className={`btn ${activeTab === "expedientes" ? "btn-primary" : "btn-secondary"}`}
          onClick={() => changeTab("expedientes")}
          style={{ padding: "10px 20px", fontSize: "0.9rem" }}
        >
          📋 Expedientes
        </button>
        <button
          type="button"
          className={`btn ${activeTab === "bbdd" ? "btn-primary" : "btn-secondary"}`}
          onClick={() => changeTab("bbdd")}
          style={{ padding: "10px 20px", fontSize: "0.9rem" }}
        >
          🗄️ BBDD
        </button>
      </div>

      {/* PESTAÑA: MARCAS */}
      {activeTab === "marcas" && (
        <div className="glass-panel" style={{ padding: "28px", display: "flex", flexDirection: "column", gap: "24px" }}>
          <h3 style={{ fontSize: "1.15rem" }}>Gestión de Marcas</h3>
          
          <form onSubmit={handleCrearMarca} style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
            <input
              type="text"
              className="form-input"
              placeholder="Nombre de nueva marca... (Ej. Nissan)"
              value={nuevaMarcaNombre}
              onChange={e => setNuevaMarcaNombre(e.target.value)}
              disabled={loading}
              required
              style={{ flex: 1 }}
            />
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <input
                type="checkbox"
                id="chkMarcaAccesoRapido"
                checked={nuevaMarcaAccesoRapido}
                onChange={e => setNuevaMarcaAccesoRapido(e.target.checked)}
                style={{ width: "18px", height: "18px", cursor: "pointer" }}
              />
              <label htmlFor="chkMarcaAccesoRapido" style={{ cursor: "pointer", fontSize: "0.9rem", color: "var(--text-secondary)", fontWeight: 500 }}>
                Acceso Rápido
              </label>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <input
                type="checkbox"
                id="chkMarcaSistemaComisiones"
                checked={nuevaMarcaSistemaComisiones}
                onChange={e => setNuevaMarcaSistemaComisiones(e.target.checked)}
                style={{ width: "18px", height: "18px", cursor: "pointer" }}
              />
              <label htmlFor="chkMarcaSistemaComisiones" style={{ cursor: "pointer", fontSize: "0.9rem", color: "var(--text-secondary)", fontWeight: 500 }}>
                Sist. Comisiones
              </label>
            </div>
            <button type="submit" className="btn btn-primary" style={{ padding: "12px 20px" }} disabled={loading}>
              + Crear Marca
            </button>
          </form>

          <div className="table-container">
            <table className="table-premium">
              <thead>
                <tr>

                  <th onClick={() => handleSort("nombre")} style={{ cursor: "pointer", userSelect: "none" }}>
                    Nombre Marca{sortField === "nombre" ? (sortOrder === "asc" ? " ▲" : " ▼") : " ↕"}
                  </th>
                  <th onClick={() => handleSort("activo")} style={{ cursor: "pointer", userSelect: "none" }}>
                    Estado{sortField === "activo" ? (sortOrder === "asc" ? " ▲" : " ▼") : " ↕"}
                  </th>
                  <th onClick={() => handleSort("acceso_rapido")} style={{ cursor: "pointer", userSelect: "none" }}>
                    Acceso Rápido{sortField === "acceso_rapido" ? (sortOrder === "asc" ? " ▲" : " ▼") : " ↕"}
                  </th>
                  <th onClick={() => handleSort("sistema_comisiones")} style={{ cursor: "pointer", userSelect: "none" }}>
                    Sist. Comisiones{sortField === "sistema_comisiones" ? (sortOrder === "asc" ? " ▲" : " ▼") : " ↕"}
                  </th>
                  <th onClick={() => handleSort("modelos")} style={{ cursor: "pointer", userSelect: "none" }}>
                    Modelos Asoc.{sortField === "modelos" ? (sortOrder === "asc" ? " ▲" : " ▼") : " ↕"}
                  </th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {sortedMarcas.map(m => {
                  const isEditing = editingType === "marcas" && editingId === m.id_marca;
                  return (
                    <tr key={m.id_marca}>
                      <td>
                        {isEditing ? (
                          <form onSubmit={handleGuardarEdicion} style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                            <input
                              type="text"
                              className="form-input"
                              value={editingNombre}
                              onChange={e => setEditingNombre(e.target.value)}
                              style={{ padding: "6px 10px", fontSize: "0.85rem" }}
                              required
                              autoFocus
                            />
                            <button type="submit" className="btn btn-primary" style={{ padding: "6px 10px" }} disabled={loading}>✓</button>
                            <button type="button" className="btn btn-secondary" onClick={cancelarEdicion} style={{ padding: "6px 10px" }}>✗</button>
                          </form>
                        ) : (
                          <span style={{ fontWeight: 600, color: m.activo ? "var(--text-primary)" : "var(--text-muted)" }}>
                            {m.nombre}
                          </span>
                        )}
                      </td>
                      <td>
                        <span className={`badge ${m.activo ? "badge-tienda" : "badge-admin"}`} style={{ fontSize: "0.75rem" }}>
                          {m.activo ? "Activa" : "Inactiva"}
                        </span>
                      </td>
                      <td>
                        <button
                          type="button"
                          className={`badge ${m.acceso_rapido ? "badge-tienda" : "badge-admin"}`}
                          onClick={() => handleToggleMarcaAccesoRapido(m.id_marca, !!m.acceso_rapido)}
                          disabled={loading}
                          style={{ border: "none", cursor: "pointer", fontSize: "0.75rem" }}
                          title="Alternar Acceso Rápido"
                        >
                          {m.acceso_rapido ? "⭐ Sí" : "✖ No"}
                        </button>
                      </td>
                      <td>
                        <button
                          type="button"
                          className={`badge ${m.sistema_comisiones ? "badge-tienda" : "badge-admin"}`}
                          onClick={() => handleToggleMarcaSistemaComisiones(m.id_marca, !!m.sistema_comisiones)}
                          disabled={loading}
                          style={{ border: "none", cursor: "pointer", fontSize: "0.75rem" }}
                          title="Alternar en Sistema de Comisiones"
                        >
                          {m.sistema_comisiones ? "✓ Activo" : "✖ Inactivo"}
                        </button>
                      </td>
                      <td>{m.modelos.length} modelo(s)</td>
                      <td>
                        <div style={{ display: "flex", gap: "6px" }}>
                          <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={() => iniciarEdicion("marcas", m.id_marca, m.nombre)}
                            style={{ padding: "6px 10px", fontSize: "0.8rem" }}
                          >
                            ✏️ Editar
                          </button>
                          <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={() => handleToggleMarcaActiva(m.id_marca, !!m.activo)}
                            style={{ padding: "6px 10px", fontSize: "0.8rem", color: m.activo ? "var(--warning)" : "var(--success)" }}
                          >
                            {m.activo ? "Desactivar" : "Activar"}
                          </button>
                          <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={() => handleEliminarMarcaFisicamente(m.id_marca, m.nombre)}
                            style={{ padding: "6px 10px", color: "var(--danger)", border: "1px solid var(--border-light)" }}
                          >
                            🗑️
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* PESTAÑA: MODELOS */}
      {activeTab === "modelos" && (
        <div className="glass-panel" style={{ padding: "28px", display: "flex", flexDirection: "column", gap: "24px" }}>
          <h3 style={{ fontSize: "1.15rem" }}>Gestión de Modelos</h3>

          <form onSubmit={handleCrearModelo} style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
            <select
              className="form-select"
              value={nuevoModeloMarcaId}
              onChange={e => {
                const val = e.target.value ? Number(e.target.value) : "";
                setNuevoModeloMarcaId(val);
                if (val !== "") {
                  const marca = marcas.find(m => m.id_marca === val);
                  if (marca) {
                    const nombreNorm = marca.nombre.toLowerCase().trim();
                    if (nombreNorm === "renault" || nombreNorm === "dacia") {
                      setNuevoModeloAccesoRapido(true);
                      return;
                    }
                  }
                }
                setNuevoModeloAccesoRapido(false);
              }}
              required
              style={{ flex: 1, minWidth: "160px" }}
            >
              <option value="">Selecciona Marca</option>
              {marcas.filter(m => m.activo).map(m => (
                <option key={m.id_marca} value={m.id_marca}>{m.nombre}</option>
              ))}
            </select>
            <input
              type="text"
              className="form-input"
              placeholder="Nombre de modelo... (Ej. Qashqai)"
              value={nuevoModeloNombre}
              onChange={e => setNuevoModeloNombre(e.target.value)}
              disabled={loading || !nuevoModeloMarcaId}
              required
              style={{ flex: 2, minWidth: "200px" }}
            />
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <input
                type="checkbox"
                id="chkModeloAccesoRapido"
                checked={nuevoModeloAccesoRapido}
                onChange={e => setNuevoModeloAccesoRapido(e.target.checked)}
                style={{ width: "18px", height: "18px", cursor: "pointer" }}
              />
              <label htmlFor="chkModeloAccesoRapido" style={{ cursor: "pointer", fontSize: "0.9rem", color: "var(--text-secondary)", fontWeight: 500 }}>
                Acceso Rápido
              </label>
            </div>
            {nuevoModeloAccesoRapido && (
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ fontSize: "0.9rem", color: "var(--text-secondary)", fontWeight: 500 }}>Orden:</span>
                <input
                  type="number"
                  className="form-input"
                  value={nuevoModeloOrden}
                  onChange={e => setNuevoModeloOrden(Number(e.target.value))}
                  disabled={loading}
                  style={{ width: "80px", padding: "8px", textAlign: "center" }}
                  min={0}
                />
              </div>
            )}
            <button type="submit" className="btn btn-primary" disabled={loading || !nuevoModeloMarcaId}>
              + Crear Modelo
            </button>
          </form>

          {/* BUSCADOR / FILTRO */}
          <div style={{ display: "flex", gap: "10px", alignItems: "center", background: "rgba(255, 255, 255, 0.03)", padding: "12px 16px", borderRadius: "8px", border: "1px solid var(--border-light)" }}>
            <span style={{ fontSize: "0.9rem", fontWeight: 600, color: "var(--text-secondary)" }}>🔎 Filtrar modelos:</span>
            <input
              type="text"
              className="form-input"
              placeholder="Buscar por modelo o marca..."
              value={modelSearchQuery}
              onChange={e => setModelSearchQuery(e.target.value)}
              style={{ maxWidth: "300px", padding: "6px 12px" }}
            />
            {modelSearchQuery && (
              <button 
                type="button" 
                className="btn btn-secondary" 
                onClick={() => setModelSearchQuery("")}
                style={{ padding: "4px 10px", fontSize: "0.8rem" }}
              >
                Limpiar
              </button>
            )}
          </div>

          {/* BLOQUES DE MARCAS CON COMISIONES */}
          {marcas.filter(m => m.sistema_comisiones).sort((a, b) => a.nombre.localeCompare(b.nombre)).map(marca => {
            const modelosDeMarca = sortedModelos.filter(mod => mod.id_marca === marca.id_marca);
            return (
              <div key={marca.id_marca} className="glass-panel" style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "15px", border: "1px solid rgba(59, 130, 246, 0.2)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <h4 style={{ fontSize: "1.05rem", fontWeight: "bold", display: "flex", alignItems: "center", gap: "8px", color: "var(--primary)" }}>
                    📦 Modelos de {marca.nombre}
                    <span style={{ fontSize: "0.75rem", background: "rgba(59, 130, 246, 0.15)", color: "#3b82f6", padding: "2px 8px", borderRadius: "4px", fontWeight: "600" }}>
                      Comisiones Activo
                    </span>
                  </h4>
                  <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                    {modelosDeMarca.some(mod => tempOrders[mod.id_modelo] !== undefined && tempOrders[mod.id_modelo] !== mod.orden_acceso_rapido) && (
                      <button
                        type="button"
                        className="btn btn-primary"
                        onClick={() => handleSaveBrandModelOrders(modelosDeMarca)}
                        style={{ padding: "4px 10px", fontSize: "0.75rem", display: "flex", alignItems: "center", gap: "4px" }}
                        disabled={loading}
                      >
                        💾 Guardar Orden
                      </button>
                    )}
                    <span style={{ fontSize: "0.85rem", color: "var(--text-secondary)", fontWeight: 500 }}>
                      {modelosDeMarca.length} modelo(s)
                    </span>
                  </div>
                </div>

                <div className="table-container">
                  <table className="table-premium">
                    <thead>
                      <tr>
                        <th onClick={() => handleSort("marca")} style={{ cursor: "pointer", userSelect: "none" }}>
                          Marca{sortField === "marca" ? (sortOrder === "asc" ? " ▲" : " ▼") : " ↕"}
                        </th>
                        <th onClick={() => handleSort("nombre")} style={{ cursor: "pointer", userSelect: "none" }}>
                          Nombre Modelo{sortField === "nombre" ? (sortOrder === "asc" ? " ▲" : " ▼") : " ↕"}
                        </th>
                        <th onClick={() => handleSort("acceso_rapido")} style={{ cursor: "pointer", userSelect: "none" }}>
                          Acceso Rápido{sortField === "acceso_rapido" ? (sortOrder === "asc" ? " ▲" : " ▼") : " ↕"}
                        </th>
                        <th onClick={() => handleSort("orden_acceso_rapido")} style={{ cursor: "pointer", userSelect: "none" }}>
                          Orden Dashboard{sortField === "orden_acceso_rapido" ? (sortOrder === "asc" ? " ▲" : " ▼") : " ↕"}
                        </th>
                        <th>Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {modelosDeMarca.map(mod => {
                        const isEditing = editingType === "modelos" && editingId === mod.id_modelo;
                        return (
                          <tr key={mod.id_modelo}>
                            <td>
                              <span style={{ fontSize: "0.85rem", color: "var(--primary)", fontWeight: "bold", textTransform: "uppercase" }}>
                                {mod.nombre_marca}
                              </span>
                            </td>
                            <td>
                              {isEditing ? (
                                <form onSubmit={handleGuardarEdicion} style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                                  <input
                                    type="text"
                                    className="form-input"
                                    value={editingNombre}
                                    onChange={e => setEditingNombre(e.target.value)}
                                    style={{ padding: "4px 8px", fontSize: "0.85rem" }}
                                    required
                                    autoFocus
                                  />
                                  <button type="submit" className="btn btn-primary" style={{ padding: "4px 8px" }} disabled={loading}>✓</button>
                                  <button type="button" className="btn btn-secondary" onClick={cancelarEdicion} style={{ padding: "4px 8px" }}>✗</button>
                                </form>
                              ) : (
                                <span style={{ fontSize: "0.95rem", fontWeight: 500 }}>{mod.nombre_modelo}</span>
                              )}
                            </td>
                            <td>
                              <button
                                type="button"
                                className={`badge ${mod.acceso_rapido ? "badge-tienda" : "badge-admin"}`}
                                onClick={() => handleToggleModeloAccesoRapido(mod.id_modelo, !!mod.acceso_rapido)}
                                disabled={loading}
                                style={{ border: "none", cursor: "pointer", fontSize: "0.75rem" }}
                                title="Alternar Acceso Rápido"
                              >
                                {mod.acceso_rapido ? "⭐ Sí" : "✖ No"}
                              </button>
                            </td>
                            <td>
                              {mod.acceso_rapido ? (
                                <input
                                  type="number"
                                  className="form-input"
                                  value={tempOrders[mod.id_modelo] !== undefined ? tempOrders[mod.id_modelo] : (mod.orden_acceso_rapido || 0)}
                                  onChange={e => setTempOrders({ ...tempOrders, [mod.id_modelo]: Number(e.target.value) })}
                                  onKeyDown={e => {
                                    if (e.key === "Enter") {
                                      (e.target as HTMLInputElement).blur();
                                    }
                                  }}
                                  style={{ width: "70px", padding: "4px 8px", fontSize: "0.85rem", textAlign: "center" }}
                                  disabled={loading}
                                />
                              ) : (
                                <span style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>—</span>
                              )}
                            </td>
                            <td>
                              <div style={{ display: "flex", gap: "10px" }}>
                                <button
                                  type="button"
                                  className="btn btn-secondary"
                                  onClick={() => iniciarEdicion("modelos", mod.id_modelo, mod.nombre_modelo)}
                                  style={{ padding: "6px 10px", fontSize: "0.8rem" }}
                                >
                                  ✏️ Editar
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-secondary"
                                  onClick={() => handleEliminarModelo(mod.id_modelo, mod.id_marca)}
                                  style={{ padding: "6px 10px", color: "var(--danger)", border: "1px solid var(--border-light)" }}
                                >
                                  🗑️ Eliminar
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                      {modelosDeMarca.length === 0 && (
                        <tr>
                          <td colSpan={5} style={{ textAlign: "center", color: "var(--text-muted)", padding: "15px" }}>
                            No hay modelos registrados para esta marca.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}

          {/* BLOQUE RESTO DE MARCAS */}
          {(() => {
            const modelosResto = sortedModelos.filter(mod => !mod.sistema_comisiones);
            return (
              <div className="glass-panel" style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "15px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <h4 style={{ fontSize: "1.05rem", fontWeight: "bold", color: "var(--text-primary)" }}>
                    💼 Resto de Marcas
                  </h4>
                  <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                    {modelosResto.some(mod => tempOrders[mod.id_modelo] !== undefined && tempOrders[mod.id_modelo] !== mod.orden_acceso_rapido) && (
                      <button
                        type="button"
                        className="btn btn-primary"
                        onClick={() => handleSaveBrandModelOrders(modelosResto)}
                        style={{ padding: "4px 10px", fontSize: "0.75rem", display: "flex", alignItems: "center", gap: "4px" }}
                        disabled={loading}
                      >
                        💾 Guardar Orden
                      </button>
                    )}
                    <span style={{ fontSize: "0.85rem", color: "var(--text-secondary)", fontWeight: 500 }}>
                      {modelosResto.length} modelo(s)
                    </span>
                  </div>
                </div>

                <div className="table-container">
                  <table className="table-premium">
                    <thead>
                      <tr>
                        <th onClick={() => handleSort("marca")} style={{ cursor: "pointer", userSelect: "none" }}>
                          Marca{sortField === "marca" ? (sortOrder === "asc" ? " ▲" : " ▼") : " ↕"}
                        </th>
                        <th onClick={() => handleSort("nombre")} style={{ cursor: "pointer", userSelect: "none" }}>
                          Nombre Modelo{sortField === "nombre" ? (sortOrder === "asc" ? " ▲" : " ▼") : " ↕"}
                        </th>
                        <th onClick={() => handleSort("acceso_rapido")} style={{ cursor: "pointer", userSelect: "none" }}>
                          Acceso Rápido{sortField === "acceso_rapido" ? (sortOrder === "asc" ? " ▲" : " ▼") : " ↕"}
                        </th>
                        <th onClick={() => handleSort("orden_acceso_rapido")} style={{ cursor: "pointer", userSelect: "none" }}>
                          Orden Dashboard{sortField === "orden_acceso_rapido" ? (sortOrder === "asc" ? " ▲" : " ▼") : " ↕"}
                        </th>
                        <th>Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {modelosResto.map(mod => {
                        const isEditing = editingType === "modelos" && editingId === mod.id_modelo;
                        return (
                          <tr key={mod.id_modelo}>
                            <td>
                              <span style={{ fontSize: "0.85rem", color: "var(--primary)", fontWeight: "bold", textTransform: "uppercase" }}>
                                {mod.nombre_marca}
                              </span>
                            </td>
                            <td>
                              {isEditing ? (
                                <form onSubmit={handleGuardarEdicion} style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                                  <input
                                    type="text"
                                    className="form-input"
                                    value={editingNombre}
                                    onChange={e => setEditingNombre(e.target.value)}
                                    style={{ padding: "4px 8px", fontSize: "0.85rem" }}
                                    required
                                    autoFocus
                                  />
                                  <button type="submit" className="btn btn-primary" style={{ padding: "4px 8px" }} disabled={loading}>✓</button>
                                  <button type="button" className="btn btn-secondary" onClick={cancelarEdicion} style={{ padding: "4px 8px" }}>✗</button>
                                </form>
                              ) : (
                                <span style={{ fontSize: "0.95rem", fontWeight: 500 }}>{mod.nombre_modelo}</span>
                              )}
                            </td>
                            <td>
                              <button
                                type="button"
                                className={`badge ${mod.acceso_rapido ? "badge-tienda" : "badge-admin"}`}
                                onClick={() => handleToggleModeloAccesoRapido(mod.id_modelo, !!mod.acceso_rapido)}
                                disabled={loading}
                                style={{ border: "none", cursor: "pointer", fontSize: "0.75rem" }}
                                title="Alternar Acceso Rápido"
                              >
                                {mod.acceso_rapido ? "⭐ Sí" : "✖ No"}
                              </button>
                            </td>
                            <td>
                              {mod.acceso_rapido ? (
                                <input
                                  type="number"
                                  className="form-input"
                                  value={tempOrders[mod.id_modelo] !== undefined ? tempOrders[mod.id_modelo] : (mod.orden_acceso_rapido || 0)}
                                  onChange={e => setTempOrders({ ...tempOrders, [mod.id_modelo]: Number(e.target.value) })}
                                  onKeyDown={e => {
                                    if (e.key === "Enter") {
                                      (e.target as HTMLInputElement).blur();
                                    }
                                  }}
                                  style={{ width: "70px", padding: "4px 8px", fontSize: "0.85rem", textAlign: "center" }}
                                  disabled={loading}
                                />
                              ) : (
                                <span style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>—</span>
                              )}
                            </td>
                            <td>
                              <div style={{ display: "flex", gap: "10px" }}>
                                <button
                                  type="button"
                                  className="btn btn-secondary"
                                  onClick={() => iniciarEdicion("modelos", mod.id_modelo, mod.nombre_modelo)}
                                  style={{ padding: "6px 10px", fontSize: "0.8rem" }}
                                >
                                  ✏️ Editar
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-secondary"
                                  onClick={() => handleEliminarModelo(mod.id_modelo, mod.id_marca)}
                                  style={{ padding: "6px 10px", color: "var(--danger)", border: "1px solid var(--border-light)" }}
                                >
                                  🗑️ Eliminar
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                      {modelosResto.length === 0 && (
                        <tr>
                          <td colSpan={5} style={{ textAlign: "center", color: "var(--text-muted)", padding: "15px" }}>
                            No hay modelos para el resto de marcas.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* PESTAÑA: TIENDAS */}
      {activeTab === "tiendas" && (
        <div className="glass-panel" style={{ padding: "28px", display: "flex", flexDirection: "column", gap: "24px" }}>
          <h3 style={{ fontSize: "1.15rem" }}>Gestión de Tiendas Físicas</h3>

          <form onSubmit={handleCrearTienda} style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <input
              type="text"
              className="form-input"
              placeholder="Nombre de la tienda... (Ej. Concesionario Central)"
              value={nuevaTiendaNombre}
              onChange={e => setNuevaTiendaNombre(e.target.value)}
              disabled={loading}
              required
              style={{ flex: 2, minWidth: "200px" }}
            />
            <input
              type="text"
              className="form-input"
              placeholder="Ciudad... (Ej. Madrid)"
              value={nuevaTiendaCiudad}
              onChange={e => setNuevaTiendaCiudad(e.target.value)}
              disabled={loading}
              style={{ flex: 1, minWidth: "150px" }}
            />
            <button type="submit" className="btn btn-primary" disabled={loading}>
              + Crear Tienda
            </button>
          </form>

          <div className="table-container">
            <table className="table-premium">
              <thead>
                <tr>
                  <th onClick={() => handleSort("nombre")} style={{ cursor: "pointer", userSelect: "none" }}>
                    Nombre Tienda{sortField === "nombre" ? (sortOrder === "asc" ? " ▲" : " ▼") : " ↕"}
                  </th>
                  <th onClick={() => handleSort("ciudad")} style={{ cursor: "pointer", userSelect: "none" }}>
                    Ciudad{sortField === "ciudad" ? (sortOrder === "asc" ? " ▲" : " ▼") : " ↕"}
                  </th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {sortedTiendas.map(t => {
                  const isEditing = editingType === "tiendas" && editingId === t.id_tienda;
                  return (
                    <tr key={t.id_tienda}>
                      <td>
                        {isEditing ? (
                          <input
                            type="text"
                            className="form-input"
                            value={editingNombre}
                            onChange={e => setEditingNombre(e.target.value)}
                            style={{ padding: "6px 10px", fontSize: "0.85rem", maxWidth: "200px" }}
                            required
                          />
                        ) : (
                          <span style={{ fontWeight: 600 }}>{t.nombre}</span>
                        )}
                      </td>
                      <td>
                        {isEditing ? (
                          <input
                            type="text"
                            className="form-input"
                            value={editingExtra}
                            onChange={e => setEditingExtra(e.target.value)}
                            style={{ padding: "6px 10px", fontSize: "0.85rem", maxWidth: "150px" }}
                          />
                        ) : (
                          t.ciudad ? `📍 ${t.ciudad}` : <span style={{ color: "var(--text-muted)", fontStyle: "italic" }}>Sin indicar</span>
                        )}
                      </td>
                      <td>
                        {isEditing ? (
                          <div style={{ display: "flex", gap: "6px" }}>
                            <button type="button" className="btn btn-primary" onClick={handleGuardarEdicion} style={{ padding: "6px 12px", fontSize: "0.8rem" }} disabled={loading}>✓</button>
                            <button type="button" className="btn btn-secondary" onClick={cancelarEdicion} style={{ padding: "6px 12px", fontSize: "0.8rem" }}>✗</button>
                          </div>
                        ) : (
                          <div style={{ display: "flex", gap: "6px" }}>
                            <button
                              type="button"
                              className="btn btn-secondary"
                              onClick={() => handleEstablecerTiendaPredeterminada(t.id_tienda === tiendaPredeterminadaId ? null : t.id_tienda)}
                              style={{ 
                                padding: "6px 12px", 
                                fontSize: "0.8rem", 
                                color: t.id_tienda === tiendaPredeterminadaId ? "var(--warning)" : "var(--text-secondary)",
                                borderColor: t.id_tienda === tiendaPredeterminadaId ? "var(--warning)" : "var(--border-light)",
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "4px"
                              }}
                              title={t.id_tienda === tiendaPredeterminadaId ? "Quitar como tienda predeterminada" : "Establecer como tienda predeterminada para mi usuario"}
                            >
                              {t.id_tienda === tiendaPredeterminadaId ? "⭐ Predeterminada" : "☆ Predeterminada"}
                            </button>
                            <button
                              type="button"
                              className="btn btn-secondary"
                              onClick={() => iniciarEdicion("tiendas", t.id_tienda, t.nombre, t.ciudad || "")}
                              style={{ padding: "6px 12px", fontSize: "0.8rem" }}
                            >
                              ✏️ Editar
                            </button>
                            <button
                              type="button"
                              className="btn btn-secondary"
                              onClick={() => handleEliminarTienda(t.id_tienda)}
                              style={{ padding: "6px 12px", color: "var(--danger)", border: "1px solid var(--border-light)" }}
                            >
                              🗑️
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {sortedTiendas.length === 0 && (
                  <tr>
                    <td colSpan={4} style={{ textAlign: "center", color: "var(--text-muted)", padding: "20px" }}>
                      No hay tiendas registradas.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* PESTAÑA: PAGOS */}
      {activeTab === "pagos" && (
        <div className="glass-panel" style={{ padding: "28px", display: "flex", flexDirection: "column", gap: "24px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h3 style={{ fontSize: "1.15rem", margin: 0 }}>Tipos de Venta (Pagos)</h3>
            {tiposVenta.some(tv => tempPagosOrders[tv.id] !== undefined && tempPagosOrders[tv.id] !== tv.orden) && (
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleSavePagosOrders}
                disabled={loading}
                style={{ padding: "8px 16px", fontSize: "0.85rem" }}
              >
                💾 Guardar Cambios de Orden
              </button>
            )}
          </div>

          <form onSubmit={handleCrearTipoVenta} style={{ display: "flex", gap: "15px", alignItems: "center", flexWrap: "wrap" }}>
            <input
              type="text"
              className="form-input"
              placeholder="Ej. Financiación Preference"
              value={nuevoTipoVentaNombre}
              onChange={e => setNuevoTipoVentaNombre(e.target.value)}
              disabled={loading}
              required
              style={{ flex: 1, minWidth: "200px" }}
            />
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <label style={{ fontSize: "0.85rem", fontWeight: 600 }}>Color:</label>
              <input
                type="color"
                value={nuevoTipoVentaColor}
                onChange={e => setNuevoTipoVentaColor(e.target.value)}
                style={{ width: "36px", height: "36px", padding: 0, border: "1px solid var(--border-light)", borderRadius: "4px", cursor: "pointer" }}
                title="Elige el color para este tipo de pago"
              />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <label style={{ fontSize: "0.85rem", fontWeight: 600 }}>Orden Dashboard:</label>
              <input
                type="number"
                className="form-input"
                value={nuevoTipoVentaOrden}
                onChange={e => setNuevoTipoVentaOrden(Number(e.target.value))}
                style={{ width: "80px", padding: "6px" }}
                min={0}
              />
            </div>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              + Crear Tipo Pago
            </button>
          </form>

          <div className="table-container">
            <table className="table-premium">
              <thead>
                <tr>
                  <th onClick={() => handleSort("nombre")} style={{ cursor: "pointer", userSelect: "none" }}>
                    Nombre Tipo Venta{sortField === "nombre" ? (sortOrder === "asc" ? " ▲" : " ▼") : " ↕"}
                  </th>
                  <th>Color Asignado</th>
                  <th onClick={() => handleSort("orden")} style={{ cursor: "pointer", userSelect: "none", width: "180px" }}>
                    Orden Dashboard{sortField === "orden" ? (sortOrder === "asc" ? " ▲" : " ▼") : " ↕"}
                  </th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {sortedTiposVenta.map(t => {
                  const isEditing = editingType === "pagos" && editingId === t.id;
                  return (
                    <tr key={t.id}>
                      <td>
                        {isEditing ? (
                          <form onSubmit={handleGuardarEdicion} style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                            <input
                              type="text"
                              className="form-input"
                              value={editingNombre}
                              onChange={e => setEditingNombre(e.target.value)}
                              style={{ padding: "4px 8px", fontSize: "0.85rem" }}
                              required
                              autoFocus
                            />
                            <input
                              type="color"
                              value={editingColor}
                              onChange={e => setEditingColor(e.target.value)}
                              style={{ width: "30px", height: "30px", padding: 0, border: "1px solid var(--border-light)", borderRadius: "4px", cursor: "pointer" }}
                            />
                            <button type="submit" className="btn btn-primary" style={{ padding: "4px 8px" }} disabled={loading}>✓</button>
                            <button type="button" className="btn btn-secondary" onClick={cancelarEdicion} style={{ padding: "4px 8px" }}>✗</button>
                          </form>
                        ) : (
                          <span style={{ fontWeight: 600 }}>{t.nombre}</span>
                        )}
                      </td>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <span style={{
                            backgroundColor: t.color || "#3b82f6",
                            display: "inline-block",
                            width: "16px",
                            height: "16px",
                            borderRadius: "50%",
                            border: "1px solid var(--border-light)"
                          }}></span>
                          <span style={{ fontSize: "0.85rem", fontFamily: "monospace" }}>{t.color || "#3b82f6"}</span>
                        </div>
                      </td>
                      <td>
                        <input
                          type="number"
                          className="form-input"
                          value={tempPagosOrders[t.id] !== undefined ? tempPagosOrders[t.id] : (t.orden || 0)}
                          onChange={e => setTempPagosOrders({ ...tempPagosOrders, [t.id]: Number(e.target.value) })}
                          style={{ width: "80px", padding: "4px 8px", fontSize: "0.85rem" }}
                          min={0}
                          disabled={loading}
                        />
                      </td>
                      <td>
                        <div style={{ display: "flex", gap: "10px" }}>
                          <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={() => iniciarEdicion("pagos", t.id, t.nombre, "", t.color || "#3b82f6")}
                            style={{ padding: "6px 12px", fontSize: "0.8rem" }}
                          >
                            ✏️ Editar
                          </button>
                          <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={() => handleEliminarTipoVenta(t.id)}
                            style={{ padding: "6px 12px", color: "var(--danger)", border: "1px solid var(--border-light)" }}
                          >
                            🗑️
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* PESTAÑA: ESTADOS */}
      {activeTab === "estados" && (
        <div className="glass-panel" style={{ padding: "28px", display: "flex", flexDirection: "column", gap: "24px" }}>
          <h3 style={{ fontSize: "1.15rem" }}>Estados del Vehículo</h3>

          <form onSubmit={handleCrearEstadoVehiculo} style={{ display: "flex", gap: "15px", alignItems: "center", flexWrap: "wrap" }}>
            <input
              type="text"
              className="form-input"
              placeholder="Ej. Buyback"
              value={nuevoEstadoVehiculoNombre}
              onChange={e => setNuevoEstadoVehiculoNombre(e.target.value)}
              disabled={loading}
              required
              style={{ flex: 1, minWidth: "200px" }}
            />
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <input
                type="checkbox"
                id="chkNuevoEstadoPredeterminado"
                checked={nuevoEstadoVehiculoPredeterminado}
                onChange={e => setNuevoEstadoVehiculoPredeterminado(e.target.checked)}
                style={{ width: "18px", height: "18px", cursor: "pointer" }}
              />
              <label htmlFor="chkNuevoEstadoPredeterminado" style={{ fontSize: "0.85rem", fontWeight: 600, cursor: "pointer" }}>
                Predeterminado
              </label>
            </div>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              + Crear Estado
            </button>
          </form>

          <div className="table-container">
            <table className="table-premium">
              <thead>
                <tr>
                  <th onClick={() => handleSort("nombre")} style={{ cursor: "pointer", userSelect: "none" }}>
                    Nombre Estado{sortField === "nombre" ? (sortOrder === "asc" ? " ▲" : " ▼") : " ↕"}
                  </th>
                  <th>Predeterminado</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {sortedEstadosVehiculo.map(ev => {
                  const isEditing = editingType === "estados" && editingId === ev.id;
                  return (
                    <tr key={ev.id}>
                      <td>
                        {isEditing ? (
                          <form onSubmit={handleGuardarEdicion} style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                            <input
                              type="text"
                              className="form-input"
                              value={editingNombre}
                              onChange={e => setEditingNombre(e.target.value)}
                              style={{ padding: "4px 8px", fontSize: "0.85rem" }}
                              required
                              autoFocus
                            />
                            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                              <input
                                type="checkbox"
                                id="chkEditEstadoPredeterminado"
                                checked={editingPredeterminado}
                                onChange={e => setEditingPredeterminado(e.target.checked)}
                                style={{ width: "16px", height: "16px", cursor: "pointer" }}
                              />
                              <label htmlFor="chkEditEstadoPredeterminado" style={{ fontSize: "0.8rem", cursor: "pointer" }}>Predet.</label>
                            </div>
                            <button type="submit" className="btn btn-primary" style={{ padding: "4px 8px" }} disabled={loading}>✓</button>
                            <button type="button" className="btn btn-secondary" onClick={cancelarEdicion} style={{ padding: "4px 8px" }}>✗</button>
                          </form>
                        ) : (
                          <span style={{ fontWeight: 600 }}>{ev.nombre}</span>
                        )}
                      </td>
                      <td>
                        <div onClick={() => handleToggleEstadoPredeterminado(ev.id, !!ev.predeterminado)} style={{ cursor: "pointer", display: "inline-block" }}>
                          {ev.predeterminado ? (
                            <span className="badge badge-success" style={{ background: "rgba(16, 185, 129, 0.2)", color: "var(--success)", border: "1px solid rgba(16, 185, 129, 0.3)", padding: "4px 8px", borderRadius: "4px", fontSize: "0.75rem", fontWeight: "bold" }}>
                              ★ Predeterminado
                            </span>
                          ) : (
                            <span className="badge badge-secondary" style={{ background: "rgba(255, 255, 255, 0.05)", color: "var(--text-muted)", border: "1px solid var(--border-light)", padding: "4px 8px", borderRadius: "4px", fontSize: "0.75rem" }}>
                              Hacer Predeterminado
                            </span>
                          )}
                        </div>
                      </td>
                      <td>
                        <div style={{ display: "flex", gap: "10px" }}>
                          <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={() => iniciarEdicion("estados", ev.id, ev.nombre, "", "", !!ev.predeterminado)}
                            style={{ padding: "6px 12px", fontSize: "0.8rem" }}
                          >
                            ✏️ Editar
                          </button>
                          <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={() => handleEliminarEstadoVehiculo(ev.id)}
                            style={{ padding: "6px 12px", color: "var(--danger)", border: "1px solid var(--border-light)" }}
                          >
                            🗑️
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* PESTAÑA: EXPEDIENTES */}
      {activeTab === "expedientes" && (
        <div className="glass-panel" style={{ padding: "28px", display: "flex", flexDirection: "column", gap: "28px" }}>
          <div>
            <h3 style={{ fontSize: "1.15rem", marginBottom: "8px" }}>⚙️ Configuración de Expedientes</h3>
            <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem", margin: 0 }}>
              Personaliza el comportamiento por defecto de la lista de expedientes. Estos ajustes se guardan en tu navegador.
            </p>
          </div>

          {/* PAGINACIÓN POR DEFECTO */}
          <div className="glass-panel" style={{ padding: "24px", display: "flex", flexDirection: "column", gap: "20px", borderLeft: "3px solid var(--primary)" }}>
            <div>
              <h4 style={{ fontSize: "1rem", fontWeight: 700, margin: "0 0 6px 0", color: "var(--text-primary)" }}>
                📄 Número de expedientes por página (por defecto)
              </h4>
              <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem", margin: 0, lineHeight: "1.5" }}>
                Define cuántos expedientes se mostrarán al cargar la lista. Puedes cambiarlo en cualquier momento desde la propia tabla.
              </p>
            </div>

            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
              {[10, 20, 50, 100, 200].map(size => (
                <button
                  key={size}
                  type="button"
                  onClick={() => {
                    setExpDefaultPageSize(size);
                    localStorage.setItem("exp-default-page-size", String(size));
                    showNotification(`Paginación por defecto establecida en ${size} expedientes.`, "success");
                  }}
                  style={{
                    padding: "12px 24px",
                    fontSize: "1rem",
                    fontWeight: expDefaultPageSize === size ? 800 : 500,
                    border: `2px solid ${expDefaultPageSize === size ? "var(--primary)" : "var(--border-light)"}`,
                    borderRadius: "var(--radius-md)",
                    background: expDefaultPageSize === size
                      ? "linear-gradient(135deg, rgba(var(--primary-rgb), 0.2), rgba(var(--secondary-rgb), 0.1))"
                      : "rgba(255, 255, 255, 0.02)",
                    color: expDefaultPageSize === size ? "var(--primary)" : "var(--text-secondary)",
                    cursor: "pointer",
                    transition: "all 0.2s ease",
                    boxShadow: expDefaultPageSize === size ? "0 0 0 3px rgba(var(--primary-rgb), 0.15)" : "none",
                    position: "relative"
                  }}
                >
                  {size}
                  {expDefaultPageSize === size && (
                    <span style={{
                      position: "absolute",
                      top: "-8px",
                      right: "-8px",
                      background: "var(--primary)",
                      color: "#fff",
                      fontSize: "0.6rem",
                      padding: "2px 5px",
                      borderRadius: "999px",
                      fontWeight: 700,
                      letterSpacing: "0.04em"
                    }}>✓ ACTIVO</span>
                  )}
                </button>
              ))}
            </div>

            <div style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              padding: "12px 16px",
              background: "rgba(var(--primary-rgb), 0.05)",
              border: "1px solid rgba(var(--primary-rgb), 0.15)",
              borderRadius: "var(--radius-sm)",
              fontSize: "0.85rem",
              color: "var(--text-secondary)"
            }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <span>
                Actualmente configurado en <strong style={{ color: "var(--primary)" }}>{expDefaultPageSize}</strong> expedientes por página.
                Este valor se aplica al cargar la pestaña de expedientes por primera vez.
              </span>
            </div>
          </div>
        </div>
      )}

      {activeTab === "bbdd" && (
        <div className="glass-panel" style={{ padding: "32px", display: "flex", flexDirection: "column", gap: "24px" }}>
          <div>
            <h3 style={{ fontSize: "1.15rem", marginBottom: "8px" }}>🗄️ Herramientas de Mantenimiento y Limpieza de BBDD</h3>
            <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem", lineHeight: "1.5" }}>
              Analiza y depura registros huérfanos o anomalías de la base de datos de manera segura. 
              <br />
              <strong style={{ color: "var(--warning)" }}>IMPORTANTE:</strong> Para garantizar la seguridad de tus datos, se descargará automáticamente un backup JSON completo antes de ejecutar cualquier acción de limpieza.
            </p>
          </div>

          <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleAnalyzeDb}
              disabled={analyzingDb || cleaningDb}
              style={{ display: "flex", alignItems: "center", gap: "8px", padding: "10px 20px" }}
            >
              {analyzingDb ? "Analizando..." : "🔍 Analizar Base de Datos"}
            </button>

            {dbAnalysis && dbAnalysis.stats && dbAnalysis.stats.totalAnomalies > 0 && (
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleBackupAndCleanDb}
                disabled={analyzingDb || cleaningDb}
                style={{ display: "flex", alignItems: "center", gap: "8px", padding: "10px 20px", backgroundColor: "var(--warning)", borderColor: "var(--warning)" }}
              >
                {cleaningDb ? "Limpiando BBDD..." : "💾 Descargar Backup y Limpiar BBDD"}
              </button>
            )}
          </div>

          {dbAnalysis && dbAnalysis.stats && (
            <div style={{ display: "flex", flexDirection: "column", gap: "16px", marginTop: "8px" }}>
              <h4 style={{ fontSize: "1rem", color: "var(--text-primary)" }}>Resultados del Análisis:</h4>
              
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "16px" }}>
                <div style={{ padding: "16px", background: "rgba(255, 255, 255, 0.02)", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-light)" }}>
                  <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>LÍNEAS FANTASMA (#EXP-null)</div>
                  <div style={{ fontSize: "1.5rem", fontWeight: 800, marginTop: "4px", color: dbAnalysis.stats.orphanLinesCount > 0 ? "var(--warning)" : "var(--text-muted)" }}>
                    {dbAnalysis.stats.orphanLinesCount}
                  </div>
                </div>

                <div style={{ padding: "16px", background: "rgba(255, 255, 255, 0.02)", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-light)" }}>
                  <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>EMAILS HUÉRFANOS DE CLIENTES</div>
                  <div style={{ fontSize: "1.5rem", fontWeight: 800, marginTop: "4px", color: dbAnalysis.stats.orphanEmailsCount > 0 ? "var(--warning)" : "var(--text-muted)" }}>
                    {dbAnalysis.stats.orphanEmailsCount}
                  </div>
                </div>

                <div style={{ padding: "16px", background: "rgba(255, 255, 255, 0.02)", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-light)" }}>
                  <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>TELÉFONOS HUÉRFANOS DE CLIENTES</div>
                  <div style={{ fontSize: "1.5rem", fontWeight: 800, marginTop: "4px", color: dbAnalysis.stats.orphanTelefonosCount > 0 ? "var(--warning)" : "var(--text-muted)" }}>
                    {dbAnalysis.stats.orphanTelefonosCount}
                  </div>
                </div>

                <div style={{ padding: "16px", background: "rgba(255, 255, 255, 0.02)", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-light)" }}>
                  <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>RELACIONES TIENDA-USUARIO OBSOLETAS</div>
                  <div style={{ fontSize: "1.5rem", fontWeight: 800, marginTop: "4px", color: dbAnalysis.stats.orphanUserTiendasCount > 0 ? "var(--warning)" : "var(--text-muted)" }}>
                    {dbAnalysis.stats.orphanUserTiendasCount}
                  </div>
                </div>

                <div style={{ padding: "16px", background: "rgba(255, 255, 255, 0.02)", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-light)", gridColumn: "span 2" }}>
                  <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>REGISTROS DE IMPORTACIÓN HUÉRFANOS</div>
                  <div style={{ fontSize: "1.5rem", fontWeight: 800, marginTop: "4px", color: dbAnalysis.stats.orphanImportRegistrosCount > 0 ? "var(--warning)" : "var(--text-muted)" }}>
                    {dbAnalysis.stats.orphanImportRegistrosCount}
                  </div>
                </div>
              </div>

              {dbAnalysis.stats.totalAnomalies === 0 ? (
                <div style={{
                  padding: "16px 20px",
                  background: "rgba(16, 185, 129, 0.06)",
                  border: "1px solid rgba(16, 185, 129, 0.2)",
                  borderRadius: "var(--radius-sm)",
                  color: "var(--success)",
                  fontSize: "0.9rem",
                  fontWeight: 600,
                  display: "flex",
                  alignItems: "center",
                  gap: "8px"
                }}>
                  <span>✅ Base de datos completamente optimizada. No se detectaron registros huérfanos.</span>
                </div>
              ) : (
                <div style={{
                  padding: "16px 20px",
                  background: "rgba(245, 158, 11, 0.06)",
                  border: "1px solid rgba(245, 158, 11, 0.2)",
                  borderRadius: "var(--radius-sm)",
                  color: "var(--warning)",
                  fontSize: "0.9rem",
                  fontWeight: 600,
                  display: "flex",
                  alignItems: "center",
                  gap: "8px"
                }}>
                  <span>⚠️ Se han detectado {dbAnalysis.stats.totalAnomalies} registros huérfanos/obsoletos que pueden ser depurados de forma segura.</span>
                </div>
              )}
            </div>
          )}

          {/* DIVISION */}
          <hr style={{ border: "none", borderTop: "1px solid var(--border-light)", margin: "8px 0" }} />

          {/* AJUSTES DE INTERFAZ */}
          <div>
            <h3 style={{ fontSize: "1.15rem", marginBottom: "8px" }}>⚙️ Opciones de Interfaz y Seguridad</h3>
            <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem", lineHeight: "1.5", marginBottom: "16px" }}>
              Ajusta la visibilidad de elementos clave del sistema. Los cambios se guardan directamente en la base de datos.
            </p>

            <div className="glass-panel" style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "16px", backgroundColor: "rgba(255, 255, 255, 0.01)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <input
                  type="checkbox"
                  id="toggleCSVButtonsCheckbox"
                  checked={mostrarBotonesCSV}
                  onChange={(e) => handleToggleCSVButtons(e.target.checked)}
                  style={{
                    width: "18px",
                    height: "18px",
                    cursor: "pointer",
                    accentColor: "var(--primary)"
                  }}
                />
                <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                  <label htmlFor="toggleCSVButtonsCheckbox" style={{ fontSize: "0.95rem", fontWeight: 600, color: "var(--text-primary)", cursor: "pointer" }}>
                    Mostrar botones de Exportar todo (CSV) e Importar CSV
                  </label>
                  <span style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
                    Si se desmarca, los botones de CSV en la pestaña de expedientes se ocultarán para todos los usuarios.
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

