"use client";

import { useState, type FormEvent } from "react";
import type { TiendaDto } from "@/lib/dto";
import { Cabecera, comparar, estiloBotonPeligro, estiloPanel, useOrden, usePeticion } from "./utilidades";

interface Props {
  tiendas: TiendaDto[];
  setTiendas: (fn: (prev: TiendaDto[]) => TiendaDto[]) => void;
  predeterminadaId: number | null;
  setPredeterminadaId: (id: number | null) => void;
}

/** Pestaña «Tiendas». */
export default function PestanaTiendas({ tiendas, setTiendas, predeterminadaId, setPredeterminadaId }: Props) {
  const { cargando, llamar, ejecutar, confirmar } = usePeticion();
  const orden = useOrden("id");
  const [nombre, setNombre] = useState("");
  const [ciudad, setCiudad] = useState("");
  const [editando, setEditando] = useState<number | null>(null);
  const [nombreEdicion, setNombreEdicion] = useState("");
  const [ciudadEdicion, setCiudadEdicion] = useState("");

  const valor = (t: TiendaDto): string | number => (orden.campo === "nombre" ? t.nombre : orden.campo === "ciudad" ? (t.ciudad ?? "") : t.id_tienda);
  const ordenadas = [...tiendas].sort((a, b) => comparar(valor(a), valor(b), orden.asc));

  const crear = async (ev: FormEvent) => {
    ev.preventDefault();
    const ok = await ejecutar(async () => {
      const n = await llamar<TiendaDto>("/api/admin/tiendas", "POST", { nombre, ciudad }, "Error al crear la tienda");
      setTiendas((prev) => [...prev, n]);
    }, "Tienda creada con éxito");
    if (ok) {
      setNombre("");
      setCiudad("");
    }
  };

  const guardar = async () => {
    if (editando === null) return;
    const ok = await ejecutar(async () => {
      await llamar("/api/admin/tiendas", "PUT", { id_tienda: editando, nombre: nombreEdicion, ciudad: ciudadEdicion }, "Error al actualizar la tienda");
      setTiendas((prev) => prev.map((t) => (t.id_tienda === editando ? { ...t, nombre: nombreEdicion, ciudad: ciudadEdicion || null } : t)));
    }, "Tienda actualizada correctamente");
    if (ok) setEditando(null);
  };

  const eliminar = async (t: TiendaDto) => {
    if (!(await confirmar({ texto: `¿Eliminar la tienda «${t.nombre}»? Dejará de poder elegirse; lo que ya la tiene la conserva.`, peligro: true }))) return;
    void ejecutar(async () => {
      await llamar("/api/admin/tiendas", "DELETE", { id_tienda: t.id_tienda }, "Error al eliminar tienda");
      setTiendas((prev) => prev.filter((x) => x.id_tienda !== t.id_tienda));
      if (predeterminadaId === t.id_tienda) setPredeterminadaId(null);
    }, "Tienda eliminada con éxito");
  };

  const predeterminar = (id: number | null) =>
    ejecutar(async () => {
      await llamar("/api/usuario/tienda-predeterminada", "POST", { id_tienda: id }, "Error al establecer la tienda predeterminada.");
      setPredeterminadaId(id);
    }, id ? "Tienda predeterminada establecida correctamente" : "Tienda predeterminada quitada correctamente");

  return (
    <div className="glass-panel" style={estiloPanel}>
      <h3 style={{ fontSize: "1.15rem" }}>Gestión de Tiendas Físicas</h3>

      <form onSubmit={crear} style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
        <input type="text" className="form-input" placeholder="Nombre de la tienda... (Ej. Concesionario Central)" value={nombre} onChange={(e) => setNombre(e.target.value)} disabled={cargando} required style={{ flex: 2, minWidth: "200px" }} />
        <input type="text" className="form-input" placeholder="Ciudad... (Ej. Madrid)" value={ciudad} onChange={(e) => setCiudad(e.target.value)} disabled={cargando} style={{ flex: 1, minWidth: "150px" }} />
        <button type="submit" className="btn btn-primary" disabled={cargando}>
          + Crear Tienda
        </button>
      </form>

      <div className="table-container">
        <table className="table-premium">
          <thead>
            <tr>
              <Cabecera etiqueta="Nombre Tienda" campo="nombre" orden={orden} />
              <Cabecera etiqueta="Ciudad" campo="ciudad" orden={orden} />
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {ordenadas.map((t) => {
              const esPredeterminada = t.id_tienda === predeterminadaId;
              return (
                <tr key={t.id_tienda}>
                  <td>
                    {editando === t.id_tienda ? (
                      <input type="text" className="form-input" value={nombreEdicion} onChange={(e) => setNombreEdicion(e.target.value)} style={{ padding: "6px 10px", fontSize: "0.85rem", maxWidth: "200px" }} required />
                    ) : (
                      <span style={{ fontWeight: 600 }}>{t.nombre}</span>
                    )}
                  </td>
                  <td>
                    {editando === t.id_tienda ? (
                      <input type="text" className="form-input" value={ciudadEdicion} onChange={(e) => setCiudadEdicion(e.target.value)} style={{ padding: "6px 10px", fontSize: "0.85rem", maxWidth: "150px" }} />
                    ) : t.ciudad ? (
                      `📍 ${t.ciudad}`
                    ) : (
                      <span style={{ color: "var(--text-muted)", fontStyle: "italic" }}>Sin indicar</span>
                    )}
                  </td>
                  <td>
                    {editando === t.id_tienda ? (
                      <div style={{ display: "flex", gap: "6px" }}>
                        <button type="button" className="btn btn-primary" onClick={() => void guardar()} style={{ padding: "6px 12px", fontSize: "0.8rem" }} disabled={cargando}>✓</button>
                        <button type="button" className="btn btn-secondary" onClick={() => setEditando(null)} style={{ padding: "6px 12px", fontSize: "0.8rem" }}>✗</button>
                      </div>
                    ) : (
                      <div style={{ display: "flex", gap: "6px" }}>
                        <button
                          type="button"
                          className="btn btn-secondary"
                          onClick={() => void predeterminar(esPredeterminada ? null : t.id_tienda)}
                          style={{
                            padding: "6px 12px",
                            fontSize: "0.8rem",
                            color: esPredeterminada ? "var(--warning)" : "var(--text-secondary)",
                            borderColor: esPredeterminada ? "var(--warning)" : "var(--border-light)",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "4px",
                          }}
                          title={esPredeterminada ? "Quitar como tienda predeterminada" : "Establecer como tienda predeterminada para mi usuario"}
                        >
                          {esPredeterminada ? "⭐ Predeterminada" : "☆ Predeterminada"}
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary"
                          onClick={() => {
                            setEditando(t.id_tienda);
                            setNombreEdicion(t.nombre);
                            setCiudadEdicion(t.ciudad ?? "");
                          }}
                          style={{ padding: "6px 12px", fontSize: "0.8rem" }}
                        >
                          ✏️ Editar
                        </button>
                        <button type="button" className="btn btn-secondary" onClick={() => eliminar(t)} style={{ ...estiloBotonPeligro, padding: "6px 12px" }}>
                          🗑️
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
            {ordenadas.length === 0 && (
              <tr>
                <td colSpan={3} style={{ textAlign: "center", color: "var(--text-muted)", padding: "20px" }}>
                  No hay tiendas registradas.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
