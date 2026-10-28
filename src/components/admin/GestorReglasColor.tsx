"use client";

import { useRef, useState } from "react";
import { useToast } from "@/components/Toast";
import { COLORES_PEDIDO_DESTACADO } from "@/lib/preferencias";
import {
  CAMPOS_REGLA,
  aArchivoDeReglas,
  fondoDeRegla,
  idRegla,
  leerImportacion,
  operadorConValor,
  operadoresDe,
  reglaNueva,
  reglaPedidosRecientes,
  textoDeRegla,
  tipoDeCampo,
  type CampoRegla,
  type Condicion,
  type GrupoCondiciones,
  type ReglaColor,
} from "@/lib/reglas-color";
import { useEsquemasColor, useReglasColor } from "@/lib/reglas-color-cliente";

export interface SugerenciasReglas {
  tiposVenta: string[];
  estados: string[];
  marcas: string[];
}

const ESTADOS_INTRANET_HABITUALES = ["Archivado", "Anulado", "Post-venta", "Matriculación", "Facturación", "Entrega"];

const estiloCaja = { padding: "20px", display: "flex", flexDirection: "column", gap: "14px", borderLeft: "3px solid var(--primary)" } as const;
const estiloBotonChico = { padding: "3px 10px", fontSize: "0.8rem" } as const;
const estiloSelect = { width: "auto", padding: "5px 8px", fontSize: "0.88rem" } as const;

/** Un grupo de condiciones: cómo se combinan (todas, alguna o ninguna) y la lista de condiciones. */
export function GrupoEditor({ idBase, grupo, sugerencias, titulo, alCambiar, alQuitar }: { idBase: string; grupo: GrupoCondiciones; sugerencias: SugerenciasReglas; titulo: string; alCambiar: (g: GrupoCondiciones) => void; alQuitar?: () => void }) {
  const cambiarCondicion = (i: number, c: Condicion) => alCambiar({ ...grupo, condiciones: grupo.condiciones.map((x, j) => (j === i ? c : x)) });
  const lista = (campo: CampoRegla): string[] =>
    campo === "tipo_venta" ? sugerencias.tiposVenta : campo === "estado" ? sugerencias.estados : campo === "marca" ? sugerencias.marcas : campo === "clase" ? ["VN", "VO"] : campo === "comisionado" ? ["Comisionado", "Reclamado", "Pendiente"] : campo === "estado_intranet" ? ESTADOS_INTRANET_HABITUALES : [];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px", border: "1px solid var(--border-light)", borderRadius: "var(--radius-sm)", padding: "12px 14px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
        <strong style={{ fontSize: "0.88rem" }}>{titulo}</strong>
        <span style={{ fontSize: "0.88rem" }}>Se cumple</span>
        <select className="form-input" value={grupo.combinar} onChange={(e) => alCambiar({ ...grupo, combinar: e.target.value === "alguna" ? "alguna" : e.target.value === "ninguna" ? "ninguna" : "todas" })} style={estiloSelect}>
          <option value="todas">si se cumplen todas estas condiciones</option>
          <option value="alguna">si se cumple alguna de estas condiciones</option>
          <option value="ninguna">si no se cumple ninguna de estas condiciones</option>
        </select>
        {alQuitar && (
          <button type="button" className="btn btn-secondary" style={{ ...estiloBotonChico, marginLeft: "auto" }} onClick={alQuitar} title="Quita este grupo de condiciones">
            ✖ Quitar el grupo
          </button>
        )}
      </div>
        {grupo.condiciones.map((c, i) => {
          const sug = lista(c.campo);
          const idLista = `sug-${idBase}-${i}`;
          return (
            <div key={i} style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
              <select
                className="form-input"
                value={c.campo}
                style={estiloSelect}
                onChange={(e) => {
                  const campo = e.target.value as CampoRegla;
                  cambiarCondicion(i, { campo, operador: operadoresDe(campo)[0].id, valor: "" });
                }}
              >
                {CAMPOS_REGLA.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.etiqueta}
                  </option>
                ))}
              </select>
              <select className="form-input" value={c.operador} style={estiloSelect} onChange={(e) => cambiarCondicion(i, { ...c, operador: e.target.value })}>
                {operadoresDe(c.campo).map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.etiqueta}
                  </option>
                ))}
              </select>
              {operadorConValor(c.operador) && (
                <>
                  <input
                    className="form-input"
                    list={sug.length > 0 ? idLista : undefined}
                    type={tipoDeCampo(c.campo) === "fecha" ? "number" : "text"}
                    min={0}
                    value={c.valor}
                    placeholder={tipoDeCampo(c.campo) === "fecha" ? "días" : "valor"}
                    onChange={(e) => cambiarCondicion(i, { ...c, valor: e.target.value })}
                    style={{ width: tipoDeCampo(c.campo) === "fecha" ? "90px" : "200px" }}
                  />
                  {sug.length > 0 && (
                    <datalist id={idLista}>
                      {sug.map((s) => (
                        <option key={s} value={s} />
                      ))}
                    </datalist>
                  )}
                </>
              )}
              <button type="button" className="btn btn-secondary" style={estiloBotonChico} onClick={() => alCambiar({ ...grupo, condiciones: grupo.condiciones.filter((_, j) => j !== i) })} title="Quita esta condición" aria-label="Quitar condición">
                ✖
              </button>
            </div>
          );
        })}
        <div>
          <button type="button" className="btn btn-secondary" style={estiloBotonChico} onClick={() => alCambiar({ ...grupo, condiciones: [...grupo.condiciones, { campo: "estado_intranet", operador: "es", valor: "" }] })}>
            + Añadir condición
          </button>
          {grupo.condiciones.length === 0 && <span style={{ marginLeft: "10px", color: "var(--warning)", fontSize: "0.82rem" }}>Un grupo sin condiciones no cuenta.</span>}
        </div>
    </div>
  );
}

