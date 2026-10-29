"use client";

import { useCallback, useEffect, useState } from "react";
import { llamar, textoError } from "@/components/comisiones/api";
import { useToast } from "@/components/Toast";
import {
  animacionDeAlerta,
  CLAVE_ALERTAS_COLOR,
  CLAVE_ALERTAS_EFECTO,
  CLAVE_ALERTAS_VELOCIDAD,
  COLORES_ALERTA,
  EFECTOS_ALERTA,
  useAspectoAlertas,
  VELOCIDADES_ALERTA,
} from "@/components/alertas/aspecto-alertas";
import {
  definicionNueva,
  type DefinicionAlerta,
  type ReglaAlertaDto,
} from "@/lib/alertas";
import type { GrupoCondiciones } from "@/lib/reglas-color";
import { guardarPreferencia } from "@/lib/preferencias";
import type { PredefinidoDto } from "@/lib/servicios/apuntes";
import { GrupoEditor, type SugerenciasReglas } from "./GestorReglasColor";

const estiloBotonChico = { padding: "3px 10px", fontSize: "0.8rem" } as const;
const estiloSelect = {
  width: "auto",
  padding: "5px 8px",
  fontSize: "0.88rem",
} as const;
const estiloCaja = {
  padding: "20px",
  display: "flex",
  flexDirection: "column",
  gap: "14px",
  borderLeft: "3px solid var(--primary)",
} as const;

interface Borrador {
  nombre: string;
  activa: boolean;
  mensaje: string;
  avisar_admin: boolean;
  definicion: DefinicionAlerta;
}
const deRegla = (r: ReglaAlertaDto): Borrador => ({
  nombre: r.nombre,
  activa: r.activa,
  mensaje: r.mensaje,
  avisar_admin: r.avisar_admin,
  definicion: r.definicion,
});
const nueva = (): Borrador => ({
  nombre: "Nueva alerta",
  activa: true,
  mensaje: "",
  avisar_admin: false,
  definicion: definicionNueva(),
});

function EditorRegla({
  id,
  b,
  sugerencias,
  alCambiar,
}: {
  id: string;
  b: Borrador;
  sugerencias: SugerenciasReglas;
  alCambiar: (c: Partial<Borrador>) => void;
}) {
  const d = b.definicion;
  const extra = d.grupos ?? [];
  const cambiarDef = (c: Partial<DefinicionAlerta>) =>
    alCambiar({ definicion: { ...d, ...c } });
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "12px",
          flexWrap: "wrap",
        }}
      >
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            fontSize: "0.9rem",
          }}
        >
          Nombre:
          <input
            className="form-input"
            value={b.nombre}
            maxLength={80}
            onChange={(e) => alCambiar({ nombre: e.target.value })}
            style={{ width: "280px" }}
          />
        </label>
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
            checked={b.activa}
            onChange={(e) => alCambiar({ activa: e.target.checked })}
          />{" "}
          Activa
        </label>
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
            fontSize: "0.88rem",
          }}
          title="Además del vendedor del expediente, la alerta le sale también a los administradores"
        >
          <input
            type="checkbox"
            checked={b.avisar_admin}
            onChange={(e) => alCambiar({ avisar_admin: e.target.checked })}
          />{" "}
          Avisar también a los administradores
        </label>
      </div>
      <label
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "4px",
          fontSize: "0.9rem",
        }}
      >
        Mensaje del aviso
        <input
          className="form-input"
          value={b.mensaje}
          maxLength={500}
          onChange={(e) => alCambiar({ mensaje: e.target.value })}
          placeholder="Ej. Contrata el seguro de {cliente} ({matricula})"
        />
        <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
          Puedes usar {"{cliente}"}, {"{matricula}"}, {"{vendedor}"} y{" "}
          {"{expediente}"}.
        </span>
      </label>
      <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
        <span style={{ fontSize: "0.9rem", fontWeight: 600 }}>
          Avisa cuando un expediente pase a cumplir
        </span>
        <GrupoEditor
          idBase={`${id}-0`}
          titulo="Grupo 1"
          grupo={{ combinar: d.combinar, condiciones: d.condiciones }}
          sugerencias={sugerencias}
          alCambiar={(g) =>
            cambiarDef({ combinar: g.combinar, condiciones: g.condiciones })
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
              {(d.unir ?? "y") === "o" ? "— O —" : "— Y —"}
            </span>
            <GrupoEditor
              idBase={`${id}-${i + 1}`}
              titulo={`Grupo ${i + 2}`}
              grupo={g}
              sugerencias={sugerencias}
              alCambiar={(nuevoG: GrupoCondiciones) =>
                cambiarDef({
                  grupos: extra.map((x, j) => (j === i ? nuevoG : x)),
                })
              }
              alQuitar={() =>
                cambiarDef({ grupos: extra.filter((_, j) => j !== i) })
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
              cambiarDef({
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
              value={d.unir ?? "y"}
              onChange={(e) =>
                cambiarDef({ unir: e.target.value === "o" ? "o" : "y" })
              }
              style={estiloSelect}
            >
              <option value="y">el grupo 1 Y todos los demás</option>
              <option value="o">el grupo 1 O alguno de los demás</option>
            </select>
          )}
        </div>
      </div>
    </div>
  );
}

