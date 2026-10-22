"use client";

import { useEffect, useState, type ReactNode } from "react";
import Modal from "@/components/Modal";
import { useToast } from "@/components/Toast";
import { llamar, textoError } from "@/components/comisiones/api";
import { BotonLeerDni } from "../documentos/BotonLeerDocumento";
import type { CoincidenciaCliente } from "@/lib/servicios/clientes";
import type { ResultadoDni, ResultadoPedido } from "@/lib/servicios/documentos";
import VisorPedido from "../documentos/VisorPedido";

/** Lo que el formulario del expediente tiene ahora, para compararlo con el pedido. */
export interface ValoresActuales {
  idModelo: number | "";
  modelo: string;
  idTipoVenta: number | "";
  tipoVenta: string;
  vin: string;
  matricula: string;
  fExp: string;
  fEntrega: string;
  fMat: string;
  /** El expediente ya tiene un cliente asociado. */
  idCliente: number | null;
  dni: string;
  nombre: string;
  /** Fecha de nacimiento del cliente en el formulario (AAAA-MM-DD). */
  fNac: string;
  telefono: string;
  email: string;
}

export interface OpcionCatalogo {
  id: number;
  etiqueta: string;
}

export type EleccionCliente = { modo: "mantener" } | { modo: "ninguno" } | { modo: "existente"; id: number } | { modo: "nuevo" };

/** Lo que el usuario ha decidido aplicar. El formulario lo vuelca en sus campos; no se guarda hasta pulsar «Guardar Cambios». */
export interface CambiosDelPedido {
  idModelo?: number;
  idTipoVenta?: number;
  vin?: string;
  matricula?: string;
  fExp?: string;
  fEntrega?: string;
  fMat?: string;
  cliente: EleccionCliente;
  /** Con «mantener»: los datos que se añaden al cliente actual. Con «nuevo»: todos los del cliente nuevo. */
  datosCliente: { dni?: string; nombre?: string; telefono?: string; email?: string; fechaNacimiento?: string };
}

type Clave = "modelo" | "tipoVenta" | "vin" | "matricula" | "fExp" | "fEntrega" | "fMat" | "dni" | "nombre" | "fNac" | "telefono" | "email";
type Tipo = "seleccion" | "texto" | "fecha";

interface Fila {
  clave: Clave;
  etiqueta: string;
  tipo: Tipo;
  actual: string;
  /** Lo que propone el pedido, ya con las correcciones del usuario. */
  pedido: string;
  /** Valor alternativo (del pedido o del DNI) que se puede elegir con un botón. */
  alternativas?: { origen: string; valor: string }[];
  opciones?: OpcionCatalogo[];
  seleccionado?: number | null;
  /** Aviso cuando el pedido trae algo que no se reconoce (por ejemplo, un modelo que no está en el catálogo). */
  nota?: string;
}

interface Props {
  pedido: ResultadoPedido;
  actuales: ValoresActuales;
  opcionesModelo: OpcionCatalogo[];
  opcionesTipoVenta: OpcionCatalogo[];
  /** DNI leído (cara y datos) mientras se lee el pedido o con el modal abierto; null si aún no hay. */
  dni: ResultadoDni | null;
  /** Se llama con cada DNI que se lee desde este modal (el formulario guarda el documento y la foto). */
  alLeerDni: (r: ResultadoDni) => void | Promise<void>;
  alAplicar: (cambios: CambiosDelPedido) => Promise<void>;
  alCancelar: () => void;
}

const norm = (t: string) => t.replace(/\s+/g, "").toUpperCase();

/** Si el pedido y el DNI dicen cosas distintas, las dos opciones para elegir con un botón. */
function alternativas(delPedido: string | null | undefined, delDni: string | null | undefined): { origen: string; valor: string }[] | undefined {
  if (!delPedido || !delDni || norm(delPedido) === norm(delDni)) return undefined;
  return [
    { origen: "Pedido", valor: delPedido },
    { origen: "DNI", valor: delDni },
  ];
}

