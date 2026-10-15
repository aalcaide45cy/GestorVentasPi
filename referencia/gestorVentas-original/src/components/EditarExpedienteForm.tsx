"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

interface DropdownItem {
  id: number;
  nombre: string;
}

interface TiendaDropdownItem {
  id: number;
  nombre: string;
  ciudad: string | null;
}

interface EditarExpedienteFormProps {
  expediente: any;
  marcas: DropdownItem[];
  modelosPorMarca: Record<number, DropdownItem[]>;
  tiposVenta: DropdownItem[];
  estadosVehiculo: DropdownItem[];
  tiendas: TiendaDropdownItem[];
  userRole?: string;
  usuarios?: DropdownItem[];
}

export default function EditarExpedienteForm({
  expediente,
  marcas,
  modelosPorMarca,
  tiposVenta,
  estadosVehiculo,
  tiendas,
  userRole = "vendedor",
  usuarios = []
}: EditarExpedienteFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [clientNotification, setClientNotification] = useState<string | null>(null);
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [pendingNavigationUrl, setPendingNavigationUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Estados para Navegación de Expedientes (Anterior/Siguiente)
  const [prevId, setPrevId] = useState<number | null>(null);
  const [nextId, setNextId] = useState<number | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("visible_expediente_ids");
      if (stored) {
        try {
          const ids: number[] = JSON.parse(stored);
          const currentIndex = ids.indexOf(expediente.id_expediente);
          if (currentIndex !== -1) {
            if (currentIndex > 0) {
              setPrevId(ids[currentIndex - 1]);
            } else {
              setPrevId(null);
            }
            if (currentIndex < ids.length - 1) {
              setNextId(ids[currentIndex + 1]);
            } else {
              setNextId(null);
            }
          }
        } catch (e) {
          console.error("Error parsing visible_expediente_ids", e);
        }
      }
    }
  }, [expediente.id_expediente]);

  // Estado del Cliente (Pre-cargado)
  const [dni, setDni] = useState(expediente.cliente?.dni || "");
  const [nombre, setNombre] = useState(expediente.cliente?.nombre || "");
  const [fechaNacimiento, setFechaNacimiento] = useState(expediente.cliente?.fecha_de_nacimiento || "");
  const [tiendaId, setTiendaId] = useState(expediente.id_tienda ? String(expediente.id_tienda) : "");

  // Subformularios Dinámicos de Emails y Teléfonos del Cliente pre-cargado
  const [emails, setEmails] = useState<{ email: string; tipo: string }[]>(
    expediente.cliente?.emails && expediente.cliente.emails.length > 0
      ? expediente.cliente.emails.map((e: any) => ({ email: e.email, tipo: e.tipo_email || "Principal" }))
      : [{ email: "", tipo: "Principal" }]
  );
  const [telefonos, setTelefonos] = useState<{ telefono: string; tipo: string }[]>(
    expediente.cliente?.telefonos && expediente.cliente.telefonos.length > 0
      ? expediente.cliente.telefonos.map((t: any) => ({ telefono: t.telefono, tipo: t.tipo_telefono || "Principal" }))
      : [{ telefono: "", tipo: "Principal" }]
  );

  // Estados para buscar y re-asignar cliente
  const [busquedaCliente, setBusquedaCliente] = useState("");
  const [resultadosClientes, setResultadosClientes] = useState<any[]>([]);
  const [buscandoCliente, setBuscandoCliente] = useState(false);
  const [clienteAsignado, setClienteAsignado] = useState<any | null>(expediente.cliente || null);

  const handleBuscarCliente = async (val: string) => {
    setBusquedaCliente(val);
    if (val.trim().length < 2) {
      setResultadosClientes([]);
      return;
    }
    setBuscandoCliente(true);
    try {
      const res = await fetch(`/api/clientes/buscar?q=${encodeURIComponent(val)}`);
      if (res.ok) {
        const data = await res.json();
        setResultadosClientes(data.data || []);
      }
    } catch (e) {
      console.error("Error al buscar cliente:", e);
    } finally {
      setBuscandoCliente(false);
    }
  };

  const handleSeleccionarCliente = (c: any) => {
    setClienteAsignado(c);
    setDni(c.dni || "");
    setNombre(c.nombre || "");
    setFechaNacimiento(c.fecha_de_nacimiento || "");
    setTiendaId(c.tienda_id ? String(c.tienda_id) : "");
    
    if (c.emails && c.emails.length > 0) {
      setEmails(c.emails.map((e: any) => ({ email: e.email, tipo: e.tipo_email || "Principal" })));
    } else {
      setEmails([{ email: "", tipo: "Principal" }]);
    }

    if (c.telefonos && c.telefonos.length > 0) {
      setTelefonos(c.telefonos.map((t: any) => ({ telefono: t.telefono, tipo: t.tipo_telefono || "Principal" })));
    } else {
      setTelefonos([{ telefono: "", tipo: "Principal" }]);
    }

    setBusquedaCliente("");
    setResultadosClientes([]);
  };

  const handleDesasignarCliente = () => {
    setClienteAsignado(null);
    setDni("");
    setNombre("");
    setFechaNacimiento("");
    setTiendaId(tiendas.length === 1 ? String(tiendas[0].id) : "");
    setEmails([{ email: "", tipo: "Principal" }]);
    setTelefonos([{ telefono: "", tipo: "Principal" }]);
  };

  const isClienteModificado = () => {
    if (!clienteAsignado) return false;
    
    const oriDni = clienteAsignado.dni || "";
    const oriNombre = clienteAsignado.nombre || "";
    const oriFechaNac = clienteAsignado.fecha_de_nacimiento || "";
    const oriTiendaId = clienteAsignado.tienda_id ? String(clienteAsignado.tienda_id) : "";
    
    if (dni !== oriDni) return true;
    if (nombre !== oriNombre) return true;
    if (fechaNacimiento !== oriFechaNac) return true;
    if (tiendaId !== oriTiendaId) return true;
    
    const currentEmails = emails.filter(e => e.email.trim() !== "");
    const originalEmails = clienteAsignado.emails || [];
    if (currentEmails.length !== originalEmails.length) return true;
    for (let i = 0; i < currentEmails.length; i++) {
      const curr = currentEmails[i];
      const orig = originalEmails[i];
      if (!orig) return true;
      if (curr.email !== orig.email) return true;
      const currTipo = curr.tipo || "Principal";
      const origTipo = orig.tipo_email || orig.tipo || "Principal";
      if (currTipo !== origTipo) return true;
    }

    const currentTelefonos = telefonos.filter(t => t.telefono.trim() !== "");
    const originalTelefonos = clienteAsignado.telefonos || [];
    if (currentTelefonos.length !== originalTelefonos.length) return true;
    for (let i = 0; i < currentTelefonos.length; i++) {
      const curr = currentTelefonos[i];
      const orig = originalTelefonos[i];
      if (!orig) return true;
      if (curr.telefono !== orig.telefono) return true;
      const currTipo = curr.tipo || "Principal";
      const origTipo = orig.tipo_telefono || orig.tipo || "Principal";
      if (currTipo !== origTipo) return true;
    }

    return false;
  };

  const handleGuardarCambiosCliente = async () => {
    if (!clienteAsignado) return;
    setLoading(true);
    setError(null);
    try {
      const body = {
        id: clienteAsignado.id,
        dni,
        nombre,
        fecha_de_nacimiento: fechaNacimiento || null,
        tienda_id: tiendaId ? Number(tiendaId) : null,
        emails: emails.filter(e => e.email.trim() !== "").map(e => ({ email: e.email, tipo: e.tipo })),
        telefonos: telefonos.filter(t => t.telefono.trim() !== "").map(t => ({ telefono: t.telefono, tipo: t.tipo }))
      };
      
      const res = await fetch("/api/clientes", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || "Error al actualizar los datos del cliente.");
      }
      
      setClienteAsignado({
        ...clienteAsignado,
        dni,
        nombre,
        fecha_de_nacimiento: fechaNacimiento || null,
        tienda_id: tiendaId ? Number(tiendaId) : null,
        emails: emails.filter(e => e.email.trim() !== "").map(e => ({ email: e.email, tipo_email: e.tipo })),
        telefonos: telefonos.filter(t => t.telefono.trim() !== "").map(t => ({ telefono: t.telefono, tipo_telefono: t.tipo }))
      });
      
      setClientNotification("Cambios guardados correctamente.");
      setTimeout(() => setClientNotification(null), 4000);
    } catch (err: any) {
      setError(err.message || "Ocurrió un error al guardar los cambios del cliente.");
    } finally {
      setLoading(false);
    }
  };

  // Estado del Vehículo y Expediente (Pre-cargados)
  const [marcaSeleccionada, setMarcaSeleccionada] = useState<number | "">(expediente.modelo?.marca_id || "");
  const [modeloSeleccionado, setModeloSeleccionado] = useState<number | "">(expediente.id_modelo || "");
  const [tipoVentaSeleccionado, setTipoVentaSeleccionado] = useState<number | "">(expediente.id_tipo_de_venta || "");
  const [estadoVehiculoSeleccionado, setEstadoVehiculoSeleccionado] = useState<number | "">(expediente.id_estado_vehiculo || "");
  const [valorObjetivo, setValorObjetivo] = useState<number>(
    expediente.valor_objetivo !== undefined && expediente.valor_objetivo !== null
      ? Number(expediente.valor_objetivo)
      : 1
  );
  const [minCochesMultiplicador, setMinCochesMultiplicador] = useState<number>(
    expediente.min_coches_multiplicador !== undefined && expediente.min_coches_multiplicador !== null
      ? Number(expediente.min_coches_multiplicador)
      : 0
  );
  const [comisionBreakdown, setComisionBreakdown] = useState<any | null>(null);
  const [calculandoComision, setCalculandoComision] = useState(false);
  const [vendedorSeleccionado, setVendedorSeleccionado] = useState(expediente.id_usuario ? String(expediente.id_usuario) : "");

  const [fechaExpediente, setFechaExpediente] = useState(expediente.fecha_expediente || "");
  const [fechaAfectacion, setFechaAfectacion] = useState(expediente.fecha_afectacion || "");
  const [fechaRci, setFechaRci] = useState(expediente.fecha_rci || "");
  const [fechaMatriculacion, setFechaMatriculacion] = useState(expediente.fecha_matriculacion || "");
  const [fechaFacturacion, setFechaFacturacion] = useState(expediente.fecha_facturacion || "");
  const [fechaEntrega, setFechaEntrega] = useState(expediente.fecha_entrega || "");
  const [matricula, setMatricula] = useState(expediente.matricula || "");
  const [vin, setVin] = useState(expediente.vin || "");
  const [cobradoOtraFecha, setCobradoOtraFecha] = useState<boolean>(expediente.cobrado_otra_fecha || false);
  const [fechaCobrado, setFechaCobrado] = useState<string>(expediente.fecha_cobrado || "");

  // Estados de Verificación y Control de Comisiones
  const [comisionCocheCobrada, setComisionCocheCobrada] = useState<boolean>(expediente.comision_coche_cobrada || false);
  const [comisionUsadoCobrada, setComisionUsadoCobrada] = useState<boolean>(expediente.comision_usado_cobrada || false);
  const [comisionFinanciacionCobrada, setComisionFinanciacionCobrada] = useState<boolean>(expediente.comision_financiacion_cobrada || false);
  const [comisionPreferenceCobrada, setComisionPreferenceCobrada] = useState<boolean>(expediente.comision_preference_cobrada || false);
  const [comisionBonusCobrada, setComisionBonusCobrada] = useState<boolean>(expediente.comision_bonus_cobrada || false);

  const [baselineExpediente, setBaselineExpediente] = useState(expediente);

  useEffect(() => {
    setBaselineExpediente(expediente);
  }, [expediente]);

  const [comisionCocheReal, setComisionCocheReal] = useState<string>(
    expediente.comision_coche_real !== null && expediente.comision_coche_real !== undefined ? String(expediente.comision_coche_real) : ""
  );
  const [comisionFinanciacionReal, setComisionFinanciacionReal] = useState<string>(
    expediente.comision_financiacion_real !== null && expediente.comision_financiacion_real !== undefined ? String(expediente.comision_financiacion_real) : ""
  );

  const [conceptosAdicionales, setConceptosAdicionales] = useState<any[]>(() => {
    if (expediente.conceptos_adicionales) {
      try {
        return JSON.parse(expediente.conceptos_adicionales);
      } catch (e) {
        return [];
      }
    }
    return [];
  });

  const [newConceptTitulo, setNewConceptTitulo] = useState("");
  const [newConceptValor, setNewConceptValor] = useState("");
  const [newConceptDescripcion, setNewConceptDescripcion] = useState("");

  // Gestión de Emails Dinámicos (solo si creamos/modificamos un cliente no asignado o suelto)
  const addEmail = () => setEmails([...emails, { email: "", tipo: "Alternativo" }]);
  const removeEmail = (index: number) => setEmails(emails.filter((item, i) => i !== index));
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

  // Gestión de Teléfonos Dinámicos
  const addTelefono = () => setTelefonos([...telefonos, { telefono: "", tipo: "Alternativo" }]);
  const removeTelefono = (index: number) => setTelefonos(telefonos.filter((item, i) => i !== index));
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

  // Obtener modelos de la marca seleccionada
  const modelosDisponibles = marcaSeleccionada !== "" ? modelosPorMarca[Number(marcaSeleccionada)] || [] : [];

  // Control de cambios sin guardar
  const checkIsDirty = () => {
    if (success) return false;

    if (dni !== (expediente.cliente?.dni || "")) return true;
    if (nombre !== (expediente.cliente?.nombre || "")) return true;
    if (fechaNacimiento !== (expediente.cliente?.fecha_de_nacimiento || "")) return true;
    if (tiendaId !== (expediente.id_tienda ? String(expediente.id_tienda) : "")) return true;
    if (vendedorSeleccionado !== (expediente.id_usuario ? String(expediente.id_usuario) : "")) return true;

    // Emails check
    const currentEmails = emails.filter(e => e.email.trim() !== "");
    const originalEmails = expediente.cliente?.emails || [];
    if (currentEmails.length !== originalEmails.length) return true;
    for (let i = 0; i < currentEmails.length; i++) {
      if (currentEmails[i].email !== originalEmails[i].email) return true;
      const currTipo = currentEmails[i].tipo || "Principal";
      const origTipo = originalEmails[i].tipo_email || "Principal";
      if (currTipo !== origTipo) return true;
    }

    // Telefonos check
    const currentTelefonos = telefonos.filter(t => t.telefono.trim() !== "");
    const originalTelefonos = expediente.cliente?.telefonos || [];
    if (currentTelefonos.length !== originalTelefonos.length) return true;
    for (let i = 0; i < currentTelefonos.length; i++) {
      if (currentTelefonos[i].telefono !== originalTelefonos[i].telefono) return true;
      const currTipo = currentTelefonos[i].tipo || "Principal";
      const origTipo = originalTelefonos[i].tipo_telefono || "Principal";
      if (currTipo !== origTipo) return true;
    }

    if (marcaSeleccionada !== (expediente.modelo?.marca_id || "")) return true;
    if (modeloSeleccionado !== (expediente.id_modelo || "")) return true;
    if (tipoVentaSeleccionado !== (expediente.id_tipo_de_venta || "")) return true;
    if (estadoVehiculoSeleccionado !== (expediente.id_estado_vehiculo || "")) return true;
    if (fechaExpediente !== (expediente.fecha_expediente || "")) return true;
    if (fechaAfectacion !== (expediente.fecha_afectacion || "")) return true;
    if (fechaRci !== (expediente.fecha_rci || "")) return true;
    if (fechaMatriculacion !== (expediente.fecha_matriculacion || "")) return true;
    if (fechaFacturacion !== (expediente.fecha_facturacion || "")) return true;
    if (fechaEntrega !== (expediente.fecha_entrega || "")) return true;
    if (cobradoOtraFecha !== (expediente.cobrado_otra_fecha || false)) return true;
    if (fechaCobrado !== (expediente.fecha_cobrado || "")) return true;
    if (matricula !== (expediente.matricula || "")) return true;
    if (vin !== (expediente.vin || "")) return true;

    const originalValorObjetivo = expediente.valor_objetivo !== null && expediente.valor_objetivo !== undefined
      ? Number(expediente.valor_objetivo)
      : 1;
    if (valorObjetivo !== originalValorObjetivo) return true;

    const originalMinCochesMultiplicador = expediente.min_coches_multiplicador !== null && expediente.min_coches_multiplicador !== undefined
      ? Number(expediente.min_coches_multiplicador)
      : 0;
    if (minCochesMultiplicador !== originalMinCochesMultiplicador) return true;

    return false;
  };

  const isSameMonthPedidoMatricula = () => {
    const targetMatDate = cobradoOtraFecha && fechaCobrado ? fechaCobrado : fechaMatriculacion;
    if (!fechaExpediente || !targetMatDate) return false;
    const expParts = fechaExpediente.split("-");
    const matParts = targetMatDate.split("-");
    return expParts[0] === matParts[0] && expParts[1] === matParts[1];
  };

  const handleNavigate = (url: string) => {
    if (checkIsDirty()) {
      setPendingNavigationUrl(url);
      setShowLeaveModal(true);
    } else {
      if (url === "BACK") {
        router.back();
      } else {
        router.push(url);
      }
    }
  };

  const handleSilentSubmit = async (): Promise<boolean> => {
    setSaving(true);
    setError(null);
    try {
      if (clienteAsignado && isClienteModificado()) {
        const clientBody = {
          id: clienteAsignado.id,
          dni,
          nombre,
          fecha_de_nacimiento: fechaNacimiento || null,
          tienda_id: tiendaId ? Number(tiendaId) : null,
          emails: emails.filter(e => e.email.trim() !== "").map(e => ({ email: e.email, tipo: e.tipo })),
          telefonos: telefonos.filter(t => t.telefono.trim() !== "").map(t => ({ telefono: t.telefono, tipo: t.tipo }))
        };
        const clientRes = await fetch("/api/clientes", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(clientBody)
        });
        if (!clientRes.ok) {
          const errorData = await clientRes.json();
          throw new Error(errorData.message || "Error al actualizar los datos del cliente primero.");
        }
        setClienteAsignado({
          ...clienteAsignado,
          dni,
          nombre,
          fecha_de_nacimiento: fechaNacimiento || null,
          tienda_id: tiendaId ? Number(tiendaId) : null,
          emails: emails.filter(e => e.email.trim() !== "").map(e => ({ email: e.email, tipo_email: e.tipo })),
          telefonos: telefonos.filter(t => t.telefono.trim() !== "").map(t => ({ telefono: t.telefono, tipo_telefono: t.tipo }))
        });
      }

      const cocheVal = comisionCocheReal.trim() === "" ? null : parseFloat(comisionCocheReal);
      const finanVal = comisionFinanciacionReal.trim() === "" ? null : parseFloat(comisionFinanciacionReal);
      const allMainConceptsCobrado = comisionCocheCobrada && 
                                     comisionUsadoCobrada && 
                                     comisionFinanciacionCobrada && 
                                     comisionPreferenceCobrada && 
                                     comisionBonusCobrada;
      const allExtraCobrado = conceptosAdicionales.every((c: any) => c.cobrado);
      const finalCobrado = allMainConceptsCobrado && allExtraCobrado;

      const response = await fetch("/api/expedientes", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id_expediente: expediente.id_expediente,
          id_cliente: clienteAsignado ? clienteAsignado.id : null,
          expediente: {
            id_usuario: vendedorSeleccionado ? Number(vendedorSeleccionado) : null,
            id_modelo: modeloSeleccionado ? Number(modeloSeleccionado) : null,
            id_tipo_de_venta: tipoVentaSeleccionado ? Number(tipoVentaSeleccionado) : null,
            id_estado_vehiculo: estadoVehiculoSeleccionado ? Number(estadoVehiculoSeleccionado) : null,
            id_tienda: tiendaId ? Number(tiendaId) : null,
            fecha_expediente: fechaExpediente || null,
            fecha_afectacion: fechaAfectacion || null,
            fecha_rci: fechaRci || null,
            fecha_matriculacion: fechaMatriculacion || null,
            fecha_facturacion: fechaFacturacion || null,
            fecha_entrega: fechaEntrega || null,
            matricula: matricula || null,
            vin: vin || null,
            valor_objetivo: valorObjetivo,
            min_coches_multiplicador: minCochesMultiplicador,
            cobrado_otra_fecha: cobradoOtraFecha,
            fecha_cobrado: cobradoOtraFecha ? (fechaCobrado || null) : null,
            comision_coche_real: cocheVal,
            comision_financiacion_real: finanVal,
            conceptos_adicionales: JSON.stringify(conceptosAdicionales),
            comision_coche_cobrada: comisionCocheCobrada,
            comision_usado_cobrada: comisionUsadoCobrada,
            comision_financiacion_cobrada: comisionFinanciacionCobrada,
            comision_preference_cobrada: comisionPreferenceCobrada,
            comision_bonus_cobrada: comisionBonusCobrada,
            comision_cobrada: finalCobrado
          }
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Error al actualizar el expediente.");
      }

      setSuccess(true);
      return true;
    } catch (err: any) {
      setError(err.message || "Ocurrió un error inesperado.");
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleSaveAndLeave = async () => {
    const saved = await handleSilentSubmit();
    if (saved) {
      setShowLeaveModal(false);
      // Wait for a short duration to let the user see the success screen
      setTimeout(() => {
        if (pendingNavigationUrl === "BACK") {
          router.back();
        } else {
          router.push(pendingNavigationUrl || "/dashboard/expedientes");
        }
      }, 1500);
    }
  };

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (checkIsDirty()) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);

    const handleAnchorClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const anchor = target.closest("a");
      if (anchor && anchor.href && anchor.host === window.location.host) {
        if (checkIsDirty()) {
          e.preventDefault();
          e.stopPropagation();
          const path = anchor.pathname + anchor.search;
          setPendingNavigationUrl(path);
          setShowLeaveModal(true);
        }
      }
    };
    document.addEventListener("click", handleAnchorClick, true);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      document.removeEventListener("click", handleAnchorClick, true);
    };
  }, [dni, nombre, fechaNacimiento, tiendaId, emails, telefonos, marcaSeleccionada, modeloSeleccionado, tipoVentaSeleccionado, estadoVehiculoSeleccionado, matricula, vin, fechaExpediente, fechaAfectacion, fechaRci, fechaMatriculacion, fechaEntrega, valorObjetivo, minCochesMultiplicador, success, cobradoOtraFecha, fechaCobrado, vendedorSeleccionado]);

  useEffect(() => {
    if (!modeloSeleccionado) {
      setComisionBreakdown(null);
      return;
    }

    const fetchSimulation = async () => {
      setCalculandoComision(true);
      try {
        const response = await fetch("/api/expedientes/simular-comision", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id_expediente: expediente.id_expediente,
            id_usuario: vendedorSeleccionado ? Number(vendedorSeleccionado) : null,
            id_modelo: modeloSeleccionado ? Number(modeloSeleccionado) : null,
            id_tipo_de_venta: tipoVentaSeleccionado ? Number(tipoVentaSeleccionado) : null,
            id_estado_vehiculo: estadoVehiculoSeleccionado ? Number(estadoVehiculoSeleccionado) : null,
            fecha_expediente: fechaExpediente || null,
            fecha_afectacion: fechaAfectacion || null,
            fecha_rci: fechaRci || null,
            fecha_matriculacion: fechaMatriculacion || null,
            fecha_facturacion: fechaFacturacion || null,
            fecha_entrega: fechaEntrega || null,
            matricula: matricula || null,
            vin: vin || null,
            valor_objetivo: valorObjetivo,
            min_coches_multiplicador: minCochesMultiplicador,
            id_cliente: clienteAsignado ? clienteAsignado.id : null,
            cobrado_otra_fecha: cobradoOtraFecha,
            fecha_cobrado: cobradoOtraFecha ? (fechaCobrado || null) : null,
          })
        });

        if (response.ok) {
          const resData = await response.json();
          if (resData.success) {
            setComisionBreakdown(resData.data);
          } else {
            setComisionBreakdown({ error: resData.message });
          }
        }
      } catch (err) {
        console.error("Error al calcular simulación de comisión:", err);
      } finally {
        setCalculandoComision(false);
      }
    };

    const timer = setTimeout(fetchSimulation, 400);
    return () => clearTimeout(timer);
  }, [
    modeloSeleccionado,
    tipoVentaSeleccionado,
    estadoVehiculoSeleccionado,
    fechaExpediente,
    fechaAfectacion,
    fechaRci,
    fechaMatriculacion,
    fechaEntrega,
    valorObjetivo,
    minCochesMultiplicador,
    clienteAsignado,
    matricula,
    vin,
    vendedorSeleccionado
  ]);

  const isVNSelected = () => {
    if (estadoVehiculoSeleccionado) {
      const activeEstado = estadosVehiculo.find(e => e.id === Number(estadoVehiculoSeleccionado));
      const name = activeEstado?.nombre?.toLowerCase() || "";
      return name === "nuevo" || name === "demo";
    }
    const name = expediente.estadoVehiculo?.nombre_estado_vehiculo?.toLowerCase() || "";
    return name === "nuevo" || name === "demo";
  };

  const getConceptValue = (conceptType: string) => {
    if (!comisionBreakdown) return 0;
    
    // Si hay un override manual de coche, VN Base o Usado se reemplaza por el override
    const cocheOverride = comisionCocheReal.trim() !== "" ? parseFloat(comisionCocheReal) : null;
    const finanOverride = comisionFinanciacionReal.trim() !== "" ? parseFloat(comisionFinanciacionReal) : null;

    if (conceptType === "vn_base") {
      if (cocheOverride !== null && isVNSelected()) return cocheOverride;
      return comisionBreakdown.comisionBaseVN || 0;
    }
    if (conceptType === "usado") {
      if (cocheOverride !== null && !isVNSelected()) return cocheOverride;
      return comisionBreakdown.comisionUsado || 0;
    }
    if (conceptType === "financiacion") {
      if (finanOverride !== null) return finanOverride;
      return comisionBreakdown.comisionFinanciacion || 0;
    }
    if (conceptType === "preference") {
      return comisionBreakdown.comisionPreference || 0;
    }
    if (conceptType === "bonus") {
      return comisionBreakdown.bonusAcumulado || 0;
    }
    return 0;
  };

  const handleRestoreVerification = () => {
    setComisionCocheCobrada(baselineExpediente.comision_coche_cobrada || false);
    setComisionUsadoCobrada(baselineExpediente.comision_usado_cobrada || false);
    setComisionFinanciacionCobrada(baselineExpediente.comision_financiacion_cobrada || false);
    setComisionPreferenceCobrada(baselineExpediente.comision_preference_cobrada || false);
    setComisionBonusCobrada(baselineExpediente.comision_bonus_cobrada || false);
    setComisionCocheReal(baselineExpediente.comision_coche_real !== null && baselineExpediente.comision_coche_real !== undefined ? String(baselineExpediente.comision_coche_real) : "");
    setComisionFinanciacionReal(baselineExpediente.comision_financiacion_real !== null && baselineExpediente.comision_financiacion_real !== undefined ? String(baselineExpediente.comision_financiacion_real) : "");
    if (baselineExpediente.conceptos_adicionales) {
      try {
        setConceptosAdicionales(JSON.parse(baselineExpediente.conceptos_adicionales));
      } catch (e) {
        setConceptosAdicionales([]);
      }
    } else {
      setConceptosAdicionales([]);
    }
  };

  const handleSaveVerificationOnly = async () => {
    setSaving(true);
    setError(null);
    try {
      const cocheVal = comisionCocheReal.trim() === "" ? null : parseFloat(comisionCocheReal);
      const finanVal = comisionFinanciacionReal.trim() === "" ? null : parseFloat(comisionFinanciacionReal);
      const allMainConceptsCobrado = comisionCocheCobrada && 
                                     comisionUsadoCobrada && 
                                     comisionFinanciacionCobrada && 
                                     comisionPreferenceCobrada && 
                                     comisionBonusCobrada;
      const allExtraCobrado = conceptosAdicionales.every((c: any) => c.cobrado);
      const finalCobrado = allMainConceptsCobrado && allExtraCobrado;

      const response = await fetch("/api/expedientes", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id_expediente: expediente.id_expediente,
          id_cliente: clienteAsignado ? clienteAsignado.id : null,
          expediente: {
            id_modelo: modeloSeleccionado ? Number(modeloSeleccionado) : null,
            id_tipo_de_venta: tipoVentaSeleccionado ? Number(tipoVentaSeleccionado) : null,
            id_estado_vehiculo: estadoVehiculoSeleccionado ? Number(estadoVehiculoSeleccionado) : null,
            id_tienda: tiendaId ? Number(tiendaId) : null,
            fecha_expediente: fechaExpediente || null,
            fecha_afectacion: fechaAfectacion || null,
            fecha_rci: fechaRci || null,
            fecha_matriculacion: fechaMatriculacion || null,
            fecha_facturacion: fechaFacturacion || null,
            fecha_entrega: fechaEntrega || null,
            matricula: matricula || null,
            vin: vin || null,
            valor_objetivo: valorObjetivo,
            min_coches_multiplicador: minCochesMultiplicador,
            cobrado_otra_fecha: cobradoOtraFecha,
            fecha_cobrado: cobradoOtraFecha ? (fechaCobrado || null) : null,
            comision_coche_real: cocheVal,
            comision_financiacion_real: finanVal,
            conceptos_adicionales: JSON.stringify(conceptosAdicionales),
            comision_coche_cobrada: comisionCocheCobrada,
            comision_usado_cobrada: comisionUsadoCobrada,
            comision_financiacion_cobrada: comisionFinanciacionCobrada,
            comision_preference_cobrada: comisionPreferenceCobrada,
            comision_bonus_cobrada: comisionBonusCobrada,
            comision_cobrada: finalCobrado
          }
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Error al actualizar la verificación.");
      }

      setBaselineExpediente({
        ...baselineExpediente,
        comision_coche_cobrada: comisionCocheCobrada,
        comision_usado_cobrada: comisionUsadoCobrada,
        comision_financiacion_cobrada: comisionFinanciacionCobrada,
        comision_preference_cobrada: comisionPreferenceCobrada,
        comision_bonus_cobrada: comisionBonusCobrada,
        comision_coche_real: cocheVal,
        comision_financiacion_real: finanVal,
        conceptos_adicionales: JSON.stringify(conceptosAdicionales),
        comision_cobrada: finalCobrado
      });

      setClientNotification("Verificación e importes de comisión guardados correctamente.");
      setTimeout(() => setClientNotification(null), 3000);
      return true;
    } catch (err: any) {
      setError(err.message || "Ocurrió un error inesperado al guardar la verificación.");
      setTimeout(() => setError(null), 4000);
      return false;
    } finally {
      setSaving(false);
    }
  };

  // Envío del Formulario
  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (clienteAsignado && isClienteModificado()) {
        const clientBody = {
          id: clienteAsignado.id,
          dni,
          nombre,
          fecha_de_nacimiento: fechaNacimiento || null,
          tienda_id: tiendaId ? Number(tiendaId) : null,
          emails: emails.filter(e => e.email.trim() !== "").map(e => ({ email: e.email, tipo: e.tipo })),
          telefonos: telefonos.filter(t => t.telefono.trim() !== "").map(t => ({ telefono: t.telefono, tipo: t.tipo }))
        };
        const clientRes = await fetch("/api/clientes", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(clientBody)
        });
        if (!clientRes.ok) {
          const errorData = await clientRes.json();
          throw new Error(errorData.message || "Error al actualizar los datos del cliente primero.");
        }
        setClienteAsignado({
          ...clienteAsignado,
          dni,
          nombre,
          fecha_de_nacimiento: fechaNacimiento || null,
          tienda_id: tiendaId ? Number(tiendaId) : null,
          emails: emails.filter(e => e.email.trim() !== "").map(e => ({ email: e.email, tipo_email: e.tipo })),
          telefonos: telefonos.filter(t => t.telefono.trim() !== "").map(t => ({ telefono: t.telefono, tipo_telefono: t.tipo }))
        });
      }

      const response = await fetch("/api/expedientes", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id_expediente: expediente.id_expediente,
          id_cliente: clienteAsignado ? clienteAsignado.id : null,
          expediente: {
            id_modelo: modeloSeleccionado ? Number(modeloSeleccionado) : null,
            id_tipo_de_venta: tipoVentaSeleccionado ? Number(tipoVentaSeleccionado) : null,
            id_estado_vehiculo: estadoVehiculoSeleccionado ? Number(estadoVehiculoSeleccionado) : null,
            id_tienda: tiendaId ? Number(tiendaId) : null,
            fecha_expediente: fechaExpediente || null,
            fecha_afectacion: fechaAfectacion || null,
            fecha_rci: fechaRci || null,
            fecha_matriculacion: fechaMatriculacion || null,
            fecha_facturacion: fechaFacturacion || null,
            fecha_entrega: fechaEntrega || null,
            matricula: matricula || null,
            vin: vin || null,
            valor_objetivo: valorObjetivo,
            min_coches_multiplicador: minCochesMultiplicador,
            cobrado_otra_fecha: cobradoOtraFecha,
            fecha_cobrado: cobradoOtraFecha ? (fechaCobrado || null) : null,
          }
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Error al actualizar el expediente.");
      }

      setSuccess(true);
      setTimeout(() => {
        setSuccess(false);
      }, 3000);
    } catch (err: any) {
      setError(err.message || "Ocurrió un error inesperado.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      {success && (
        <div style={{
          position: "fixed",
          top: "24px",
          right: "24px",
          background: "rgba(16, 185, 129, 0.15)",
          backdropFilter: "blur(12px)",
          border: "1px solid rgba(16, 185, 129, 0.3)",
          color: "var(--success)",
          padding: "16px 24px",
          borderRadius: "var(--radius-md)",
          boxShadow: "0 8px 32px rgba(0, 0, 0, 0.3)",
          zIndex: 9999,
          display: "flex",
          alignItems: "center",
          gap: "12px"
        }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          <span style={{ fontWeight: 600 }}>¡Expediente guardado correctamente!</span>
        </div>
      )}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => handleNavigate("/dashboard/expedientes")}
          style={{ display: "flex", alignItems: "center", gap: "8px", padding: "8px 16px" }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="19" y1="12" x2="5" y2="12"></line>
            <polyline points="12 19 5 12 12 5"></polyline>
          </svg>
          Volver a Expedientes
        </button>

        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          {/* Botones de navegación (Anterior / Siguiente) */}
          <div style={{ display: "flex", gap: "6px" }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => prevId !== null && handleNavigate(`/dashboard/expedientes/editar/${prevId}`)}
              disabled={prevId === null || loading}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: "36px",
                height: "36px",
                padding: 0,
                borderRadius: "var(--radius-sm)",
              }}
              title="Expediente anterior (encima)"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => nextId !== null && handleNavigate(`/dashboard/expedientes/editar/${nextId}`)}
              disabled={nextId === null || loading}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: "36px",
                height: "36px",
                padding: 0,
                borderRadius: "var(--radius-sm)",
              }}
              title="Expediente siguiente (debajo)"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          </div>

          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => handleNavigate("BACK")}
            disabled={loading}
            style={{ height: "36px", display: "flex", alignItems: "center" }}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => handleSubmit()}
            disabled={loading}
            style={{ display: "flex", alignItems: "center", gap: "8px" }}
          >
            {loading ? "Guardando..." : "Guardar Cambios"}
            {!loading && (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                <polyline points="17 21 17 13 7 13 7 21" />
                <polyline points="7 3 7 8 15 8" />
              </svg>
            )}
          </button>
        </div>
      </div>

      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "32px" }}>
        {clientNotification && (
          <div className="glass-panel" style={{
            padding: "16px 20px",
            backgroundColor: "rgba(16, 185, 129, 0.1)",
            borderLeft: "4px solid var(--success)",
            color: "var(--success)",
            fontWeight: 600,
            fontSize: "0.95rem",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            animation: "fadeIn 0.3s ease-in-out"
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <span>✅</span>
              <span>{clientNotification}</span>
            </div>
            <button 
              type="button" 
              onClick={() => setClientNotification(null)}
              style={{ background: "none", border: "none", color: "var(--success)", cursor: "pointer", fontSize: "1rem", fontWeight: "bold" }}
            >
              ✕
            </button>
          </div>
        )}
        {error && (
          <div className="glass-panel" style={{ padding: "16px", color: "var(--danger)", borderLeft: "4px solid var(--danger)", background: "rgba(239, 68, 68, 0.05)" }}>
            <strong style={{ display: "block", marginBottom: "4px" }}>Error:</strong>
            {error}
          </div>
        )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "32px" }}>
        {/* SECCIÓN 1: DATOS DEL CLIENTE */}
        <div className="glass-panel" style={{ padding: "32px" }}>
          <h2 style={{ fontSize: "1.25rem", marginBottom: "24px", color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "10px" }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
            Datos del Cliente
          </h2>

          {clienteAsignado ? (
            <div className="glass-panel" style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "16px 20px",
              marginBottom: "24px",
              background: "rgba(6, 182, 212, 0.05)",
              borderLeft: "4px solid var(--secondary)"
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <span style={{ fontSize: "1.5rem" }}>👤</span>
                <div>
                  <div style={{ fontWeight: 700, color: "var(--text-primary)" }}>Cliente Asociado: {clienteAsignado.nombre}</div>
                  <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>DNI / NIE: {clienteAsignado.dni}</div>
                </div>
              </div>
              <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
                {isClienteModificado() && (
                  <button
                    type="button"
                    className="btn"
                    onClick={handleGuardarCambiosCliente}
                    disabled={loading}
                    style={{
                      padding: "8px 16px",
                      fontSize: "0.85rem",
                      backgroundColor: "var(--success)",
                      color: "white",
                      border: "none",
                      borderRadius: "var(--radius-sm)",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: "6px"
                    }}
                  >
                    💾 Guardar Cambios de Cliente
                  </button>
                )}
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={handleDesasignarCliente}
                  style={{ padding: "6px 12px", fontSize: "0.8rem", color: "var(--danger)" }}
                >
                  ❌ Desasignar Cliente
                </button>
              </div>
            </div>
          ) : (
            <div className="form-group" style={{ position: "relative", marginBottom: "24px" }}>
              <label className="form-label">🔍 Asignar Otro Cliente Existente (DNI o Nombre)</label>
              <input
                type="text"
                className="form-input"
                placeholder="Escribe DNI o Nombre... (Ej. Juan)"
                value={busquedaCliente}
                onChange={e => handleBuscarCliente(e.target.value)}
              />
              {buscandoCliente && (
                <div style={{ position: "absolute", right: "16px", bottom: "12px", fontSize: "0.8rem", color: "var(--text-muted)" }}>
                  Buscando...
                </div>
              )}
              {resultadosClientes.length > 0 && (
                <div className="glass-panel" style={{
                  position: "absolute",
                  top: "100%",
                  left: 0,
                  right: 0,
                  background: "var(--bg-surface)",
                  border: "1px solid var(--border-light)",
                  borderRadius: "var(--radius-sm)",
                  boxShadow: "var(--shadow-lg)",
                  zIndex: 99,
                  maxHeight: "220px",
                  overflowY: "auto",
                  marginTop: "4px"
                }}>
                  {resultadosClientes.map((c) => (
                    <div
                      key={c.id}
                      onClick={() => handleSeleccionarCliente(c)}
                      className="glass-panel-interactive"
                      style={{
                        padding: "12px 16px",
                        borderBottom: "1px solid var(--border-light)",
                        borderRadius: 0,
                        fontSize: "0.9rem",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center"
                      }}
                    >
                      <span style={{ fontWeight: 600 }}>{c.nombre}</span>
                      <span style={{ fontSize: "0.8rem", color: "var(--text-muted)", fontFamily: "monospace" }}>{c.dni}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "20px" }}>
            <div className="form-group">
              <label className="form-label">DNI / NIE</label>
              <input type="text" className="form-input" value={dni} onChange={e => setDni(e.target.value)} placeholder="Ej. 12345678Z" />
            </div>
            <div className="form-group">
              <label className="form-label">Nombre Completo *</label>
              <input type="text" className="form-input" value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Ej. Juan Pérez Gómez" />
            </div>
            <div className="form-group">
              <label className="form-label">Fecha de Nacimiento</label>
              <input type="date" className="form-input" value={fechaNacimiento} onChange={e => setFechaNacimiento(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Tienda</label>
              <select
                className="form-select"
                value={tiendaId}
                onChange={e => setTiendaId(e.target.value)}
              >
                <option value="">Selecciona Tienda</option>
                {tiendas.map(t => (
                  <option key={t.id} value={t.id}>
                    {t.nombre} {t.ciudad ? `(${t.ciudad})` : ""}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "32px", marginTop: "16px", flexWrap: "wrap" }}>
            {/* SUBFORMULARIO EMAILS CLIENTE */}
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                <span className="form-label" style={{ marginBottom: 0 }}>Correos Electrónicos</span>
                <button type="button" className="btn btn-secondary" onClick={addEmail} style={{ padding: "6px 12px", fontSize: "0.8rem", borderRadius: "var(--radius-sm)" }}>
                  + Añadir
                </button>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {emails.map((item, idx) => (
                  <div key={idx} style={{ display: "flex", gap: "10px" }}>
                    <input type="email" className="form-input" placeholder="correo@ejemplo.com" value={item.email} onChange={e => handleEmailChange(idx, e.target.value)} style={{ flex: 2 }} />
                    <select className="form-select" value={item.tipo} onChange={e => handleEmailTipoChange(idx, e.target.value)} style={{ flex: 1 }}>
                      <option value="Principal">Principal</option>
                      <option value="Trabajo">Trabajo</option>
                      <option value="Personal">Personal</option>
                      <option value="Otro">Otro</option>
                    </select>
                    {emails.length > 1 && (
                      <button type="button" className="btn btn-secondary" onClick={() => removeEmail(idx)} style={{ padding: "10px", color: "var(--danger)", border: "1px solid var(--border-light)" }}>
                        🗑️
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* SUBFORMULARIO TELÉFONOS CLIENTE */}
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                <span className="form-label" style={{ marginBottom: 0 }}>Teléfonos de Contacto</span>
                <button type="button" className="btn btn-secondary" onClick={addTelefono} style={{ padding: "6px 12px", fontSize: "0.8rem", borderRadius: "var(--radius-sm)" }}>
                  + Añadir
                </button>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {telefonos.map((item, idx) => (
                  <div key={idx} style={{ display: "flex", gap: "10px" }}>
                    <input type="text" className="form-input" placeholder="Ej. 600123456" value={item.telefono} onChange={e => handleTelefonoChange(idx, e.target.value)} style={{ flex: 2 }} />
                    <select className="form-select" value={item.tipo} onChange={e => handleTelefonoTipoChange(idx, e.target.value)} style={{ flex: 1 }}>
                      <option value="Principal">Principal</option>
                      <option value="Móvil">Móvil</option>
                      <option value="Fijo">Fijo</option>
                      <option value="Trabajo">Trabajo</option>
                    </select>
                    {telefonos.length > 1 && (
                      <button type="button" className="btn btn-secondary" onClick={() => removeTelefono(idx)} style={{ padding: "10px", color: "var(--danger)", border: "1px solid var(--border-light)" }}>
                        🗑️
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* SECCIÓN 2: DETALLES DEL VEHÍCULO Y EXPEDIENTE */}
        <div className="glass-panel" style={{ padding: "32px" }}>
          <h2 style={{ fontSize: "1.25rem", marginBottom: "24px", color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "10px" }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--secondary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
              <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
            </svg>
            Detalles de la Venta y Vehículo
          </h2>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "20px" }}>
            <div className="form-group">
              <label className="form-label">Marca</label>
              <select className="form-select" value={marcaSeleccionada} onChange={e => { setMarcaSeleccionada(e.target.value ? Number(e.target.value) : ""); setModeloSeleccionado(""); }}>
                <option value="">Selecciona Marca</option>
                {marcas.map(m => (
                  <option key={m.id} value={m.id}>{m.nombre}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Modelo</label>
              <select className="form-select" value={modeloSeleccionado} onChange={e => setModeloSeleccionado(e.target.value ? Number(e.target.value) : "")} disabled={!marcaSeleccionada}>
                <option value="">Selecciona Modelo</option>
                {modelosDisponibles.map(m => (
                  <option key={m.id} value={m.id}>{m.nombre}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Tipo de Venta</label>
              <select className="form-select" value={tipoVentaSeleccionado} onChange={e => setTipoVentaSeleccionado(e.target.value ? Number(e.target.value) : "")}>
                <option value="">Selecciona Tipo</option>
                {tiposVenta.map(t => (
                  <option key={t.id} value={t.id}>{t.nombre}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Estado de Vehículo</label>
              <select className="form-select" value={estadoVehiculoSeleccionado} onChange={e => setEstadoVehiculoSeleccionado(e.target.value ? Number(e.target.value) : "")}>
                <option value="">Selecciona Estado</option>
                {estadosVehiculo.map(ev => (
                  <option key={ev.id} value={ev.id}>{ev.nombre}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Vendedor Asignado</label>
              <select className="form-select" value={vendedorSeleccionado} onChange={e => setVendedorSeleccionado(e.target.value)}>
                <option value="">Selecciona Vendedor</option>
                {usuarios.map(u => (
                  <option key={u.id} value={u.id}>{u.nombre}</option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "20px", marginTop: "16px" }}>
            <div className="form-group">
              <label className="form-label">Matrícula</label>
              <input type="text" className="form-input" value={matricula} onChange={e => setMatricula(e.target.value)} placeholder="Ej. 1234BBB" />
            </div>
            <div className="form-group">
              <label className="form-label">Número de Bastidor (VIN)</label>
              <input type="text" className="form-input" value={vin} onChange={e => setVin(e.target.value)} placeholder="Ej. WBA..." />
            </div>
            <div className="form-group">
              <label className="form-label">Fecha Expediente</label>
              <input type="date" className="form-input" value={fechaExpediente} onChange={e => setFechaExpediente(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Fecha Afectación</label>
              <input type="date" className="form-input" value={fechaAfectacion} onChange={e => setFechaAfectacion(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Fecha RCI (Financiación)</label>
              <input type="date" className="form-input" value={fechaRci} onChange={e => setFechaRci(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Fecha Matriculación</label>
              <input type="date" className="form-input" value={fechaMatriculacion} onChange={e => setFechaMatriculacion(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Fecha Facturación (VO)</label>
              <input type="date" className="form-input" value={fechaFacturacion} onChange={e => setFechaFacturacion(e.target.value)} />
            </div>

            <div style={{ gridColumn: "1 / -1", display: "flex", flexDirection: "column", gap: "12px", background: "rgba(255, 255, 255, 0.02)", padding: "16px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-light)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <input
                  type="checkbox"
                  id="cobradoOtraFecha"
                  checked={cobradoOtraFecha}
                  onChange={e => {
                    setCobradoOtraFecha(e.target.checked);
                    if (!e.target.checked) setFechaCobrado("");
                  }}
                  style={{ width: "16px", height: "16px", cursor: "pointer" }}
                />
                <label htmlFor="cobradoOtraFecha" style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--text-primary)", cursor: "pointer", userSelect: "none" }}>
                  Expediente cobrado en otra fecha
                </label>
              </div>

              {cobradoOtraFecha && (
                <div className="form-group" style={{ marginBottom: 0, marginTop: "8px" }}>
                  <label className="form-label" style={{ fontSize: "0.78rem" }}>Fecha de Cobrado</label>
                  <input
                    type="date"
                    className="form-input"
                    value={fechaCobrado}
                    onChange={e => setFechaCobrado(e.target.value)}
                    required={cobradoOtraFecha}
                  />
                </div>
              )}
            </div>
            <div className="form-group">
              <label className="form-label">Fecha Entrega</label>
              <input type="date" className="form-input" value={fechaEntrega} onChange={e => setFechaEntrega(e.target.value)} />
            </div>

            {isSameMonthPedidoMatricula() && (
              <div className="glass-panel" style={{
                gridColumn: "1 / -1",
                padding: "16px 20px",
                background: "rgba(16, 185, 129, 0.08)",
                borderLeft: "4px solid var(--success)",
                color: "var(--success)",
                fontSize: "0.9rem",
                fontWeight: 600,
                display: "flex",
                alignItems: "center",
                gap: "10px",
                marginTop: "8px"
              }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                  <polyline points="22 4 12 14.01 9 11.01" />
                </svg>
                <span>✨ Pedido Realizado y Matriculado en el mismo mes</span>
              </div>
            )}
          </div>
        </div>

        {/* SECCIÓN NUEVA: COMISIONAMIENTO */}
        <div className="glass-panel" style={{ padding: "32px", marginTop: "24px" }}>
          <h2 style={{ fontSize: "1.25rem", marginBottom: "24px", color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "10px" }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--success)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
            </svg>
            Comisionamiento del Expediente
          </h2>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "20px" }}>
            <div className="form-group">
              <label className="form-label">VAL. Obj. / Multiplicador</label>
              <select
                className="form-select"
                value={valorObjetivo}
                onChange={e => setValorObjetivo(Number(e.target.value))}
              >
                <option value={0}>0</option>
                <option value={0.5}>0.5</option>
                <option value={1}>1</option>
                <option value={1.5}>1.5</option>
                <option value={2}>2</option>
                <option value={2.5}>2.5</option>
                <option value={3}>3</option>
                <option value={3.5}>3.5</option>
                <option value={4}>4</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label" title="Número mínimo de ventas con multiplicador > 1 en el mes requeridas para que este vendedor mantenga su multiplicador">
                Cupo Ventas Multiplicadas Req. (Vendedor)
              </label>
              <input
                type="number"
                className="form-input"
                value={minCochesMultiplicador}
                onChange={e => setMinCochesMultiplicador(Number(e.target.value))}
                min={0}
              />
            </div>
          </div>
        </div>

        {/* SECCIÓN NUEVA: CONTROL Y VERIFICACIÓN DE COBROS DE COMISIONES */}
        <div className="glass-panel" style={{ padding: "32px", marginTop: "24px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px", flexWrap: "wrap", gap: "12px" }}>
            <h2 style={{ fontSize: "1.25rem", color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "10px", margin: 0 }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--success)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
              Control y Verificación de Cobros de Comisiones
            </h2>
            <div style={{ display: "flex", gap: "10px" }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleRestoreVerification}
                style={{ padding: "6px 12px", fontSize: "0.85rem", display: "flex", alignItems: "center", gap: "6px" }}
                title="Restaurar valores de cobro a su último estado guardado"
              >
                <span>🔄 Restaurar</span>
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleSaveVerificationOnly}
                disabled={saving}
                style={{ padding: "6px 12px", fontSize: "0.85rem", display: "flex", alignItems: "center", gap: "6px", backgroundColor: "var(--success)", border: "none", color: "#fff" }}
              >
                <span>💾 {saving ? "Guardando..." : "Guardar Verificación"}</span>
              </button>
            </div>
          </div>

          {/* Overrides de Comisión Coche y Financiación */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "24px" }}>
            <div className="form-group">
              <label className="form-label">Comisión Coche Manual (€)</label>
              <input 
                type="number" 
                className="form-input" 
                placeholder="Dejar en blanco para autocalcular"
                value={comisionCocheReal} 
                onChange={e => setComisionCocheReal(e.target.value)} 
              />
            </div>
            <div className="form-group">
              <label className="form-label">Comisión Financiación Manual (€)</label>
              <input 
                type="number" 
                className="form-input" 
                placeholder="Dejar en blanco para autocalcular"
                value={comisionFinanciacionReal} 
                onChange={e => setComisionFinanciacionReal(e.target.value)} 
              />
            </div>
          </div>

          {/* Checkboxes de cobro */}
          <div style={{ borderTop: "1px solid var(--border-light)", paddingTop: "16px", marginBottom: "24px" }}>
            <label className="form-label" style={{ fontWeight: 700 }}>✅ Estado de Cobro por Concepto</label>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: "12px", marginTop: "12px" }}>
              <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.85rem", cursor: "pointer", color: "var(--text-secondary)" }}>
                <input
                  type="checkbox"
                  checked={comisionCocheCobrada}
                  onChange={(e) => setComisionCocheCobrada(e.target.checked)}
                  style={{ cursor: "pointer" }}
                />
                <span>VN Base Cobrado: <strong>{getConceptValue("vn_base").toLocaleString()} €</strong></span>
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.85rem", cursor: "pointer", color: "var(--text-secondary)" }}>
                <input
                  type="checkbox"
                  checked={comisionUsadoCobrada}
                  onChange={(e) => setComisionUsadoCobrada(e.target.checked)}
                  style={{ cursor: "pointer" }}
                />
                <span>Usado Cobrado: <strong>{getConceptValue("usado").toLocaleString()} €</strong></span>
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.85rem", cursor: "pointer", color: "var(--text-secondary)" }}>
                <input
                  type="checkbox"
                  checked={comisionFinanciacionCobrada}
                  onChange={(e) => setComisionFinanciacionCobrada(e.target.checked)}
                  style={{ cursor: "pointer" }}
                />
                <span>Financiación Cobrada: <strong>{getConceptValue("financiacion").toLocaleString()} €</strong></span>
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.85rem", cursor: "pointer", color: "var(--text-secondary)" }}>
                <input
                  type="checkbox"
                  checked={comisionPreferenceCobrada}
                  onChange={(e) => setComisionPreferenceCobrada(e.target.checked)}
                  style={{ cursor: "pointer" }}
                />
                <span>Pref/Box Cobrado: <strong>{getConceptValue("preference").toLocaleString()} €</strong></span>
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.85rem", cursor: "pointer", color: "var(--text-secondary)" }}>
                <input
                  type="checkbox"
                  checked={comisionBonusCobrada}
                  onChange={(e) => setComisionBonusCobrada(e.target.checked)}
                  style={{ cursor: "pointer" }}
                />
                <span>Bonus Cobrado: <strong>{getConceptValue("bonus").toLocaleString()} €</strong></span>
              </label>
            </div>
          </div>

          {/* Conceptos Adicionales */}
          <div style={{ borderTop: "1px solid var(--border-light)", paddingTop: "16px", display: "flex", flexDirection: "column", gap: "12px" }}>
            <h4 style={{ fontSize: "0.95rem", color: "var(--text-primary)", margin: 0, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span>Bonificaciones / Penalizaciones Extra</span>
              <span style={{ fontSize: "0.8rem", color: "var(--success)" }}>
                Total Extra: {conceptosAdicionales.reduce((acc, c) => acc + (c.valor || 0), 0)} €
              </span>
            </h4>

            <div style={{ display: "flex", flexDirection: "column", gap: "8px", maxHeight: "150px", overflowY: "auto" }}>
              {conceptosAdicionales.map(c => (
                <div key={c.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", background: "rgba(255,255,255,0.02)", borderRadius: "4px", border: "1px solid var(--border-light)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", flex: 1 }}>
                    <input
                      type="checkbox"
                      checked={c.cobrado || false}
                      onChange={() => {
                        setConceptosAdicionales(prev => prev.map(item => {
                          if (item.id === c.id) return { ...item, cobrado: !item.cobrado };
                          return item;
                        }));
                      }}
                      style={{ cursor: "pointer" }}
                    />
                    <div>
                      <div style={{ fontSize: "0.85rem", fontWeight: 600, textDecoration: c.cobrado ? "line-through" : "none", color: c.cobrado ? "var(--text-muted)" : "inherit" }}>{c.titulo}</div>
                      {c.descripcion && <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>{c.descripcion}</div>}
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                    <strong style={{ fontSize: "0.85rem", color: c.valor >= 0 ? "var(--success)" : "var(--danger)" }}>
                      {c.valor >= 0 ? "+" : ""}{c.valor} €
                    </strong>
                    <button 
                      type="button" 
                      onClick={() => setConceptosAdicionales(prev => prev.filter(item => item.id !== c.id))} 
                      style={{ background: "transparent", border: "none", color: "var(--danger)", cursor: "pointer", fontSize: "0.85rem" }}
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              ))}
              {conceptosAdicionales.length === 0 && (
                <div style={{ color: "var(--text-muted)", fontSize: "0.8rem", textAlign: "center", padding: "10px" }}>
                  No hay conceptos adicionales configurados.
                </div>
              )}
            </div>

            {/* Añadir Concepto */}
            <div style={{ background: "rgba(255,255,255,0.01)", padding: "12px", borderRadius: "6px", border: "1px dashed var(--border-light)", display: "flex", flexDirection: "column", gap: "10px" }}>
              <div style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--text-secondary)" }}>Añadir Concepto Especial</div>
              <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: "10px" }}>
                <input 
                  type="text" 
                  className="form-input" 
                  style={{ fontSize: "0.8rem" }}
                  placeholder="Título (Ej. Bonus Rappel)" 
                  value={newConceptTitulo}
                  onChange={e => setNewConceptTitulo(e.target.value)}
                />
                <input 
                  type="number" 
                  className="form-input" 
                  style={{ fontSize: "0.8rem" }}
                  placeholder="Importe (Ej. 100 o -50)" 
                  value={newConceptValor}
                  onChange={e => setNewConceptValor(e.target.value)}
                />
              </div>
              <input 
                type="text" 
                className="form-input" 
                style={{ fontSize: "0.8rem" }}
                placeholder="Descripción (Opcional)" 
                value={newConceptDescripcion}
                onChange={e => setNewConceptDescripcion(e.target.value)}
              />
              <button 
                type="button" 
                className="btn btn-secondary" 
                style={{ alignSelf: "flex-end", padding: "6px 12px", fontSize: "0.8rem" }}
                onClick={() => {
                  if (!newConceptTitulo.trim()) return;
                  const val = parseFloat(newConceptValor);
                  if (isNaN(val)) return;
                  const newConcept = {
                    id: Math.random().toString(36).substr(2, 9),
                    titulo: newConceptTitulo.trim(),
                    valor: val,
                    descripcion: newConceptDescripcion.trim(),
                    cobrado: false
                  };
                  setConceptosAdicionales(prev => [...prev, newConcept]);
                  setNewConceptTitulo("");
                  setNewConceptValor("");
                  setNewConceptDescripcion("");
                }}
              >
                + Añadir Concepto
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* SECCIÓN 3: DESGLOSE DE COMISIONAMIENTO (EN TIEMPO REAL) */}
      <div className="glass-panel" style={{ padding: "32px", borderLeft: "4px solid var(--primary)" }}>
        <h2 style={{ fontSize: "1.25rem", marginBottom: "16px", color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "10px" }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="1" x2="12" y2="23"></line>
            <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
          </svg>
          Desglose Estimado de Comisión
        </h2>

        {!modeloSeleccionado ? (
          <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem", margin: 0 }}>
            Selecciona un modelo y fechas válidas para ver el desglose en tiempo real.
          </p>
        ) : calculandoComision ? (
          <div style={{ display: "flex", alignItems: "center", gap: "10px", color: "var(--text-secondary)", fontSize: "0.9rem" }}>
            <div className="spinner-mini" style={{
              width: "16px", height: "16px", border: "2px solid rgba(255,255,255,0.1)",
              borderTopColor: "var(--primary)", borderRadius: "50%", animation: "spin 0.8s linear infinite"
            }}></div>
            <span>Calculando desglose de comisionamiento...</span>
          </div>
        ) : comisionBreakdown?.error ? (
          <div style={{ color: "var(--danger)", fontSize: "0.9rem" }}>
            ⚠️ {comisionBreakdown.error}
          </div>
        ) : comisionBreakdown ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            {/* Cabecera global del cálculo */}
            <div style={{ 
              display: "grid", 
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", 
              gap: "16px",
              padding: "16px",
              borderRadius: "var(--radius-sm)",
              backgroundColor: "rgba(255,255,255,0.02)",
              border: "1px solid var(--border-light)"
            }}>
              <div>
                <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 600 }}>Plan Aplicado</div>
                <div style={{ fontSize: "0.95rem", fontWeight: 700, color: "var(--text-primary)", marginTop: "4px" }}>{comisionBreakdown.planNombre}</div>
              </div>
              <div>
                <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 600 }}>Tramo Alcanzado</div>
                <div style={{ fontSize: "0.95rem", fontWeight: 700, color: "var(--primary)", marginTop: "4px" }}>
                  Tramo {comisionBreakdown.tramoAlcanzado}
                </div>
              </div>
              <div>
                <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 600 }}>Objetivo Computable</div>
                <div style={{ fontSize: "0.95rem", fontWeight: 700, color: "var(--text-primary)", marginTop: "4px" }}>
                  {comisionBreakdown.totalComputablesVendedor} Uds.
                </div>
              </div>
              <div>
                <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 600 }}>Matriculaciones Mes</div>
                <div style={{ fontSize: "0.95rem", fontWeight: 700, color: "var(--text-primary)", marginTop: "4px" }}>
                  {comisionBreakdown.matriculacionesRealesVendedor} de {comisionBreakdown.minMatriculacionesPlan} mín.
                </div>
              </div>
            </div>

            {/* Alerta de no cumplimiento de mínimo */}
            {!comisionBreakdown.cumpleMinimo && (
              <div className="glass-panel" style={{ 
                padding: "12px 16px", 
                backgroundColor: "rgba(239, 68, 68, 0.08)", 
                borderLeft: "4px solid var(--danger)",
                color: "var(--danger)",
                fontSize: "0.85rem"
              }}>
                <strong>⚠️ Penalización de Comisión (0 €):</strong> El vendedor no alcanza el mínimo de {comisionBreakdown.minMatriculacionesPlan} matriculaciones exigidas por el plan para este mes.
              </div>
            )}

            {/* Tabla de conceptos */}
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--border-light)", color: "var(--text-muted)" }}>
                    <th style={{ textAlign: "left", padding: "8px 0", fontWeight: 600 }}>Concepto / Regla de Comisión</th>
                    <th style={{ textAlign: "center", padding: "8px", fontWeight: 600, width: "100px" }}>Cómputo Obj.</th>
                    <th style={{ textAlign: "right", padding: "8px 0", fontWeight: 600, width: "100px" }}>Importe (€)</th>
                  </tr>
                </thead>
                <tbody>
                  {comisionBreakdown.items && comisionBreakdown.items.length > 0 ? (
                    comisionBreakdown.items.map((item: any, idx: number) => (
                      <tr key={idx} style={{ borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
                        <td style={{ padding: "10px 0", color: "var(--text-primary)" }}>{item.concepto}</td>
                        <td style={{ padding: "10px", textAlign: "center", color: item.afecta_objetivo ? "var(--secondary)" : "var(--text-muted)" }}>
                          {item.afecta_objetivo ? `+${item.valor_objetivo}` : "-"}
                        </td>
                        <td style={{ padding: "10px 0", textAlign: "right", fontWeight: item.importe > 0 ? 600 : 400, color: item.importe > 0 ? "var(--success)" : "var(--text-muted)" }}>
                          {item.importe > 0 ? `+${item.importe} €` : "0 €"}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={3} style={{ padding: "16px 0", color: "var(--text-muted)", textAlign: "center" }}>
                        Este expediente no genera cómputo ni comisiones económicas en este estado (comprueba fechas y tipo de vehículo).
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Caja de Total comisionable */}
            <div style={{ 
              display: "flex", 
              justifyContent: "space-between", 
              alignItems: "center",
              padding: "16px 20px", 
              borderRadius: "var(--radius-sm)",
              background: comisionBreakdown.cumpleMinimo ? "rgba(16, 185, 129, 0.08)" : "rgba(239, 68, 68, 0.05)",
              border: comisionBreakdown.cumpleMinimo ? "1px solid rgba(16, 185, 129, 0.2)" : "1px solid rgba(239, 68, 68, 0.15)",
              marginTop: "8px"
            }}>
              <div>
                <span style={{ fontSize: "0.9rem", fontWeight: 600, color: "var(--text-primary)" }}>Total Comisión para este Expediente:</span>
                {!comisionBreakdown.cumpleMinimo && (
                  <div style={{ fontSize: "0.75rem", color: "var(--danger)", marginTop: "2px" }}>
                    (Teórico: {comisionBreakdown.totalTeorico} €)
                  </div>
                )}
              </div>
              <span style={{ 
                fontSize: "1.4rem", 
                fontWeight: 800, 
                color: comisionBreakdown.cumpleMinimo ? "var(--success)" : "var(--danger)" 
              }}>
                {comisionBreakdown.totalGenerado} €
              </span>
            </div>
          </div>
        ) : (
          <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem", margin: 0 }}>
            Sin datos de comisión.
          </p>
        )}
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "16px", marginTop: "8px" }}>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => handleNavigate("/dashboard/expedientes")}
          style={{ display: "flex", alignItems: "center", gap: "8px", padding: "8px 16px" }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="19" y1="12" x2="5" y2="12"></line>
            <polyline points="12 19 5 12 12 5"></polyline>
          </svg>
          Volver a Expedientes
        </button>
        <div style={{ display: "flex", gap: "16px" }}>
          <button type="button" className="btn btn-secondary" onClick={() => handleNavigate("BACK")} disabled={loading}>
            Cancelar
          </button>
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? "Guardando..." : "Guardar Cambios"}
            {!loading && (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                <polyline points="17 21 17 13 7 13 7 21" />
                <polyline points="7 3 7 8 15 8" />
              </svg>
            )}
          </button>
        </div>
      </div>
    </form>

    {showLeaveModal && (
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
        <div className="glass-panel" style={{
          width: "100%",
          maxWidth: "450px",
          padding: "32px",
          display: "flex",
          flexDirection: "column",
          gap: "24px",
          textAlign: "center",
          background: "var(--bg-card)"
        }}>
          <div>
            <h3 style={{ fontSize: "1.25rem", color: "var(--text-primary)", margin: 0 }}>
              Cambios sin guardar
            </h3>
            <p style={{ color: "var(--text-secondary)", fontSize: "0.95rem", lineHeight: "1.6", marginTop: "8px", marginBottom: 0 }}>
              Tienes cambios sin guardar en este expediente. ¿Qué deseas hacer antes de salir?
            </p>
          </div>
          
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleSaveAndLeave}
              disabled={saving}
              style={{ width: "100%", justifyContent: "center" }}
            >
              {saving ? "Guardando..." : "💾 Guardar y Salir"}
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => {
                setShowLeaveModal(false);
                setSuccess(true);
                setTimeout(() => {
                  if (pendingNavigationUrl === "BACK") {
                    router.back();
                  } else {
                    router.push(pendingNavigationUrl || "/dashboard/expedientes");
                  }
                }, 100);
              }}
              disabled={saving}
              style={{ 
                width: "100%", 
                justifyContent: "center", 
                backgroundColor: "rgba(239, 68, 68, 0.1)", 
                color: "var(--danger)",
                border: "1px solid rgba(239, 68, 68, 0.2)"
              }}
            >
              🚪 Salir sin Guardar
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                setShowLeaveModal(false);
                setPendingNavigationUrl(null);
              }}
              disabled={saving}
              style={{ width: "100%", justifyContent: "center" }}
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
