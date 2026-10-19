"use client";

import TablaDatos, { type ColumnaTabla } from "@/components/TablaDatos";
import { columnasVehiculo } from "./etiquetas";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/Toast";
import { llamar, textoError } from "@/components/comisiones/api";
import type { ExpedienteDto, MarcaDto, ModeloDto, TipoVentaDto } from "@/lib/dto";
import { formatDate } from "@/lib/date-utils";
import { permitirDuplicadosAhora } from "@/lib/preferencias";
import type { ResultadoPedido } from "@/lib/servicios/documentos";
import { MAXIMO_COLA, abrirDeCola, actualizarPedidoDeCola, colaVacia, leerCola, leerLectura, quitarDeCola, suscribirCola, suscribirLectura, vaciarCola, type ItemCola } from "@/lib/pedidos-cola";
import { anotarResolucion, cancelarLecturas } from "@/lib/lecturas-pedidos-cliente";
import EstadoLecturas from "./EstadoLecturas";
import PedidoRapidoModal from "./PedidoRapidoModal";
import RellenarDesdePedidoModal from "./RellenarDesdePedidoModal";
import { vincularDniAlExpediente } from "@/lib/crear-desde-pedido";

interface Props {
  marcas: (MarcaDto & { modelos: ModeloDto[] })[];
  tiposVenta: TipoVentaDto[];
  vendedorId: number;
}

/**
 * Cola de pedidos leídos: todos los que se han soltado y aún no se han aplicado (se conservan aunque se cierre la ventana de un
 * pedido o se recargue la página). Desde aquí se abre cada uno para elegir qué datos se aplican, o se descarta.
 */
