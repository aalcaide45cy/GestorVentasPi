"use client";

import { useEffect, useState } from "react";
import { useToast } from "@/components/Toast";
import { llamar, textoError } from "@/components/comisiones/api";
import type { AjustesCorreoDto } from "@/lib/correo";

/** Envío automático: los correos nuevos de las reglas salen solos, uno tras otro con una pausa; si no, esperan a que los revises. */
export default function PanelAjustesCorreo({ esAdmin }: { esAdmin: boolean }) {
  const { mostrar } = useToast();
  const [a, setA] = useState<AjustesCorreoDto | null>(null);
  useEffect(() => {
    llamar<AjustesCorreoDto>("/api/correo/ajustes")
      .then((r) => setA(r.data))
      .catch((e: unknown) => mostrar(textoError(e), "error"));
  }, [mostrar]);
  const guardar = async (n: AjustesCorreoDto) => {
    setA(n);
    try {
      await llamar("/api/correo/ajustes", { method: "PUT", cuerpo: n });
    } catch (e) {
      mostrar(textoError(e), "error");
    }
  };
  if (!a) return null;
  return (
    <div
      className="glass-panel"
      style={{
        padding: "14px 18px",
        display: "flex",
        flexDirection: "column",
        gap: "12px",
        maxWidth: "640px",
      }}
    >
      <label style={{ display: "flex", gap: "8px", alignItems: "flex-start" }}>
        <input
          type="checkbox"
          checked={a.envio_automatico}
          disabled={!esAdmin}
          onChange={(e) =>
            void guardar({ ...a, envio_automatico: e.target.checked })
          }
        />
        <span>
          <strong>Enviar solos los correos que crean las reglas</strong>
          <div style={{ fontSize: "0.82rem", color: "var(--text-secondary)" }}>
            Desactivado (recomendado al principio): los correos esperan en la
            cola, tú los revisas y pulsas «Enviar». Activado: salen uno tras
            otro sin que tengas que hacer nada.
          </div>
        </span>
      </label>
      <label style={{ display: "flex", gap: "8px", alignItems: "center" }}>
        Pausa entre un correo y el siguiente
        <select
          className="form-input"
          value={a.pausa_segundos}
          disabled={!esAdmin}
          onChange={(e) =>
            void guardar({ ...a, pausa_segundos: Number(e.target.value) })
          }
          style={{ width: "auto" }}
        >
          {[5, 10, 15, 30, 60].map((s) => (
            <option key={s} value={s}>
              {s} segundos
            </option>
          ))}
        </select>
      </label>
      {!esAdmin && (
        <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
          Solo el administrador cambia estos ajustes.
        </span>
      )}
      <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
        El límite de correos al día se pone en cada cuenta (pestaña Cuentas).
      </span>
    </div>
  );
}
