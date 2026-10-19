"use client";

import { useRef, useState } from "react";
import { useToast } from "@/components/Toast";
import { ErrorPagoRci, fechaCorta, subirPagoRci } from "@/lib/pagos-rci-cliente";

/**
 * Cajita de la ficha del expediente para subir su pago de la financiera: se lee el PDF, se comprueba que el documento del adquiriente es
 * el del cliente y se fija la fecha RCI con la fecha de pago. El pago queda guardado con el expediente.
 */
export default function CajaPagoRci({ idExpediente, alAplicado }: { idExpediente: number; alAplicado: (fechaPago: string) => void }) {
  const { mostrar } = useToast();
  const entrada = useRef<HTMLInputElement>(null);
  const [subiendo, setSubiendo] = useState(false);

  const subir = async (f: File | undefined) => {
    if (!f) return;
    setSubiendo(true);
    try {
      let p;
      try {
        p = await subirPagoRci(f, { idExpediente });
      } catch (e) {
        // Documento distinto al del cliente: se pregunta antes de aplicarlo igualmente
        if (e instanceof ErrorPagoRci && e.estado === 409 && window.confirm(`${e.message}\n\n¿Aplicarlo de todos modos?`)) p = await subirPagoRci(f, { idExpediente, forzar: true });
        else throw e;
      }
      if (p.estado === "aplicado" && p.fechaPago) {
        alAplicado(p.fechaPago);
        mostrar(`Fecha RCI fijada: ${fechaCorta(p.fechaPago)} (fecha de pago de la financiera).`);
      } else {
        mostrar(p.motivo ?? "El pago se ha guardado pero no se ha podido aplicar.", "error");
      }
    } catch (e) {
      mostrar(e instanceof Error ? e.message : "No se pudo leer el pago", "error");
    } finally {
      setSubiendo(false);
      if (entrada.current) entrada.current.value = "";
    }
  };

  return (
    <div style={{ gridColumn: "1 / -1", display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap", fontSize: "0.82rem", color: "var(--text-secondary)" }}>
      <input ref={entrada} type="file" accept=".pdf,image/*,application/pdf" style={{ display: "none" }} onChange={(e) => void subir(e.target.files?.[0])} />
      <button type="button" className="btn btn-secondary" style={{ padding: "4px 12px" }} disabled={subiendo} onClick={() => entrada.current?.click()} title="Sube el «Detalle de la liquidación de pago» de la financiera (RCI / Mobilize): se lee y la fecha de pago pasa a ser la fecha RCI de este expediente">
        {subiendo ? "Leyendo…" : "💳 Subir el pago de RCI"}
      </button>
      <span>La fecha de pago de la financiera se pone como fecha RCI.</span>
    </div>
  );
}
