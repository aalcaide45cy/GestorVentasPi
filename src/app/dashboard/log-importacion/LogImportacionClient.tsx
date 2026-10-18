"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Modal from "@/components/Modal";
import TablaDatos, { type ColumnaTabla } from "@/components/TablaDatos";
import { useToast } from "@/components/Toast";
import { mensajeDeError } from "@/components/expedientes/comun";
import ModalCompletarDatos, { hayBorradorCompletar } from "@/components/expedientes/ModalCompletarDatos";
import type { BloqueImportacionDto } from "@/lib/servicios/importaciones";

interface Opcion {
  id: number;
  nombre: string;
}

interface Props {
  marcas: Opcion[];
  modelosPorMarca: Record<number, Opcion[]>;
  tiposVenta: Opcion[];
  estadosVehiculo: Opcion[];
  tiendas: (Opcion & { ciudad: string | null })[];
}

type Registro = BloqueImportacionDto["registros"][number];
type Accion = "all" | "creado" | "modificado" | "omitido";

const estiloSeccion = { fontSize: "0.95rem", color: "var(--primary)", borderBottom: "1px solid var(--border-light)", paddingBottom: "6px", marginBottom: "12px" } as const;

/** Cambios de un registro modificado: «campo: antes → después». */
function leerCambios(json: string): Record<string, { old: unknown; new: unknown }> | null {
  try {
    return JSON.parse(json) as Record<string, { old: unknown; new: unknown }>;
  } catch {
    return null;
  }
}

function Cambios({ json }: { json: string | null }) {
  if (!json) return null;
  const cambios = json.trim().startsWith("{") ? leerCambios(json) : null;
  if (!cambios) return <span style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>{json}</span>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
      {Object.entries(cambios).map(([campo, v]) => (
        <div key={campo} style={{ fontSize: "0.85rem", display: "flex", flexWrap: "wrap", alignItems: "center", gap: "4px" }}>
          <span style={{ fontWeight: 600, color: "var(--text-secondary)" }}>{campo}:</span>
          <span style={{ textDecoration: "line-through", color: "var(--danger)", padding: "0 2px", backgroundColor: "rgba(239, 68, 68, 0.08)", borderRadius: "4px" }}>{String(v.old)}</span>
          <span>→</span>
          <span style={{ color: "var(--success)", fontWeight: 600, padding: "0 4px", backgroundColor: "rgba(16, 185, 129, 0.08)", borderRadius: "4px" }}>{String(v.new)}</span>
        </div>
      ))}
    </div>
  );
}

const columnasBaseRegistros: ColumnaTabla<Registro>[] = [
  { clave: "cliente", etiqueta: "Cliente", valor: (r) => r.cliente_nombre, celda: (r) => <b>{r.cliente_nombre}</b> },
  { clave: "dni", etiqueta: "DNI/NIF", valor: (r) => r.expediente?.cliente?.dni ?? "", celda: (r) => r.expediente?.cliente?.dni || r.bastidor || "N/D" },
  { clave: "matricula", etiqueta: "Matrícula", valor: (r) => r.matricula || r.expediente?.matricula || "", celda: (r) => r.matricula || r.expediente?.matricula || "N/D" },
  { clave: "bastidor", etiqueta: "Bastidor (VIN)", valor: (r) => r.bastidor || r.expediente?.vin || "", celda: (r) => <code style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>{r.bastidor || r.expediente?.vin || "N/D"}</code> },
  { clave: "tipo", etiqueta: "VN / VO", valor: (r) => r.expediente?.estadoVehiculo?.clase ?? "", celda: (r) => (r.expediente?.estadoVehiculo ? <b style={{ color: r.expediente.estadoVehiculo.clase === "VO" ? "var(--warning)" : "var(--success)" }}>{r.expediente.estadoVehiculo.clase}</b> : "—"), alinear: "center" },
  { clave: "marca", etiqueta: "Marca", valor: (r) => r.expediente?.modelo?.marca?.nombre ?? "" },
  { clave: "modelo", etiqueta: "Modelo", valor: (r) => r.expediente?.modelo?.nombre_modelo ?? "" },
  { clave: "estado", etiqueta: "Estado", valor: (r) => r.expediente?.estadoVehiculo?.nombre_estado_vehiculo ?? "", oculta: true },
  {
    clave: "accion",
    etiqueta: "Acción",
    valor: (r) => r.tipo_accion,
    celda: (r) => (
      <span
        className={`badge ${r.tipo_accion === "creado" ? "badge-tienda" : r.tipo_accion === "modificado" ? "badge-vendedor" : ""}`}
        style={{
          fontSize: "0.75rem",
          backgroundColor: r.tipo_accion === "creado" ? "rgba(59, 130, 246, 0.15)" : r.tipo_accion === "modificado" ? "rgba(16, 185, 129, 0.15)" : "rgba(255, 255, 255, 0.05)",
          color: r.tipo_accion === "creado" ? "var(--info)" : r.tipo_accion === "modificado" ? "var(--success)" : "var(--text-muted)",
        }}
      >
        {r.tipo_accion.toUpperCase()}
      </span>
    ),
  },
  { clave: "cambios", etiqueta: "Cambios / Detalles", valor: (r) => r.cambios ?? "", celda: (r) => <div style={{ maxWidth: "350px", whiteSpace: "normal" }}><Cambios json={r.cambios} /></div> },
];

