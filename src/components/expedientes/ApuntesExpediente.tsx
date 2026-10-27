"use client";

import { useCallback, useEffect, useState } from "react";
import { llamar, textoError } from "@/components/comisiones/api";
import { useToast } from "@/components/Toast";
import type { ApunteDto, PredefinidoDto } from "@/lib/servicios/apuntes";

interface Borrador {
  titulo: string;
  descripcion: string;
  etiqueta: string;
  color: string;
  mostrar_etiqueta: boolean;
}

const vacio = (): Borrador => ({ titulo: "", descripcion: "", etiqueta: "", color: "#3b82f6", mostrar_etiqueta: false });
const deApunte = (a: ApunteDto): Borrador => ({ titulo: a.titulo, descripcion: a.descripcion, etiqueta: a.etiqueta, color: a.color, mostrar_etiqueta: a.mostrar_etiqueta });

/** Chip de muestra de cómo saldrá la etiqueta en la lista. */
function Muestra({ b }: { b: Borrador }) {
  if (!b.mostrar_etiqueta || b.etiqueta.trim() === "") return <span style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>No sale en la lista</span>;
  return <span style={{ background: b.color, color: "#fff", fontSize: "0.62rem", fontWeight: 800, padding: "1px 7px", borderRadius: "999px", textShadow: "0 0 2px rgba(0,0,0,0.35)" }}>{b.etiqueta}</span>;
}

function Campos({ b, alCambiar }: { b: Borrador; alCambiar: (c: Partial<Borrador>) => void }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 200px), 1fr))", gap: "8px", alignItems: "end" }}>
      <label style={{ display: "flex", flexDirection: "column", gap: "3px", fontSize: "0.75rem", color: "var(--text-secondary)" }}>
        Título
        <input className="form-input" maxLength={80} value={b.titulo} onChange={(e) => alCambiar({ titulo: e.target.value })} placeholder="Ej. Seguro" />
      </label>
      <label style={{ display: "flex", flexDirection: "column", gap: "3px", fontSize: "0.75rem", color: "var(--text-secondary)" }}>
        Texto de la etiqueta
        <input className="form-input" maxLength={24} value={b.etiqueta} onChange={(e) => alCambiar({ etiqueta: e.target.value })} placeholder="Ej. SEGURO" />
      </label>
      <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.8rem" }} title="Si está marcado, el texto de la etiqueta sale junto al icono del cliente en la lista de Expedientes">
        <input type="checkbox" checked={b.mostrar_etiqueta} onChange={(e) => alCambiar({ mostrar_etiqueta: e.target.checked })} />
        Mostrar en la lista
        <input type="color" value={b.color} onChange={(e) => alCambiar({ color: e.target.value })} aria-label="Color de la etiqueta" style={{ width: "30px", height: "24px", padding: 0, border: "none", background: "none" }} />
        <Muestra b={b} />
      </label>
      <label style={{ display: "flex", flexDirection: "column", gap: "3px", fontSize: "0.75rem", color: "var(--text-secondary)", gridColumn: "1 / -1" }}>
        Descripción
        <textarea className="form-input" rows={2} maxLength={2000} value={b.descripcion} onChange={(e) => alCambiar({ descripcion: e.target.value })} placeholder="Detalles del apunte…" style={{ resize: "vertical" }} />
      </label>
    </div>
  );
}

/**
 * Apuntes del expediente (SEGURO, VO de retoma…): líneas con título, descripción y, si se marca, una etiqueta junto al icono del cliente en la lista.
 * Los botones rápidos añaden un predefinido con un clic (solo uno por expediente). Todo se guarda al momento en la base de datos.
 */
