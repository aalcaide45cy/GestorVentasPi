"use client";

import { señalarCampo } from "@/lib/resaltar";
import { useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { BotonesDatosSeccion } from "@/components/datos/DatosSeccion";
import { CajaDatos, GrupoDatos, OpcionDatos } from "@/components/datos/OpcionesDatos";
import Modal, { ModalConfirmar } from "@/components/Modal";
import { useToast } from "@/components/Toast";
import { construirCsvClientes, interpretarCsvClientes } from "@/lib/csv-clientes";
import { descargarTexto } from "@/lib/csv-expedientes";
import { formatDate } from "@/lib/date-utils";
import type { ClienteDto, ExpedienteDto, TiendaDto } from "@/lib/dto";
import { BotonLeerDni, ListaPendientes, ZonaDocumentosVarios, vincularAdjuntos } from "./documentos/BotonLeerDocumento";
import type { AdjuntoDto } from "@/lib/servicios/adjuntos";
import type { ResultadoDni } from "@/lib/servicios/documentos";
import ModalEdicionMasivaClientes, { type CambiosMasivosClientes } from "./clientes/ModalEdicionMasivaClientes";
import NombreConFoto from "./documentos/FotoCliente";
import VisorAdjuntos from "./documentos/VisorAdjuntos";
import { columnasVehiculo } from "./etiquetas";
import { datosVehiculoDeExpediente, mensajeDeError } from "./expedientes/comun";
import TablaDatos, { type ColumnaTabla } from "./TablaDatos";
import ListaContactos, { contactoVacio, emailsDeCliente, telefonosDeCliente, type ContactoEdicion } from "./expedientes/ListaContactos";

export type ClienteItem = ClienteDto & { num_expedientes: number };

interface Props {
  clientesIniciales: ClienteItem[];
  /** Total de clientes en la base de datos (si es mayor que los cargados, se avisa de que la lista está recortada). */
  totalEnBd?: number;
  tiendas: TiendaDto[];
  userRole: string;
  tiendaPredeterminadaId: number | null;
}

type Campo = "nombre" | "dni" | "fecha_de_nacimiento" | "tienda" | "expedientes" | "id";

const celdaFiltro = { padding: "4px 8px", fontSize: "0.75rem", width: "100%" } as const;
const botonBloqueo = (activo: boolean, fondo: string, color: string) =>
  ({
    padding: "10px 16px",
    fontSize: "0.85rem",
    backgroundColor: activo ? fondo : "rgba(255,255,255,0.05)",
    color: activo ? color : "var(--text-primary)",
    border: "1px solid var(--border-light)",
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
  }) as const;

const columnasVentas: ColumnaTabla<ExpedienteDto>[] = [
  { clave: "codigo", etiqueta: "Código", valor: (e) => e.id_expediente, celda: (e) => <b style={{ color: "var(--primary)" }}>#EXP-{String(e.id_expediente).padStart(4, "0")}</b> },
  ...columnasVehiculo<ExpedienteDto>((e) => datosVehiculoDeExpediente(e), { vacio: "N/D", punto: true }),
  { clave: "matricula", etiqueta: "Matrícula", valor: (e) => e.matricula ?? "", celda: (e) => e.matricula || "N/D" },
  { clave: "fecha", etiqueta: "Fecha", valor: (e) => e.fecha_expediente ?? "", celda: (e) => (e.fecha_expediente ? formatDate(e.fecha_expediente) : "N/D") },
  {
    clave: "editar",
    etiqueta: "Editar",
    valor: () => "",
    celda: (e) => (
      <a href={`/dashboard/expedientes/editar/${e.id_expediente}`} className="btn btn-secondary" style={{ padding: "6px 12px", fontSize: "0.8rem", display: "inline-flex", alignItems: "center", gap: "4px" }}>
        ✏️ Editar
      </a>
    ),
  },
];

/** «Base de Clientes»: directorio con filtros por columna, alta/edición, importación y exportación CSV. */
export default function ClientesList({ clientesIniciales, totalEnBd, tiendas, userRole, tiendaPredeterminadaId }: Props) {
  const router = useRouter();
  const { mostrar } = useToast();

  const [clientes, setClientes] = useState<ClienteItem[]>(clientesIniciales);
  // Si el servidor entrega datos nuevos (router.refresh, deshacer o rehacer), se reemplazan los locales
  const [inicialesPrevios, setInicialesPrevios] = useState(clientesIniciales);
  if (clientesIniciales !== inicialesPrevios) {
    setInicialesPrevios(clientesIniciales);
    setClientes(clientesIniciales);
  }
  const [formulario, setFormulario] = useState<"crear" | "editar" | null>(null);
  const [seleccionado, setSeleccionado] = useState<ClienteItem | null>(null);
  const [cargando, setCargando] = useState(false);
  const [ventasDe, setVentasDe] = useState<ClienteItem | null>(null);
  const [ventas, setVentas] = useState<ExpedienteDto[] | null>(null);

  const [marcados, setMarcados] = useState<number[]>([]);
  const [aBorrar, setABorrar] = useState<ClienteItem | null>(null);
  const [borradoMasivo, setBorradoMasivo] = useState(false);
  const [edicionMasiva, setEdicionMasiva] = useState(false);
  const [menuDatos, setMenuDatos] = useState(false);
  const [seleccionActiva, setSeleccionActiva] = useState(false);
  const [borradoActivo, setBorradoActivo] = useState(false);

  const [busqueda, setBusqueda] = useState("");
  const [fNombre, setFNombre] = useState("");
  const [fDni, setFDni] = useState("");
  const [fFecha, setFFecha] = useState("");
  const [fCorreo, setFCorreo] = useState("");
  const [fTelefono, setFTelefono] = useState("");
  const [fTienda, setFTienda] = useState("");
  const [campo, setCampo] = useState<Campo>("id");
  const [asc, setAsc] = useState(false);

  // Formulario
  const [dni, setDni] = useState("");
  const [nombre, setNombre] = useState("");
  const [fechaNacimiento, setFechaNacimiento] = useState("");
  const [domicilio, setDomicilio] = useState("");
  const [poblacion, setPoblacion] = useState("");
  const [codigoPostal, setCodigoPostal] = useState("");
  const [comentarios, setComentarios] = useState("");
  const [tiendaId, setTiendaId] = useState("");
  const [emails, setEmails] = useState<ContactoEdicion[]>([contactoVacio()]);
  const [telefonos, setTelefonos] = useState<ContactoEdicion[]>([contactoVacio()]);
  const [duplicado, setDuplicado] = useState<ClienteDto | null>(null);
  // Documentos leídos con el lector de DNI y aún sin vincular al cliente (se vinculan al guardar)
  const [pendientes, setPendientes] = useState<number[]>([]);
  /** Nombres de los documentos pendientes (para mostrarlos mientras el cliente aún no está guardado). */
  const [nombresPend, setNombresPend] = useState<Record<number, string>>({});
  const [fotoPendiente, setFotoPendiente] = useState<number | null>(null);
  /** Se incrementa para que la lista de documentos del modal se vuelva a pedir al servidor. */
  const [refrescoAdjuntos, setRefrescoAdjuntos] = useState(0);

  const nombreTienda = (id: number | null) => tiendas.find((t) => t.id_tienda === id)?.nombre;

  const abrirCrear = () => {
    setSeleccionado(null);
    setDni("");
    setNombre("");
    setFechaNacimiento("");
    setDomicilio("");
    setPoblacion("");
    setCodigoPostal("");
    setTiendaId(tiendaPredeterminadaId ? String(tiendaPredeterminadaId) : "");
    setEmails([contactoVacio()]);
    setTelefonos([contactoVacio()]);
    setPendientes([]);
    setFotoPendiente(null);
    setFormulario("crear");
  };

  const abrirEditar = (c: ClienteItem) => {
    setSeleccionado(c);
    setDni(c.dni ?? "");
    setNombre(c.nombre ?? "");
    setFechaNacimiento(c.fecha_de_nacimiento ?? "");
    setDomicilio(c.domicilio ?? "");
    setPoblacion(c.poblacion ?? "");
    setCodigoPostal(c.codigo_postal ?? "");
    setComentarios(c.comentarios ?? "");
    setTiendaId(c.tienda_id ? String(c.tienda_id) : "");
    setEmails(emailsDeCliente(c));
    setTelefonos(telefonosDeCliente(c));
    setPendientes([]);
    setFotoPendiente(null);
    setFormulario("editar");
  };

  const guardarCliente = async () => {
    setCargando(true);
    try {
      const esEdicion = formulario === "editar";
      const emailsOk = emails.filter((e) => e.valor.trim());
      const telefonosOk = telefonos.filter((t) => t.valor.trim());
      const res = await fetch("/api/clientes", {
        method: esEdicion ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: esEdicion ? seleccionado?.id : undefined,
          dni: dni.trim() || null,
          nombre,
          fecha_de_nacimiento: fechaNacimiento || null,
          domicilio: domicilio.trim() || null,
          poblacion: poblacion.trim() || null,
          codigo_postal: codigoPostal.trim() || null,
          comentarios: comentarios.trim() || null,
          tienda_id: tiendaId ? Number(tiendaId) : null,
          emails: emailsOk.map((e) => ({ email: e.valor.trim(), tipo: e.tipo })),
          telefonos: telefonosOk.map((t) => ({ telefono: t.valor.trim(), tipo: t.tipo })),
        }),
      });
      if (!res.ok) throw new Error(await mensajeDeError(res, "Error al guardar cliente."));
      const datos = (await res.json()) as { data?: ClienteDto };
      const idGuardado = esEdicion ? seleccionado?.id : datos.data?.id;
      if (idGuardado && pendientes.length > 0) {
        try {
          await vincularAdjuntos(pendientes, { idCliente: idGuardado });
        } catch (e) {
          mostrar(e instanceof Error ? e.message : "No se han podido guardar los documentos.", "error");
        }
      }

      const emailsDto = emailsOk.map((e) => ({ email: e.valor.trim(), tipo_email: e.tipo }));
      const telefonosDto = telefonosOk.map((t) => ({ telefono: t.valor.trim(), tipo_telefono: t.tipo }));
      if (esEdicion && seleccionado) {
        setClientes((prev) =>
          prev.map((c) =>
            c.id === seleccionado.id
              ? { ...c, dni: dni.trim() || null, nombre, fecha_de_nacimiento: fechaNacimiento || null, domicilio: domicilio.trim() || null, poblacion: poblacion.trim() || null, codigo_postal: codigoPostal.trim() || null, comentarios: comentarios.trim() || null, tienda_id: tiendaId ? Number(tiendaId) : null, emails: emailsDto, telefonos: telefonosDto, foto_id: fotoPendiente ?? c.foto_id }
              : c,
          ),
        );
        mostrar("Cliente actualizado correctamente.");
      } else if (datos.data) {
        setClientes((prev) => [{ ...datos.data!, emails: emailsDto, telefonos: telefonosDto, num_expedientes: 0, foto_id: fotoPendiente }, ...prev]);
        mostrar("Cliente registrado correctamente.");
      }
      setFormulario(null);
      setSeleccionado(null);
      router.refresh();
    } catch (e) {
      mostrar(e instanceof Error ? e.message : "Error al guardar cliente.", "error");
    } finally {
      setCargando(false);
    }
  };

  /** Guarda al momento los documentos si el cliente ya existe; si es un alta, quedan pendientes hasta guardar. */
  const registrarDocumentos = (docs: { id: number; nombre: string }[], fotoId: number | null = null) => {
    const ids = docs.map((d) => d.id);
    if (formulario === "editar" && seleccionado) {
      const idCliente = seleccionado.id;
      void vincularAdjuntos(ids, { idCliente })
        .then(() => {
          setRefrescoAdjuntos((n) => n + 1);
          if (fotoId) setClientes((prev) => prev.map((x) => (x.id === idCliente ? { ...x, foto_id: fotoId } : x)));
        })
        .catch((e: unknown) => mostrar(e instanceof Error ? e.message : "No se han podido guardar los documentos.", "error"));
      return;
    }
    setPendientes((prev) => [...prev, ...ids]);
    setNombresPend((prev) => ({ ...prev, ...Object.fromEntries(docs.map((d) => [d.id, d.nombre])) }));
    if (fotoId) setFotoPendiente(fotoId);
  };

  const anadirPendientes = (docs: AdjuntoDto[]) => registrarDocumentos(docs.map((d) => ({ id: d.id, nombre: d.nombre })));

  const quitarPendiente = async (id: number) => {
    try {
      await fetch(`/api/adjuntos?id=${id}`, { method: "DELETE", credentials: "same-origin" });
    } catch {
      /* si falla, el borrado de pendientes antiguos lo hace el servidor */
    }
    setPendientes((prev) => prev.filter((x) => x !== id));
  };

  const alLeerDni = (r: ResultadoDni) => {
    registrarDocumentos(r.adjuntos.map((a) => ({ id: a.id, nombre: a.nombre })), r.fotoId);
    mostrar(r.fotoId ? "DNI guardado y foto del cliente detectada." : "DNI guardado. No se ha podido detectar la foto del cliente.");
  };

  const enviarFormulario = async (ev: FormEvent) => {
    ev.preventDefault();
    if (!nombre.trim()) {
      // Un cliente no puede existir sin nombre: se avisa y se señala el campo (sin el aviso del navegador)
      mostrar("Falta el nombre del cliente: escríbelo para poder guardarlo.", "aviso");
      señalarCampo("nombreCliente");
      return;
    }
    if (formulario === "crear") {
      setCargando(true);
      try {
        const res = await fetch("/api/clientes/verificar-existencia", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dni: dni.trim() || null, nombre: nombre.trim() }),
        });
        if (res.ok) {
          const r = (await res.json()) as { exists?: boolean; cliente?: ClienteDto };
          if (r.exists && r.cliente) {
            setDuplicado(r.cliente);
            setCargando(false);
            return;
          }
        }
      } catch {
        /* si falla la comprobación se guarda igualmente */
      }
      setCargando(false);
    }
    await guardarCliente();
  };

  const eliminar = async (ids: number[]) => {
    setCargando(true);
    try {
      const res = await fetch(ids.length === 1 ? `/api/clientes?id=${ids[0]}` : "/api/clientes", {
        method: "DELETE",
        ...(ids.length === 1 ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids }) }),
      });
      if (!res.ok) throw new Error(await mensajeDeError(res, "Error al eliminar cliente."));
      setClientes((prev) => prev.filter((c) => !ids.includes(c.id)));
      setMarcados((prev) => prev.filter((x) => !ids.includes(x)));
      mostrar(ids.length === 1 ? "Cliente eliminado correctamente." : `${ids.length} clientes eliminados correctamente.`);
      setABorrar(null);
      setBorradoMasivo(false);
      router.refresh();
    } catch (e) {
      mostrar(e instanceof Error ? e.message : "Error al eliminar cliente.", "error");
    } finally {
      setCargando(false);
    }
  };

  const guardarEdicionMasiva = async (cambios: CambiosMasivosClientes) => {
    const ids = marcados;
    setCargando(true);
    try {
      const res = await fetch("/api/clientes", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, ...cambios }),
      });
      if (!res.ok) throw new Error(await mensajeDeError(res, "Error al actualizar los clientes."));
      setClientes((prev) =>
        prev.map((c) => {
          if (!ids.includes(c.id)) return c;
          const nuevo: ClienteItem = { ...c };
          if (cambios.tienda_id !== undefined) nuevo.tienda_id = cambios.tienda_id;
          if (cambios.poblacion) nuevo.poblacion = cambios.poblacion;
          if (cambios.codigo_postal) nuevo.codigo_postal = cambios.codigo_postal;
          if (cambios.domicilio) nuevo.domicilio = cambios.domicilio;
          if (cambios.comentarios) nuevo.comentarios = cambios.comentarios_modo === "anadir" && c.comentarios ? `${c.comentarios}\n${cambios.comentarios}` : cambios.comentarios;
          return nuevo;
        }),
      );
      mostrar(`${ids.length} clientes modificados correctamente.`);
      setEdicionMasiva(false);
      setMarcados([]);
      router.refresh();
    } catch (e) {
      mostrar(e instanceof Error ? e.message : "Error de conexión al actualizar.", "error");
    } finally {
      setCargando(false);
    }
  };

  const abrirVentas = async (c: ClienteItem) => {
    setVentasDe(c);
    setVentas(null);
    try {
      const res = await fetch(`/api/clientes/expedientes?id=${c.id}`);
      if (!res.ok) throw new Error(await mensajeDeError(res, "Error al cargar los expedientes."));
      setVentas(((await res.json()) as { data: ExpedienteDto[] }).data);
    } catch (e) {
      mostrar(e instanceof Error ? e.message : "Error al cargar los expedientes.", "error");
      setVentasDe(null);
    }
  };

  /* ---- Filtrado y orden ---- */
  const filtrados = useMemo(() => {
    const gs = busqueda.toLowerCase();
    return clientes.filter((c) => {
      if (gs) {
        const ok =
          c.nombre?.toLowerCase().includes(gs) ||
          c.dni?.toLowerCase().includes(gs) ||
          c.emails.some((e) => e.email.toLowerCase().includes(gs)) ||
          c.telefonos.some((t) => t.telefono.toLowerCase().includes(gs)) ||
          nombreTienda(c.tienda_id)?.toLowerCase().includes(gs);
        if (!ok) return false;
      }
      if (fNombre && !c.nombre?.toLowerCase().includes(fNombre.toLowerCase())) return false;
      if (fDni && !c.dni?.toLowerCase().includes(fDni.toLowerCase())) return false;
      if (fFecha) {
        const f = c.fecha_de_nacimiento ? formatDate(c.fecha_de_nacimiento).toLowerCase() : "no indicada";
        if (!f.includes(fFecha.toLowerCase())) return false;
      }
      if (fCorreo && !c.emails.some((e) => e.email.toLowerCase().includes(fCorreo.toLowerCase()))) return false;
      if (fTelefono && !c.telefonos.some((t) => t.telefono.toLowerCase().includes(fTelefono.toLowerCase()))) return false;
      if (fTienda) {
        if (fTienda === "global" ? c.tienda_id !== null : c.tienda_id !== Number(fTienda)) return false;
      }
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientes, busqueda, fNombre, fDni, fFecha, fCorreo, fTelefono, fTienda, tiendas]);

  const ordenados = useMemo(() => {
    const lista = [...filtrados].sort((a, b) => {
      switch (campo) {
        case "nombre":
          return (a.nombre ?? "").localeCompare(b.nombre ?? "");
        case "dni":
          return (a.dni ?? "").localeCompare(b.dni ?? "");
        case "fecha_de_nacimiento":
          return (a.fecha_de_nacimiento ?? "").localeCompare(b.fecha_de_nacimiento ?? "");
        case "tienda":
          return (nombreTienda(a.tienda_id) ?? "Global").localeCompare(nombreTienda(b.tienda_id) ?? "Global");
        case "expedientes":
          return a.num_expedientes - b.num_expedientes;
        default:
          return a.id - b.id;
      }
    });
    return asc ? lista : lista.reverse();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtrados, campo, asc, tiendas]);

  const ordenar = (c: Campo) => {
    if (campo === c) setAsc(!asc);
    else {
      setCampo(c);
      setAsc(true);
    }
  };
  const flecha = (c: Campo) => (campo === c ? (asc ? "▲" : "▼") : "↕");
  const hayFiltros = fNombre || fDni || fFecha || fCorreo || fTelefono || fTienda;

  const totalVentasMarcadas = clientes.filter((c) => marcados.includes(c.id)).reduce((acc, c) => acc + c.num_expedientes, 0);

  /* ---- CSV ---- */
  const exportarCsv = (soloMarcados: boolean) => {
    const lista = soloMarcados ? clientes.filter((c) => marcados.includes(c.id)) : ordenados;
    if (lista.length === 0) {
      mostrar("No hay clientes para exportar.", "error");
      return;
    }
    const csv = construirCsvClientes(
      lista.map((c) => ({ ...c, tiendaNombre: nombreTienda(c.tienda_id) ?? "", numExpedientes: c.num_expedientes })),
    );
    descargarTexto(`clientes_${soloMarcados ? "seleccionados_" : ""}export_${new Date().toISOString().split("T")[0]}.csv`, csv, "text/csv;charset=utf-8;");
    mostrar("Exportación CSV realizada con éxito.");
  };

  const importarCsv = async (ev: ChangeEvent<HTMLInputElement>) => {
    const entrada = ev.target;
    const archivo = entrada.files?.[0];
    if (!archivo) return;
    setCargando(true);
    try {
      const items = interpretarCsvClientes(await archivo.text());
      const res = await fetch("/api/clientes/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items }) });
      if (!res.ok) throw new Error(await mensajeDeError(res, "Error al importar."));
      mostrar(((await res.json()) as { message?: string }).message ?? "Importación realizada.");
      router.refresh();
    } catch (e) {
      mostrar(e instanceof Error ? e.message : "Error al importar el archivo CSV.", "error");
    } finally {
      setCargando(false);
      entrada.value = "";
    }
  };

  const columnasTotales = seleccionActiva ? 9 : 8;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      <div style={{ position: "relative", maxWidth: "400px" }}>
        <input
          type="text"
          placeholder="🔍 Buscar clientes (nombre, DNI, email, teléfono...)"
          className="form-input"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          style={{ paddingRight: busqueda ? "36px" : "12px", width: "100%" }}
        />
        {busqueda && (
          <button
            type="button"
            onClick={() => setBusqueda("")}
            style={{ position: "absolute", right: "10px", top: "50%", transform: "translateY(-50%)", border: "none", background: "none", cursor: "pointer", fontSize: "1rem", color: "var(--text-muted)" }}
          >
            ✖
          </button>
        )}
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "16px", flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
          <button
            type="button"
            className="btn"
            onClick={() => {
              if (seleccionActiva) setMarcados([]);
              setSeleccionActiva(!seleccionActiva);
            }}
            style={botonBloqueo(seleccionActiva, "var(--warning)", "black")}
            title={seleccionActiva ? "Bloquear Selección Masiva" : "Desbloquear Selección Masiva"}
          >
            {seleccionActiva ? "🔓 Selección Activa" : "🔒 Selección Inactiva"}
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => setBorradoActivo(!borradoActivo)}
            style={botonBloqueo(borradoActivo, "var(--danger)", "white")}
            title={borradoActivo ? "Bloquear Eliminación" : "Desbloquear Eliminación"}
          >
            {borradoActivo ? "🔓 Eliminación Activa" : "🔒 Eliminación Inactiva"}
          </button>

          {seleccionActiva && marcados.length > 0 && (
            <>
              <span style={{ fontSize: "0.9rem", fontWeight: 600, color: "var(--primary)" }}>({marcados.length} seleccionados):</span>
              <button
                type="button"
                className="btn"
                onClick={() => borradoActivo && setBorradoMasivo(true)}
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
              <button type="button" className="btn btn-secondary" onClick={() => setEdicionMasiva(true)} style={{ padding: "6px 12px", fontSize: "0.8rem" }}>
                ✏️ Editar Seleccionados
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => exportarCsv(true)} style={{ padding: "6px 12px", fontSize: "0.8rem" }}>
                📤 Exportar SOLO clientes seleccionados (CSV)
              </button>
            </>
          )}
        </div>

        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
          <button type="button" className="btn btn-primary" onClick={abrirCrear} style={{ padding: "10px 20px" }}>
            + Registrar Nuevo Cliente
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setMenuDatos(true)}
            style={{ padding: "10px 16px", fontSize: "0.85rem" }}
            title="Importar y exportar clientes (CSV), copias internas y copia de seguridad: todo en una sola ventana, con la explicación de cada opción"
          >
            🗂️ Importar y exportar
          </button>
        </div>
      </div>

      {totalEnBd !== undefined && totalEnBd > clientes.length && (
        <div style={{ padding: "12px 16px", borderLeft: "4px solid var(--warning)", background: "var(--bg-card)", borderRadius: "var(--radius-sm)", fontSize: "0.9rem" }}>
          ⚠️ Se muestran los {clientes.length.toLocaleString("es-ES")} clientes más recientes de {totalEnBd.toLocaleString("es-ES")}. Para localizar otro usa el buscador global (arriba).
        </div>
      )}

      <div className="glass-panel" style={{ padding: "8px" }}>
        <div style={{ padding: "10px 16px 4px", fontSize: "0.85rem", color: "var(--text-muted)" }}>
          {ordenados.length} cliente(s){busqueda || hayFiltros ? ` (de ${clientes.length} totales)` : ""}
        </div>
        <div className="table-container">
          <table className="table-premium">
            <thead>
              <tr>
                {seleccionActiva && (
                  <th style={{ width: "40px", textAlign: "center" }}>
                    <input
                      type="checkbox"
                      checked={ordenados.length > 0 && marcados.length === ordenados.length}
                      onChange={(e) => setMarcados(e.target.checked ? ordenados.map((c) => c.id) : [])}
                      style={{ width: "16px", height: "16px", cursor: "pointer" }}
                    />
                  </th>
                )}
                <th onClick={() => ordenar("nombre")} style={{ cursor: "pointer" }}>Nombre {flecha("nombre")}</th>
                <th onClick={() => ordenar("dni")} style={{ cursor: "pointer" }}>DNI / NIE {flecha("dni")}</th>
                <th onClick={() => ordenar("fecha_de_nacimiento")} style={{ cursor: "pointer" }}>F. Nacimiento {flecha("fecha_de_nacimiento")}</th>
                <th>Correos</th>
                <th>Teléfonos</th>
                <th onClick={() => ordenar("tienda")} style={{ cursor: "pointer" }}>Tienda {flecha("tienda")}</th>
                <th onClick={() => ordenar("expedientes")} style={{ cursor: "pointer" }}>Ventas {flecha("expedientes")}</th>
                <th>Acciones</th>
              </tr>
              <tr style={{ background: "rgba(255, 255, 255, 0.01)" }}>
                {seleccionActiva && <td></td>}
                <td><input type="text" placeholder="Filtrar..." className="form-input" value={fNombre} onChange={(e) => setFNombre(e.target.value)} style={{ ...celdaFiltro, minWidth: "100px" }} /></td>
                <td><input type="text" placeholder="Filtrar..." className="form-input" value={fDni} onChange={(e) => setFDni(e.target.value)} style={{ ...celdaFiltro, minWidth: "80px" }} /></td>
                <td><input type="text" placeholder="Filtrar..." className="form-input" value={fFecha} onChange={(e) => setFFecha(e.target.value)} style={{ ...celdaFiltro, minWidth: "80px" }} /></td>
                <td><input type="text" placeholder="Filtrar..." className="form-input" value={fCorreo} onChange={(e) => setFCorreo(e.target.value)} style={{ ...celdaFiltro, minWidth: "100px" }} /></td>
                <td><input type="text" placeholder="Filtrar..." className="form-input" value={fTelefono} onChange={(e) => setFTelefono(e.target.value)} style={{ ...celdaFiltro, minWidth: "80px" }} /></td>
                <td>
                  <select className="form-select" value={fTienda} onChange={(e) => setFTienda(e.target.value)} style={{ ...celdaFiltro, minWidth: "120px" }}>
                    <option value="">Todas</option>
                    <option value="global">Global (Sin Tienda)</option>
                    {tiendas.map((t) => (
                      <option key={t.id_tienda} value={t.id_tienda}>
                        {t.nombre}
                      </option>
                    ))}
                  </select>
                </td>
                <td></td>
                <td style={{ textAlign: "center" }}>
                  {hayFiltros && (
                    <button
                      type="button"
                      onClick={() => {
                        setFNombre("");
                        setFDni("");
                        setFFecha("");
                        setFCorreo("");
                        setFTelefono("");
                        setFTienda("");
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
              {ordenados.length === 0 ? (
                <tr>
                  <td colSpan={columnasTotales} style={{ textAlign: "center", padding: "40px 20px", color: "var(--text-muted)", fontStyle: "italic" }}>
                    {clientes.length === 0 ? "No hay clientes registrados en el sistema." : "No se encontraron clientes que coincidan con los filtros aplicados."}
                  </td>
                </tr>
              ) : (
                ordenados.map((c) => {
                  const tienda = nombreTienda(c.tienda_id);
                  const marcado = marcados.includes(c.id);
                  return (
                    <tr key={c.id} style={{ background: marcado && seleccionActiva ? "rgba(var(--primary-rgb), 0.04)" : undefined }}>
                      {seleccionActiva && (
                        <td style={{ textAlign: "center" }}>
                          <input
                            type="checkbox"
                            checked={marcado}
                            onChange={(e) => setMarcados((prev) => (e.target.checked ? [...prev, c.id] : prev.filter((x) => x !== c.id)))}
                            style={{ width: "16px", height: "16px", cursor: "pointer" }}
                          />
                        </td>
                      )}
                      <td style={{ fontWeight: "bold", color: "var(--text-primary)" }}>
                        <NombreConFoto fotoId={c.foto_id}>{c.nombre}</NombreConFoto>
                      </td>
                      <td>{c.dni || "N/D"}</td>
                      <td>{c.fecha_de_nacimiento ? formatDate(c.fecha_de_nacimiento) : "No indicada"}</td>
                      <td>
                        <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                          {c.emails.map((e, i) => (
                            <div key={i} style={{ fontSize: "0.85rem" }}>
                              <span style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginRight: "4px" }}>({e.tipo_email || "Principal"}):</span>
                              {e.email}
                            </div>
                          ))}
                          {c.emails.length === 0 && <span style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>Ninguno</span>}
                        </div>
                      </td>
                      <td>
                        <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                          {c.telefonos.map((t, i) => (
                            <div key={i} style={{ fontSize: "0.85rem" }}>
                              <span style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginRight: "4px" }}>({t.tipo_telefono || "Principal"}):</span>
                              {t.telefono}
                            </div>
                          ))}
                          {c.telefonos.length === 0 && <span style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>Ninguno</span>}
                        </div>
                      </td>
                      <td>
                        <span className={`badge ${tienda ? "badge-tienda" : "badge-invitado"}`} style={{ fontSize: "0.75rem" }}>
                          {tienda ?? "Global (Sin Tienda)"}
                        </span>
                      </td>
                      <td>
                        {c.num_expedientes > 0 ? (
                          <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={() => void abrirVentas(c)}
                            style={{ padding: "6px 12px", fontSize: "0.8rem", fontWeight: "bold", color: "var(--primary)", border: "1px solid var(--primary)", background: "rgba(6, 182, 212, 0.05)", borderRadius: "var(--radius-sm)", cursor: "pointer" }}
                          >
                            {c.num_expedientes} venta(s)
                          </button>
                        ) : (
                          <span style={{ color: "var(--text-muted)", fontSize: "0.9rem", paddingLeft: "12px" }}>0</span>
                        )}
                      </td>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <button type="button" className="btn btn-secondary" onClick={() => abrirEditar(c)} style={{ padding: "6px 12px", fontSize: "0.8rem" }}>
                            ✏️ Editar
                          </button>
                          <button
                            type="button"
                            onClick={() => borradoActivo && setABorrar(c)}
                            disabled={!borradoActivo}
                            style={{
                              padding: "6px 12px",
                              fontSize: "0.8rem",
                              color: borradoActivo ? "var(--danger)" : "var(--text-muted)",
                              background: borradoActivo ? "rgba(239, 68, 68, 0.05)" : "rgba(255, 255, 255, 0.02)",
                              border: borradoActivo ? "1px solid rgba(239, 68, 68, 0.2)" : "1px solid var(--border-light)",
                              borderRadius: "var(--radius-sm)",
                              cursor: borradoActivo ? "pointer" : "not-allowed",
                              opacity: borradoActivo ? 1 : 0.5,
                            }}
                          >
                            🗑️ Eliminar
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {aBorrar && (
        <ModalConfirmar
          titulo={<span style={{ color: "var(--danger)" }}>⚠️ Confirmar Eliminación</span>}
          mensaje={
            aBorrar.num_expedientes > 0 ? (
              <>
                El cliente <strong>{aBorrar.nombre}</strong> tiene <strong>{aBorrar.num_expedientes}</strong> expediente(s) de venta asociado(s).
                <span style={{ color: "var(--warning)", fontWeight: 600, display: "block", marginTop: "12px", padding: "10px", background: "rgba(230, 157, 0, 0.05)", border: "1px solid rgba(230, 157, 0, 0.15)", borderRadius: "var(--radius-sm)" }}>
                  ⚠️ Si continúas, estos expedientes se desvincularán del cliente y pasarán a quedar registrados como &quot;Sin cliente&quot;.
                </span>
                <span style={{ display: "block", marginTop: "12px" }}>¿Deseas confirmar la eliminación del cliente?</span>
              </>
            ) : (
              <>
                ¿Estás seguro de que deseas eliminar al cliente <strong>{aBorrar.nombre}</strong>?
                <span style={{ color: "var(--text-muted)", fontSize: "0.85rem", display: "block", marginTop: "8px" }}>
                  Nota: Se eliminarán de forma definitiva sus datos de contacto (correos y teléfonos).
                </span>
              </>
            )
          }
          textoConfirmar="Sí, Eliminar"
          ocupado={cargando}
          alConfirmar={() => void eliminar([aBorrar.id])}
          alCancelar={() => setABorrar(null)}
        />
      )}

      {menuDatos && (
        <Modal
          titulo="🗂️ Importar y exportar clientes"
          ancho="860px"
          pie={
            <button type="button" className="btn btn-secondary" onClick={() => setMenuDatos(false)}>
              Cerrar
            </button>
          }
        >
          <div style={{ display: "flex", flexDirection: "column", gap: "18px", fontSize: "0.9rem" }}>
            <GrupoDatos titulo="📥 Traer clientes" ayuda="Para añadir clientes desde fuera de la aplicación.">
              <OpcionDatos
                icono="📥"
                titulo="Importar CSV"
                texto="Carga clientes desde un archivo CSV exportado antes con esta aplicación."
                ayuda="Elige un archivo .csv con el formato de «Exportar SOLO clientes (CSV)». Crea los clientes nuevos y no duplica los que ya existen."
                archivo=".csv"
                deshabilitado={cargando}
                alElegir={(e) => {
                  setMenuDatos(false);
                  void importarCsv(e);
                }}
              />
            </GrupoDatos>
            <GrupoDatos titulo="📤 Sacar clientes" ayuda="Descarga un archivo con los clientes.">
              <OpcionDatos
                icono="📤"
                titulo="Exportar SOLO clientes: todos (CSV)"
                texto="Descarga todos los clientes (los que ves con los filtros actuales) en un CSV que se abre con Excel."
                ayuda="Descarga un archivo .csv en tu equipo con los clientes de la tabla. No cambia nada en la aplicación."
                alPulsar={() => {
                  setMenuDatos(false);
                  exportarCsv(false);
                }}
              />
              <OpcionDatos
                icono="☑️"
                titulo="Exportar SOLO clientes: los seleccionados (CSV)"
                texto={marcados.length > 0 ? `Descarga solo los ${marcados.length} clientes que has marcado.` : "Primero activa «Selección» en la barra y marca los clientes que quieras."}
                ayuda="Descarga solo los clientes marcados. Requiere activar la selección masiva y marcar alguno."
                deshabilitado={marcados.length === 0}
                alPulsar={() => {
                  setMenuDatos(false);
                  exportarCsv(true);
                }}
              />
            </GrupoDatos>
            {userRole === "administrador" && (
              <GrupoDatos titulo="🗄️ Copias y traspaso entre instalaciones" ayuda="Solo administradores. Para guardar, recuperar o llevar los clientes a otro equipo.">
                <CajaDatos titulo="📁 Clientes en archivo JSON y copias internas" texto="Exporta o importa solo los clientes (con vista previa y copia de seguridad automática) y guarda copias internas de esta sección dentro de la aplicación para restaurarlas cuando quieras.">
                  <BotonesDatosSeccion modo="botones" seccion="clientes" alCambiar={() => router.refresh()} />
                </CajaDatos>
              </GrupoDatos>
            )}
          </div>
        </Modal>
      )}

      {edicionMasiva && (
        <ModalEdicionMasivaClientes
          seleccionados={marcados.length}
          tiendas={tiendas}
          ocupado={cargando}
          alGuardar={(c) => void guardarEdicionMasiva(c)}
          alCancelar={() => setEdicionMasiva(false)}
          alAvisar={(m) => mostrar(m, "error")}
        />
      )}

      {borradoMasivo && (
        <ModalConfirmar
          titulo={<span style={{ color: "var(--danger)" }}>⚠️ Confirmar Eliminación Masiva</span>}
          mensaje={
            totalVentasMarcadas > 0 ? (
              <>
                Vas a eliminar <strong>{marcados.length}</strong> clientes, los cuales acumulan un total de <strong>{totalVentasMarcadas}</strong> expediente(s) de venta asociados.
                <span style={{ color: "var(--warning)", fontWeight: 600, display: "block", marginTop: "12px", padding: "10px", background: "rgba(230, 157, 0, 0.05)", border: "1px solid rgba(230, 157, 0, 0.15)", borderRadius: "var(--radius-sm)" }}>
                  ⚠️ Si continúas, todos estos expedientes quedarán desvinculados (como &quot;Sin cliente&quot;).
                </span>
                <span style={{ display: "block", marginTop: "12px" }}>¿Deseas proceder con la eliminación masiva?</span>
              </>
            ) : (
              <>
                ¿Estás seguro de que deseas eliminar los <strong>{marcados.length}</strong> clientes seleccionados?
                <span style={{ color: "var(--text-muted)", fontSize: "0.85rem", display: "block", marginTop: "8px" }}>Nota: Se borrarán sus datos de contacto de forma definitiva.</span>
              </>
            )
          }
          textoConfirmar="Sí, Eliminar Todo"
          ocupado={cargando}
          alConfirmar={() => void eliminar(marcados)}
          alCancelar={() => setBorradoMasivo(false)}
        />
      )}

      {formulario && (
        <Modal titulo={formulario === "editar" ? "Editar Cliente" : "Registrar Nuevo Cliente"} ancho="1000px" tamanoTitulo="1.25rem">
          <form onSubmit={enviarFormulario} style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
                <BotonLeerDni disabled={cargando} alLeer={alLeerDni} />
                {formulario !== "editar" && <ZonaDocumentosVarios disabled={cargando} alSubir={anadirPendientes} />}
              </div>
              <ListaPendientes docs={pendientes.map((id) => ({ id, nombre: nombresPend[id] ?? `Documento ${id}` }))} alQuitar={(id) => void quitarPendiente(id)} />
              <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                {formulario === "editar"
                  ? "Los documentos que subas aquí se guardan al momento con este cliente."
                  : pendientes.length > 0
                    ? `${pendientes.length} documento(s) se guardarán con el cliente${fotoPendiente ? ", incluida su foto" : ""}.`
                    : "Arrastra el DNI para guardarlo y tomar la foto del cliente (los datos se escriben a mano) o documentos varios."}
              </span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">DNI / NIE</label>
                <input type="text" className="form-input" placeholder="Ej. 12345678Z" value={dni} onChange={(e) => setDni(e.target.value)} />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Nombre Completo *</label>
                <input type="text" className="form-input" placeholder="Ej. María López" value={nombre} onChange={(e) => setNombre(e.target.value)} data-campo="nombreCliente" />
              </div>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Domicilio</label>
              <input type="text" className="form-input" maxLength={255} value={domicilio} onChange={(e) => setDomicilio(e.target.value)} placeholder="Calle, número, piso…" autoComplete="off" />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "16px" }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Población</label>
                <input type="text" className="form-input" maxLength={120} value={poblacion} onChange={(e) => setPoblacion(e.target.value)} autoComplete="off" />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Código postal</label>
                <input type="text" className="form-input" inputMode="numeric" maxLength={10} value={codigoPostal} onChange={(e) => setCodigoPostal(e.target.value)} autoComplete="off" />
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Fecha de Nacimiento</label>
                <input type="date" className="form-input" value={fechaNacimiento} onChange={(e) => setFechaNacimiento(e.target.value)} />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Tienda de Registro</label>
                <select className="form-select" value={tiendaId} onChange={(e) => setTiendaId(e.target.value)}>
                  <option value="">Selecciona Tienda (Opcional)</option>
                  {tiendas.map((t) => (
                    <option key={t.id_tienda} value={t.id_tienda}>
                      {t.nombre} {t.ciudad ? `(${t.ciudad})` : ""}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px", alignItems: "start" }}>
              <ListaContactos clase="email" contactos={emails} alCambiar={setEmails} />
              <ListaContactos clase="telefono" contactos={telefonos} alCambiar={setTelefonos} />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Comentarios</label>
              <textarea className="form-input" rows={4} maxLength={5000} value={comentarios} onChange={(e) => setComentarios(e.target.value)} placeholder="Notas internas sobre el cliente…" style={{ resize: "vertical", minHeight: "90px" }} />
            </div>
            {formulario === "editar" && seleccionado && <VisorAdjuntos key={refrescoAdjuntos} idCliente={seleccionado.id} />}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px", marginTop: "10px" }}>
              <button type="button" className="btn btn-secondary" onClick={() => setFormulario(null)} disabled={cargando}>
                Cancelar
              </button>
              <button type="submit" className="btn btn-primary" disabled={cargando}>
                {cargando ? "Guardando..." : formulario === "editar" ? "Guardar Cambios" : "Registrar Cliente"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {ventasDe && (
        <Modal
          titulo={
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px" }}>
              <span>Expedientes de {ventasDe.nombre}</span>
              <button type="button" className="btn btn-secondary" onClick={() => setVentasDe(null)} style={{ padding: "6px 12px", fontSize: "0.8rem", color: "var(--danger)" }}>
                Cerrar
              </button>
            </div>
          }
          ancho="800px"
          tamanoTitulo="1.25rem"
        >
          {ventas === null ? (
            <p style={{ textAlign: "center", color: "var(--text-muted)", padding: "20px" }}>Cargando...</p>
          ) : (
            <TablaDatos<ExpedienteDto>
              id="cliente-ventas"
              columnas={columnasVentas}
              filas={ventas}
              clave={(e) => e.id_expediente}
              placeholder="Buscar por código, vehículo, matrícula…"
              vacio="No hay expedientes asociados a este cliente."
            />
          )}
        </Modal>
      )}

      {duplicado && (
        <Modal titulo={<span style={{ color: "var(--warning)" }}>⚠️ Cliente Ya Registrado</span>} ancho="500px" tamanoTitulo="1.4rem">
          <p style={{ color: "var(--text-secondary)", fontSize: "0.95rem", lineHeight: "1.5", textAlign: "center", margin: 0 }}>
            Se ha encontrado un cliente en la base de datos que coincide con el DNI o Nombre ingresado:
            <br />
            <strong style={{ color: "var(--text-primary)" }}>{duplicado.nombre}</strong> {duplicado.dni ? `(${duplicado.dni})` : ""}
            <br />
            <br />
            ¿Qué deseas hacer?
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <button
              type="button"
              className="btn btn-primary"
              style={{ width: "100%", justifyContent: "center" }}
              onClick={() => {
                mostrar(`Se canceló el registro. Ya existe el cliente ${duplicado.nombre}.`);
                setDuplicado(null);
                setFormulario(null);
              }}
            >
              🤝 Usar Cliente Existente (Cancelar Registro)
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ width: "100%", justifyContent: "center" }}
              onClick={async () => {
                setDuplicado(null);
                await guardarCliente();
              }}
            >
              🆕 Registrar como Cliente Nuevo de Todos Modos
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ width: "100%", justifyContent: "center", backgroundColor: "rgba(239, 68, 68, 0.1)", color: "var(--danger)", border: "1px solid rgba(239, 68, 68, 0.2)" }}
              onClick={() => setDuplicado(null)}
            >
              Cancelar
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
