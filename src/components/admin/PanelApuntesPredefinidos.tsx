"use client";

import { useCallback, useEffect, useState } from "react";
import { llamar, textoError } from "@/components/comisiones/api";
import { useToast } from "@/components/Toast";
import AyudaSemaforo from "@/components/expedientes/AyudaSemaforo";
import AyudaEmoticonos from "@/components/expedientes/AyudaEmoticonos";
import { EtiquetaApunte } from "@/components/expedientes/etiqueta-apunte";
import type { EstadoSemaforo, PredefinidoDto } from "@/lib/servicios/apuntes";

/** Rojo, amarillo, verde y gris: los colores de un semáforo (copia de `COLORES_SEMAFORO`, que vive en el servidor). */
const COLORES_SEMAFORO = ["#ef4444", "#eab308", "#22c55e", "#9ca3af"];

const ESTADOS_INICIALES: EstadoSemaforo[] = [
  { color: "#ef4444", texto: "Aún no solicitado" },
  { color: "#eab308", texto: "Solicitado, sin terminar" },
  { color: "#22c55e", texto: "Terminado" },
];

interface Borrador {
  titulo: string;
  descripcion: string;
  etiqueta: string;
  color: string;
  mostrar_etiqueta: boolean;
  rapido: boolean;
  por_defecto: boolean;
  semaforo: boolean;
  semaforo_estados: EstadoSemaforo[];
  lado: "izquierda" | "derecha";
  estilo_etiqueta: "relleno" | "texto";
  colorear_emoticonos: boolean;
  estado_inicial: number;
}

const vacio = (): Borrador => ({ titulo: "", descripcion: "", etiqueta: "", color: "#3b82f6", mostrar_etiqueta: false, rapido: true, por_defecto: false, semaforo: false, semaforo_estados: ESTADOS_INICIALES, lado: "derecha", estilo_etiqueta: "relleno", colorear_emoticonos: true, estado_inicial: 0 });
const deP = (p: PredefinidoDto): Borrador => ({ titulo: p.titulo, descripcion: p.descripcion, etiqueta: p.etiqueta, color: p.color, mostrar_etiqueta: p.mostrar_etiqueta, rapido: p.rapido, por_defecto: p.por_defecto, semaforo: p.semaforo, semaforo_estados: p.semaforo_estados.length > 0 ? p.semaforo_estados : ESTADOS_INICIALES, lado: p.lado, estilo_etiqueta: p.estilo_etiqueta, colorear_emoticonos: p.colorear_emoticonos, estado_inicial: p.estado_inicial });

const estiloSeccion = { margin: 0, padding: "18px 20px 20px", border: "1px solid var(--border-light)", borderRadius: "var(--radius-sm)", display: "flex", flexDirection: "column", gap: "18px", minWidth: 0 } as const;
const estiloLegend = { padding: "0 8px", fontSize: "0.82rem", fontWeight: 700, color: "var(--text-primary)" } as const;
const estiloCampo = { display: "flex", flexDirection: "column", gap: "4px", fontSize: "0.78rem", color: "var(--text-secondary)", minWidth: 0 } as const;
/** Casillas de marcar más grandes y con el color de la aplicación, para que se vean y se pulsen bien. */
const tick = { width: "20px", height: "20px", flex: "0 0 auto", accentColor: "var(--primary)", cursor: "pointer" } as const;
const estiloCasilla = { display: "flex", alignItems: "flex-start", gap: "8px", fontSize: "0.85rem", lineHeight: 1.35 } as const;
const rejilla = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 240px), 1fr))", gap: "18px 28px", alignItems: "start" } as const;
const pista = { fontSize: "0.74rem", color: "var(--text-muted)", fontWeight: 400 } as const;

function Casilla({ marcada, alCambiar, titulo, ayuda, desactivada }: { marcada: boolean; alCambiar: (v: boolean) => void; titulo: string; ayuda: string; desactivada?: boolean }) {
  return (
    <label style={{ ...estiloCasilla, opacity: desactivada ? 0.5 : 1 }}>
      <input type="checkbox" checked={marcada} disabled={desactivada} onChange={(e) => alCambiar(e.target.checked)} style={{ ...tick, marginTop: "1px" }} />
      <span>
        <strong style={{ fontWeight: 600 }}>{titulo}</strong>
        <br />
        <span style={pista}>{ayuda}</span>
      </span>
    </label>
  );
}