export default function ApuntesExpediente({ idExpediente }: { idExpediente: number }) {
  const { mostrar } = useToast();
  const [apuntes, setApuntes] = useState<ApunteDto[] | null>(null);
  const [predefinidos, setPredefinidos] = useState<PredefinidoDto[]>([]);
  const [editados, setEditados] = useState<Record<number, Borrador>>({});
  const [nuevo, setNuevo] = useState<Borrador | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const cargar = useCallback(async () => {
    try {
      const [a, p] = await Promise.all([llamar<ApunteDto[]>(`/api/expedientes/apuntes?id=${idExpediente}`), llamar<PredefinidoDto[]>("/api/admin/apuntes-predefinidos")]);
      setApuntes(a.data);
      setPredefinidos(p.data);
      setEditados({});
    } catch (e) {
      mostrar(textoError(e), "error");
    }
  }, [idExpediente, mostrar]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void cargar();
  }, [cargar]);

  const ejecutar = async (f: () => Promise<void>) => {
    setOcupado(true);
    try {
      await f();
      await cargar();
    } catch (e) {
      mostrar(textoError(e), "error");
    } finally {
      setOcupado(false);
    }
  };

  const rapido = (p: PredefinidoDto) =>
    ejecutar(async () => {
      const { data } = await llamar<{ creado: boolean }>("/api/expedientes/apuntes", { method: "POST", cuerpo: { accion: "rapido", id_expediente: idExpediente, id_predefinido: p.id } });
      mostrar(data.creado ? `Apunte «${p.titulo}» añadido.` : `Este expediente ya tiene el apunte «${p.titulo}».`);
    });
  const guardarNuevo = () =>
    nuevo &&
    ejecutar(async () => {
      await llamar("/api/expedientes/apuntes", { method: "POST", cuerpo: { accion: "nuevo", id_expediente: idExpediente, apunte: nuevo } });
      setNuevo(null);
    });
  const guardar = (a: ApunteDto, b: Borrador) =>
    ejecutar(async () => {
      await llamar(`/api/expedientes/apuntes?id=${a.id}`, { method: "PUT", cuerpo: b });
      mostrar("Apunte guardado.");
    });
  const eliminar = (a: ApunteDto) =>
    ejecutar(async () => {
      await llamar(`/api/expedientes/apuntes?id=${a.id}`, { method: "DELETE" });
      mostrar(`Apunte «${a.titulo}» eliminado (está en la Papelera).`);
    });

  const yaTiene = (p: PredefinidoDto) => (apuntes ?? []).some((a) => a.id_predefinido === p.id);

  return (
    <div className="form-group" style={{ marginTop: "16px", marginBottom: 0 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px", flexWrap: "wrap", marginBottom: "8px" }}>
        <label className="form-label" style={{ marginBottom: 0 }}>📝 Apuntes del expediente</label>
        <span style={{ display: "inline-flex", gap: "6px", flexWrap: "wrap" }}>
          {predefinidos
            .filter((p) => p.rapido)
            .map((p) => (
              <button key={p.id} type="button" className="btn btn-secondary" disabled={ocupado || yaTiene(p)} onClick={() => void rapido(p)} title={yaTiene(p) ? `Ya tiene el apunte «${p.titulo}»` : `Añade el apunte «${p.titulo}» con un clic`} style={{ padding: "4px 10px", fontSize: "0.78rem" }}>
                {yaTiene(p) ? `✓ ${p.titulo}` : `＋ ${p.titulo}`}
              </button>
            ))}
          <button type="button" className="btn btn-secondary" disabled={ocupado || nuevo !== null} onClick={() => setNuevo(vacio())} style={{ padding: "4px 10px", fontSize: "0.78rem" }} title="Añade un apunte en blanco">
            + Añadir apunte
          </button>
        </span>
      </div>

      {apuntes === null && <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>Cargando…</span>}
      {apuntes !== null && apuntes.length === 0 && nuevo === null && <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>Sin apuntes. Usa los botones de arriba para añadir uno.</span>}

      <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
        {(apuntes ?? []).map((a) => {
          const b = editados[a.id] ?? deApunte(a);
          const sucio = editados[a.id] !== undefined && JSON.stringify(editados[a.id]) !== JSON.stringify(deApunte(a));
          return (
            <div key={a.id} style={{ border: "1px solid var(--border-light)", borderRadius: "var(--radius-sm)", padding: "10px", display: "flex", flexDirection: "column", gap: "8px" }}>
              <Campos b={b} alCambiar={(c) => setEditados((x) => ({ ...x, [a.id]: { ...b, ...c } }))} />
              <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
                {sucio && (
                  <button type="button" className="btn btn-primary" disabled={ocupado || b.titulo.trim() === ""} onClick={() => void guardar(a, b)} style={{ padding: "4px 12px", fontSize: "0.78rem" }}>
                    Guardar cambios
                  </button>
                )}
                <button type="button" className="btn btn-secondary" disabled={ocupado} onClick={() => void eliminar(a)} style={{ padding: "4px 12px", fontSize: "0.78rem" }} title="Lo manda a la Papelera">
                  🗑 Eliminar
                </button>
              </div>
            </div>
          );
        })}
        {nuevo !== null && (
          <div style={{ border: "1px dashed var(--primary)", borderRadius: "var(--radius-sm)", padding: "10px", display: "flex", flexDirection: "column", gap: "8px" }}>
            <Campos b={nuevo} alCambiar={(c) => setNuevo({ ...nuevo, ...c })} />
            <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
              <button type="button" className="btn btn-primary" disabled={ocupado || nuevo.titulo.trim() === ""} onClick={() => void guardarNuevo()} style={{ padding: "4px 12px", fontSize: "0.78rem" }}>
                Añadir
              </button>
              <button type="button" className="btn btn-secondary" disabled={ocupado} onClick={() => setNuevo(null)} style={{ padding: "4px 12px", fontSize: "0.78rem" }}>
                Cancelar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
