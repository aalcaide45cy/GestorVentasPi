"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useToast } from "@/components/Toast";
import ZonaSoltar from "@/components/documentos/ZonaSoltar";
import { subirPagosRci } from "@/lib/pagos-rci-cliente";
import type { PagoRciDto } from "@/lib/servicios/pagos-rci";
import PanelPagosRci from "./PanelPagosRci";

/**
 * Zona del panel para arrastrar los pagos de la financiera (RCI) en masa: solo se cogen los pagos, el resto se ignora (y se puede
 * revisar). Cada pago fija la fecha RCI de su expediente cuando no hay duda; lo dudoso queda pendiente en la lista.
 */
export default function ZonaPagosRci() {
  const { mostrar } = useToast();
  const [progreso, setProgreso] = useState<{ hechos: number; total: number } | null>(null);
  const [pendientes, setPendientes] = useState(0);
  const [abierto, setAbierto] = useState(false);
  const archivos = useRef<HTMLInputElement>(null);
  const carpeta = useRef<HTMLInputElement>(null);

  const contar = useCallback(async () => {
    try {
      const r = await fetch("/api/pagos-rci", { credentials: "same-origin", cache: "no-store" });
      const j = (await r.json()) as { data?: PagoRciDto[] };
      setPendientes((j.data ?? []).filter((p) => p.estado === "pendiente").length);
    } catch {
      /* el contador es una comodidad */
    }
  }, []);
  useEffect(() => {
    void Promise.resolve().then(contar);
  }, [contar]);

  const subir = async (lista: File[]) => {
    const ficheros = lista.filter((f) => f.type.startsWith("image/") || f.type === "application/pdf" || /\.(pdf|jpe?g|png|webp)$/i.test(f.name));
    if (ficheros.length === 0) return;
    setProgreso({ hechos: 0, total: ficheros.length });
    try {
      const r = await subirPagosRci(ficheros, (hechos, total) => setProgreso({ hechos, total }));
      const partes = [r.aplicados > 0 && `${r.aplicados} aplicado(s)`, r.pendientes > 0 && `${r.pendientes} pendiente(s) de decidir`, r.ignorados > 0 && `${r.ignorados} ignorado(s)`, r.duplicados > 0 && `${r.duplicados} repetido(s)`].filter(Boolean);
      mostrar(partes.length > 0 ? `Pagos de RCI: ${partes.join(", ")}.` : "No se ha podido leer ningún pago.", r.errores.length > 0 && r.aplicados === 0 ? "error" : undefined);
      if (r.errores.length > 0) mostrar(`${r.errores.length} fichero(s) con error: ${r.errores[0]}`, "error");
      await contar();
      if (r.pendientes > 0 || r.ignorados > 0) setAbierto(true);
    } finally {
      setProgreso(null);
    }
  };
  const elegidos = (l: FileList | null) => void subir(Array.from(l ?? []));
  const ocupado = progreso !== null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px", flex: "1 1 180px", minWidth: "160px" }}>
      <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
        <button type="button" className="btn btn-primary" style={{ padding: "6px 12px", fontSize: "0.82rem" }} disabled={ocupado} onClick={() => archivos.current?.click()} title="Elige uno o varios PDF de pagos de la financiera (RCI / Mobilize)">
          💳 Cargar pagos RCI
        </button>
        <button type="button" className="btn btn-secondary" style={{ padding: "6px 12px", fontSize: "0.82rem" }} disabled={ocupado} onClick={() => carpeta.current?.click()} title="Elige una carpeta entera: se cogen los pagos de la financiera y el resto se ignora">
          📁 Cargar carpeta
        </button>
        <button type="button" className="btn btn-secondary" style={{ padding: "6px 12px", fontSize: "0.82rem" }} onClick={() => setAbierto(true)} title="Ver los pagos subidos: aplicados, pendientes de decidir e ignorados">
          📋 Ver pagos{pendientes > 0 ? ` (${pendientes} pendientes)` : ""}
        </button>
        <input ref={archivos} type="file" multiple accept="image/*,.pdf,application/pdf" style={{ display: "none" }} onChange={(e) => { elegidos(e.target.files); e.target.value = ""; }} />
        <input ref={carpeta} type="file" multiple style={{ display: "none" }} {...({ webkitdirectory: "", directory: "" } as Record<string, string>)} onChange={(e) => { elegidos(e.target.files); e.target.value = ""; }} />
      </div>
      <ZonaSoltar
        icono="💳"
        titulo="Arrastra aquí los pagos de RCI"
        ayuda="Arrastra uno o varios «Detalle de la liquidación de pago» de la financiera (PDF o foto). Se busca el expediente de cada uno (bastidor, matrícula o documento del adquiriente) y la fecha de pago pasa a ser su fecha RCI. Lo que no sea un pago se ignora y se puede revisar; lo dudoso queda pendiente."
        multiple
        compacta
        ocupado={ocupado}
        textoOcupado={progreso ? `Leyendo ${Math.min(progreso.hechos + 1, progreso.total)} de ${progreso.total}…` : "Leyendo…"}
        alSoltar={subir}
      />
      {abierto && <PanelPagosRci alCerrar={() => { setAbierto(false); void contar(); }} alCambiar={() => void contar()} />}
    </div>
  );
}