/** «Log de Importaciones»: historial de cargas CSV/Excel con corrección rápida de cada expediente. */
export default function LogImportacionClient({ marcas, modelosPorMarca, tiposVenta, estadosVehiculo, tiendas }: Props) {
  const router = useRouter();
  const { mostrar } = useToast();
  const [bloques, setBloques] = useState<BloqueImportacionDto[]>([]);
  const [cargando, setCargando] = useState(true);
  const [busqueda, setBusqueda] = useState("");
  const [accion, setAccion] = useState<Accion>("all");
  const [abierto, setAbierto] = useState<number | null>(null);

  const [corrigiendo, setCorrigiendo] = useState<Registro | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [nombre, setNombre] = useState("");
  const [dni, setDni] = useState("");
  const [matricula, setMatricula] = useState("");
  const [vin, setVin] = useState("");
  const [marca, setMarca] = useState<number | "">("");
  const [modelo, setModelo] = useState<number | "">("");
  const [tienda, setTienda] = useState<number | "">("");
  const [tipoVenta, setTipoVenta] = useState<number | "">("");
  const [estado, setEstado] = useState<number | "">("");
  const [fExp, setFExp] = useState("");
  const [fAfect, setFAfect] = useState("");
  const [fMat, setFMat] = useState("");
  const [fEntrega, setFEntrega] = useState("");
  // Importación de «Completar datos» que se dejó a medias en este navegador
  const [pendiente, setPendiente] = useState(false);
  const [retomando, setRetomando] = useState(false);
  useEffect(() => {
    void Promise.resolve().then(() => setPendiente(hayBorradorCompletar()));
  }, [retomando]);

  const recargar = async () => {
    try {
      const res = await fetch("/api/importaciones");
      if (!res.ok) throw new Error(await mensajeDeError(res, "Error al cargar logs"));
      setBloques(((await res.json()) as { data: BloqueImportacionDto[] }).data);
    } catch (e) {
      mostrar(e instanceof Error ? e.message : "Error de conexión", "error");
    }
  };

  useEffect(() => {
    let activo = true;
    fetch("/api/importaciones")
      .then(async (res) => {
        if (!res.ok) throw new Error(await mensajeDeError(res, "Error al cargar logs"));
        return (await res.json()) as { data: BloqueImportacionDto[] };
      })
      .then((r) => activo && setBloques(r.data))
      .catch((e: unknown) => activo && mostrar(e instanceof Error ? e.message : "Error de conexión", "error"))
      .finally(() => activo && setCargando(false));
    return () => {
      activo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const eliminarBloque = async (id: number) => {
    if (!window.confirm("¿Quitar esta línea del historial? Los datos importados se quedan como están (para quitarlos usa «Deshacer importación»).")) return;
    try {
      const res = await fetch(`/api/importaciones?id=${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await mensajeDeError(res, "Error al eliminar bloque"));
      setBloques((prev) => prev.filter((b) => b.id !== id));
      if (abierto === id) setAbierto(null);
      mostrar("Historial de importación eliminado correctamente");
    } catch (e) {
      mostrar(e instanceof Error ? e.message : "Error de conexión al eliminar", "error");
    }
  };

  /** Deshace de verdad una importación: elimina lo que creó y devuelve lo que cambió a su valor anterior. */
  const deshacerBloque = async (b: BloqueImportacionDto) => {
    if (!window.confirm(`¿Deshacer la importación «${b.nombre_archivo}»?

• ${b.creados} expediente(s) creado(s) pasarán a eliminados.
• ${b.modificados} expediente(s) modificado(s) volverán a los datos que tenían antes (si no se han vuelto a cambiar).

Los clientes que se crearan con ella no se borran. Las comisiones se recalculan solas.`)) return;
    try {
      const res = await fetch("/api/importaciones/deshacer", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: b.id }) });
      if (!res.ok) throw new Error(await mensajeDeError(res, "No se ha podido deshacer la importación"));
      const { data } = (await res.json()) as { data: { eliminados: number; revertidos: number; conservados: string[] } };
      setBloques((prev) => prev.filter((x) => x.id !== b.id));
      if (abierto === b.id) setAbierto(null);
      mostrar(`Importación deshecha: ${data.eliminados} expediente(s) eliminado(s), ${data.revertidos} dato(s) devuelto(s) a su valor anterior.${data.conservados.length > 0 ? ` ${data.conservados.length} no se tocaron porque se habían cambiado después.` : ""}`);
      router.refresh();
    } catch (e) {
      mostrar(e instanceof Error ? e.message : "Error al deshacer la importación", "error");
    }
  };

  const columnasRegistros: ColumnaTabla<Registro>[] = [
    ...columnasBaseRegistros,
    {
      clave: "corregir",
      etiqueta: "",
      valor: () => "",
      celda: (r) =>
        r.id_expediente ? (
          <button type="button" className="btn btn-secondary" onClick={() => abrirCorreccion(r)} style={{ padding: "6px 12px", fontSize: "0.8rem", whiteSpace: "nowrap" }}>
            ✏️ Corregir
          </button>
        ) : (
          <span style={{ fontSize: "0.8rem", color: "var(--text-muted)", fontStyle: "italic" }}>No editable</span>
        ),
    },
  ];

  const abrirCorreccion = (r: Registro) => {
    const e = r.expediente;
    setCorrigiendo(r);
    setNombre(e?.cliente?.nombre ?? r.cliente_nombre);
    setDni(e?.cliente?.dni ?? "");
    setMatricula(e?.matricula ?? r.matricula ?? "");
    setVin(e?.vin ?? r.bastidor ?? "");
    setMarca(e?.modelo?.marca_id ?? "");
    setModelo(e?.id_modelo ?? "");
    setTienda(e?.id_tienda ?? "");
    setTipoVenta(e?.id_tipo_de_venta ?? "");
    setEstado(e?.id_estado_vehiculo ?? "");
    setFExp(e?.fecha_expediente ?? "");
    setFAfect(e?.fecha_afectacion ?? "");
    setFMat(e?.fecha_matriculacion ?? "");
    setFEntrega(e?.fecha_entrega ?? "");
  };

  const guardarCorreccion = async () => {
    if (!corrigiendo) return;
    if (!nombre.trim()) {
      mostrar("El nombre del cliente es obligatorio", "error");
      return;
    }
    setGuardando(true);
    try {
      const e = corrigiendo.expediente;
      if (e?.cliente) {
        const res = await fetch("/api/clientes", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: e.cliente.id,
            dni: dni.trim() || null,
            nombre: nombre.trim(),
            fecha_de_nacimiento: e.cliente.fecha_de_nacimiento,
            tienda_id: tienda ? Number(tienda) : null,
            // Se conservan los contactos actuales del cliente
            emails: e.cliente.emails.map((x) => ({ email: x.email, tipo: x.tipo_email })),
            telefonos: e.cliente.telefonos.map((x) => ({ telefono: x.telefono, tipo: x.tipo_telefono })),
          }),
        });
        if (!res.ok) throw new Error(await mensajeDeError(res, "Error al guardar datos de cliente"));
      }
      if (corrigiendo.id_expediente) {
        const res = await fetch("/api/expedientes", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id_expediente: corrigiendo.id_expediente,
            expediente: {
              id_modelo: modelo || null,
              id_tipo_de_venta: tipoVenta || null,
              id_estado_vehiculo: estado || null,
              id_tienda: tienda || null,
              fecha_expediente: fExp || null,
              fecha_afectacion: fAfect || null,
              fecha_matriculacion: fMat || null,
              fecha_entrega: fEntrega || null,
              matricula: matricula.trim() || null,
              vin: vin.trim() || null,
            },
          }),
        });
        if (!res.ok) throw new Error(await mensajeDeError(res, "Error al guardar datos de expediente"));
      }
      mostrar("Expediente corregido con éxito");
      setCorrigiendo(null);
      await recargar();
      router.refresh();
    } catch (e) {
      mostrar(e instanceof Error ? e.message : "Error de red al guardar la corrección", "error");
    } finally {
      setGuardando(false);
    }
  };

  const q = busqueda.toLowerCase().trim();
  const filtrados = bloques
    .map((b) => ({
      ...b,
      coincidentes: b.registros.filter((r) => {
        const okBusqueda =
          q === "" || b.nombre_archivo.toLowerCase().includes(q) || r.cliente_nombre.toLowerCase().includes(q) || !!r.matricula?.toLowerCase().includes(q) || !!r.bastidor?.toLowerCase().includes(q);
        return okBusqueda && (accion === "all" || r.tipo_accion === accion);
      }),
    }))
    .filter((b) => (busqueda !== "" || accion !== "all" ? b.coincidentes.length > 0 : true));

  const modelosDisponibles = marca !== "" ? (modelosPorMarca[marca] ?? []) : [];
  const campo = (etiqueta: string, control: React.ReactNode, ancho2 = false) => (
    <div className="form-group" style={{ marginBottom: 0, ...(ancho2 ? { gridColumn: "span 2" } : {}) }}>
      <label className="form-label">{etiqueta}</label>
      {control}
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      <div>
        <h1 style={{ fontSize: "1.85rem", marginBottom: "8px" }}>Log de Importaciones</h1>
        <p style={{ color: "var(--text-secondary)" }}>Gestiona y supervisa el registro de todos los expedientes y clientes modificados o creados a través de cargas de archivos.</p>
      </div>

      <div className="glass-panel" style={{ padding: "20px", display: "flex", gap: "16px", alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: "250px" }}>
          <input type="text" className="form-input" placeholder="Buscar por cliente, matrícula, bastidor o nombre de archivo..." value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
        </div>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          {(
            [
              ["all", "Todos", undefined],
              ["creado", "Creados", "var(--info)"],
              ["modificado", "Modificados", "var(--success)"],
              ["omitido", "Omitidos", "var(--text-muted)"],
            ] as const
          ).map(([valor, etiqueta, color]) => (
            <button key={valor} onClick={() => setAccion(valor)} className={`btn ${accion === valor ? "btn-primary" : "btn-secondary"}`} style={{ padding: "8px 16px", fontSize: "0.9rem", ...(color ? { color: accion === valor ? "#fff" : color } : {}) }}>
              {etiqueta}
            </button>
          ))}
        </div>
      </div>

      {pendiente && (
        <div className="glass-panel" style={{ padding: "12px 16px", display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap", borderLeft: "4px solid var(--warning)" }}>
          <span>📥 Tienes una importación de «Completar datos» a medias: puedes retomarla donde la dejaste y cambiar lo que quieras antes de aplicarla.</span>
          <button type="button" className="btn btn-primary" onClick={() => setRetomando(true)}>
            Retomar importación
          </button>
        </div>
      )}
      {retomando && <ModalCompletarDatos alCerrar={() => setRetomando(false)} alAplicar={() => void recargar()} />}

      {cargando ? (
        <div className="glass-panel" style={{ padding: "40px", textAlign: "center" }}>
          <p style={{ color: "var(--text-secondary)" }}>Cargando historial de importaciones...</p>
        </div>
      ) : filtrados.length === 0 ? (
        <div className="glass-panel" style={{ padding: "40px", textAlign: "center" }}>
          <p style={{ color: "var(--text-muted)", fontStyle: "italic" }}>No se encontraron registros de importación coincidentes.</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {filtrados.map((b) => {
            const expandido = abierto === b.id;
            const fecha = new Date(b.fecha);
            const textoFecha = fecha.toLocaleDateString() + " " + fecha.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
            const esExcel = b.tipo_archivo === "Excel";
            return (
              <div key={b.id} className="glass-panel" style={{ overflow: "hidden", transition: "all 0.3s" }}>
                <div
                  style={{ padding: "20px 24px", display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", backgroundColor: expandido ? "rgba(255, 255, 255, 0.02)" : "transparent", borderBottom: expandido ? "1px solid var(--border-light)" : "none", flexWrap: "wrap", gap: "12px" }}
                  onClick={() => setAbierto(expandido ? null : b.id)}
                >
                  <div style={{ display: "flex", gap: "16px", alignItems: "center" }}>
                    <div style={{ width: "40px", height: "40px", borderRadius: "8px", backgroundColor: esExcel ? "rgba(16, 185, 129, 0.1)" : "rgba(59, 130, 246, 0.1)", color: esExcel ? "var(--success)" : "var(--info)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700 }}>
                      {esExcel ? "XLS" : "CSV"}
                    </div>
                    <div>
                      <h4 style={{ fontSize: "1.1rem", fontWeight: 600 }}>{b.nombre_archivo}</h4>
                      <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", marginTop: "2px" }}>
                        Importado por <span style={{ color: "var(--text-primary)" }}>{b.usuario_nombre || "Usuario"}</span> el {textoFecha}
                      </p>
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: "24px", alignItems: "center" }}>
                    <div style={{ display: "flex", gap: "12px", fontSize: "0.85rem" }}>
                      <span className="badge badge-tienda" style={{ color: "var(--info)" }}>{b.creados} Creados</span>
                      <span className="badge badge-vendedor" style={{ color: "var(--success)" }}>{b.modificados} Modificados</span>
                      <span className="badge" style={{ backgroundColor: "rgba(255,255,255,0.05)", color: "var(--text-muted)" }}>{b.omitidos} Omitidos</span>
                    </div>
                    <div style={{ display: "flex", gap: "8px" }}>
                      {(b.creados > 0 || b.modificados > 0) && (
                        <button
                          type="button"
                          className="btn btn-secondary"
                          onClick={(ev) => {
                            ev.stopPropagation();
                            void deshacerBloque(b);
                          }}
                          style={{ padding: "6px 10px", fontSize: "0.8rem", color: "var(--warning)", border: "1px solid rgba(234, 179, 8, 0.35)" }}
                          title="Elimina los expedientes que creó esta importación y devuelve los datos que cambió a su valor anterior"
                        >
                          ↩️ Deshacer importación
                        </button>
                      )}
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={(ev) => {
                          ev.stopPropagation();
                          void eliminarBloque(b.id);
                        }}
                        style={{ padding: "6px 10px", fontSize: "0.8rem", color: "var(--danger)", background: "rgba(239, 68, 68, 0.05)", border: "1px solid rgba(239, 68, 68, 0.1)" }}
                        title="Quita solo esta línea del historial; no deshace nada en los datos"
                      >
                        🗑️ Borrar del historial
                      </button>
                      <span style={{ transform: expandido ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s" }}>▼</span>
                    </div>
                  </div>
                </div>

                {expandido && (
                  <div style={{ padding: "24px" }}>
                    {b.coincidentes.length === 0 ? (
                      <p style={{ color: "var(--text-muted)", fontStyle: "italic", textAlign: "center" }}>No hay registros coincidentes con los filtros aplicados en este bloque.</p>
                    ) : (
                      <TablaDatos<Registro>
                        id="log-importacion"
                        columnas={columnasRegistros}
                        filas={b.coincidentes}
                        clave={(r) => r.id}
                        placeholder="Buscar por cliente, matrícula, bastidor, acción…"
                        textoExtra={(r) => r.cambios ?? ""}
                        pie={(fs) => ({ cliente: `${fs.length} registro${fs.length === 1 ? "" : "s"}` })}
                      />
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {corrigiendo && (
        <Modal
          titulo={
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>✏️ Corregir Datos de Expediente</div>
              <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem", marginTop: "4px", fontWeight: 400 }}>Corrige errores del expediente importado en bloque.</p>
            </div>
          }
          ancho="700px"
          tamanoTitulo="1.4rem"
          pie={
            <>
              <button type="button" className="btn btn-secondary" onClick={() => setCorrigiendo(null)} disabled={guardando}>
                Cancelar
              </button>
              <button type="button" className="btn btn-primary" onClick={() => void guardarCorreccion()} disabled={guardando}>
                {guardando ? "Guardando..." : "Guardar Correcciones"}
              </button>
            </>
          }
        >
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
            <h4 style={{ ...estiloSeccion, gridColumn: "span 2", margin: 0 }}>Datos del Cliente</h4>
            {campo("Nombre del Cliente", <input type="text" className="form-input" value={nombre} onChange={(e) => setNombre(e.target.value)} />)}
            {campo("DNI / NIF", <input type="text" className="form-input" value={dni} onChange={(e) => setDni(e.target.value)} />)}

            <h4 style={{ ...estiloSeccion, gridColumn: "span 2", margin: "8px 0 0" }}>Datos del Vehículo y Expediente</h4>
            {campo("Matrícula", <input type="text" className="form-input" value={matricula} onChange={(e) => setMatricula(e.target.value)} />)}
            {campo("Bastidor (VIN)", <input type="text" className="form-input" value={vin} onChange={(e) => setVin(e.target.value)} />)}
            {campo(
              "Marca",
              <select className="form-select" value={marca} onChange={(e) => { setMarca(e.target.value ? Number(e.target.value) : ""); setModelo(""); }}>
                <option value="">Selecciona Marca</option>
                {marcas.map((m) => (<option key={m.id} value={m.id}>{m.nombre}</option>))}
              </select>,
            )}
            {campo(
              "Modelo",
              <select className="form-select" value={modelo} onChange={(e) => setModelo(e.target.value ? Number(e.target.value) : "")} disabled={marca === ""}>
                <option value="">Selecciona Modelo</option>
                {modelosDisponibles.map((m) => (<option key={m.id} value={m.id}>{m.nombre}</option>))}
              </select>,
            )}
            {campo(
              "Tienda",
              <select className="form-select" value={tienda} onChange={(e) => setTienda(e.target.value ? Number(e.target.value) : "")}>
                <option value="">Selecciona Tienda</option>
                {tiendas.map((t) => (<option key={t.id} value={t.id}>{t.nombre} {t.ciudad ? `(${t.ciudad})` : ""}</option>))}
              </select>,
            )}
            {campo(
              "Tipo de Venta",
              <select className="form-select" value={tipoVenta} onChange={(e) => setTipoVenta(e.target.value ? Number(e.target.value) : "")}>
                <option value="">Selecciona Tipo</option>
                {tiposVenta.map((t) => (<option key={t.id} value={t.id}>{t.nombre}</option>))}
              </select>,
            )}
            {campo(
              "Estado de Vehículo",
              <select className="form-select" value={estado} onChange={(e) => setEstado(e.target.value ? Number(e.target.value) : "")}>
                <option value="">Selecciona Estado</option>
                {estadosVehiculo.map((ev) => (<option key={ev.id} value={ev.id}>{ev.nombre}</option>))}
              </select>,
            )}
            {campo("Fecha Expediente", <input type="date" className="form-input" value={fExp} onChange={(e) => setFExp(e.target.value)} />)}
            {campo("Fecha Afectación", <input type="date" className="form-input" value={fAfect} onChange={(e) => setFAfect(e.target.value)} />)}
            {campo("Fecha Matriculación", <input type="date" className="form-input" value={fMat} onChange={(e) => setFMat(e.target.value)} />)}
            {campo("Fecha Entrega", <input type="date" className="form-input" value={fEntrega} onChange={(e) => setFEntrega(e.target.value)} />, true)}
          </div>
        </Modal>
      )}
    </div>
  );
}
