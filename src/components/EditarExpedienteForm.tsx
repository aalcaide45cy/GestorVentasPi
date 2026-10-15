"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Modal from "@/components/Modal";
import type { ClienteDto, ExpedienteDto } from "@/lib/dto";
import { usePreferencia } from "@/lib/preferencias";
import ListaContactos, { contactoVacio, emailsDeCliente, telefonosDeCliente, type ContactoEdicion } from "./expedientes/ListaContactos";
import { mensajeDeError } from "./expedientes/comun";

interface Opcion {
  id: number;
  nombre: string;
}

interface Tienda extends Opcion {
  ciudad: string | null;
}

interface Props {
  expediente: ExpedienteDto;
  marcas: Opcion[];
  modelosPorMarca: Record<number, Opcion[]>;
  tiposVenta: Opcion[];
  estadosVehiculo: Opcion[];
  tiendas: Tienda[];
  usuarios: Opcion[];
}

const textoOVacio = (v: string) => v.trim() || null;
const cadena = (n: number | null | undefined) => (n ? String(n) : "");

/** «Editar Expediente»: cliente, vehículo y fechas. Los bloques de comisiones llegan en F4. */
export default function EditarExpedienteForm({
  expediente,
  marcas,
  modelosPorMarca,
  tiposVenta,
  estadosVehiculo,
  tiendas,
  usuarios,
}: Props) {
  const router = useRouter();
  const [cargando, setCargando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [saliendo, setSaliendo] = useState(false);
  const [destino, setDestino] = useState<string | null>(null);

  // Navegación anterior/siguiente según el orden visible en el listado
  const [idsVisibles] = usePreferencia("visible_expediente_ids");
  const { anteriorId, siguienteId } = useMemo(() => {
    try {
      const ids = idsVisibles ? (JSON.parse(idsVisibles) as number[]) : [];
      const i = ids.indexOf(expediente.id_expediente);
      if (i === -1) return { anteriorId: null, siguienteId: null };
      return { anteriorId: i > 0 ? ids[i - 1] : null, siguienteId: i < ids.length - 1 ? ids[i + 1] : null };
    } catch {
      return { anteriorId: null, siguienteId: null }; // sin orden guardado: sin navegación
    }
  }, [idsVisibles, expediente.id_expediente]);

  // Cliente
  const [asignado, setAsignado] = useState<ClienteDto | null>(expediente.cliente);
  const [dni, setDni] = useState(expediente.cliente?.dni ?? "");
  const [nombre, setNombre] = useState(expediente.cliente?.nombre ?? "");
  const [fechaNacimiento, setFechaNacimiento] = useState(expediente.cliente?.fecha_de_nacimiento ?? "");
  const [tiendaId, setTiendaId] = useState(cadena(expediente.id_tienda));
  const [emails, setEmails] = useState<ContactoEdicion[]>(emailsDeCliente(expediente.cliente));
  const [telefonos, setTelefonos] = useState<ContactoEdicion[]>(telefonosDeCliente(expediente.cliente));
  const [busqueda, setBusqueda] = useState("");
  const [resultados, setResultados] = useState<ClienteDto[]>([]);
  const [buscando, setBuscando] = useState(false);
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Vehículo y expediente
  const [marca, setMarca] = useState<number | "">(expediente.modelo?.marca_id ?? "");
  const [modelo, setModelo] = useState<number | "">(expediente.id_modelo ?? "");
  const [tipoVenta, setTipoVenta] = useState<number | "">(expediente.id_tipo_de_venta ?? "");
  const [estado, setEstado] = useState<number | "">(expediente.id_estado_vehiculo ?? "");
  const [vendedor, setVendedor] = useState(cadena(expediente.id_usuario));
  const [fExp, setFExp] = useState(expediente.fecha_expediente ?? "");
  const [fAfect, setFAfect] = useState(expediente.fecha_afectacion ?? "");
  const [fRci, setFRci] = useState(expediente.fecha_rci ?? "");
  const [fMat, setFMat] = useState(expediente.fecha_matriculacion ?? "");
  const [fFact, setFFact] = useState(expediente.fecha_facturacion ?? "");
  const [fEntrega, setFEntrega] = useState(expediente.fecha_entrega ?? "");
  const [matricula, setMatricula] = useState(expediente.matricula ?? "");
  const [vin, setVin] = useState(expediente.vin ?? "");
  const [cobradoOtraFecha, setCobradoOtraFecha] = useState(expediente.cobrado_otra_fecha);
  const [fCobrado, setFCobrado] = useState(expediente.fecha_cobrado ?? "");

  const modelosDisponibles = marca !== "" ? (modelosPorMarca[marca] ?? []) : [];

  const rellenos = (lista: ContactoEdicion[]) => lista.filter((c) => c.valor.trim() !== "");
  const mismosContactos = (actual: ContactoEdicion[], original: ContactoEdicion[]) =>
    actual.length === original.length && actual.every((c, i) => c.valor === original[i].valor && (c.tipo || "Principal") === (original[i].tipo || "Principal"));

  const clienteModificado = (): boolean => {
    if (!asignado) return false;
    if (dni !== (asignado.dni ?? "") || nombre !== (asignado.nombre ?? "") || fechaNacimiento !== (asignado.fecha_de_nacimiento ?? "")) return true;
    if (tiendaId !== cadena(asignado.tienda_id)) return true;
    return (
      !mismosContactos(rellenos(emails), asignado.emails.map((e) => ({ valor: e.email, tipo: e.tipo_email || "Principal" }))) ||
      !mismosContactos(rellenos(telefonos), asignado.telefonos.map((t) => ({ valor: t.telefono, tipo: t.tipo_telefono || "Principal" })))
    );
  };

  const hayCambios = (): boolean => {
    if (exito) return false;
    const c = expediente.cliente;
    if (dni !== (c?.dni ?? "") || nombre !== (c?.nombre ?? "") || fechaNacimiento !== (c?.fecha_de_nacimiento ?? "")) return true;
    if (tiendaId !== cadena(expediente.id_tienda) || vendedor !== cadena(expediente.id_usuario)) return true;
    if (asignado?.id !== c?.id) return true;
    if (!mismosContactos(rellenos(emails), (c?.emails ?? []).map((e) => ({ valor: e.email, tipo: e.tipo_email || "Principal" })))) return true;
    if (!mismosContactos(rellenos(telefonos), (c?.telefonos ?? []).map((t) => ({ valor: t.telefono, tipo: t.tipo_telefono || "Principal" })))) return true;
    return (
      marca !== (expediente.modelo?.marca_id ?? "") ||
      modelo !== (expediente.id_modelo ?? "") ||
      tipoVenta !== (expediente.id_tipo_de_venta ?? "") ||
      estado !== (expediente.id_estado_vehiculo ?? "") ||
      fExp !== (expediente.fecha_expediente ?? "") ||
      fAfect !== (expediente.fecha_afectacion ?? "") ||
      fRci !== (expediente.fecha_rci ?? "") ||
      fMat !== (expediente.fecha_matriculacion ?? "") ||
      fFact !== (expediente.fecha_facturacion ?? "") ||
      fEntrega !== (expediente.fecha_entrega ?? "") ||
      cobradoOtraFecha !== expediente.cobrado_otra_fecha ||
      fCobrado !== (expediente.fecha_cobrado ?? "") ||
      matricula !== (expediente.matricula ?? "") ||
      vin !== (expediente.vin ?? "")
    );
  };

  const mismoMesPedidoMatricula = (): boolean => {
    const mat = cobradoOtraFecha && fCobrado ? fCobrado : fMat;
    if (!fExp || !mat) return false;
    const [ea, em] = fExp.split("-");
    const [ma, mm] = mat.split("-");
    return ea === ma && em === mm;
  };

  /* ---- Cliente ---- */
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
    setTiendaId(cadena(c.tienda_id) || tiendaId);
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
    setEmails([contactoVacio()]);
    setTelefonos([contactoVacio()]);
  };

  const cuerpoCliente = (id: number) => ({
    id,
    dni: textoOVacio(dni),
    nombre: nombre.trim(),
    fecha_de_nacimiento: fechaNacimiento || null,
    tienda_id: tiendaId ? Number(tiendaId) : null,
    emails: rellenos(emails).map((e) => ({ email: e.valor.trim(), tipo: e.tipo })),
    telefonos: rellenos(telefonos).map((t) => ({ telefono: t.valor.trim(), tipo: t.tipo })),
  });

  const clienteActualizado = (c: ClienteDto): ClienteDto => ({
    ...c,
    dni: textoOVacio(dni),
    nombre: nombre.trim(),
    fecha_de_nacimiento: fechaNacimiento || null,
    tienda_id: tiendaId ? Number(tiendaId) : null,
    emails: rellenos(emails).map((e) => ({ email: e.valor.trim(), tipo_email: e.tipo })),
    telefonos: rellenos(telefonos).map((t) => ({ telefono: t.valor.trim(), tipo_telefono: t.tipo })),
  });

  const guardarCliente = async (): Promise<ClienteDto | null> => {
    if (!asignado || !clienteModificado()) return asignado;
    const res = await fetch("/api/clientes", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpoCliente(asignado.id)) });
    if (!res.ok) throw new Error(await mensajeDeError(res, "Error al actualizar los datos del cliente primero."));
    const nuevo = clienteActualizado(asignado);
    setAsignado(nuevo);
    return nuevo;
  };

  const guardarSoloCliente = async () => {
    setCargando(true);
    setError(null);
    try {
      await guardarCliente();
      setAviso("Datos del cliente actualizados correctamente.");
      setTimeout(() => setAviso(null), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ocurrió un error al guardar los cambios del cliente.");
    } finally {
      setCargando(false);
    }
  };

  /* ---- Guardado del expediente ---- */
  const guardar = async (): Promise<boolean> => {
    setError(null);
    try {
      const cliente = await guardarCliente();
      const cuerpo: Record<string, unknown> = {
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
        cobrado_otra_fecha: cobradoOtraFecha,
        fecha_cobrado: cobradoOtraFecha ? fCobrado || null : null,
      };
      // El vendedor solo se envía si ha cambiado: el servidor decide quién puede reasignarlo
      if (vendedor !== cadena(expediente.id_usuario)) cuerpo.id_usuario = vendedor ? Number(vendedor) : null;

      const res = await fetch("/api/expedientes", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id_expediente: expediente.id_expediente, id_cliente: cliente ? cliente.id : null, expediente: cuerpo }),
      });
      if (!res.ok) throw new Error(await mensajeDeError(res, "Error al actualizar el expediente."));
      setExito(true);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ocurrió un error inesperado.");
      return false;
    }
  };

  const enviar = async (ev?: FormEvent) => {
    ev?.preventDefault();
    setCargando(true);
    const ok = await guardar();
    setCargando(false);
    if (ok) {
      setTimeout(() => setExito(false), 3000);
      router.refresh();
    }
  };

  /* ---- Salida con cambios sin guardar ---- */
  const navegar = (url: string) => {
    if (hayCambios()) {
      setDestino(url);
      setSaliendo(true);
    } else if (url === "BACK") router.back();
    else router.push(url);
  };

  const irA = (url: string | null) => {
    if (url === "BACK") router.back();
    else router.push(url || "/dashboard/expedientes");
  };

  const guardarYSalir = async () => {
    setGuardando(true);
    const ok = await guardar();
    setGuardando(false);
    if (ok) {
      setSaliendo(false);
      setTimeout(() => irA(destino), 1500);
    }
  };

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
        ev.preventDefault();
        ev.stopPropagation();
        setDestino(ancla.pathname + ancla.search);
        setSaliendo(true);
      }
    };
    window.addEventListener("beforeunload", antesDeSalir);
    document.addEventListener("click", alPulsarEnlace, true);
    return () => {
      window.removeEventListener("beforeunload", antesDeSalir);
      document.removeEventListener("click", alPulsarEnlace, true);
    };
  }, []);

  const campo = (etiqueta: string, control: React.ReactNode) => (
    <div className="form-group">
      <label className="form-label">{etiqueta}</label>
      {control}
    </div>
  );
  const fecha = (valor: string, fijar: (v: string) => void) => <input type="date" className="form-input" value={valor} onChange={(e) => fijar(e.target.value)} />;
  const titulo = (color: string, icono: React.ReactNode, texto: string) => (
    <h2 style={{ fontSize: "1.25rem", marginBottom: "24px", color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "10px" }}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {icono}
      </svg>
      {texto}
    </h2>
  );
  const flecha = (puntos: string) => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points={puntos} />
    </svg>
  );
  const botonNavegacion: React.CSSProperties = { display: "flex", alignItems: "center", justifyContent: "center", width: "36px", height: "36px", padding: 0, borderRadius: "var(--radius-sm)" };
  const iconoGuardar = (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
      <polyline points="17 21 17 13 7 13 7 21" />
      <polyline points="7 3 7 8 15 8" />
    </svg>
  );
  const volver = (
    <button type="button" className="btn btn-secondary" onClick={() => navegar("/dashboard/expedientes")} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "8px 16px" }}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <line x1="19" y1="12" x2="5" y2="12" />
        <polyline points="12 19 5 12 12 5" />
      </svg>
      Volver a Expedientes
    </button>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      {exito && (
        <div
          style={{ position: "fixed", top: "24px", right: "24px", background: "rgba(16, 185, 129, 0.15)", backdropFilter: "blur(12px)", border: "1px solid rgba(16, 185, 129, 0.3)", color: "var(--success)", padding: "16px 24px", borderRadius: "var(--radius-md)", boxShadow: "0 8px 32px rgba(0, 0, 0, 0.3)", zIndex: 9999, display: "flex", alignItems: "center", gap: "12px" }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          <span style={{ fontWeight: 600 }}>¡Expediente guardado correctamente!</span>
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
        {volver}
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div style={{ display: "flex", gap: "6px" }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => anteriorId !== null && navegar(`/dashboard/expedientes/editar/${anteriorId}`)}
              disabled={anteriorId === null || cargando}
              style={botonNavegacion}
              title="Expediente anterior (encima)"
            >
              {flecha("15 18 9 12 15 6")}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => siguienteId !== null && navegar(`/dashboard/expedientes/editar/${siguienteId}`)}
              disabled={siguienteId === null || cargando}
              style={botonNavegacion}
              title="Expediente siguiente (debajo)"
            >
              {flecha("9 18 15 12 9 6")}
            </button>
          </div>
          <button type="button" className="btn btn-secondary" onClick={() => navegar("BACK")} disabled={cargando} style={{ height: "36px", display: "flex", alignItems: "center" }}>
            Cancelar
          </button>
          <button type="button" className="btn btn-primary" onClick={() => void enviar()} disabled={cargando} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            {cargando ? "Guardando..." : "Guardar Cambios"}
            {!cargando && iconoGuardar}
          </button>
        </div>
      </div>

      <form onSubmit={enviar} style={{ display: "flex", flexDirection: "column", gap: "32px" }}>
        {aviso && (
          <div className="glass-panel" style={{ padding: "16px 20px", backgroundColor: "rgba(16, 185, 129, 0.1)", borderLeft: "4px solid var(--success)", color: "var(--success)", fontWeight: 600, fontSize: "0.95rem", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <span>✅</span>
              <span>{aviso}</span>
            </div>
            <button type="button" onClick={() => setAviso(null)} style={{ background: "none", border: "none", color: "var(--success)", cursor: "pointer", fontSize: "1rem", fontWeight: "bold" }}>
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
          {/* DATOS DEL CLIENTE */}
          <div className="glass-panel" style={{ padding: "32px" }}>
            {titulo(
              "var(--primary)",
              <>
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </>,
              "Datos del Cliente",
            )}

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
                      onClick={() => void guardarSoloCliente()}
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

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "20px" }}>
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

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "32px", marginTop: "16px" }}>
              <ListaContactos clase="email" contactos={emails} alCambiar={setEmails} />
              <ListaContactos clase="telefono" contactos={telefonos} alCambiar={setTelefonos} />
            </div>
          </div>

          {/* DETALLES DEL VEHÍCULO Y EXPEDIENTE */}
          <div className="glass-panel" style={{ padding: "32px" }}>
            {titulo(
              "var(--secondary)",
              <>
                <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
                <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
              </>,
              "Detalles de la Venta y Vehículo",
            )}

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "20px" }}>
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
              {campo(
                "Vendedor Asignado",
                <select className="form-select" value={vendedor} onChange={(e) => setVendedor(e.target.value)}>
                  <option value="">Selecciona Vendedor</option>
                  {usuarios.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.nombre}
                    </option>
                  ))}
                </select>,
              )}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "20px", marginTop: "16px" }}>
              {campo("Matrícula", <input type="text" className="form-input" value={matricula} onChange={(e) => setMatricula(e.target.value)} placeholder="Ej. 1234BBB" />)}
              {campo("Número de Bastidor (VIN)", <input type="text" className="form-input" value={vin} onChange={(e) => setVin(e.target.value)} placeholder="Ej. WBA..." />)}
              {campo("Fecha Expediente", fecha(fExp, setFExp))}
              {campo("Fecha Afectación", fecha(fAfect, setFAfect))}
              {campo("Fecha RCI (Financiación)", fecha(fRci, setFRci))}
              {campo("Fecha Matriculación", fecha(fMat, setFMat))}
              {campo("Fecha Facturación (VO)", fecha(fFact, setFFact))}

              <div style={{ gridColumn: "1 / -1", display: "flex", flexDirection: "column", gap: "12px", background: "rgba(255, 255, 255, 0.02)", padding: "16px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-light)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <input
                    type="checkbox"
                    id="cobradoOtraFecha"
                    checked={cobradoOtraFecha}
                    onChange={(e) => {
                      setCobradoOtraFecha(e.target.checked);
                      if (!e.target.checked) setFCobrado("");
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
                    <input type="date" className="form-input" value={fCobrado} onChange={(e) => setFCobrado(e.target.value)} required />
                  </div>
                )}
              </div>

              {campo("Fecha Entrega", fecha(fEntrega, setFEntrega))}

              {mismoMesPedidoMatricula() && (
                <div
                  className="glass-panel"
                  style={{ gridColumn: "1 / -1", padding: "16px 20px", background: "rgba(16, 185, 129, 0.08)", borderLeft: "4px solid var(--success)", color: "var(--success)", fontSize: "0.9rem", fontWeight: 600, display: "flex", alignItems: "center", gap: "10px", marginTop: "8px" }}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                    <polyline points="22 4 12 14.01 9 11.01" />
                  </svg>
                  <span>✨ Pedido Realizado y Matriculado en el mismo mes</span>
                </div>
              )}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "16px", marginTop: "8px", flexWrap: "wrap" }}>
          {volver}
          <div style={{ display: "flex", gap: "16px" }}>
            <button type="button" className="btn btn-secondary" onClick={() => navegar("BACK")} disabled={cargando}>
              Cancelar
            </button>
            <button type="submit" className="btn btn-primary" disabled={cargando}>
              {cargando ? "Guardando..." : "Guardar Cambios"}
              {!cargando && iconoGuardar}
            </button>
          </div>
        </div>
      </form>

      {saliendo && (
        <Modal
          titulo="Cambios sin guardar"
          ancho="450px"
          tamanoTitulo="1.25rem"
          pie={undefined}
        >
          <p style={{ color: "var(--text-secondary)", fontSize: "0.95rem", lineHeight: "1.6", margin: 0, textAlign: "center" }}>
            Tienes cambios sin guardar en este expediente. ¿Qué deseas hacer antes de salir?
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <button type="button" className="btn btn-primary" onClick={() => void guardarYSalir()} disabled={guardando} style={{ width: "100%", justifyContent: "center" }}>
              {guardando ? "Guardando..." : "💾 Guardar y Salir"}
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => {
                setSaliendo(false);
                setExito(true);
                setTimeout(() => irA(destino), 100);
              }}
              disabled={guardando}
              style={{ width: "100%", justifyContent: "center", backgroundColor: "rgba(239, 68, 68, 0.1)", color: "var(--danger)", border: "1px solid rgba(239, 68, 68, 0.2)" }}
            >
              🚪 Salir sin Guardar
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                setSaliendo(false);
                setDestino(null);
              }}
              disabled={guardando}
              style={{ width: "100%", justifyContent: "center" }}
            >
              Cancelar
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