function Editor({ regla, sugerencias, alCambiar }: { regla: ReglaColor; sugerencias: SugerenciasReglas; alCambiar: (r: ReglaColor) => void }) {
  const extra = regla.grupos ?? [];
  const cambiarExtra = (i: number, g: GrupoCondiciones) => alCambiar({ ...regla, grupos: extra.map((x, j) => (j === i ? g : x)) });
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px", padding: "14px", border: "1px solid var(--border-light)", borderRadius: "var(--radius-sm)", background: "rgba(255, 255, 255, 0.02)" }}>
      <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.9rem" }}>
        Nombre:
        <input className="form-input" value={regla.nombre} maxLength={80} onChange={(e) => alCambiar({ ...regla, nombre: e.target.value })} style={{ flex: 1, maxWidth: "380px" }} />
      </label>

      <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
        <span style={{ fontSize: "0.9rem", fontWeight: 600 }}>Cuándo se aplica</span>
        <GrupoEditor idBase={`${regla.id}-0`} titulo="Grupo 1" grupo={{ combinar: regla.combinar, condiciones: regla.condiciones }} sugerencias={sugerencias} alCambiar={(g) => alCambiar({ ...regla, combinar: g.combinar, condiciones: g.condiciones })} />
        {extra.map((g, i) => (
          <div key={i} style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            <span style={{ fontSize: "0.82rem", color: "var(--primary)", fontWeight: 700, paddingLeft: "6px" }}>{(regla.unir ?? "y") === "o" ? "— O —" : "— Y —"}</span>
            <GrupoEditor idBase={`${regla.id}-${i + 1}`} titulo={`Grupo ${i + 2}`} grupo={g} sugerencias={sugerencias} alCambiar={(nuevo) => cambiarExtra(i, nuevo)} alQuitar={() => alCambiar({ ...regla, grupos: extra.filter((_, j) => j !== i) })} />
          </div>
        ))}
        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
          <button type="button" className="btn btn-secondary" style={estiloBotonChico} onClick={() => alCambiar({ ...regla, grupos: [...extra, { combinar: "todas", condiciones: [{ campo: "estado_intranet", operador: "es", valor: "" }] }] })} title="Añade otro grupo de condiciones a la regla, con su propia combinación">
            + Añadir otro grupo de condiciones
          </button>
          {extra.length > 0 && (
            <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.88rem" }}>
              La regla se aplica si se cumple
              <select className="form-input" value={regla.unir ?? "y"} onChange={(e) => alCambiar({ ...regla, unir: e.target.value === "o" ? "o" : "y" })} style={estiloSelect}>
                <option value="y">el grupo 1 Y todos los demás</option>
                <option value="o">el grupo 1 O alguno de los demás</option>
              </select>
            </label>
          )}
        </div>
        {extra.length === 0 && <span style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>Con un solo grupo funciona como siempre. Con varios puedes combinar, por ejemplo: (matrícula vacía Y estado Comercial) O (RCI con fecha Y sin facturación).</span>}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        <span style={{ fontSize: "0.9rem" }}>Color de la fila:</span>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
          {COLORES_PEDIDO_DESTACADO.map((c) => (
            <button
              key={c.color}
              type="button"
              title={c.texto}
              aria-label={c.texto}
              aria-pressed={regla.color.toLowerCase() === c.color}
              onClick={() => alCambiar({ ...regla, color: c.color })}
              style={{ width: "34px", height: "34px", borderRadius: "var(--radius-sm)", cursor: "pointer", background: fondoDeRegla({ color: c.color, fuerza: "fuerte" }), border: `3px solid ${regla.color.toLowerCase() === c.color ? "var(--text-primary)" : "var(--border-light)"}`, color: c.color, fontWeight: 800 }}
            >
              {regla.color.toLowerCase() === c.color ? "✓" : ""}
            </button>
          ))}
          <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.85rem", color: "var(--text-secondary)" }}>
            Otro color:
            <input type="color" value={regla.color} onChange={(e) => alCambiar({ ...regla, color: e.target.value })} style={{ width: "44px", height: "32px", padding: 0, border: "1px solid var(--border-light)", borderRadius: "var(--radius-sm)", background: "transparent", cursor: "pointer" }} />
          </label>
        </div>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontSize: "0.9rem" }}>Intensidad:</span>
          {(["suave", "media", "fuerte"] as const).map((f) => (
            <button key={f} type="button" className={regla.fuerza === f ? "btn btn-primary" : "btn btn-secondary"} style={estiloBotonChico} onClick={() => alCambiar({ ...regla, fuerza: f })}>
              {f[0].toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
        <div style={{ padding: "8px 12px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-light)", background: fondoDeRegla(regla), fontSize: "0.88rem" }}>Así se verá la fila: {regla.nombre || "(sin nombre)"}</div>
      </div>
    </div>
  );
}

/**
 * «Colores de fila» (Configuración › Expedientes): reglas que pintan una fila de la lista de Expedientes cuando se cumplen sus condiciones, con prioridad por orden,
 * esquemas guardados con nombre y exportación/importación en un archivo. Todo se guarda en este navegador.
 */
export default function GestorReglasColor({ sugerencias }: { sugerencias: SugerenciasReglas }) {
  const { mostrar, confirmar } = useToast();
  const [reglas, guardarReglas] = useReglasColor();
  const [esquemas, guardarEsquemas] = useEsquemasColor();
  const [editando, setEditando] = useState<string | null>(null);
  const [nombreEsquema, setNombreEsquema] = useState("");
  const entrada = useRef<HTMLInputElement>(null);

  const cambiar = (r: ReglaColor) => guardarReglas(reglas.map((x) => (x.id === r.id ? r : x)));
  const mover = (i: number, delta: -1 | 1) => {
    const j = i + delta;
    if (j < 0 || j >= reglas.length) return;
    const copia = [...reglas];
    [copia[i], copia[j]] = [copia[j], copia[i]];
    guardarReglas(copia);
  };
  const anadir = () => {
    const r = reglaNueva();
    guardarReglas([...reglas, r]);
    setEditando(r.id);
  };
  const duplicar = (r: ReglaColor) => {
    const copia = { ...r, id: idRegla(), nombre: `${r.nombre} (copia)` };
    guardarReglas([...reglas.slice(0, reglas.indexOf(r) + 1), copia, ...reglas.slice(reglas.indexOf(r) + 1)]);
    setEditando(copia.id);
  };
  const borrar = async (r: ReglaColor) => {
    if (!(await confirmar({ texto: `¿Borrar la regla «${r.nombre}»?` }))) return;
    guardarReglas(reglas.filter((x) => x.id !== r.id));
    if (editando === r.id) setEditando(null);
  };
  const restablecer = async () => {
    if (!(await confirmar({ texto: "¿Volver a las reglas de partida (solo «Pedidos recientes», 3 días, azul)? Las reglas actuales se pierden; los esquemas guardados no." }))) return;
    guardarReglas([reglaPedidosRecientes(3, "#3b82f6", "media")]);
    setEditando(null);
  };

  const guardarEsquema = () => {
    const nombre = nombreEsquema.trim();
    if (!nombre) return mostrar("Ponle un nombre al esquema.", "error");
    guardarEsquemas([...esquemas.filter((e) => e.nombre !== nombre), { nombre, reglas }]);
    setNombreEsquema("");
    mostrar(`Esquema «${nombre}» guardado.`);
  };
  const aplicarEsquema = async (nombre: string) => {
    const e = esquemas.find((x) => x.nombre === nombre);
    if (!e || !(await confirmar({ texto: `¿Aplicar el esquema «${nombre}»? Sustituye a las reglas actuales (guarda antes un esquema si quieres conservarlas).` }))) return;
    guardarReglas(e.reglas.map((r) => ({ ...r, id: idRegla() })));
    setEditando(null);
    mostrar(`Esquema «${nombre}» aplicado.`);
  };
  const borrarEsquema = async (nombre: string) => {
    if (!(await confirmar({ texto: `¿Borrar el esquema «${nombre}»?` }))) return;
    guardarEsquemas(esquemas.filter((e) => e.nombre !== nombre));
  };
  const exportar = (nombre: string, lista: ReglaColor[]) => {
    const url = URL.createObjectURL(new Blob([aArchivoDeReglas(nombre, lista)], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `colores-expedientes-${nombre.replace(/[^\w\-áéíóúñÁÉÍÓÚÑ]+/g, "_")}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };
  const importar = async (f: File | undefined) => {
    if (!f) return;
    const dato = leerImportacion(await f.text());
    if (!dato) return mostrar("Ese archivo no tiene reglas de color válidas.", "error");
    if (!(await confirmar({ texto: `Se van a cargar ${dato.reglas.length} regla${dato.reglas.length === 1 ? "" : "s"}${dato.nombre ? ` del esquema «${dato.nombre}»` : ""} en lugar de las actuales${dato.nombre ? " y se guardarán también como esquema" : ""}. ¿Seguir?` }))) return;
    guardarReglas(dato.reglas.map((r) => ({ ...r, id: idRegla() })));
    if (dato.nombre) guardarEsquemas([...esquemas.filter((e) => e.nombre !== dato.nombre), { nombre: dato.nombre, reglas: dato.reglas }]);
    setEditando(null);
    mostrar("Reglas importadas.");
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      <div className="glass-panel" style={estiloCaja}>
        <div>
          <h4 style={{ fontSize: "1rem", fontWeight: 700, margin: "0 0 6px 0" }}>🎨 Reglas de color de las filas</h4>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem", margin: 0, lineHeight: 1.5 }}>
            Cada regla pinta la fila de Expedientes con un color cuando se cumplen sus condiciones (por ejemplo, «Estado intranet es Post-venta» o «Fecha de pedido es de hace como máximo 3 días»). Si una fila cumple varias reglas, gana la que esté más arriba. Se guarda sola.
          </p>
        </div>

        {reglas.length === 0 && <p style={{ margin: 0, color: "var(--text-muted)", fontSize: "0.88rem" }}>No hay reglas: ninguna fila se colorea. Pulsa «+ Añadir regla».</p>}
        {reglas.map((r, i) => (
          <div key={r.id} style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap", padding: "8px 12px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-light)", background: r.activa ? fondoDeRegla(r) : "transparent", opacity: r.activa ? 1 : 0.6 }}>
              <input type="checkbox" checked={r.activa} onChange={(e) => cambiar({ ...r, activa: e.target.checked })} title={r.activa ? "Regla activa: desmárcala para dejar de aplicarla sin borrarla" : "Regla desactivada"} style={{ width: "18px", height: "18px", accentColor: "var(--primary)" }} />
              <div style={{ flex: "1 1 240px", minWidth: 0 }}>
                <strong>{r.nombre || "(sin nombre)"}</strong>
                <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>{textoDeRegla(r)}</div>
              </div>
              <span style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
                <button type="button" className="btn btn-secondary" style={estiloBotonChico} disabled={i === 0} onClick={() => mover(i, -1)} title="Subir (más prioridad)" aria-label={`Subir ${r.nombre}`}>▲</button>
                <button type="button" className="btn btn-secondary" style={estiloBotonChico} disabled={i === reglas.length - 1} onClick={() => mover(i, 1)} title="Bajar (menos prioridad)" aria-label={`Bajar ${r.nombre}`}>▼</button>
                <button type="button" className={editando === r.id ? "btn btn-primary" : "btn btn-secondary"} style={estiloBotonChico} onClick={() => setEditando(editando === r.id ? null : r.id)}>✏️ {editando === r.id ? "Cerrar" : "Editar"}</button>
                <button type="button" className="btn btn-secondary" style={estiloBotonChico} onClick={() => duplicar(r)} title="Duplicar la regla">⧉</button>
                <button type="button" className="btn btn-secondary" style={estiloBotonChico} onClick={() => void borrar(r)} title="Borrar la regla">🗑️</button>
              </span>
            </div>
            {editando === r.id && <Editor regla={r} sugerencias={sugerencias} alCambiar={cambiar} />}
          </div>
        ))}
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          <button type="button" className="btn btn-primary" style={estiloBotonChico} onClick={anadir}>+ Añadir regla</button>
          <button type="button" className="btn btn-secondary" style={estiloBotonChico} onClick={() => void restablecer()} title="Deja solo la regla «Pedidos recientes» de partida">↺ Restablecer</button>
        </div>
      </div>

      <div className="glass-panel" style={estiloCaja}>
        <div>
          <h4 style={{ fontSize: "1rem", fontWeight: 700, margin: "0 0 6px 0" }}>💾 Esquemas, exportar e importar</h4>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem", margin: 0, lineHeight: 1.5 }}>
            Guarda el conjunto de reglas actual con un nombre para volver a él cuando quieras, o llévalo a otro equipo en un archivo.
          </p>
        </div>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
          <input className="form-input" placeholder="Nombre del esquema" value={nombreEsquema} maxLength={80} onChange={(e) => setNombreEsquema(e.target.value)} onKeyDown={(e) => e.key === "Enter" && guardarEsquema()} style={{ width: "240px" }} />
          <button type="button" className="btn btn-primary" style={estiloBotonChico} onClick={guardarEsquema}>💾 Guardar el esquema actual</button>
          <button type="button" className="btn btn-secondary" style={estiloBotonChico} onClick={() => exportar("reglas", reglas)} title="Descarga las reglas actuales en un archivo">⬇️ Exportar las reglas</button>
          <button type="button" className="btn btn-secondary" style={estiloBotonChico} onClick={() => entrada.current?.click()} title="Carga reglas desde un archivo exportado">⬆️ Importar</button>
          <input ref={entrada} type="file" accept=".json,application/json" style={{ display: "none" }} onChange={(e) => { void importar(e.target.files?.[0]); e.target.value = ""; }} />
        </div>
        {esquemas.length === 0 ? (
          <p style={{ margin: 0, color: "var(--text-muted)", fontSize: "0.85rem" }}>Todavía no has guardado ningún esquema.</p>
        ) : (
          esquemas.map((e) => (
            <div key={e.nombre} style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap", padding: "6px 12px", border: "1px solid var(--border-light)", borderRadius: "var(--radius-sm)" }}>
              <strong style={{ flex: "1 1 200px" }}>{e.nombre}</strong>
              <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>{e.reglas.length} regla{e.reglas.length === 1 ? "" : "s"}</span>
              <button type="button" className="btn btn-primary" style={estiloBotonChico} onClick={() => void aplicarEsquema(e.nombre)}>Aplicar</button>
              <button type="button" className="btn btn-secondary" style={estiloBotonChico} onClick={() => exportar(e.nombre, e.reglas)} title="Descargar este esquema">⬇️</button>
              <button type="button" className="btn btn-secondary" style={estiloBotonChico} onClick={() => void borrarEsquema(e.nombre)} title="Borrar este esquema">🗑️</button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
