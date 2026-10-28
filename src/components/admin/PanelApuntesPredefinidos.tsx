"use client";

import { useCallback, useEffect, useState } from "react";
import { llamar, textoError } from "@/components/comisiones/api";
import { useToast } from "@/components/Toast";
import type { EstadoSemaforo, PredefinidoDto } from "@/lib/servicios/apuntes";

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
  estado_inicial: number;
}

const vacio = (): Borrador => ({ titulo: "", descripcion: "", etiqueta: "", color: "#3b82f6", mostrar_etiqueta: false, rapido: true, por_defecto: false, semaforo: false, semaforo_estados: ESTADOS_INICIALES, lado: "derecha", estilo_etiqueta: "relleno", estado_inicial: 0 });
const deP = (p: PredefinidoDto): Borrador => ({ titulo: p.titulo, descripcion: p.descripcion, etiqueta: p.etiqueta, color: p.color, mostrar_etiqueta: p.mostrar_etiqueta, rapido: p.rapido, por_defecto: p.por_defecto, semaforo: p.semaforo, semaforo_estados: p.semaforo_estados.length > 0 ? p.semaforo_estados : ESTADOS_INICIALES, lado: p.lado, estilo_etiqueta: p.estilo_etiqueta, estado_inicial: p.estado_inicial });