/**
 * Pedido leído en «Editar expediente»: vista previa de todos los datos que trae (vehículo, venta y cliente) frente a los del expediente,
 * con una casilla para cada uno. Todo lo que propone el pedido se puede **corregir a mano** antes de aplicarlo, por si la lectura se ha
 * equivocado. Al aplicar se rellena el formulario; el expediente se guarda después con «Guardar Cambios».
 */
export default function ModalPedidoEnExpediente({ pedido, actuales, opcionesModelo, opcionesTipoVenta, dni, alLeerDni, alAplicar, alCancelar }: Props) {
  const { mostrar } = useToast();
  const d = pedido.datos;
  const [verPdf, setVerPdf] = useState(false);
  const [trabajando, setTrabajando] = useState(false);

  // Valores del pedido que se pueden corregir
  // El DNI, si se ha leído, manda sobre el pedido para el DNI, el nombre y la fecha de nacimiento (se puede cambiar con los botones)
  const [texto, setTexto] = useState<Record<string, string>>({ vin: d.vin ?? "", matricula: d.matricula ?? "", fExp: d.fechaExpediente ?? "", fEntrega: d.fechaEntrega ?? "", fMat: d.fechaMatriculacion ?? "", dni: dni?.datos.dni ?? d.dni ?? "", nombre: dni?.datos.nombreCompleto ?? d.cliente ?? "", fNac: dni?.datos.fechaNacimiento ?? "", telefono: d.telefono ?? "", email: d.email ?? "" });
  const [idModeloSel, setIdModeloSel] = useState<number | null>(d.idModelo);
  const [idTipoSel, setIdTipoSel] = useState<number | null>(d.idTipoDeVenta);
  const etiqueta = (lista: OpcionCatalogo[], id: number | null) => lista.find((o) => o.id === id)?.etiqueta ?? "";

  const filas: Fila[] = [
    { clave: "modelo", etiqueta: "Marca y modelo", tipo: "seleccion", actual: actuales.modelo, pedido: etiqueta(opcionesModelo, idModeloSel), opciones: opcionesModelo, seleccionado: idModeloSel, nota: idModeloSel === null && (d.modeloTexto || d.modeloPropuesto) ? `El pedido dice «${d.modeloTexto ?? d.modeloPropuesto}», que no está en el catálogo: elige el modelo a mano` : undefined },
    { clave: "tipoVenta", etiqueta: "Tipo de pago", tipo: "seleccion", actual: actuales.tipoVenta, pedido: etiqueta(opcionesTipoVenta, idTipoSel), opciones: opcionesTipoVenta, seleccionado: idTipoSel },
    { clave: "vin", etiqueta: "Bastidor (VIN)", tipo: "texto", actual: actuales.vin, pedido: texto.vin },
    { clave: "matricula", etiqueta: "Matrícula", tipo: "texto", actual: actuales.matricula, pedido: texto.matricula },
    { clave: "fExp", etiqueta: "Fecha del expediente", tipo: "fecha", actual: actuales.fExp, pedido: texto.fExp },
    { clave: "fEntrega", etiqueta: "Fecha de entrega", tipo: "fecha", actual: actuales.fEntrega, pedido: texto.fEntrega },
    { clave: "fMat", etiqueta: "Fecha de matriculación", tipo: "fecha", actual: actuales.fMat, pedido: texto.fMat },
  ];
  const filasCliente: Fila[] = [
    { clave: "dni", etiqueta: "DNI / NIE", tipo: "texto", actual: actuales.dni, pedido: texto.dni, alternativas: alternativas(d.dni, dni?.datos.dni) },
    { clave: "nombre", etiqueta: "Nombre", tipo: "texto", actual: actuales.nombre, pedido: texto.nombre, alternativas: alternativas(d.cliente, dni?.datos.nombreCompleto) },
    { clave: "fNac", etiqueta: "Fecha de nacimiento (del DNI)", tipo: "fecha", actual: actuales.fNac, pedido: texto.fNac },
    { clave: "telefono", etiqueta: "Teléfono", tipo: "texto", actual: actuales.telefono, pedido: texto.telefono },
    { clave: "email", etiqueta: "Correo", tipo: "texto", actual: actuales.email, pedido: texto.email },
  ];

  const distinto = (f: Fila) => f.pedido.trim() !== "" && norm(f.actual) !== norm(f.pedido);
  const aplicable = (f: Fila) => distinto(f);
  const [marcado, setMarcado] = useState<Record<string, boolean>>(() => Object.fromEntries([...filas, ...filasCliente].map((f) => [f.clave, aplicable(f) && f.actual.trim() === ""])));

  // Si el DNI llega con el modal abierto, se ofrecen sus datos
  const [dniPrevio, setDniPrevio] = useState(dni);
  if (dni !== dniPrevio) {
    setDniPrevio(dni);
    if (dni) {
      setTexto((p) => ({ ...p, dni: dni.datos.dni ?? p.dni, nombre: dni.datos.nombreCompleto ?? p.nombre, fNac: dni.datos.fechaNacimiento ?? p.fNac }));
      setMarcado((p) => ({ ...p, dni: actuales.dni.trim() === "" && !!dni.datos.dni, nombre: actuales.nombre.trim() === "" && !!dni.datos.nombreCompleto, fNac: actuales.fNac.trim() === "" && !!dni.datos.fechaNacimiento }));
    }
  }

  const tieneCliente = actuales.idCliente !== null || actuales.nombre.trim() !== "";
  const [coincidencias, setCoincidencias] = useState<CoincidenciaCliente[] | null>(null);
  const [cliente, setCliente] = useState<EleccionCliente | null>(tieneCliente ? { modo: "mantener" } : null);

  useEffect(() => {
    let vivo = true;
    llamar<CoincidenciaCliente[]>("/api/clientes/coincidencias", { method: "POST", cuerpo: { dni: d.dni, nombre: d.cliente } })
      .then((r) => {
        if (!vivo) return;
        setCoincidencias(r.data);
        if (!tieneCliente) {
          if (r.data.length === 1 && r.data[0].porDni) setCliente({ modo: "existente", id: r.data[0].id });
          else if (r.data.length === 0) setCliente(d.cliente ? { modo: "nuevo" } : { modo: "ninguno" });
        }
      })
      .catch((e: unknown) => {
        if (!vivo) return;
        mostrar(textoError(e), "error");
        setCoincidencias([]);
        if (!tieneCliente) setCliente(d.cliente ? { modo: "nuevo" } : { modo: "ninguno" });
      });
    return () => {
      vivo = false;
    };
  }, [d.dni, d.cliente, mostrar, tieneCliente]);

  const otros = (coincidencias ?? []).filter((c) => c.id !== actuales.idCliente);
  const mismoDni = actuales.dni !== "" && texto.dni !== "" && norm(actuales.dni) === norm(texto.dni);

  const marcarTodo = (valor: boolean, soloVacios = false) => setMarcado(Object.fromEntries([...filas, ...filasCliente].map((f) => [f.clave, valor && aplicable(f) && (!soloVacios || f.actual.trim() === "")])));

  /** Corregir un valor del pedido lo marca para aplicar (si es distinto del actual). */
  const corregir = (clave: Clave, valor: string) => {
    setTexto((p) => ({ ...p, [clave]: valor }));
    setMarcado((p) => ({ ...p, [clave]: valor.trim() !== "" }));
  };

  const aplicar = async () => {
    if (cliente === null) return;
    setTrabajando(true);
    try {
      const por = (f: Fila) => !!marcado[f.clave] && aplicable(f);
      const cambios: CambiosDelPedido = { cliente, datosCliente: {} };
      if (por(filas[0]) && idModeloSel) cambios.idModelo = idModeloSel;
      if (por(filas[1]) && idTipoSel) cambios.idTipoVenta = idTipoSel;
      if (por(filas[2])) cambios.vin = texto.vin.trim();
      if (por(filas[3])) cambios.matricula = texto.matricula.trim();
      if (por(filas[4])) cambios.fExp = texto.fExp;
      if (por(filas[5])) cambios.fEntrega = texto.fEntrega;
      if (por(filas[6])) cambios.fMat = texto.fMat;
      if (cliente.modo === "nuevo") cambios.datosCliente = { dni: texto.dni.trim() || undefined, nombre: texto.nombre.trim() || undefined, fechaNacimiento: texto.fNac || undefined, telefono: texto.telefono.trim() || undefined, email: texto.email.trim() || undefined };
      if (cliente.modo === "mantener") {
        if (por(filasCliente[0])) cambios.datosCliente.dni = texto.dni.trim();
        if (por(filasCliente[1])) cambios.datosCliente.nombre = texto.nombre.trim();
        if (por(filasCliente[2])) cambios.datosCliente.fechaNacimiento = texto.fNac;
        if (por(filasCliente[3])) cambios.datosCliente.telefono = texto.telefono.trim();
        if (por(filasCliente[4])) cambios.datosCliente.email = texto.email.trim();
      }
      await alAplicar(cambios);
    } catch (e) {
      mostrar(textoError(e), "error");
      setTrabajando(false);
    }
  };

  /** Control para corregir el valor que propone el pedido. */
  const editor = (f: Fila): ReactNode => {
    if (f.tipo === "seleccion") {
      const cambiar = (v: string) => {
        const id = v ? Number(v) : null;
        if (f.clave === "modelo") setIdModeloSel(id);
        else setIdTipoSel(id);
        setMarcado((p) => ({ ...p, [f.clave]: id !== null }));
      };
      return (
        <select className="form-input" value={f.seleccionado ?? ""} onChange={(e) => cambiar(e.target.value)} style={{ minWidth: "170px", padding: "4px 8px" }}>
          <option value="">— (no aplicar)</option>
          {f.opciones?.map((o) => (
            <option key={o.id} value={o.id}>
              {o.etiqueta}
            </option>
          ))}
        </select>
      );
    }
    return <input className="form-input" type={f.tipo === "fecha" ? "date" : "text"} value={f.pedido} onChange={(e) => corregir(f.clave, e.target.value)} style={{ minWidth: f.tipo === "fecha" ? "140px" : "150px", padding: "4px 8px" }} />;
  };

  const verActual = (f: Fila) => (f.actual.trim() === "" ? "—" : f.tipo === "fecha" ? f.actual.split("-").reverse().join("/") : f.actual);

  const tabla = (lista: Fila[]) => (
    <div className="table-container">
      <table className="table-premium table-compact">
        <thead>
          <tr>
            <th style={{ width: "60px" }}>Aplicar</th>
            <th>Dato</th>
            <th>Ahora</th>
            <th>Pedido (puedes corregirlo)</th>
          </tr>
        </thead>
        <tbody>
          {lista.map((f) => (
            <tr key={f.clave}>
              <td>
                <input type="checkbox" checked={!!marcado[f.clave] && aplicable(f)} disabled={!aplicable(f)} onChange={(e) => setMarcado((p) => ({ ...p, [f.clave]: e.target.checked }))} style={{ width: "18px", height: "18px", accentColor: "var(--primary)" }} />
              </td>
              <td>{f.etiqueta}</td>
              <td>{verActual(f)}</td>
              <td style={{ textAlign: "right" }}>
                {editor(f)}
                {f.alternativas && (
                  <span style={{ display: "flex", gap: "6px", justifyContent: "flex-end", flexWrap: "wrap", marginTop: "4px" }}>
                    {f.alternativas.map((alt) => (
                      <button key={alt.origen} type="button" className="btn btn-secondary" style={{ padding: "1px 8px", fontSize: "0.72rem", borderColor: norm(f.pedido) === norm(alt.valor) ? "var(--primary)" : undefined }} onClick={() => corregir(f.clave, alt.valor)} title={`Usar el valor del ${alt.origen.toLowerCase()}`}>
                        {alt.origen}: {alt.valor}
                      </button>
                    ))}
                  </span>
                )}
                {f.nota && <span style={{ display: "block", color: "var(--warning)", fontSize: "0.75rem", textAlign: "right" }}>{f.nota}</span>}
                {!f.nota && f.pedido.trim() !== "" && !distinto(f) && <span style={{ color: "var(--success)", marginLeft: "6px", fontSize: "0.75rem" }}>igual</span>}
                {!f.nota && distinto(f) && f.actual.trim() !== "" && <span style={{ color: "var(--warning)", marginLeft: "6px", fontSize: "0.75rem" }}>distinto</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  const opcion = (valor: EleccionCliente, titulo: string, detalle?: string) => {
    const activa = cliente !== null && cliente.modo === valor.modo && (valor.modo !== "existente" || (cliente.modo === "existente" && cliente.id === valor.id));
    return (
      <label key={valor.modo === "existente" ? `e${valor.id}` : valor.modo} style={{ display: "flex", gap: "10px", alignItems: "flex-start", padding: "10px 12px", borderRadius: "var(--radius-sm)", cursor: "pointer", border: `1px solid ${activa ? "var(--primary)" : "var(--border-light)"}`, background: activa ? "var(--bg-surface-hover)" : "transparent" }}>
        <input type="radio" name="cliente-pedido" checked={activa} onChange={() => setCliente(valor)} style={{ marginTop: "3px", accentColor: "var(--primary)" }} />
        <span style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
          <strong style={{ fontSize: "0.9rem" }}>{titulo}</strong>
          {detalle && <span style={{ fontSize: "0.78rem", color: "var(--text-secondary)" }}>{detalle}</span>}
        </span>
      </label>
    );
  };

  const nombreNuevo = texto.nombre.trim();
  return (
    <Modal
      titulo="📄 Completar el expediente con el pedido"
      ancho={verPdf ? "min(calc(96 * var(--uvw)), 1500px)" : "min(calc(96 * var(--uvw)), 800px)"}
      pie={
        <>
          <button type="button" className="btn btn-secondary" onClick={() => setVerPdf((v) => !v)} title="Muestra el PDF del pedido al lado de los datos para decidir qué aplicar mirando el original">
            {verPdf ? "🙈 Ocultar el PDF" : "👁 Ver el PDF"}
          </button>
          <button type="button" className="btn btn-secondary" onClick={alCancelar} disabled={trabajando}>
            Cancelar
          </button>
          <button type="button" className="btn btn-primary" onClick={() => void aplicar()} disabled={trabajando || cliente === null || (cliente.modo === "nuevo" && nombreNuevo === "")}>
            {trabajando ? "Aplicando…" : "Aplicar al expediente"}
          </button>
        </>
      }
    >
      <div style={{ display: "flex", gap: "20px", alignItems: "flex-start" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "14px", flex: "1 1 0", minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: "0.88rem", color: "var(--text-secondary)" }}>
            Marca lo que quieres tomar del pedido y corrige a mano lo que la lectura haya leído mal. Lo que ya está rellenado y es distinto no se marca solo. Se rellena el formulario y lo guardas con «Guardar Cambios».
          </p>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <button type="button" className="btn btn-secondary" style={{ padding: "2px 10px", fontSize: "0.78rem" }} onClick={() => marcarTodo(true)}>
              Marcar todo
            </button>
            <button type="button" className="btn btn-secondary" style={{ padding: "2px 10px", fontSize: "0.78rem" }} onClick={() => marcarTodo(true, true)}>
              Solo los vacíos
            </button>
            <button type="button" className="btn btn-secondary" style={{ padding: "2px 10px", fontSize: "0.78rem" }} onClick={() => marcarTodo(false)}>
              Ninguno
            </button>
          </div>
          {d.retoma && (
            <div style={{ padding: "10px 12px", borderLeft: "4px solid var(--info)", background: "var(--bg-surface-tint)", fontSize: "0.88rem" }}>
              🔁 <strong>Lleva vehículo de retoma</strong>
              {d.retoma.matricula ? ` (matrícula ${d.retoma.matricula})` : ""}
              {d.retoma.texto ? `: ${d.retoma.texto}` : ""}. Esa matrícula no se usa en el expediente.
            </div>
          )}
          <strong style={{ fontSize: "0.95rem" }}>Vehículo y venta</strong>
          {tabla(filas)}
          {d.avisos.length > 0 && <div style={{ color: "var(--warning)", fontSize: "0.82rem" }}>⚠️ {d.avisos[0]}</div>}

          <strong style={{ fontSize: "0.95rem" }}>Cliente</strong>
          <div style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap", padding: "8px 10px", border: "1px dashed var(--border-light)", borderRadius: "var(--radius-sm)" }}>
            <BotonLeerDni compacta alLeer={alLeerDni} />
            <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
              {dni
                ? `🪪 DNI leído: ${dni.datos.nombreCompleto ?? "sin nombre"}${dni.datos.dni ? ` · ${dni.datos.dni}` : ""}${dni.fotoId ? " · foto detectada" : ""}. Puedes soltar el reverso u otro DNI.`
                : "Suelta aquí el DNI (también puedes hacerlo mientras se lee el pedido, en el cuadro de «Documentos»): se detecta la cara y se leen el nombre, el DNI y la fecha de nacimiento para ofrecértelos."}
            </span>
          </div>
          {coincidencias === null ? (
            <span style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>Buscando al cliente…</span>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {tieneCliente && opcion({ modo: "mantener" }, `Mantener el cliente actual: ${actuales.nombre || "(sin nombre)"}`, mismoDni ? "Coincide con el DNI del pedido." : "Se queda como está, salvo los datos que marques abajo.")}
              {otros.map((c) => opcion({ modo: "existente", id: c.id }, `${tieneCliente ? "Cambiar a" : "Asociar"} ${c.nombre ?? "(sin nombre)"}${c.dni ? ` · ${c.dni}` : ""}`, c.porDni ? "Mismo DNI/NIE que el pedido" : "Mismo nombre (sin coincidir el DNI)"))}
              {(texto.nombre.trim() !== "" || d.cliente) && !mismoDni && !coincidencias.some((c) => c.porDni) && opcion({ modo: "nuevo" }, `Crear el cliente ${nombreNuevo || "nuevo"} con los datos del pedido`, "Se rellenan su nombre, DNI, teléfono y correo en el formulario; el cliente se crea al pulsar «Guardar Cambios».")}
              {!tieneCliente && opcion({ modo: "ninguno" }, "Dejar el expediente sin cliente")}
            </div>
          )}
          {cliente?.modo === "mantener" && (
            <>
              <span style={{ fontSize: "0.82rem", color: "var(--text-secondary)" }}>Datos del cliente actual que se pueden completar con el pedido:</span>
              {tabla(filasCliente)}
            </>
          )}
          {cliente?.modo === "nuevo" && (
            <>
              <span style={{ fontSize: "0.82rem", color: "var(--text-secondary)" }}>Datos con los que se creará el cliente (corrígelos si hace falta):</span>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: "10px" }}>
                {filasCliente.map((f) => (
                  <label key={f.clave} style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                    {f.etiqueta}
                    {f.clave === "nombre" ? " *" : ""}
                    <input className="form-input" type={f.tipo === "fecha" ? "date" : "text"} value={f.pedido} onChange={(e) => setTexto((p) => ({ ...p, [f.clave]: e.target.value }))} style={{ borderColor: f.clave === "nombre" && f.pedido.trim() === "" ? "var(--danger)" : undefined }} />
                  </label>
                ))}
              </div>
            </>
          )}
        </div>
        {verPdf && <VisorPedido idAdjunto={pedido.adjunto.id} nombre={pedido.adjunto.nombre} />}
      </div>
    </Modal>
  );
}
