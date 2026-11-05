"use client";

import { useEffect, useState } from "react";
import { llamar } from "@/components/comisiones/api";
import {
  CLAVE_CORREO_BOTONES,
  FECHAS_CON_SOBRE,
  leerBotonesFecha,
  type BotonFecha,
  type CuentaDto,
  type PlantillaDto,
} from "@/lib/correo";
import { usePreferencia } from "@/lib/preferencias";

/** El botón ✉️ de las fechas de la lista de expedientes: en cuáles sale y qué correo lleva predefinido (plantilla, cuenta, destinatario y qué pasa al pulsarlo). */
export default function BotonesDeFechas() {
  const [guardado, fijar] = usePreferencia(CLAVE_CORREO_BOTONES);
  const botones = leerBotonesFecha(guardado);
  const [plantillas, setPlantillas] = useState<PlantillaDto[]>([]);
  useEffect(() => {
    llamar<PlantillaDto[]>("/api/correo/plantillas")
      .then((r) => setPlantillas(r.data))
      .catch(() => undefined);
  }, []);
  const cambiar = (id: string, c: Partial<BotonFecha>) =>
    fijar(JSON.stringify({ ...botones, [id]: { ...botones[id], ...c } }));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      <strong style={{ fontSize: "0.9rem" }}>
        Botón ✉️ en las fechas de la lista de expedientes
      </strong>
      <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
        Activa el botón en las fechas que quieras y deja predefinido el correo:
        con qué plantilla (lleva su firma), desde qué cuenta y a quién.
      </span>
      {FECHAS_CON_SOBRE.map((f) => {
        const b = botones[f.id];
        return (
          <div
            key={f.id}
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "6px",
              padding: "8px 10px",
              border: "1px solid var(--border-light)",
              borderRadius: "var(--radius-sm)",
            }}
          >
            <label
              style={{
                display: "flex",
                gap: "6px",
                alignItems: "center",
                fontWeight: 600,
              }}
            >
              <input
                type="checkbox"
                checked={b.activo}
                onChange={(e) => cambiar(f.id, { activo: e.target.checked })}
              />
              {f.nombre}
            </label>
            {b.activo && (
              <div
                style={{
                  display: "flex",
                  gap: "8px",
                  flexWrap: "wrap",
                  alignItems: "center",
                  fontSize: "0.86rem",
                }}
              >
                Plantilla
                <select
                  className="form-input"
                  value={b.id_plantilla ?? ""}
                  onChange={(e) =>
                    cambiar(f.id, {
                      id_plantilla: e.target.value
                        ? Number(e.target.value)
                        : null,
                    })
                  }
                  style={{ width: "auto" }}
                >
                  <option value="">— Elegir al pulsar —</option>
                  {plantillas.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nombre}
                    </option>
                  ))}
                </select>
                Al pulsar el sobre
                <select
                  className="form-input"
                  value={b.modo}
                  onChange={(e) =>
                    cambiar(f.id, {
                      modo: e.target.value as BotonFecha["modo"],
                    })
                  }
                  style={{ width: "auto" }}
                >
                  <option value="revisar">
                    abrir el correo para revisarlo
                  </option>
                  <option value="cola">dejarlo directamente en la cola</option>
                  <option value="enviar">
                    enviarlo directamente (sin preguntar)
                  </option>
                </select>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