export default function ColaPedidos({ marcas, tiposVenta, vendedorId }: Props) {
  const router = useRouter();
  const { mostrar } = useToast();
  const [marcados, setMarcados] = useState<string[]>([]);
  /** Progreso de «Releer»: cuántos pedidos van y cuántos son. */
  const [releyendo, setReleyendo] = useState<{ hechos: number; total: number } | null>(null);
  const estado = useSyncExternalStore(suscribirCola, leerCola, colaVacia);
  const { items, abierto } = estado;
  const lectura = useSyncExternalStore(suscribirLectura, leerLectura, () => null);
  const indice = items.findIndex((i) => i.id === abierto);
  const actual = indice >= 0 ? items[indice] : null;

  // Pedido que completa un expediente ya creado: se trae el expediente antes de abrir la ventana
  const [expediente, setExpediente] = useState<{ idItem: string; datos: ExpedienteDto } | null>(null);
  const idItem = actual?.id ?? null;
  const idExpediente = actual?.idExpediente ?? null;
  useEffect(() => {
    if (!idItem || !idExpediente) return;
    let vivo = true;
    llamar<ExpedienteDto>(`/api/expedientes?id=${idExpediente}`)
      .then((r) => vivo && setExpediente({ idItem, datos: r.data }))
      .catch((e: unknown) => {
        if (!vivo) return;
        mostrar(`No se pudo abrir el expediente del pedido: ${textoError(e)}`, "error");
        abrirDeCola(null);
      });
    return () => {
      vivo = false;
    };
  }, [idItem, idExpediente, mostrar]);

  const ir = (delta: -1 | 1) => {
    const destino = items[indice + delta];
    if (destino) abrirDeCola(destino.id);
  };

  /** Los documentos de un pedido que se descarta ya no sirven para nada: se marcan como eliminados (se borran del todo desde Configuración › BBDD). */
  const soltarDocumentos = (lista: ItemCola[]) => {
    for (const i of lista) for (const id of [i.pedido.adjunto.id, ...(i.dni?.adjuntos ?? [])]) void fetch(`/api/adjuntos?id=${id}`, { method: "DELETE", credentials: "same-origin" }).catch(() => undefined);
  };

  /** Quita el pedido aplicado y abre el siguiente de la cola, si lo hay. */
  const terminado = (mensaje: string, idExpedienteCreado?: number) => {
    if (!actual) return;
    if (actual.idExpediente && actual.dni?.adjuntos.length && !mensaje.startsWith("Pedido descartado")) void vincularDniAlExpediente(actual.dni.adjuntos, actual.idExpediente).catch((e: unknown) => mostrar(`No se ha podido unir el DNI al expediente: ${textoError(e)}`, "error"));
    if (mensaje.startsWith("Pedido descartado")) soltarDocumentos([actual]);
    anotarResolucion(actual.idLectura, mensaje.startsWith("Pedido descartado") ? "quitado" : actual.idExpediente ? "completado" : "creado", actual.idExpediente ?? idExpedienteCreado ?? null);
    const siguiente = items[indice + 1] ?? items[indice - 1] ?? null;
    quitarDeCola(actual.id);
    mostrar(mensaje);
    router.refresh();
    abrirDeCola(siguiente && siguiente.id !== actual.id ? siguiente.id : null);
  };

  /** Pedidos tal como se ven en la tabla (con el orden y la búsqueda) y último pedido marcado: para elegir un rango con Mayús. */
  const vistos = useRef<string[]>([]);
  const ultimoMarcado = useRef<string | null>(null);
  const verFilas = useCallback((filas: ItemCola[]) => {
    vistos.current = filas.map((f) => f.id);
  }, []);

  if (items.length === 0) return <EstadoLecturas />;

  const elegidos = marcados.filter((id) => items.some((i) => i.id === id));
  const alternarMarca = (id: string, v: boolean, conMayus = false) => {
    const desde = ultimoMarcado.current ? vistos.current.indexOf(ultimoMarcado.current) : -1;
    const hasta = vistos.current.indexOf(id);
    // Mayús + clic: todos los pedidos entre el último que marcaste y este quedan igual que este
    const rango = conMayus && desde >= 0 && hasta >= 0 ? vistos.current.slice(Math.min(desde, hasta), Math.max(desde, hasta) + 1) : [id];
    setMarcados((m) => (v ? [...m.filter((x) => !rango.includes(x)), ...rango] : m.filter((x) => !rango.includes(x))));
    ultimoMarcado.current = id;
  };
  /** Descarta de golpe los pedidos elegidos de la cola (sus ficheros se marcan como eliminados). */
  const descartarElegidos = () => {
    const lista = items.filter((i) => elegidos.includes(i.id));
    if (lista.length === 0) return;
    if (!window.confirm(`¿Descartar los ${lista.length} pedidos elegidos de la cola? Sus ficheros se marcan como eliminados (se borran del todo desde Configuración › BBDD) y habrá que volver a soltarlos para usarlos.`)) return;
    for (const i of lista) {
      anotarResolucion(i.idLectura, "quitado");
      quitarDeCola(i.id);
    }
    soltarDocumentos(lista);
    setMarcados([]);
    mostrar(`${lista.length} pedido${lista.length === 1 ? "" : "s"} descartado${lista.length === 1 ? "" : "s"} de la cola.`);
  };

  /** Forma de pago de un pedido de la cola: la del botón donde se soltó o la que reconoció la lectura. */
  const formaDePago = (i: (typeof items)[number]): string => i.eleccion?.tipo.nombre_tipo_venta ?? tiposVenta.find((t) => t.id_tipo_de_venta === i.pedido.datos.idTipoDeVenta)?.nombre_tipo_venta ?? "";
  /** Vuelve a leer el PDF de los pedidos indicados con el lector actual (de tres en tres) y cambia sus datos en la cola. */
  const releer = async (lista: typeof items) => {
    if (lista.length === 0 || releyendo) return;
    setReleyendo({ hechos: 0, total: lista.length });
    let hechos = 0;
    let mejorados = 0;
    const fallos: string[] = [];
    const cola = [...lista];
    const trabajador = async () => {
      for (let i = cola.shift(); i; i = cola.shift()) {
        try {
          const { data } = await llamar<ResultadoPedido>("/api/documentos/releer", { method: "POST", cuerpo: { idAdjunto: i.pedido.adjunto.id, duplicados: permitirDuplicadosAhora() } });
          const antes = i.pedido.datos;
          const d = data.datos;
          if ((!antes.dni && d.dni) || (!antes.telefono && d.telefono) || (!antes.tipoPedido && d.tipoPedido) || (!antes.modeloTexto && d.modeloTexto) || (!antes.idModelo && d.idModelo)) mejorados++;
          actualizarPedidoDeCola(i.id, data);
        } catch (e) {
          fallos.push(`${i.nombre}: ${textoError(e)}`);
        }
        hechos++;
        setReleyendo({ hechos, total: lista.length });
      }
    };
    await Promise.all([trabajador(), trabajador(), trabajador()]);
    setReleyendo(null);
    mostrar(`${lista.length - fallos.length} pedido${lista.length - fallos.length === 1 ? "" : "s"} leído${lista.length - fallos.length === 1 ? "" : "s"} otra vez${mejorados > 0 ? ` (${mejorados} con datos nuevos)` : ""}.${fallos.length > 0 ? ` ${fallos.length} con problema: ${fallos.slice(0, 2).join(" · ")}${fallos.length > 2 ? "…" : ""}` : ""}`, fallos.length > 0 ? "aviso" : undefined, 10000);
  };

  const columnasCola: ColumnaTabla<(typeof items)[number]>[] = [
    {
      clave: "seleccion",
      etiqueta: "✔",
      valor: (i) => (elegidos.includes(i.id) ? 1 : 0),
      celda: (i) => <input type="checkbox" checked={elegidos.includes(i.id)} onMouseDown={(e) => { if (e.shiftKey) e.preventDefault(); }} onChange={(e) => alternarMarca(i.id, e.target.checked, (e.nativeEvent as MouseEvent).shiftKey === true)} style={{ accentColor: "var(--primary)", cursor: "pointer" }} title="Elige este pedido. Con Mayús pulsada, elige de golpe todos los que hay entre el último que marcaste y este" />,
      ayuda: "Elige pedidos para releerlos o descartarlos de golpe. Marca uno, y con Mayús pulsada marca otro más arriba o más abajo: se eligen todos los de en medio",
    },
    {
      clave: "pedido",
      etiqueta: "Pedido",
      valor: (i) => i.pedido.datos.numeroPedido ?? i.nombre,
      celda: (i) => (
        <span title={i.nombre}>
          {i.pedido.datos.numeroPedido ?? i.nombre}
          {i.pedido.datos.tipoPedido === "usado" && <span title="Vehículo de ocasión vendido"> 🚗</span>}
          {i.pedido.datos.retoma && <span title={`Lleva vehículo de retoma${i.pedido.datos.retoma.matricula ? ` (${i.pedido.datos.retoma.matricula})` : ""}`}> 🔁</span>}
        </span>
      ),
    },
    { clave: "cliente", etiqueta: "Cliente", valor: (i) => i.pedido.datos.cliente ?? "", celda: (i) => i.pedido.datos.cliente ?? <span style={{ color: "var(--text-muted)" }}>—</span> },
    ...columnasVehiculo<(typeof items)[number]>((i) => ({ clase: i.pedido.datos.tipoPedido === "usado" ? "VO" : i.pedido.datos.tipoPedido === "nuevo" ? "VN" : null, marca: i.pedido.datos.marcaPropuesta, modelo: i.pedido.datos.modeloPropuesto ?? i.pedido.datos.modeloTexto }), { sin: ["estado", "tipoPago"] }),
    {
      clave: "pago",
      etiqueta: "Forma de pago",
      valor: (i) => formaDePago(i),
      celda: (i) => (formaDePago(i) ? <span className="badge badge-tienda" style={{ fontSize: "0.75rem" }}>{formaDePago(i)}</span> : <span style={{ color: "var(--text-muted)" }}>—</span>),
      ayuda: "Forma de pago que se propone (la del pedido, o la del botón de acceso rápido donde lo soltaste)",
    },
    { clave: "dni", etiqueta: "DNI / NIE", valor: (i) => i.pedido.datos.dni ?? "", celda: (i) => i.pedido.datos.dni ?? "—" },
    { clave: "telefono", etiqueta: "Teléfono", valor: (i) => i.pedido.datos.telefono ?? "", celda: (i) => i.pedido.datos.telefono ?? "—" },
    { clave: "email", etiqueta: "Email", valor: (i) => i.pedido.datos.email ?? "", celda: (i) => i.pedido.datos.email ?? "—", oculta: true },
    { clave: "domicilio", etiqueta: "Domicilio", valor: (i) => [i.pedido.datos.domicilio, i.pedido.datos.poblacion].filter(Boolean).join(", "), celda: (i) => [i.pedido.datos.domicilio, i.pedido.datos.poblacion].filter(Boolean).join(", ") || "—", oculta: true },
    { clave: "matricula", etiqueta: "Matrícula", valor: (i) => i.pedido.datos.matricula ?? "", celda: (i) => i.pedido.datos.matricula ?? "—" },
    { clave: "bastidor", etiqueta: "Bastidor (VIN)", valor: (i) => i.pedido.datos.vin ?? "", celda: (i) => i.pedido.datos.vin ?? "—", oculta: true },
    { clave: "entrega", etiqueta: "F. entrega", valor: (i) => i.pedido.datos.fechaEntrega ?? "", celda: (i) => (i.pedido.datos.fechaEntrega ? formatDate(i.pedido.datos.fechaEntrega) : "—"), oculta: true },
    { clave: "vendedor", etiqueta: "Vendedor del pedido", valor: (i) => i.pedido.datos.vendedor ?? "", celda: (i) => i.pedido.datos.vendedor ?? "—", oculta: true, ayuda: "Vendedor que figura en el pedido (no el del expediente)" },
    { clave: "similares", etiqueta: "Duplicado", valor: (i) => (i.pedido.similares ?? []).length, celda: (i) => ((i.pedido.similares ?? []).length > 0 ? <span style={{ color: "var(--warning)" }} title={(i.pedido.similares ?? []).map((x) => `nº ${x.idExpediente}: ${x.motivo}`).join("; ")}>⚠️ ya existe</span> : "—"), ayuda: "Ya hay un expediente que parece este pedido" },
    { clave: "avisos", etiqueta: "Avisos", valor: (i) => i.pedido.datos.avisos.filter((a) => !a.startsWith("Lectura automática")).length, celda: (i) => i.pedido.datos.avisos.filter((a) => !a.startsWith("Lectura automática")).length || "—", alinear: "right", oculta: true, ayuda: "Avisos de la lectura (modelo dudoso, tipo de venta cambiado…)" },
    { clave: "archivo", etiqueta: "Fichero", valor: (i) => i.nombre, celda: (i) => <span style={{ fontSize: "0.8rem" }}>{i.nombre}</span>, oculta: true },
    { clave: "fecha", etiqueta: "Fecha", valor: (i) => i.pedido.datos.fechaExpediente ?? "", celda: (i) => (i.pedido.datos.fechaExpediente ? formatDate(i.pedido.datos.fechaExpediente) : "—") },
    { clave: "destino", etiqueta: "Destino", valor: (i) => (i.idExpediente ? `Completar expediente #${i.idExpediente}` : i.eleccion ? `Nuevo: ${i.eleccion.nombreModelo} · ${i.eleccion.tipo.nombre_tipo_venta}` : "Nuevo expediente") + (i.dni ? " · con DNI" : "") },
    {
      clave: "acciones",
      etiqueta: "Acciones",
      valor: () => "",
      celda: (i) => (
        <span style={{ display: "inline-flex", gap: "6px" }}>
        <div style={{ display: "flex", gap: "6px" }}>
          <button type="button" className="btn btn-secondary" style={{ padding: "4px 10px", fontSize: "0.8rem" }} onClick={() => abrirDeCola(i.id)}>
            Abrir
          </button>
          <button type="button" className="btn btn-secondary" style={{ padding: "4px 10px", fontSize: "0.8rem" }} disabled={releyendo !== null} onClick={() => void releer([i])} title="Vuelve a leer el PDF de este pedido con el lector actual (por ejemplo, si no sacó el DNI, el teléfono o el modelo)">
            🔄 Releer
          </button>
          <button type="button" className="btn btn-secondary" style={{ padding: "4px 10px", fontSize: "0.8rem", color: "var(--danger)" }} onClick={() => { anotarResolucion(i.idLectura, "quitado"); soltarDocumentos([i]); quitarDeCola(i.id); }} title="Quita el pedido de la cola sin aplicarlo">
            Descartar
          </button>
        </div>
        </span>
      ),
    },
  ];

  return (
    <>
    <EstadoLecturas />
    <div className="glass-panel" style={{ padding: "18px 20px", display: "flex", flexDirection: "column", gap: "12px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
        <h3 style={{ fontSize: "1.05rem" }}>
          📥 Cola de pedidos <span style={{ color: "var(--text-muted)", fontWeight: 500 }}>({items.length} de {MAXIMO_COLA})</span>
          {lectura && <span style={{ color: "var(--primary)", fontWeight: 600, fontSize: "0.85rem" }}> · leyendo {lectura.hechos + 1} de {lectura.total}…<button type="button" className="btn btn-secondary" style={{ marginLeft: "8px", padding: "1px 8px", fontSize: "0.78rem" }} onClick={() => void cancelarLecturas()}>✖ Cancelar lectura</button></span>}
        </h3>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
          <button type="button" className="btn btn-secondary" style={{ padding: "6px 14px", fontSize: "0.85rem" }} onClick={() => setMarcados(elegidos.length === items.length ? [] : items.map((i) => i.id))} title="Elige todos los pedidos de la cola, o quita la elección si ya están todos elegidos">
            {elegidos.length === items.length ? "Quitar la elección" : `Elegir todos (${items.length})`}
          </button>
          <button type="button" className="btn btn-secondary" style={{ padding: "6px 14px", fontSize: "0.85rem" }} disabled={elegidos.length === 0 || releyendo !== null} onClick={() => void releer(items.filter((i) => elegidos.includes(i.id)))} title="Vuelve a leer el PDF de los pedidos elegidos con el lector actual; sus datos se actualizan en la cola">
            {releyendo ? `🔄 Releyendo ${Math.min(releyendo.hechos + 1, releyendo.total)} de ${releyendo.total}…` : `🔄 Releer lo elegido (${elegidos.length})`}
          </button>
          <button type="button" className="btn btn-secondary" style={{ padding: "6px 14px", fontSize: "0.85rem", color: elegidos.length > 0 ? "var(--danger)" : undefined }} disabled={elegidos.length === 0} onClick={descartarElegidos} title="Descarta de la cola los pedidos elegidos">
            🗑️ Descartar lo elegido ({elegidos.length})
          </button>
          <button type="button" className="btn btn-primary" style={{ padding: "6px 14px", fontSize: "0.85rem" }} onClick={() => abrirDeCola(items[0].id)}>
            Procesar uno a uno
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            style={{ padding: "6px 14px", fontSize: "0.85rem" }}
            onClick={() => {
              if (window.confirm("¿Descartar todos los pedidos de la cola? Sus ficheros se marcan como eliminados (se borran del todo desde Configuración › BBDD) y habrá que volver a soltarlos para usarlos.")) {
                soltarDocumentos(items);
                vaciarCola();
              }
            }}
          >
            Vaciar cola
          </button>
        </div>
      </div>
      <p style={{ fontSize: "0.82rem", color: "var(--text-muted)", margin: 0 }}>
        Los pedidos leídos esperan aquí hasta que los apliques: puedes cerrar la ventana de un pedido y volver a abrirlo cuando quieras.
      </p>
      <TablaDatos<(typeof items)[number]>
        id="cola-pedidos-v2"
        alVerFilas={verFilas}
        columnas={columnasCola}
        filas={items}
        clave={(i) => i.id}
        placeholder="Buscar por pedido, cliente, vehículo…"
        vacio="La cola está vacía."
      />

      {actual && !actual.idExpediente && (
        <PedidoRapidoModal
          key={`${actual.id}-${actual.version ?? 0}`}
          item={actual}
          marcas={marcas}
          tiposVenta={tiposVenta}
          vendedorId={vendedorId}
          posicion={indice + 1}
          total={items.length}
          alIr={ir}
          alCerrar={() => abrirDeCola(null)}
          alTerminar={terminado}
          alDescartar={() => terminado("Pedido descartado.")}
        />
      )}
      {actual && actual.idExpediente && expediente?.idItem === actual.id && (
        <RellenarDesdePedidoModal
          key={actual.id}
          expediente={expediente.datos}
          pedido={actual.pedido}
          posicion={indice + 1}
          total={items.length}
          alIr={ir}
          alCerrar={() => abrirDeCola(null)}
          alTerminar={(_cambios, mensaje) => terminado(mensaje)}
        />
      )}
    </div>
    </>
  );
}