/** «Alertas» (Configuración › Expedientes): reglas que avisan cuando un expediente pasa a cumplir unas condiciones, y el aspecto del botón ❗. */
export default function GestorAlertas({
  sugerencias,
}: {
  sugerencias: SugerenciasReglas;
}) {
  const { mostrar, confirmar } = useToast();
  const aspecto = useAspectoAlertas();
  const animacion = animacionDeAlerta(aspecto);
  const [reglas, setReglas] = useState<ReglaAlertaDto[] | null>(null);
  const [esAdmin, setEsAdmin] = useState(true);
  const [editados, setEditados] = useState<Record<number, Borrador>>({});
  const [nuevo, setNuevo] = useState<Borrador | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [semaforos, setSemaforos] = useState<string[]>([]);

  const cargar = useCallback(async () => {
    try {
      setReglas(
        (await llamar<ReglaAlertaDto[]>("/api/admin/alertas-reglas")).data,
      );
      setEditados({});
    } catch {
      setEsAdmin(false);
      setReglas([]);
    }
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void cargar();
    llamar<PredefinidoDto[]>("/api/admin/apuntes-predefinidos")
      .then((r) =>
        setSemaforos(
          r.data
            .filter((p) => p.semaforo)
            .flatMap((p) =>
              p.semaforo_estados.map((e) => `${p.titulo}: ${e.texto}`),
            ),
        ),
      )
      .catch(() => undefined);
  }, [cargar]);

  const ejecutar = async (f: () => Promise<string | void>) => {
    setOcupado(true);
    try {
      const msg = await f();
      if (msg) mostrar(msg);
      await cargar();
    } catch (e) {
      mostrar(textoError(e), "error");
    } finally {
      setOcupado(false);
    }
  };
  const sug: SugerenciasReglas = { ...sugerencias, semaforos };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      <div className="glass-panel" style={estiloCaja}>
        <div>
          <h4
            style={{ fontSize: "1rem", fontWeight: 700, margin: "0 0 6px 0" }}
          >
            ❗ Aspecto del botón de alertas
          </h4>
          <p
            style={{
              color: "var(--text-secondary)",
              fontSize: "0.85rem",
              margin: 0,
              lineHeight: 1.5,
            }}
          >
            Cuando tienes alertas pendientes, el botón ❗ de la barra superior
            se anima. Elige cómo (se guarda en tu perfil).
          </p>
        </div>
        <div
          style={{
            display: "flex",
            gap: "16px",
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              fontSize: "0.9rem",
            }}
          >
            Efecto
            <select
              className="form-input"
              value={aspecto.efecto}
              onChange={(e) =>
                guardarPreferencia(CLAVE_ALERTAS_EFECTO, e.target.value)
              }
              style={estiloSelect}
            >
              {EFECTOS_ALERTA.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.etiqueta}
                </option>
              ))}
            </select>
          </label>
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              fontSize: "0.9rem",
            }}
          >
            Velocidad
            <select
              className="form-input"
              value={aspecto.velocidad}
              onChange={(e) =>
                guardarPreferencia(CLAVE_ALERTAS_VELOCIDAD, e.target.value)
              }
              style={estiloSelect}
              disabled={aspecto.efecto === "ninguno"}
            >
              {VELOCIDADES_ALERTA.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.etiqueta}
                </option>
              ))}
            </select>
          </label>
          <span
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              fontSize: "0.9rem",
            }}
          >
            Color
            {COLORES_ALERTA.map((c) => (
              <button
                key={c.color}
                type="button"
                title={c.etiqueta}
                aria-label={c.etiqueta}
                aria-pressed={aspecto.color === c.color}
                onClick={() => guardarPreferencia(CLAVE_ALERTAS_COLOR, c.color)}
                style={{
                  width: "26px",
                  height: "26px",
                  borderRadius: "50%",
                  cursor: "pointer",
                  background: c.color,
                  border: `3px solid ${aspecto.color === c.color ? "var(--text-primary)" : "var(--border-light)"}`,
                }}
              />
            ))}
            <input
              type="color"
              value={aspecto.color}
              onChange={(e) =>
                guardarPreferencia(CLAVE_ALERTAS_COLOR, e.target.value)
              }
              aria-label="Otro color"
              title="Otro color"
              style={{
                width: "34px",
                height: "28px",
                padding: 0,
                border: "1px solid var(--border-light)",
                borderRadius: "var(--radius-sm)",
                background: "transparent",
                cursor: "pointer",
              }}
            />
          </span>
          <span
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              fontSize: "0.85rem",
              color: "var(--text-secondary)",
            }}
          >
            Así se verá:
            <span
              style={{
                position: "relative",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: "36px",
                height: "36px",
                border: `1px solid ${aspecto.color}`,
                borderRadius: "var(--radius-sm)",
                background: `${aspecto.color}22`,
                fontSize: "1.1rem",
              }}
            >
              <span
                className={animacion.clase}
                style={{ ...animacion.estilo, lineHeight: 1 }}
              >
                ❗
              </span>
            </span>
          </span>
        </div>
      </div>

      <div className="glass-panel" style={estiloCaja}>
        <div>
          <h4
            style={{ fontSize: "1rem", fontWeight: 700, margin: "0 0 6px 0" }}
          >
            🔔 Reglas de alerta
          </h4>
          <p
            style={{
              color: "var(--text-secondary)",
              fontSize: "0.85rem",
              margin: 0,
              lineHeight: 1.5,
            }}
          >
            Una alerta salta cuando un expediente <b>pasa a cumplir</b> las
            condiciones: al crearlo, al guardarlo, al importar un Excel, al
            aplicar un pago de RCI o al cambiar un semáforo. Sale en una ventana
            (una vez por sesión) y queda en el botón ❗, donde se puede dar por
            hecha o posponer. Si la condición deja de cumplirse (por ejemplo, ya
            contrataste el seguro), la alerta se resuelve sola. Las crea y
            cambia solo el administrador; se las avisa al vendedor del
            expediente.
          </p>
        </div>
        {reglas === null && (
          <span style={{ color: "var(--text-muted)" }}>Cargando…</span>
        )}
        {!esAdmin && (
          <span style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>
            Solo el administrador puede ver y cambiar las reglas de alerta.
          </span>
        )}
        {esAdmin &&
          (reglas ?? []).map((r) => {
            const b = editados[r.id] ?? deRegla(r);
            const sucio =
              editados[r.id] !== undefined &&
              JSON.stringify(editados[r.id]) !== JSON.stringify(deRegla(r));
            return (
              <div
                key={r.id}
                style={{
                  border: "1px solid var(--border-light)",
                  borderRadius: "var(--radius-md)",
                  padding: "16px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "12px",
                  opacity: r.activa ? 1 : 0.7,
                }}
              >
                <EditorRegla
                  id={`a${r.id}`}
                  b={b}
                  sugerencias={sug}
                  alCambiar={(c) =>
                    setEditados((x) => ({ ...x, [r.id]: { ...b, ...c } }))
                  }
                />
                <div
                  style={{
                    display: "flex",
                    gap: "8px",
                    justifyContent: "flex-end",
                    flexWrap: "wrap",
                  }}
                >
                  {sucio && (
                    <button
                      type="button"
                      className="btn btn-primary"
                      disabled={
                        ocupado ||
                        b.nombre.trim() === "" ||
                        b.mensaje.trim() === ""
                      }
                      style={estiloBotonChico}
                      onClick={() =>
                        void ejecutar(async () => {
                          await llamar(`/api/admin/alertas-reglas?id=${r.id}`, {
                            method: "PUT",
                            cuerpo: b,
                          });
                          return "Alerta guardada.";
                        })
                      }
                    >
                      Guardar cambios
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={ocupado || sucio}
                    style={estiloBotonChico}
                    title="Revisa ahora todos los expedientes con las reglas y crea las alertas que falten (las que ya existen no se repiten)"
                    onClick={() =>
                      void ejecutar(async () => {
                        const { data } = await llamar<{ nuevas: number }>(
                          "/api/admin/alertas-reglas?revisar=1",
                          { method: "POST", cuerpo: {} },
                        );
                        return data.nuevas === 0
                          ? "Ningún expediente tiene alertas nuevas."
                          : `${data.nuevas} alerta${data.nuevas === 1 ? "" : "s"} nueva${data.nuevas === 1 ? "" : "s"}.`;
                      })
                    }
                  >
                    🔎 Revisar ahora los expedientes
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={ocupado}
                    style={estiloBotonChico}
                    onClick={async () => {
                      if (
                        await confirmar({
                          titulo: "Quitar la alerta",
                          texto: `¿Quitar la regla de alerta «${r.nombre}»? Sus alertas pendientes desaparecen.`,
                          aceptar: "Quitar",
                          peligro: true,
                        })
                      )
                        void ejecutar(async () => {
                          await llamar(`/api/admin/alertas-reglas?id=${r.id}`, {
                            method: "DELETE",
                          });
                          return "Regla quitada.";
                        });
                    }}
                  >
                    🗑 Quitar
                  </button>
                </div>
              </div>
            );
          })}
        {esAdmin &&
          (nuevo !== null ? (
            <div
              style={{
                border: "1px dashed var(--primary)",
                borderRadius: "var(--radius-md)",
                padding: "16px",
                display: "flex",
                flexDirection: "column",
                gap: "12px",
              }}
            >
              <EditorRegla
                id="nueva"
                b={nuevo}
                sugerencias={sug}
                alCambiar={(c) => setNuevo({ ...nuevo, ...c })}
              />
              <div
                style={{
                  display: "flex",
                  gap: "8px",
                  justifyContent: "flex-end",
                }}
              >
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={
                    ocupado ||
                    nuevo.nombre.trim() === "" ||
                    nuevo.mensaje.trim() === ""
                  }
                  style={estiloBotonChico}
                  onClick={() =>
                    void ejecutar(async () => {
                      await llamar("/api/admin/alertas-reglas", {
                        method: "POST",
                        cuerpo: nuevo,
                      });
                      setNuevo(null);
                      return "Alerta creada.";
                    })
                  }
                >
                  Añadir alerta
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={ocupado}
                  style={estiloBotonChico}
                  onClick={() => setNuevo(null)}
                >
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setNuevo(nueva())}
              style={{ alignSelf: "flex-start", ...estiloBotonChico }}
            >
              + Nueva alerta
            </button>
          ))}
      </div>
    </div>
  );
}
