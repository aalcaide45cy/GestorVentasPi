"use client";

import { useEffect, useState } from "react";
import { llamar } from "@/components/comisiones/api";
import type { DefinicionAlerta } from "@/lib/alertas";
import type { CuentaDto, PlantillaDto } from "@/lib/correo";

type Correo = NonNullable<DefinicionAlerta["correo"]>;

/** «Preparar también un correo»: la plantilla, la cuenta y el destinatario del correo que acompaña al aviso de una regla. */
export default function BloqueCorreoRegla({
  valor,
  alCambiar,
}: {
  valor: Correo | undefined;
  alCambiar: (c: Correo | undefined) => void;
}) {
  const [plantillas, setPlantillas] = useState<PlantillaDto[]>([]);
  const [cuentas, setCuentas] = useState<CuentaDto[]>([]);
  useEffect(() => {
    llamar<PlantillaDto[]>("/api/correo/plantillas")
      .then((r) => setPlantillas(r.data))
      .catch(() => undefined);
    llamar<CuentaDto[]>("/api/correo/cuentas")
      .then((r) => setCuentas(r.data))
      .catch(() => undefined);
  }, []);
  const activar = (si: boolean) => {
    if (!si) return alCambiar(undefined);
    const p = plantillas[0];
    const c = cuentas.find((x) => x.activa) ?? cuentas[0];
    alCambiar({
      id_plantilla: p?.id ?? 0,
      id_cuenta: c?.id ?? 0,
      para: "cliente",
      para_fijo: "",
    });
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
      <label
        style={{
          display: "flex",
          alignItems: "center",
          gap: "6px",
          fontSize: "0.9rem",
          fontWeight: 600,
        }}
      >
        <input
          type="checkbox"
          checked={!!valor}
          onChange={(e) => activar(e.target.checked)}
        />{" "}
        ✉️ Preparar también un correo
      </label>
      {valor && (
        <div
          style={{
            display: "flex",
            gap: "8px",
            flexWrap: "wrap",
            alignItems: "center",
            fontSize: "0.88rem",
          }}
        >
          {plantillas.length === 0 || cuentas.length === 0 ? (
            <span style={{ color: "var(--warning)" }}>
              Antes crea una cuenta y una plantilla en la sección Correo.
            </span>
          ) : (
            <>
              Plantilla
              <select
                className="form-input"
                value={valor.id_plantilla}
                onChange={(e) =>
                  alCambiar({ ...valor, id_plantilla: Number(e.target.value) })
                }
                style={{ width: "auto" }}
              >
                {plantillas.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre}
                  </option>
                ))}
              </select>
              desde
              <select
                className="form-input"
                value={valor.id_cuenta}
                onChange={(e) =>
                  alCambiar({ ...valor, id_cuenta: Number(e.target.value) })
                }
                style={{ width: "auto" }}
              >
                {cuentas.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </select>
              para
              <select
                className="form-input"
                value={valor.para}
                onChange={(e) =>
                  alCambiar({
                    ...valor,
                    para: e.target.value === "fijo" ? "fijo" : "cliente",
                  })
                }
                style={{ width: "auto" }}
              >
                <option value="cliente">el cliente del expediente</option>
                <option value="fijo">esta dirección</option>
              </select>
              {valor.para === "fijo" && (
                <input
                  className="form-input"
                  value={valor.para_fijo}
                  onChange={(e) =>
                    alCambiar({ ...valor, para_fijo: e.target.value })
                  }
                  placeholder="correo@ejemplo.com"
                  style={{ width: "220px" }}
                />
              )}
            </>
          )}
          <span
            style={{
              flexBasis: "100%",
              fontSize: "0.75rem",
              color: "var(--text-muted)",
            }}
          >
            El correo se deja en la cola de la cuenta elegida, una sola vez por
            expediente, para que lo revises (o sale solo si activas el envío
            automático en Correo → Ajustes).
          </span>
        </div>
      )}
    </div>
  );
}
