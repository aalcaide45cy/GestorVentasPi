"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { formatDate } from "@/lib/date-utils";

interface EmailContact {
  id_email_cliente?: number;
  email: string;
  tipo_email?: string | null;
}

interface TelefonoContact {
  id_telefono_cliente?: number;
  telefono: string;
  tipo_telefono?: string | null;
}

interface ClienteItem {
  id: number;
  cliente_id: string;
  dni: string | null;
  nombre: string | null;
  fecha_de_nacimiento: string | null;
  tienda_id: number | null;
  emails: EmailContact[];
  telefonos: TelefonoContact[];
  expedientes?: any[];
}

interface TiendaItem {
  id_tienda: number;
  nombre: string;
  ciudad: string | null;
}

interface ClientesListProps {
  clientesIniciales: ClienteItem[];
  tiendas: TiendaItem[];
  userRole: string;
  tiendaPredeterminadaId?: number | null;
}

type SortField = "nombre" | "dni" | "fecha_de_nacimiento" | "tienda" | "expedientes" | "id";

export default function ClientesList({ clientesIniciales, tiendas, userRole, tiendaPredeterminadaId = null }: ClientesListProps) {
  const router = useRouter();
  const [clientes, setClientes] = useState<ClienteItem[]>(clientesIniciales);
  const [modalOpen, setModalOpen] = useState<"create" | "edit" | false>(false);
  const [selectedCliente, setSelectedCliente] = useState<ClienteItem | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [expedientesModalCliente, setExpedientesModalCliente] = useState<ClienteItem | null>(null);

  // Selección múltiple y eliminación
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [confirmDeleteCliente, setConfirmDeleteCliente] = useState<ClienteItem | null>(null);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [bulkSelectionUnlocked, setBulkSelectionUnlocked] = useState(false);
  const [deleteUnlocked, setDeleteUnlocked] = useState(false);

  // Buscador global
  const [globalSearch, setGlobalSearch] = useState("");

  // Filtros por columna
  const [filterNombre, setFilterNombre] = useState("");
  const [filterDni, setFilterDni] = useState("");
  const [filterFechaNacimiento, setFilterFechaNacimiento] = useState("");
  const [filterCorreo, setFilterCorreo] = useState("");
  const [filterTelefono, setFilterTelefono] = useState("");
  const [filterTienda, setFilterTienda] = useState("");

  // Ordenación por columnas
  const [sortField, setSortField] = useState<SortField>("id");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

  // Campos de formulario
  const [dni, setDni] = useState("");
  const [nombre, setNombre] = useState("");
  const [fechaNacimiento, setFechaNacimiento] = useState("");
  const [tiendaId, setTiendaId] = useState("");
  const [emails, setEmails] = useState([{ email: "", tipo: "Principal" }]);
  const [telefonos, setTelefonos] = useState([{ telefono: "", tipo: "Principal" }]);

  // Estados para modal de duplicidad de cliente
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  const [duplicateClientInfo, setDuplicateClientInfo] = useState<any | null>(null);

  const showNotification = (text: string, type: "success" | "error") => {
    if (type === "success") {
      setSuccess(text);
      setTimeout(() => setSuccess(null), 3000);
    } else {
      setError(text);
      setTimeout(() => setError(null), 4000);
    }
  };

  // Dinámicos de Emails
  const addEmail = () => setEmails([...emails, { email: "", tipo: "Alternativo" }]);
  const removeEmail = (index: number) => setEmails(emails.filter((_, i) => i !== index));
  const handleEmailChange = (index: number, val: string) => {
    const updated = [...emails];
    updated[index].email = val;
    setEmails(updated);
  };
  const handleEmailTipoChange = (index: number, val: string) => {
    const updated = [...emails];
    updated[index].tipo = val;
    setEmails(updated);
  };

  // Dinámicos de Teléfonos
  const addTelefono = () => setTelefonos([...telefonos, { telefono: "", tipo: "Alternativo" }]);
  const removeTelefono = (index: number) => setTelefonos(telefonos.filter((_, i) => i !== index));
  const handleTelefonoChange = (index: number, val: string) => {
    const updated = [...telefonos];
    updated[index].telefono = val;
    setTelefonos(updated);
  };
  const handleTelefonoTipoChange = (index: number, val: string) => {
    const updated = [...telefonos];
    updated[index].tipo = val;
    setTelefonos(updated);
  };

  const handleOpenCreateModal = () => {
    setSelectedCliente(null);
    setDni("");
    setNombre("");
    setFechaNacimiento("");
    setTiendaId(tiendaPredeterminadaId ? String(tiendaPredeterminadaId) : "");
    setEmails([{ email: "", tipo: "Principal" }]);
    setTelefonos([{ telefono: "", tipo: "Principal" }]);
    setModalOpen("create");
  };

  const handleOpenEditModal = (c: ClienteItem) => {
    setSelectedCliente(c);
    setDni(c.dni || "");
    setNombre(c.nombre || "");
    setFechaNacimiento(c.fecha_de_nacimiento || "");
    setTiendaId(c.tienda_id ? String(c.tienda_id) : "");
    if (c.emails && c.emails.length > 0) {
      setEmails(c.emails.map(e => ({ email: e.email, tipo: e.tipo_email || "Principal" })));
    } else {
      setEmails([{ email: "", tipo: "Principal" }]);
    }
    if (c.telefonos && c.telefonos.length > 0) {
      setTelefonos(c.telefonos.map(t => ({ telefono: t.telefono, tipo: t.tipo_telefono || "Principal" })));
    } else {
      setTelefonos([{ telefono: "", tipo: "Principal" }]);
    }
    setModalOpen("edit");
  };

  const executeSaveCliente = async (forceCreateNew: boolean = false) => {
    setLoading(true);
    try {
      const isEdit = modalOpen === "edit";
      const res = await fetch("/api/clientes", {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: isEdit ? selectedCliente?.id : undefined,
          dni: dni.trim() || null,
          nombre,
          fecha_de_nacimiento: fechaNacimiento || null,
          tienda_id: tiendaId ? Number(tiendaId) : null,
          emails: emails.filter(e => e.email),
          telefonos: telefonos.filter(t => t.telefono)
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Error al guardar cliente.");

      const mappedEmails = emails.filter(e => e.email).map(e => ({ email: e.email, tipo_email: e.tipo }));
      const mappedTelefonos = telefonos.filter(t => t.telefono).map(t => ({ telefono: t.telefono, tipo_telefono: t.tipo }));

      if (isEdit && selectedCliente) {
        setClientes(clientes.map(c => c.id === selectedCliente.id ? {
          ...c,
          dni: dni.trim() || null,
          nombre,
          fecha_de_nacimiento: fechaNacimiento || null,
          tienda_id: tiendaId ? Number(tiendaId) : null,
          emails: mappedEmails,
          telefonos: mappedTelefonos
        } : c));
        showNotification("Cliente actualizado correctamente.", "success");
      } else {
        const nuevoCliente: ClienteItem = {
          id: data.data.id,
          cliente_id: data.data.cliente_id,
          dni: data.data.dni,
          nombre: data.data.nombre,
          fecha_de_nacimiento: data.data.fecha_de_nacimiento,
          tienda_id: data.data.tienda_id,
          emails: mappedEmails,
          telefonos: mappedTelefonos,
          expedientes: []
        };
        setClientes([nuevoCliente, ...clientes]);
        showNotification("Cliente registrado correctamente.", "success");
      }

      setModalOpen(false);
      setSelectedCliente(null);
      router.refresh();
    } catch (err: any) {
      showNotification(err.message, "error");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveCliente = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nombre.trim()) return;
    setLoading(true);

    const isEdit = modalOpen === "edit";

    // Verificar duplicado al registrar uno nuevo
    if (!isEdit) {
      try {
        const checkRes = await fetch("/api/clientes/verificar-existencia", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dni: dni.trim() || null, nombre: nombre.trim() })
        });
        if (checkRes.ok) {
          const checkData = await checkRes.json();
          if (checkData.exists) {
            setDuplicateClientInfo(checkData.cliente);
            setShowDuplicateModal(true);
            setLoading(false);
            return;
          }
        }
      } catch (err) {
        console.error("Error al comprobar existencia de cliente", err);
      }
    }

    await executeSaveCliente();
  };

  // Lógica de eliminación unitaria
  const handleDeleteConfirm = async () => {
    if (!confirmDeleteCliente) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/clientes?id=${confirmDeleteCliente.id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Error al eliminar cliente.");

      setClientes(clientes.filter(c => c.id !== confirmDeleteCliente.id));
      setSelectedIds(selectedIds.filter(id => id !== confirmDeleteCliente.id));
      showNotification("Cliente eliminado correctamente.", "success");
      setConfirmDeleteCliente(null);
      router.refresh();
    } catch (err: any) {
      showNotification(err.message, "error");
    } finally {
      setLoading(false);
    }
  };

  // Lógica de eliminación masiva
  const handleBulkDeleteConfirm = async () => {
    if (selectedIds.length === 0) return;
    setLoading(true);
    try {
      const res = await fetch("/api/clientes", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: selectedIds })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Error al eliminar clientes seleccionados.");

      setClientes(clientes.filter(c => !selectedIds.includes(c.id)));
      showNotification(`${selectedIds.length} clientes eliminados correctamente.`, "success");
      setSelectedIds([]);
      setConfirmBulkDelete(false);
      router.refresh();
    } catch (err: any) {
      showNotification(err.message, "error");
    } finally {
      setLoading(false);
    }
  };

  // Gestión de Selección
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(filteredClientesSorted.map(c => c.id));
    } else {
      setSelectedIds([]);
    }
  };

  const handleSelectOne = (id: number, checked: boolean) => {
    if (checked) {
      setSelectedIds([...selectedIds, id]);
    } else {
      setSelectedIds(selectedIds.filter(x => x !== id));
    }
  };

  // Manejo de Ordenación
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  // Exportar clientes a CSV
  const handleExportCSV = (onlySelected = false) => {
    const listToExport = onlySelected
      ? clientes.filter(c => selectedIds.includes(c.id))
      : filteredClientesSorted;
    if (listToExport.length === 0) {
      showNotification("No hay clientes para exportar.", "error");
      return;
    }
    const headers = ["ID", "Nombre", "DNI", "Fecha Nacimiento", "Tienda", "Emails", "Telefonos", "Num Expedientes"];
    const rows = listToExport.map(c => [
      c.id,
      c.nombre || "",
      c.dni || "",
      c.fecha_de_nacimiento || "",
      tiendas.find(t => t.id_tienda === c.tienda_id)?.nombre || "",
      c.emails.map(e => `${e.email}:${e.tipo_email || "Principal"}`).join("|"),
      c.telefonos.map(t => `${t.telefono}:${t.tipo_telefono || "Principal"}`).join("|"),
      c.expedientes?.length || 0
    ]);
    const csvContent = "\uFEFF" + [
      "sep=;",
      headers.join(";"),
      ...rows.map(r => r.map(val => `"${String(val).replace(/"/g, '""')}"`).join(";"))
    ].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `clientes_${onlySelected ? 'seleccionados_' : ''}export_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showNotification("Exportación CSV realizada con éxito.", "success");
  };

  // Importar clientes desde CSV
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
        const lines = text.split(/\r?\n/).filter(line => line.trim().length > 0);
        if (lines.length < 2) throw new Error("El CSV no contiene suficientes líneas.");
        let headerIndex = 0;
        if (lines[0].toLowerCase().startsWith("sep=")) headerIndex = 1;
        if (lines.length <= headerIndex + 1) throw new Error("El CSV no contiene datos.");
        const headerLine = lines[headerIndex];
        const delimiter = headerLine.includes(";") ? ";" : ",";
        const rawHeaders = headerLine.split(delimiter).map(h => h.trim().replace(/^["']|["']$/g, "").toLowerCase());
        const getColIndex = (names: string[]) => rawHeaders.findIndex(h => names.some(n => h.includes(n)));
        const idxNombre = getColIndex(["nombre", "name"]);
        const idxDni = getColIndex(["dni", "nif"]);
        const idxFechaNac = getColIndex(["fecha nacimiento", "fecha_de_nacimiento", "fecha_nacimiento"]);
        const idxTienda = getColIndex(["tienda"]);
        const idxEmails = getColIndex(["emails", "correos"]);
        const idxTels = getColIndex(["telefonos", "teléfonos", "tels"]);
        const itemsToImport = [];
        for (let i = headerIndex + 1; i < lines.length; i++) {
          const line = lines[i];
          let parts: string[] = [];
          let current = "";
          let inQuotes = false;
          for (let c = 0; c < line.length; c++) {
            const char = line[c];
            if (char === '"') { inQuotes = !inQuotes; }
            else if (char === delimiter && !inQuotes) { parts.push(current.trim().replace(/^["']|["']$/g, "")); current = ""; }
            else { current += char; }
          }
          parts.push(current.trim().replace(/^["']|["']$/g, ""));
          if (parts.length === 0 || (parts.length === 1 && parts[0] === "")) continue;
          const getValue = (idx: number) => idx !== -1 && idx < parts.length ? parts[idx] : null;
          const nombre = getValue(idxNombre);
          if (!nombre) continue;
          itemsToImport.push({
            nombre,
            dni: getValue(idxDni),
            fecha_de_nacimiento: getValue(idxFechaNac),
            tienda_nombre: getValue(idxTienda),
            emails: getValue(idxEmails),
            telefonos: getValue(idxTels),
          });
        }
        if (itemsToImport.length === 0) throw new Error("No se encontraron registros válidos en el CSV.");
        const response = await fetch("/api/clientes/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ items: itemsToImport })
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.message || "Error al importar.");
        showNotification(result.message, "success");
        router.refresh();
      } catch (err: any) {
        showNotification(err.message || "Error al importar el archivo CSV.", "error");
      } finally {
        setLoading(false);
        event.target.value = "";
      }
    };
    reader.onerror = () => { showNotification("Error de lectura del archivo.", "error"); setLoading(false); event.target.value = ""; };
    reader.readAsText(file);
  };

  // Exportar base de datos a JSON (Copia de seguridad)
  const handleExportBackupJSON = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/backup", { method: "GET" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "Error al generar la copia de seguridad.");

      // Inyectar preferencias del navegador en el backup
      const backupWithPrefs = {
        ...result,
        preferences: {
          expDefaultPageSize: Number(localStorage.getItem("exp-default-page-size") || "20"),
          sidebarCollapsed: localStorage.getItem("sidebar-collapsed") === "true",
        }
      };

      const jsonString = `data:text/json;charset=utf-8,${encodeURIComponent(JSON.stringify(backupWithPrefs, null, 2))}`;
      const downloadAnchor = document.createElement("a");
      downloadAnchor.setAttribute("href", jsonString);
      downloadAnchor.setAttribute("download", `backup_completo_${new Date().toISOString().split("T")[0]}.json`);
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
      "Esto ELIMINARÁ permanentemente todos los datos existentes e importará los registros del archivo.\n\n" +
      "¿Estás completamente seguro de que deseas proceder?"
    );
    if (!confirmRestore) { event.target.value = ""; return; }
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
        if (!response.ok) throw new Error(result.message || "Error al restaurar la copia de seguridad.");
        showNotification(result.message, "success");
        router.refresh();
        setTimeout(() => { window.location.reload(); }, 1500);
      } catch (err: any) {
        showNotification(err.message || "Error al restaurar.", "error");
      } finally {
        setLoading(false);
        event.target.value = "";
      }
    };
    reader.onerror = () => { showNotification("Error de lectura del archivo.", "error"); setLoading(false); event.target.value = ""; };
    reader.readAsText(file);
  };

  // Filtrado de Clientes
  const filteredClientes = useMemo(() => {
    return clientes.filter(c => {
      // Buscador global
      if (globalSearch) {
        const gs = globalSearch.toLowerCase();
        const matchNombre = c.nombre?.toLowerCase().includes(gs);
        const matchDni = c.dni?.toLowerCase().includes(gs);
        const matchEmail = c.emails.some(e => e.email.toLowerCase().includes(gs));
        const matchTel = c.telefonos.some(t => t.telefono.toLowerCase().includes(gs));
        const matchTienda = tiendas.find(t => t.id_tienda === c.tienda_id)?.nombre.toLowerCase().includes(gs);
        if (!matchNombre && !matchDni && !matchEmail && !matchTel && !matchTienda) return false;
      }
      // Filtrar por Nombre
      if (filterNombre && !c.nombre?.toLowerCase().includes(filterNombre.toLowerCase())) {
        return false;
      }
      // Filtrar por DNI
      if (filterDni && !c.dni?.toLowerCase().includes(filterDni.toLowerCase())) {
        return false;
      }
      // Filtrar por Fecha Nacimiento (formateada o cruda)
      if (filterFechaNacimiento) {
        const fFormatted = c.fecha_de_nacimiento ? formatDate(c.fecha_de_nacimiento).toLowerCase() : "no indicada";
        if (!fFormatted.includes(filterFechaNacimiento.toLowerCase())) {
          return false;
        }
      }
      // Filtrar por Correo
      if (filterCorreo) {
        const match = c.emails.some(e => e.email.toLowerCase().includes(filterCorreo.toLowerCase()));
        if (!match) return false;
      }
      // Filtrar por Teléfono
      if (filterTelefono) {
        const match = c.telefonos.some(t => t.telefono.toLowerCase().includes(filterTelefono.toLowerCase()));
        if (!match) return false;
      }
      // Filtrar por Tienda
      if (filterTienda) {
        if (filterTienda === "global") {
          if (c.tienda_id !== null) return false;
        } else {
          if (c.tienda_id !== Number(filterTienda)) return false;
        }
      }
      return true;
    });
  }, [clientes, globalSearch, filterNombre, filterDni, filterFechaNacimiento, filterCorreo, filterTelefono, filterTienda, tiendas]);

  // Ordenación de Clientes
  const filteredClientesSorted = useMemo(() => {
    const sorted = [...filteredClientes];
    sorted.sort((a, b) => {
      let valA: any = "";
      let valB: any = "";

      if (sortField === "nombre") {
        valA = a.nombre || "";
        valB = b.nombre || "";
      } else if (sortField === "dni") {
        valA = a.dni || "";
        valB = b.dni || "";
      } else if (sortField === "fecha_de_nacimiento") {
        valA = a.fecha_de_nacimiento || "";
        valB = b.fecha_de_nacimiento || "";
      } else if (sortField === "tienda") {
        const tiendaA = tiendas.find(t => t.id_tienda === a.tienda_id)?.nombre || "Global";
        const tiendaB = tiendas.find(t => t.id_tienda === b.tienda_id)?.nombre || "Global";
        valA = tiendaA;
        valB = tiendaB;
      } else if (sortField === "expedientes") {
        valA = a.expedientes?.length || 0;
        valB = b.expedientes?.length || 0;
      } else {
        valA = a.id;
        valB = b.id;
      }

      if (typeof valA === "string") {
        return sortDirection === "asc"
          ? valA.localeCompare(valB)
          : valB.localeCompare(valA);
      } else {
        return sortDirection === "asc"
          ? valA - valB
          : valB - valA;
      }
    });
    return sorted;
  }, [filteredClientes, sortField, sortDirection, tiendas]);

  const totalBulkExpedientes = useMemo(() => {
    return clientes
      .filter(c => selectedIds.includes(c.id))
      .reduce((acc, c) => acc + (c.expedientes?.length || 0), 0);
  }, [clientes, selectedIds]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      {/* NOTIFICACIONES */}
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

      {/* BUSCADOR GLOBAL */}
      <div style={{ position: "relative", maxWidth: "400px" }}>
        <input
          type="text"
          placeholder="🔍 Buscar clientes (nombre, DNI, email, teléfono...)"
          className="form-input"
          value={globalSearch}
          onChange={e => setGlobalSearch(e.target.value)}
          style={{ paddingRight: globalSearch ? "36px" : "12px", width: "100%" }}
        />
        {globalSearch && (
          <button
            type="button"
            onClick={() => setGlobalSearch("")}
            style={{ position: "absolute", right: "10px", top: "50%", transform: "translateY(-50%)", border: "none", background: "none", cursor: "pointer", fontSize: "1rem", color: "var(--text-muted)" }}
          >✖</button>
        )}
      </div>

      {/* BARRA SUPERIOR DE ACCIONES */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "16px", flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
          <button
            type="button"
            className="btn"
            onClick={() => {
              setBulkSelectionUnlocked(!bulkSelectionUnlocked);
              if (bulkSelectionUnlocked) setSelectedIds([]);
            }}
            style={{
              padding: "10px 16px",
              fontSize: "0.85rem",
              backgroundColor: bulkSelectionUnlocked ? "var(--warning)" : "rgba(255,255,255,0.05)",
              color: bulkSelectionUnlocked ? "black" : "var(--text-primary)",
              border: "1px solid var(--border-light)",
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: "6px"
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
              padding: "10px 16px",
              fontSize: "0.85rem",
              backgroundColor: deleteUnlocked ? "var(--danger)" : "rgba(255,255,255,0.05)",
              color: deleteUnlocked ? "white" : "var(--text-primary)",
              border: "1px solid var(--border-light)",
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: "6px"
            }}
            title={deleteUnlocked ? "Bloquear Eliminación" : "Desbloquear Eliminación"}
          >
            {deleteUnlocked ? "🔓 Eliminación Activa" : "🔒 Eliminación Inactiva"}
          </button>

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
            </>
          )}
        </div>

        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
          <button type="button" className="btn btn-primary" onClick={handleOpenCreateModal} style={{ padding: "10px 20px" }}>
            + Registrar Nuevo Cliente
          </button>

          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => handleExportCSV(false)}
            style={{ padding: "8px 14px", fontSize: "0.85rem" }}
          >
            📤 Exportar (CSV)
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

      {/* LISTADO DE CLIENTES */}
      <div className="glass-panel" style={{ padding: "8px" }}>
        {/* RESUMEN */}
        <div style={{ padding: "10px 16px 4px", fontSize: "0.85rem", color: "var(--text-muted)" }}>
          {filteredClientesSorted.length} cliente(s){globalSearch || filterNombre || filterDni || filterFechaNacimiento || filterCorreo || filterTelefono || filterTienda ? ` (de ${clientes.length} totales)` : ""}
        </div>
        <div className="table-container">
          <table className="table-premium">
            <thead>
              <tr>
                {bulkSelectionUnlocked && (
                  <th style={{ width: "40px", textAlign: "center" }}>
                    <input
                      type="checkbox"
                      checked={filteredClientesSorted.length > 0 && selectedIds.length === filteredClientesSorted.length}
                      onChange={e => handleSelectAll(e.target.checked)}
                      style={{ width: "16px", height: "16px", cursor: "pointer" }}
                    />
                  </th>
                )}
                <th onClick={() => handleSort("nombre")} style={{ cursor: "pointer" }}>
                  Nombre {sortField === "nombre" ? (sortDirection === "asc" ? "▲" : "▼") : "↕"}
                </th>
                <th onClick={() => handleSort("dni")} style={{ cursor: "pointer" }}>
                  DNI / NIE {sortField === "dni" ? (sortDirection === "asc" ? "▲" : "▼") : "↕"}
                </th>
                <th onClick={() => handleSort("fecha_de_nacimiento")} style={{ cursor: "pointer" }}>
                  F. Nacimiento {sortField === "fecha_de_nacimiento" ? (sortDirection === "asc" ? "▲" : "▼") : "↕"}
                </th>
                <th>Correos</th>
                <th>Teléfonos</th>
                <th onClick={() => handleSort("tienda")} style={{ cursor: "pointer" }}>
                  Tienda {sortField === "tienda" ? (sortDirection === "asc" ? "▲" : "▼") : "↕"}
                </th>
                <th onClick={() => handleSort("expedientes")} style={{ cursor: "pointer" }}>
                  Ventas {sortField === "expedientes" ? (sortDirection === "asc" ? "▲" : "▼") : "↕"}
                </th>
                <th>Acciones</th>
              </tr>

              {/* FILTROS POR COLUMNA */}
              <tr style={{ background: "rgba(255, 255, 255, 0.01)" }}>
                {bulkSelectionUnlocked && <td></td>}
                <td>
                  <input
                    type="text"
                    placeholder="Filtrar..."
                    className="form-input"
                    value={filterNombre}
                    onChange={e => setFilterNombre(e.target.value)}
                    style={{ padding: "4px 8px", fontSize: "0.75rem", width: "100%", minWidth: "100px" }}
                  />
                </td>
                <td>
                  <input
                    type="text"
                    placeholder="Filtrar..."
                    className="form-input"
                    value={filterDni}
                    onChange={e => setFilterDni(e.target.value)}
                    style={{ padding: "4px 8px", fontSize: "0.75rem", width: "100%", minWidth: "80px" }}
                  />
                </td>
                <td>
                  <input
                    type="text"
                    placeholder="Filtrar..."
                    className="form-input"
                    value={filterFechaNacimiento}
                    onChange={e => setFilterFechaNacimiento(e.target.value)}
                    style={{ padding: "4px 8px", fontSize: "0.75rem", width: "100%", minWidth: "80px" }}
                  />
                </td>
                <td>
                  <input
                    type="text"
                    placeholder="Filtrar..."
                    className="form-input"
                    value={filterCorreo}
                    onChange={e => setFilterCorreo(e.target.value)}
                    style={{ padding: "4px 8px", fontSize: "0.75rem", width: "100%", minWidth: "100px" }}
                  />
                </td>
                <td>
                  <input
                    type="text"
                    placeholder="Filtrar..."
                    className="form-input"
                    value={filterTelefono}
                    onChange={e => setFilterTelefono(e.target.value)}
                    style={{ padding: "4px 8px", fontSize: "0.75rem", width: "100%", minWidth: "80px" }}
                  />
                </td>
                <td>
                  <select
                    className="form-select"
                    value={filterTienda}
                    onChange={e => setFilterTienda(e.target.value)}
                    style={{ padding: "4px 8px", fontSize: "0.75rem", width: "100%", minWidth: "120px" }}
                  >
                    <option value="">Todas</option>
                    <option value="global">Global (Sin Tienda)</option>
                    {tiendas.map(t => (
                      <option key={t.id_tienda} value={t.id_tienda}>{t.nombre}</option>
                    ))}
                  </select>
                </td>
                <td></td>
                <td style={{ textAlign: "center" }}>
                  {(filterNombre || filterDni || filterFechaNacimiento || filterCorreo || filterTelefono || filterTienda) && (
                    <button
                      type="button"
                      onClick={() => {
                        setFilterNombre("");
                        setFilterDni("");
                        setFilterFechaNacimiento("");
                        setFilterCorreo("");
                        setFilterTelefono("");
                        setFilterTienda("");
                      }}
                      style={{ border: "none", background: "none", cursor: "pointer", fontSize: "0.85rem", color: "var(--danger)" }}
                      title="Limpiar filtros"
                    >
                      ✖
                    </button>
                  )}
                </td>
              </tr>
            </thead>
            <tbody>
              {filteredClientesSorted.length === 0 ? (
                <tr>
                  <td colSpan={bulkSelectionUnlocked ? 9 : 8} style={{ textAlign: "center", padding: "40px 20px", color: "var(--text-muted)", fontStyle: "italic" }}>
                    {clientes.length === 0
                      ? "No hay clientes registrados en el sistema."
                      : "No se encontraron clientes que coincidan con los filtros aplicados."
                    }
                  </td>
                </tr>
              ) : filteredClientesSorted.map((c) => {
                  const tiendaAsociada = tiendas.find(t => t.id_tienda === c.tienda_id);
                  const isSelected = selectedIds.includes(c.id);
                  return (
                    <tr key={c.id} style={{ background: isSelected && bulkSelectionUnlocked ? "rgba(var(--primary-rgb), 0.04)" : undefined }}>
                      {bulkSelectionUnlocked && (
                        <td style={{ textAlign: "center" }}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={e => handleSelectOne(c.id, e.target.checked)}
                            style={{ width: "16px", height: "16px", cursor: "pointer" }}
                          />
                        </td>
                      )}
                      <td style={{ fontWeight: "bold", color: "var(--text-primary)" }}>{c.nombre}</td>
                      <td>{c.dni || "N/D"}</td>
                      <td>{c.fecha_de_nacimiento ? formatDate(c.fecha_de_nacimiento) : "No indicada"}</td>
                      <td>
                        <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                          {c.emails.map((e, idx) => (
                            <div key={idx} style={{ fontSize: "0.85rem" }}>
                              <span style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginRight: "4px" }}>
                                ({e.tipo_email || "Principal"}):
                              </span>
                              {e.email}
                            </div>
                          ))}
                          {c.emails.length === 0 && <span style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>Ninguno</span>}
                        </div>
                      </td>
                      <td>
                        <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                          {c.telefonos.map((t, idx) => (
                            <div key={idx} style={{ fontSize: "0.85rem" }}>
                              <span style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginRight: "4px" }}>
                                ({t.tipo_telefono || "Principal"}):
                              </span>
                              {t.telefono}
                            </div>
                          ))}
                          {c.telefonos.length === 0 && <span style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>Ninguno</span>}
                        </div>
                      </td>
                      <td>
                        <span className={`badge ${tiendaAsociada ? "badge-tienda" : "badge-invitado"}`} style={{ fontSize: "0.75rem" }}>
                          {tiendaAsociada ? tiendaAsociada.nombre : "Global (Sin Tienda)"}
                        </span>
                      </td>
                      <td>
                        {c.expedientes && c.expedientes.length > 0 ? (
                          <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={() => setExpedientesModalCliente(c)}
                            style={{
                              padding: "6px 12px",
                              fontSize: "0.8rem",
                              fontWeight: "bold",
                              color: "var(--primary)",
                              border: "1px solid var(--primary)",
                              background: "rgba(6, 182, 212, 0.05)",
                              borderRadius: "var(--radius-sm)",
                              cursor: "pointer"
                            }}
                          >
                            {c.expedientes.length} venta(s)
                          </button>
                        ) : (
                          <span style={{ color: "var(--text-muted)", fontSize: "0.9rem", paddingLeft: "12px" }}>0</span>
                        )}
                      </td>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={() => handleOpenEditModal(c)}
                            style={{ padding: "6px 12px", fontSize: "0.8rem" }}
                          >
                            ✏️ Editar
                          </button>
                          <button
                             type="button"
                             onClick={() => {
                               if (deleteUnlocked) setConfirmDeleteCliente(c);
                             }}
                             style={{
                               padding: "6px 12px",
                               fontSize: "0.8rem",
                               color: deleteUnlocked ? "var(--danger)" : "var(--text-muted)",
                               background: deleteUnlocked ? "rgba(239, 68, 68, 0.05)" : "rgba(255, 255, 255, 0.02)",
                               border: deleteUnlocked ? "1px solid rgba(239, 68, 68, 0.2)" : "1px solid var(--border-light)",
                               borderRadius: "var(--radius-sm)",
                               cursor: deleteUnlocked ? "pointer" : "not-allowed",
                               opacity: deleteUnlocked ? 1 : 0.5
                             }}
                             disabled={!deleteUnlocked}
                           >
                             🗑️ Eliminar
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

      {/* CONFIRMAR BORRADO CLIENTE (MODAL) */}
      {confirmDeleteCliente && (
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
          zIndex: 9999,
          backdropFilter: "blur(4px)"
        }}>
          <div className="glass-panel" style={{ padding: "32px", maxWidth: "450px", display: "flex", flexDirection: "column", gap: "24px", background: "var(--bg-card)" }}>
            <h3 style={{ margin: 0, color: "var(--danger)" }}>⚠️ Confirmar Eliminación</h3>
            {confirmDeleteCliente.expedientes && confirmDeleteCliente.expedientes.length > 0 ? (
              <p style={{ margin: 0, color: "var(--text-secondary)", lineHeight: "1.6" }}>
                El cliente <strong>{confirmDeleteCliente.nombre}</strong> tiene <strong>{confirmDeleteCliente.expedientes.length}</strong> expediente(s) de venta asociado(s).
                <br />
                <span style={{ color: "var(--warning)", fontWeight: "600", display: "block", marginTop: "12px", padding: "10px", background: "rgba(230, 157, 0, 0.05)", border: "1px solid rgba(230, 157, 0, 0.15)", borderRadius: "var(--radius-sm)" }}>
                  ⚠️ Si continúas, estos expedientes se desvincularán del cliente y pasarán a quedar registrados como "Sin cliente".
                </span>
                <span style={{ display: "block", marginTop: "12px" }}>
                  ¿Deseas confirmar la eliminación del cliente?
                </span>
              </p>
            ) : (
              <p style={{ margin: 0, color: "var(--text-secondary)", lineHeight: "1.6" }}>
                ¿Estás seguro de que deseas eliminar al cliente <strong>{confirmDeleteCliente.nombre}</strong>?
                <br />
                <span style={{ color: "var(--text-muted)", fontSize: "0.85rem", display: "block", marginTop: "8px" }}>
                  Nota: Se eliminarán de forma definitiva sus datos de contacto (correos y teléfonos).
                </span>
              </p>
            )}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px" }}>
              <button type="button" className="btn btn-secondary" onClick={() => setConfirmDeleteCliente(null)} disabled={loading}>
                Cancelar
              </button>
              <button type="button" className="btn" onClick={handleDeleteConfirm} disabled={loading} style={{ backgroundColor: "var(--danger)", color: "#fff", border: "none" }}>
                {loading ? "Eliminando..." : "Sí, Eliminar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CONFIRMAR BORRADO MASIVO CLIENTES (MODAL) */}
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
          zIndex: 9999,
          backdropFilter: "blur(4px)"
        }}>
          <div className="glass-panel" style={{ padding: "32px", maxWidth: "450px", display: "flex", flexDirection: "column", gap: "24px", background: "var(--bg-card)" }}>
            <h3 style={{ margin: 0, color: "var(--danger)" }}>⚠️ Confirmar Eliminación Masiva</h3>
            {totalBulkExpedientes > 0 ? (
              <p style={{ margin: 0, color: "var(--text-secondary)", lineHeight: "1.6" }}>
                Vas a eliminar <strong>{selectedIds.length}</strong> clientes, los cuales acumulan un total de <strong>{totalBulkExpedientes}</strong> expediente(s) de venta asociados.
                <br />
                <span style={{ color: "var(--warning)", fontWeight: "600", display: "block", marginTop: "12px", padding: "10px", background: "rgba(230, 157, 0, 0.05)", border: "1px solid rgba(230, 157, 0, 0.15)", borderRadius: "var(--radius-sm)" }}>
                  ⚠️ Si continúas, todos estos expedientes quedarán desvinculados (como "Sin cliente").
                </span>
                <span style={{ display: "block", marginTop: "12px" }}>
                  ¿Deseas proceder con la eliminación masiva?
                </span>
              </p>
            ) : (
              <p style={{ margin: 0, color: "var(--text-secondary)", lineHeight: "1.6" }}>
                ¿Estás seguro de que deseas eliminar los <strong>{selectedIds.length}</strong> clientes seleccionados?
                <br />
                <span style={{ color: "var(--text-muted)", fontSize: "0.85rem", display: "block", marginTop: "8px" }}>
                  Nota: Se borrarán sus datos de contacto de forma definitiva.
                </span>
              </p>
            )}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px" }}>
              <button type="button" className="btn btn-secondary" onClick={() => setConfirmBulkDelete(false)} disabled={loading}>
                Cancelar
              </button>
              <button type="button" className="btn" onClick={handleBulkDeleteConfirm} disabled={loading} style={{ backgroundColor: "var(--danger)", color: "#fff", border: "none" }}>
                {loading ? "Eliminando..." : "Sí, Eliminar Todo"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FORMULARIO MODAL DE REGISTRO / EDICIÓN */}
      {modalOpen && (
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
            padding: "32px",
            display: "flex",
            flexDirection: "column",
            gap: "24px",
            maxHeight: "90vh",
            overflowY: "auto",
            background: "var(--bg-card)"
          }}>
            <h3 style={{ fontSize: "1.25rem", color: "var(--text-primary)" }}>
              {modalOpen === "edit" ? "Editar Cliente" : "Registrar Nuevo Cliente"}
            </h3>

            <form onSubmit={handleSaveCliente} style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">DNI / NIE</label>
                  <input type="text" className="form-input" placeholder="Ej. 12345678Z" value={dni} onChange={e => setDni(e.target.value)} />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Nombre Completo *</label>
                  <input type="text" className="form-input" placeholder="Ej. María López" value={nombre} onChange={e => setNombre(e.target.value)} required />
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Fecha de Nacimiento</label>
                  <input type="date" className="form-input" value={fechaNacimiento} onChange={e => setFechaNacimiento(e.target.value)} />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Tienda de Registro</label>
                  <select className="form-select" value={tiendaId} onChange={e => setTiendaId(e.target.value)}>
                    <option value="">Selecciona Tienda (Opcional)</option>
                    {tiendas.map(t => (
                      <option key={t.id_tienda} value={t.id_tienda}>{t.nombre} {t.ciudad ? `(${t.ciudad})` : ""}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* EMAILS DINÁMICOS */}
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                  <label className="form-label" style={{ marginBottom: 0 }}>Correos Electrónicos</label>
                  <button type="button" className="btn btn-secondary" onClick={addEmail} style={{ padding: "4px 8px", fontSize: "0.75rem" }}>+ Añadir</button>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  {emails.map((e, idx) => (
                    <div key={idx} style={{ display: "flex", gap: "8px" }}>
                      <input type="email" className="form-input" placeholder="correo@ejemplo.com" value={e.email} onChange={event => handleEmailChange(idx, event.target.value)} style={{ flex: 2 }} />
                      <select className="form-select" value={e.tipo} onChange={event => handleEmailTipoChange(idx, event.target.value)} style={{ flex: 1 }}>
                        <option value="Principal">Principal</option>
                        <option value="Trabajo">Trabajo</option>
                        <option value="Personal">Personal</option>
                      </select>
                      {emails.length > 1 && (
                        <button type="button" className="btn btn-secondary" onClick={() => removeEmail(idx)} style={{ padding: "10px", color: "var(--danger)" }}>🗑️</button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* TELEFONOS DINÁMICOS */}
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                  <label className="form-label" style={{ marginBottom: 0 }}>Teléfonos de Contacto</label>
                  <button type="button" className="btn btn-secondary" onClick={addTelefono} style={{ padding: "4px 8px", fontSize: "0.75rem" }}>+ Añadir</button>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  {telefonos.map((t, idx) => (
                    <div key={idx} style={{ display: "flex", gap: "8px" }}>
                      <input type="text" className="form-input" placeholder="Ej. 600123456" value={t.telefono} onChange={event => handleTelefonoChange(idx, event.target.value)} style={{ flex: 2 }} />
                      <select className="form-select" value={t.tipo} onChange={event => handleTelefonoTipoChange(idx, event.target.value)} style={{ flex: 1 }}>
                        <option value="Principal">Principal</option>
                        <option value="Móvil">Móvil</option>
                        <option value="Trabajo">Trabajo</option>
                      </select>
                      {telefonos.length > 1 && (
                        <button type="button" className="btn btn-secondary" onClick={() => removeTelefono(idx)} style={{ padding: "10px", color: "var(--danger)" }}>🗑️</button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px", marginTop: "10px" }}>
                <button type="button" className="btn btn-secondary" onClick={() => setModalOpen(false)} disabled={loading}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary" disabled={loading}>
                  {loading ? "Guardando..." : (modalOpen === "edit" ? "Guardar Cambios" : "Registrar Cliente")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DETALLES DE VENTAS (MODAL) */}
      {expedientesModalCliente && (
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
            maxWidth: "800px",
            padding: "32px",
            display: "flex",
            flexDirection: "column",
            gap: "24px",
            maxHeight: "90vh",
            overflowY: "auto"
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={{ fontSize: "1.25rem", color: "var(--text-primary)", margin: 0 }}>
                Expedientes de {expedientesModalCliente.nombre}
              </h3>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setExpedientesModalCliente(null)}
                style={{ padding: "6px 12px", fontSize: "0.8rem", color: "var(--danger)" }}
              >
                Cerrar
              </button>
            </div>

            <div className="table-container">
              <table className="table-premium">
                <thead>
                  <tr>
                    <th>Código</th>
                    <th>Vehículo</th>
                    <th>Método de Venta</th>
                    <th>Estado Vehículo</th>
                    <th>Matrícula</th>
                    <th>Fecha</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {(expedientesModalCliente.expedientes || []).map((exp: any) => (
                    <tr key={exp.id_expediente}>
                      <td style={{ fontWeight: "bold", color: "var(--primary)" }}>
                        #EXP-{String(exp.id_expediente).padStart(4, "0")}
                      </td>
                      <td>
                        {exp.modelo ? (
                          <>
                            <div style={{ fontWeight: 500, color: "var(--text-primary)" }}>{exp.modelo.nombre_modelo}</div>
                            <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>{exp.modelo.marca?.nombre}</div>
                          </>
                        ) : "N/D"}
                      </td>
                      <td>
                        {exp.tipoDeVenta && (
                          <span className="badge" style={{
                            fontSize: "0.7rem",
                            backgroundColor: exp.tipoDeVenta.color || "#3b82f6",
                            color: "#fff"
                          }}>
                            {exp.tipoDeVenta.nombre_tipo_venta}
                          </span>
                        )}
                      </td>
                      <td>
                        <span className={`badge badge-${exp.estadoVehiculo?.nombre_estado_vehiculo?.toLowerCase() === 'nuevo' ? 'tienda' : 'vendedor'}`}>
                          {exp.estadoVehiculo?.nombre_estado_vehiculo || "N/D"}
                        </span>
                      </td>
                      <td>{exp.matricula || "N/D"}</td>
                      <td>{exp.fecha_expediente ? formatDate(exp.fecha_expediente) : "N/D"}</td>
                      <td>
                        <button
                          type="button"
                          className="btn btn-secondary"
                          onClick={() => {
                            setExpedientesModalCliente(null);
                            router.push(`/dashboard/expedientes/editar/${exp.id_expediente}`);
                          }}
                          style={{ padding: "6px 12px", fontSize: "0.8rem", display: "flex", alignItems: "center", gap: "4px" }}
                        >
                          ✏️ Editar
                        </button>
                      </td>
                    </tr>
                  ))}
                  {(!expedientesModalCliente.expedientes || expedientesModalCliente.expedientes.length === 0) && (
                    <tr>
                      <td colSpan={7} style={{ textAlign: "center", color: "var(--text-muted)", fontStyle: "italic", padding: "20px" }}>
                        No hay expedientes asociados a este cliente.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {showDuplicateModal && duplicateClientInfo && (
        <div className="modal-backdrop" style={{
          position: "fixed",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          backgroundColor: "rgba(0, 0, 0, 0.6)",
          backdropFilter: "blur(4px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 1100
        }}>
          <div className="glass-panel" style={{
            width: "90%",
            maxWidth: "500px",
            padding: "32px",
            display: "flex",
            flexDirection: "column",
            gap: "24px",
            textAlign: "center"
          }}>
            <h3 style={{ fontSize: "1.4rem", fontWeight: 600, color: "var(--warning)" }}>
              ⚠️ Cliente Ya Registrado
            </h3>
            <p style={{ color: "var(--text-secondary)", fontSize: "0.95rem", lineHeight: "1.5" }}>
              Se ha encontrado un cliente en la base de datos que coincide con el DNI o Nombre ingresado:
              <br />
              <strong style={{ color: "var(--text-primary)" }}>{duplicateClientInfo.nombre}</strong> {duplicateClientInfo.dni ? `(${duplicateClientInfo.dni})` : ""}
              <br /><br />
              ¿Qué deseas hacer?
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginTop: "8px" }}>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  setShowDuplicateModal(false);
                  setModalOpen(false);
                  setDuplicateClientInfo(null);
                  showNotification(`Se canceló el registro. Ya existe el cliente ${duplicateClientInfo.nombre}.`, "success");
                }}
                style={{ width: "100%", justifyContent: "center" }}
              >
                🤝 Usar Cliente Existente (Cancelar Registro)
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={async () => {
                  setShowDuplicateModal(false);
                  await executeSaveCliente(true);
                }}
                style={{ width: "100%", justifyContent: "center" }}
              >
                🆕 Registrar como Cliente Nuevo de Todos Modos
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  setShowDuplicateModal(false);
                  setDuplicateClientInfo(null);
                }}
                style={{
                  width: "100%",
                  justifyContent: "center",
                  backgroundColor: "rgba(239, 68, 68, 0.1)",
                  color: "var(--danger)",
                  border: "1px solid rgba(239, 68, 68, 0.2)"
                }}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