function Editor({ b, alCambiar }: { b: Borrador; alCambiar: (c: Partial<Borrador>) => void }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 210px), 1fr))", gap: "10px", alignItems: "end" }}>
      <label style={{ display: "flex", flexDirection: "column", gap: "3px", fontSize: "0.78rem", color: "var(--text-secondary)" }}>
        Título
        <input className="form-input" maxLength={80} value={b.titulo} onChange={(e) => alCambiar({ titulo: e.target.value })} placeholder="Ej. Seguro" />
      </label>
      <label style={{ display: "flex", flexDirection: "column", gap: "3px", fontSize: "0.78rem", color: "var(--text-secondary)" }}>
        Texto de la etiqueta
        <input className="form-input" maxLength={24} value={b.etiqueta} onChange={(e) => alCambiar({ etiqueta: e.target.value })} placeholder="Ej. 🚗 SEGURO (admite emoticonos)" />
      </label>
      <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.82rem" }} title="Color de la etiqueta en la lista de Expedientes">
        Color
        <input type="color" value={b.color} onChange={(e) => alCambiar({ color: e.target.value })} style={{ width: "34px", height: "26px", padding: 0, border: "none", background: "none" }} />
        {b.etiqueta.trim() !== "" && <span style={{ background: b.color, color: "#fff", fontSize: "0.62rem", fontWeight: 800, padding: "1px 7px", borderRadius: "999px", textShadow: "0 0 2px rgba(0,0,0,0.35)" }}>{b.etiqueta}</span>}
      </label>
      <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.82rem" }} title="Si está marcado, al añadir este apunte a un expediente su etiqueta sale junto al icono del cliente en la lista (se puede cambiar en cada expediente). Al guardar, el título, la etiqueta, el color y esto mismo se aplican también a los apuntes que ya se crearon con este predefinido">
        <input type="checkbox" checked={b.mostrar_etiqueta} onChange={(e) => alCambiar({ mostrar_etiqueta: e.target.checked })} />
        Mostrar la etiqueta en la lista
      </label>
      <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.82rem" }} title="Si está marcado, en cada expediente hay un botón «＋ título» que lo añade con un clic (solo uno por expediente)">
        <input type="checkbox" checked={b.rapido} onChange={(e) => alCambiar({ rapido: e.target.checked })} />
        Botón rápido en el expediente
      </label>
      <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.82rem" }} title="Si está marcado, todos los expedientes llevan este apunte: los que ya hay y los que se creen a partir de ahora">
        <input type="checkbox" checked={b.por_defecto} onChange={(e) => alCambiar({ por_defecto: e.target.checked })} />
        Lo llevan todos los expedientes
      </label>
      <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.82rem" }} title="De qué lado del icono del cliente sale la etiqueta en la lista de Expedientes">
        Lado del icono del cliente
        <select className="form-input" value={b.lado} onChange={(e) => alCambiar({ lado: e.target.value === "izquierda" ? "izquierda" : "derecha" })} style={{ width: "auto" }}>
          <option value="izquierda">Izquierda</option>
          <option value="derecha">Derecha</option>
        </select>
      </label>
      <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.82rem" }} title="Con relleno: la etiqueta es una cápsula del color del estado. Con texto en color: el texto y el borde llevan el color y el fondo es casi transparente">
        Estilo de la etiqueta
        <select className="form-input" value={b.estilo_etiqueta} onChange={(e) => alCambiar({ estilo_etiqueta: e.target.value === "texto" ? "texto" : "relleno" })} style={{ width: "auto" }}>
          <option value="relleno">Con relleno de color</option>
          <option value="texto">Texto en color</option>
        </select>
      </label>
      <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.82rem" }} title="Un semáforo tiene varios estados, cada uno con su color y su significado (por ejemplo rojo: aún no solicitado). Al pulsar la etiqueta en la lista se cambia el estado de ese expediente">
        <input type="checkbox" checked={b.semaforo} onChange={(e) => alCambiar({ semaforo: e.target.checked })} />
        Funciona como un semáforo
      </label>
      {b.semaforo && (
        <div style={{ gridColumn: "1 / -1", display: "flex", flexDirection: "column", gap: "6px", border: "1px dashed var(--border-light)", borderRadius: "var(--radius-sm)", padding: "10px" }}>
          <span style={{ fontSize: "0.78rem", color: "var(--text-secondary)" }}>Estados del semáforo (el primero es el que reciben los expedientes al principio)</span>
          {b.semaforo_estados.map((e, i) => (
            <div key={i} style={{ display: "flex", gap: "8px", alignItems: "center" }}>
              <input type="color" value={e.color} onChange={(ev) => alCambiar({ semaforo_estados: b.semaforo_estados.map((x, j) => (j === i ? { ...x, color: ev.target.value } : x)) })} aria-label={`Color del estado ${i + 1}`} style={{ width: "34px", height: "28px", padding: 0, border: "none", background: "none" }} />
              <input className="form-input" maxLength={80} value={e.texto} onChange={(ev) => alCambiar({ semaforo_estados: b.semaforo_estados.map((x, j) => (j === i ? { ...x, texto: ev.target.value } : x)) })} placeholder="Qué significa este color" style={{ flex: 1 }} />
              <input className="form-input" maxLength={8} value={e.icono ?? ""} onChange={(ev) => alCambiar({ semaforo_estados: b.semaforo_estados.map((x, j) => (j === i ? { ...x, icono: ev.target.value } : x)) })} placeholder="🙂" aria-label={`Emoticono del estado ${i + 1}`} title="Emoticono que sale delante de la etiqueta cuando el apunte está en este estado (por ejemplo 🔴 🟡 🟢)" style={{ width: "58px", textAlign: "center" }} />
              <label title="Si está marcado, la etiqueta de este estado se ve tenue, como apagada (por ejemplo, un gris para «no lleva seguro»)" style={{ display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "0.75rem", whiteSpace: "nowrap" }}>
                <input type="checkbox" checked={e.apagado === true} onChange={(ev) => alCambiar({ semaforo_estados: b.semaforo_estados.map((x, j) => (j === i ? { ...x, apagado: ev.target.checked } : x)) })} />
                Tenue
              </label>
              {b.semaforo_estados.length > 2 && (
                <button type="button" className="btn btn-secondary" onClick={() => alCambiar({ semaforo_estados: b.semaforo_estados.filter((_, j) => j !== i) })} style={{ padding: "2px 8px" }} title="Quitar este estado (los expedientes que lo tenían pasan al primero)">
                  ✕
                </button>
              )}
            </div>
          ))}
          <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.82rem" }} title="El estado con el que empieza cada expediente (los nuevos, y los que ya hay si marcas «Lo llevan todos los expedientes» y aún no lo tenían)">
            Estado en el que empiezan los expedientes
            <select className="form-input" value={Math.min(b.estado_inicial, b.semaforo_estados.length - 1)} onChange={(e) => alCambiar({ estado_inicial: Number(e.target.value) })} style={{ width: "auto", maxWidth: "100%" }}>
              {b.semaforo_estados.map((e, i) => (
                <option key={i} value={i}>
                  {i + 1}. {e.texto || "(sin texto)"}
                </option>
              ))}
            </select>
          </label>
          {b.semaforo_estados.length < 5 && (
            <button type="button" className="btn btn-secondary" onClick={() => alCambiar({ semaforo_estados: [...b.semaforo_estados, { color: "#3b82f6", texto: "" }] })} style={{ alignSelf: "flex-start", padding: "3px 10px", fontSize: "0.78rem" }}>
              + Añadir estado
            </button>
          )}
        </div>
      )}
      <label style={{ display: "flex", flexDirection: "column", gap: "3px", fontSize: "0.78rem", color: "var(--text-secondary)", gridColumn: "1 / -1" }}>
        Descripción
        <textarea className="form-input" rows={2} maxLength={2000} value={b.descripcion} onChange={(e) => alCambiar({ descripcion: e.target.value })} placeholder="Texto que llevará el apunte al añadirlo…" style={{ resize: "vertical" }} />
      </label>
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

      {lista === null && <span style={{ color: "var(--text-muted)" }}>Cargando…</span>}
      {(lista ?? []).map((p) => {
        const b = editados[p.id] ?? deP(p);
        const sucio = editados[p.id] !== undefined && JSON.stringify(editados[p.id]) !== JSON.stringify(deP(p));
        return (
          <div key={p.id} style={{ border: "1px solid var(--border-light)", borderRadius: "var(--radius-sm)", padding: "12px", display: "flex", flexDirection: "column", gap: "10px" }}>
            <Editor b={b} alCambiar={(c) => setEditados((x) => ({ ...x, [p.id]: { ...b, ...c } }))} />
            <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end", alignItems: "center", flexWrap: "wrap" }}>
              {p.clave && <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginRight: "auto" }} title="Lo usa la propia aplicación: se puede editar pero no borrar">🔒 De la aplicación</span>}
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
