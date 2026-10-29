"use client";

import { useToast } from "@/components/Toast";
import { GrupoEditor, type SugerenciasReglas } from "./GestorReglasColor";
import type { GrupoCondiciones } from "@/lib/reglas-color";
import { reglaEstadoNueva, type ReglaEstado } from "@/lib/reglas-semaforo";
import type { EstadoSemaforo } from "@/lib/servicios/apuntes";

const estiloBotonChico = { padding: "3px 10px", fontSize: "0.8rem" } as const;
const estiloSelect = {
  width: "auto",
  padding: "5px 8px",
  fontSize: "0.88rem",
} as const;

const nombreEstado = (e: EstadoSemaforo | undefined, i: number) =>
  `${(e?.modo === "icono" || e?.modo === "icono_fondo") && e.icono ? `${e.icono} ` : ""}${e?.texto || `estado ${i + 1}`}`;

function ReglaEditor({
  regla,
  estados,
  sugerencias,
  alCambiar,
  alQuitar,
  alSubir,
  alBajar,
}: {
  regla: ReglaEstado;
  estados: EstadoSemaforo[];
  sugerencias: SugerenciasReglas;
  alCambiar: (r: ReglaEstado) => void;
  alQuitar: () => void;
  alSubir?: () => void;
  alBajar?: () => void;
}) {
  const { confirmar } = useToast();
  const extra = regla.grupos ?? [];
  const cambiarExtra = (i: number, g: GrupoCondiciones) =>
    alCambiar({ ...regla, grupos: extra.map((x, j) => (j === i ? g : x)) });
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "12px",
        padding: "14px",
        border: "1px solid var(--border-light)",
        borderRadius: "var(--radius-sm)",
        background: "rgba(255, 255, 255, 0.02)",
        opacity: regla.activa ? 1 : 0.6,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "10px",
          flexWrap: "wrap",
        }}
      >
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
            fontSize: "0.88rem",
          }}
        >
          <input
            type="checkbox"
            checked={regla.activa}
            onChange={(e) => alCambiar({ ...regla, activa: e.target.checked })}
          />{" "}
          Activa
        </label>
        <input
          className="form-input"
          aria-label="Nombre de la regla"
          value={regla.nombre}
          maxLength={80}
          onChange={(e) => alCambiar({ ...regla, nombre: e.target.value })}
          style={{ flex: 1, minWidth: "180px", maxWidth: "340px" }}
        />
        {alSubir && (
          <button
            type="button"
            className="btn btn-secondary"
            style={estiloBotonChico}
            onClick={alSubir}
            title="Más prioridad"
            aria-label="Subir"
          >
            ▲
          </button>
        )}
        {alBajar && (
          <button
            type="button"
            className="btn btn-secondary"
            style={estiloBotonChico}
            onClick={alBajar}
            title="Menos prioridad"
            aria-label="Bajar"
          >
            ▼
          </button>
        )}
        <button
          type="button"
          className="btn btn-secondary"
          style={estiloBotonChico}
          onClick={async () => {
            if (
              await confirmar({
                titulo: "Quitar la regla",
                texto: `¿Quitar la regla «${regla.nombre}»?`,
                aceptar: "Quitar",
                peligro: true,
              })
            )
              alQuitar();
          }}
          title="Quitar la regla"
          aria-label="Quitar regla"
        >
          🗑
        </button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
        <span style={{ fontSize: "0.9rem", fontWeight: 600 }}>
          Cuándo se cumple
        </span>
        <GrupoEditor
          idBase={`${regla.id}-0`}
          titulo="Grupo 1"
          grupo={{ combinar: regla.combinar, condiciones: regla.condiciones }}
          sugerencias={sugerencias}
          alCambiar={(g) =>
            alCambiar({
              ...regla,
              combinar: g.combinar,
              condiciones: g.condiciones,
            })
          }
        />
        {extra.map((g, i) => (
          <div
            key={i}
            style={{ display: "flex", flexDirection: "column", gap: "10px" }}
          >
            <span
              style={{
                fontSize: "0.82rem",
                color: "var(--primary)",
                fontWeight: 700,
                paddingLeft: "6px",
              }}
            >
              {(regla.unir ?? "y") === "o" ? "— O —" : "— Y —"}
            </span>
            <GrupoEditor
              idBase={`${regla.id}-${i + 1}`}
              titulo={`Grupo ${i + 2}`}
              grupo={g}
              sugerencias={sugerencias}
              alCambiar={(nuevo) => cambiarExtra(i, nuevo)}
              alQuitar={() =>
                alCambiar({ ...regla, grupos: extra.filter((_, j) => j !== i) })
              }
            />
          </div>
        ))}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            flexWrap: "wrap",
          }}
        >
          <button
            type="button"
            className="btn btn-secondary"
            style={estiloBotonChico}
            onClick={() =>
              alCambiar({
                ...regla,
                grupos: [
                  ...extra,
                  {
                    combinar: "todas",
                    condiciones: [
                      { campo: "estado_intranet", operador: "es", valor: "" },
                    ],
                  },
                ],
              })
            }
          >
            + Añadir otro grupo de condiciones
          </button>
          {extra.length > 0 && (
            <select
              className="form-input"
              aria-label="Cómo se unen los grupos"
              value={regla.unir ?? "y"}
              onChange={(e) =>
                alCambiar({
                  ...regla,
                  unir: e.target.value === "o" ? "o" : "y",
                })
              }
              style={estiloSelect}
            >
              <option value="y">el grupo 1 Y todos los demás</option>
              <option value="o">el grupo 1 O alguno de los demás</option>
            </select>
          )}
        </div>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "10px",
          flexWrap: "wrap",
        }}
      >
        <span style={{ fontSize: "0.9rem", fontWeight: 600 }}>
          Entonces pasa a
        </span>
        <select
          className="form-input"
          aria-label="Estado al que pasa"
          value={Math.min(regla.estado, estados.length - 1)}
          onChange={(e) =>
            alCambiar({ ...regla, estado: Number(e.target.value) })
          }
          style={estiloSelect}
        >
          {estados.map((e, i) => (
            <option key={i} value={i}>
              {nombreEstado(e, i)}
            </option>
          ))}
        </select>
      </div>
      <label
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          fontSize: "0.88rem",
        }}
        title="Marcada, la regla decide con qué estado empieza un expediente nuevo (también los que se crean al importar o leer un pedido) y no actúa después"
      >
        <input
          type="checkbox"
          checked={regla.solo_al_crear ?? false}
          onChange={(e) =>
            alCambiar({ ...regla, solo_al_crear: e.target.checked })
          }
        />
        Solo al crear el expediente (decide con qué estado empieza)
      </label>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "12px",
          flexWrap: "wrap",
        }}
      >
        <span style={{ fontSize: "0.88rem" }}>Solo si ahora está en:</span>
        {estados.map((e, i) => (
          <label
            key={i}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "5px",
              fontSize: "0.85rem",
            }}
          >
            <input
              type="checkbox"
              checked={regla.desde.includes(i)}
              onChange={(ev) =>
                alCambiar({
                  ...regla,
                  desde: ev.target.checked
                    ? [...regla.desde, i].sort((x, y) => x - y)
                    : regla.desde.filter((d) => d !== i),
                })
              }
            />
            {nombreEstado(e, i)}
          </label>
        ))}
        <span style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
          {regla.desde.length === 0 ? "(sin marcar: en cualquier estado)" : ""}
        </span>
      </div>
    </div>
  );
}

