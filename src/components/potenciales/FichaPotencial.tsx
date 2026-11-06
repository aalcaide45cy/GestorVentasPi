"use client";

import Link from "next/link";
import { useState } from "react";
import Modal from "@/components/Modal";
import { useToast } from "@/components/Toast";
import { llamar, textoError } from "@/components/comisiones/api";
import type { PotencialDto } from "@/lib/servicios/potenciales";

const euros = (c: number | null) =>
  c === null
    ? "—"
    : `${(c / 100).toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
const fecha = (f: string | null) =>
  f ? f.split("-").reverse().join("/") : "—";
export const ETIQUETA_ESTADO = {
  activo: "Activo",
  baja: "Dado de baja",
  compro: "Ya compró",
  posible: "Posible compra",
} as const;
export const COLOR_ESTADO = {
  activo: "var(--success)",
  baja: "var(--text-muted)",
  compro: "var(--primary)",
  posible: "var(--warning)",
} as const;

/** La ficha de un cliente potencial: sus datos, sus presupuestos y lo que se puede hacer (baja, reactivar, aclarar si ya compró). */
export default function FichaPotencial({
  potencial,
  alCerrar,
  alCambiar,
}: {
  potencial: PotencialDto;
  alCerrar: () => void;
  alCambiar: () => void;
}) {
  const { mostrar, confirmar } = useToast();
  const [p, setP] = useState(potencial);
  const [nombre, setNombre] = useState(potencial.nombre);
  const [email, setEmail] = useState(potencial.email);
  const [telefono, setTelefono] = useState(potencial.telefono);
  const [notas, setNotas] = useState(potencial.notas);
  const [ocupado, setOcupado] = useState(false);

  const enviar = async (cuerpo: Record<string, unknown>, ok?: string) => {
    setOcupado(true);
    try {
      const r = await llamar<PotencialDto>(`/api/potenciales?id=${p.id}`, {
        method: "PUT",
        cuerpo,
      });
      setP(r.data);
      setNombre(r.data.nombre);
      setEmail(r.data.email);
      setTelefono(r.data.telefono);
      if (ok) mostrar(ok);
      alCambiar();
    } catch (e) {
      mostrar(textoError(e), "error");
    } finally {
      setOcupado(false);
    }
  };
  const cambiaron =
    nombre !== p.nombre ||
    email !== p.email ||
    telefono !== p.telefono ||
    notas !== p.notas;
  const btn = { padding: "4px 12px", fontSize: "0.82rem" } as const;
  return (
    <Modal
      titulo={`🎯 ${p.nombre}`}
      ancho="min(calc(96 * var(--uvw)), 760px)"
      pie={
        <>
          <button
            type="button"
            className="btn btn-secondary"
            style={{ marginRight: "auto", color: "var(--danger)" }}
            disabled={ocupado}
            onClick={async () => {
              if (
                !(await confirmar({
                  titulo: "Quitar al cliente potencial",
                  texto: `¿Quitar a «${p.nombre}» y sus presupuestos? No se puede deshacer.`,
                  aceptar: "Quitar",
                  peligro: true,
                }))
              )
                return;
              try {
                await llamar(`/api/potenciales?id=${p.id}`, {
                  method: "DELETE",
                });
                alCambiar();
                alCerrar();
              } catch (e) {
                mostrar(textoError(e), "error");
              }
            }}
          >
            🗑️ Quitar
          </button>
          {cambiaron && (
            <button
              type="button"
              className="btn btn-primary"
              disabled={ocupado}
              onClick={() =>
                void enviar(
                  { nombre, email, telefono, notas },
                  "Datos guardados",
                )
              }
            >
              Guardar cambios
            </button>
          )}
          <button
            type="button"
            className="btn btn-secondary"
            onClick={alCerrar}
          >
            Cerrar
          </button>
        </>
      }
    >
      <div
        style={{
          display: "flex",
          gap: "8px",
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <span
          style={{
            border: `1px solid ${COLOR_ESTADO[p.estado]}`,
            color: COLOR_ESTADO[p.estado],
            borderRadius: "999px",
            padding: "1px 10px",
            fontSize: "0.8rem",
            fontWeight: 700,
          }}
        >
          {ETIQUETA_ESTADO[p.estado]}
        </span>
        {p.id_expediente && (
          <Link
            href={`/dashboard/expedientes/editar/${p.id_expediente}`}
            style={{ fontSize: "0.85rem" }}
          >
            📁 Ver el expediente #EXP-{String(p.id_expediente).padStart(4, "0")}
          </Link>
        )}
        {p.estado === "baja" && p.baja_en && (
          <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
            Baja el {new Date(p.baja_en).toLocaleDateString("es-ES")} ·{" "}
            {p.baja_motivo}
          </span>
        )}
      </div>
      {p.estado === "posible" && (
        <div
          style={{
            padding: "8px 12px",
            border: "1px solid var(--warning)",
            borderRadius: "var(--radius-sm)",
            fontSize: "0.88rem",
          }}
        >
          Hay un expediente con el mismo nombre. ¿Es la misma persona?
          <span
            style={{ display: "inline-flex", gap: "6px", marginLeft: "8px" }}
          >
            <button
              type="button"
              className="btn btn-secondary"
              style={btn}
              disabled={ocupado}
              onClick={() =>
                void enviar(
                  { accion: "si_es_comprador" },
                  "Marcado como que ya compró",
                )
              }
            >
              Sí, ya compró
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              style={btn}
              disabled={ocupado}
              onClick={() =>
                void enviar(
                  { accion: "no_es_comprador" },
                  "Queda como cliente potencial",
                )
              }
            >
              No es la misma persona
            </button>
          </span>
        </div>
      )}
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
        <label
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "4px",
            flex: 2,
            minWidth: "220px",
          }}
        >
          Nombre
          <input
            className="form-input"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
          />
        </label>
        <label
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "4px",
            flex: 2,
            minWidth: "220px",
          }}
        >
          Correo
          <input
            className="form-input"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "4px",
            flex: 1,
            minWidth: "140px",
          }}
        >
          Teléfono
          <input
            className="form-input"
            value={telefono}
            onChange={(e) => setTelefono(e.target.value)}
          />
        </label>
      </div>
      <div style={{ fontSize: "0.82rem", color: "var(--text-secondary)" }}>
        {[p.poblacion, p.provincia, p.codigo_postal]
          .filter(Boolean)
          .join(" · ") || "Sin población"}
      </div>
      <label style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
        Notas
        <textarea
          className="form-input"
          rows={2}
          value={notas}
          onChange={(e) => setNotas(e.target.value)}
          style={{ resize: "vertical" }}
        />
      </label>
      <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
        <strong style={{ fontSize: "0.9rem" }}>
          Presupuestos ({p.presupuestos.length})
        </strong>
        {p.presupuestos.map((x) => (
          <div
            key={x.id}
            className="glass-panel"
            style={{
              padding: "6px 12px",
              display: "flex",
              gap: "12px",
              alignItems: "baseline",
              flexWrap: "wrap",
              fontSize: "0.85rem",
            }}
          >
            <strong>{x.numero}</strong>
            <span>
              {fecha(x.fecha)}
              {x.hora ? ` ${x.hora}` : ""}
            </span>
            <span style={{ flex: 1, minWidth: "180px" }}>
              {[x.marca, x.modelo].filter(Boolean).join(" ") || x.modelo_texto}
              {x.color ? ` · ${x.color}` : ""}
            </span>
            <span>{euros(x.total_centimos)}</span>
            {x.id_adjunto && (
              <a
                href={`/api/adjuntos?id=${x.id_adjunto}`}
                target="_blank"
                rel="noreferrer"
              >
                📄 Ver PDF
              </a>
            )}
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
        {p.estado !== "baja" ? (
          <button
            type="button"
            className="btn btn-secondary"
            style={btn}
            disabled={ocupado}
            onClick={() =>
              void enviar(
                { accion: "baja" },
                "Dado de baja: no recibirá más correos",
              )
            }
          >
            🚫 Dar de baja (no escribirle más)
          </button>
        ) : (
          <button
            type="button"
            className="btn btn-secondary"
            style={btn}
            disabled={ocupado}
            onClick={() => void enviar({ accion: "reactivar" }, "Reactivado")}
          >
            ↩️ Reactivar
          </button>
        )}
      </div>
    </Modal>
  );
}
