"use client";

import TablaDatos, { type ColumnaTabla } from "@/components/TablaDatos";
import { useEffect, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/Toast";
import { llamar, textoError } from "@/components/comisiones/api";
import type { ExpedienteDto, MarcaDto, ModeloDto, TipoVentaDto } from "@/lib/dto";
import { formatDate } from "@/lib/date-utils";
import { MAXIMO_COLA, abrirDeCola, colaVacia, leerCola, cancelarLectura, leerLectura, quitarDeCola, suscribirCola, suscribirLectura, vaciarCola } from "@/lib/pedidos-cola";
import PedidoRapidoModal from "./PedidoRapidoModal";
import RellenarDesdePedidoModal from "./RellenarDesdePedidoModal";

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

  /** Quita el pedido aplicado y abre el siguiente de la cola, si lo hay. */
  const terminado = (mensaje: string) => {
    if (!actual) return;
    const siguiente = items[indice + 1] ?? items[indice - 1] ?? null;
    quitarDeCola(actual.id);
    mostrar(mensaje);
    router.refresh();
    abrirDeCola(siguiente && siguiente.id !== actual.id ? siguiente.id : null);
  };

  if (items.length === 0) return null;

  const columnasCola: ColumnaTabla<(typeof items)[number]>[] = [
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
    { clave: "tipo", etiqueta: "VN / VO", valor: (i) => (i.pedido.datos.tipoPedido === "usado" ? "VO" : i.pedido.datos.tipoPedido === "nuevo" ? "VN" : ""), alinear: "center" },
    { clave: "vehiculo", etiqueta: "Vehículo", valor: (i) => i.pedido.datos.modeloTexto ?? "", celda: (i) => i.pedido.datos.modeloTexto ?? "—" },
    { clave: "fecha", etiqueta: "Fecha", valor: (i) => i.pedido.datos.fechaExpediente ?? "", celda: (i) => (i.pedido.datos.fechaExpediente ? formatDate(i.pedido.datos.fechaExpediente) : "—") },
    { clave: "destino", etiqueta: "Destino", valor: (i) => (i.idExpediente ? `Completar expediente #${i.idExpediente}` : i.eleccion ? `Nuevo: ${i.eleccion.nombreModelo} · ${i.eleccion.tipo.nombre_tipo_venta}` : "Nuevo expediente") },
    {
      clave: "acciones",
      etiqueta: "",
      valor: () => "",
      celda: (i) => (
        <span style={{ display: "inline-flex", gap: "6px" }}>
        <div style={{ display: "flex", gap: "6px" }}>
          <button type="button" className="btn btn-secondary" style={{ padding: "4px 10px", fontSize: "0.8rem" }} onClick={() => abrirDeCola(i.id)}>
            Abrir
          </button>
          <button type="button" className="btn btn-secondary" style={{ padding: "4px 10px", fontSize: "0.8rem", color: "var(--danger)" }} onClick={() => quitarDeCola(i.id)} title="Quita el pedido de la cola sin aplicarlo">
            Descartar
          </button>
        </div>
        </span>
      ),
    },
  ];

  return (
    <div className="glass-panel" style={{ padding: "18px 20px", display: "flex", flexDirection: "column", gap: "12px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
        <h3 style={{ fontSize: "1.05rem" }}>
          📥 Cola de pedidos <span style={{ color: "var(--text-muted)", fontWeight: 500 }}>({items.length} de {MAXIMO_COLA})</span>
          {lectura && <span style={{ color: "var(--primary)", fontWeight: 600, fontSize: "0.85rem" }}> · leyendo {lectura.hechos + 1} de {lectura.total}…<button type="button" className="btn btn-secondary" style={{ marginLeft: "8px", padding: "1px 8px", fontSize: "0.78rem" }} onClick={cancelarLectura}>✖ Cancelar lectura</button></span>}
        </h3>
        <div style={{ display: "flex", gap: "8px" }}>
          <button type="button" className="btn btn-primary" style={{ padding: "6px 14px", fontSize: "0.85rem" }} onClick={() => abrirDeCola(items[0].id)}>
            Procesar uno a uno
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            style={{ padding: "6px 14px", fontSize: "0.85rem" }}
            onClick={() => {
              if (window.confirm("¿Descartar todos los pedidos de la cola? Los ficheros ya leídos quedan guardados como documentos sin asignar, pero habrá que volver a soltarlos para usarlos.")) vaciarCola();
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
        id="cola-pedidos"
        columnas={columnasCola}
        filas={items}
        clave={(i) => i.id}
        placeholder="Buscar por pedido, cliente, vehículo…"
        vacio="La cola está vacía."
      />

      {actual && !actual.idExpediente && (
        <PedidoRapidoModal
          key={actual.id}
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
  );
}
