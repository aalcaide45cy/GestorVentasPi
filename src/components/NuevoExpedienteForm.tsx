"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Modal from "@/components/Modal";
import { useToast } from "@/components/Toast";
import type { ClienteDto } from "@/lib/dto";
import { hoyIsoCliente } from "@/lib/date-utils";
import ListaContactos, { contactoVacio, emailsDeCliente, telefonosDeCliente, type ContactoEdicion } from "./expedientes/ListaContactos";
import { BotonLeerDni, BotonLeerPedido, ListaPendientes, ZonaDocumentosVarios, vincularAdjuntos } from "./documentos/BotonLeerDocumento";
import { mensajeDeError } from "./expedientes/comun";

interface Opcion {
  id: number;
  nombre: string;
  /** Tipos de pago: exige fecha RCI para matricular. */
  requiereRci?: boolean;
  /** Estados del vehículo: VN o VO. */
  clase?: string;
}

interface Tienda extends Opcion {
  ciudad: string | null;
}

interface Props {
  marcas: Opcion[];
  modelosPorMarca: Record<number, Opcion[]>;
  tiposVenta: Opcion[];
  estadosVehiculo: Opcion[];
  tiendas: Tienda[];
}

const textoOVacio = (v: string) => v.trim() || null;

/** «Crear Nuevo Expediente de Venta»: datos del cliente y del vehículo en una sola pantalla. */
export default function NuevoExpedienteForm({ marcas, modelosPorMarca, tiposVenta, estadosVehiculo, tiendas }: Props) {
  const router = useRouter();
  const { mostrar } = useToast();
  const tiendaInicial = tiendas.length === 1 ? String(tiendas[0].id) : "";
  const hoy = hoyIsoCliente();

  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [guardado, setGuardado] = useState(false);

  // Cliente
  const [dni, setDni] = useState("");
  const [nombre, setNombre] = useState("");
  const [fechaNacimiento, setFechaNacimiento] = useState("");
  const [tiendaId, setTiendaId] = useState(tiendaInicial);
  const [emails, setEmails] = useState<ContactoEdicion[]>([contactoVacio()]);
  const [telefonos, setTelefonos] = useState<ContactoEdicion[]>([contactoVacio()]);

  const [busqueda, setBusqueda] = useState("");
  const [resultados, setResultados] = useState<ClienteDto[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [asignado, setAsignado] = useState<ClienteDto | null>(null);
  const [duplicado, setDuplicado] = useState<ClienteDto | null>(null);
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Vehículo y expediente
  const [marca, setMarca] = useState<number | "">("");
  const [modelo, setModelo] = useState<number | "">("");
  const [tipoVenta, setTipoVenta] = useState<number | "">("");
  const [estado, setEstado] = useState<number | "">("");
  const [fExp, setFExp] = useState(hoy);
  const [fAfect, setFAfect] = useState("");
  const [fRci, setFRci] = useState("");
  const [fMat, setFMat] = useState("");
  const [fFact, setFFact] = useState("");
  const [fEntrega, setFEntrega] = useState("");
  const [matricula, setMatricula] = useState("");
  const [vin, setVin] = useState("");
  const [comentarios, setComentarios] = useState("");
  // Documentos leídos (DNI, pedido) y aún sin vincular: se vinculan al guardar el expediente
  const [pendientes, setPendientes] = useState<number[]>([]);
  const [nombresPend, setNombresPend] = useState<Record<number, string>>({});
  const [avisoLectura, setAvisoLectura] = useState<string | null>(null);

  const modelosDisponibles = marca !== "" ? (modelosPorMarca[marca] ?? []) : [];

  /* ---- Búsqueda de cliente existente ---- */
  const buscarCliente = (valor: string) => {
    setBusqueda(valor);
    if (temporizador.current) clearTimeout(temporizador.current);
    if (valor.trim().length < 2) {
      setResultados([]);
      return;
    }
    temporizador.current = setTimeout(async () => {
      setBuscando(true);
      try {
        const res = await fetch(`/api/clientes/buscar?q=${encodeURIComponent(valor)}`);
        if (res.ok) setResultados(((await res.json()) as { data?: ClienteDto[] }).data ?? []);
      } finally {
        setBuscando(false);
      }
    }, 250);
  };

  const elegirCliente = (c: ClienteDto) => {
    setAsignado(c);
    setDni(c.dni ?? "");
    setNombre(c.nombre ?? "");
    setFechaNacimiento(c.fecha_de_nacimiento ?? "");
    setTiendaId(c.tienda_id ? String(c.tienda_id) : "");
    setEmails(emailsDeCliente(c));
    setTelefonos(telefonosDeCliente(c));
    setBusqueda("");
    setResultados([]);
  };

  const desasignar = () => {
    setAsignado(null);
    setDni("");
    setNombre("");
    setFechaNacimiento("");
    setTiendaId(tiendaInicial);
    setEmails([contactoVacio()]);
    setTelefonos([contactoVacio()]);
  };

  const rellenos = (lista: ContactoEdicion[]) => lista.filter((c) => c.valor.trim() !== "");

  const clienteModificado = (): boolean => {
    if (!asignado) return false;
    if (dni !== (asignado.dni ?? "") || nombre !== (asignado.nombre ?? "") || fechaNacimiento !== (asignado.fecha_de_nacimiento ?? "")) return true;
    if (tiendaId !== (asignado.tienda_id ? String(asignado.tienda_id) : "")) return true;
    const mismos = (actual: ContactoEdicion[], original: ContactoEdicion[]) =>
      actual.length === original.length && actual.every((c, i) => c.valor === original[i].valor && (c.tipo || "Principal") === (original[i].tipo || "Principal"));
    return !mismos(rellenos(emails), asignado.emails.map((e) => ({ valor: e.email, tipo: e.tipo_email || "Principal" }))) ||
      !mismos(rellenos(telefonos), asignado.telefonos.map((t) => ({ valor: t.telefono, tipo: t.tipo_telefono || "Principal" })));
  };

  const cuerpoCliente = (id?: number) => ({
    ...(id ? { id } : {}),
    dni: textoOVacio(dni),
    nombre: nombre.trim(),
    fecha_de_nacimiento: fechaNacimiento || null,
    tienda_id: tiendaId ? Number(tiendaId) : null,
    emails: rellenos(emails).map((e) => ({ email: e.valor.trim(), tipo: e.tipo })),
    telefonos: rellenos(telefonos).map((t) => ({ telefono: t.valor.trim(), tipo: t.tipo })),
  });

  const guardarCambiosCliente = async () => {
    if (!asignado) return;
    setCargando(true);
    setError(null);
    try {
      const res = await fetch("/api/clientes", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cuerpoCliente(asignado.id)),
      });
      if (!res.ok) throw new Error(await mensajeDeError(res, "Error al actualizar los datos del cliente."));
      setAsignado({
        ...asignado,
        dni: textoOVacio(dni),
        nombre: nombre.trim(),
        fecha_de_nacimiento: fechaNacimiento || null,
        tienda_id: tiendaId ? Number(tiendaId) : null,
        emails: rellenos(emails).map((e) => ({ email: e.valor.trim(), tipo_email: e.tipo })),
        telefonos: rellenos(telefonos).map((t) => ({ telefono: t.valor.trim(), tipo_telefono: t.tipo })),
      });
      mostrar("Datos del cliente actualizados correctamente.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ocurrió un error al guardar los cambios del cliente.");
    } finally {
      setCargando(false);
    }
  };

  /* ---- Cambios sin guardar ---- */
  const hayCambios = () =>
    !guardado &&
    (dni !== "" || nombre !== "" || fechaNacimiento !== "" || tiendaId !== tiendaInicial || emails.some((e) => e.valor !== "") || telefonos.some((t) => t.valor !== "") ||
      marca !== "" || modelo !== "" || tipoVenta !== "" || estado !== "" || matricula !== "" || vin !== "" || fExp !== hoy ||
      fAfect !== "" || fRci !== "" || fMat !== "" || fFact !== "" || fEntrega !== "");

  const cambiosRef = useRef(hayCambios);
  useEffect(() => {
    cambiosRef.current = hayCambios;
  });
  useEffect(() => {
    const antesDeSalir = (ev: BeforeUnloadEvent) => {
      if (cambiosRef.current()) {
        ev.preventDefault();
        ev.returnValue = "";
      }
    };
    const alPulsarEnlace = (ev: MouseEvent) => {
      const ancla = (ev.target as HTMLElement).closest("a");
      if (ancla && ancla.href && ancla.host === window.location.host && cambiosRef.current()) {
        if (!window.confirm("Tienes cambios sin guardar en el expediente. ¿Estás seguro de que deseas salir sin guardar?")) {
          ev.preventDefault();
          ev.stopPropagation();
        }
      }
    };
    window.addEventListener("beforeunload", antesDeSalir);
    document.addEventListener("click", alPulsarEnlace, true);
    return () => {
      window.removeEventListener("beforeunload", antesDeSalir);
      document.removeEventListener("click", alPulsarEnlace, true);
    };
  }, []);

  /* ---- Guardado ---- */
  const guardar = async (cliente: ClienteDto | null, crearNuevo = false) => {
    const faltaRci = rciObligatoria();
    if (faltaRci) {
      setError(faltaRci);
      return;
    }
    setCargando(true);
    setError(null);
    try {
      let datosCliente: ReturnType<typeof cuerpoCliente> | null = null;
      if (cliente) {
        datosCliente = {
          ...cuerpoCliente(cliente.id),
          dni: cliente.dni || textoOVacio(dni),
          nombre: cliente.nombre || nombre.trim(),
        };
      } else if (nombre.trim() && !crearNuevo && asignado) {
        datosCliente = cuerpoCliente(asignado.id);
      } else if (nombre.trim()) {
        datosCliente = cuerpoCliente();
      }

      const res = await fetch("/api/expedientes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cliente: datosCliente,
          expediente: {
            id_modelo: modelo || null,
            id_tipo_de_venta: tipoVenta || null,
            id_estado_vehiculo: estado || null,
            id_tienda: tiendaId ? Number(tiendaId) : null,
            fecha_expediente: fExp || null,
            fecha_afectacion: fAfect || null,
            fecha_rci: fRci || null,
            fecha_matriculacion: fMat || null,
            fecha_facturacion: fFact || null,
            fecha_entrega: fEntrega || null,
            matricula: matricula || null,
            vin: vin || null,
            comentarios: comentarios.trim() || null,
          },
        }),
      });
      if (!res.ok) throw new Error(await mensajeDeError(res, "Error al guardar el expediente."));
      const creado = ((await res.json().catch(() => ({}))) as { data?: { id_expediente?: number; id_cliente?: number | null } }).data;
      if (creado?.id_expediente && pendientes.length > 0) {
        try {
          await vincularAdjuntos(pendientes, { idExpediente: creado.id_expediente, idCliente: creado.id_cliente ?? null });
        } catch (e) {
          mostrar(e instanceof Error ? e.message : "No se han podido guardar los documentos adjuntos.", "error");
        }
      }
      setGuardado(true);
      setTimeout(() => router.push("/dashboard/expedientes"), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al guardar.");
    } finally {
      setCargando(false);
    }
  };

  const enviar = async (ev: FormEvent) => {
    ev.preventDefault();
    setError(null);

    const tieneDatosCliente = dni.trim() !== "" || fechaNacimiento.trim() !== "" || rellenos(emails).length > 0 || rellenos(telefonos).length > 0;
    if (tieneDatosCliente && !nombre.trim()) {
      setError("El Nombre Completo del cliente es obligatorio si deseas registrar o asociar un cliente.");
      return;
    }

    if (nombre.trim() && !asignado) {
      setCargando(true);
      try {
        const res = await fetch("/api/clientes/verificar-existencia", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dni: textoOVacio(dni), nombre: nombre.trim() }),
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
        /* si falla la comprobación se continúa: la base de datos manda */
      }
    }
    await guardar(asignado);
  };

  if (guardado) {
    return (
      <div className="glass-panel" style={{ padding: "40px", textAlign: "center", borderLeft: "4px solid var(--success)" }}>
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--success)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: "16px" }}>
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
          <polyline points="22 4 12 14.01 9 11.01" />
        </svg>
        <h2 style={{ fontSize: "1.5rem", marginBottom: "8px" }}>¡Expediente Creado!</h2>
        <p style={{ color: "var(--text-secondary)" }}>El expediente y los datos del cliente se han guardado con éxito. Redirigiendo...</p>
      </div>
    );
  }

  /** Columnas (de 12) que ocupa cada campo y su etiqueta corta; la explicación larga va en el icono de ayuda. */
  const DISENO: Record<string, { cols: number; etiqueta?: string; ayuda?: string }> = {
    "DNI / NIE": { cols: 2 },
    "Nombre Completo *": { cols: 5, etiqueta: "Nombre completo *" },
    "Fecha de Nacimiento": { cols: 2, etiqueta: "F. nacimiento" },
    Tienda: { cols: 3 },
    Marca: { cols: 3 },
    Modelo: { cols: 3 },
    "Tipo de Venta": { cols: 2, etiqueta: "Tipo de venta" },
    "Estado de Vehículo": { cols: 2, etiqueta: "Estado" },
    "Vendedor Asignado": { cols: 2, etiqueta: "Vendedor" },
    "Matrícula": { cols: 2 },
    "Número de Bastidor (VIN)": { cols: 4, etiqueta: "Bastidor (VIN)" },
    "Fecha Expediente": { cols: 2, etiqueta: "F. expediente" },
    "Fecha Afectación": { cols: 2, etiqueta: "F. afectación" },
    "Fecha RCI (Financiación)": { cols: 2, etiqueta: "F. RCI", ayuda: "Fecha de contratación de la financiera. En crédito y preference es obligatoria antes de poder matricular o facturar." },
    "Fecha Matriculación": { cols: 2, etiqueta: "F. matriculación" },
    "Fecha Facturación": { cols: 2, etiqueta: "F. facturación", ayuda: "En un VN acompaña a la matriculación mientras no la cambies a mano; si la cambias, manda ella para comisionar. En crédito y preference exige antes la F. RCI." },
    "Fecha Entrega": { cols: 2, etiqueta: "F. entrega" },
  };
  const campo = (etiqueta: string, control: React.ReactNode) => {
    const d = DISENO[etiqueta] ?? { cols: 3 };
    return (
      <div className={`form-group c${d.cols}`} style={{ marginBottom: 0 }}>
        <label className="form-label" style={{ marginBottom: "4px" }}>
          {d.etiqueta ?? etiqueta}
          {d.ayuda && (
            <span title={d.ayuda} aria-label={d.ayuda} style={{ marginLeft: "6px", cursor: "help", color: "var(--text-muted)", fontWeight: 700 }}>
              ⓘ
            </span>
          )}
        </label>
        {control}
      </div>
    );
  };
  /** En un VN la facturación acompaña a la matriculación mientras esté vacía o igual a ella (si se cambia a mano, se respeta). */
  const cambiarMatriculacion = (v: string) => {
    const esVn = estadosVehiculo.find((x) => x.id === Number(estado))?.clase === "VN";
    if (esVn && (fFact === "" || fFact === fMat)) setFFact(v);
    setFMat(v);
  };
  const rciObligatoria = (): string | null => {
    const t = tiposVenta.find((x) => x.id === Number(tipoVenta));
    if (!fRci && t?.requiereRci && (fMat || fFact)) return `Los pagos «${t.nombre}» exigen la fecha RCI (contratación de la financiera) para poder ${fMat ? "matricular" : "facturar"}. Indica primero la Fecha RCI.`;
    return null;
  };
  const fecha = (valor: string, fijar: (v: string) => void) => <input type="date" className="form-input" value={valor} onChange={(e) => fijar(e.target.value)} />;
  const titulo = (color: string, icono: React.ReactNode, texto: string) => (
    <h2 style={{ fontSize: "1.05rem", marginBottom: "10px", color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "10px" }}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {icono}
      </svg>
      {texto}
    </h2>
  );

  return (
    <>
      <form onSubmit={enviar} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        {error && (
          <div className="glass-panel" style={{ padding: "16px", color: "var(--danger)", borderLeft: "4px solid var(--danger)", background: "rgba(239, 68, 68, 0.05)" }}>
            <strong style={{ display: "block", marginBottom: "4px" }}>Error:</strong>
            {error}
          </div>
        )}

        <div className="rejilla-propia" style={{ display: "grid", gridTemplateColumns: "1fr", gap: "16px" }}>
          {/* DATOS DEL CLIENTE */}
          <div className="glass-panel" style={{ padding: "16px 20px" }}>
            {titulo(
              "var(--primary)",
              <>
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </>,
              "Datos del Cliente",
            )}

            <div style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap", marginBottom: "14px" }}>
              <BotonLeerDni
                compacta
                disabled={cargando}
                alLeer={(r) => {
                  setPendientes((prev) => [...prev, ...r.adjuntos.map((a) => a.id)]);
                  setNombresPend((prev) => ({ ...prev, ...Object.fromEntries(r.adjuntos.map((a) => [a.id, a.nombre])) }));
                  mostrar(r.fotoId ? "DNI guardado y foto del cliente detectada." : "DNI guardado. No se ha podido detectar la foto del cliente.");
                }}
              />
              <ZonaDocumentosVarios
                disabled={cargando}
                alSubir={(docs) => {
                  setPendientes((prev) => [...prev, ...docs.map((d) => d.id)]);
                  setNombresPend((prev) => ({ ...prev, ...Object.fromEntries(docs.map((d) => [d.id, d.nombre])) }));
                }}
              />
              <div style={{ flexBasis: "100%", display: "flex", flexDirection: "column", gap: "8px" }}>
                <ListaPendientes
                  docs={pendientes.map((id) => ({ id, nombre: nombresPend[id] ?? `Documento ${id}` }))}
                  alQuitar={(id) => {
                    void fetch(`/api/adjuntos?id=${id}`, { method: "DELETE", credentials: "same-origin" });
                    setPendientes((prev) => prev.filter((x) => x !== id));
                  }}
                />
                <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                {pendientes.length > 0 ? `${pendientes.length} documento(s) adjuntos se guardarán con el expediente.` : "Arrastra el DNI (rellena los datos y guarda la foto del cliente), el pedido o documentos varios."}
                </span>
              </div>
            </div>
            {avisoLectura && <div style={{ color: "var(--warning)", fontSize: "0.85rem", marginBottom: "16px" }}>⚠️ {avisoLectura}</div>}

            {asignado ? (
              <div
                className="glass-panel"
                style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 20px", marginBottom: "24px", background: "rgba(6, 182, 212, 0.05)", borderLeft: "4px solid var(--secondary)", flexWrap: "wrap", gap: "12px" }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  <span style={{ fontSize: "1.5rem" }}>👤</span>
                  <div>
                    <div style={{ fontWeight: 700, color: "var(--text-primary)" }}>Cliente Asociado: {asignado.nombre}</div>
                    <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>DNI / NIE: {asignado.dni}</div>
                  </div>
                </div>
                <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
                  {clienteModificado() && (
                    <button
                      type="button"
                      className="btn"
                      onClick={guardarCambiosCliente}
                      disabled={cargando}
                      style={{ padding: "8px 16px", fontSize: "0.85rem", backgroundColor: "var(--success)", color: "white", border: "none", borderRadius: "var(--radius-sm)", cursor: "pointer", display: "flex", alignItems: "center", gap: "6px" }}
                    >
                      💾 Guardar Cambios de Cliente
                    </button>
                  )}
                  <button type="button" className="btn btn-secondary" onClick={desasignar} style={{ padding: "6px 12px", fontSize: "0.8rem", color: "var(--danger)" }}>
                    ❌ Desasignar Cliente
                  </button>
                </div>
              </div>
            ) : (
              <div className="form-group" style={{ position: "relative", marginBottom: "24px" }}>
                <label className="form-label">🔍 Buscar Cliente Existente (DNI o Nombre)</label>
                <input type="text" className="form-input" placeholder="Escribe DNI o Nombre... (Ej. Juan)" value={busqueda} onChange={(e) => buscarCliente(e.target.value)} />
                {buscando && <div style={{ position: "absolute", right: "16px", bottom: "12px", fontSize: "0.8rem", color: "var(--text-muted)" }}>Buscando...</div>}
                {resultados.length > 0 && (
                  <div
                    className="glass-panel"
                    style={{ position: "absolute", top: "100%", left: 0, right: 0, background: "var(--bg-surface)", border: "1px solid var(--border-light)", borderRadius: "var(--radius-sm)", boxShadow: "var(--shadow-lg)", zIndex: 99, maxHeight: "220px", overflowY: "auto", marginTop: "4px" }}
                  >
                    {resultados.map((c) => (
                      <div
                        key={c.id}
                        onClick={() => elegirCliente(c)}
                        className="glass-panel-interactive"
                        style={{ padding: "12px 16px", borderBottom: "1px solid var(--border-light)", borderRadius: 0, fontSize: "0.9rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}
                      >
                        <span style={{ fontWeight: 600 }}>{c.nombre}</span>
                        <span style={{ fontSize: "0.8rem", color: "var(--text-muted)", fontFamily: "monospace" }}>{c.dni}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="rejilla-ficha">
              {campo("DNI / NIE", <input type="text" className="form-input" value={dni} onChange={(e) => setDni(e.target.value)} placeholder="Ej. 12345678Z" />)}
              {campo("Nombre Completo *", <input type="text" className="form-input" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej. Juan Pérez Gómez" />)}
              {campo("Fecha de Nacimiento", fecha(fechaNacimiento, setFechaNacimiento))}
              {campo(
                "Tienda",
                <select className="form-select" value={tiendaId} onChange={(e) => setTiendaId(e.target.value)}>
                  <option value="">Selecciona Tienda</option>
                  {tiendas.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.nombre} {t.ciudad ? `(${t.ciudad})` : ""}
                    </option>
                  ))}
                </select>,
              )}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "20px", marginTop: "14px" }}>
              <ListaContactos clase="email" contactos={emails} alCambiar={setEmails} />
              <ListaContactos clase="telefono" contactos={telefonos} alCambiar={setTelefonos} />
            </div>
          </div>

          {/* DETALLES DE LA VENTA Y VEHÍCULO */}
          <div className="glass-panel" style={{ padding: "16px 20px" }}>
            {titulo(
              "var(--secondary)",
              <>
                <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
                <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
              </>,
              "Detalles de la Venta y Vehículo",
            )}

            <div style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap", marginBottom: "14px" }}>
              <BotonLeerPedido
                compacta
                disabled={cargando}
                alLeer={(r) => {
                  const d = r.datos;
                  if (d.vin) setVin(d.vin);
                  if (d.matricula) setMatricula(d.matricula);
                  if (d.fechaExpediente) setFExp(d.fechaExpediente);
                  if (d.fechaEntrega) setFEntrega(d.fechaEntrega);
                  if (d.fechaMatriculacion) setFMat(d.fechaMatriculacion);
                  if (d.idModelo) {
                    const marcaDe = Object.entries(modelosPorMarca).find(([, lista]) => lista.some((m) => m.id === d.idModelo));
                    if (marcaDe) {
                      setMarca(Number(marcaDe[0]));
                      setModelo(d.idModelo);
                    }
                  }
                  if (d.idTipoDeVenta) setTipoVenta(d.idTipoDeVenta);
                  if (d.dni && !dni) setDni(d.dni);
                  if (d.cliente && !nombre) setNombre(d.cliente);
                  if (d.telefono && rellenos(telefonos).length === 0) setTelefonos([{ valor: d.telefono, tipo: "Principal" }]);
                  if (d.email && rellenos(emails).length === 0) setEmails([{ valor: d.email, tipo: "Principal" }]);
                  setPendientes((prev) => [...prev, r.adjunto.id]);
                  setNombresPend((prev) => ({ ...prev, [r.adjunto.id]: r.adjunto.nombre }));
                  setAvisoLectura(d.avisos[0] ?? null);
                  mostrar("Pedido leído: revisa los datos antes de guardar.");
                }}
              />
              <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>Sube el pedido (PDF o foto) y se rellenan bastidor, matrícula, modelo, forma de pago y fechas.</span>
            </div>

            <div className="rejilla-ficha">
              {campo(
                "Marca",
                <select
                  className="form-select"
                  value={marca}
                  onChange={(e) => {
                    setMarca(e.target.value ? Number(e.target.value) : "");
                    setModelo("");
                  }}
                >
                  <option value="">Selecciona Marca</option>
                  {marcas.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.nombre}
                    </option>
                  ))}
                </select>,
              )}
              {campo(
                "Modelo",
                <select className="form-select" value={modelo} onChange={(e) => setModelo(e.target.value ? Number(e.target.value) : "")} disabled={!marca}>
                  <option value="">Selecciona Modelo</option>
                  {modelosDisponibles.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.nombre}
                    </option>
                  ))}
                </select>,
              )}
              {campo(
                "Tipo de Venta",
                <select className="form-select" value={tipoVenta} onChange={(e) => setTipoVenta(e.target.value ? Number(e.target.value) : "")}>
                  <option value="">Selecciona Tipo</option>
                  {tiposVenta.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.nombre}
                    </option>
                  ))}
                </select>,
              )}
              {campo(
                "Estado de Vehículo",
                <select className="form-select" value={estado} onChange={(e) => setEstado(e.target.value ? Number(e.target.value) : "")}>
                  <option value="">Selecciona Estado</option>
                  {estadosVehiculo.map((ev) => (
                    <option key={ev.id} value={ev.id}>
                      {ev.nombre}
                    </option>
                  ))}
                </select>,
              )}
              {campo("Matrícula", <input type="text" className="form-input" value={matricula} onChange={(e) => setMatricula(e.target.value)} placeholder="Ej. 1234BBB" />)}
              {campo("Número de Bastidor (VIN)", <input type="text" className="form-input" value={vin} onChange={(e) => setVin(e.target.value)} placeholder="Ej. WBA..." />)}
              <div style={{ gridColumn: "1 / -1" }} className="form-group">
                <label className="form-label">Comentarios del expediente</label>
                <textarea className="form-input" rows={3} maxLength={5000} value={comentarios} onChange={(e) => setComentarios(e.target.value)} placeholder="Notas internas sobre este expediente…" style={{ resize: "vertical", minHeight: "80px" }} />
              </div>
            </div>
          </div>

          {/* FECHAS */}
          <div className="glass-panel" style={{ padding: "16px 20px" }}>
            {titulo(
              "var(--warning)",
              <>
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </>,
              "Fechas",
            )}
            <div className="rejilla-ficha">
              {campo("Fecha Expediente", fecha(fExp, setFExp))}
              {campo("Fecha Afectación", fecha(fAfect, setFAfect))}
              {campo("Fecha RCI (Financiación)", fecha(fRci, setFRci))}
              {campo("Fecha Matriculación", fecha(fMat, cambiarMatriculacion))}
              {campo("Fecha Facturación", fecha(fFact, setFFact))}
              {campo("Fecha Entrega", fecha(fEntrega, setFEntrega))}
              <div style={{ gridColumn: "1 / -1", fontSize: "0.78rem", color: "var(--text-muted)" }}>En un VN la fecha de facturación acompaña a la de matriculación; si la cambias, manda ella para comisionar.</div>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: "16px", marginTop: "8px" }}>
          <button type="button" className="btn btn-secondary" onClick={() => router.back()} disabled={cargando}>
            Cancelar
          </button>
          <button type="submit" className="btn btn-primary" disabled={cargando}>
            {cargando ? "Guardando..." : "Crear Expediente"}
            {!cargando && (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                <polyline points="17 21 17 13 7 13 7 21" />
                <polyline points="7 3 7 8 15 8" />
              </svg>
            )}
          </button>
        </div>
      </form>

      {duplicado && (
        <Modal
          titulo={<span style={{ color: "var(--warning)" }}>⚠️ Cliente Ya Registrado</span>}
          ancho="500px"
          tamanoTitulo="1.4rem"
        >
          <p style={{ color: "var(--text-secondary)", fontSize: "0.95rem", lineHeight: "1.5", textAlign: "center", margin: 0 }}>
            Se ha encontrado un cliente existente en la base de datos que coincide con el DNI o Nombre ingresado:
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
              onClick={async () => {
                const existente = duplicado;
                setDuplicado(null);
                setAsignado(existente);
                setNombre(existente.nombre ?? "");
                setDni(existente.dni ?? "");
                await guardar(existente);
              }}
            >
              🤝 Usar Cliente Existente
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ width: "100%", justifyContent: "center" }}
              onClick={async () => {
                setDuplicado(null);
                await guardar(null, true);
              }}
            >
              🆕 Crear Uno Nuevo de Todos Modos
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
    </>
  );
}