function Editor({ b, alCambiar }: { b: Borrador; alCambiar: (c: Partial<Borrador>) => void }) {
  const estados = b.semaforo_estados;
  const colorear = b.estilo_etiqueta === "texto" && b.colorear_emoticonos;
  const vista = (color: string, estado?: EstadoSemaforo) => <EtiquetaApunte etiqueta={b.etiqueta} color={color} estilo={b.estilo_etiqueta} colorearEmoticonos={colorear} estado={estado} />;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      <fieldset style={estiloSeccion}>
        <legend style={estiloLegend}>1 · Qué es</legend>
        <div style={rejilla}>
          <label style={estiloCampo}>
            Título
            <input className="form-input" maxLength={80} value={b.titulo} onChange={(e) => alCambiar({ titulo: e.target.value })} placeholder="Ej. Seguro" />
          </label>
          <label style={estiloCampo}>
            Descripción <span style={pista}>(el texto con el que se crea el apunte)</span>
            <textarea className="form-input" rows={2} maxLength={2000} value={b.descripcion} onChange={(e) => alCambiar({ descripcion: e.target.value })} placeholder="Texto que llevará el apunte al añadirlo…" style={{ resize: "vertical" }} />
          </label>
        </div>
      </fieldset>

      <fieldset style={estiloSeccion}>
        <legend style={estiloLegend}>2 · Cómo se ve la etiqueta en la lista de Expedientes</legend>
        <div style={rejilla}>
          <label style={estiloCampo}>
            Texto de la etiqueta <span style={pista}>(admite emoticonos, son opcionales)</span>
            <input className="form-input" maxLength={24} value={b.etiqueta} onChange={(e) => alCambiar({ etiqueta: e.target.value })} placeholder="Ej. 🚗 SEGURO" />
            <AyudaEmoticonos alInsertar={(emo) => alCambiar({ etiqueta: `${b.etiqueta}${b.etiqueta && !b.etiqueta.endsWith(" ") ? " " : ""}${emo}`.slice(0, 24) })} />
          </label>
          <label style={estiloCampo}>
            Estilo
            <select className="form-input" value={b.estilo_etiqueta} onChange={(e) => alCambiar({ estilo_etiqueta: e.target.value === "texto" ? "texto" : "relleno" })} title="Con relleno: cápsula del color del estado. Texto en color: el texto y el borde llevan el color y el fondo casi no se nota">
              <option value="relleno">Con relleno de color</option>
              <option value="texto">Texto en color</option>
            </select>
          </label>
          <label style={estiloCampo}>
            Lado del icono del cliente
            <select className="form-input" value={b.lado} onChange={(e) => alCambiar({ lado: e.target.value === "izquierda" ? "izquierda" : "derecha" })}>
              <option value="izquierda">Izquierda</option>
              <option value="derecha">Derecha</option>
            </select>
          </label>
          {!b.semaforo && (
            <label style={estiloCampo}>
              Color
              <input type="color" value={b.color} onChange={(e) => alCambiar({ color: e.target.value })} style={{ width: "56px", height: "34px", padding: 0, border: "none", background: "none" }} />
            </label>
          )}
        </div>
        <div style={rejilla}>
          <Casilla marcada={b.mostrar_etiqueta} alCambiar={(v) => alCambiar({ mostrar_etiqueta: v })} titulo="Mostrar la etiqueta en la lista" ayuda="Sale junto al icono del cliente. Al guardar, se aplica también a los apuntes ya creados con este predefinido." />
          <Casilla marcada={b.colorear_emoticonos} desactivada={b.estilo_etiqueta !== "texto"} alCambiar={(v) => alCambiar({ colorear_emoticonos: v })} titulo="Pintar los emoticonos del color del estado" ayuda="Solo con «Texto en color». Si no, conservan sus colores y solo las letras llevan el color." />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap", background: "var(--bg-surface-tint)", borderRadius: "var(--radius-sm)", padding: "10px 12px" }}>
          <span style={{ fontSize: "0.78rem", fontWeight: 700 }}>👁 Vista previa</span>
          {b.semaforo
            ? estados.map((e, i) => (
                <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "0.72rem", color: "var(--text-secondary)" }} title={e.texto}>
                  {vista(e.color, e)}
                  <span>{e.texto || "(sin texto)"}</span>
                </span>
              ))
            : vista(b.color)}
          {!b.mostrar_etiqueta && <span style={pista}>(con «Mostrar la etiqueta en la lista» desmarcada no sale en la lista)</span>}
        </div>
      </fieldset>

      <fieldset style={estiloSeccion}>
        <legend style={estiloLegend}>3 · Cuándo se añade</legend>
        <div style={rejilla}>
          <Casilla marcada={b.por_defecto} alCambiar={(v) => alCambiar({ por_defecto: v })} titulo="Lo llevan todos los expedientes" ayuda="Se añade solo a los nuevos y también a los que ya existen." />
          <Casilla marcada={b.rapido} alCambiar={(v) => alCambiar({ rapido: v })} titulo="Botón rápido en el expediente" ayuda="Un botón «＋ título» que lo añade con un clic (solo uno por expediente)." />
          <Casilla marcada={b.semaforo} alCambiar={(v) => alCambiar({ semaforo: v })} titulo="Funciona como un semáforo" ayuda="Tiene varios estados, cada uno con su color y su significado; se cambia pulsando la etiqueta." />
        </div>
      </fieldset>

      {b.semaforo && (
        <fieldset style={estiloSeccion}>
          <legend style={estiloLegend}>4 · Estados del semáforo</legend>
          <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            {estados.map((e, i) => {
              const cambiar = (c: Partial<EstadoSemaforo>) => alCambiar({ semaforo_estados: estados.map((x, j) => (j === i ? { ...x, ...c } : x)) });
              const modo = e.modo ?? "color";
              const quiereIcono = modo === "icono" || modo === "icono_fondo";
              const quiereColor = modo !== "icono";
              return (
                <div key={i} style={{ display: "flex", flexDirection: "column", gap: "16px", border: "1px solid var(--border-light)", borderRadius: "var(--radius-sm)", padding: "16px 18px", background: "rgba(255, 255, 255, 0.015)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px" }}>
                    <strong style={{ fontSize: "0.9rem" }}>Estado {i + 1}{i === Math.min(b.estado_inicial, estados.length - 1) ? " · el de inicio" : ""}</strong>
                    {estados.length > 2 && (
                      <button type="button" className="btn btn-secondary" onClick={() => alCambiar({ semaforo_estados: estados.filter((_, j) => j !== i), estado_inicial: Math.max(0, Math.min(b.estado_inicial, estados.length - 2)) })} style={{ padding: "3px 12px", fontSize: "0.8rem" }} title="Quitar este estado (los expedientes que lo tenían pasan al primero)">
                        ✕ Quitar
                      </button>
                    )}
                  </div>
                  <label style={estiloCampo}>
                    Qué significa
                    <input className="form-input" maxLength={80} value={e.texto} onChange={(ev) => cambiar({ texto: ev.target.value })} placeholder="Ej. Seguro aún no solicitado" />
                  </label>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: "16px 20px", alignItems: "end" }}>
                    <label style={estiloCampo} title="Solo el fondo de su color, solo un icono (un emoticono, sin fondo) o el icono sobre el fondo de color">
                      Se muestra con
                      <select className="form-input" value={modo} onChange={(ev) => cambiar({ modo: ev.target.value === "icono" ? "icono" : ev.target.value === "icono_fondo" ? "icono_fondo" : "color" })}>
                        <option value="color">Solo el fondo de color</option>
                        <option value="icono">Solo el icono</option>
                        <option value="icono_fondo">Icono con fondo de color</option>
                      </select>
                    </label>
                    {quiereColor && (
                      <label style={estiloCampo}>
                        Color
                        <input type="color" value={e.color} onChange={(ev) => cambiar({ color: ev.target.value })} aria-label={`Color del estado ${i + 1}`} style={{ width: "100%", height: "38px", padding: 0, border: "1px solid var(--border-light)", borderRadius: "var(--radius-sm)", background: "none", cursor: "pointer" }} />
                      </label>
                    )}
                    {quiereIcono && (
                      <label style={estiloCampo}>
                        Icono <span style={pista}>(un emoticono)</span>
                        <input className="form-input" maxLength={8} value={e.icono ?? ""} onChange={(ev) => cambiar({ icono: ev.target.value })} placeholder="✅" aria-label={`Icono del estado ${i + 1}`} style={{ textAlign: "center", fontSize: "1.15rem" }} />
                      </label>
                    )}
                    <label style={estiloCampo} title="Efecto animado de la etiqueta en este estado: llama la atención (por ejemplo un parpadeo rojo para «sin seguro»)">
                      Efecto
                      <select className="form-input" value={e.efecto ?? "ninguno"} onChange={(ev) => cambiar({ efecto: ev.target.value as EstadoSemaforo["efecto"] })}>
                        <option value="ninguno">Sin efecto</option>
                        <option value="parpadeo">Parpadeo</option>
                        <option value="pulso">Pulso</option>
                        <option value="destello">Destello</option>
                        <option value="latido">Latido</option>
                        <option value="brillo">Brillo</option>
                      </select>
                    </label>
                  </div>
                  <div style={{ display: "flex", gap: "24px", alignItems: "center", flexWrap: "wrap", paddingTop: "4px", borderTop: "1px dashed var(--border-light)" }}>
                    <label title="La etiqueta de este estado se ve tenue, como apagada (por ejemplo, un gris para «no lleva seguro»)" style={{ display: "inline-flex", alignItems: "center", gap: "8px", fontSize: "0.88rem", whiteSpace: "nowrap", cursor: "pointer", paddingTop: "10px" }}>
                      <input type="checkbox" checked={e.apagado === true} onChange={(ev) => cambiar({ apagado: ev.target.checked })} style={tick} />
                      Tenue
                    </label>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: "10px", fontSize: "0.8rem", color: "var(--text-secondary)", paddingTop: "10px" }}>
                      👁 Vista previa {vista(e.color, e)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
            {estados.length < 8 && (
              <button type="button" className="btn btn-secondary" onClick={() => alCambiar({ semaforo_estados: [...estados, { color: "#3b82f6", texto: "" }] })} style={{ padding: "4px 12px", fontSize: "0.8rem" }}>
                + Añadir estado
              </button>
            )}
            <button type="button" className="btn btn-secondary" onClick={() => alCambiar({ semaforo_estados: estados.map((x, i) => ({ ...x, color: COLORES_SEMAFORO[i] ?? "#3b82f6" })) })} style={{ padding: "4px 12px", fontSize: "0.8rem" }} title="Vuelve a poner los colores en rojo, amarillo, verde y gris (los significados no cambian). Después hay que pulsar «Guardar cambios»">
              ↺ Restablecer los colores del semáforo
            </button>
          </div>
          <label style={{ ...estiloCampo, maxWidth: "420px" }}>
            Estado en el que empiezan los expedientes
            <select className="form-input" value={Math.min(b.estado_inicial, estados.length - 1)} onChange={(e) => alCambiar({ estado_inicial: Number(e.target.value) })} title="Los expedientes nuevos (y los que ya hay, si marcas «Lo llevan todos los expedientes» y aún no lo tenían) empiezan así">
              {estados.map((e, i) => (
                <option key={i} value={i}>
                  {i + 1}. {e.texto || "(sin texto)"}
                </option>
              ))}
            </select>
          </label>
        </fieldset>
      )}
    </div>
  );
}

