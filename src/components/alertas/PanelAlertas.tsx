"use client";

import { useState } from "react";
import Modal from "@/components/Modal";
import { useToast } from "@/components/Toast";
import PosponerFecha from "./PosponerFecha";
import type { AlertaDto } from "@/lib/alertas";
import {
  APLAZAMIENTOS,
  cuando,
  useBotonesRapidos,
  type Aplazamiento,
  type CuerpoAlerta,
} from "./aspecto-alertas";

interface Datos {
  pendientes: AlertaDto[];
  pospuestas: AlertaDto[];
  resueltas: AlertaDto[];
}
type Pestana = "pendientes" | "pospuestas" | "resueltas";

/** El registro de alertas: pendientes, pospuestas y resueltas (últimos 60 días), con sus acciones. */
export default function PanelAlertas({
  datos,
  ocupado,
  alCerrar,
  alAccion,
  alIr,
}: {
  datos: Datos;
  ocupado: boolean;
  alCerrar: () => void;
  alAccion: (cuerpo: CuerpoAlerta, id: number, texto: string) => Promise<void>;
  alIr: (alerta: AlertaDto) => void;
}) {
  const [pestana, setPestana] = useState<Pestana>(
    datos.pendientes.length > 0 || datos.pospuestas.length === 0
      ? "pendientes"
      : "pospuestas",
  );
  const rapidos = useBotonesRapidos();
  const { confirmar } = useToast();
  const lista = datos[pestana];
  const nombres: Record<Pestana, string> = {
    pendientes: "Pendientes",
    pospuestas: "Pospuestas",
    resueltas: "Resueltas",
  };
  return (
    <Modal
      titulo="❗ Alertas"
      ancho="760px"
      pie={
        <button type="button" className="btn btn-primary" onClick={alCerrar}>
          Cerrar
        </button>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          {(Object.keys(nombres) as Pestana[]).map((p) => (
            <button
              key={p}
              type="button"
              className={
                pestana === p ? "btn btn-primary" : "btn btn-secondary"
              }
              onClick={() => setPestana(p)}
              style={{ padding: "4px 12px", fontSize: "0.85rem" }}
            >
              {nombres[p]} ({datos[p].length})
            </button>
          ))}
        </div>
        {pestana === "resueltas" && lista.length > 0 && (
          <div>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={ocupado}
              onClick={async () => {
                if (
                  await confirmar({
                    titulo: "Vaciar las resueltas",
                    texto: `¿Eliminar las ${lista.length} alertas resueltas del registro?`,
                    aceptar: "Eliminar",
                    peligro: true,
                  })
                )
                  void alAccion(
                    { accion: "vaciar_resueltas" },
                    0,
                    "Alertas resueltas eliminadas.",
                  );
              }}
              style={{ padding: "3px 10px", fontSize: "0.78rem" }}
            >
              🗑 Vaciar las resueltas
            </button>
          </div>
        )}
        {lista.length === 0 && (
          <p style={{ margin: 0, color: "var(--text-muted)" }}>
            {pestana === "pendientes"
              ? "No tienes alertas pendientes. 🎉"
              : pestana === "pospuestas"
                ? "No hay alertas pospuestas."
                : "Todavía no hay alertas resueltas."}
          </p>
        )}
        {lista.map((a) => (
          <div
            key={a.id}
            style={{
              border: "1px solid var(--border-light)",
              borderRadius: "var(--radius-sm)",
              padding: "10px 12px",
              display: "flex",
              flexDirection: "column",
              gap: "6px",
              background: "rgba(255, 255, 255, 0.02)",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                gap: "10px",
                flexWrap: "wrap",
              }}
            >
              <strong style={{ fontSize: "0.92rem" }}>{a.regla}</strong>
              <span style={{ fontSize: "0.74rem", color: "var(--text-muted)" }}>
                {cuando(a.creada_en)}
                {a.estado === "pospuesta" && a.pospuesta_hasta
                  ? ` · vuelve a saltar el ${cuando(a.pospuesta_hasta)}`
                  : ""}
                {a.estado === "resuelta" && a.resuelta_en
                  ? ` · ${a.motivo === "hecho" ? "marcada como hecha" : "resuelta sola"} el ${cuando(a.resuelta_en)}`
                  : ""}
              </span>
            </div>
            <span style={{ fontSize: "0.9rem" }}>{a.mensaje}</span>
            <span
              style={{ fontSize: "0.78rem", color: "var(--text-secondary)" }}
            >
              {a.id_expediente === null ? "" : (a.cliente ?? "Sin cliente")}
              {a.matricula ? ` · ${a.matricula}` : ""}
            </span>
            <div
              style={{
                display: "flex",
                gap: "8px",
                flexWrap: "wrap",
                alignItems: "center",
              }}
            >
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => alIr(a)}
                style={{ padding: "3px 10px", fontSize: "0.78rem" }}
              >
                {a.id_expediente !== null
                  ? "Ir al expediente"
                  : "Ir al calendario"}
              </button>
              {a.estado !== "resuelta" && (
                <>
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={ocupado}
                    onClick={() =>
                      void alAccion(
                        { accion: "hecho" },
                        a.id,
                        "Alerta atendida.",
                      )
                    }
                    style={{ padding: "3px 10px", fontSize: "0.78rem" }}
                  >
                    ✔ Hecho
                  </button>
                  {rapidos.map((r) => (
                    <button
                      key={r}
                      type="button"
                      className="btn btn-secondary"
                      disabled={ocupado}
                      onClick={() =>
                        void alAccion(
                          { accion: "posponer", hasta: r },
                          a.id,
                          "Alerta pospuesta.",
                        )
                      }
                      style={{ padding: "3px 10px", fontSize: "0.78rem" }}
                      title={APLAZAMIENTOS.find((x) => x.id === r)?.etiqueta}
                    >
                      ⏰ {APLAZAMIENTOS.find((x) => x.id === r)?.corta}
                    </button>
                  ))}
                  <select
                    className="form-input"
                    aria-label="Posponer"
                    value=""
                    disabled={ocupado}
                    onChange={(e) => {
                      const v = e.target.value as Aplazamiento | "";
                      if (v)
                        void alAccion(
                          { accion: "posponer", hasta: v },
                          a.id,
                          "Alerta pospuesta.",
                        );
                    }}
                    style={{
                      width: "auto",
                      padding: "3px 8px",
                      fontSize: "0.78rem",
                    }}
                  >
                    <option value="">
                      ⏰{" "}
                      {a.estado === "pospuesta" ? "Posponer más…" : "Posponer…"}
                    </option>
                    {APLAZAMIENTOS.map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.etiqueta}
                      </option>
                    ))}
                  </select>
                  <PosponerFecha
                    pequeno
                    ocupado={ocupado}
                    alElegir={(en) =>
                      void alAccion(
                        { accion: "posponer_fecha", en },
                        a.id,
                        "Alerta pospuesta.",
                      )
                    }
                  />
                </>
              )}
              {a.estado === "resuelta" && (
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={ocupado}
                  onClick={() =>
                    void alAccion(
                      { accion: "reabrir" },
                      a.id,
                      "Alerta reabierta.",
                    )
                  }
                  style={{ padding: "3px 10px", fontSize: "0.78rem" }}
                  title="La vuelve a poner como pendiente (si ya no se cumple la condición, se resolverá sola)"
                >
                  ↩ Reabrir
                </button>
              )}
              {a.estado === "resuelta" && (
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={ocupado}
                  onClick={() =>
                    void alAccion(
                      { accion: "eliminar" },
                      a.id,
                      "Alerta eliminada.",
                    )
                  }
                  style={{ padding: "3px 10px", fontSize: "0.78rem" }}
                  title="Quita esta alerta del registro"
                >
                  🗑 Eliminar
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </Modal>
  );
}
