"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Modal from "@/components/Modal";
import { useToast } from "@/components/Toast";
import { llamar, textoError } from "@/components/comisiones/api";
import type { MarcaDto, ModeloDto, TipoVentaDto } from "@/lib/dto";
import { formatDate } from "@/lib/date-utils";
import { CLAVE_VENTANA_SOLO_SI_NUEVO, permitirDuplicadosAhora, usePreferencia } from "@/lib/preferencias";
import { crearTodosLosPedidos } from "@/lib/crear-desde-pedido";
import { actualizarPedidoDeCola, type EleccionRapida, type ItemCola } from "@/lib/pedidos-cola";
import type { ResultadoPedido } from "@/lib/servicios/documentos";
import type { CoincidenciaCliente } from "@/lib/servicios/clientes";
import { vincularAdjuntos } from "./documentos/BotonLeerDocumento";
import VisorPedido from "./documentos/VisorPedido";

export type { EleccionRapida };
type MarcaConModelos = MarcaDto & { modelos: ModeloDto[] };

interface Props {
  item: ItemCola;
  marcas: MarcaConModelos[];
  tiposVenta: TipoVentaDto[];
  vendedorId: number;
  /** Posición del pedido en la cola y navegación entre pedidos. */
  posicion: number;
  total: number;
  alIr: (delta: -1 | 1) => void;
  alCerrar: () => void;
  alTerminar: (mensaje: string, idExpediente?: number) => void;
  /** Descarta el pedido: lo quita de la cola sin crear nada. */
  alDescartar: () => void;
}

type ClienteElegido = number | "nuevo" | "ninguno" | null;
type Dato = "dni" | "telefono" | "email" | "domicilio" | "poblacion" | "vin" | "fecha" | "entrega" | "matricula";

/**
 * Pedido leído en la cola: comprueba si el cliente ya existe y pregunta qué hacer (crearlo, asociar uno existente o elegir entre
 * varios); cada dato del pedido se puede aplicar o no, y crea el expediente con el modelo y la forma de pago.
 */