/** Configuración › Expedientes › Apuntes: los apuntes predefinidos (título, descripción, etiqueta, color y botón rápido). Se guardan en la base de datos. */
export default function PanelApuntesPredefinidos() {
  const { mostrar } = useToast();
  const [lista, setLista] = useState<PredefinidoDto[] | null>(null);
  const [editados, setEditados] = useState<Record<number, Borrador>>({});
  const [nuevo, setNuevo] = useState<Borrador | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const cargar = useCallback(async () => {
    try {
      setLista((await llamar<PredefinidoDto[]>("/api/admin/apuntes-predefinidos")).data);
      setEditados({});
    } catch (e) {
      mostrar(textoError(e), "error");
    }
  }, [mostrar]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void cargar();
  }, [cargar]);

  const ejecutar = async (f: () => Promise<void>, mensaje: string) => {
    setOcupado(true);
    try {
      await f();
      mostrar(mensaje);
      await cargar();
    } catch (e) {
      mostrar(textoError(e), "error");
    } finally {
      setOcupado(false);
    }
  };

  return (
    <div className="glass-panel" style={{ padding: "24px", display: "flex", flexDirection: "column", gap: "16px", borderLeft: "3px solid var(--primary)" }}>
      <div>
        <h4 style={{ fontSize: "1rem", fontWeight: 700, margin: "0 0 6px 0" }}>🚦 Semáforo y apuntes predefinidos de los expedientes</h4>
        <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem", margin: 0, lineHeight: 1.5 }}>
          Cada expediente puede llevar apuntes (por ejemplo «hay que contratar el seguro» o «deja un VO de retoma»). Aquí defines los que tienen botón rápido: el título, la descripción, el texto y el color de la etiqueta que sale junto al icono del cliente en la lista, y si sale por defecto. «VO de retoma» lo añade solo la lectura de un pedido con retoma.
        </p>
      </div>

      <AyudaSemaforo />

      {lista === null && <span style={{ color: "var(--text-muted)" }}>Cargando…</span>}
      {(lista ?? []).map((p) => {
        const b = editados[p.id] ?? deP(p);
        const sucio = editados[p.id] !== undefined && JSON.stringify(editados[p.id]) !== JSON.stringify(deP(p));
        return (
          <div key={p.id} style={{ border: "1px solid var(--border-light)", borderRadius: "var(--radius-md)", padding: "20px", display: "flex", flexDirection: "column", gap: "18px", background: "rgba(255, 255, 255, 0.02)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap", paddingBottom: "12px", borderBottom: "1px solid var(--border-light)" }}>
              <strong style={{ fontSize: "1.02rem" }}>{p.semaforo ? "🚦" : "📝"} {p.titulo}</strong>
              <span style={{ fontSize: "0.76rem", color: "var(--text-muted)" }}>{p.semaforo ? `Semáforo de ${p.semaforo_estados.length} estados` : "Apunte sencillo"}</span>
              {p.clave && <span style={{ fontSize: "0.74rem", color: "var(--text-muted)", marginLeft: "auto" }} title="Lo usa la propia aplicación: se puede editar pero no borrar">🔒 De la aplicación</span>}
            </div>
            <Editor b={b} alCambiar={(c) => setEditados((x) => ({ ...x, [p.id]: { ...b, ...c } }))} />
            <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end", alignItems: "center", flexWrap: "wrap" }}>
              {sucio && (
                <button type="button" className="btn btn-primary" disabled={ocupado || b.titulo.trim() === ""} onClick={() => void ejecutar(async () => void (await llamar(`/api/admin/apuntes-predefinidos?id=${p.id}`, { method: "PUT", cuerpo: b })), "Guardado.")} style={{ padding: "5px 14px", fontSize: "0.8rem" }}>
                  Guardar cambios
                </button>
              )}
              {!p.clave && (
                <button type="button" className="btn btn-secondary" disabled={ocupado} onClick={() => { if (window.confirm(`¿Quitar el predefinido «${p.titulo}»? Los apuntes ya creados en los expedientes se quedan.`)) void ejecutar(async () => void (await llamar(`/api/admin/apuntes-predefinidos?id=${p.id}`, { method: "DELETE" })), "Predefinido eliminado."); }} style={{ padding: "5px 14px", fontSize: "0.8rem" }}>
                  🗑 Eliminar
                </button>
              )}
            </div>
          </div>
        );
      })}

      {nuevo !== null ? (
        <div style={{ border: "1px dashed var(--primary)", borderRadius: "var(--radius-sm)", padding: "12px", display: "flex", flexDirection: "column", gap: "10px" }}>
          <Editor b={nuevo} alCambiar={(c) => setNuevo({ ...nuevo, ...c })} />
          <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
            <button type="button" className="btn btn-primary" disabled={ocupado || nuevo.titulo.trim() === ""} onClick={() => void ejecutar(async () => { await llamar("/api/admin/apuntes-predefinidos", { method: "POST", cuerpo: nuevo }); setNuevo(null); }, "Predefinido añadido.")} style={{ padding: "5px 14px", fontSize: "0.8rem" }}>
              Añadir predefinido
            </button>
            <button type="button" className="btn btn-secondary" disabled={ocupado} onClick={() => setNuevo(null)} style={{ padding: "5px 14px", fontSize: "0.8rem" }}>
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <button type="button" className="btn btn-secondary" onClick={() => setNuevo(vacio())} style={{ alignSelf: "flex-start", padding: "6px 14px", fontSize: "0.82rem" }}>
          + Nuevo predefinido
        </button>
      )}
    </div>
  );
}