/** Reglas que cambian solas el estado de un semáforo cuando un expediente cumple unas condiciones (se revisan al guardar un expediente). */
export default function ReglasEstadoSemaforo({
  reglas,
  estados,
  sugerencias,
  alCambiar,
}: {
  reglas: ReglaEstado[];
  estados: EstadoSemaforo[];
  sugerencias: SugerenciasReglas;
  alCambiar: (r: ReglaEstado[]) => void;
}) {
  const mover = (i: number, d: number) => {
    const n = [...reglas];
    [n[i], n[i + d]] = [n[i + d], n[i]];
    alCambiar(n);
  };
  return (
    <>
      <p
        style={{
          margin: 0,
          fontSize: "0.85rem",
          color: "var(--text-secondary)",
          lineHeight: 1.5,
        }}
      >
        Cada vez que se guarda un expediente se revisan estas reglas, de arriba
        abajo; la primera que se cumple cambia el semáforo a su estado. Por
        ejemplo: «si tiene fecha de facturación → Terminado». Puedes seguir
        cambiando el estado a mano, pero la regla volverá a actuar la próxima
        vez que se guarde el expediente y siga cumpliéndose.
      </p>
      {reglas.map((r, i) => (
        <ReglaEditor
          key={r.id}
          regla={r}
          estados={estados}
          sugerencias={sugerencias}
          alCambiar={(n) => alCambiar(reglas.map((x, j) => (j === i ? n : x)))}
          alQuitar={() => alCambiar(reglas.filter((_, j) => j !== i))}
          alSubir={i > 0 ? () => mover(i, -1) : undefined}
          alBajar={i < reglas.length - 1 ? () => mover(i, 1) : undefined}
        />
      ))}
      {reglas.length === 0 && (
        <span style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
          Todavía no hay reglas.
        </span>
      )}
      <div>
        <button
          type="button"
          className="btn btn-secondary"
          style={estiloBotonChico}
          onClick={() =>
            alCambiar([
              ...reglas,
              reglaEstadoNueva(Math.min(estados.length - 1, 1)),
            ])
          }
        >
          + Nueva regla
        </button>
      </div>
    </>
  );
}
