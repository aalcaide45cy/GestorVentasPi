"use client";

import { useState } from "react";
import { useToast } from "@/components/Toast";
import { textoError } from "@/components/comisiones/api";
import type { ResultadoDni, ResultadoPedido } from "@/lib/servicios/documentos";

type Tipo = "dni" | "pedido";

interface Props<T> {
  tipo: Tipo;
  etiqueta: string;
  /** Datos leídos: la pantalla rellena sus campos con ellos. */
  alLeer: (resultado: T) => void;
  disabled?: boolean;
}

/** Sube un DNI o un pedido al servidor, que lo lee con OCR local y devuelve los datos para rellenar la ficha. */
function BotonLeer<T>({ tipo, etiqueta, alLeer, disabled }: Props<T>) {
  const { mostrar } = useToast();
  const [leyendo, setLeyendo] = useState(false);

  const leer = async (f: File | null) => {
    if (!f) return;
    setLeyendo(true);
    try {
      const r = await fetch(`/api/documentos/leer?tipo=${tipo}&nombre=${encodeURIComponent(f.name)}`, { method: "POST", headers: { "Content-Type": f.type || "application/octet-stream" }, body: f, credentials: "same-origin" });
      const json = (await r.json().catch(() => ({}))) as { message?: string; data?: T };
      if (!r.ok || !json.data) throw new Error(json.message ?? `Error ${r.status}`);
      alLeer(json.data);
    } catch (e) {
      mostrar(textoError(e), "error");
    } finally {
      setLeyendo(false);
    }
  };

  return (
    <label className="btn btn-secondary" style={{ cursor: disabled || leyendo ? "wait" : "pointer", opacity: disabled ? 0.6 : 1 }} title="Se lee en tu propio equipo; no se envía nada a internet.">
      {leyendo ? "Leyendo documento…" : etiqueta}
      <input type="file" accept="image/*,.pdf,application/pdf" style={{ display: "none" }} disabled={disabled || leyendo} onChange={(e) => { void leer(e.target.files?.[0] ?? null); e.target.value = ""; }} />
    </label>
  );
}

export const BotonLeerDni = (p: Omit<Props<ResultadoDni>, "tipo" | "etiqueta"> & { etiqueta?: string }) => <BotonLeer<ResultadoDni> tipo="dni" etiqueta={p.etiqueta ?? "📷 Leer DNI"} alLeer={p.alLeer} disabled={p.disabled} />;
export const BotonLeerPedido = (p: Omit<Props<ResultadoPedido>, "tipo" | "etiqueta"> & { etiqueta?: string }) => <BotonLeer<ResultadoPedido> tipo="pedido" etiqueta={p.etiqueta ?? "📄 Leer pedido"} alLeer={p.alLeer} disabled={p.disabled} />;

/** Vincula adjuntos subidos antes de guardar (pendientes) al cliente o expediente ya creado. */
export async function vincularAdjuntos(ids: number[], destino: { idCliente?: number | null; idExpediente?: number | null }): Promise<void> {
  if (ids.length === 0) return;
  const r = await fetch("/api/adjuntos/vincular", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids, ...destino }), credentials: "same-origin" });
  if (!r.ok) throw new Error(((await r.json().catch(() => ({}))) as { message?: string }).message ?? "No se han podido vincular los documentos.");
}
