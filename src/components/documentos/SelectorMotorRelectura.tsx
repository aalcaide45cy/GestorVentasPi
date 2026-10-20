"use client";

import { useEffect, useState } from "react";
import { llamar } from "@/components/comisiones/api";
import { usePreferencia } from "@/lib/preferencias";
import type { AjustesOcrDto } from "@/app/api/admin/ocr/route";

const CLAVE = "releer-motor";

/**
 * Elige con qué motor de OCR se vuelve a leer un pedido, solo para esa relectura (el motor de Configuración no cambia). Lo ven los
 * administradores, que son quienes pueden ver los motores. Lo último elegido se recuerda en este navegador.
 */
export function useMotorDeRelectura(): { motor: string | undefined; opciones: AjustesOcrDto["opciones"]; fijar: (v: string) => void; actual: string } {
  const [guardado, fijar] = usePreferencia(CLAVE);
  const [a, setA] = useState<AjustesOcrDto | null>(null);
  useEffect(() => {
    let vivo = true;
    llamar<AjustesOcrDto>("/api/admin/ocr")
      .then((r) => vivo && setA(r.data))
      .catch(() => undefined);
    return () => {
      vivo = false;
    };
  }, []);
  const opciones = a?.opciones ?? [];
  const valido = guardado && opciones.some((o) => o.id === guardado) ? guardado : "";
  return { motor: valido || undefined, opciones, fijar, actual: a?.motor ?? "" };
}

export default function SelectorMotorRelectura({ compacto = false }: { compacto?: boolean }) {
  const { opciones, fijar, motor, actual } = useMotorDeRelectura();
  if (opciones.length === 0) return null;
  return (
    <label style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "0.8rem", color: "var(--text-secondary)", whiteSpace: "nowrap" }} title="Motor de lectura (OCR) con el que se vuelve a leer. «El de Configuración» usa el elegido en Configuración; elegir otro vale solo para estas relecturas.">
      {!compacto && <span>Releer con</span>}
      <select className="form-input" value={motor ?? ""} onChange={(e) => fijar(e.target.value)} style={{ padding: "3px 8px", fontSize: "0.8rem", maxWidth: "260px" }}>
        <option value="">El de Configuración{actual ? ` (${opciones.find((o) => o.id === actual)?.nombre ?? actual})` : ""}</option>
        {opciones.map((o) => (
          <option key={o.id} value={o.id}>
            {o.nombre}
          </option>
        ))}
      </select>
    </label>
  );
}
