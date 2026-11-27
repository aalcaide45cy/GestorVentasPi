"use client";

import { useRef, useState } from "react";
import ColaPedidos from "@/components/ColaPedidos";
import { llamar } from "@/components/comisiones/api";
import { useLeerPedidos } from "@/components/documentos/leerPedidos";
import PanelPagosRci from "@/components/pagos-rci/PanelPagosRci";
import { useToast } from "@/components/Toast";
import { textoAsignaciones } from "@/lib/asignaciones-aviso";
import type { MarcaDto, ModeloDto, TipoVentaDto } from "@/lib/dto";
import { subirPagosRci } from "@/lib/pagos-rci-cliente";
import { useRouter } from "next/navigation";

export interface DatosOcr {
  marcas: (MarcaDto & { modelos: ModeloDto[] })[];
  tiposVenta: TipoVentaDto[];
  idUsuario: number;
}

/** ¿El fichero es un pago de la financiera (RCI)? Si no se puede saber, se trata como pedido (el lector de pedidos lo descarta si no lo es). */
async function esPago(f: File): Promise<boolean> {
  try {
    const r = await fetch(`/api/documentos/leer?tipo=es-pago&nombre=${encodeURIComponent(f.name)}`, { method: "POST", headers: { "Content-Type": f.type || "application/octet-stream" }, body: f, credentials: "same-origin", signal: AbortSignal.timeout(120_000) });
    const j = (await r.json()) as { data?: { esPago: boolean } };
    return !!j.data?.esPago;
  } catch {
    return false;
  }
}

/**
 * «Pedido OCR» y «Pago RCI - OCR» de la barra de Expedientes. Los dos admiten cualquiera de los dos documentos: cada fichero se reconoce y va a su
 * lector (el pago fija la fecha RCI de su expediente; el pedido abre su ventana para crear o completar el expediente).
 */
export default function BotonesOcr({ marcas, tiposVenta, idUsuario }: DatosOcr) {
  const { mostrar } = useToast();
  const router = useRouter();
  const { leer } = useLeerPedidos();
  const [ocupado, setOcupado] = useState(false);
  const [verPagos, setVerPagos] = useState(false);
  const entrada = useRef<HTMLInputElement>(null);

  const subir = async (ficheros: File[]) => {
    if (ficheros.length === 0) return;
    setOcupado(true);
    try {
      const pagos: File[] = [];
      const pedidos: File[] = [];
      for (const f of ficheros) (await esPago(f) ? pagos : pedidos).push(f);
      if (pedidos.length > 0) await leer(pedidos);
      if (pagos.length > 0) {
        const r = await subirPagosRci(pagos, () => undefined);
        const partes = [r.aplicados > 0 && `${r.aplicados} aplicado(s)`, r.pendientes > 0 && `${r.pendientes} pendiente(s) de decidir`, r.ignorados > 0 && `${r.ignorados} ignorado(s)`, r.duplicados > 0 && `${r.duplicados} repetido(s)`].filter(Boolean);
        mostrar(partes.length > 0 ? `Pagos de RCI: ${partes.join(", ")}.${textoAsignaciones(r.asignados, "Asignado")}` : "No se ha podido leer ningún pago.", r.errores.length > 0 && r.aplicados === 0 ? "error" : undefined);
        if (r.errores.length > 0) mostrar(`${r.errores.length} fichero(s) con error: ${r.errores[0]}`, "error");
        if (r.pendientes > 0) setVerPagos(true);
        router.refresh();
      }
    } catch (e) {
      mostrar(e instanceof Error ? e.message : "No se ha podido leer el documento", "error");
    } finally {
      setOcupado(false);
    }
  };

  const boton = (texto: string) => (
    <button type="button" className="btn btn-primary" style={{ padding: "5px 12px", fontSize: "0.82rem" }} disabled={ocupado} onClick={() => entrada.current?.click()} title="Elige uno o varios PDF o fotos. Vale tanto un pedido como un pago de RCI: se reconoce solo.">
      {ocupado ? "⏳ Leyendo…" : texto}
    </button>
  );

  return (
    <>
      {boton("📄 Pedido OCR")}
      {boton("💳 Pago RCI - OCR")}
      <input ref={entrada} type="file" multiple accept="image/*,.pdf,application/pdf" style={{ display: "none" }} onChange={(e) => { const f = Array.from(e.target.files ?? []); e.target.value = ""; void subir(f); }} />
      {/* La ventana de cada pedido leído (sin la tabla de la cola, que sigue en el Dashboard y en Herramientas) */}
      <ColaPedidos marcas={marcas} tiposVenta={tiposVenta} vendedorId={idUsuario} soloVentana />
      {verPagos && <PanelPagosRci alCerrar={() => setVerPagos(false)} alCambiar={() => router.refresh()} />}
    </>
  );
}
