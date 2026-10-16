"use client";

import { CLAVE_VENTANA_SOLO_SI_NUEVO, usePreferencia } from "@/lib/preferencias";

const AYUDA =
  "QUÉ HACE: al leer un pedido, si la marca y el modelo ya existen en la app y no hay nada que decidir (cliente claro, sin duplicado, forma de pago reconocida), el expediente se crea directamente y solo ves un aviso verde con el resumen. " +
  "CUÁNDO USARLO: cuando metes muchos pedidos y te sobra confirmar uno por uno. " +
  "Si la marca o el modelo no existen, o hay cualquier duda, sale la ventana como siempre para que lo corrijas. " +
  "Es la misma opción que en Mis datos y se recuerda en este navegador.";

/**
 * Casilla «Ventana solo si falta marca o modelo». Es la misma preferencia en todos los sitios donde aparece (Mis datos y junto a
 * la zona de arrastrar pedidos): al cambiarla en uno se actualiza en los demás al momento.
 */
export default function OpcionVentanaPedido({ largo = false }: { largo?: boolean }) {
  const [valor, fijar] = usePreferencia(CLAVE_VENTANA_SOLO_SI_NUEVO);
  return (
    <label title={AYUDA} style={{ display: "flex", alignItems: largo ? "flex-start" : "center", gap: largo ? "12px" : "6px", cursor: "pointer", userSelect: "none", fontSize: largo ? undefined : "0.75rem", color: largo ? undefined : "var(--text-secondary)" }} onClick={(e) => e.stopPropagation()}>
      <input type="checkbox" checked={valor === "true"} onChange={(e) => fijar(String(e.target.checked))} style={{ width: largo ? "16px" : "14px", height: largo ? "16px" : "14px", cursor: "pointer", marginTop: largo ? "3px" : 0 }} />
      {largo ? (
        <span>
          <strong>Mostrar la ventana de confirmación solo cuando la marca o el modelo no existan</strong>
          <span style={{ display: "block", fontSize: "0.85rem", color: "var(--text-muted)" }}>
            Al leer un pedido por OCR, si la marca y el modelo ya existen y no hay nada que decidir, el expediente se crea sin preguntar y ves un aviso verde con el resumen. Si falta la marca o el modelo, o hay cualquier duda (cliente repetido, pedido duplicado, forma de pago sin reconocer), sale la ventana como siempre. Por defecto está desactivada. Se recuerda en este navegador.
          </span>
        </span>
      ) : (
        <span>Ventana solo si falta marca o modelo</span>
      )}
    </label>
  );
}
