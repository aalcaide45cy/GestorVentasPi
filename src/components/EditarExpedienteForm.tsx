"use client";

import { borrarBorrador, leerBorrador, useGuardarBorrador } from "@/lib/borrador";
import ComisionadoExpediente from "@/components/expedientes/ComisionadoExpediente";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Modal from "@/components/Modal";
import { useToast } from "@/components/Toast";
import type { ClienteDto, ExpedienteDto } from "@/lib/dto";
import { usePreferencia } from "@/lib/preferencias";
import ListaContactos, { contactoVacio, emailsDeCliente, telefonosDeCliente, type ContactoEdicion } from "./expedientes/ListaContactos";
import { BotonLeerDni, BotonLeerPedido, vincularAdjuntos } from "./documentos/BotonLeerDocumento";
import VisorAdjuntos from "./documentos/VisorAdjuntos";
import NombreConFoto from "./documentos/FotoCliente";
import { mensajeDeError } from "./expedientes/comun";
import BloqueComisionamiento, { comisionInicial, type ComisionForm } from "./expedientes/BloqueComisionamiento";
import { eurosConSigno, nombreMes } from "@/lib/formato";

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

/** «Editar Expediente»: cliente, vehículo, fechas y comisionamiento. */
function FormularioEditarExpediente({
  expediente,
  marcas,
  modelosPorMarca,
  tiposVenta,
  estadosVehiculo,
  tiendas,
  usuarios,
}: Props) {
  const router = useRouter();
  const { mostrar } = useToast();
  // Lo que había sin guardar si se recargó la página (F5): se recupera al volver
  const claveBorrador = `expediente-${expediente.id_expediente}`;
  const [borrador] = useState(() => (typeof window === "undefined" ? null : leerBorrador(claveBorrador)));
  const ini = <T,>(k: string, valor: T): T => (borrador && k in borrador ? (borrador[k] as T) : valor);
  const [versionAdjuntos, setVersionAdjuntos] = useState(0);
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
  const [asignado, setAsignado] = useState<ClienteDto | null>(ini("asignado", expediente.cliente));
  // Foto del cliente (recortada de su DNI): se enseña al dejar el ratón sobre su nombre; se actualiza al leer un DNI nuevo
  const [fotoNueva, setFotoNueva] = useState<number | null>(null);
  const [dni, setDni] = useState(ini("dni", expediente.cliente?.dni ?? ""));
  const [nombre, setNombre] = useState(ini("nombre", expediente.cliente?.nombre ?? ""));
  const [fechaNacimiento, setFechaNacimiento] = useState(ini("fechaNacimiento", expediente.cliente?.fecha_de_nacimiento ?? ""));
  const [tiendaId, setTiendaId] = useState(ini("tiendaId", cadena(expediente.id_tienda)));
  const [emails, setEmails] = useState<ContactoEdicion[]>(ini("emails", emailsDeCliente(expediente.cliente)));
  const [telefonos, setTelefonos] = useState<ContactoEdicion[]>(ini("telefonos", telefonosDeCliente(expediente.cliente)));
  const [busqueda, setBusqueda] = useState("");
  const [resultados, setResultados] = useState<ClienteDto[]>([]);
  const [buscando, setBuscando] = useState(false);
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Vehículo y expediente
  const [marca, setMarca] = useState<number | "">(ini("marca", expediente.modelo?.marca_id ?? ""));
  const [modelo, setModelo] = useState<number | "">(ini("modelo", expediente.id_modelo ?? ""));
  const [tipoVenta, setTipoVenta] = useState<number | "">(ini("tipoVenta", expediente.id_tipo_de_venta ?? ""));
  const [estado, setEstado] = useState<number | "">(ini("estado", expediente.id_estado_vehiculo ?? ""));
  const [vendedor, setVendedor] = useState(ini("vendedor", cadena(expediente.id_usuario)));
  const [fExp, setFExp] = useState(ini("fExp", expediente.fecha_expediente ?? ""));
  const [fAfect, setFAfect] = useState(ini("fAfect", expediente.fecha_afectacion ?? ""));
  const [fRci, setFRci] = useState(ini("fRci", expediente.fecha_rci ?? ""));
  const [fMat, setFMat] = useState(ini("fMat", expediente.fecha_matriculacion ?? ""));
  const [fFact, setFFact] = useState(ini("fFact", expediente.fecha_facturacion ?? ""));
  const [fEntrega, setFEntrega] = useState(ini("fEntrega", expediente.fecha_entrega ?? ""));
  const [matricula, setMatricula] = useState(ini("matricula", expediente.matricula ?? ""));
  const [vin, setVin] = useState(ini("vin", expediente.vin ?? ""));
  const [comentarios, setComentarios] = useState(ini("comentarios", expediente.comentarios ?? ""));
  const [cobradoOtraFecha, setCobradoOtraFecha] = useState(ini("cobradoOtraFecha", expediente.cobrado_otra_fecha));
  const [fCobrado, setFCobrado] = useState(ini("fCobrado", expediente.fecha_cobrado ?? ""));

  const [com, setCom] = useState<ComisionForm>(ini("com", comisionInicial(expediente)));
  const comOriginal = useMemo(() => JSON.stringify(comisionInicial(expediente)), [expediente]);

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
      vin !== (expediente.vin ?? "") ||
      comentarios !== (expediente.comentarios ?? "") ||
      JSON.stringify(com) !== comOriginal
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

  /** Datos del cliente que viajan con el expediente en el mismo guardado (null si no hay cliente ni nada que crear). */
  const clienteParaGuardar = (): { error?: string; cliente: Record<string, unknown> | null } => {
    const hayDatos = dni.trim() !== "" || fechaNacimiento !== "" || rellenos(emails).length > 0 || rellenos(telefonos).length > 0;
    if (asignado) {
      if (nombre.trim() === "") return { error: "El nombre del cliente es obligatorio.", cliente: null };
      return { cliente: clienteModificado() ? cuerpoCliente(asignado.id) : null };
    }
    if (nombre.trim() === "") return hayDatos ? { error: "Para guardar los datos del cliente escribe al menos su nombre (o busca un cliente existente).", cliente: null } : { cliente: null };
    const { id: _sinId, ...nuevo } = cuerpoCliente(0);
    void _sinId;
    return { cliente: nuevo };
  };

  /* ---- Guardado del expediente ---- */
  const guardar = async (): Promise<boolean> => {
    setError(null);
    const faltaRci = rciObligatoria();
    if (faltaRci) {
      setError(faltaRci);
      return false;
    }
    const datosCliente = clienteParaGuardar();
    if (datosCliente.error) {
      setError(datosCliente.error);
      return false;
    }
    try {
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
        comentarios: comentarios.trim() || null,
        cobrado_otra_fecha: cobradoOtraFecha,
        fecha_cobrado: cobradoOtraFecha ? fCobrado || null : null,
        puntos: com.puntos,
        id_promocion: com.id_promocion,
        comision_coche_manual: com.comision_coche_manual,
        comision_financiacion_manual: com.comision_financiacion_manual,
        conceptos_especiales: com.conceptos.filter((c) => c.titulo.trim() !== ""),
      };
      // El vendedor solo se envía si ha cambiado: el servidor decide quién puede reasignarlo
      if (vendedor !== cadena(expediente.id_usuario)) cuerpo.id_usuario = vendedor ? Number(vendedor) : null;

      const res = await fetch("/api/expedientes", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        // Cliente y expediente viajan juntos y el servidor los guarda en una sola operación: o se guarda todo o no se guarda nada
        body: JSON.stringify({ id_expediente: expediente.id_expediente, id_cliente: asignado ? asignado.id : null, ...(datosCliente.cliente ? { cliente: datosCliente.cliente } : {}), expediente: cuerpo }),
      });
      if (!res.ok) throw new Error(await mensajeDeError(res, "Error al guardar."));
      const r = (await res.json().catch(() => ({}))) as {
        impactos?: { mes: string; netoAnterior: number; netoNuevo: number; diferencia: number }[];
        cliente?: { id: number; accion: "actualizado" | "creado" | "asociado_existente" } | null;
      };
      let avisoGuardado: string | null = null;
      if (r.cliente?.accion === "actualizado" && asignado) {
        setAsignado(clienteActualizado(asignado));
      } else if (r.cliente) {
        // Cliente nuevo (o ya existente con ese DNI): se carga tal como ha quedado en la base de datos
        const sigue = await fetch(`/api/expedientes?id=${expediente.id_expediente}`).then((x) => (x.ok ? (x.json() as Promise<{ data?: ExpedienteDto }>) : null)).catch(() => null);
        const c = sigue?.data?.cliente;
        if (c) {
          setAsignado(c);
          setDni(c.dni ?? "");
          setNombre(c.nombre ?? "");
          setFechaNacimiento(c.fecha_de_nacimiento ?? "");
          setEmails(emailsDeCliente(c));
          setTelefonos(telefonosDeCliente(c));
        }
        if (r.cliente.accion === "asociado_existente") avisoGuardado = "Ya existía un cliente con ese DNI: se ha asociado a este expediente (sus datos no se han cambiado).";
      }
      const impactos = r.impactos ?? [];
      if (impactos.length > 0) avisoGuardado = `Este cambio ha modificado meses ya cerrados: ${impactos.map((i) => `${nombreMes(i.mes)} ${eurosConSigno(i.diferencia)}`).join(", ")}. Se guardó la versión anterior.`;
      if (avisoGuardado) {
        setAviso(avisoGuardado);
        setTimeout(() => setAviso(null), 8000);
      }
      borrarBorrador(claveBorrador);
      setExito(true);
      return true;
    } catch (e) {
      setError(`No se ha guardado nada, ni el cliente ni el expediente. Motivo: ${e instanceof Error ? e.message : "error inesperado."}`);
      return false;
    }
  };

  useEffect(() => {
    if (error) window.scrollTo({ top: 0, behavior: "smooth" });
  }, [error]);

  const enviar = async (ev?: FormEvent) => {
    ev?.preventDefault();
    if (cargando || guardando) return;
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

  useGuardarBorrador(claveBorrador, () => ({ asignado, dni, nombre, fechaNacimiento, tiendaId, emails, telefonos, marca, modelo, tipoVenta, estado, vendedor, fExp, fAfect, fRci, fMat, fFact, fEntrega, matricula, vin, comentarios, cobradoOtraFecha, fCobrado, com }), hayCambios());
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
    // La facturación solo se comprueba si se toca ella, la RCI o el tipo de pago (los expedientes antiguos que ya incumplían la regla se pueden seguir editando)
    const factTocada = fFact !== (expediente.fecha_facturacion ?? "") || fRci !== (expediente.fecha_rci ?? "") || Number(tipoVenta) !== expediente.id_tipo_de_venta;
    if (!fRci && t?.requiereRci && (fMat || (fFact && factTocada))) return `Los pagos «${t.nombre}» exigen la fecha RCI (contratación de la financiera) para poder ${fMat ? "matricular" : "facturar"}. Indica primero la Fecha RCI.`;
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
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
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

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px", position: "sticky", top: 0, zIndex: 30, background: "var(--bg-app)", padding: "8px 0" }}>
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

      {borrador && (
        <div role="status" style={{ padding: "10px 14px", borderLeft: "4px solid var(--info)", background: "var(--bg-card)", borderRadius: "var(--radius-sm)", fontSize: "0.88rem", display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
          ♻️ Se han recuperado los cambios que tenías sin guardar (la página se recargó). Revísalos y guarda.
          <button type="button" className="btn btn-secondary" style={{ padding: "3px 10px", fontSize: "0.8rem" }} onClick={() => { borrarBorrador(claveBorrador); window.location.reload(); }}>
            Descartarlos y volver a lo guardado
          </button>
        </div>
      )}
      <form onSubmit={enviar} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
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

            {asignado ? (
              <div
                className="glass-panel"
                style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 20px", marginBottom: "24px", background: "rgba(6, 182, 212, 0.05)", borderLeft: "4px solid var(--secondary)", flexWrap: "wrap", gap: "12px" }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  <span style={{ fontSize: "1.5rem" }}>👤</span>
                  <div>
                    <div style={{ fontWeight: 700, color: "var(--text-primary)" }}>Cliente Asociado: <NombreConFoto fotoId={fotoNueva ?? asignado.foto_id}>{asignado.nombre}</NombreConFoto></div>
                    <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>DNI / NIE: {asignado.dni}</div>
                  </div>
                </div>
                <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
                  <button type="button" className="btn btn-secondary" onClick={desasignar} style={{ padding: "6px 12px", fontSize: "0.8rem", color: "var(--danger)" }}>
                    ❌ Desasignar Cliente
                  </button>
                </div>
              </div>
            ) : (
              <div className="form-group" style={{ position: "relative", marginBottom: "24px" }}>
                <label className="form-label">🔍 Buscar Cliente Existente (DNI o Nombre)</label>
                <input type="text" className="form-input" placeholder="Escribe DNI o Nombre... (Ej. Juan)" value={busqueda} onChange={(e) => buscarCliente(e.target.value)} onKeyDown={(e) => e.key === "Enter" && e.preventDefault()} />
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

            <div style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap", marginBottom: "14px" }}>
              <BotonLeerDni
                compacta
                disabled={cargando}
                alLeer={async (r) => {
                  try {
                    await vincularAdjuntos(r.adjuntos.map((a) => a.id), { idExpediente: expediente.id_expediente, idCliente: expediente.id_cliente });
                    setVersionAdjuntos((v) => v + 1);
                    if (r.fotoId) setFotoNueva(r.fotoId);
                  } catch (e) {
                    mostrar(e instanceof Error ? e.message : "No se ha podido adjuntar el DNI.", "error");
                  }
                  mostrar(r.fotoId ? "DNI guardado y foto del cliente detectada." : "DNI guardado. No se ha podido detectar la foto del cliente.");
                }}
              />
              <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>Arrastra el DNI para guardarlo y tomar la foto del cliente (los datos se escriben a mano).</span>
            </div>

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

          {/* DETALLES DEL VEHÍCULO Y EXPEDIENTE */}
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
                alLeer={async (r) => {
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
                  try {
                    await vincularAdjuntos([r.adjunto.id], { idExpediente: expediente.id_expediente, idCliente: expediente.id_cliente });
                    setVersionAdjuntos((v) => v + 1);
                  } catch (e) {
                    mostrar(e instanceof Error ? e.message : "No se ha podido adjuntar el pedido.", "error");
                  }
                  mostrar("Pedido leído: revisa los datos y pulsa «Guardar Cambios».");
                }}
              />
              <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>Sube el pedido para rellenar lo que reconozca (se guarda al pulsar «Guardar Cambios»).</span>
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
              {campo("Matrícula", <input type="text" className="form-input" value={matricula} onChange={(e) => setMatricula(e.target.value)} placeholder="Ej. 1234BBB" />)}
              {campo("Número de Bastidor (VIN)", <input type="text" className="form-input" value={vin} onChange={(e) => setVin(e.target.value)} placeholder="Ej. WBA..." />)}
            </div>
            <div className="form-group" style={{ marginTop: "16px", marginBottom: 0 }}>
              <label className="form-label">Comentarios del expediente</label>
              <textarea className="form-input" rows={3} maxLength={5000} value={comentarios} onChange={(e) => setComentarios(e.target.value)} placeholder="Notas internas sobre este expediente…" style={{ resize: "vertical", minHeight: "80px" }} />
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

              {estadosVehiculo.find((x) => x.id === Number(estado))?.clase !== "VO" && (
                <div style={{ display: "flex", alignItems: "center", gap: "16px", flexWrap: "wrap", background: "rgba(255, 255, 255, 0.02)", padding: "8px 14px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-light)", justifySelf: "start", gridColumn: "1 / -1" }}>
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
                  <div className="form-group" style={{ marginBottom: 0, display: "flex", alignItems: "center", gap: "8px" }}>
                    <label className="form-label" style={{ fontSize: "0.78rem", marginBottom: 0, whiteSpace: "nowrap" }}>Fecha de Cobrado</label>
                    <input type="date" className="form-input" value={fCobrado} onChange={(e) => setFCobrado(e.target.value)} required />
                  </div>
                )}
                </div>
              )}

              {rciObligatoria() && (
                <div role="alert" style={{ gridColumn: "1 / -1", padding: "8px 12px", borderLeft: "4px solid var(--danger)", background: "rgba(239, 68, 68, 0.08)", color: "var(--danger)", fontSize: "0.85rem", fontWeight: 600 }}>
                  ⚠️ {rciObligatoria()}
                </div>
              )}
              <div style={{ gridColumn: "1 / -1", fontSize: "0.78rem", color: "var(--text-muted)" }}>En un VN la fecha de facturación acompaña a la de matriculación; si la cambias, manda ella para comisionar.</div>

              {mismoMesPedidoMatricula() && (
                <div
                  className="glass-panel"
                  style={{ gridColumn: "1 / -1", padding: "10px 16px", background: "rgba(16, 185, 129, 0.08)", borderLeft: "4px solid var(--success)", color: "var(--success)", fontSize: "0.9rem", fontWeight: 600, display: "flex", alignItems: "center", gap: "10px", marginTop: "8px" }}
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
          {/* DOCUMENTOS DEL EXPEDIENTE */}
          <div className="glass-panel" style={{ padding: "16px 20px" }}>
            <VisorAdjuntos key={versionAdjuntos} idExpediente={expediente.id_expediente} titulo="📎 Documentos del expediente (DNI, pedido, PDF…)" />
          </div>
        </div>

        <ComisionadoExpediente idExpediente={expediente.id_expediente} />

        <BloqueComisionamiento
          valor={com}
          onChange={setCom}
          mesCierre={fFact ? fFact.slice(0, 7) : fMat ? fMat.slice(0, 7) : fExp ? fExp.slice(0, 7) : null}
          contexto={{
            id_expediente: expediente.id_expediente,
            id_usuario: vendedor ? Number(vendedor) : null,
            id_modelo: modelo || null,
            id_tipo_de_venta: tipoVenta || null,
            id_estado_vehiculo: estado || null,
            fecha_expediente: fExp || null,
            fecha_afectacion: fAfect || null,
            fecha_rci: fRci || null,
            fecha_matriculacion: fMat || null,
            fecha_facturacion: fFact || null,
            fecha_entrega: fEntrega || null,
            fecha_cobrado: cobradoOtraFecha ? fCobrado || null : null,
            cobrado_otra_fecha: cobradoOtraFecha,
          }}
        />

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
                borrarBorrador(claveBorrador);
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

/**
 * El borrador de lo que se estaba editando solo existe en el navegador, así que el formulario se pinta ya en el navegador (no en
 * el servidor): así lo recuperado y lo pintado coinciden y no hay desajustes al recargar con F5.
 */
export default function EditarExpedienteForm(props: Props) {
  const enNavegador = useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false,
  );
  if (!enNavegador) return <p style={{ color: "var(--text-secondary)" }}>Cargando…</p>;
  return <FormularioEditarExpediente {...props} />;
}