export default function PedidoRapidoModal({ item, marcas, tiposVenta, vendedorId, posicion, total, alIr, alCerrar, alTerminar, alDescartar }: Props) {
  const { mostrar } = useToast();
  const router = useRouter();
  const [verPdf, setVerPdf] = useState(false);
  const [releyendo, setReleyendo] = useState(false);
  const [masivo, setMasivo] = useState<{ hechos: number; total: number } | null>(null);
  const pedido = item.pedido;
  const eleccion = item.eleccion;
  const d = pedido.datos;
  const [coincidencias, setCoincidencias] = useState<CoincidenciaCliente[] | null>(null);
  const [cliente, setCliente] = useState<ClienteElegido>(null);
  const [modelo, setModelo] = useState<number | "">(d.idModelo ?? "");
  const [tipo, setTipo] = useState<number | "">(d.idTipoDeVenta ?? "");
  const [trabajando, setTrabajando] = useState(false);
  // «Ventana solo si falta marca o modelo»: si todo está claro, el expediente se crea sin enseñar la ventana
  const [soloSiNuevo] = usePreferencia(CLAVE_VENTANA_SOLO_SI_NUEVO);
  const automatico = soloSiNuevo === "true";
  const [intentoAuto, setIntentoAuto] = useState<"pendiente" | "hecho" | "descartado">("pendiente");
  const [falloCoincidencias, setFalloCoincidencias] = useState(false);

  // Marca y modelo del pedido que no están en la app: se proponen (editables) en una ventana antes de crearlos
  const sinModelo = !eleccion && d.idModelo === null && !!d.modeloTexto;
  // El servidor ya trae la marca y el modelo limpios del pedido (sin acabado, motor ni códigos)
  const sugerido = { marca: d.marcaPropuesta ?? "", modelo: d.modeloPropuesto ?? "" };
  // Nuevo (VN) o usado (VO): lo que reconoció la lectura, que se puede cambiar (o elegir si no se pudo reconocer)
  const [tipoVehiculo, setTipoVehiculo] = useState<"nuevo" | "usado" | null>(d.tipoPedido);
  const [crearNuevo, setCrearNuevo] = useState(sinModelo);
  const [confirmando, setConfirmando] = useState(false);
  const [descartando, setDescartando] = useState(false);
  const [marcaNueva, setMarcaNueva] = useState(sugerido.marca);
  const [modeloNuevo, setModeloNuevo] = useState(sugerido.modelo);
  const quitar = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().toUpperCase();
  const marcaExistente = marcas.find((m) => quitar(m.nombre) === quitar(marcaNueva));
  const modeloExistente = marcaExistente?.modelos.find((x) => quitar(x.nombre_modelo) === quitar(modeloNuevo));
  const datosNuevoOk = marcaNueva.trim() !== "" && modeloNuevo.trim() !== "";
  // Crear marca y modelo nuevos se puede elegir siempre (también si el pedido no dijo cuál es el modelo): se escriben a mano
  const usaNuevo = !eleccion && crearNuevo;

  const valores: Record<Dato, string | null> = {
    dni: d.dni,
    telefono: d.telefono,
    email: d.email,
    domicilio: d.domicilio,
    poblacion: [d.codigoPostal, d.poblacion].filter(Boolean).join(" ") || null,
    vin: d.vin,
    fecha: d.fechaExpediente,
    entrega: d.fechaEntrega,
    matricula: d.matricula,
  };
  const etiquetas: Record<Dato, string> = { dni: "DNI / NIE", telefono: "Teléfono", email: "Email", domicilio: "Domicilio", poblacion: "Población", vin: "Bastidor", fecha: "Fecha del pedido", entrega: "Fecha de entrega", matricula: "Matrícula" };
  const grupos: { titulo: string; campos: Dato[] }[] = [
    { titulo: "Datos del cliente", campos: ["dni", "telefono", "email", "domicilio", "poblacion"] },
    { titulo: "Datos del expediente", campos: ["fecha", "entrega", "vin", "matricula"] },
  ];
  const [usar, setUsar] = useState<Record<Dato, boolean>>(() => Object.fromEntries((Object.keys(valores) as Dato[]).map((k) => [k, !!valores[k]])) as Record<Dato, boolean>);
  const activo = (k: Dato) => usar[k] && !!valores[k];

  useEffect(() => {
    let vivo = true;
    llamar<CoincidenciaCliente[]>("/api/clientes/coincidencias", { method: "POST", cuerpo: { dni: d.dni, nombre: d.cliente } })
      .then((r) => {
        if (!vivo) return;
        setCoincidencias(r.data);
        // Un único cliente con el mismo DNI: se propone asociarlo directamente
        if (r.data.length === 1 && r.data[0].porDni) setCliente(r.data[0].id);
        else if (r.data.length === 0) setCliente(d.cliente ? "nuevo" : "ninguno");
      })
      .catch((e: unknown) => {
        if (!vivo) return;
        mostrar(textoError(e), "error");
        setFalloCoincidencias(true);
        setCoincidencias([]);
        setCliente(d.cliente ? "nuevo" : "ninguno");
      });
    return () => {
      vivo = false;
    };
  }, [d.dni, d.cliente, mostrar]);

  const modelosPlanos = marcas.flatMap((m) => m.modelos.map((x) => ({ id: x.id_modelo, texto: `${m.nombre} ${x.nombre_modelo}` })));
  const idModeloFinal = eleccion ? eleccion.idModelo : modelo === "" ? null : modelo;
  const tipoFinal = eleccion ? eleccion.tipo.id_tipo_de_venta : tipo === "" ? null : tipo;
  const falta = !eleccion && tipoFinal === null;
  const puedeCrear = cliente !== null && !falta && !trabajando && (!usaNuevo || datosNuevoOk);
  // Pedido de un vehículo de ocasión vendido: el expediente es de usados
  const estadoNombre = eleccion?.estadoNombre ?? (tipoVehiculo === "usado" ? "usado" : undefined);

  // Crea de una vez todos los pedidos de la cola que no ofrecen duda ni están duplicados (aunque «permitir duplicados» esté apagado)
  const crearTodos = async () => {
    if (!window.confirm(`Se van a crear de una vez los expedientes de los ${total} pedidos de la cola que no tengan dudas (modelo y pago reconocidos, cliente claro y sin duplicar). Los demás se quedan en la cola. ¿Continuar?`)) return;
    setMasivo({ hechos: 0, total });
    try {
      const r = await crearTodosLosPedidos(vendedorId, (hechos, tot) => setMasivo({ hechos, total: tot }));
      const resumen = `${r.creados} expediente${r.creados === 1 ? "" : "s"} creado${r.creados === 1 ? "" : "s"}${r.omitidos.length > 0 ? ` y ${r.omitidos.length} sin crear (se quedan en la cola): ${r.omitidos.slice(0, 3).map((o) => `${o.nombre} (${o.motivo})`).join("; ")}${r.omitidos.length > 3 ? "…" : ""}` : ""}.`;
      mostrar(resumen, r.creados === 0 ? "error" : undefined);
      router.refresh();
      alCerrar();
    } catch (e) {
      mostrar(textoError(e), "error");
    } finally {
      setMasivo(null);
    }
  };

  /** Vuelve a leer el PDF de este pedido con el lector actual; la ventana se rehace con los datos nuevos. */
  const releer = async () => {
    setReleyendo(true);
    try {
      const { data } = await llamar<ResultadoPedido>("/api/documentos/releer", { method: "POST", cuerpo: { idAdjunto: pedido.adjunto.id, duplicados: permitirDuplicadosAhora() } });
      actualizarPedidoDeCola(item.id, data);
      mostrar("Pedido leído otra vez con el lector actual: revisa los datos.");
    } catch (e) {
      mostrar(textoError(e), "error");
    } finally {
      setReleyendo(false);
    }
  };

  const crear = async () => {
    if (cliente === null || tipoFinal === null) return;
    setConfirmando(false);
    setTrabajando(true);
    try {
      // Justo antes de crear se vuelve a mirar si ya existe (otro pedido de la cola pudo crearlo hace un momento): nunca se duplica
      if (!permitirDuplicadosAhora()) {
        const { data: yaHay } = await llamar<{ idExpediente: number; motivo: string }[]>("/api/documentos/similares", {
          method: "POST",
          cuerpo: { vin: d.vin, matricula: d.matricula, dni: d.dni, cliente: d.cliente, fechaExpediente: d.fechaExpediente, idModelo: idModeloFinal },
        }).catch(() => ({ data: [] as { idExpediente: number; motivo: string }[] }));
        if (yaHay.length > 0) {
          mostrar(`No se ha creado: ya existe el expediente nº ${yaHay[0].idExpediente} (${yaHay[0].motivo}). Ábrelo desde Expedientes si quieres completarlo.`, "error");
          setTrabajando(false);
          return;
        }
      }
      let idModeloCreado: number | null = null;
      if (usaNuevo) {
        const { data } = await llamar<{ id_modelo: number }>("/api/documentos/crear-modelo", {
          method: "POST",
          cuerpo: { marca: marcaNueva.trim(), modelo: modeloNuevo.trim(), texto: d.modeloTexto ?? undefined },
        });
        idModeloCreado = data.id_modelo;
      }
      let idCliente: number | null = null;
      if (cliente === "nuevo") {
        // La tienda es la predeterminada del usuario (la asigna el servidor)
        const { data } = await llamar<{ id: number }>("/api/clientes", {
          method: "POST",
          cuerpo: {
            nombre: d.cliente,
            dni: activo("dni") ? d.dni : null,
            domicilio: activo("domicilio") ? d.domicilio : null,
            poblacion: activo("poblacion") ? d.poblacion : null,
            codigo_postal: activo("poblacion") ? d.codigoPostal : null,
            fecha_de_nacimiento: item.dni?.fechaNacimiento ?? undefined,
            emails: activo("email") && d.email ? [{ email: d.email, tipo: "Principal" }] : [],
            telefonos: activo("telefono") && d.telefono ? [{ telefono: d.telefono, tipo: "Principal" }] : [],
          },
        });
        idCliente = data.id;
      } else if (typeof cliente === "number") {
        idCliente = cliente;
      }
      const { data: creado } = await llamar<{ id_expediente: number }>("/api/expedientes", {
        method: "POST",
        cuerpo: {
          expediente: {
            id_modelo: idModeloCreado ?? idModeloFinal,
            id_tipo_de_venta: tipoFinal,
            estado_nombre: estadoNombre,
            id_usuario: vendedorId,
            vin: activo("vin") ? d.vin : undefined,
            matricula: activo("matricula") ? d.matricula : undefined,
            fecha_expediente: activo("fecha") ? d.fechaExpediente : undefined,
            fecha_entrega: activo("entrega") ? d.fechaEntrega : undefined,
          },
        },
      });
      if (idCliente) await llamar("/api/expedientes", { method: "PUT", cuerpo: { id_expediente: creado.id_expediente, id_cliente: idCliente, expediente: {} } }).catch(() => undefined);
      // Si el modelo no se había reconocido y el usuario lo ha elegido, la app lo aprende para la próxima vez
      if (!eleccion && !usaNuevo && d.idModelo === null && d.modeloTexto && idModeloFinal) {
        await llamar("/api/documentos/aprender-modelo", { method: "POST", cuerpo: { texto: d.modeloTexto, id_modelo: idModeloFinal } }).catch(() => undefined);
      }
      // El DNI soltado junto con el pedido (si lo hay) se une al mismo expediente y cliente; su foto pasa a ser la del cliente
      await vincularAdjuntos([pedido.adjunto.id, ...(item.dni?.adjuntos ?? [])], { idExpediente: creado.id_expediente, idCliente });
      const modeloTexto = eleccion ? eleccion.nombreModelo : usaNuevo ? `${marcaNueva.trim()} ${modeloNuevo.trim()}` : (modelosPlanos.find((m) => m.id === (idModeloCreado ?? idModeloFinal))?.texto ?? "");
      const tipoTexto = eleccion ? eleccion.tipo.nombre_tipo_venta : (tiposVenta.find((t) => t.id_tipo_de_venta === tipoFinal)?.nombre_tipo_venta ?? "");
      const resumen = [modeloTexto, tipoTexto].filter(Boolean).join(" · ");
      alTerminar(
        `${cliente === "nuevo" ? `Expediente creado con el cliente nuevo ${d.cliente}` : idCliente ? "Expediente creado y asociado al cliente" : "Expediente creado sin cliente"}${resumen ? ` (${resumen})` : ""}.`,
        creado.id_expediente,
      );
    } catch (e) {
      mostrar(textoError(e), "error");
      setTrabajando(false);
    }
  };

  // Modo automático: solo si no hay nada que decidir. Con cualquier duda se enseña la ventana de siempre.
  const sinDuda =
    (!!eleccion || d.idModelo !== null) && // marca y modelo ya existen
    tipoFinal !== null && // forma de pago reconocida
    (pedido.similares ?? []).length === 0 && // no parece duplicado
    !falloCoincidencias &&
    coincidencias !== null &&
    (coincidencias.length === 0 ? !!d.cliente && cliente === "nuevo" : coincidencias.length === 1 && coincidencias[0].porDni && typeof cliente === "number"); // cliente claro
  useEffect(() => {
    if (!automatico || intentoAuto !== "pendiente" || coincidencias === null || cliente === null) return;
    if (sinDuda && !trabajando) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIntentoAuto("hecho");
      void crear();
    } else {
      setIntentoAuto("descartado");
    }
    // Se decide una sola vez, cuando ya se sabe quién es el cliente
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [automatico, intentoAuto, coincidencias, cliente]);
  // Mientras se crea solo, no se enseña la ventana (si algo falla, aparece para poder corregirlo)
  const ocultar = automatico && (intentoAuto === "pendiente" || (intentoAuto === "hecho" && trabajando));

  const opcion = (valor: ClienteElegido, titulo: string, detalle?: string) => (
    <label key={String(valor)} style={{ display: "flex", gap: "10px", alignItems: "flex-start", padding: "10px 12px", borderRadius: "var(--radius-sm)", cursor: "pointer", border: `1px solid ${cliente === valor ? "var(--primary)" : "var(--border-light)"}`, background: cliente === valor ? "var(--bg-surface-hover)" : "transparent" }}>
      <input type="radio" name="cliente-pedido" checked={cliente === valor} onChange={() => setCliente(valor)} style={{ marginTop: "3px", accentColor: "var(--primary)" }} />
      <span style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
        <strong style={{ fontSize: "0.9rem" }}>{titulo}</strong>
        {detalle && <span style={{ fontSize: "0.78rem", color: "var(--text-secondary)" }}>{detalle}</span>}
      </span>
    </label>
  );

  const textoDato = (k: Dato) => (valores[k] ? (k === "fecha" || k === "entrega" ? formatDate(valores[k] as string) : (valores[k] as string)) : null);

  if (ocultar) return null;

  if (descartando) {
    return (
      <Modal
        titulo="🗑️ ¿Descartar este pedido?"
        ancho="480px"
        peligro
        pie={
          <>
            <button type="button" className="btn btn-secondary" data-tecla="escape" onClick={() => setDescartando(false)}>
              Volver
            </button>
            <button type="button" className="btn btn-primary" onClick={alDescartar} style={{ backgroundColor: "var(--danger)", borderColor: "var(--danger)" }}>
              Sí, descartar
            </button>
          </>
        }
      >
        <div style={{ fontSize: "0.9rem" }}>
          El pedido <strong>{item.nombre}</strong> se quita de la cola y no se crea ningún expediente. El fichero queda guardado como documento sin asignar.
        </div>
      </Modal>
    );
  }

  if (confirmando) {
    return (
      <Modal
        titulo="🚗 Marca y modelo nuevos"
        ancho="520px"
        pie={
          <>
            <button type="button" className="btn btn-secondary" onClick={() => setConfirmando(false)}>
              Volver
            </button>
            <button type="button" className="btn btn-primary" onClick={() => void crear()} disabled={!datosNuevoOk}>
              Crear y seguir
            </button>
          </>
        }
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          <div style={{ fontSize: "0.9rem" }}>
            {d.modeloTexto ? (
              <>
                El pedido dice <strong>«{d.modeloTexto}»</strong> y eso no está en tus catálogos. Revisa cómo se va a llamar antes de crearlo:
              </>
            ) : (
              "Escribe la marca y el modelo que se van a crear (si ya existen, se usan los que hay):"
            )}
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Marca</label>
            <input className="form-input" value={marcaNueva} onChange={(e) => setMarcaNueva(e.target.value)} list="marcas-existentes" autoFocus />
            <datalist id="marcas-existentes">
              {marcas.map((m) => (
                <option key={m.id_marca} value={m.nombre} />
              ))}
            </datalist>
            <span style={{ fontSize: "0.78rem", color: "var(--text-secondary)" }}>{marcaExistente ? `La marca ${marcaExistente.nombre} ya existe: se usará esa.` : "Marca nueva: se creará."}</span>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Modelo</label>
            <input className="form-input" value={modeloNuevo} onChange={(e) => setModeloNuevo(e.target.value)} />
            <span style={{ fontSize: "0.78rem", color: "var(--text-secondary)" }}>{modeloExistente ? "Ese modelo ya existe en esa marca: se usará." : "Modelo nuevo: se creará."}</span>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      titulo={
        <span style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
          📄 Pedido leído
          {total > 1 && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "0.85rem", fontWeight: 500, color: "var(--text-secondary)" }}>
              <button type="button" className="btn btn-secondary" style={{ padding: "2px 8px" }} disabled={posicion <= 1 || trabajando} onClick={() => alIr(-1)} title="Pedido anterior de la cola">
                ‹
              </button>
              {posicion} de {total}
              <button type="button" className="btn btn-secondary" style={{ padding: "2px 8px" }} disabled={posicion >= total || trabajando} onClick={() => alIr(1)} title="Pedido siguiente de la cola">
                ›
              </button>
            </span>
          )}
        </span>
      }
      ancho={verPdf ? "1500px" : "700px"}
      pie={
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "28px", flexWrap: "wrap", width: "100%" }}>
          {/* Izquierda y aparte: lo que borra el pedido de la cola */}
          <button type="button" className="btn btn-secondary" style={{ color: "var(--danger)", borderColor: "var(--danger)" }} onClick={() => setDescartando(true)} disabled={trabajando} title="Descarta este pedido: se quita de la cola sin crear nada">
            🗑 Descartar este pedido
          </button>
          <div style={{ display: "flex", gap: "20px", alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
          {/* Mirar y salir */}
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          <button type="button" className="btn btn-secondary" onClick={() => setVerPdf((v) => !v)} title="Muestra el PDF del pedido al lado de los datos para decidir qué aplicar mirando el original">
            {verPdf ? "🙈 Ocultar el PDF" : "👁 Ver el PDF"}
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => void releer()} disabled={releyendo || trabajando} title="Vuelve a leer el PDF de este pedido con el lector actual (por ejemplo, si no sacó el DNI, el teléfono o el modelo) y rehace esta ventana con los datos nuevos">
            {releyendo ? "🔄 Releyendo…" : "🔄 Releer"}
          </button>
          <button type="button" className="btn btn-secondary" data-tecla="escape" onClick={alCerrar} disabled={trabajando} title="Cierra la ventana: el pedido se queda en la cola de pedidos para retomarlo después">
            ↩ Cerrar (queda en la cola)
          </button>
          </div>
          {/* Crear */}
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", paddingLeft: "20px", borderLeft: "1px solid var(--border-light)" }}>
          {total > 1 && (
            <button type="button" className="btn btn-secondary" onClick={() => void crearTodos()} disabled={trabajando || masivo !== null} title="Crea de una vez todos los pedidos de la cola que no tengan dudas y no estén duplicados; los demás se quedan en la cola">
              {masivo ? `Creando ${masivo.hechos + 1} de ${masivo.total}…` : `Crear todos los demás (${total}) sin duplicar`}
            </button>
          )}
          <button type="button" className="btn btn-primary" data-tecla="enter" onClick={() => (usaNuevo ? setConfirmando(true) : void crear())} disabled={!puedeCrear || masivo !== null}>
            {trabajando ? "Creando…" : "Crear expediente"}
          </button>
          </div>
          </div>
        </div>
      }
    >
      <div style={{ display: "flex", gap: "20px", alignItems: "flex-start" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: "14px", flex: "1 1 0", minWidth: 0 }}>
        <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
          Fichero: {item.nombre}
          {d.numeroPedido ? ` · Pedido ${d.numeroPedido}` : ""}
          {d.tipoPedido === "usado" ? " · 🚗 Vehículo de ocasión vendido" : d.tipoPedido === "nuevo" ? " · Vehículo nuevo" : ""}
        </div>

        {d.retoma && (
          <div style={{ padding: "10px 12px", borderLeft: "4px solid var(--info)", background: "var(--bg-surface-tint)", fontSize: "0.88rem" }}>
            🔁 <strong>Lleva vehículo de retoma</strong>
            {d.retoma.matricula ? ` (matrícula ${d.retoma.matricula})` : ""}
            {d.retoma.texto ? `: ${d.retoma.texto}` : ""}. Esa matrícula no se usa en el expediente.
          </div>
        )}

        <div className="glass-panel" style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: "6px" }}>
          <div style={{ display: "flex", gap: "8px", fontSize: "0.9rem" }}>
            <span style={{ color: "var(--text-muted)", minWidth: "130px" }}>Cliente</span>
            <strong style={{ wordBreak: "break-word" }}>{d.cliente || "—"}</strong>
          </div>
          {grupos.map((g) => (
            <div key={g.titulo} style={{ display: "flex", flexDirection: "column", gap: "4px", marginTop: "6px" }}>
              <span style={{ fontSize: "0.72rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>{g.titulo} · marca lo que quieres aplicar</span>
              {g.campos.map((k) => (
                <label key={k} style={{ display: "flex", gap: "8px", alignItems: "center", fontSize: "0.88rem", opacity: valores[k] ? 1 : 0.5, cursor: valores[k] ? "pointer" : "default" }}>
                  <input type="checkbox" disabled={!valores[k]} checked={activo(k)} onChange={(e) => setUsar((p) => ({ ...p, [k]: e.target.checked }))} style={{ accentColor: "var(--primary)" }} />
                  <span style={{ color: "var(--text-muted)", minWidth: "120px" }}>{etiquetas[k]}</span>
                  <strong style={{ wordBreak: "break-word" }}>{textoDato(k) ?? "—"}</strong>
                </label>
              ))}
            </div>
          ))}
          <div style={{ display: "flex", gap: "8px", fontSize: "0.9rem", marginTop: "6px" }}>
            <span style={{ color: "var(--text-muted)", minWidth: "130px" }}>Vehículo</span>
            <strong style={{ wordBreak: "break-word" }}>{d.modeloTexto || "—"}</strong>
          </div>
        </div>
        {(pedido.similares ?? []).length > 0 && (
          <div style={{ color: "var(--warning)", fontSize: "0.85rem", border: "1px solid var(--warning)", borderRadius: "var(--radius-sm)", padding: "8px 10px" }}>
            ⚠️ Ya existe un expediente parecido: {(pedido.similares ?? []).map((x) => `nº ${x.idExpediente} (${x.motivo}${x.cliente ? `, ${x.cliente}` : ""})`).join("; ")}. Puedes continuar, pero comprueba que no lo duplicas.
          </div>
        )}
        {d.avisos.length > 0 && <div style={{ color: "var(--warning)", fontSize: "0.82rem" }}>⚠️ {d.avisos[0]}</div>}

        {eleccion ? (
          <div style={{ fontSize: "0.88rem" }}>
            Se creará el expediente de <strong>{eleccion.nombreModelo}</strong> con pago <strong>{eleccion.tipo.nombre_tipo_venta}</strong>.
          </div>
        ) : (
          <>
          <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
            <span className="form-label" style={{ margin: 0 }}>Vehículo</span>
            {([["nuevo", "VN · Nuevo"], ["usado", "VO · Usado"]] as const).map(([clave, texto]) => (
              <button key={clave} type="button" className={`btn ${tipoVehiculo === clave ? "btn-primary" : "btn-secondary"}`} style={{ padding: "4px 14px", fontSize: "0.82rem" }} onClick={() => setTipoVehiculo(clave)} title={clave === "nuevo" ? "El expediente se crea como vehículo nuevo (VN)" : "El expediente se crea como vehículo usado (VO)"}>
                {texto}
              </button>
            ))}
            {tipoVehiculo === null && <span style={{ fontSize: "0.8rem", color: "var(--warning)" }}>⚠️ No se ha reconocido si es nuevo o usado: elígelo (si no eliges, se crea como nuevo).</span>}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px" }}>
                Modelo
                {!eleccion && (
                  <button type="button" className={`btn ${usaNuevo ? "btn-primary" : "btn-secondary"}`} style={{ padding: "1px 10px", fontSize: "0.75rem" }} onClick={() => setCrearNuevo(!usaNuevo)} title="Crea una marca y un modelo que no están dados de alta y los asocia a este expediente">
                    {usaNuevo ? "✓ Marca y modelo nuevos" : "➕ Nueva marca y modelo"}
                  </button>
                )}
              </label>
              <select className="form-select" value={usaNuevo ? "nuevo" : modelo} onChange={(e) => {
                if (e.target.value === "nuevo") setCrearNuevo(true);
                else {
                  setCrearNuevo(false);
                  setModelo(e.target.value ? Number(e.target.value) : "");
                }
              }}>
                <option value="">Sin modelo</option>
                {!eleccion && <option value="nuevo">{d.modeloTexto ? `➕ Crear «${d.modeloTexto}» como marca y modelo nuevos` : "➕ Crear una marca y un modelo nuevos…"}</option>}
                {modelosPlanos.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.texto}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Forma de pago *</label>
              <select className="form-select" value={tipo} onChange={(e) => setTipo(e.target.value ? Number(e.target.value) : "")}>
                <option value="">Elige…</option>
                {tiposVenta.map((t) => (
                  <option key={t.id_tipo_de_venta} value={t.id_tipo_de_venta}>
                    {t.nombre_tipo_venta}
                  </option>
                ))}
              </select>
            </div>
          </div>
          </>
        )}

        {usaNuevo && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", padding: "10px 12px", border: "1px solid var(--primary)", borderRadius: "var(--radius-sm)", background: "var(--bg-surface-tint)" }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Marca nueva</label>
              <input className="form-input" value={marcaNueva} onChange={(e) => setMarcaNueva(e.target.value)} list="marcas-existentes-pedido" placeholder="Ej. Renault" />
              <datalist id="marcas-existentes-pedido">
                {marcas.map((m) => (
                  <option key={m.id_marca} value={m.nombre} />
                ))}
              </datalist>
              <span style={{ fontSize: "0.78rem", color: "var(--text-secondary)" }}>{marcaNueva.trim() === "" ? "Escribe la marca." : marcaExistente ? `La marca ${marcaExistente.nombre} ya existe: se usará esa.` : "Marca nueva: se creará."}</span>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Modelo nuevo</label>
              <input className="form-input" value={modeloNuevo} onChange={(e) => setModeloNuevo(e.target.value)} placeholder="Ej. Mégane" />
              <span style={{ fontSize: "0.78rem", color: "var(--text-secondary)" }}>{modeloNuevo.trim() === "" ? "Escribe el modelo." : modeloExistente ? "Ese modelo ya existe en esa marca: se usará." : "Modelo nuevo: se creará."}</span>
            </div>
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {coincidencias === null ? (
            <span style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>Buscando al cliente…</span>
          ) : coincidencias.length === 0 ? (
            <>
              <div style={{ padding: "10px 12px", borderLeft: "4px solid var(--warning)", background: "var(--bg-surface-tint)", fontSize: "0.9rem" }}>
                ⚠️ <strong>{d.cliente ?? "El cliente del pedido"}</strong> no está creado todavía. ¿Quieres crearlo?
              </div>
              {d.cliente && opcion("nuevo", "Sí, crear el cliente con los datos marcados del pedido", "Se le pone tu tienda predeterminada y se asigna al expediente.")}
              {opcion("ninguno", "No, crear el expediente sin cliente")}
            </>
          ) : (
            <>
              <div style={{ padding: "10px 12px", borderLeft: "4px solid var(--info)", background: "var(--bg-surface-tint)", fontSize: "0.9rem" }}>
                {coincidencias.length === 1 ? "Ya existe un cliente que coincide. ¿Quieres asociarlo al expediente?" : `Hay ${coincidencias.length} clientes que podrían ser él. Elige cuál es:`}
              </div>
              {coincidencias.map((c) => opcion(c.id, `${c.nombre ?? "(sin nombre)"}${c.dni ? ` · ${c.dni}` : ""}`, c.porDni ? "Mismo DNI/NIE" : "Mismo nombre (sin coincidir el DNI)"))}
              {d.cliente && opcion("nuevo", "Ninguno: crear un cliente nuevo con los datos del pedido", d.dni && coincidencias.some((c) => c.porDni) ? "Ojo: ya hay un cliente con ese DNI, no se podrá crear otro igual." : undefined)}
              {opcion("ninguno", "Crear el expediente sin cliente")}
            </>
          )}
        </div>
      </div>
      {verPdf && <VisorPedido idAdjunto={pedido.adjunto.id} nombre={item.nombre} />}
      </div>
    </Modal>
  );
}
